import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import {
  capacityByTrade, levellingMoves, utilisation, costCurve, weekStart, parseDay,
  type CapTask, type CapEmployee, type CapTimeEntry,
} from '@/lib/capacity';
import { earnedValue, scheduleProgress, type BudgetLine, type ScheduleTask } from '@/lib/earned-value';

export const dynamic = 'force-dynamic';

/**
 * GET /api/intelligence/capacity
 *
 * Crew capacity, resource levelling, actual utilisation and the cost S-curve.
 *
 * The companion to /api/intelligence/performance: that route says whether the
 * money is buying the progress, this one says whether the people exist to
 * deliver the plan at all. Between them they cover the three things every
 * enterprise PM tool in the market is reviewed as missing.
 *
 * Query params:
 *   projectIds     — comma-separated; defaults to every project
 *   horizonWeeks   — how far forward to look (default 16, max 52)
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Reports', 'View');
  if (!g.ok) return g.res;
  const { user, db } = g;

  try {
    const sp = req.nextUrl.searchParams;
    const wanted = (sp.get('projectIds') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const horizonWeeks = Math.min(Math.max(Number(sp.get('horizonWeeks')) || 16, 1), 52);

    let projQuery = db.from('projects').select('id, name').eq('tenant_id', user.tenantId);
    if (wanted.length) projQuery = projQuery.in('id', wanted);
    const { data: projRows, error: projErr } = await projQuery;
    if (projErr) throw projErr;

    const projects = (projRows || []) as { id: string; name: string | null }[];
    const ids = projects.map((p) => String(p.id));

    if (ids.length === 0) {
      return NextResponse.json({
        capacity: [], levelling: [], utilisation: [], curve: [],
        crew: { headcount: 0, trades: 0 },
        meta: { projectCount: 0, horizonWeeks, generatedAt: new Date().toISOString() },
      });
    }

    const [taskRes, empRes, timeRes, budgetRes] = await Promise.all([
      db.from('schedule_tasks')
        .select('id, project_id, name, trade, start_date, end_date, duration, pct_complete, total_float, is_critical, status')
        .eq('tenant_id', user.tenantId).in('project_id', ids),
      db.from('employees')
        .select('id, full_name, trade, is_active, employment_type, regular_rate')
        .eq('tenant_id', user.tenantId),
      db.from('time_entries')
        .select('employee_id, work_date, total_hours, regular_hours, overtime_hours, labor_cost, total_cost, trade')
        .eq('tenant_id', user.tenantId).in('project_id', ids),
      db.from('budget_line_items')
        .select('current_budget, original_budget, approved_changes, committed_cost, cost_to_date, estimated_final_cost')
        .eq('tenant_id', user.tenantId).in('project_id', ids),
    ]);

    for (const r of [taskRes, empRes, timeRes, budgetRes]) if (r.error) throw r.error;

    const tasks = (taskRes.data || []) as CapTask[];
    const employees = (empRes.data || []) as CapEmployee[];
    const entries = (timeRes.data || []) as CapTimeEntry[];
    const lines = (budgetRes.data || []) as BudgetLine[];

    const now = Date.now();
    const capacity = capacityByTrade(tasks, employees, { from: now, horizonWeeks });
    const levelling = levellingMoves(tasks, capacity);
    const { rows: util, suspect } = utilisation(entries, employees);

    /* The S-curve's actual line is dated LABOUR cost from time entries.
       budget_line_items.cost_to_date is the fuller number but carries no date,
       so it cannot be time-phased — the response says which is which rather
       than quietly mixing them. */
    const actualsByWeek = new Map<string, number>();
    for (const t of entries) {
      const d = parseDay(t.work_date ?? null);
      if (d == null) continue;
      const w = weekStart(d);
      const c = Number(t.labor_cost) || Number(t.total_cost) || 0;
      actualsByWeek.set(w, (actualsByWeek.get(w) ?? 0) + c);
    }

    const sched = scheduleProgress(tasks as ScheduleTask[], now);
    const ev = earnedValue(lines, sched.actualPct, sched.plannedPct);
    const curve = costCurve(tasks, ev.bac, actualsByWeek, ev.eac, now);

    const overloadedTrades = capacity.filter((c) => c.overWeeks > 0);
    const noCrew = capacity.filter((c) => c.supply === 0 && c.peakDemand > 0);

    return NextResponse.json({
      capacity,
      levelling,
      utilisation: util.slice(0, 25),
      suspectEntries: suspect,
      curve,
      curveBasis: {
        plannedFrom: 'budget_line_items.current_budget spread across schedule dates',
        actualFrom: 'time_entries labour cost (the only dated cost source)',
        forecastFrom: ev.eac == null ? null : 'BAC / CPI, spread on the planned shape',
      },
      crew: {
        headcount: employees.filter((e) => e.is_active !== false).length,
        trades: new Set(employees.filter((e) => e.is_active !== false).map((e) => String(e.trade ?? 'unassigned').toLowerCase())).size,
        overloadedTrades: overloadedTrades.length,
        tradesWithNoCrew: noCrew.map((c) => c.label),
        overtimeHours: Math.round(util.reduce((s, u) => s + u.overtimeHours, 0)),
        suspectEntries: suspect.length,
      },
      meta: {
        projectCount: ids.length,
        taskCount: tasks.length,
        horizonWeeks,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    return apiError('intelligence_capacity', e);
  }
}
