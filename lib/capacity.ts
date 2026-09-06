/**
 * lib/capacity.ts
 *
 * Crew capacity, over-allocation, resource levelling and the time-phased cost
 * curve — as pure functions over rows the caller supplies.
 *
 * This is the other half of what every enterprise PM tool gets marked down for.
 * ClickUp, Monday, Smartsheet, Asana and Teamwork are each reviewed with the
 * same sentence: no capacity planning, no resource levelling, no forecasting.
 * They will tell you a task is late. None of them tell you that the reason it
 * is late is that four framing crews were needed in the same week and you have
 * two.
 *
 * THE DEMAND MODEL, stated plainly so nobody mistakes it for more than it is:
 * schedule_tasks carries a trade and a date window but no crew-size column, so
 * demand is measured as CONCURRENCY — how many tasks of one trade are live in
 * the same week. "Week of 14 Apr: 4 electrical tasks running, 2 electricians on
 * the books" is a true and useful statement that needs no data you do not have.
 * When a crew-size column exists later, only `taskDemand` below has to change.
 */

export interface CapTask {
  id?: string | null;
  name?: string | null;
  trade?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  duration?: unknown;
  pct_complete?: unknown;
  total_float?: unknown;
  is_critical?: unknown;
  status?: string | null;
}

export interface CapEmployee {
  id?: string | null;
  full_name?: string | null;
  trade?: string | null;
  is_active?: unknown;
  employment_type?: string | null;
  regular_rate?: unknown;
}

export interface CapTimeEntry {
  employee_id?: string | null;
  work_date?: string | null;
  total_hours?: unknown;
  regular_hours?: unknown;
  overtime_hours?: unknown;
  labor_cost?: unknown;
  total_cost?: unknown;
  trade?: string | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;
const DAY = 86400000;
/** A standard week of one worker. Overtime shows up as utilisation above 100%. */
export const WEEKLY_HOURS = 40;

/** Parse a DB date at UTC noon so a timezone can never shift the day. */
export function parseDay(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s).trim());
  if (!m) {
    const t = Date.parse(String(s));
    return Number.isFinite(t) ? t : null;
  }
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

/** Monday of the week containing `ms`, as an ISO date string. */
export function weekStart(ms: number): string {
  const d = new Date(ms);
  const dow = d.getUTCDay();            // 0=Sun
  const back = dow === 0 ? 6 : dow - 1; // Monday-based
  const mon = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back, 12);
  return new Date(mon).toISOString().slice(0, 10);
}

/** Every Monday from `from` through `to`, inclusive. Bounded so a bad date cannot hang a request. */
export function weeksBetween(from: number, to: number, cap = 260): string[] {
  const out: string[] = [];
  let cur = parseDay(weekStart(from))!;
  const end = parseDay(weekStart(to))!;
  while (cur <= end && out.length < cap) {
    out.push(new Date(cur).toISOString().slice(0, 10));
    cur += 7 * DAY;
  }
  return out;
}

/** Normalise a trade label. Unset trades collapse to one bucket rather than vanishing. */
export const tradeKey = (t: string | null | undefined): string => {
  const s = String(t ?? '').trim();
  return s ? s.toLowerCase() : 'unassigned';
};

const titleCase = (s: string) =>
  s === 'unassigned' ? 'Unassigned' : s.replace(/\b\w/g, (c) => c.toUpperCase());

export interface WeekLoad {
  week: string;
  demand: number;   // concurrent tasks of this trade
  supply: number;   // active employees of this trade
  overBy: number;   // demand - supply, floored at 0
  tasks: string[];  // what is driving it
}

export interface TradeCapacity {
  trade: string;
  label: string;
  supply: number;
  peakDemand: number;
  overWeeks: number;
  worstWeek: WeekLoad | null;
  weeks: WeekLoad[];
}

/**
 * Week-by-week demand against crew supply, per trade.
 *
 * Only tasks that are not finished count: a task at 100% is not competing for
 * anybody's time, and counting it inflates every historical week into a false
 * red.
 */
export function capacityByTrade(
  tasks: CapTask[],
  employees: CapEmployee[],
  opts: { from?: number; to?: number; horizonWeeks?: number } = {},
): TradeCapacity[] {
  const live = tasks.filter((t) => {
    const pct = num(t.pct_complete);
    const status = String(t.status ?? '').toLowerCase();
    return pct < 100 && status !== 'complete' && status !== 'completed' && status !== 'cancelled';
  });

  const supply = new Map<string, number>();
  for (const e of employees) {
    const active = e.is_active === undefined || e.is_active === null ? true : Boolean(e.is_active);
    if (!active) continue;
    const k = tradeKey(e.trade);
    supply.set(k, (supply.get(k) ?? 0) + 1);
  }

  const now = opts.from ?? Date.now();
  const horizon = opts.to ?? now + (opts.horizonWeeks ?? 16) * 7 * DAY;

  /* trade -> week -> task names */
  const grid = new Map<string, Map<string, string[]>>();
  const trades = new Set<string>([...supply.keys()]);

  for (const t of live) {
    const s = parseDay(t.start_date);
    const e = parseDay(t.end_date) ?? (s != null ? s + Math.max(1, num(t.duration)) * DAY : null);
    if (s == null || e == null) continue;

    /* Clip to the window we are reporting on — a task that ran last year is not
       competing for next month's crew. */
    const from = Math.max(s, now);
    const to = Math.min(e, horizon);
    if (to < from) continue;

    const k = tradeKey(t.trade);
    trades.add(k);
    const byWeek = grid.get(k) ?? new Map<string, string[]>();
    for (const w of weeksBetween(from, to)) {
      const arr = byWeek.get(w) ?? [];
      arr.push(String(t.name || 'Untitled task'));
      byWeek.set(w, arr);
    }
    grid.set(k, byWeek);
  }

  const allWeeks = weeksBetween(now, horizon);

  const out: TradeCapacity[] = [];
  for (const k of trades) {
    const byWeek = grid.get(k) ?? new Map<string, string[]>();
    const sup = supply.get(k) ?? 0;
    const weeks: WeekLoad[] = allWeeks.map((w) => {
      const names = byWeek.get(w) ?? [];
      return { week: w, demand: names.length, supply: sup, overBy: Math.max(0, names.length - sup), tasks: names.slice(0, 6) };
    });
    const peakDemand = weeks.reduce((m, w) => Math.max(m, w.demand), 0);
    const over = weeks.filter((w) => w.overBy > 0);
    /* A trade with neither people nor work is noise on the page. */
    if (peakDemand === 0 && sup === 0) continue;
    out.push({
      trade: k,
      label: titleCase(k),
      supply: sup,
      peakDemand,
      overWeeks: over.length,
      worstWeek: over.sort((a, b) => b.overBy - a.overBy)[0] ?? null,
      weeks,
    });
  }

  /* Worst problems first: most overloaded weeks, then biggest single overload. */
  return out.sort((a, b) =>
    b.overWeeks - a.overWeeks ||
    (b.worstWeek?.overBy ?? 0) - (a.worstWeek?.overBy ?? 0) ||
    a.label.localeCompare(b.label));
}

export interface LevellingMove {
  taskName: string;
  trade: string;
  week: string;
  floatDays: number;
  overBy: number;
  suggestion: string;
}

/**
 * Resource levelling: which tasks can move, and what moving them buys.
 *
 * Only tasks with positive total float are offered. Suggesting that a critical
 * task slide is not levelling, it is moving the completion date — and a tool
 * that quietly proposes that is worse than one that proposes nothing.
 */
export function levellingMoves(tasks: CapTask[], caps: TradeCapacity[]): LevellingMove[] {
  const moves: LevellingMove[] = [];

  for (const cap of caps) {
    for (const w of cap.weeks) {
      if (w.overBy <= 0) continue;
      const candidates = tasks.filter((t) => {
        if (tradeKey(t.trade) !== cap.trade) return false;
        if (t.is_critical === true || t.is_critical === 'true') return false;
        if (num(t.total_float) <= 0) return false;
        if (!w.tasks.includes(String(t.name || 'Untitled task'))) return false;
        return true;
      });
      for (const c of candidates) {
        const f = num(c.total_float);
        moves.push({
          taskName: String(c.name || 'Untitled task'),
          trade: cap.label,
          week: w.week,
          floatDays: f,
          overBy: w.overBy,
          suggestion: `Has ${f} day${f === 1 ? '' : 's'} of float — shifting it clears ${w.overBy > 1 ? 'one of the' : 'the'} ${cap.label.toLowerCase()} overload in the week of ${w.week}.`,
        });
      }
    }
  }

  /* One suggestion per task: the earliest week it helps. */
  const seen = new Set<string>();
  return moves
    .sort((a, b) => a.week.localeCompare(b.week) || b.floatDays - a.floatDays)
    .filter((m) => (seen.has(m.taskName) ? false : (seen.add(m.taskName), true)))
    .slice(0, 12);
}

export interface UtilRow {
  employeeId: string;
  name: string;
  trade: string;
  weeks: { week: string; hours: number; utilisation: number }[];
  avgUtilisation: number;
  overtimeHours: number;
  totalHours: number;
  cost: number;
}

export interface SuspectEntry {
  employeeId: string;
  name: string;
  workDate: string;
  hours: number;
  reason: string;
}

export interface UtilResult {
  rows: UtilRow[];
  suspect: SuspectEntry[];
}

/**
 * The longest a single time entry can plausibly represent.
 *
 * Live data has entries where somebody clocked in on 19 June and out on 27
 * July — one row carrying 912 hours. Averaged in, a single runaway shift
 * reports a crew at 2,400% utilisation and drowns the three people who are
 * genuinely on real overtime. These are quarantined and reported separately:
 * an un-closed shift is a time-clock defect to go and fix, not a workload
 * signal to plan around.
 */
export const MAX_PLAUSIBLE_ENTRY_HOURS = 16;

/**
 * Actual utilisation from booked time — the reality check on the plan above.
 *
 * Sustained utilisation over 100% is not a productivity win, it is overtime
 * being spent, and it belongs next to the capacity forecast that predicted it.
 */
export function utilisation(entries: CapTimeEntry[], employees: CapEmployee[]): UtilResult {
  const byId = new Map<string, CapEmployee>();
  for (const e of employees) if (e.id) byId.set(String(e.id), e);

  const suspect: SuspectEntry[] = [];
  const acc = new Map<string, Map<string, { hours: number; ot: number; cost: number }>>();
  for (const t of entries) {
    const id = String(t.employee_id ?? '');
    if (!id) continue;
    const d = parseDay(t.work_date);
    if (d == null) continue;
    const w = weekStart(d);
    const hours = num(t.total_hours) || num(t.regular_hours) + num(t.overtime_hours);
    const cost = num(t.labor_cost) || num(t.total_cost);

    if (hours > MAX_PLAUSIBLE_ENTRY_HOURS) {
      suspect.push({
        employeeId: id,
        name: String(byId.get(id)?.full_name || 'Unknown'),
        workDate: String(t.work_date ?? ''),
        hours: round2(hours),
        reason: `${round2(hours)} hours on one entry — a shift that was never clocked out.`,
      });
      continue;
    }

    const m = acc.get(id) ?? new Map();
    const cur = m.get(w) ?? { hours: 0, ot: 0, cost: 0 };
    cur.hours += hours;
    cur.ot += num(t.overtime_hours);
    cur.cost += cost;
    m.set(w, cur);
    acc.set(id, m);
  }

  const rows: UtilRow[] = [];
  for (const [id, m] of acc) {
    const emp = byId.get(id);
    const weeks = [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, v]) => ({
        week,
        hours: round2(v.hours),
        utilisation: round2((v.hours / WEEKLY_HOURS) * 100),
      }));
    const totalHours = weeks.reduce((s, w) => s + w.hours, 0);
    rows.push({
      employeeId: id,
      name: String(emp?.full_name || 'Unknown'),
      trade: titleCase(tradeKey(emp?.trade)),
      weeks,
      avgUtilisation: weeks.length ? round2(weeks.reduce((s, w) => s + w.utilisation, 0) / weeks.length) : 0,
      overtimeHours: round2([...m.values()].reduce((s, v) => s + v.ot, 0)),
      totalHours: round2(totalHours),
      cost: round2([...m.values()].reduce((s, v) => s + v.cost, 0)),
    });
  }

  return {
    rows: rows.sort((a, b) => b.avgUtilisation - a.avgUtilisation),
    suspect: suspect.sort((a, b) => b.hours - a.hours).slice(0, 20),
  };
}

export interface CurvePoint {
  week: string;
  plannedCum: number;   // PV to date
  actualCum: number | null; // AC to date — null once past today, so the line stops
  forecastCum: number | null; // EAC-projected spend, drawn from today forward
}

/**
 * The S-curve: planned spend, actual spend and the projected finish.
 *
 * Buildern's forecasting reports name cost categories trending off-track. This
 * is the shape behind that — where the money was meant to go, where it actually
 * went, and where the current efficiency lands it. The actual line deliberately
 * STOPS at today rather than running flat to the end; a chart that draws actuals
 * into the future is drawing a guess in the same ink as a fact.
 */
export function costCurve(
  tasks: CapTask[],
  bac: number,
  actualsByWeek: Map<string, number>,
  eac: number | null,
  asOf = Date.now(),
): CurvePoint[] {
  const starts = tasks.map((t) => parseDay(t.start_date)).filter((n): n is number => n != null);
  const ends = tasks.map((t) => parseDay(t.end_date)).filter((n): n is number => n != null);
  if (starts.length === 0 || ends.length === 0 || bac <= 0) return [];

  const first = Math.min(...starts);
  const last = Math.max(...ends);
  if (last <= first) return [];

  const weeks = weeksBetween(first, last);
  if (weeks.length === 0) return [];

  const thisWeek = weekStart(asOf);

  /* Planned value is spread by task-days live in each week, so the curve takes
     the S shape real jobs have rather than the straight line an even spread
     would draw. */
  const weight = new Map<string, number>();
  let totalWeight = 0;
  for (const t of tasks) {
    const s = parseDay(t.start_date);
    const e = parseDay(t.end_date);
    if (s == null || e == null || e < s) continue;
    const ws = weeksBetween(s, e);
    for (const w of ws) {
      weight.set(w, (weight.get(w) ?? 0) + 1);
      totalWeight += 1;
    }
  }
  if (totalWeight === 0) return [];

  let planCum = 0;
  let actCum = 0;
  const out: CurvePoint[] = [];

  for (const w of weeks) {
    planCum += bac * ((weight.get(w) ?? 0) / totalWeight);
    const isPast = w <= thisWeek;
    if (isPast) actCum += actualsByWeek.get(w) ?? 0;

    let forecast: number | null = null;
    if (eac != null && !isPast) {
      /* From today forward the forecast follows the planned SHAPE but lands on
         EAC instead of BAC — the overrun spread the way the work is spread. */
      forecast = round2(eac * (planCum / bac));
    } else if (eac != null && w === thisWeek) {
      forecast = round2(actCum);
    }

    out.push({
      week: w,
      plannedCum: round2(planCum),
      actualCum: isPast ? round2(actCum) : null,
      forecastCum: forecast,
    });
  }

  return out;
}
