/**
 * Budget health sanity — forecasting and integrity.
 * Run: npx -y tsx lib/budget-health.sanity.test.ts
 *
 * The first block is the live data, which fails four different ways at once and
 * about which the product currently says nothing:
 *
 *   approved_changes is 0 on every line, yet two lines carry a revised budget
 *   above their original. The waterfall does not foot.
 *   variance is 0 on every line — a cache nothing recomputes.
 *   percent_complete is 0 while $360,000 of a $478,000 line has been spent.
 *   committed is 0 against $422,000 of actuals.
 *
 * After that, the forecasting. A line forecasting its own budget while 75% spent
 * is not a forecast, and cost at completion has three standard readings that
 * diverge violently on a job in trouble.
 */
import { assessBudget, forecastLine, type BudgetLine } from './budget-health';

let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  if (!cond) failures++;
};
const find = (h: ReturnType<typeof assessBudget>, id: string) => h.findings.find((f) => f.id === id);
const money0 = (n: number) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');

/* ── the live rows, exactly as the database holds them ───────────────────── */

const live: BudgetLine[] = [
  { cost_code: '01-000', description: 'General Conditions', division: '01', original_budget: 175000, approved_changes: 0, revised_budget: 175000, committed: 0, actual: 62000, projected: 175000, variance: 0, percent_complete: 0 },
  { cost_code: '03-300', description: 'Cast-in-Place Concrete', division: '03', original_budget: 450000, approved_changes: 0, revised_budget: 478000, committed: 0, actual: 360000, projected: 478000, variance: 0, percent_complete: 0 },
  { cost_code: '05-120', description: 'Structural Steel', division: '05', original_budget: 620000, approved_changes: 0, revised_budget: 620000, committed: 0, actual: 0, projected: 620000, variance: 0, percent_complete: 0 },
  { cost_code: '23-000', description: 'HVAC', division: '23', original_budget: 310000, approved_changes: 0, revised_budget: 325600, committed: 0, actual: 0, projected: 325600, variance: 0, percent_complete: 0 },
];

{
  const h = assessBudget(live);

  check('a revised budget that does not foot is a BLOCKER',
    find(h, 'unfooted')?.severity === 'blocker' && find(h, 'unfooted')?.count === 2,
    `${find(h, 'unfooted')?.title}`);
  check('and it names the money that appeared from nowhere',
    find(h, 'unfooted')?.amount === 43600,
    `${find(h, 'unfooted')?.amount} — $28,000 on concrete plus $15,600 on HVAC`);

  check('spend with no commitment behind it is a blocker',
    find(h, 'uncommitted-spend')?.amount === 422000,
    `${find(h, 'uncommitted-spend')?.amount} out of the door with nothing signed`);

  check('lines spending with 0% progress are flagged',
    find(h, 'no-progress')?.amount === 422000,
    'without progress there is no earned value, so no forecast worth the name');

  check('a forecast that equals its own budget while money is spent is flagged',
    (find(h, 'forecast-equals-budget')?.count ?? 0) === 2,
    'the one number guaranteed to be wrong');

  check('the score is capped hard by the blockers', h.score <= 45, `${h.score}`);
  check('totals are computed', h.totals.revised === 1598600 && h.totals.actual === 422000,
    `revised ${h.totals.revised}, actual ${h.totals.actual}`);
  check('uncommitted exposure is reported',
    h.totals.uncommitted === 1598600, `${h.totals.uncommitted} still to buy out`);
}

/* ── forecasting: the three readings and why they differ ─────────────────── */

{
  /* $100,000 budget, half the work done, $60,000 spent. CPI 0.833. */
  const f = forecastLine({ revised_budget: 100_000, actual: 60_000, percent_complete: 50, committed: 0 });
  check('earned value is budget × percent complete', f.ev === 50_000, `${f.ev}`);
  check('CPI reads below 1 when a dollar buys less than planned',
    f.cpi === 0.83, `${f.cpi} — 50,000 earned on 60,000 spent`);
  check('the optimistic reading finishes the rest at budget',
    f.eacAtBudget === 110_000, `${f.eacAtBudget} — 60,000 spent plus 50,000 of work left`);
  check('the performance reading extends the current rate',
    f.eacAtRate === 120_481.93, `${f.eacAtRate} — 100,000 ÷ 0.83`);
  check('past 20% complete the performance reading is the one used',
    f.method === 'at-rate' && f.recommended === f.eacAtRate,
    'CPI is the most reliable predictor there is, and has been for forty years');
  check('the variance falls out of it',
    f.variance === -20_481.93, `${f.variance} — a projected overrun, not a hope`);
  check('the spread between readings is reported',
    f.spread > 10_000, `${f.spread} — the spread IS the risk`);
}

{
  /* Early on, performance data is noise. */
  const f = forecastLine({ revised_budget: 500_000, actual: 20_000, percent_complete: 4, committed: 380_000 });
  check('under 20% complete the committed position is used instead of CPI',
    f.method === 'committed', `${f.method} — a CPI on 4% of the work swings on nothing`);
  check('and it counts what is already promised',
    f.eacCommitted === 400_000, `${f.eacCommitted} — 20,000 spent plus 380,000 signed`);
}

{
  const f = forecastLine({ revised_budget: 100_000, actual: 0, percent_complete: 0, committed: 0 });
  check('a line with nothing on it forecasts its budget',
    f.recommended === 100_000 && f.cpi === null, 'nothing to learn from yet');
}

{
  const f = forecastLine({ original_budget: 80_000, approved_changes: 20_000, actual: 0, percent_complete: 0 });
  check('a missing revised budget falls back to original plus changes',
    f.bac === 100_000, `${f.bac}`);
}

/* ── each integrity check, provoked ──────────────────────────────────────── */

check('committed beyond budget is a blocker',
  find(assessBudget([{ cost_code: 'X', revised_budget: 100, committed: 150, actual: 0 }]), 'over-committed')?.severity === 'blocker',
  'already agreed in writing, not a forecast');

check('spent beyond budget is a blocker',
  find(assessBudget([{ cost_code: 'X', revised_budget: 100, committed: 150, actual: 140 }]), 'overspent')?.severity === 'blocker',
  'the money is gone');

check('a forecast below actual cost is impossible and blocks',
  find(assessBudget([{ cost_code: 'X', revised_budget: 100, actual: 90, projected: 50, percent_complete: 90 }]), 'forecast-below-actual')?.severity === 'blocker',
  'money already spent does not come back');

check('cost against a zero budget is unbudgeted scope',
  find(assessBudget([{ cost_code: 'X', revised_budget: 0, actual: 5000 }]), 'no-budget')?.severity === 'blocker',
  'until it is assigned somewhere it comes out of the fee');

check('a stale variance column is only a note',
  find(assessBudget([{ cost_code: 'X', revised_budget: 100_000, actual: 60_000, percent_complete: 50, variance: 0 }]), 'stale-variance')?.severity === 'note',
  'a cache nothing recomputes');

check('a line running below plan is flagged with its exposure',
  (find(assessBudget([{ cost_code: 'X', revised_budget: 100_000, actual: 60_000, percent_complete: 50 }]), 'cpi-low')?.amount ?? 0) > 20_000,
  'the rate is what finishes the job');

{
  /* One line driving most of the overrun is worth saying out loud, because a
     concentrated problem is fixable and a spread one is not. */
  const h = assessBudget([
    { cost_code: 'BIG', revised_budget: 100_000, actual: 90_000, percent_complete: 40 },
    { cost_code: 'SMALL', revised_budget: 50_000, actual: 26_000, percent_complete: 50 },
  ]);
  check('a concentrated overrun is called out',
    !!find(h, 'concentration'), find(h, 'concentration')?.title ?? 'not found');
}

/* ── a healthy budget comes back healthy ─────────────────────────────────── */

{
  const good: BudgetLine[] = [
    /* carried_actual 0 means adopted into the document ledger with every dollar
       explained by a purchase order or a bill — which is what a budget that is
       genuinely being run properly looks like. */
    { cost_code: '03-300', original_budget: 400_000, approved_changes: 20_000, revised_budget: 420_000, committed: 415_000, actual: 210_000, projected: 420_000, variance: 0, percent_complete: 50, carried_actual: 0, carried_committed: 0 },
    { cost_code: '05-120', original_budget: 600_000, approved_changes: 0, revised_budget: 600_000, committed: 590_000, actual: 300_000, projected: 600_000, variance: 0, percent_complete: 50, carried_actual: 0, carried_committed: 0 },
  ];
  const h = assessBudget(good);
  check('a budget that foots, is committed and is progressing has no blockers',
    h.blockers === 0, `${h.blockers} blockers, ${h.warnings} warnings`);
  check('open commitment is reported',
    h.totals.openCommitment === 495_000, `${h.totals.openCommitment} committed but not yet spent`);
  check('percent complete comes from earned value, not from spend',
    h.totals.percentComplete === 50, `${h.totals.percentComplete}%`);
  check('and it scores well', h.score >= 85, `${h.score}`);
}

/* ── a forecast is refused when there is nothing to forecast from ────────── */

{
  /* The live concrete line: $478,000 budget, $360,000 spent, 0% complete.
     The textbook EAC is AC + (BAC − EV) = $838,000, which is arithmetically
     correct and practically absurd — it says $360,000 bought nothing. */
  const f = forecastLine({ revised_budget: 478_000, actual: 360_000, percent_complete: 0, committed: 0 });
  check('a line with spend and no progress is NOT forecastable',
    f.forecastable === false && f.method === 'no-progress',
    'refused rather than dressed up as a number');
  check('and the floor is reported instead of the absurd figure',
    f.recommended === 478_000,
    `${f.recommended} — the budget, not the $838,000 the formula would produce`);
  check('the textbook reading is still there for anyone who wants it',
    f.eacAtBudget === 838_000, `${f.eacAtBudget} — available, just not recommended`);
  check('a line WITH progress stays forecastable',
    forecastLine({ revised_budget: 478_000, actual: 360_000, percent_complete: 60 }).forecastable === true,
    'the refusal is about missing data, not about bad news');

  /* The mirror image, which is just as wrong and easier to miss. The live steel
     line: 36% progress booked, not a dollar invoiced. AC + (BAC − EV) says the
     36% was free and will stay free. */
  const g = forecastLine({ revised_budget: 620_000, actual: 0, committed: 0, percent_complete: 36 });
  check('progress with NO cost booked is not forecastable either',
    g.forecastable === false && g.method === 'no-cost',
    'cost has not caught up with the field yet');
  check('and the floor is the budget, not the discounted figure',
    g.recommended === 620_000,
    `${g.recommended} — the formula would have said ${g.eacAtBudget}, as if 36% of the work were free`);
  check('a line with progress AND a commitment still forecasts',
    forecastLine({ revised_budget: 620_000, actual: 0, committed: 590_000, percent_complete: 36 }).forecastable === true,
    'a signed contract is cost that is known, even before it is invoiced');
}

/* ── an opening balance is not uncontrolled spend ────────────────────────── */

{
  /* The live shape. $422,000 of cost with nothing committed — but every dollar
     of it recorded in carried_actual, meaning the line was adopted into the
     document ledger and this balance predates it. The engine called that
     "spend beyond what was ever committed", which is the same words it uses
     for money genuinely going out with no contract behind it. */
  const adopted = assessBudget([
    { cost_code: '01-000', original_budget: 175_000, approved_changes: 0, revised_budget: 175_000, committed: 0, actual: 62_000, carried_actual: 62_000, carried_committed: 0, percent_complete: 44.6 },
    { cost_code: '03-300', original_budget: 450_000, approved_changes: 70_500, revised_budget: 520_500, committed: 0, actual: 360_000, carried_actual: 360_000, carried_committed: 0, percent_complete: 91 },
  ]);
  check('a fully carried balance is NOT reported as uncommitted spend',
    !find(adopted, 'uncommitted-spend'),
    'an opening balance and uncontrolled spend are different facts');
  check('it is reported as an opening balance instead, as a note',
    find(adopted, 'carried-balance')?.severity === 'note' && find(adopted, 'carried-balance')?.amount === 422_000,
    `${money0(find(adopted, 'carried-balance')?.amount ?? 0)} carried`);
  check('and that alone does not block the budget',
    adopted.blockers === 0, `${adopted.blockers} blockers`);

  /* Real uncontrolled spend still blocks: a bill booked past the ledger's own
     commitments, over and above whatever was carried. */
  const uncontrolled = assessBudget([
    { cost_code: 'X', revised_budget: 100_000, committed: 10_000, actual: 60_000, carried_actual: 20_000, carried_committed: 0, percent_complete: 50 },
  ]);
  check('spend past the LEDGER commitments still blocks',
    find(uncontrolled, 'uncommitted-spend')?.severity === 'blocker' &&
    find(uncontrolled, 'uncommitted-spend')?.amount === 30_000,
    `${money0(find(uncontrolled, 'uncommitted-spend')?.amount ?? 0)} — 40,000 of ledger spend against 10,000 committed`);

  /* Never adopted at all is a third thing again: nobody knows where the money
     came from, because no rollup has ever looked. */
  const virgin = assessBudget([
    { cost_code: 'Y', revised_budget: 100_000, committed: 0, actual: 50_000, percent_complete: 50 },
  ]);
  check('a line that has never been rolled up is flagged as unreconciled',
    find(virgin, 'not-adopted')?.severity === 'warn',
    'null carried_actual means no rollup has ever looked at it');
  check('and its spend is still treated as uncommitted until it is',
    !!find(virgin, 'uncommitted-spend'), 'unknown provenance is not the same as explained');
}

check('an empty budget is handled',
  assessBudget([]).findings.length === 0 && assessBudget([]).score === 100, 'no crash');

console.log(failures === 0 ? '\nALL BUDGET HEALTH ASSERTIONS HELD' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
