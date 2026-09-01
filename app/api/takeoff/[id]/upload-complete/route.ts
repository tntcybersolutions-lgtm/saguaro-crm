import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getPdfPageCount, generateThumbnail } from '@/lib/blueprint-processor';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiFail } from '@/lib/api-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/takeoff/[id]/upload-complete
 *
 * The bytes are already in storage — the browser PUT them to a signed URL, so
 * they never passed through a function body. This does everything the old
 * upload route did AFTER the bytes landed: count the sheets, make the
 * thumbnail, and mark the takeoff ready to analyse.
 *
 * The file is read back out of storage to count pages. That download is
 * server-to-server inside the same region and has no 4.5 MB ceiling, which is
 * the whole point of the split.
 *
 * Body: { path, fileName, fileType, fileSize }
 */

const BUCKET = 'blueprints';

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;

  const { id: takeoffId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const storagePath = String(body.path || '');
    const fileName = String(body.fileName || 'blueprint.pdf');
    const fileType = String(body.fileType || 'application/pdf');
    const fileSize = Number(body.fileSize) || 0;

    if (!storagePath) return apiFail('path is required', 400);

    const db = createServerClient();

    const { data: takeoff } = await db
      .from('takeoffs')
      .select('project_id')
      .eq('id', takeoffId)
      .eq('tenant_id', g.user.tenantId)
      .single();

    if (!takeoff) return apiFail('Takeoff not found', 404);

    const projectId = (takeoff as { project_id: string }).project_id;

    /* The client tells us where it wrote, so check it wrote where it was told.
       Without this the path is a caller-supplied string pointing anywhere in
       the bucket. */
    const expectedPrefix = `${projectId}/blueprints/${takeoffId}/`;
    if (!storagePath.startsWith(expectedPrefix)) {
      return apiFail('That file does not belong to this takeoff.', 400);
    }

    const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(storagePath);

    /* Mark it usable immediately. Counting pages on a hundred-megabyte set
       takes a moment and the GC should not wait on it to see the upload land. */
    const { data: updated, error: updateError } = await db
      .from('takeoffs')
      .update({
        file_url: publicUrl,
        file_name: fileName,
        storage_path: storagePath,
        file_type: fileType,
        file_size: fileSize,
        status: 'uploaded',
      })
      .eq('id', takeoffId)
      .eq('tenant_id', g.user.tenantId)
      .select()
      .single();

    if (updateError) throw updateError;

    /* Page count and thumbnail from the stored bytes. Both are recorded on the
       row; neither blocks the response, and the analyzer counts pages itself
       if this has not finished by the time it runs. */
    let pageCount = 0;
    try {
      const { data: blob } = await db.storage.from(BUCKET).download(storagePath);
      if (blob) {
        const buffer = Buffer.from(await blob.arrayBuffer());

        if (fileType === 'application/pdf') {
          pageCount = (await getPdfPageCount(buffer)) || 0;
          if (pageCount > 0) {
            await db.from('takeoffs')
              .update({ page_count: pageCount })
              .eq('id', takeoffId)
              .eq('tenant_id', g.user.tenantId);
          }
        }

        generateThumbnail(buffer, fileType).then(async (thumb) => {
          if (!thumb) return;
          const thumbPath = `${projectId}/blueprints/${takeoffId}/thumbnail.jpg`;
          const { error: thumbErr } = await db.storage
            .from(BUCKET)
            .upload(thumbPath, thumb, { contentType: 'image/jpeg', upsert: true });
          if (thumbErr) return;
          const { data: { publicUrl: thumbUrl } } = db.storage.from(BUCKET).getPublicUrl(thumbPath);
          await db.from('takeoffs')
            .update({ thumbnail_url: thumbUrl })
            .eq('id', takeoffId)
            .eq('tenant_id', g.user.tenantId);
        }).catch((err) => {
          console.warn('[takeoff/upload-complete] thumbnail (non-fatal):', err instanceof Error ? err.message : err);
        });
      }
    } catch (err) {
      // A blueprint with an unknown page count still analyses. Do not fail the
      // upload over the count.
      console.warn('[takeoff/upload-complete] page count (non-fatal):', err instanceof Error ? err.message : err);
    }

    return NextResponse.json({
      success: true,
      takeoff: updated,
      fileUrl: publicUrl,
      fileSize,
      fileSizeFormatted: formatSize(fileSize),
      pageCount: pageCount || undefined,
    });
  } catch (err) {
    return apiError('takeoff/upload-complete', err, 'The blueprint uploaded but could not be registered. Please try again.');
  }
}
