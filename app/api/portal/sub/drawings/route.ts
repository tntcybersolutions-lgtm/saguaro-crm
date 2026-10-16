import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { signStoredUrl } from '@/lib/storage-signing';
import { apiError } from '@/lib/api-error';

/** GET — read-only CURRENT drawing set for the sub's project, signed for viewing/
 *  download. Grouped client-side by discipline; superseded sheets are excluded. */
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

export async function GET(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });
    const db = createServerClient();

    const { data: drawings, error } = await db
      .from('drawings')
      .select('id, name, sheet_number, discipline, revision_date, version, status, url, created_at')
      .eq('project_id', session.project_id!)
      .eq('tenant_id', session.tenant_id)
      .neq('status', 'superseded')
      .order('sheet_number', { ascending: true });
    if (error) throw error;

    const signed = await Promise.all(
      (drawings || []).map(async (d: { url: string | null }) => ({
        ...d,
        url: d.url ? await signStoredUrl('blueprints', d.url, 3600).catch(async () => signStoredUrl('project-files', d.url as string, 3600).catch(() => d.url)) : d.url,
      })),
    );
    return NextResponse.json({ drawings: signed });
  } catch (e) {
    return apiError('portal/sub/drawings GET', e);
  }
}
