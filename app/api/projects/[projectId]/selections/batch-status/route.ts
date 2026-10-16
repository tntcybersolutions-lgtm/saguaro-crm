import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/** GET a status breakdown (counts per status) for the project's selections. */
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('selections')
      .select('status')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const row of data || []) {
      const s = (row as Record<string, unknown>).status as string || 'Unknown';
      counts[s] = (counts[s] || 0) + 1;
    }
    return NextResponse.json({ counts, total: (data || []).length });
  } catch (e) {
    return apiError('projects/[projectId]/selections/batch-status GET', e);
  }
}

/**
 * Batch update status across multiple selection items.
 * Body: { ids: string[], status: string }
 */
async function batchUpdate(req: NextRequest, params: { projectId: string }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }

    const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    const status = typeof body.status === 'string' ? body.status : '';

    if (ids.length === 0 || !status) {
      return NextResponse.json({ error: 'ids and status are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('selections')
      .update({ status, updated_at: new Date().toISOString() })
      .in('id', ids)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .select('id');
    if (error) throw error;

    return NextResponse.json({ success: true, updated: (data || []).length, ids: (data || []).map(r => (r as Record<string, unknown>).id) });
  } catch (e) {
    return apiError('projects/[projectId]/selections/batch-status GET', e);
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  return batchUpdate(req, params);
}

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string } }) {
  return batchUpdate(req, params);
}
