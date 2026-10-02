import { processImageUpload, thumbPathFor, UnsupportedImageError } from '@/lib/image-thumb';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Grid thumbnails for the Files & Media library.
 *
 * The library grid rendered `file_url` — the full original — in every tile, so
 * a page of jobsite photos pulled 1600px+ images just to draw 168px squares.
 * Supabase image transforms are NOT enabled on this project (they return the
 * full bytes with HTTP 200 — see lib/image-thumb.ts), so the small variant has
 * to be real bytes we render and store ourselves.
 *
 * The thumb is a ~400px JPEG at `<dir>/thumbs/<stem>.jpg` (the same rule the
 * photos pipeline uses) and its URL goes in project_files.poster_url — the
 * column the grid already reads for video posters. The original is untouched
 * and stays what the viewer and Download use.
 */

const LAZY_PER_REQUEST = 6;
const RENDER_TIMEOUT_MS = 8000;

/**
 * Render + store a thumbnail for one image object. Returns the stored URL (in
 * the public-URL form every row stores; readers sign it), `''` when the object
 * is not something we can thumbnail (the caller may record that), or null on a
 * transient failure worth retrying later.
 */
export async function storeImageThumb(
  db: any,
  bucket: string,
  objectPath: string,
  bytes?: Buffer | null,
  fileName?: string | null,
): Promise<string | '' | null> {
  try {
    let input = bytes ?? null;
    if (!input) {
      const { data: blob, error } = await db.storage.from(bucket).download(objectPath);
      if (error || !blob) {
        console.error(`[file-thumbs] could not read ${bucket}/${objectPath}:`, error);
        return null;
      }
      input = Buffer.from(await blob.arrayBuffer());
    }
    const processed = await processImageUpload(input, { fileName: fileName ?? objectPath });
    if (processed.kind !== 'processed' || !processed.thumb) return '';
    const thumbPath = thumbPathFor(objectPath, processed.thumb.extension);
    const { error: upErr } = await db.storage
      .from(bucket)
      .upload(thumbPath, processed.thumb.buffer, { contentType: processed.thumb.contentType, upsert: true });
    if (upErr) {
      console.error(`[file-thumbs] could not store thumb for ${bucket}/${objectPath}:`, upErr);
      return null;
    }
    return (db.storage.from(bucket).getPublicUrl(thumbPath).data.publicUrl as string) || null;
  } catch (e: unknown) {
    if (e instanceof UnsupportedImageError) return '';
    console.error(`[file-thumbs] thumbnail render failed for ${bucket}/${objectPath}:`, e);
    return null;
  }
}

function within<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

/**
 * Backfill thumbnails for image rows that predate thumbnailing — a few per
 * request, in parallel, each bounded so a slow render degrades to "original
 * this time" and never to a hung library. Rows come back with poster_url set
 * where a thumb now exists. An image we cannot thumbnail gets its own URL as
 * the poster so it is not retried on every load.
 */
export async function ensureImageThumbs(db: any, tenantId: string, rows: any[]): Promise<any[]> {
  const todo = rows
    .filter((r) => (r.kind === 'image' || String(r.mime_type || '').startsWith('image/')) && !r.poster_url && r.storage_path)
    .slice(0, LAZY_PER_REQUEST);
  if (!todo.length) return rows;

  const results = await Promise.all(
    todo.map(async (r) => {
      const bucket = String(r.storage_bucket || 'project-files');
      const stored = await within(storeImageThumb(db, bucket, String(r.storage_path), null, r.file_name), RENDER_TIMEOUT_MS);
      if (stored === null) return null; // transient or slow — try again next load
      const poster = stored || r.file_url;
      const { error } = await db
        .from('project_files')
        .update({ poster_url: poster })
        .eq('id', r.id)
        .eq('tenant_id', tenantId);
      if (error) {
        console.error('[file-thumbs] could not record poster_url:', error);
        return null;
      }
      return { id: r.id as string, poster };
    }),
  );
  const byId = new Map<string, string>();
  for (const x of results) if (x) byId.set(x.id, x.poster);
  return byId.size ? rows.map((r) => (byId.has(r.id) ? { ...r, poster_url: byId.get(r.id) } : r)) : rows;
}
