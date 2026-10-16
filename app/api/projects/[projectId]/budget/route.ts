import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';
import { toBudgetLineView, budgetLineWrite } from '@/lib/budget-line';
import { awardPackageOf } from '@/lib/commitments';

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
  const mapped = budgetLineWrite(body); // screen names → real columns
  for (const k of BUDGET_LINE_COLUMNS) {
    if (mapped[k] !== undefined) out[k] = mapped[k];
  }
  return out;
}

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Budget', 'View', { projectId: params.projectId });
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const supabase = createServerClient();

    // Verify project belongs to this tenant
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, revised_contract_value, contract_amount, contract_value')
      .eq('id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (projectError || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data, error } = await supabase
      .from('budget_lines')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .order('cost_code', { ascending: true });
    if (error) throw error;
    // The job's contract (what the owner pays), the same figure Home and the
    // job list show. The budget lines are COST; their total is not the contract.
    const p = project as { revised_contract_value?: number | null; contract_amount?: number | null; contract_value?: number | null };
    const contract = Number(p.revised_contract_value || p.contract_amount || p.contract_value || 0);
    // Live roll-ups by cost code, so Committed and Direct costs come from the
    // job's own commitments, purchase orders and bills — not only what someone
    // typed on the line.
    const norm = (c: unknown) => String(c ?? '').trim().toLowerCase();
    const [cm, po, bl] = await Promise.all([
      supabase.from('commitments').select('budget_line_item_id, original_amount, approved_changes, current_amount, status, bid_package_id').eq('project_id', params.projectId).eq('tenant_id', user.tenantId),
      supabase.from('purchase_orders').select('cost_code, total, status, notes').eq('project_id', params.projectId).eq('tenant_id', user.tenantId),
      supabase.from('bills').select('cost_code, total, amount, status').eq('project_id', params.projectId).eq('tenant_id', user.tenantId),
    ]);
    const DEAD = new Set(['void', 'voided', 'cancelled', 'canceled', 'rejected', 'draft']);
    const committedByLine = new Map<string, number>();
    ((cm.data ?? []) as { budget_line_item_id: string | null; original_amount: number | null; approved_changes: number | null; current_amount: number | null; status: string | null }[])
      .filter((c) => c.budget_line_item_id && !DEAD.has(norm(c.status)))
      .forEach((c) => {
        const amt = Number(c.current_amount) || (Number(c.original_amount) || 0) + (Number(c.approved_changes) || 0);
        committedByLine.set(c.budget_line_item_id!, (committedByLine.get(c.budget_line_item_id!) || 0) + amt);
      });
    // A bid award writes both a commitment and a draft PO for the same deal —
    // count the commitment, not its PO twin.
    const awarded = new Set(((cm.data ?? []) as { bid_package_id?: string | null }[]).map((c) => c.bid_package_id).filter(Boolean) as string[]);
    const poByCode = new Map<string, number>();
    ((po.data ?? []) as { cost_code: string | null; total: number | null; status: string | null; notes?: string | null }[])
      .filter((x) => x.cost_code && !DEAD.has(norm(x.status)) && !awarded.has(awardPackageOf(x as Record<string, unknown>) || ''))
      .forEach((x) => poByCode.set(norm(x.cost_code), (poByCode.get(norm(x.cost_code)) || 0) + (Number(x.total) || 0)));
    const billsByCode = new Map<string, number>();
    ((bl.data ?? []) as { cost_code: string | null; total: number | null; amount: number | null; status: string | null }[])
      .filter((x) => x.cost_code && !DEAD.has(norm(x.status)))
      .forEach((x) => billsByCode.set(norm(x.cost_code), (billsByCode.get(norm(x.cost_code)) || 0) + (Number(x.total) || Number(x.amount) || 0)));
    const round = (n: number) => Math.round(n * 100) / 100;
    const lines = (data ?? []).map((r) => {
      const v = toBudgetLineView(r as Record<string, unknown>);
      const liveCommitted = (committedByLine.get(v.id) || 0) + (poByCode.get(norm(v.cost_code)) || 0);
      const committed = liveCommitted > 0 ? round(liveCommitted) : v.committed_cost;
      const direct = round(billsByCode.get(norm(v.cost_code)) || 0);
      const projectedCost = round(committed + direct);
      const eac = Math.max(v.forecast_cost, projectedCost);
      return { ...v, committed_cost: committed, committed_source: liveCommitted > 0 ? 'commitments' : 'entered', direct_costs: direct, projected_cost: projectedCost, forecast_cost: round(eac), over_under: round(v.revised_budget - eac) };
    });
    return NextResponse.json({ lines, contract });
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
    const picked = pickBudgetColumns(body);
    const orig = Number(picked.original_budget ?? 0) || 0;
    const appr = Number(picked.approved_changes ?? 0) || 0;
    const record = { ...picked, revised_budget: Math.round((orig + appr) * 100) / 100, tenant_id: user.tenantId, project_id: params.projectId };
    const { data, error } = await supabase.from('budget_lines').insert(record as Database['public']['Tables']['budget_lines']['Insert']).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, line: toBudgetLineView(data as Record<string, unknown>) });
  } catch (err) {
    return apiError('projects/[projectId]/budget POST', err);
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
    // Revised budget = original + approved changes; keep the stored column in step.
    if (updates.original_budget !== undefined || updates.approved_changes !== undefined) {
      const { data: cur } = await supabase
        .from('budget_lines')
        .select('original_budget, approved_changes')
        .eq('id', id as string)
        .eq('project_id', params.projectId)
        .eq('tenant_id', user.tenantId)
        .maybeSingle();
      const orig = Number(updates.original_budget ?? cur?.original_budget ?? 0) || 0;
      const appr = Number(updates.approved_changes ?? cur?.approved_changes ?? 0) || 0;
      updates.revised_budget = Math.round((orig + appr) * 100) / 100;
    }
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
    return apiError('projects/[projectId]/budget PATCH', err);
  }
}
