import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { weekStart, parseDay } from '@/lib/capacity';

export const dynamic = 'force-dynamic';

/**
 * GET /api/intelligence/cost-code?projectId=…&division=03
 *
 * Everything behind one number on the variance table.
 *
 * "Concrete is $20k over" is where every other tool stops. It is also the point
 * at which a PM has to leave the dashboard, open three screens and reconstruct
 * why. This returns the budget line, the labour booked against that division
 * week by week, the schedule tasks in that trade, and the change orders that
 * moved the budget — so the follow-up question is answered on the same screen
 * as the finding.
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Reports', 'View');
  if (!g.ok) return g.res;
  const { user, db } = g;

  try {
    const sp = req.nextUrl.searchParams;
    const projectId = (sp.get('projectId') || '').trim();
    const division = (sp.get('division') || '').trim();
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    if (!division) return NextResponse.json({ error: 'division is required' }, { status: 400 });

    const [lineRes, timeRes, taskRes, coRes] = await Promise.all([
      db.from('budget_line_items')
        .select('id, cost_code, csi_division, csi_description, original_budget, approved_changes, current_budget, committed_cost, uncommitted_cost, cost_to_date, estimated_final_cost, variance, variance_pct, notes')
        .eq('tenant_id', user.tenantId).eq('project_id', projectId).eq('csi_division', division)
        .maybeSingle(),
      db.from('time_entries')
        .select('work_date, regular_hours, overtime_hours, total_hours, labor_cost, total_cost, work_description, employee_id')
        .eq('tenant_id', user.tenantId).eq('project_id', projectId).eq('csi_division', division)
        .order('work_date', { ascending: false })
        .limit(2000),
      db.from('schedule_tasks')
        .select('id, name, trade, start_date, end_date, pct_complete, total_float, is_critical, status')
        .eq('tenant_id', user.tenantId).eq('project_id', projectId),
      db.from('change_orders')
        .select('id, co_number, title, amount, status, created_at')
        .eq('tenant_id', user.tenantId).eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    for (const r of [lineRes, timeRes, taskRes, coRes]) if (r.error) throw r.error;

    const line = (lineRes.data || null) as Record<string, unknown> | null;
    if (!line) return NextResponse.json({ error: 'No budget line for that division' }, { status: 404 });

    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const entries = (timeRes.data || []) as Record<string, unknown>[];

    /* Labour booked against this division, by week. This is the only dated cost
       we hold, so it is the only thing that can answer "when did it go wrong"
       rather than just "it went wrong". */
    const byWeek = new Map<string, { cost: number; hours: number; ot: number; entries: number }>();
    for (const t of entries) {
      const d = parseDay(String(t.work_date ?? ''));
      if (d == null) continue;
      const w = weekStart(d);
      const cur = byWeek.get(w) ?? { cost: 0, hours: 0, ot: 0, entries: 0 };
      cur.cost += num(t.labor_cost) || num(t.total_cost);
      cur.hours += num(t.total_hours) || num(t.regular_hours) + num(t.overtime_hours);
      cur.ot += num(t.overtime_hours);
      cur.entries += 1;
      byWeek.set(w, cur);
    }
    const weeks = [...byWeek.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, v]) => ({
        week,
        cost: Math.round(v.cost),
        hours: Math.round(v.hours * 10) / 10,
        overtimeHours: Math.round(v.ot * 10) / 10,
        entries: v.entries,
      }));

    const labourTotal = weeks.reduce((s, w) => s + w.cost, 0);
    const hoursTotal = weeks.reduce((s, w) => s + w.hours, 0);
    const otTotal = weeks.reduce((s, w) => s + w.overtimeHours, 0);

    /* Which trade owns this division, so the schedule half is relevant rather
       than the whole programme. */
    const TRADE_FOR_DIVISION: Record<string, RegExp> = {
      '01': /general|supervis|contractor|laborer/i,
      '03': /concrete|formwork|flatwork/i,
      '05': /steel|structur|metal|erect/i,
      '07': /roof|thermal|moisture|insulat|waterproof/i,
      '08': /door|window|glaz|opening|curtain/i,
      '09': /finish|drywall|paint|floor|ceiling/i,
      '22': /plumb|pipe/i,
      '23': /hvac|mechanical|sheet ?metal/i,
      '26': /electric|low.?voltage|power/i,
      '31': /earth|excavat|grad|site|equipment/i,
      '32': /exterior|landscap|paving|site improve/i,
      '33': /utilit|underground|storm|sewer/i,
    };
    const re = TRADE_FOR_DIVISION[division];
    const allTasks = (taskRes.data || []) as Record<string, unknown>[];
    const tasks = (re ? allTasks.filter((t) => re.test(String(t.trade ?? '') + ' ' + String(t.name ?? ''))) : allTasks)
      .map((t) => ({
        id: String(t.id),
        name: String(t.name ?? 'Untitled'),
        trade: t.trade ?? null,
        startDate: t.start_date ?? null,
        endDate: t.end_date ?? null,
        pctComplete: num(t.pct_complete),
        totalFloat: num(t.total_float),
        isCritical: t.is_critical === true,
        status: t.status ?? null,
      }));

    const budget = num(line.current_budget);
    const spent = num(line.cost_to_date);
    const forecast = num(line.estimated_final_cost);
    const committed = num(line.committed_cost);

    /* Weighted progress for THIS division's tasks, so the line gets its own
       CPI rather than inheriting the project's. */
    let wsum = 0, psum = 0;
    for (const t of tasks) {
      const s = parseDay(t.startDate as string | null);
      const e = parseDay(t.endDate as string | null);
      const w = s != null && e != null && e > s ? Math.max(1, Math.round((e - s) / 86400000)) : 1;
      wsum += w;
      psum += Math.max(0, Math.min(100, t.pctComplete)) * w;
    }
    const pct = wsum > 0 ? psum / wsum : 0;
    const ev = Math.round(budget * (pct / 100));
    const cpi = spent > 0 ? Math.round((ev / spent) * 1000) / 1000 : null;

    const approvedCos = (coRes.data || []).filter((c) => /approv/i.test(String((c as Record<string, unknown>).status ?? '')));

    return NextResponse.json({
      line: {
        division,
        description: line.csi_description ?? null,
        costCode: line.cost_code ?? null,
        originalBudget: num(line.original_budget),
        approvedChanges: num(line.approved_changes),
        currentBudget: budget,
        committed,
        uncommitted: num(line.uncommitted_cost),
        spent,
        forecast,
        variance: num(line.variance),
        variancePct: num(line.variance_pct),
        percentSpent: budget > 0 ? Math.round((spent / budget) * 1000) / 10 : null,
        percentComplete: Math.round(pct * 10) / 10,
        ev,
        cpi,
      },
      labour: {
        weeks,
        total: Math.round(labourTotal),
        hours: Math.round(hoursTotal * 10) / 10,
        overtimeHours: Math.round(otTotal * 10) / 10,
        /* Labour is one slice of the line; naming its share stops anyone
           reading the weekly chart as if it were the whole cost. */
        shareOfSpend: spent > 0 ? Math.round((labourTotal / spent) * 1000) / 10 : null,
      },
      tasks: tasks.sort((a, b) => a.pctComplete - b.pctComplete).slice(0, 20),
      changeOrders: approvedCos.map((c) => {
        const o = c as Record<string, unknown>;
        return {
          id: String(o.id),
          number: o.co_number ?? null,
          title: o.title ?? null,
          amount: num(o.amount),
          createdAt: o.created_at ?? null,
        };
      }).slice(0, 10),
      meta: { projectId, division, generatedAt: new Date().toISOString() },
    });
  } catch (e) {
    return apiError('intelligence_cost_code', e);
  }
}
