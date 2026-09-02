import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { signStoredUrl } from '@/lib/storage-signing';
import { must } from '@/lib/db-write';

export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Public share-link resolver. No auth — the opaque token IS the capability.
 * Looks up the (non-revoked, non-expired) share, re-signs the file fresh, tracks
 * the view, and 302-redirects to the signed URL. This makes a durable, revocable
 * link that always resolves even though the underlying signed URL is short-lived.
 */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const admin = createServerClient() as any;
  const { data: share } = await admin.from('file_shares').select('*').eq('token', params.token).maybeSingle();
  if (!share || share.revoked) return NextResponse.json({ error: 'This share link is no longer valid.' }, { status: 404 });
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This share link has expired.' }, { status: 410 });
  }
  const { data: f } = await admin.from('project_files').select('*').eq('id', share.file_id).single();
  if (!f || f.deleted_at) return NextResponse.json({ error: 'The shared file was removed.' }, { status: 404 });

  await must(admin.from('file_shares').update({ view_count: (share.view_count || 0) + 1, last_viewed_at: new Date().toISOString() }).eq('id', share.id), 'file_shares update');

  const signed = await signStoredUrl(f.storage_bucket || 'project-files', f.storage_path || f.file_url, 3600);
  if (!signed) return NextResponse.json({ error: 'Could not open the file.' }, { status: 500 });
  return NextResponse.redirect(signed, 302);
}
