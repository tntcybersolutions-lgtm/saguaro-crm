/**
 * Bid waterfall and readiness sanity.
 * Run: npx -y tsx lib/estimate-bid.sanity.test.ts
 *
 * The assertion that matters most is the bond. A surety's premium is a share of
 * the CONTRACT, and the contract includes the premium — so the rate has to be
 * grossed up, not applied to the subtotal. Every spreadsheet gets this wrong
 * unless somebody sat down and thought about it, and the error is paid out of
 * the estimator's own fee.
 *
 * After that: the order of operations. Contingency added at the END earns no
 * overhead and no profit, which means working for free on exactly the part of
 * the job you were least sure about.
 */
import {
  bidWaterfall, bucketSplit, assessReadiness, impliedMultiplier,
} from './estimate-bid';
import type { GridRow } from './estimate-grid';

let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  if (!cond) failures++;
};
const step = (r: ReturnType<typeof bidWaterfall>, key: string) => r.steps.find((s) => s.key === key);

/* ── the bond, which is the one nearly everyone gets wrong ───────────────── */

{
  /* $1,000,000 subtotal at a 1.5% bond rate.
     Wrong (and usual):  1,000,000 × 1.015          = 1,015,000
     Right:              1,000,000 ÷ (1 − 0.015)    = 1,015,228.43
     The $228 gap IS the premium on the premium, and it comes out of the fee. */
  const r = bidWaterfall(1_000_000, { bondPct: 1.5 });
  check('the bond is grossed up, not applied to the subtotal',
    Math.abs(r.bidPrice - 1_015_228.43) < 0.5,
    `$${r.bidPrice.toLocaleString('en-US')} — the naive 1,015,000 under-collects by $228`);
  check('and the premium really is 1.5% of the FINAL contract',
    Math.abs(step(r, 'bond')!.amount / r.bidPrice - 0.015) < 0.000001,
    `${((step(r, 'bond')!.amount / r.bidPrice) * 100).toFixed(4)}% of the bid price`);

  const big = bidWaterfall(4_000_000, { bondPct: 1.5 });
  check('on a $4M job the difference is real money',
    Math.round(big.bidPrice - 4_060_000) === 914,
    `$${Math.round(big.bidPrice - 4_060_000)} more than the naive calculation collects`);

  let threw = false;
  try { bidWaterfall(100, { bondPct: 100 }); } catch { threw = true; }
  check('a 100% bond rate is refused rather than dividing by zero', threw, 'unbounded');
}

/* ── order of operations ─────────────────────────────────────────────────── */

{
  const r = bidWaterfall(100_000, { contingencyPct: 5, overheadPct: 10, profitPct: 8 });
  check('contingency is added before overhead and profit',
    step(r, 'contingency')!.runningTotal === 105_000, `${step(r, 'contingency')!.runningTotal}`);
  check('overhead is earned on the contingency too',
    step(r, 'overhead')!.amount === 10_500,
    `${step(r, 'overhead')!.amount} — 10% of 105,000, not of 100,000`);
  check('profit is earned on cost plus contingency plus overhead',
    Math.abs(step(r, 'profit')!.amount - 9_240) < 0.01,
    `${step(r, 'profit')!.amount} — 8% of 115,500`);
  check('the bid price is the last running total',
    Math.abs(r.bidPrice - 124_740) < 0.01, `$${r.bidPrice.toLocaleString('en-US')}`);

  /* The counter-example, spelled out: contingency at the end. */
  const late = bidWaterfall(100_000, { overheadPct: 10, profitPct: 8 }).bidPrice + 5_000;
  check('adding contingency at the END leaves money on the table',
    r.bidPrice > late, `${r.bidPrice} vs ${late} — $${Math.round(r.bidPrice - late)} of unearned OH&P`);
}

/* ── markup is not margin, again, because it is still not ────────────────── */

{
  const markup = bidWaterfall(100_000, { profitPct: 20, profitMode: 'markup' });
  const margin = bidWaterfall(100_000, { profitPct: 20, profitMode: 'margin' });
  check('20% markup on 100k bids 120k', markup.bidPrice === 120_000, `${markup.bidPrice}`);
  check('20% margin on 100k bids 125k', margin.bidPrice === 125_000, `${margin.bidPrice}`);
  check('the markup bid realises only 16.7% margin',
    markup.realisedMarginPct === 16.7, `${markup.realisedMarginPct}% — quoting markup as margin loses 3.3 points`);
  check('the margin bid realises the 20% asked for',
    margin.realisedMarginPct === 20, `${margin.realisedMarginPct}%`);
  let threw = false;
  try { bidWaterfall(100, { profitPct: 100, profitMode: 'margin' }); } catch { threw = true; }
  check('a 100% profit margin is refused', threw, 'unbounded');
}

/* ── the whole waterfall, as an estimator would set it ───────────────────── */

{
  const r = bidWaterfall(2_400_000, {
    contingencyPct: 3, escalationPct: 2, overheadPct: 8,
    profitPct: 6, profitMode: 'markup', insurancePct: 1.2, bondPct: 1.1,
  });
  check('every configured step appears once',
    r.steps.map((s) => s.key).join(',') === 'cost,contingency,escalation,overhead,profit,insurance,bond',
    r.steps.map((s) => s.key).join(' → '));
  check('the running total never goes backwards',
    r.steps.every((s, i) => i === 0 || s.runningTotal >= r.steps[i - 1].runningTotal), 'monotonic');
  check('add-ons reconcile with the bid price',
    Math.abs(r.directCost + r.totalAddOns - r.bidPrice) < 0.01,
    `${r.directCost} + ${r.totalAddOns} = ${r.bidPrice}`);
  check('the multiplier is reported',
    r.multiplier !== null && r.multiplier > 1.2 && r.multiplier < 1.3, `${r.multiplier}×`);
}

check('a bid with no add-ons is just the cost',
  bidWaterfall(50_000).bidPrice === 50_000 && bidWaterfall(50_000).steps.length === 1, 'one step');
check('zero cost does not divide by zero',
  bidWaterfall(0, { bondPct: 2, profitPct: 10 }).multiplier === null, 'null multiplier');
check('implied multiplier reads a competitor’s number',
  impliedMultiplier(100_000, 128_500) === 1.285, '1.285×');

/* ── cost distribution ───────────────────────────────────────────────────── */

{
  const rows: GridRow[] = [
    { description: 'A', quantity: 100, unit_material_cost: 10, unit_labor_cost: 5 },
    { description: 'B', quantity: 50, unit_sub_cost: 40 },
    { description: 'C', quantity: 10, unit_equipment_cost: 25 },
  ];
  const b = bucketSplit(rows);
  check('buckets split correctly',
    b.material === 1000 && b.labor === 500 && b.sub === 2000 && b.equipment === 250, `${b.total} total`);
  check('percentages sum to about 100',
    Math.abs(b.materialPct + b.laborPct + b.equipmentPct + b.subPct - 100) < 0.2,
    `${b.materialPct}/${b.laborPct}/${b.equipmentPct}/${b.subPct}`);
  check('an empty estimate splits to zero without dividing by zero',
    bucketSplit([]).total === 0 && bucketSplit([]).materialPct === 0, 'zeroes');
  check('waste factor reaches the split',
    bucketSplit([{ quantity: 100, waste_factor_pct: 10, unit_material_cost: 1 }]).material === 110, '110');
}

/* ── readiness ───────────────────────────────────────────────────────────── */

{
  const rows: GridRow[] = [
    { description: 'Priced properly', csi_division: '03', quantity: 100, unit_material_cost: 12 },
    { description: 'Quantity but no price', csi_division: '03', quantity: 250 },
    { description: '', csi_division: '09', quantity: 10, unit_material_cost: 5 },
    { description: 'Priced but no quantity', csi_division: '09', unit_material_cost: 80 },
    { description: 'Tile allowance', csi_division: '09', quantity: 1, unit_material_cost: 15000, is_allowance: true },
    { description: 'From the library', csi_division: '09', quantity: 200, unit_material_cost: 8.75, assembly_id: 'partition-stud-gwb' },
    { description: 'Placeholder cost', csi_division: '26', quantity: 1, unit_sub_cost: 25000 },
    { description: 'Hazmat abatement', csi_division: '02', is_excluded: true },
    { description: 'Uncoded work', quantity: 5, unit_material_cost: 100 },
    { description: 'Priced properly', csi_division: '03', quantity: 100, unit_material_cost: 12 },
  ];
  const r = assessReadiness(rows, { budgetDivisions: ['03', '09', '22', '26'] });
  const find = (m: RegExp) => r.findings.find((f) => m.test(f.title));

  check('a quantity with no price is a BLOCKER',
    find(/quantity but no price/)?.severity === 'blocker', 'blocker');
  check('a price with no quantity is a blocker',
    find(/no quantity/)?.severity === 'blocker', 'blocker');
  check('a nameless line is a blocker',
    find(/no description/)?.severity === 'blocker', 'nobody can buy out an unnamed line');
  check('blockers sort above everything else',
    r.findings[0].severity === 'blocker', `first is ${r.findings[0].severity}`);

  check('allowances are flagged with the money they carry',
    find(/allowance/)?.amount === 15000, `$${find(/allowance/)?.amount}`);
  check('library-priced lines are flagged with their value',
    find(/library pricing/)?.amount === 1750, `$${find(/library pricing/)?.amount} — 200 × 8.75`);
  check('a suspiciously round unit cost is flagged',
    !!find(/placeholder/), 'exact thousands in a unit-cost column');
  check('a budgeted division with no lines is flagged',
    /22/.test(find(/budgeted division/)?.detail ?? ''), find(/budgeted division/)?.detail ?? 'not found');

  check('an uncoded line is only a note',
    find(/without a cost code/)?.severity === 'note', 'tidy-up, not risk');
  check('exclusions are noted for the proposal',
    find(/exclusion/)?.severity === 'note', 'has to appear in writing');
  check('a duplicated description is noticed',
    !!find(/more than once/), 'a paste that landed twice');

  check('a blocker caps the score',
    r.score <= 45, `${r.score} — the number itself is wrong, not just untidy`);
  check('counts are reported', r.blockers === 3 && r.warnings >= 3, `${r.blockers} blockers, ${r.warnings} warnings`);
}

{
  /* A clean estimate should come back clean. */
  const clean: GridRow[] = [
    { description: 'Concrete', csi_division: '03', csi_code: '03 30 00', quantity: 100, unit_material_cost: 148.5, unit_labor_cost: 34.25 },
    { description: 'Rebar', csi_division: '03', csi_code: '03 21 00', quantity: 640, unit_material_cost: 0.94, unit_labor_cost: 0.72 },
  ];
  const r = assessReadiness(clean);
  check('a clean estimate reports no blockers and no warnings',
    r.blockers === 0 && r.warnings === 0, `${r.findings.length} findings`);
  check('and scores 100', r.score === 100, `${r.score}`);
  check('priced line count is reported', r.pricedLines === 2 && r.totalLines === 2, '2 of 2');
}

check('an empty estimate is handled',
  assessReadiness([]).findings.length === 0 && assessReadiness([]).score === 100, 'no crash');
check('an excluded line is not treated as unpriced',
  assessReadiness([{ description: 'Excluded', is_excluded: true }]).blockers === 0,
  'exclusions price nothing by design');

/* ── the division check must read a code, not only a division field ─────── */

{
  /* Live rows carry their division in csi_code with csi_division empty. Reading
     only csi_division reported division 03 as missing from an estimate with two
     lines of concrete plainly in it. */
  const rows: GridRow[] = [
    { description: 'Slab', csi_code: '03 30 00', quantity: 10, unit_material_cost: 100 },
    { description: 'Rebar', csi_code: '03 21 00', quantity: 10, unit_material_cost: 100 },
  ];
  const r = assessReadiness(rows, { budgetDivisions: ['03', '09'] });
  const f = r.findings.find((x) => /budgeted division/.test(x.title));
  check('a division given only in csi_code counts as present',
    !!f && !/03/.test(f.detail) && /09/.test(f.detail),
    f ? f.detail : 'no finding raised at all');
}

check('a warning keeps the score below full marks',
  assessReadiness([{ description: 'A', quantity: 1, unit_material_cost: 100, is_allowance: true }]).score <= 92,
  '"100" beside "1 thing unresolved" reads as a contradiction');

console.log(failures === 0 ? '\nALL BID ASSERTIONS HELD' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
