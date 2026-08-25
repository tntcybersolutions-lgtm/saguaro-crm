import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import {
  processImageUpload,
  thumbPathFor,
  withExtension,
  UnsupportedImageError,
} from '@/lib/image-thumb';

// sharp is a native module and a 12MP re-encode takes ~1-2s, so this handler is
// pinned to the Node runtime with headroom rather than the default edge limits.
export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'project-files';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const formData = await req.formData();
    const upload = (formData.get('file') ?? formData.get('image') ?? formData.get('photo')) as File | null;
    const projectId = (formData.get('projectId') as string) || '';
    const category  = (formData.get('category')  as string) || 'Progress';
    const caption   = (formData.get('caption')   as string) || '';
    const rawFilename = upload?.name || `photo-${Date.now()}.jpg`;

    // Optional GPS, posted as a 'lat,lng' string.
    let locationLat: number | null = null;
    let locationLng: number | null = null;
    const location = (formData.get('location') as string) || '';
    if (location) {
      const [latStr, lngStr] = location.split(',');
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        locationLat = lat;
        locationLng = lng;
      }
    }

    if (!upload) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    // Service-role client for BOTH storage and DB — bypasses RLS (the old code used the
    // anon client for the insert, which RLS rejected -> 500 -> photo silently lost).
    const db = createServerClient();

    const original = Buffer.from(await upload.arrayBuffer());

    // ── DOWNSCALE + THUMBNAIL (the phone-freeze fix) ─────────────────────────
    // Straight-from-camera photos are 2.4-3.6 MB 12MP JPEGs. Storing those and
    // then rendering them in every grid tile is what locks the app up. Render a
    // ~2000px display original and a 400px thumbnail here, once, at upload time.
    // See lib/image-thumb.ts for why Supabase image transforms are NOT the fix.
    let processed;
    try {
      processed = await processImageUpload(original, { fileName: rawFilename });
    } catch (e: unknown) {
      if (e instanceof UnsupportedImageError) {
        // A HEIC we have no codec for. Storing it would put an object in the
        // bucket that no browser and no Android device can display — refuse
        // loudly instead of reporting a success that isn't one.
        return NextResponse.json({ error: e.message, code: e.code }, { status: 415 });
      }
      const msg = e instanceof Error ? e.message : 'Could not process this image';
      console.error('[photos/upload] image processing error:', msg);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Bytes we will actually store, plus a filename whose extension matches them.
    const displayBytes = processed.kind === 'processed' ? processed.display.buffer : original;
    const displayType =
      processed.kind === 'processed' ? processed.display.contentType : upload.type || 'image/jpeg';
    const filename =
      processed.kind === 'processed' ? withExtension(rawFilename, processed.display.extension) : rawFilename;

    const storagePath = `projects/${projectId}/photos/${Date.now()}-${filename}`;

    const { data: uploadData, error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(storagePath, displayBytes, { contentType: displayType });

    if (uploadError || !uploadData) {
      console.error('[photos/upload] storage error:', uploadError?.message);
      return NextResponse.json({ error: uploadError?.message || 'Upload failed' }, { status: 500 });
    }

    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storagePath);

    const url = urlData?.publicUrl || null;
    if (!url) {
      await removeQuietly(db, [storagePath]);
      return NextResponse.json({ error: 'Failed to resolve public URL' }, { status: 500 });
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
        .from(BUCKET)
        .upload(thumbPath, processed.thumb.buffer, {
          contentType: processed.thumb.contentType,
          upsert: true,
        });
      if (thumbError) {
        console.error('[photos/upload] thumbnail storage error:', thumbError.message);
        warning = `Thumbnail could not be stored (${thumbError.message}); grids will fall back to the full image.`;
        thumbPath = null;
      } else {
        const { data: thumbUrlData } = db.storage.from(BUCKET).getPublicUrl(thumbPath);
        thumbnailUrl = thumbUrlData?.publicUrl || null;
        if (!thumbnailUrl) {
          warning = 'Thumbnail was stored but its public URL could not be resolved; grids will fall back to the full image.';
        }
      }
    }

    // Persist a row into `photos` — the canonical table that holds every existing photo and that
    // photos/list reads (then signs the url for the private project-files bucket). The bug was NOT
    // the table/columns (this was always right) — it was that prod ran an OLD build that did this
    // insert with the anon client, which RLS rejected (500) so the row was lost. createServerClient
    // is service-role and bypasses RLS. `url` and `thumbnail_url` are both stored in public-URL
    // form; signUrl() converts them to short-lived signed URLs on read.
    const nowIso = new Date().toISOString();
    const { data: photo, error: insertError } = await db
      .from('photos')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        url,
        // thumbnail_url has existed on this table forever and was never written.
        // Grids read this instead of `url`; that is the whole fix.
        thumbnail_url: thumbnailUrl,
        filename,
        category,
        caption,
        taken_by: user.email || '',
        taken_at: nowIso,
        // file_size / mime_type describe the object we actually STORED, not the
        // bytes the browser handed us — otherwise the row lies about storage.
        file_size: displayBytes.length,
        mime_type: displayType,
        location_lat: locationLat,
        location_lng: locationLng,
      } as never)
      .select()
      .single();

    if (insertError || !photo) {
      console.error('[photos/upload] insert error:', insertError?.message);
      // No row means nothing will ever reference these objects. Clean them up so
      // a failed upload does not silently accrue orphaned bytes in the bucket.
      await removeQuietly(db, thumbPath ? [storagePath, thumbPath] : [storagePath]);
      return NextResponse.json({ error: insertError?.message || 'Failed to save photo' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      photo,
      ...(warning ? { warning } : {}),
    });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[photos/upload] error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Best-effort cleanup of objects an aborted upload left behind. Never throws and
 * never changes the response — the caller is already returning a failure.
 */
async function removeQuietly(db: ReturnType<typeof createServerClient>, paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    const { error } = await db.storage.from(BUCKET).remove(paths);
    if (error) console.error('[photos/upload] orphan cleanup failed:', error.message);
  } catch (e: unknown) {
    console.error('[photos/upload] orphan cleanup threw:', e instanceof Error ? e.message : e);
  }
}
