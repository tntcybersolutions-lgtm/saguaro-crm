import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

// Real columns on public.budget_lines that callers may set. Anything outside
// this set is dropped so the insert/update never references a non-existent
// column (which would 500). id/tenant_id/project_id/timestamps are handled
// separately and excluded from client-supplied writes.
const BUDGET_LINE_COLUMNS = [
  'cost_code', 'description', 'division', 'category',
  'original_budget', 'approved_changes', 'revised_budget',
  'committed', 'actual', 'projected', 'variance',
  'percent_complete', 'notes', 'sort_order', 'ai_generated',
] as const;

function pickBudgetColumns(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of BUDGET_LINE_COLUMNS) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = createServerClient();

    // Verify project belongs to this tenant
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (projectError || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data, error } = await supabase
      .from('budget_lines')
      .select('*')
      .eq('project_id', params.projectId)
      .order('cost_code', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ lines: data ?? [] });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/budget] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/budget', e, 'Failed to load lines');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Budget', 'Edit', { projectId: params.projectId });
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const supabase = createServerClient();

    // Verify project belongs to this tenant
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (projectError || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const record = { ...pickBudgetColumns(body), tenant_id: user.tenantId, project_id: params.projectId };
    const { data, error } = await supabase.from('budget_lines').insert(record as Database['public']['Tables']['budget_lines']['Insert']).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, line: data });
  } catch (err) {
    console.error('[budget/POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Budget', 'Edit', { projectId: params.projectId });
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const supabase = createServerClient();

    // Verify project belongs to this tenant
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (projectError || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const { id, _delete } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    // The budget UI issues deletes as PATCH { id, _delete:true }. Actually remove
    // the row (tenant + project scoped) instead of silently no-op'ing.
    if (_delete === true) {
      const { error: delErr } = await supabase
        .from('budget_lines')
        .delete()
        .eq('id', id as string)
        .eq('project_id', params.projectId)
        .eq('tenant_id', user.tenantId);
      if (delErr) throw delErr;
      return NextResponse.json({ success: true, deleted: true });
    }

    const updates = pickBudgetColumns(body);
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }
    const { error } = await supabase
      .from('budget_lines')
      .update(updates)
      .eq('id', id as string)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[budget/PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
