import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  // Was fully unauthenticated (tenant derived from project). Now requires Budget/Edit.
  const g = await requirePermission(req, 'Budget', 'Edit');
  if (!g.ok) return g.res;
  try {
    const supabase = g.db;
    const body = await req.json();
    /* BOTH SPELLINGS, BECAUSE THE API USES BOTH.
       /api/bid-packages/create takes project_id; this took projectId only, so
       a caller who had just created a package and reused the same key got
       "projectId is required" and no hint that the name had changed between
       two endpoints in the same workflow. The subcontractors route already
       solves this by accepting either, which is the house pattern — snake_case
       matches the column, camelCase matches the rest of the client code, and
       an integrator should not have to know which side of that line an
       endpoint fell on. */
    const projectId = body.projectId ?? body.project_id;
    const {
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
      const byDivision = new Map<string, { division: string; costCode: string; total: number; names: string[]; category: string }>();
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
            /* The takeoff now sends material + labor per line ('material_labor').
               Labelling that row 'material' would misstate what the number holds. */
            category: typeof item.category === 'string' && item.category.trim() ? item.category.trim().slice(0, 40) : 'material',
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

      /* AND INTO budget_lines, WHICH IS THE TABLE ANYTHING ACTUALLY READS.
         This route is called from exactly one place — the Takeoff screen's
         "Generate Budget" button. It wrote the header to `budgets` and the
         lines to `budget_line_items`, and nothing in either the web app or the
         field app reads budget_line_items. Every budget surface reads
         budget_lines: the project Budget page (via projects/[id]/budget),
         cost-control, project-context, the client portal's financials, the AI
         forecast, and the field app's own Budget screen.
         So a GC could do a full takeoff, press Generate Budget, get a success,
         open the Budget page and find it empty, with the work sitting in a
         table no screen has ever queried.
         Half of this was already found once: app/budget.tsx in the field app
         carries a note saying it "used to read public.budget_line_items — a
         DIFFERENT, AI-builder table — so it showed numbers the web never
         edited". The read side was corrected there; the write side was never
         swept, so the takeoff kept filling the orphan.
         budget_line_items is still written above: it is harmless, and removing
         a table's only writer is a separate decision from making the feature
         work. */
      const canonical = [...byDivision.values()]
        .sort((a, b) => a.division.localeCompare(b.division))
        .map((d, idx) => ({
          project_id: projectId,
          tenant_id: tenantId,
          cost_code: d.costCode,
          division: d.division,
          // NOT NULL on this table, and the only field that is.
          description: (CSI_DIVISIONS[d.division]?.name || d.names[0] || `Division ${d.division}`).slice(0, 200),
          category: d.category,
          original_budget: d.total,
          revised_budget: d.total,
          committed: 0,
          actual: 0,
          projected: d.total,
          sort_order: idx + 1,
          notes: d.names.length > 1 ? d.names.slice(0, 6).join(' · ') : null,
        }));

      /* A read-then-write merge rather than an upsert. budget_lines has no
         unique constraint on (project_id, cost_code) — only the primary key —
         so onConflict would fail with 42P10, and ADDING that constraint would
         forbid something legitimate: two lines under one cost code with
         different scopes.
         The merge rule is the one a GC would expect from re-running a takeoff
         after the scope grew: a cost code already on the budget has its
         budgeted amount revised, and committed / actual / projected — the
         numbers someone has been maintaining by hand — are left alone. A cost
         code that is new gets inserted. Nothing is ever deleted. */
      const { data: existingLines, error: exErr } = await supabase
        .from('budget_lines')
        .select('id, cost_code, approved_changes')
        .eq('project_id', projectId)
        .eq('tenant_id', tenantId);
      if (exErr) throw exErr;
      const byCode = new Map((existingLines ?? []).map((l: { id: string; cost_code: string | null }) => [l.cost_code ?? '', l.id]));
      // Revised = original + approved changes. A re-run used to write revised =
      // the new original, dropping every approved change on that line.
      const approvedById = new Map((existingLines ?? []).map((l: { id: string; approved_changes: number | string | null }) => [l.id, Number(l.approved_changes) || 0]));

      const toInsert = canonical.filter((l) => !byCode.has(l.cost_code));
      const toUpdate = canonical.filter((l) => byCode.has(l.cost_code));

      for (let i = 0; i < toInsert.length; i += 50) {
        const { error: blErr } = await supabase
          .from('budget_lines')
          .insert(toInsert.slice(i, i + 50) as never);
        /* Thrown, not logged. A budget the user cannot see is the bug this
           block exists to fix; failing quietly here would recreate it. */
        if (blErr) {
          console.error('[budgets/create] budget_lines insert error:', blErr);
          throw blErr;
        }
      }
      for (const l of toUpdate) {
        const lineId = byCode.get(l.cost_code)!;
        const revised = Math.round((l.original_budget + (approvedById.get(lineId) || 0)) * 100) / 100;
        const { error: upErr } = await supabase
          .from('budget_lines')
          .update({ original_budget: l.original_budget, revised_budget: revised, updated_at: new Date().toISOString() } as never)
          .eq('id', lineId)
          .eq('tenant_id', tenantId);
        if (upErr) {
          console.error('[budgets/create] budget_lines update error:', upErr);
          throw upErr;
        }
      }

      return NextResponse.json({
        success: true,
        data: budget,
        lineItemCount: inserted,
        budgetLineCount: canonical.length,
        budgetLinesInserted: toInsert.length,
        budgetLinesRevised: toUpdate.length,
      });
    }

    return NextResponse.json({
      success: true,
      data: budget,
      lineItemCount: lineItems.length,
    });
  } catch (err: unknown) {
    return apiError('budgets/create POST', err, "Failed to create budget");
  }
}
