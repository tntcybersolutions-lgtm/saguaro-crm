import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import {
  earnedValue, scheduleProgress, verdict,
  type BudgetLine, type ScheduleTask,
} from '@/lib/earned-value';

export const dynamic = 'force-dynamic';

/**
 * GET /api/intelligence/performance
 *
 * Cost and schedule performance per project, and rolled up for the portfolio.
 *
 * The existing /api/intelligence/summary answers "what has happened" — margin
 * to date, open RFIs, open punch. This answers "where is this going", which is
 * the question that still has time to change the outcome.
 *
 * Progress is read from the schedule and cost from the budget ledger, on
 * purpose. Deriving one from the other is what makes a dashboard that can never
 * report bad news — see lib/earned-value.ts.
 *
 * Query params:
 *   projectIds  — comma-separated; defaults to all active projects
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Reports', 'View');
  if (!g.ok) return g.res;
  const { user, db } = g;

  try {
    const wanted = (req.nextUrl.searchParams.get('projectIds') || '')
      .split(',').map((s) => s.trim()).filter(Boolean);

    let projQuery = db
      .from('projects')
      .select('id, name, status, contract_amount, start_date, end_date')
      .eq('tenant_id', user.tenantId);
    if (wanted.length) projQuery = projQuery.in('id', wanted);

    const { data: projRows, error: projErr } = await projQuery;
    if (projErr) throw projErr;

    const projects = (projRows || []) as Record<string, unknown>[];
    const ids = projects.map((p) => String(p.id));

    if (ids.length === 0) {
      return NextResponse.json({
        projects: [],
        portfolio: null,
        meta: { projectCount: 0, generatedAt: new Date().toISOString() },
      });
    }

    const [budgetRes, taskRes] = await Promise.all([
      db.from('budget_line_items')
        .select('project_id, cost_code, csi_division, csi_description, original_budget, approved_changes, current_budget, committed_cost, cost_to_date, estimated_final_cost')
        .eq('tenant_id', user.tenantId)
        .in('project_id', ids),
      db.from('schedule_tasks')
        .select('project_id, name, start_date, end_date, pct_complete, duration, total_float, is_critical, status')
        .eq('tenant_id', user.tenantId)
        .in('project_id', ids),
    ]);

    if (budgetRes.error) throw budgetRes.error;
    if (taskRes.error) throw taskRes.error;

    const byProject = <T extends { project_id?: unknown }>(rows: T[] | null) => {
      const m = new Map<string, T[]>();
      for (const r of rows || []) {
        const pid = String(r.project_id ?? '');
        if (!pid) continue;
        const arr = m.get(pid);
        if (arr) arr.push(r); else m.set(pid, [r]);
      }
      return m;
    };

    const budgetsBy = byProject(budgetRes.data as (BudgetLine & { project_id?: unknown })[]);
    const tasksBy = byProject(taskRes.data as (ScheduleTask & { project_id?: unknown })[]);
    const now = Date.now();

    const out = projects.map((p) => {
      const pid = String(p.id);
      const lines = budgetsBy.get(pid) || [];
      const tasks = tasksBy.get(pid) || [];

      const sched = scheduleProgress(tasks, now);
      const ev = earnedValue(lines, sched.actualPct, sched.plannedPct);
      const v = verdict(ev, sched);

      /* The worst cost codes by variance are the actionable half of this — a
         portfolio number tells a PM there is a problem, this tells them where
         to go and look. */
      const worstCodes = lines
        .map((l) => {
          const budget = Number(l.current_budget) || 0;
          const spent = Number(l.cost_to_date) || 0;
          const forecast = Number(l.estimated_final_cost) || budget;
          return {
            code: String(l.cost_code || l.csi_division || '—'),
            description: String(l.csi_description || ''),
            budget: Math.round(budget),
            spent: Math.round(spent),
            forecast: Math.round(forecast),
            variance: Math.round(budget - forecast),
          };
        })
        .filter((c) => c.variance < 0)
        .sort((a, b) => a.variance - b.variance)
        .slice(0, 5);

      return {
        id: pid,
        name: String(p.name ?? 'Untitled'),
        status: p.status ?? null,
        contract: Number(p.contract_amount) || 0,
        budgetLines: lines.length,
        scheduleTasks: tasks.length,
        schedule: sched,
        ev,
        verdict: v,
        worstCodes,
      };
    });

    /* Portfolio EVM is summed from dollars, never averaged from indices — the
       mean of two CPIs is not the CPI of the two jobs, and a $2M job in trouble
       must not be cancelled out by a $50k job running clean. */
    const agg = out.reduce(
      (a, p) => {
        a.bac += p.ev.bac; a.pv += p.ev.pv; a.ev += p.ev.ev;
        a.ac += p.ev.ac; a.committed += p.ev.committed; a.teamEac += p.ev.teamEac;
        return a;
      },
      { bac: 0, pv: 0, ev: 0, ac: 0, committed: 0, teamEac: 0 },
    );

    const pCpi = agg.ac > 0 ? Math.round((agg.ev / agg.ac) * 1000) / 1000 : null;
    const pSpi = agg.pv > 0 ? Math.round((agg.ev / agg.pv) * 1000) / 1000 : null;
    const pEac = pCpi && pCpi > 0 ? Math.round((agg.bac / pCpi) * 100) / 100 : null;

    const portfolio = {
      ...agg,
      cv: Math.round((agg.ev - agg.ac) * 100) / 100,
      sv: Math.round((agg.ev - agg.pv) * 100) / 100,
      cpi: pCpi,
      spi: pSpi,
      eac: pEac,
      vac: pEac != null ? Math.round((agg.bac - pEac) * 100) / 100 : null,
      atRisk: out.filter((p) => p.verdict.health === 'critical').length,
      watch: out.filter((p) => p.verdict.health === 'watch').length,
      healthy: out.filter((p) => p.verdict.health === 'good').length,
    };

    return NextResponse.json({
      projects: out.sort((a, b) => (a.ev.vac ?? 0) - (b.ev.vac ?? 0)),
      portfolio,
      meta: { projectCount: out.length, generatedAt: new Date().toISOString() },
    });
  } catch (e) {
    return apiError('intelligence_performance', e);
  }
}
