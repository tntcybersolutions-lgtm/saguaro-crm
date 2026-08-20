import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { projectId } = await params;
    const db = createServerClient();

    const { data: lineItems, error: liErr } = await db
      .from('budget_line_items')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('sort_order', { ascending: true });

    if (liErr) throw liErr;

    const { data: commitmentRows, error: cErr } = await db
      .from('commitments')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (cErr) throw cErr;

    const items = lineItems || [];
    const commitments = commitmentRows || [];

    const totalOriginal = items.reduce((s: number, i: { original_budget: number }) => s + (i.original_budget || 0), 0);
    const totalCurrent = items.reduce((s: number, i: { current_budget: number }) => s + (i.current_budget || 0), 0);
    const totalCommitted = items.reduce((s: number, i: { committed_cost: number }) => s + (i.committed_cost || 0), 0);
    const totalCostToDate = items.reduce((s: number, i: { cost_to_date: number }) => s + (i.cost_to_date || 0), 0);
    const totalVariance = items.reduce((s: number, i: { variance: number }) => s + (i.variance || 0), 0);
    const totalVariancePct = totalCurrent > 0
      ? ((totalCurrent - (totalCommitted + items.reduce((s: number, i: { uncommitted_cost: number }) => s + (i.uncommitted_cost || 0), 0))) / totalCurrent * 100)
      : 0;
    const pctCommitted = totalCurrent > 0 ? (totalCommitted / totalCurrent * 100) : 0;
    const pctSpent = totalCurrent > 0 ? (totalCostToDate / totalCurrent * 100) : 0;
    const overBudgetDivisions = items
      .filter((i: { variance: number }) => (i.variance || 0) < 0)
      .map((i: { csi_division: string }) => i.csi_division);

    return NextResponse.json({
      line_items: items,
      commitments,
      summary: {
        total_original_budget: totalOriginal,
        total_current_budget: totalCurrent,
        total_committed: totalCommitted,
        total_cost_to_date: totalCostToDate,
        total_variance: totalVariance,
        total_variance_pct: Math.round(totalVariancePct * 10) / 10,
        pct_committed: Math.round(pctCommitted * 10) / 10,
        pct_spent: Math.round(pctSpent * 10) / 10,
        over_budget_divisions: overBudgetDivisions,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
