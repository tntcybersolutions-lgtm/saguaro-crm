import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';

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

    /* The tenant is the CALLER'S, never the project's. This read used to
       supply it, which meant posting another company's projectId wrote the
       budget and all its line items into that company's account -- and
       when the lookup missed, `|| projectId` filed them under a tenant id
       that was really a project id. The project is now checked instead of
       consulted: if it is not ours, there is nothing to budget. */
    const tenantId = g.user.tenantId;
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

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
      /* budget_line_items is UNIQUE (project_id, csi_division) — it is a
         one-row-per-division budget, not a line-item ledger. The route used to
         push one row per takeoff item, so the second item in any division blew
         up the whole insert on 23505 and no budget was ever created. A takeoff
         of 168 lines across 14 divisions is 14 budget rows, which is also what
         "CSI-coded budget" means to a GC. */
      const byDivision = new Map<string, { division: string; costCode: string; total: number; names: string[] }>();
      for (const item of lineItems as Record<string, unknown>[]) {
        const division = String(item.csiDivision || item.costCode || '').slice(0, 2) || '00';
        const amount = Number(item.originalAmount) || 0;
        const existing = byDivision.get(division);
        if (existing) {
          existing.total += amount;
          if (existing.names.length < 6) existing.names.push(String(item.description || ''));
        } else {
          byDivision.set(division, {
            division,
            costCode: String(item.costCode || division),
            total: amount,
            names: [String(item.description || '')],
          });
        }
      }

      const rows = [...byDivision.values()]
        .sort((a, b) => a.division.localeCompare(b.division))
        .map((d, idx) => ({
        // budget_line_items links to a budget via project_id (no budget_id column).
        project_id: projectId,
        tenant_id: tenantId,
        cost_code: d.costCode,
        csi_division: d.division,
        csi_description: (CSI_DIVISIONS[d.division]?.name || d.names[0] || `Division ${d.division}`).slice(0, 200),
        original_budget: d.total,
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
          // Each row in `rows` is built with tenant_id: tenantId above.
          .upsert(batch, { onConflict: 'project_id,csi_division' });
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
