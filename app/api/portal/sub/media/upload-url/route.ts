import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { PHOTO_BUCKET, safeObjectName } from '@/lib/photo-store';
import { authSubPortal, subMediaPrefix } from '@/lib/sub-media';

export const runtime = 'nodejs';

/**
 * POST /api/portal/sub/media/upload-url?token=…  { fileName }
 *
 * A one-time signed URL so a sub's phone puts an end-of-day photo or video
 * straight into storage — no serverless body limit, so a 200 MB site video
 * works. The key is pinned under this portal session's tenant / job / sub, and
 * /api/portal/sub/media refuses any path outside it. Auth is the portal token
 * (the same link the sub already uses), not a Saguaro login.
 */
export async function POST(req: NextRequest) {
  const session = await authSubPortal(req);
  if (!session) return NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 401 });
  if (!session.project_id) return NextResponse.json({ error: 'This portal link is not tied to a job' }, { status: 400 });

  try {
    const body = (await req.json().catch(() => ({}))) as { fileName?: unknown };
    const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
    if (!fileName) return NextResponse.json({ error: 'fileName is required' }, { status: 400 });

    const path = `${subMediaPrefix(session)}${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeObjectName(fileName)}`;
    const { data, error } = await createServerClient().storage.from(PHOTO_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw error || new Error('no signed upload url');
    return NextResponse.json({ bucket: PHOTO_BUCKET, path, token: data.token, signedUrl: data.signedUrl });
  } catch (e: unknown) {
    return apiError('portal/sub/media/upload-url', e, "Couldn't start the upload. Try again.");
  }
}
