/**
 * Earned-value sanity — the arithmetic behind Intelligence's cost forecast.
 * Run: npx -y tsx lib/earned-value.sanity.test.ts   (exit 0 = every assertion held)
 *
 * These numbers cannot be validated against the live database: it currently has
 * zero budget lines carrying an actual cost and zero schedule tasks carrying
 * progress, so every index comes back null there by design. That is the correct
 * behaviour and it is also why it proves nothing. The engine is pure arithmetic,
 * so it is pinned here against a worked example instead.
 *
 * The worked case is the standard one: a $100k job that is 40% built, 50% of the
 * way through its planned window, having already spent $60k. Every published
 * EVM treatment produces the same answers for it, which is exactly why it is
 * useful as a fixture — if this file ever disagrees, this file is wrong.
 */
import { earnedValue, scheduleProgress, verdict, type BudgetLine, type ScheduleTask } from './earned-value';

let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  if (!cond) failures++;
};
const near = (a: number | null, b: number, tol = 0.51) =>
  a != null && Math.abs(a - b) <= tol;

/* ── 1. the worked example ───────────────────────────────────────────────── */

const lines: BudgetLine[] = [
  { cost_code: '03-300', current_budget: '60000', cost_to_date: '36000', committed_cost: '50000', estimated_final_cost: '90000' },
  { cost_code: '05-100', current_budget: '40000', cost_to_date: '24000', committed_cost: '30000', estimated_final_cost: '60000' },
];

const ev = earnedValue(lines, 40, 50);

check('BAC sums current_budget', ev.bac === 100000, `BAC=${ev.bac} (expected 100000)`);
check('AC sums cost_to_date', ev.ac === 60000, `AC=${ev.ac} (expected 60000)`);
check('committed sums committed_cost', ev.committed === 80000, `committed=${ev.committed} (expected 80000)`);
check('EV = BAC x physical %', ev.ev === 40000, `EV=${ev.ev} (expected 40000)`);
check('PV = BAC x planned %', ev.pv === 50000, `PV=${ev.pv} (expected 50000)`);
check('CV = EV - AC', ev.cv === -20000, `CV=${ev.cv} (expected -20000)`);
check('SV = EV - PV', ev.sv === -10000, `SV=${ev.sv} (expected -10000)`);
check('CPI = EV / AC', near(ev.cpi, 0.667, 0.001), `CPI=${ev.cpi} (expected ~0.667)`);
check('SPI = EV / PV', near(ev.spi, 0.8, 0.001), `SPI=${ev.spi} (expected 0.8)`);
check('EAC = BAC / CPI', near(ev.eac, 149925, 200), `EAC=${ev.eac} (expected ~150000)`);
check('ETC = EAC - AC', near(ev.etc, 89925, 200), `ETC=${ev.etc} (expected ~90000)`);
check('VAC = BAC - EAC (overrun is negative)', ev.vac != null && ev.vac < -49000, `VAC=${ev.vac} (expected ~-50000)`);
check('TCPI = (BAC-EV)/(BAC-AC)', near(ev.tcpi, 1.5, 0.001), `TCPI=${ev.tcpi} (expected 1.5)`);
check('team EAC read from estimated_final_cost', ev.teamEac === 150000, `teamEac=${ev.teamEac} (expected 150000)`);
check('percent spent is cost, not progress', near(ev.percentSpent, 60), `percentSpent=${ev.percentSpent} (expected 60)`);

/* ── 2. progress must NOT be derived from cost ───────────────────────────────
   If EV were computed from spend, CPI would be exactly 1.00 no matter what and
   the dashboard could never report trouble. This is the single most important
   property in the file. */

const derived = earnedValue(lines, 60 /* == percent spent */, 50);
check(
  'CPI is only 1.00 when progress genuinely equals spend',
  derived.cpi === 1,
  `feeding physical% = spent% gives CPI=${derived.cpi}; the 40% case above gave ${ev.cpi} — they differ, so progress is independent of cost`,
);

/* ── 3. empty and zero states stay honest ────────────────────────────────── */

const empty = earnedValue([], 0, 0);
check('no budget lines ⇒ zero BAC, no fabricated indices', empty.bac === 0 && empty.cpi === null && empty.spi === null,
  `BAC=${empty.bac} CPI=${empty.cpi} SPI=${empty.spi}`);

const noCost = earnedValue([{ current_budget: '50000' }], 0, 0);
check('budget but no actuals ⇒ EAC falls back to BAC, not null-math', noCost.eac === 50000 && noCost.cpi === null,
  `EAC=${noCost.eac} CPI=${noCost.cpi}`);

/* ── 4. schedule progress is duration-weighted ───────────────────────────────
   A 40-day task at 50% is far more of the job than a 1-day task at 100%.
   Counting tasks instead of weighting them is how a schedule reports 80%
   complete on the day it slips a month. */

const past = '2026-01-01';
const future = '2099-01-01';
const tasks: ScheduleTask[] = [
  { name: 'Structure', start_date: past, end_date: future, duration: 40, pct_complete: 50 },
  { name: 'Inspection', start_date: past, end_date: future, duration: 1, pct_complete: 100 },
];
const sp = scheduleProgress(tasks, Date.parse('2026-06-01T12:00:00Z'));
const unweighted = (50 + 100) / 2; // 75 — what naive task-counting would report
check('duration-weighted progress, not a task average',
  near(sp.actualPct, (50 * 40 + 100 * 1) / 41, 0.05) && Math.abs(sp.actualPct - unweighted) > 20,
  `actualPct=${sp.actualPct} (weighted ≈51.2, naive average would be ${unweighted})`);

const floatTasks: ScheduleTask[] = [
  { name: 'Slipped', start_date: past, end_date: '2026-02-01', duration: 30, pct_complete: 10, total_float: -5, is_critical: true },
];
const sp2 = scheduleProgress(floatTasks, Date.parse('2026-06-01T12:00:00Z'));
check('negative float is counted', sp2.negativeFloatTasks === 1, `negativeFloatTasks=${sp2.negativeFloatTasks}`);
check('critical tasks are counted', sp2.criticalTasks === 1, `criticalTasks=${sp2.criticalTasks}`);
check('an overdue task with 10% done is reported as behind',
  sp2.behindTasks.length === 1 && sp2.behindTasks[0].slipDays > 0,
  `behind=${JSON.stringify(sp2.behindTasks[0] ?? null)}`);

/* ── 5. the verdict names numbers, not adjectives ────────────────────────── */

const v = verdict(ev, { criticalTasks: 0, negativeFloatTasks: 0 });
check('a job at CPI 0.67 is called critical', v.health === 'critical', `health=${v.health}`);
check('the verdict cites figures a GC can act on', v.reasons.length >= 2 && /\$/.test(v.reasons.join(' ')),
  `${v.reasons.length} reasons, first: "${v.reasons[0]}"`);

const clean = earnedValue([{ current_budget: '100000', cost_to_date: '40000', estimated_final_cost: '100000' }], 45, 45);
const v2 = verdict(clean, { criticalTasks: 0, negativeFloatTasks: 0 });
check('a job earning more than it spends is not flagged', v2.health === 'good', `health=${v2.health} (CPI ${clean.cpi})`);

const v3 = verdict(clean, { criticalTasks: 2, negativeFloatTasks: 1 });
check('negative float alone escalates to critical', v3.health === 'critical', `health=${v3.health}`);

console.log(failures === 0 ? '\nALL EARNED-VALUE ASSERTIONS HELD' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
