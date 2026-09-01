import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';

export async function POST(req: NextRequest) {
  // Was fully unauthenticated (tenant derived from project). Now requires Budget/Edit.
  const g = await requirePermission(req, 'Budget', 'Edit');
  if (!g.ok) return g.res;
  try {
    const supabase = g.db;
    const body = await req.json();
    const {
      projectId,
      name,
      originalTotal,
      revisedTotal,
      overheadPct = 10,
      profitPct = 10,
      contingencyPct = 10,
      lineItems = [],
    } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    // Get tenant_id from project
    const { data: project } = await supabase
      .from('projects')
      .select('tenant_id')
      .eq('id', projectId)
      .single();

    const tenantId = project?.tenant_id || projectId;

    // Create budget record
    const { data: budget, error: budgetErr } = await supabase
      .from('budgets')
      .insert({
        project_id: projectId,
        tenant_id: tenantId,
        name: name || 'Project Budget',
        status: 'draft',
        version: 1,
        original_total: originalTotal || 0,
        revised_total: revisedTotal || originalTotal || 0,
        committed_total: 0,
        actual_total: 0,
        variance: revisedTotal || originalTotal || 0,
        overhead_pct: overheadPct,
        profit_pct: profitPct,
        contingency_pct: contingencyPct,
      })
      .select()
      .single();

    if (budgetErr) throw budgetErr;

    // Create budget line items
    if (lineItems.length > 0 && budget) {
      const rows = lineItems.map((item: Record<string, unknown>, idx: number) => ({
        // budget_line_items links to a budget via project_id (no budget_id column).
        project_id: projectId,
        tenant_id: tenantId,
        cost_code: item.costCode || `${String(idx + 1).padStart(4, '0')}`,
        csi_division: item.csiDivision || '',
        csi_description: item.description || '',
        original_budget: item.originalAmount || 0,
        /* current_budget, estimated_final_cost, variance and variance_pct are
           GENERATED columns — Postgres computes them from original_budget,
           approved_changes, committed_cost and uncommitted_cost. Sending values
           for them fails the whole insert with 428C9 ("cannot insert a
           non-DEFAULT value into column"), which is why every budget created
           from a takeoff has failed. */
        approved_changes: 0,
        committed_cost: 0,
        uncommitted_cost: 0,
        cost_to_date: 0,
        sort_order: idx + 1,
      }));

      // Insert in batches of 50. A failed batch used to be swallowed (logged only)
      // while the route still returned success:true — a silent partial write where
      // the budget header persists but its line items vanish. Surface the error so
      // the caller sees a real failure instead of a phantom "budget created".
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error: itemErr } = await supabase
          .from('budget_line_items')
          .insert(batch);
        if (itemErr) {
          console.error('[budgets/create] line item insert error:', itemErr);
          throw itemErr;
        }
        inserted += batch.length;
      }

      return NextResponse.json({
        success: true,
        data: budget,
        lineItemCount: inserted,
      });
    }

    return NextResponse.json({
      success: true,
      data: budget,
      lineItemCount: lineItems.length,
    });
  } catch (err: unknown) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[budgets/create]', err);
    const message = "Failed to create budget";
    console.error('[budgets/create]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
