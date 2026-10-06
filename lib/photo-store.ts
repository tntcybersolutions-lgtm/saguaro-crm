/**
 * Store ONE site photo: shrink it, write the display copy and the thumbnail,
 * and insert the `photos` row. Server only (sharp).
 *
 * Shared by the two ways a photo arrives:
 *   - /api/photos/upload   the bytes came through the function (small files)
 *   - /api/photos/ingest   the bytes went straight to storage first, so a
 *                          photo of any size never meets the ~4.5 MB
 *                          serverless request-body limit
 * Both produce the same objects and the same row, so a gallery can't tell
 * which way a photo came in.
 */
import { createServerClient } from '@/lib/supabase-server';
import { processImageUpload, thumbPathFor, withExtension, UnsupportedImageError } from '@/lib/image-thumb';

export const PHOTO_BUCKET = 'project-files';

type Db = ReturnType<typeof createServerClient>;

/** A failure we have already worded for the person; `detail` is logged, never shown. */
export class PhotoStoreError extends Error {
  readonly status: number;
  readonly detail?: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'PhotoStoreError';
    this.status = status;
    this.detail = detail;
  }
}

export interface StorePhotoInput {
  tenantId: string;
  projectId: string;
  /** The bytes exactly as the camera produced them. */
  original: Buffer;
  fileName: string;
  contentType?: string | null;
  category?: string;
  caption?: string;
  takenBy?: string;
  takenAt?: string;
  location?: { lat: number; lng: number } | null;
  /** Extra `photos` columns set at insert time (title, album, description, tags, photo_type). */
  extra?: Record<string, unknown>;
}

export interface StoredPhoto {
  photo: Record<string, unknown>;
  /** Non-fatal: the photo saved but something about it is worse than normal. */
  warning: string | null;
}

/**
 * Throws UnsupportedImageError for a HEIC we can't decode (store nothing — no
 * browser could show it) and PhotoStoreError for everything else.
 */
export async function storePhoto(db: Db, input: StorePhotoInput): Promise<StoredPhoto> {
  const rawFilename = input.fileName || `photo-${Date.now()}.jpg`;

  // ── DOWNSCALE + THUMBNAIL (the phone-freeze fix) ─────────────────────────
  // Straight-from-camera photos are 2.4-3.6 MB 12MP JPEGs. Storing those and
  // then rendering them in every grid tile is what locks the app up. Render a
  // ~2000px display original and a 400px thumbnail here, once, at upload time.
  // See lib/image-thumb.ts for why Supabase image transforms are NOT the fix.
  let processed;
  try {
    processed = await processImageUpload(input.original, { fileName: rawFilename });
  } catch (e: unknown) {
    if (e instanceof UnsupportedImageError) throw e;
    throw new PhotoStoreError(400, 'Could not process this image', e);
  }

  // Bytes we will actually store, plus a filename whose extension matches them.
  const displayBytes = processed.kind === 'processed' ? processed.display.buffer : input.original;
  const displayType =
    processed.kind === 'processed' ? processed.display.contentType : input.contentType || 'image/jpeg';
  const filename =
    processed.kind === 'processed' ? withExtension(rawFilename, processed.display.extension) : rawFilename;

  const storagePath = `projects/${input.projectId}/photos/${Date.now()}-${filename}`;

  const { data: uploadData, error: uploadError } = await db.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, displayBytes, { contentType: displayType });
  if (uploadError || !uploadData) throw new PhotoStoreError(500, 'Upload failed', uploadError);

  const url = db.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath).data?.publicUrl || null;
  if (!url) {
    await removeQuietly(db, [storagePath]);
    throw new PhotoStoreError(500, 'Failed to resolve public URL');
  }

  // ── Thumbnail object ─────────────────────────────────────────────────────
  // Written to the same `<dir>/thumbs/<stem>.jpg` path that
  // scripts/backfill-photo-thumbs.ts uses, so a live upload and a backfill of
  // the historical rows can never produce two competing thumbnails.
  // A thumbnail failure is NOT fatal: the photo itself is already stored, and
  // losing a field photo over a missing thumbnail would be the worse bug. It
  // is reported back in `warning` rather than swallowed.
  let thumbnailUrl: string | null = null;
  let warning: string | null =
    processed.kind === 'processed' && processed.thumbError
      ? `Thumbnail could not be rendered (${processed.thumbError}); grids will fall back to the full image.`
      : processed.kind === 'passthrough'
        ? `Stored without downscaling: ${processed.reason}`
        : null;
  let thumbPath: string | null = null;

  if (processed.kind === 'processed' && processed.thumb) {
    thumbPath = thumbPathFor(storagePath, processed.thumb.extension);
    const { error: thumbError } = await db.storage
      .from(PHOTO_BUCKET)
      .upload(thumbPath, processed.thumb.buffer, { contentType: processed.thumb.contentType, upsert: true });
    if (thumbError) {
      console.error('[photo-store] thumbnail storage error:', thumbError.message);
      warning = `Thumbnail could not be stored (${thumbError.message}); grids will fall back to the full image.`;
      thumbPath = null;
    } else {
      thumbnailUrl = db.storage.from(PHOTO_BUCKET).getPublicUrl(thumbPath).data?.publicUrl || null;
      if (!thumbnailUrl) {
        warning = 'Thumbnail was stored but its public URL could not be resolved; grids will fall back to the full image.';
      }
    }
  }

  // `photos` is the canonical table every gallery reads. `url` / `thumbnail_url`
  // are stored in public-URL form; the list route signs them on read (the
  // bucket is private). createServerClient is service-role, so RLS can't
  // silently reject the insert the way the old anon-client insert did.
  const { data: photo, error: insertError } = await db
    .from('photos')
    .insert({
      tenant_id: input.tenantId,
      project_id: input.projectId,
      url,
      thumbnail_url: thumbnailUrl,
      filename,
      category: input.category || 'Progress',
      caption: input.caption || '',
      taken_by: input.takenBy || '',
      taken_at: input.takenAt || new Date().toISOString(),
      // file_size / mime_type describe the object we actually STORED, not the
      // bytes the browser handed us — otherwise the row lies about storage.
      file_size: displayBytes.length,
      mime_type: displayType,
      location_lat: input.location?.lat ?? null,
      location_lng: input.location?.lng ?? null,
      ...(input.extra || {}),
    } as never)
    .select()
    .single();

  if (insertError || !photo) {
    // No row means nothing will ever reference these objects. Clean them up so
    // a failed upload does not silently accrue orphaned bytes in the bucket.
    await removeQuietly(db, thumbPath ? [storagePath, thumbPath] : [storagePath]);
    throw new PhotoStoreError(500, 'Failed to save photo', insertError);
  }

  return { photo: photo as Record<string, unknown>, warning };
}

/**
 * Best-effort cleanup of objects an aborted upload left behind. Never throws —
 * the caller is already reporting a failure.
 */
export async function removeQuietly(db: Db, paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    const { error } = await db.storage.from(PHOTO_BUCKET).remove(paths);
    if (error) console.error('[photo-store] orphan cleanup failed:', error.message);
  } catch (e: unknown) {
    console.error('[photo-store] orphan cleanup threw:', e instanceof Error ? e.message : e);
  }
}

/** Read an object the client put in storage with a signed upload URL. */
export async function downloadStaged(db: Db, path: string): Promise<Buffer> {
  const { data, error } = await db.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) throw new PhotoStoreError(404, "The upload didn't reach storage. Try again.", error);
  return Buffer.from(await data.arrayBuffer());
}

/** "Site photo (1).JPG" → "Site_photo_(1).JPG" — safe as a storage key segment. */
export function safeObjectName(name: string): string {
  return (name || 'file').replace(/[^\w.\-() ]+/g, '_').slice(-120) || 'file';
}
