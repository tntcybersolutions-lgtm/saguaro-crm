import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { notOnRoster, subRecordScope } from '@/lib/sub-portal-scope';
import {
  SUB_FILES_BUCKET, checkComplianceFileName, complianceUploadPath, subPortalFilePrefix,
} from '@/lib/sub-portal-files';

export const runtime = 'nodejs';

/**
 * POST /api/portal/sub/compliance/upload-url?token=…  { fileName }
 *
 * A one-time signed URL so the sub's browser puts a COI / W-9 / license file
 * straight into storage (no serverless body limit). The key is pinned under
 * this portal session's own folder (lib/sub-portal-files), and
 * POST /api/portal/sub/compliance refuses any path outside it. Auth is the
 * portal token; compliance records belong to a roster sub, so an email-only
 * link gets the same not-on-roster 403 the record route gives.
 */

async function authenticateSubPortal(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || req.headers.get('x-portal-token');
  if (!token) return null;
  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token).gt('expires_at', new Date().toISOString())
    .eq('status', 'active')
    .single();
  return session;
}

export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });
    if (!subRecordScope(session)) {
      const r = notOnRoster(session, 'a compliance document');
      return NextResponse.json(r.body, { status: r.status });
    }

    const body = (await req.json().catch(() => ({}))) as { fileName?: unknown };
    const name = checkComplianceFileName(body.fileName);
    if (!name.ok) return NextResponse.json({ error: name.message }, { status: 400 });

    const path = complianceUploadPath(subPortalFilePrefix(session), name.safeName);
    const { data, error } = await createServerClient().storage.from(SUB_FILES_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw error || new Error('no signed upload url returned');
    return NextResponse.json({ bucket: SUB_FILES_BUCKET, path, token: data.token, signedUrl: data.signedUrl });
  } catch (err) {
    return apiError('portal/sub/compliance/upload-url', err, "Couldn't start the upload. Please try again.");
  }
}
