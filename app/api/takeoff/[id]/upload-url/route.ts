import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiFail } from '@/lib/api-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/takeoff/[id]/upload-url
 *
 * Mint a short-lived signed upload URL so the browser sends the blueprint
 * bytes straight to storage.
 *
 * Why this exists: a Vercel serverless function will not accept a request body
 * over 4.5 MB. The upload route says the limit is 50 MB, but that check never
 * runs — the platform rejects the request at the edge first, with a non-JSON
 * 413 the client could only report as "Upload failed". A real 25-sheet drawing
 * set is 20–100 MB, so the one upload this product exists to handle was the one
 * upload it could not do. Document control already solved this the same way.
 *
 * The object key matches what the upload route has always written, so the
 * analyzer and the thumbnail path do not care which way the bytes arrived.
 */

const BUCKET = 'blueprints';
const VALID_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'webp'];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;

  const { id: takeoffId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const fileName = String(body.fileName || '');
    const ext = (fileName.split('.').pop() || '').toLowerCase();

    if (!fileName.trim()) return apiFail('fileName is required', 400);
    if (!VALID_EXT.includes(ext)) {
      if (ext === 'dwg' || ext === 'dxf') {
        return apiFail(
          `${ext.toUpperCase()} files are not yet supported. Please export as PDF from AutoCAD and upload that instead.`,
          400,
        );
      }
      return apiFail(`Unsupported file type ".${ext}". Accepted formats: PDF, PNG, JPG, TIFF, or WebP.`, 400);
    }

    const db = createServerClient();

    /* Tenant-scoped: the takeoff has to be this tenant's before we hand out a
       writable URL into their storage. */
    const { data: takeoff } = await db
      .from('takeoffs')
      .select('project_id')
      .eq('id', takeoffId)
      .eq('tenant_id', g.user.tenantId)
      .single();

    if (!takeoff) return apiFail('Takeoff not found', 404);

    const projectId = (takeoff as { project_id: string }).project_id;
    const path = `${projectId}/blueprints/${takeoffId}/blueprint.${ext}`;

    /* upsert so re-uploading over a takeoff behaves as it always has. */
    const { data, error } = await (db as any).storage
      .from(BUCKET)
      .createSignedUploadUrl(path, { upsert: true });

    if (error) throw error;

    return NextResponse.json({
      bucket: BUCKET,
      path,
      token: data.token,
      signedUrl: data.signedUrl,
      projectId,
    });
  } catch (err) {
    return apiError('takeoff/upload-url', err, 'Could not start the upload.');
  }
}
