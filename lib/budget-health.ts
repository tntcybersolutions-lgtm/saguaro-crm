/**
 * lib/budget-health.ts
 *
 * Whether the budget adds up, and whether the forecast is honest.
 *
 * A budget can total correctly at the bottom and be wrong in every way that
 * matters. On this platform's own live data:
 *
 *   approved_changes is 0 on every line, yet two lines carry a revised budget
 *   above their original — $28,000 on concrete, $15,600 on HVAC. The waterfall
 *   does not foot, and nobody can say where the money came from.
 *
 *   variance is 0 on every line, exactly like selections.variance was: a stored
 *   column nothing recomputes, right once and wrong ever since.
 *
 *   percent_complete is 0 on every line while $360,000 of a $478,000 concrete
 *   budget has been spent. Nothing that reads progress can be trusted.
 *
 *   committed is 0 everywhere against $422,000 of actuals — money out the door
 *   with no commitment behind it, which is either missing subcontracts or
 *   uncontrolled spend, and both need a name.
 *
 * THE FORECAST IS THE POINT. A budget line whose forecast equals its budget
 * while it is 75% spent is not a forecast, it is a wish. Cost at completion has
 * three standard readings and they diverge violently on a job in trouble, so
 * all three are computed and the spread between them is reported — the spread
 * IS the risk.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (n: number) => '$' + Math.round(Math.abs(n)).toLocaleString('en-US');

export interface BudgetLine {
  id?: string;
  cost_code?: string | null;
  description?: string | null;
  division?: string | null;
  original_budget?: unknown;
  approved_changes?: unknown;
  revised_budget?: unknown;
  committed?: unknown;
  actual?: unknown;
  projected?: unknown;
  variance?: unknown;
  percent_complete?: unknown;
  [k: string]: unknown;
}

/**
 * Read a field under any of the names the platform uses for it.
 *
 * `budget_lines` says committed / actual / projected / percent_complete;
 * `budget_line_items` says committed_cost / cost_to_date / estimated_final_cost;
 * the budget page's own type says committed_cost / actual_cost / forecast_cost /
 * pct_complete / approved_cos. Three vocabularies for the same six numbers, and
 * an engine that knows only one of them silently reads zero — which is exactly
 * how the selections screen came to report an untouched allowance as settled.
 */
const field = (l: BudgetLine, ...names: string[]): number => {
  for (const n of names) {
    const v = l[n];
    if (v !== undefined && v !== null && v !== '') {
      const x = Number(v);
      if (Number.isFinite(x)) return x;
    }
  }
  return 0;
};

const fOriginal = (l: BudgetLine) => field(l, 'original_budget', 'original');
const fChanges = (l: BudgetLine) => field(l, 'approved_changes', 'approved_cos', 'approved_change_orders');
const fRevised = (l: BudgetLine) => field(l, 'revised_budget', 'current_budget');
const fCommitted = (l: BudgetLine) => field(l, 'committed', 'committed_cost');
const fActual = (l: BudgetLine) => field(l, 'actual', 'actual_cost', 'cost_to_date');
const fProjected = (l: BudgetLine) => field(l, 'projected', 'forecast_cost', 'estimated_final_cost');
const fPct = (l: BudgetLine) => field(l, 'percent_complete', 'pct_complete');
const fVariance = (l: BudgetLine) => field(l, 'variance');

/* ── forecast ────────────────────────────────────────────────────────────── */

export interface Forecast {
  /** Budget at completion — the revised budget. */
  bac: number;
  /** Actual cost to date. */
  ac: number;
  /** Earned value: budget × percent complete. */
  ev: number;
  committed: number;
  /** Cost performance index. Below 1 means every dollar buys less than planned. */
  cpi: number | null;
  /** AC + remaining work AT BUDGET. The optimistic reading. */
  eacAtBudget: number;
  /** BAC ÷ CPI. Remaining work at the rate actually being achieved. */
  eacAtRate: number | null;
  /** The committed position: what is spent plus what is already promised. */
  eacCommitted: number;
  /** The reading this line should be carrying, given what is known. */
  recommended: number;
  /** How far apart the readings are. The spread IS the risk. */
  spread: number;
  /** Revised budget minus the recommended forecast. Negative is an overrun. */
  variance: number;
  method: 'at-budget' | 'at-rate' | 'committed' | 'no-progress';
  /**
   * False when money has been spent and progress is still zero. There is no
   * defensible cost at completion for such a line, and the floor reported in
   * `recommended` is a floor, not a forecast.
   */
  forecastable: boolean;
}

/**
 * Cost at completion, three ways.
 *
 * Which reading to trust depends on how far in you are. Early on, performance
 * data is noise and the commitments are what you know. Past about a fifth of
 * the way through, CPI is the most reliable predictor there is — the research
 * on that is forty years old and still holds — and a line forecasting its own
 * budget while running at 0.8 CPI is simply not forecasting.
 */
export function forecastLine(line: BudgetLine): Forecast {
  const bac = fRevised(line) || fOriginal(line) + fChanges(line);
  const ac = fActual(line);
  const committed = fCommitted(line);
  const pctRaw = fPct(line);
  const pct = Math.max(0, Math.min(100, pctRaw)) / 100;
  const ev = round2(bac * pct);

  const cpi = ac > 0 && ev > 0 ? round2(ev / ac) : null;

  const eacAtBudget = round2(ac + Math.max(0, bac - ev));
  const eacAtRate = cpi && cpi > 0 ? round2(bac / cpi) : null;
  const eacCommitted = round2(Math.max(ac + committed, ac));

  /* Choosing the reading. Under 20% complete the performance index swings on
     nothing, so the committed position is the honest answer. After that, CPI.

     The exception matters more than the rule. When real money has been spent
     and progress is still zero, the textbook EAC is AC + (BAC − EV) = AC + BAC,
     which on live data forecast $838,000 against a $478,000 budget purely
     because nobody had entered a percentage. That number is arithmetically
     correct and practically absurd, and printing it would discredit every other
     figure on the screen. So this refuses: the line is not forecastable until
     somebody says how much of it is done. The floor — what is spent, or what is
     budgeted, whichever is larger — is reported instead, clearly labelled. */
  const progressMissing = ac > 0 && pct <= 0;

  let method: Forecast['method'];
  let recommended: number;
  if (progressMissing) {
    method = 'no-progress';
    recommended = Math.max(bac, ac + committed);
  } else if (pct >= 0.2 && eacAtRate != null) {
    method = 'at-rate';
    recommended = eacAtRate;
  } else if (committed > 0) {
    method = 'committed';
    recommended = Math.max(eacCommitted, eacAtBudget);
  } else {
    method = 'at-budget';
    recommended = eacAtBudget;
  }

  const readings = [eacAtBudget, eacCommitted, ...(eacAtRate != null ? [eacAtRate] : [])];
  return {
    bac, ac, ev, committed, cpi,
    eacAtBudget, eacAtRate, eacCommitted,
    recommended: round2(recommended),
    spread: round2(Math.max(...readings) - Math.min(...readings)),
    variance: round2(bac - recommended),
    method,
    forecastable: !progressMissing,
  };
}

/* ── health ──────────────────────────────────────────────────────────────── */

export type BudgetSeverity = 'blocker' | 'warn' | 'note';

export interface BudgetFinding {
  id: string;
  severity: BudgetSeverity;
  title: string;
  detail: string;
  amount?: number;
  count?: number;
  codes?: string[];
}

export interface BudgetHealth {
  findings: BudgetFinding[];
  blockers: number;
  warnings: number;
  score: number;
  totals: {
    original: number;
    approvedChanges: number;
    revised: number;
    committed: number;
    actual: number;
    /** Sum of the recommended forecasts, not of the stored projections. */
    forecast: number;
    variance: number;
    /** Committed but not yet spent. */
    openCommitment: number;
    /** Revised budget not yet committed — the exposure still to buy out. */
    uncommitted: number;
    percentSpent: number;
    percentComplete: number;
  };
  lines: (BudgetLine & { forecast: Forecast })[];
}

const codeOf = (l: BudgetLine) => String(l.cost_code ?? l.description ?? '?');

/**
 * Assess a budget.
 *
 * Ordered by what costs most to discover late. A budget that does not foot is a
 * blocker because every number derived from it is wrong; a stale variance
 * column is a note because nothing important reads it any more.
 */
export function assessBudget(lines: BudgetLine[]): BudgetHealth {
  const findings: BudgetFinding[] = [];
  const withForecast = lines.map((l) => ({ ...l, forecast: forecastLine(l) }));

  const sum = (f: (l: BudgetLine) => number) => round2(lines.reduce((s, l) => s + f(l), 0));
  const original = sum(fOriginal);
  const approvedChanges = sum(fChanges);
  const revised = sum((l) => fRevised(l) || fOriginal(l) + fChanges(l));
  const committed = sum(fCommitted);
  const actual = sum(fActual);
  const forecast = round2(withForecast.reduce((s, l) => s + l.forecast.recommended, 0));
  const earned = round2(withForecast.reduce((s, l) => s + l.forecast.ev, 0));

  /* ── the waterfall has to foot ────────────────────────────────────────── */

  const unfooted = lines.filter((l) => {
    const o = fOriginal(l), a = fChanges(l), r = fRevised(l);
    if (r === 0) return false;
    return Math.abs(o + a - r) > 0.01;
  });
  if (unfooted.length) {
    const gap = round2(unfooted.reduce((s, l) => s + (fRevised(l) - fOriginal(l) - fChanges(l)), 0));
    findings.push({
      id: 'unfooted', severity: 'blocker',
      title: `${unfooted.length} line${unfooted.length === 1 ? "'s revised budget does not" : "s' revised budgets do not"} foot — ${money(gap)} unaccounted`,
      detail: 'Original plus approved changes should equal the revised budget. Where it does not, money has moved into the budget without a change order behind it, and nobody can say whose approval it had.',
      amount: gap, count: unfooted.length, codes: unfooted.map(codeOf),
    });
  }

  /* ── spend with nothing behind it ─────────────────────────────────────── */

  const uncommittedSpend = lines.filter((l) => fActual(l) > 0 && fActual(l) > fCommitted(l) + 0.01);
  if (uncommittedSpend.length) {
    const amount = round2(uncommittedSpend.reduce((s, l) => s + (fActual(l) - fCommitted(l)), 0));
    findings.push({
      id: 'uncommitted-spend', severity: 'blocker',
      title: `${money(amount)} spent beyond what was ever committed`,
      detail: 'Cost has gone out the door on these lines without a subcontract or purchase order covering it. Either the commitments were never entered, or the spend was never controlled — and the two look identical in a report until somebody asks.',
      amount, count: uncommittedSpend.length, codes: uncommittedSpend.map(codeOf),
    });
  }

  const overCommitted = lines.filter((l) => {
    const bac = fRevised(l) || fOriginal(l);
    return bac > 0 && fCommitted(l) > bac + 0.01;
  });
  if (overCommitted.length) {
    const amount = round2(overCommitted.reduce((s, l) => s + (fCommitted(l) - (fRevised(l) || fOriginal(l))), 0));
    findings.push({
      id: 'over-committed', severity: 'blocker',
      title: `${overCommitted.length} line${overCommitted.length === 1 ? ' is' : 's are'} committed beyond budget — ${money(amount)} over`,
      detail: 'The contracts already signed exceed the money allocated. This is not a forecast of an overrun; it is one that has already been agreed in writing.',
      amount, count: overCommitted.length, codes: overCommitted.map(codeOf),
    });
  }

  const overspent = lines.filter((l) => {
    const bac = fRevised(l) || fOriginal(l);
    return bac > 0 && fActual(l) > bac + 0.01;
  });
  if (overspent.length) {
    const amount = round2(overspent.reduce((s, l) => s + (fActual(l) - (fRevised(l) || fOriginal(l))), 0));
    findings.push({
      id: 'overspent', severity: 'blocker',
      title: `${overspent.length} line${overspent.length === 1 ? ' has' : 's have'} already spent past budget — ${money(amount)} over`,
      detail: 'The money is gone. Whatever remains of the scope on these lines has no budget left to do it with.',
      amount, count: overspent.length, codes: overspent.map(codeOf),
    });
  }

  /* ── forecasts that are not forecasts ─────────────────────────────────── */

  const lazyForecast = withForecast.filter((l) => {
    const bac = l.forecast.bac;
    const stored = fProjected(l);
    return bac > 0 && stored > 0 && Math.abs(stored - bac) < 0.01 && fActual(l) > 0;
  });
  if (lazyForecast.length) {
    findings.push({
      id: 'forecast-equals-budget', severity: 'warn',
      title: `${lazyForecast.length} line${lazyForecast.length === 1 ? ' forecasts' : 's forecast'} exactly its own budget while money is being spent`,
      detail: 'A forecast that never moves off the budget is not a forecast. On a line that is part spent, it is the one number guaranteed to be wrong, and it hides every overrun until the job is finished.',
      count: lazyForecast.length, codes: lazyForecast.map(codeOf),
    });
  }

  const impossibleForecast = lines.filter((l) => fProjected(l) > 0 && fProjected(l) < fActual(l) - 0.01);
  if (impossibleForecast.length) {
    findings.push({
      id: 'forecast-below-actual', severity: 'blocker',
      title: `${impossibleForecast.length} line${impossibleForecast.length === 1 ? ' forecasts' : 's forecast'} finishing for less than has already been spent`,
      detail: 'Cost at completion cannot be below cost to date. Money already out of the door does not come back.',
      count: impossibleForecast.length, codes: impossibleForecast.map(codeOf),
    });
  }

  /* ── progress nobody is maintaining ───────────────────────────────────── */

  const spentNoProgress = lines.filter((l) => fActual(l) > 0 && fPct(l) <= 0);
  if (spentNoProgress.length) {
    const amount = round2(spentNoProgress.reduce((s, l) => s + fActual(l), 0));
    findings.push({
      id: 'no-progress', severity: 'warn',
      title: `${money(amount)} spent on lines still showing 0% complete`,
      detail: 'Without progress there is no earned value, so no performance index, so no forecast worth the name. Every cost report on this project is currently arithmetic on a blank.',
      amount, count: spentNoProgress.length, codes: spentNoProgress.map(codeOf),
    });
  }

  const staleVariance = lines.filter((l) => {
    const f = forecastLine(l);
    const stored = fVariance(l);
    return Math.abs(stored - f.variance) > 1 && (fActual(l) > 0 || fCommitted(l) > 0);
  });
  if (staleVariance.length) {
    findings.push({
      id: 'stale-variance', severity: 'note',
      title: `${staleVariance.length} stored variance${staleVariance.length === 1 ? '' : 's'} disagree with the arithmetic`,
      detail: 'The variance column is a cache nothing recomputes. It was right once and has been wrong since the first cost landed.',
      count: staleVariance.length, codes: staleVariance.map(codeOf),
    });
  }

  /* ── performance ──────────────────────────────────────────────────────── */

  const underperforming = withForecast.filter((l) => l.forecast.cpi != null && l.forecast.cpi < 0.95);
  if (underperforming.length) {
    const exposure = round2(underperforming.reduce((s, l) => s + Math.max(0, -l.forecast.variance), 0));
    findings.push({
      id: 'cpi-low', severity: 'warn',
      title: `${underperforming.length} line${underperforming.length === 1 ? ' is' : 's are'} running below plan — ${money(exposure)} of projected overrun`,
      detail: 'Every dollar on these lines is buying less work than the budget assumed. Left alone, that rate is what finishes the job.',
      amount: exposure, count: underperforming.length,
      codes: underperforming.map((l) => `${codeOf(l)} (CPI ${l.forecast.cpi})`),
    });
  }

  const wideSpread = withForecast.filter((l) => l.forecast.bac > 0 && l.forecast.spread > l.forecast.bac * 0.15);
  if (wideSpread.length) {
    findings.push({
      id: 'forecast-spread', severity: 'note',
      title: `${wideSpread.length} line${wideSpread.length === 1 ? ' has' : 's have'} forecasts that disagree by more than 15%`,
      detail: 'The three standard readings of cost at completion diverge here. The spread between them is the honest measure of how little is actually known about the outcome.',
      count: wideSpread.length, codes: wideSpread.map(codeOf),
    });
  }

  /* ── concentration ────────────────────────────────────────────────────── */

  const overruns = withForecast.filter((l) => l.forecast.variance < 0).sort((a, b) => a.forecast.variance - b.forecast.variance);
  const totalOverrun = round2(overruns.reduce((s, l) => s + Math.abs(l.forecast.variance), 0));
  if (overruns.length > 1 && totalOverrun > 0) {
    const worst = Math.abs(overruns[0].forecast.variance);
    if (worst / totalOverrun >= 0.6) {
      findings.push({
        id: 'concentration', severity: 'note',
        title: `One line drives ${Math.round((worst / totalOverrun) * 100)}% of the projected overrun`,
        detail: `${codeOf(overruns[0])} accounts for ${money(worst)} of ${money(totalOverrun)}. Concentrated problems are fixable in a way that spread ones are not — this is where the effort goes.`,
        amount: worst, codes: [codeOf(overruns[0])],
      });
    }
  }

  const zeroBudget = lines.filter((l) => {
    const bac = fRevised(l) || fOriginal(l);
    return bac <= 0 && (fActual(l) > 0 || fCommitted(l) > 0);
  });
  if (zeroBudget.length) {
    findings.push({
      id: 'no-budget', severity: 'blocker',
      title: `${zeroBudget.length} line${zeroBudget.length === 1 ? ' has' : 's have'} cost against no budget at all`,
      detail: 'Spend on a line with a zero budget is unbudgeted scope. It has to come from contingency, a change order, or the fee — and until it is assigned somewhere it is coming from the fee.',
      count: zeroBudget.length, codes: zeroBudget.map(codeOf),
    });
  }

  const order: Record<BudgetSeverity, number> = { blocker: 0, warn: 1, note: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  const blockers = findings.filter((f) => f.severity === 'blocker').length;
  const warnings = findings.filter((f) => f.severity === 'warn').length;

  let score = 100;
  score -= blockers * 22;
  score -= warnings * 9;
  score -= findings.filter((f) => f.severity === 'note').length * 3;
  score = Math.max(0, Math.min(100, score));
  if (blockers > 0) score = Math.min(score, 45);
  if (lines.length === 0) score = 100;

  return {
    findings, blockers, warnings, score,
    totals: {
      original, approvedChanges, revised, committed, actual, forecast,
      variance: round2(revised - forecast),
      openCommitment: round2(Math.max(0, committed - actual)),
      uncommitted: round2(Math.max(0, revised - committed)),
      percentSpent: revised > 0 ? Math.round((actual / revised) * 1000) / 10 : 0,
      percentComplete: revised > 0 ? Math.round((earned / revised) * 1000) / 10 : 0,
    },
    lines: withForecast,
  };
}
