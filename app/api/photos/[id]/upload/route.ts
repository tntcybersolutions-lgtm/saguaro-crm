import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import {
  processImageUpload,
  thumbPathFor,
  withExtension,
  UnsupportedImageError,
} from '@/lib/image-thumb';
import { apiError } from '@/lib/api-error';

// sharp is a native module and a 12MP re-encode takes ~1-2s.
export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'project-files';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const formData = await req.formData();
    const upload = (formData.get('file') ?? formData.get('image') ?? formData.get('photo')) as File | null;

    if (!upload) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const db = createServerClient();

    // Confirm the photo exists and belongs to this tenant before overwriting its URL.
    const { data: existing, error: lookupError } = await db
      .from('photos')
      .select('id, project_id')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (lookupError || !existing) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    const original = Buffer.from(await upload.arrayBuffer());

    // ── DOWNSCALE + THUMBNAIL ────────────────────────────────────────────────
    // Identical treatment to /api/photos/upload: a replacement photo must not
    // reintroduce the 12MP original that froze the grids in the first place.
    let processed;
    try {
      processed = await processImageUpload(original);
    } catch (e: unknown) {
      if (e instanceof UnsupportedImageError) {
        return apiError('photos/id/upload', e, undefined, 415);
      }
      // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[photos/id/upload]', e);
    const msg = "Could not process this image";
      console.error('[photos/[id]/upload] image processing error:', msg);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Storage writes use the service-role client. storage.objects carries
    // policies for `authenticated` only, so the bare anon client used here
    // matched none and every upload was rejected by RLS.
    const rawFilename = upload.name || `photo-${Date.now()}.jpg`;
    const displayBytes = processed.kind === 'processed' ? processed.display.buffer : original;
    const displayType =
      processed.kind === 'processed' ? processed.display.contentType : upload.type || 'image/jpeg';
    const filename =
      processed.kind === 'processed' ? withExtension(rawFilename, processed.display.extension) : rawFilename;

    const storagePath = `projects/${existing.project_id || 'unassigned'}/photos/${Date.now()}-${filename}`;

    const { data: uploadData, error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(storagePath, displayBytes, { contentType: displayType });

    if (uploadError || !uploadData) {
      console.error('[photos/[id]/upload] storage error:', uploadError?.message);
      return apiError('photos/id/upload', uploadError, 'Upload failed');
    }

    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storagePath);

    const url = urlData?.publicUrl || null;
    if (!url) {
      await removeQuietly(db, [storagePath]);
      return NextResponse.json({ error: 'Failed to resolve public URL' }, { status: 500 });
    }

    let thumbnailUrl: string | null = null;
    let thumbPath: string | null = null;
    let warning: string | null =
      processed.kind === 'processed' && processed.thumbError
        ? `Thumbnail could not be rendered (${processed.thumbError}); grids will fall back to the full image.`
        : processed.kind === 'passthrough'
          ? `Stored without downscaling: ${processed.reason}`
          : null;

    if (processed.kind === 'processed' && processed.thumb) {
      thumbPath = thumbPathFor(storagePath, processed.thumb.extension);
      const { error: thumbError } = await db.storage
        .from(BUCKET)
        .upload(thumbPath, processed.thumb.buffer, {
          contentType: processed.thumb.contentType,
          upsert: true,
        });
      if (thumbError) {
        console.error('[photos/[id]/upload] thumbnail storage error:', thumbError.message);
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

    const { error: updateError } = await db
      .from('photos')
      .update({
        url,
        // ALWAYS written, including as null. Leaving the previous value in place
        // would leave the grid showing the REPLACED photo's thumbnail next to
        // the new full-size image — a stale thumbnail is worse than none.
        thumbnail_url: thumbnailUrl,
        // These describe the object we actually stored, which just changed.
        mime_type: displayType,
        file_size: displayBytes.length,
      } as never)
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (updateError) {
      console.error('[photos/[id]/upload] update error:', updateError?.message);
      // The row still points at the old object, so nothing references these.
      await removeQuietly(db, thumbPath ? [storagePath, thumbPath] : [storagePath]);
      return apiError('photos/id/upload', updateError, 'Failed to update photo');
    }

    return NextResponse.json({
      ok: true,
      url,
      thumbnailUrl,
      ...(warning ? { warning } : {}),
    });
  } catch (err: unknown) {
    console.error('[photos/[id]/upload] error: Internal server error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Best-effort cleanup of objects an aborted replacement left behind. Never throws. */
async function removeQuietly(db: ReturnType<typeof createServerClient>, paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    const { error } = await db.storage.from(BUCKET).remove(paths);
    if (error) console.error('[photos/[id]/upload] orphan cleanup failed:', error.message);
  } catch (e: unknown) {
    console.error('[photos/[id]/upload] orphan cleanup threw:', e instanceof Error ? e.message : e);
  }
}
