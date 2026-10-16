import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/sub-portal/doc-visibility
 *   Returns shared documents with a derived visibility marker.
 *   Shape: { data: { docId, visibleToSubs: string[] }[] }
 *
 * PATCH /api/sub-portal/doc-visibility
 *   Body: { docId: string, visibleToSubs: string[] }
 *   Controls which subs can see a document. The portal_documents table has
 *   no dedicated visibility column, so visibility is normalized onto the
 *   existing `status` column:
 *     - ['all']  -> 'visible'
 *     - []       -> 'hidden'
 *     - [..ids]  -> 'restricted'
 *   The PATCH is fire-and-forget from the page, so responses stay safe.
 */
function statusFromVisibility(visibleToSubs: string[]): string {
  if (visibleToSubs.includes('all')) return 'visible';
  if (visibleToSubs.length === 0) return 'hidden';
  return 'restricted';
}

function visibilityFromStatus(status: string | null): string[] {
  if (status === 'visible') return ['all'];
  if (status === 'restricted') return ['restricted'];
  return [];
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('portal_documents')
      .select('id, status')
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    const rows = (data || []).map((r: any) => ({
      docId: r.id,
      visibleToSubs: visibilityFromStatus(r.status),
    }));
    return NextResponse.json({ data: rows });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no visibility settings" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('sub-portal/doc-visibility', e, 'Could not load document visibility settings');
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const docId: string | undefined = body?.docId;
    const visibleToSubs = Array.isArray(body?.visibleToSubs) ? body.visibleToSubs : [];
    if (!docId) {
      return NextResponse.json({ error: 'docId is required' }, { status: 400 });
    }

    const db = createServerClient();
    const { error } = await db
      .from('portal_documents')
      .update({ status: statusFromVisibility(visibleToSubs) })
      .eq('id', docId)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;

    return NextResponse.json({ data: { docId, visibleToSubs } });
  } catch (e) {
    return apiError('sub-portal/doc-visibility PATCH', e);
  }
}
