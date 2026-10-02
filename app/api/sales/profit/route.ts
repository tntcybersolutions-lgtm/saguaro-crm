import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { costControl, type CostLine } from '@/lib/finance';
import { isClosedStatus } from '@/lib/project-lifecycle';

/**
 * GET /api/sales/profit — booked profit across the tenant's active jobs.
 *
 * Revenue is the contract value. Cost is the SAME honest forecast the Cost
 * Control screen shows — lib/finance costControl's projectedFinalCents (the
 * worst of revised budget / committed / actual, per cost code) — so a rep and a
 * PM never see two different margins for one job. Margin = revenue − projected
 * cost; percent is of revenue.
 *
 * Only jobs that actually carry cost data (a budget line, a PO, or an invoice)
 * get a margin — a job with none would otherwise read as 100% profit, which is
 * a lie, so it is returned with hasCostData:false and left out of the margin %
 * average. All money is integer cents end to end, matching iOS and the finance
 * engine.
 */
const dollarsToCents = (v: unknown) => Math.round((Number(v) || 0) * 100);
const codeOf = (c: unknown) => (typeof c === 'string' ? c.trim() : '') || 'Unassigned';
const DEAD_PO = new Set(['cancelled', 'canceled', 'void', 'voided', 'rejected', 'declined']);
const ACTUAL_INV = new Set(['approved', 'paid', 'partial', 'partially_paid', 'partially paid']);

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const t = user.tenantId;

    const [projRes, budgetRes, poRes, invRes] = await Promise.all([
      db.from('projects').select('id, name, status, contract_value').eq('tenant_id', t),
      db.from('budget_lines').select('project_id, cost_code, original_budget, approved_changes').eq('tenant_id', t),
      db.from('purchase_orders').select('project_id, cost_code, total, subtotal, status').eq('tenant_id', t),
      db.from('invoices').select('project_id, cost_code, amount, total, status').eq('tenant_id', t),
    ]);
    if (projRes.error) throw projRes.error;

    // Only active (not closed/cancelled/complete) jobs are "booked" work.
    const projects = (projRes.data ?? []).filter((p) => !isClosedStatus(p.status));
    const keep = new Set(projects.map((p) => String(p.id)));

    // Group each cost input by project, then by cost code, into CostLine[].
    type Acc = { origCents: number; changeCents: number; committedCents: number; actualCents: number };
    const perProject = new Map<string, Map<string, Acc>>();
    const touched = new Set<string>(); // projects that carry ANY cost data
    const line = (pid: string, code: string): Acc => {
      let codes = perProject.get(pid);
      if (!codes) { codes = new Map(); perProject.set(pid, codes); }
      let a = codes.get(code);
      if (!a) { a = { origCents: 0, changeCents: 0, committedCents: 0, actualCents: 0 }; codes.set(code, a); }
      return a;
    };

    for (const b of budgetRes.data ?? []) {
      const pid = String(b.project_id); if (!keep.has(pid)) continue;
      const a = line(pid, codeOf(b.cost_code));
      a.origCents += dollarsToCents(b.original_budget);
      a.changeCents += dollarsToCents(b.approved_changes);
      touched.add(pid);
    }
    for (const p of poRes.data ?? []) {
      const pid = String(p.project_id); if (!keep.has(pid)) continue;
      if (DEAD_PO.has(String(p.status ?? '').toLowerCase())) continue;
      line(pid, codeOf(p.cost_code)).committedCents += dollarsToCents(p.total ?? p.subtotal);
      touched.add(pid);
    }
    for (const inv of invRes.data ?? []) {
      const pid = String(inv.project_id); if (!keep.has(pid)) continue;
      if (!ACTUAL_INV.has(String(inv.status ?? '').toLowerCase())) continue;
      line(pid, codeOf(inv.cost_code)).actualCents += dollarsToCents(inv.amount ?? inv.total);
      touched.add(pid);
    }

    const jobs = projects.map((p) => {
      const pid = String(p.id);
      const revenueCents = dollarsToCents(p.contract_value);
      const hasCostData = touched.has(pid);
      const codes = perProject.get(pid);
      let costCents = 0;
      if (codes) {
        const costLines: CostLine[] = [...codes.entries()].map(([code, a]) => ({
          id: code, costCode: code, description: code,
          originalBudgetCents: a.origCents, approvedChangesCents: a.changeCents,
          committedCents: a.committedCents, actualCents: a.actualCents,
        }));
        costCents = costControl(costLines).projectedFinalCents;
      }
      const marginCents = hasCostData ? revenueCents - costCents : null;
      const marginPct = hasCostData && revenueCents > 0 ? Math.round(((revenueCents - costCents) / revenueCents) * 1000) / 10 : null;
      return {
        projectId: pid, name: p.name, status: p.status,
        revenueCents, costCents: hasCostData ? costCents : null,
        marginCents, marginPct, hasCostData,
      };
    }).sort((a, b) => (b.marginCents ?? -Infinity) - (a.marginCents ?? -Infinity));

    const withCost = jobs.filter((j) => j.hasCostData);
    const totalRevenueCents = withCost.reduce((s, j) => s + j.revenueCents, 0);
    const totalCostCents = withCost.reduce((s, j) => s + (j.costCents ?? 0), 0);
    const totalMarginCents = totalRevenueCents - totalCostCents;

    return NextResponse.json({
      jobs,
      totals: {
        jobCount: jobs.length,
        costedJobCount: withCost.length,
        totalRevenueCents,
        totalCostCents,
        totalMarginCents,
        marginPct: totalRevenueCents > 0 ? Math.round((totalMarginCents / totalRevenueCents) * 1000) / 10 : null,
      },
      source: 'live',
    });
  } catch (e) {
    return apiError('sales/profit', e, 'Could not load profit tracking');
  }
}
