/**
 * lib/earned-value.ts
 *
 * Earned value and schedule performance, as pure functions.
 *
 * Every enterprise PM tool on the market is reviewed with the same three
 * complaints — no capacity planning, no forecasting, no earned value. Monday,
 * Smartsheet, Asana, Teamwork and ClickUp are each called out for exactly that.
 * The gap is real: they track what a task costs, not whether the money spent
 * bought the progress it was supposed to buy.
 *
 * That is the question this answers. A job 60% spent and 40% built is losing
 * money right now, and it says so months before the final accounting does.
 *
 * No I/O here on purpose — this is arithmetic over rows the caller supplies, so
 * it is testable without a database and reusable by any route that has budget
 * and schedule rows in hand.
 */

/** A budget line as stored in budget_line_items. NUMERIC arrives as text. */
export interface BudgetLine {
  cost_code?: string | null;
  csi_division?: string | null;
  csi_description?: string | null;
  current_budget?: unknown;
  original_budget?: unknown;
  approved_changes?: unknown;
  committed_cost?: unknown;
  cost_to_date?: unknown;
  estimated_final_cost?: unknown;
}

/** A schedule row as stored in schedule_tasks. */
export interface ScheduleTask {
  name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  pct_complete?: unknown;
  duration?: unknown;
  total_float?: unknown;
  is_critical?: unknown;
  status?: string | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Guarded ratio: an index is meaningless when its denominator is zero. */
const ratio = (a: number, b: number): number | null =>
  b > 0 ? Math.round((a / b) * 1000) / 1000 : null;

const dayMs = 86400000;

/** Parse a DB date (date-only or ISO) at UTC noon so timezone never shifts the day. */
function parseDay(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s).trim());
  if (!m) {
    const t = Date.parse(String(s));
    return Number.isFinite(t) ? t : null;
  }
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

/**
 * Physical percent complete for the job, weighted by task duration.
 *
 * Weighting matters: a 40-day structural task at 50% is far more of the job
 * than a 1-day inspection at 100%. Counting tasks instead of weighting them is
 * how a schedule reports 80% complete on the day it slips a month.
 */
export function scheduleProgress(tasks: ScheduleTask[], asOf = Date.now()): {
  actualPct: number;
  plannedPct: number;
  totalDuration: number;
  criticalTasks: number;
  negativeFloatTasks: number;
  behindTasks: { name: string; plannedPct: number; actualPct: number; slipDays: number }[];
} {
  let wsum = 0;
  let actual = 0;
  let planned = 0;
  let criticalTasks = 0;
  let negativeFloatTasks = 0;
  const behind: { name: string; plannedPct: number; actualPct: number; slipDays: number }[] = [];

  for (const t of tasks) {
    const start = parseDay(t.start_date);
    const end = parseDay(t.end_date);

    /* Duration column wins when present; otherwise derive from the dates. A
       zero-length task still gets weight 1 so milestones are not invisible. */
    let w = num(t.duration);
    if (w <= 0 && start != null && end != null) w = Math.max(1, Math.round((end - start) / dayMs));
    if (w <= 0) w = 1;

    const a = Math.max(0, Math.min(100, num(t.pct_complete)));

    /* Planned percent is elapsed-time-to-date against the task's own window —
       what SHOULD be done by now if the task were tracking its baseline. */
    let p = 0;
    if (start != null && end != null && end > start) {
      p = ((asOf - start) / (end - start)) * 100;
    } else if (start != null) {
      p = asOf >= start ? 100 : 0;
    }
    p = Math.max(0, Math.min(100, p));

    wsum += w;
    actual += a * w;
    planned += p * w;

    if (t.is_critical === true || t.is_critical === 'true') criticalTasks++;
    if (num(t.total_float) < 0) negativeFloatTasks++;

    /* A task is "behind" when the calendar has moved further than the work.
       The slip estimate converts that gap back into days of its own duration,
       which is the number a super can act on. */
    const gap = p - a;
    if (gap > 5 && p > 0) {
      behind.push({
        name: String(t.name || 'Untitled task'),
        plannedPct: Math.round(p),
        actualPct: Math.round(a),
        slipDays: Math.round((gap / 100) * w),
      });
    }
  }

  behind.sort((x, y) => y.slipDays - x.slipDays);

  return {
    actualPct: wsum > 0 ? round2(actual / wsum) : 0,
    plannedPct: wsum > 0 ? round2(planned / wsum) : 0,
    totalDuration: wsum,
    criticalTasks,
    negativeFloatTasks,
    behindTasks: behind.slice(0, 10),
  };
}

export interface EarnedValue {
  /** Budget at completion — the approved budget including approved changes. */
  bac: number;
  /** Planned value — budget that should have been earned by now. */
  pv: number;
  /** Earned value — budgeted cost of the work actually put in place. */
  ev: number;
  /** Actual cost — what has been spent to date. */
  ac: number;
  /** Committed — issued POs and subcontracts, spent or not. */
  committed: number;
  /** Cost variance: EV − AC. Negative means overspending for progress made. */
  cv: number;
  /** Schedule variance in dollars: EV − PV. Negative means behind. */
  sv: number;
  /** Cost performance index: EV / AC. Below 1.0 is losing money. */
  cpi: number | null;
  /** Schedule performance index: EV / PV. Below 1.0 is behind. */
  spi: number | null;
  /** Estimate at completion, CPI-projected. */
  eac: number | null;
  /** Estimate to complete: EAC − AC. */
  etc: number | null;
  /** Variance at completion: BAC − EAC. Negative is a projected overrun. */
  vac: number | null;
  /** To-complete performance index — the efficiency needed to still hit BAC. */
  tcpi: number | null;
  /** The team's own forecast, from estimated_final_cost. */
  teamEac: number;
  percentSpent: number | null;
  percentComplete: number;
}

/**
 * Earned value for one project.
 *
 * `physicalPct` is deliberately an input rather than something derived from
 * cost. Deriving progress from spend makes CPI exactly 1.0 by construction —
 * the classic mistake that produces a dashboard which can never report trouble.
 * Progress comes from the schedule; cost comes from the ledger; the whole point
 * is that they are measured independently and then compared.
 */
export function earnedValue(
  lines: BudgetLine[],
  physicalPct: number,
  plannedPct: number,
): EarnedValue {
  let bac = 0;
  let ac = 0;
  let committed = 0;
  let teamEac = 0;

  for (const l of lines) {
    const budget = num(l.current_budget) || (num(l.original_budget) + num(l.approved_changes));
    bac += budget;
    ac += num(l.cost_to_date);
    committed += num(l.committed_cost);
    teamEac += num(l.estimated_final_cost) || budget;
  }

  const pct = Math.max(0, Math.min(100, physicalPct)) / 100;
  const plan = Math.max(0, Math.min(100, plannedPct)) / 100;

  const ev = round2(bac * pct);
  const pv = round2(bac * plan);
  const cv = round2(ev - ac);
  const sv = round2(ev - pv);
  const cpi = ratio(ev, ac);
  const spi = ratio(ev, pv);

  /* EAC projects the overrun forward at the efficiency the job has actually
     run at. With no cost yet there is nothing to project from, so EAC is the
     budget rather than a fabricated number. */
  const eac = cpi && cpi > 0 ? round2(bac / cpi) : (ac > 0 ? null : round2(bac));
  const etc = eac != null ? round2(eac - ac) : null;
  const vac = eac != null ? round2(bac - eac) : null;

  /* TCPI: how efficiently the remaining work must run to still land on budget.
     Above ~1.1 the plan is no longer credible without a change. */
  const remainingBudget = bac - ac;
  const tcpi = remainingBudget > 0 ? Math.round(((bac - ev) / remainingBudget) * 1000) / 1000 : null;

  return {
    bac: round2(bac),
    pv,
    ev,
    ac: round2(ac),
    committed: round2(committed),
    cv,
    sv,
    cpi,
    spi,
    eac,
    etc,
    vac,
    tcpi,
    teamEac: round2(teamEac),
    percentSpent: ratio(ac, bac) != null ? round2((ac / bac) * 100) : null,
    percentComplete: round2(physicalPct),
  };
}

export type Health = 'good' | 'watch' | 'critical';

export interface Verdict {
  health: Health;
  headline: string;
  reasons: string[];
}

/**
 * Turn the indices into something a GC can act on.
 *
 * "82% health" tells nobody anything. "Spending $1.18 for every dollar earned —
 * projected $240k over" is a sentence someone can take into a meeting. Every
 * reason names the number that produced it.
 */
export function verdict(ev: EarnedValue, sched: { criticalTasks: number; negativeFloatTasks: number }): Verdict {
  const reasons: string[] = [];
  let health: Health = 'good';

  const money = (n: number) =>
    (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
  /* Whole dollars are right for totals and wrong for a per-dollar rate: at
     CPI 0.667 the burn rate is $1.50 per $1 earned, and rounding that to "$1"
     turns the headline finding into a sentence that says nothing. */
  const rate = (n: number) => '$' + n.toFixed(2);

  if (ev.cpi != null && ev.ac > 0) {
    if (ev.cpi < 0.9) {
      health = 'critical';
      reasons.push(`Spending ${rate(1 / ev.cpi)} for every $1 of work earned (CPI ${ev.cpi.toFixed(2)}).`);
    } else if (ev.cpi < 0.98) {
      health = 'watch';
      reasons.push(`Cost efficiency is slipping — CPI ${ev.cpi.toFixed(2)}.`);
    }
  }

  if (ev.spi != null && ev.pv > 0) {
    if (ev.spi < 0.9) {
      health = 'critical';
      reasons.push(`Behind schedule — ${money(Math.abs(ev.sv))} of planned work not yet earned (SPI ${ev.spi.toFixed(2)}).`);
    } else if (ev.spi < 0.98 && health === 'good') {
      health = 'watch';
      reasons.push(`Slightly behind plan — SPI ${ev.spi.toFixed(2)}.`);
    }
  }

  if (ev.vac != null && ev.vac < 0 && ev.bac > 0) {
    const pct = Math.abs(ev.vac / ev.bac) * 100;
    if (pct >= 5) health = 'critical';
    else if (health === 'good') health = 'watch';
    reasons.push(`Projected ${money(Math.abs(ev.vac))} over budget at completion (${pct.toFixed(1)}% of BAC).`);
  }

  if (ev.tcpi != null && ev.tcpi > 1.1) {
    if (health === 'good') health = 'watch';
    reasons.push(`Remaining work must run ${((ev.tcpi - 1) * 100).toFixed(0)}% more efficiently than budgeted to still hit BAC.`);
  }

  if (sched.negativeFloatTasks > 0) {
    health = 'critical';
    reasons.push(`${sched.negativeFloatTasks} task${sched.negativeFloatTasks === 1 ? '' : 's'} with negative float — the completion date has already moved.`);
  }

  /* The team's own forecast disagreeing with the arithmetic is worth saying out
     loud: one of the two is wrong, and it is worth knowing which before the
     owner asks.

     It only raises the severity when the arithmetic is the PESSIMISTIC one —
     the case where the field is under-calling a coming overrun. When CPI
     projects a cheaper finish than the team booked, that is a favourable
     variance; reporting it is useful, flagging a job that is beating its budget
     as "watch" is just crying wolf. */
  if (ev.eac != null && ev.teamEac > 0 && ev.bac > 0) {
    const gap = Math.abs(ev.eac - ev.teamEac);
    if (gap / ev.bac > 0.05) {
      const cpiIsWorse = ev.eac > ev.teamEac;
      reasons.push(
        cpiIsWorse
          ? `Team forecast (${money(ev.teamEac)}) is ${money(gap)} below the CPI projection (${money(ev.eac)}) — the field may be under-calling this.`
          : `Running ahead of the team's own forecast — CPI projects ${money(ev.eac)} against a booked ${money(ev.teamEac)}.`,
      );
      if (cpiIsWorse && health === 'good') health = 'watch';
    }
  }

  const headline =
    health === 'good'
      ? ev.ac > 0 ? 'Tracking to budget and schedule.' : 'No cost booked yet — nothing to project.'
      : health === 'watch'
        ? 'Drifting — worth a look this week.'
        : 'Off track. This needs a decision, not a note.';

  return { health, headline, reasons };
}
