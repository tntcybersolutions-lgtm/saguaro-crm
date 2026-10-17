import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { PHOTO_BUCKET, safeObjectName } from '@/lib/photo-store';
import { readClientId } from '@/lib/offline/client-id';
import { signFields } from '@/lib/storage-signing';

export const runtime = 'nodejs';

/**
 * POST /api/photos/upload-url  { projectId, fileName }
 *
 * Step 1 of a photo upload that never passes its bytes through a function. A
 * photo sent to /api/photos/upload has to fit in one serverless request body
 * (~4.5 MB on Vercel) — a 48 MP iPhone ProRAW, a drone still or a scanned
 * sheet doesn't. Here the browser gets a one-time signed URL, puts the
 * original straight into storage (the bucket takes up to 500 MB), then calls
 * /api/photos/ingest, which shrinks it and files the photos row.
 *
 * The staging key sits under the caller's tenant and this project, so ingest
 * can refuse any path a client didn't get from here.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = (await req.json().catch(() => ({}))) as { projectId?: unknown; fileName?: unknown };
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
    const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    if (!fileName) return NextResponse.json({ error: 'fileName is required' }, { status: 400 });

    const db = createServerClient();
    const { data: project, error: projErr } = await db
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (projErr) throw projErr;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // A photo kept on the phone and sent again: the first send already filed it.
    // Say so before the phone uploads the same bytes a second time.
    const clientId = readClientId(req.headers, body);
    if (clientId) {
      const { data: hits, error: findErr } = await db.from('photos').select('*')
        .eq('tenant_id', user.tenantId).eq('client_id' as never, clientId as never).limit(1);
      if (findErr) throw findErr;
      const hit = ((hits as Record<string, unknown>[] | null) || [])[0];
      if (hit) {
        const [signed] = await signFields([hit], ['url', 'thumbnail_url'], 3600, { strict: false });
        return NextResponse.json({ existing: signed ?? hit });
      }
    }

    const path = `${user.tenantId}/projects/${projectId}/photo-staging/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeObjectName(fileName)}`;
    const { data, error } = await db.storage.from(PHOTO_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw error || new Error('no signed upload url');

    return NextResponse.json({ bucket: PHOTO_BUCKET, path, token: data.token, signedUrl: data.signedUrl });
  } catch (e: unknown) {
    return apiError('photos/upload-url', e, "Couldn't start the upload. Try again.");
  }
}
