import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';
import { toBudgetLineView, budgetLineWrite, budgetLineFinder } from '@/lib/budget-line';
import { awardPackageOf } from '@/lib/commitments';
import { contractMoney, type ContractInputs, type ProjectContractColumns } from '@/lib/job-contract';

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
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = createServerClient();

    // Verify project belongs to this tenant
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, original_contract_amount, original_contract_value, original_contract, revised_contract_value, contract_amount, contract_value')
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
    // Live roll-ups, so Committed and Direct costs come from the job's own
    // commitments, purchase orders and bills — not only what someone typed on
    // the line.
    const norm = (c: unknown) => String(c ?? '').trim().toLowerCase();
    const [cm, bli, po, bl, primeQ, cosQ, propQ] = await Promise.all([
      supabase.from('commitments').select('budget_line_item_id, csi_division, original_amount, approved_changes, current_amount, status, bid_package_id').eq('project_id', params.projectId).eq('tenant_id', user.tenantId),
      supabase.from('budget_line_items').select('id, cost_code, csi_division').eq('project_id', params.projectId).eq('tenant_id', user.tenantId),
      supabase.from('purchase_orders').select('cost_code, total, status, notes').eq('project_id', params.projectId).eq('tenant_id', user.tenantId),
      supabase.from('bills').select('cost_code, total, amount, status').eq('project_id', params.projectId).eq('tenant_id', user.tenantId),
      supabase.from('contracts').select('contract_type, original_amount, contract_amount, amount').eq('project_id', params.projectId).eq('tenant_id', user.tenantId),
      supabase.from('change_orders').select('status, amount, cost_impact').eq('project_id', params.projectId).eq('tenant_id', user.tenantId),
      supabase.from('proposals').select('amount, total_amount, status, created_at').eq('project_id', params.projectId).eq('tenant_id', user.tenantId).ilike('status', 'accepted').order('created_at', { ascending: false }).limit(1),
    ]);
    for (const q of [cm, bli, po, bl, primeQ, cosQ, propQ]) if (q.error) throw q.error;

    /* The job's contract (what the owner pays): original + approved change
       orders, by the one rule the job overview, cash flow and the owner portal
       use (lib/job-contract). This read revised_contract_value ||
       contract_amount first, so a job whose approved change orders never
       reached those columns showed a different contract here than on its own
       overview. The budget lines are COST; their total is not the contract. */
    const prime = ((primeQ.data ?? []) as { contract_type?: string | null }[]).find((c) => norm(c.contract_type) === 'prime') ?? null;
    const money = contractMoney({
      project: project as ProjectContractColumns,
      prime: prime as ContractInputs['prime'],
      acceptedProposal: ((propQ.data ?? [])[0] as ContractInputs['acceptedProposal']) ?? null,
      changeOrders: (cosQ.data ?? []) as ContractInputs['changeOrders'],
    });
    const contract = money.current;

    /* Which line each piece of paper lands on (lib/budget-line). Commitments
       reference budget_LINE_ITEMS (the FK says so), never budget_lines, so
       matching commitment.budget_line_item_id against a budget line's id could
       never hit: every commitment, including each bid award's, fell off the
       budget — and the award's draft PO twin is skipped below, so the award
       counted nowhere. A commitment is placed by its line item's cost code or
       division, else its own division, else the cost code on its award PO. */
    const findLine = budgetLineFinder((data ?? []) as { id: string; cost_code?: unknown; description?: unknown; division?: unknown }[]);
    const lineItem = new Map(((bli.data ?? []) as { id: string; cost_code: string | null; csi_division: string | null }[]).map((r) => [r.id, r]));
    const twinCode = new Map<string, string>();
    for (const x of (po.data ?? []) as Record<string, unknown>[]) {
      const pkg = awardPackageOf(x);
      if (pkg && x.cost_code) twinCode.set(pkg, String(x.cost_code));
    }
    const DEAD = new Set(['void', 'voided', 'cancelled', 'canceled', 'rejected', 'draft']);
    const committedByLine = new Map<string, number>();
    const add = (m: Map<string, number>, id: string | null, amt: number) => { if (id && amt) m.set(id, (m.get(id) || 0) + amt); };
    ((cm.data ?? []) as { budget_line_item_id: string | null; csi_division: string | null; original_amount: number | null; approved_changes: number | null; current_amount: number | null; status: string | null; bid_package_id: string | null }[])
      .filter((c) => !DEAD.has(norm(c.status)))
      .forEach((c) => {
        const item = c.budget_line_item_id ? lineItem.get(c.budget_line_item_id) : undefined;
        const lineId = (item && (findLine(item.cost_code) || findLine(item.csi_division)))
          || findLine(c.csi_division)
          || (c.bid_package_id ? findLine(twinCode.get(c.bid_package_id)) : null);
        const amt = Number(c.current_amount) || (Number(c.original_amount) || 0) + (Number(c.approved_changes) || 0);
        add(committedByLine, lineId, amt);
      });
    // A bid award writes both a commitment and a draft PO for the same deal —
    // count the commitment, not its PO twin.
    const awarded = new Set(((cm.data ?? []) as { bid_package_id?: string | null }[]).map((c) => c.bid_package_id).filter(Boolean) as string[]);
    ((po.data ?? []) as { cost_code: string | null; total: number | null; status: string | null; notes?: string | null }[])
      .filter((x) => x.cost_code && !DEAD.has(norm(x.status)) && !awarded.has(awardPackageOf(x as Record<string, unknown>) || ''))
      .forEach((x) => add(committedByLine, findLine(x.cost_code), Number(x.total) || 0));
    const billsByLine = new Map<string, number>();
    ((bl.data ?? []) as { cost_code: string | null; total: number | null; amount: number | null; status: string | null }[])
      .filter((x) => x.cost_code && !DEAD.has(norm(x.status)))
      .forEach((x) => add(billsByLine, findLine(x.cost_code), Number(x.total) || Number(x.amount) || 0));
    const round = (n: number) => Math.round(n * 100) / 100;
    const lines = (data ?? []).map((r) => {
      const v = toBudgetLineView(r as Record<string, unknown>);
      const liveCommitted = committedByLine.get(v.id) || 0;
      const committed = liveCommitted > 0 ? round(liveCommitted) : v.committed_cost;
      const direct = round(billsByLine.get(v.id) || 0);
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
    // .select('id') on both writes: a delete or update that matched no row
    // (a stale id, another job's line) returned success while nothing changed.
    if (_delete === true) {
      const { data: gone, error: delErr } = await supabase
        .from('budget_lines')
        .delete()
        .eq('id', id as string)
        .eq('project_id', params.projectId)
        .eq('tenant_id', user.tenantId)
        .select('id');
      if (delErr) throw delErr;
      if (!gone || gone.length === 0) return NextResponse.json({ error: 'Budget line not found' }, { status: 404 });
      return NextResponse.json({ success: true, deleted: true });
    }

    const updates = pickBudgetColumns(body);
    // Revised budget = original + approved changes; keep the stored column in step.
    if (updates.original_budget !== undefined || updates.approved_changes !== undefined) {
      const { data: cur, error: curErr } = await supabase
        .from('budget_lines')
        .select('original_budget, approved_changes')
        .eq('id', id as string)
        .eq('project_id', params.projectId)
        .eq('tenant_id', user.tenantId)
        .maybeSingle();
      if (curErr) throw curErr;
      if (!cur) return NextResponse.json({ error: 'Budget line not found' }, { status: 404 });
      const orig = Number(updates.original_budget ?? cur?.original_budget ?? 0) || 0;
      const appr = Number(updates.approved_changes ?? cur?.approved_changes ?? 0) || 0;
      updates.revised_budget = Math.round((orig + appr) * 100) / 100;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }
    const { data: saved, error } = await supabase
      .from('budget_lines')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id as string)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .select('*');
    if (error) throw error;
    if (!saved || saved.length === 0) return NextResponse.json({ error: 'Budget line not found' }, { status: 404 });
    return NextResponse.json({ success: true, line: toBudgetLineView(saved[0] as Record<string, unknown>) });
  } catch (err) {
    return apiError('projects/[projectId]/budget PATCH', err);
  }
}
