import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { readClientId } from '@/lib/offline/client-id';
import { fileFiledByClient, signedFileRow } from '@/lib/project-file-replay';

export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

const BUCKET = 'project-files';

/**
 * POST /api/files/upload-url — a signed URL to upload ONE file straight to
 * storage.
 *
 * /api/files/upload routes the bytes THROUGH the serverless function, which on
 * Vercel caps a request body near 4.5 MB — so a site video or a big drawing set
 * could never actually upload, whatever the bucket's 500 MB limit said. Here the
 * client gets a signed upload URL, PUTs the bytes to Supabase directly (no
 * function in the path → big files work and the upload is faster), then calls
 * /api/files/record to write the metadata row.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const fileName = String(body.fileName ?? '').trim();
    const projectId = body.projectId ? String(body.projectId) : null;
    if (!fileName) return NextResponse.json({ error: 'fileName is required' }, { status: 400 });

    const admin = createServerClient() as any;

    // A video kept on the phone and sent again: the first send already filed it.
    // Say so before the phone uploads the same bytes a second time.
    const earlier = await fileFiledByClient(admin, user.tenantId, readClientId(req.headers, body));
    if (earlier) return NextResponse.json({ existing: await signedFileRow(earlier) });

    const safeName = fileName.replace(/[^\w.\-() ]+/g, '_');
    const path = `${user.tenantId}/projects/${projectId || 'unfiled'}/files/${Date.now()}-${safeName}`;

    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) throw error;

    return NextResponse.json({ bucket: BUCKET, path, token: data.token, signedUrl: data.signedUrl });
  } catch (e: any) {
    return apiError('files/upload-url POST', e);
  }
}
