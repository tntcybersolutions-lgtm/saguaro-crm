import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getPdfPageCount, generateThumbnail } from '@/lib/blueprint-processor';
import { mergePDFs } from '@/lib/pdf-engine';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiFail } from '@/lib/api-error';
import { must } from '@/lib/db-write';
import { registerTakeoffPlanDrawings } from '@/lib/drawing-register';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/takeoff/[id]/upload-complete
 *
 * The bytes are already in storage — the browser PUT them to a signed URL, so
 * they never passed through a function body. This does everything the old
 * upload route did AFTER the bytes landed: count the sheets, make the
 * thumbnail, and mark the takeoff ready to analyze.
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
      .select('*')
      .eq('id', takeoffId)
      .eq('tenant_id', g.user.tenantId)
      .single();

    if (!takeoff) return apiFail('Takeoff not found', 404);

    const row = takeoff as unknown as {
      project_id: string;
      name?: string | null;
      source_files?: Array<{ path: string; name: string; type: string }> | null;
    };
    const projectId = row.project_id;

    /* The client tells us where it wrote, so check it wrote where it was told.
       Without this the path is a caller-supplied string pointing anywhere in
       the bucket. */
    const expectedPrefix = `${projectId}/blueprints/${takeoffId}/`;
    if (!storagePath.startsWith(expectedPrefix)) {
      return apiFail('That file does not belong to this takeoff.', 400);
    }

    /* A drawing set arrives as several PDFs — Architectural, Structural, MEP.
       Every source is kept under sources/, and they are merged in upload order
       into one canonical blueprint that the analyzer, the thumbnail and every
       reader already point at. Nothing downstream has to know there was more
       than one file.

       Images cannot be merged into a PDF here, so an image upload replaces
       whatever was there — and the response says so, rather than the old
       behavior of overwriting silently. */
    const existing = row.source_files ?? [];
    const isPdf = fileType === 'application/pdf';
    const priorPdfs = existing.filter((s) => s.type === 'application/pdf');
    const merging = isPdf && priorPdfs.length > 0;

    const sources = isPdf
      ? [...priorPdfs, { path: storagePath, name: fileName, type: fileType }]
      : [{ path: storagePath, name: fileName, type: fileType }];

    /* The canonical object every other route reads. */
    const canonicalPath = `${expectedPrefix}blueprint.${isPdf ? 'pdf' : (fileName.split('.').pop() || 'png').toLowerCase()}`;

    let combined: Buffer | null = null;
    if (merging) {
      const parts: Uint8Array[] = [];
      for (const src of sources) {
        const { data: blob } = await db.storage.from(BUCKET).download(src.path);
        if (blob) parts.push(new Uint8Array(await blob.arrayBuffer()));
      }
      if (parts.length) combined = Buffer.from(await mergePDFs(parts));
    } else {
      const { data: blob } = await db.storage.from(BUCKET).download(storagePath);
      if (blob) combined = Buffer.from(await blob.arrayBuffer());
    }

    if (!combined) return apiFail('The uploaded file could not be read back from storage.', 500);

    const { error: writeErr } = await db.storage
      .from(BUCKET)
      .upload(canonicalPath, combined, { contentType: isPdf ? 'application/pdf' : fileType, upsert: true });
    if (writeErr) throw writeErr;

    const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(canonicalPath);

    /* Mark it usable immediately. Counting pages on a hundred-megabyte set
       takes a moment and the GC should not wait on it to see the upload land. */
    const { data: updated, error: updateError } = await db
      .from('takeoffs')
      .update({
        file_url: publicUrl,
        file_name: sources.length > 1 ? `${sources.length} files` : fileName,
        storage_path: canonicalPath,
        file_type: isPdf ? 'application/pdf' : fileType,
        file_size: combined.length,
        source_files: sources,
        status: 'uploaded',
      })
      .eq('id', takeoffId)
      .eq('tenant_id', g.user.tenantId)
      .select()
      .single();

    if (updateError) throw updateError;

    /* The plan set the estimate was built from belongs in the project's Drawing
       Register — it used to live only inside the takeoff, so the register showed
       nothing for a job whose plans were already uploaded. One drawing per source
       file, referencing the object already in `blueprints` (no copy), idempotent
       per file. Never fails the upload; a register error is logged and reported. */
    const register = await registerTakeoffPlanDrawings(db, {
      tenantId: g.user.tenantId,
      projectId,
      bucket: BUCKET,
      sources,
      takeoffName: row.name ?? null,
    });

    /* Page count and thumbnail from the stored bytes. Both are recorded on the
       row; neither blocks the response, and the analyzer counts pages itself
       if this has not finished by the time it runs. */
    let pageCount = 0;
    try {
      {
        const buffer = combined;

        if (isPdf) {
          pageCount = (await getPdfPageCount(buffer)) || 0;
          if (pageCount > 0) {
            await must(db.from('takeoffs')
              .update({ page_count: pageCount })
              .eq('id', takeoffId)
              .eq('tenant_id', g.user.tenantId), 'takeoffs write');
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
          await must(db.from('takeoffs')
            .update({ thumbnail_url: thumbUrl })
            .eq('id', takeoffId)
            .eq('tenant_id', g.user.tenantId), 'takeoffs write');
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
      fileSize: combined.length,
      fileSizeFormatted: formatSize(combined.length),
      pageCount: pageCount || undefined,
      sourceCount: sources.length,
      sourceNames: sources.map((x) => x.name),
      merged: merging,
      /* An image upload cannot be merged into a PDF set, so it replaces. Say so
         rather than overwriting in silence, which is what used to happen. */
      replacedPrevious: !isPdf && existing.length > 0,
      drawingsRegistered: register.created,
      drawingRegisterError: register.error ? 'The plans uploaded, but could not be added to the Drawing Register.' : undefined,
    });
  } catch (err) {
    return apiError('takeoff/upload-complete', err, 'The blueprint uploaded but could not be registered. Please try again.');
  }
}
