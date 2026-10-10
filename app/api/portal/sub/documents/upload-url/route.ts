import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { sessionProjectId } from '@/lib/sub-portal-scope';
import {
  DOCUMENT_MAX_BYTES, DOCUMENT_MAX_MB, SUB_FILES_BUCKET, checkDocumentFileName, documentUploadPath, subPortalFilePrefix,
} from '@/lib/sub-portal-files';

export const runtime = 'nodejs';

/**
 * POST /api/portal/sub/documents/upload-url?token=…  { fileName, size? }
 *
 * A one-time signed URL so the sub's browser puts a Documents-tab file
 * straight into storage. The file used to be posted through this app's server,
 * where the ~4.5 MB serverless request cap refused anything bigger although the
 * tab says 100 MB. The key is pinned directly in this portal session's own
 * folder (lib/sub-portal-files), and POST /api/portal/sub/documents refuses any
 * path outside it. Auth is the portal token. Documents are project-wide, so an
 * email-only link (no roster sub) can upload too — its folder is the session's.
 */

async function authenticateSubPortal(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || req.headers.get('x-portal-token');
  if (!token) return null;
  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();
  return session;
}

export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });
    if (!sessionProjectId(session)) {
      return NextResponse.json({ error: 'This portal link is not tied to a job.' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as { fileName?: unknown; size?: unknown };
    const name = checkDocumentFileName(body.fileName);
    if (!name.ok) return NextResponse.json({ error: name.message, field: 'file' }, { status: 400 });
    // The browser checks this before asking; a declared size over the limit gets no URL.
    if (typeof body.size === 'number' && body.size > DOCUMENT_MAX_BYTES) {
      return NextResponse.json({ error: `That file is over ${DOCUMENT_MAX_MB} MB. Upload a smaller file.`, field: 'file' }, { status: 413 });
    }

    const path = documentUploadPath(subPortalFilePrefix(session), name.safeName);
    const { data, error } = await createServerClient().storage.from(SUB_FILES_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw error || new Error('no signed upload url returned');
    return NextResponse.json({ bucket: SUB_FILES_BUCKET, path, token: data.token, signedUrl: data.signedUrl });
  } catch (err) {
    return apiError('portal/sub/documents/upload-url', err, "Couldn't start the upload. Please try again.");
  }
}
