import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

import { apiError } from '@/lib/api-error';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('project_id');
  const docType = searchParams.get('doc_type');
  const sourceId = searchParams.get('source_id');

  if (!projectId) {
    return NextResponse.json({ error: 'project_id required' }, { status: 400 });
  }

  const db = createServerClient();

  let query = db
    .from('document_signatures')
    .select('*')
    .eq('project_id', projectId)
    .eq('tenant_id', user.tenantId)
    .order('sent_at', { ascending: false });

  if (docType) {
    query = query.eq('doc_type', docType);
  }
  if (sourceId) {
    query = query.eq('source_id', sourceId);
  }

  const { data, error } = await query;

  if (error) {
    return apiError('documents/sign/status', error, undefined, 500);
  }

  /* Opened tracking and declines live on the request row (one per signature):
     when first opened, last opened, how many times, and a decline reason. */
  const ids = (data || []).map((s) => s.id);
  const track = new Map<string, Record<string, unknown>>();
  if (ids.length) {
    const { data: reqs, error: rErr } = await db
      .from('document_signature_requests')
      .select('signature_id, viewed_at, last_viewed_at, view_count, declined_at, decline_reason')
      .in('signature_id', ids)
      .eq('tenant_id', user.tenantId);
    if (rErr) return apiError('documents/sign/status', rErr, undefined, 500);
    for (const r of reqs || []) if (r.signature_id) track.set(r.signature_id, r);
  }
  const signatures = (data || []).map((s) => {
    const t = track.get(s.id) || {};
    return { ...s, viewed_at: t.viewed_at ?? null, last_viewed_at: t.last_viewed_at ?? null, view_count: t.view_count ?? 0, declined_at: t.declined_at ?? null, decline_reason: t.decline_reason ?? null };
  });

  return NextResponse.json({ signatures });
}
