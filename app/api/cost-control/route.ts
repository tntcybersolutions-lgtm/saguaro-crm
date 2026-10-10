import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { costControl, type CostLine } from '@/lib/finance';
import { manualLinesFromReport, savedOverrides } from '@/lib/cost-report-lines';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/cost-control?project_id=…
 *
 * The REAL cost report, computed live and tenant-scoped:
 *   • Budget    ← budget_lines.original_budget / approved_changes  (per cost_code)
 *   • Committed ← Σ purchase_orders.total (fallback subtotal)       (per cost_code)
 *                 — the bid-award route writes draft subcontract POs as committed cost
 *   • Actual    ← Σ invoices.amount (fallback total) for approved/paid invoices (per cost_code)
 *
 * All DB money is DOLLARS; this route converts to INTEGER CENTS so the response
 * feeds the shared lib/finance engine directly (same numbers as iOS).
 * Also returns per-cost-code overrides from the most recent saved cost_report.
 */

const dollarsToCents = (v: unknown) => Math.round((Number(v) || 0) * 100);
const codeOf = (c: unknown) => (typeof c === 'string' ? c.trim() : '') || 'Unassigned';

// A PO is a commitment unless it was killed.
const DEAD_PO = new Set(['cancelled', 'canceled', 'void', 'voided', 'rejected', 'declined']);
// Invoices that represent real incurred cost.
const ACTUAL_INV = new Set(['approved', 'paid', 'partial', 'partially_paid', 'partially paid']);

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('project_id') || req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'project_id is required' }, { status: 400 });

  try {
    const db = createServerClient();

    // Tenant ownership check
    const { data: project, error: pErr } = await db
      .from('projects').select('id, name').eq('id', projectId).eq('tenant_id', user.tenantId).single();
    if (pErr || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [budgetRes, poRes, invRes, reportRes] = await Promise.all([
      db.from('budget_lines')
        .select('cost_code, description, original_budget, approved_changes')
        .eq('project_id', projectId).eq('tenant_id', user.tenantId),
      db.from('purchase_orders')
        .select('cost_code, total, subtotal, status')
        .eq('project_id', projectId).eq('tenant_id', user.tenantId),
      db.from('invoices')
        .select('cost_code, amount, total, status')
        .eq('project_id', projectId).eq('tenant_id', user.tenantId),
      db.from('cost_reports')
        .select('id, report_date, lines')
        .eq('project_id', projectId).eq('tenant_id', user.tenantId)
        .order('report_date', { ascending: false }).order('created_at', { ascending: false })
        .limit(1),
    ]);

    type Acc = { code: string; description: string; origCents: number; changeCents: number; committedCents: number; actualCents: number };
    const acc = new Map<string, Acc>();
    const get = (code: string): Acc => {
      let a = acc.get(code);
      if (!a) { a = { code, description: '', origCents: 0, changeCents: 0, committedCents: 0, actualCents: 0 }; acc.set(code, a); }
      return a;
    };

    // Budget (per cost code)
    for (const b of budgetRes.data ?? []) {
      const a = get(codeOf(b.cost_code));
      a.origCents += dollarsToCents(b.original_budget);
      a.changeCents += dollarsToCents(b.approved_changes);
      if (!a.description && b.description) a.description = String(b.description);
    }
    // Committed (per cost code) — Σ PO total, fallback subtotal
    for (const p of poRes.data ?? []) {
      if (DEAD_PO.has(String(p.status ?? '').toLowerCase())) continue;
      const a = get(codeOf(p.cost_code));
      a.committedCents += dollarsToCents(p.total ?? p.subtotal);
    }
    // Actual (per cost code) — Σ approved/paid invoice amount, fallback total
    for (const inv of invRes.data ?? []) {
      if (!ACTUAL_INV.has(String(inv.status ?? '').toLowerCase())) continue;
      const a = get(codeOf(inv.cost_code));
      a.actualCents += dollarsToCents(inv.amount ?? inv.total);
    }

    // Persisted manual overrides from the latest saved report (keyed by cost code)
    const latest = reportRes.data?.[0];
    const overrides = savedOverrides(latest?.lines);
    /* Lines the user ADDED by hand ("Add Cost Code") on the latest saved report.
       They exist nowhere but that report — no budget line, PO or invoice — so
       the live rebuild above never produced them: you saved a report with your
       new code in it, reloaded, and the code was gone. They are carried
       forward from the report until a later save leaves them out. */
    const manual: Acc[] = manualLinesFromReport(latest?.lines, new Set(acc.keys()));

    const manualCodes = new Set(manual.map((m) => m.code));
    const lines = [...acc.values(), ...manual]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((a) => ({
        costCode: a.code,
        description: a.description || a.code,
        originalBudgetCents: a.origCents,
        approvedChangesCents: a.changeCents,
        committedCents: a.committedCents,
        actualCents: a.actualCents,
        /* true = added by hand on a saved report, not from budget/POs/invoices */
        manual: manualCodes.has(a.code),
      }));

    // Server-side computed report (single source of truth = lib/finance), applying overrides
    const costLines: CostLine[] = lines.map((l) => ({
      id: l.costCode,
      costCode: l.costCode,
      description: l.description,
      originalBudgetCents: l.originalBudgetCents,
      approvedChangesCents: l.approvedChangesCents,
      committedCents: overrides[l.costCode]?.committedCents ?? l.committedCents,
      actualCents: overrides[l.costCode]?.actualCents ?? l.actualCents,
    }));
    const report = costControl(costLines);

    return NextResponse.json({
      projectId,
      projectName: project.name,
      lines,
      overrides,
      latestReportDate: latest?.report_date ?? null,
      totals: {
        revisedBudgetCents: report.revisedBudgetCents,
        committedCents: report.committedCents,
        actualCents: report.actualCents,
        projectedFinalCents: report.projectedFinalCents,
        varianceCents: report.varianceCents,
      },
      sources: {
        budget: 'budget_lines.original_budget + approved_changes',
        committed: 'purchase_orders.total (fallback subtotal), excl. cancelled/void/rejected',
        actual: 'invoices.amount (fallback total) where status in approved/paid/partial',
      },
    });
  } catch (err) {
    return apiError('cost-control/GET', err, "Couldn't load the cost report");
  }
}
