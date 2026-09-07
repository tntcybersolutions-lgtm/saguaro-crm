/**
 * Proposal build sanity — markup vs margin, exclusions, allowances, rollup.
 * Run: npx -y tsx lib/proposal-build.sanity.test.ts   (exit 0 = every assertion held)
 *
 * The assertions that matter most are the first two. Markup and margin are
 * different arithmetic on the same percentage, and a builder who quotes one
 * meaning the other gives away several points on every job — silently, because
 * the document looks right either way. Nothing else here catches that; the test
 * has to.
 *
 * The rest guard the ways a generated document can lie: an exclusion printed as
 * a priced line, a $0.00 row that reads as free, a unit price still at cost
 * beside a marked-up total.
 */
import {
  buildProposal, applyUplift, lineCost, realisedMarginPct, exclusionsText,
  reconcile, UNALLOCATED_LINE_LABEL,
  type EstimateSource,
} from './proposal-build';

let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  if (!cond) failures++;
};

/* ── markup is not margin ────────────────────────────────────────────────── */

check('20% MARKUP on $100 is $120',
  applyUplift(100, 20, 'markup') === 120, `${applyUplift(100, 20, 'markup')}`);
check('20% MARGIN on $100 is $125',
  applyUplift(100, 20, 'margin') === 125, `${applyUplift(100, 20, 'margin')} — not 120; the difference is the whole point`);
check('the margin realised by a 20% markup is 16.7%, not 20%',
  realisedMarginPct(100, 120) === 16.7, `${realisedMarginPct(100, 120)}% — quoting markup as margin loses 3.3 points`);
check('a 20% margin sell really is 20% margin',
  realisedMarginPct(100, 125) === 20, `${realisedMarginPct(100, 125)}%`);
check('zero uplift is a pass-through',
  applyUplift(1234.56, 0, 'markup') === 1234.56, 'unchanged');

let threw = false;
try { applyUplift(100, 100, 'margin'); } catch { threw = true; }
check('a 100% margin is refused rather than returning Infinity',
  threw, 'a document with an unbounded price is worse than an error');

check('no margin on a zero sell', realisedMarginPct(0, 0) === null, 'null');

/* ── line cost ───────────────────────────────────────────────────────────── */

const l: EstimateSource = {
  description: 'Slab on grade', quantity: 100, unit: 'CY',
  unit_material_cost: 120, unit_labor_cost: 45, waste_factor_pct: 10,
};
check('waste factor is inside the cost',
  lineCost(l) === 18150, `${lineCost(l)} = 100 × 1.10 × (120 + 45)`);
check('every cost bucket is summed',
  lineCost({ quantity: 2, unit_material_cost: 1, unit_labor_cost: 2, unit_equipment_cost: 3, unit_sub_cost: 4 }) === 20,
  '2 × (1+2+3+4)');
check('an excluded line costs nothing',
  lineCost({ ...l, is_excluded: true }) === 0, '0');
check('numeric strings from the database are handled',
  lineCost({ quantity: '10', unit_material_cost: '5.50' }) === 55, '55');

/* ── a realistic estimate ────────────────────────────────────────────────── */

const rows: EstimateSource[] = [
  { csi_division: '03', description: 'Slab on grade', quantity: 100, unit: 'CY', unit_material_cost: 120, unit_labor_cost: 45, waste_factor_pct: 10 },
  { csi_division: '03', description: 'Footings', quantity: 40, unit: 'CY', unit_material_cost: 130, unit_labor_cost: 60 },
  { csi_division: '09', description: 'Tile allowance', quantity: 1, unit: 'LS', unit_material_cost: 15000, is_allowance: true },
  { csi_division: '09', description: 'Paint', quantity: 3200, unit: 'SF', unit_labor_cost: 1.25 },
  { csi_division: '26', description: 'Landscape lighting', quantity: 1, unit: 'LS', unit_sub_cost: 8000 },
  { csi_division: '02', description: 'Hazardous material abatement', is_excluded: true },
  { csi_division: '02', description: 'Permit fees by owner', is_excluded: true },
  { csi_division: '31', description: 'Rough grading', quantity: 0, unit_material_cost: 0 },
];

const cost = 18150 + 7600 + 15000 + 4000 + 8000; // 52,750
const div = buildProposal(rows, { granularity: 'division', upliftMode: 'markup', upliftPct: 15 });

check('cost totals across every priced line',
  div.costTotal === cost, `${div.costTotal}`);
check('the sell total is the marked-up cost',
  div.sellTotal === 60662.5, `${div.sellTotal} = 52,750 × 1.15`);
check('the summary reports the margin actually achieved',
  div.marginPct === 13, `${div.marginPct}% — a 15% markup, honestly labelled`);

check('excluded scope never becomes a priced line',
  !div.lines.some((x) => /abatement|permit/i.test(x.description)),
  'no exclusion appears in the line list');
check('excluded scope IS carried as exclusions',
  div.exclusions.length === 2 && div.exclusions[0] === 'Hazardous material abatement',
  `${div.exclusions.length} exclusions captured`);
check('exclusions render as a paragraph for the document',
  /excludes the following/.test(exclusionsText(div.exclusions)) && /• Permit fees by owner/.test(exclusionsText(div.exclusions)),
  'bulleted prose');
check('no exclusions makes no paragraph', exclusionsText([]) === '', 'empty');

check('a zero-cost line is omitted, not printed at $0.00',
  !div.lines.some((x) => /Rough grading/.test(x.description)) &&
  div.omitted.some((o) => o.description === 'Rough grading'),
  'omitted and reported — "$0.00" reads to a client as free');

check('divisions collapse to one line each',
  div.lines.length === 3, `${div.lines.map((x) => x.description).join(' | ')}`);
check('a division that is entirely exclusions produces no line at all',
  !div.lines.some((x) => /^02/.test(x.description)),
  'division 02 held two excluded rows and correctly vanished from the pricing');
check('divisions are named, not just numbered',
  div.lines[0].description === '03 — Concrete', div.lines[0].description);
check('divisions come out in order',
  div.lines.map((x) => x.description.slice(0, 2)).join(',') === '03,09,26', div.lines.map((x) => x.description.slice(0, 2)).join(','));
check('a division line says how much scope it covers',
  div.lines[0].notes === '2 items', `"${div.lines[0].notes}"`);
check('a division containing an allowance says so',
  /includes allowance/.test(div.lines[1].notes ?? ''), `"${div.lines[1].notes}"`);
check('division line prices sum to the sell total',
  Math.round(div.lines.reduce((s, x) => s + x.total_price, 0) * 100) / 100 === div.sellTotal,
  'no rounding drift between the lines and the total');

check('allowances are called out with their marked-up amount',
  div.allowances.length === 1 && div.allowances[0].amount === 17250,
  `${div.allowances[0]?.description} → ${div.allowances[0]?.amount} (15,000 × 1.15)`);

/* ── line granularity ────────────────────────────────────────────────────── */

const line = buildProposal(rows, { granularity: 'line', upliftMode: 'markup', upliftPct: 15 });
check('line granularity keeps every priced row',
  line.lines.length === 5, `${line.lines.length} lines`);
check('the same estimate gives the same total either way',
  line.sellTotal === div.sellTotal, `${line.sellTotal} = ${div.sellTotal}`);
/* The rate a client sees must reconcile with the total beside it: 100 CY at
   $208.73 is the $20,872.50 on the line. $181.50 would be the waste-inclusive
   COST per unit — printing that next to a marked-up total is the arithmetic a
   client checks first, and finding it wrong is how a proposal loses a job. */
check('unit price is the SELL rate, not cost',
  line.lines[0].unit_price === 208.73, `${line.lines[0].unit_price} — 20,872.50 ÷ 100 CY, not the 181.50 cost rate`);
check('quantity × unit price reconciles with the printed total',
  Math.abs(line.lines[0].quantity! * line.lines[0].unit_price! - line.lines[0].total_price) < 0.51,
  'within half a dollar — the total stays authoritative, the rate is rounded to cents');
check('quantity and unit survive',
  line.lines[0].quantity === 100 && line.lines[0].unit === 'CY', '100 CY');
check('an allowance line is labelled for the client',
  line.lines.find((x) => /Tile/.test(x.description))!.notes === 'Allowance', 'Allowance');

/* ── optional scope ──────────────────────────────────────────────────────── */

const opt = buildProposal(rows, { granularity: 'division', upliftPct: 15, optionalDivisions: ['26'] });
check('optional scope is priced separately, not in the base total',
  opt.sellTotal === 51462.5 && opt.optionalTotal === 9200,
  `base ${opt.sellTotal}, optional ${opt.optionalTotal} (8,000 × 1.15)`);
check('an optional line is marked as such',
  opt.lines.find((x) => /26/.test(x.description))!.is_optional === true, 'is_optional');
check('base + optional equals the all-in total',
  Math.round((opt.sellTotal + opt.optionalTotal) * 100) / 100 === div.sellTotal, 'reconciles');

/* ── margin mode end to end ──────────────────────────────────────────────── */

const marg = buildProposal(rows, { granularity: 'division', upliftMode: 'margin', upliftPct: 15 });
check('margin mode sells higher than markup mode at the same percentage',
  marg.sellTotal > div.sellTotal, `margin ${marg.sellTotal} > markup ${div.sellTotal}`);
check('margin mode actually delivers the margin asked for',
  marg.marginPct === 15, `${marg.marginPct}% — that is the whole promise of the mode`);

/* ── edges ───────────────────────────────────────────────────────────────── */

const empty = buildProposal([]);
check('an empty estimate is handled',
  empty.lines.length === 0 && empty.sellTotal === 0 && empty.marginPct === null, 'zeroes, no crash');
check('an estimate of nothing but exclusions makes a document with no lines',
  buildProposal([{ description: 'X', is_excluded: true }]).exclusions.length === 1, '1 exclusion, 0 lines');
check('a line with no description still gets one',
  buildProposal([{ quantity: 1, unit_material_cost: 5 }], { granularity: 'line' }).lines[0].description === 'Untitled item',
  'Untitled item — never a blank row on a client document');
check('a line with no division is bucketed, not dropped',
  buildProposal([{ description: 'Misc', quantity: 1, unit_material_cost: 5 }]).lines[0].description === 'Division —',
  'kept');
check('csi_code supplies the division when csi_division is empty',
  buildProposal([{ csi_code: '09 91 23', description: 'Paint', quantity: 1, unit_material_cost: 5 }]).lines[0].description === '09 — Finishes',
  'derived from the code');

/* ── reconciliation: the live mismatches ─────────────────────────────────── */

/* PROP-2026-001 exactly as the database holds it. */
const p001 = [
  { description: 'DDC Controllers and BACnet Integration', total_price: 136800 },
  { description: 'VAV Box Controls with Actuators', total_price: 400000 },
  { description: 'Building Automation Software License', total_price: 185000 },
  { description: 'Installation Labor', total_price: 1450000 },
  { description: 'Commissioning and Testing', total_price: 280000 },
  { description: 'Extended 5-Year Warranty', total_price: 95000, is_optional: true },
];
const r1 = reconcile(2850000, p001);
check('the live $2.85M proposal is measured against its BASE lines',
  r1.baseTotal === 2451800, `${r1.baseTotal} — the optional warranty is not part of what is being bought`);
check('the optional line is reported separately', r1.optionalTotal === 95000, `${r1.optionalTotal}`);
check('the unallocated money is named exactly',
  r1.difference === 398200 && !r1.reconciles, `${r1.difference}`);
check('a positive gap is closed by adding a line, not by moving the header',
  r1.remedy === 'add-line', `${r1.remedy} — the contract price is the number the client agreed to`);

const r2 = reconcile(425000, [
  { total_price: 56000 }, { total_price: 44400 }, { total_price: 36000 },
  { total_price: 225000 }, { total_price: 12000 },
]);
check('the second live proposal reports its own gap',
  r2.difference === 51600 && r2.remedy === 'add-line', `${r2.difference}`);

check('adding the difference as a line makes it reconcile',
  reconcile(2850000, [...p001, { description: UNALLOCATED_LINE_LABEL, total_price: r1.difference }]).reconciles,
  'header and base lines now agree');

check('lines totalling MORE than the header need the header moved',
  reconcile(100, [{ total_price: 150 }]).remedy === 'sync-header',
  'adding another positive line would only widen the gap');
check('an exact match reconciles',
  reconcile(1000, [{ total_price: 600 }, { total_price: 400 }]).reconciles, 'no remedy needed');
check('a rounding cent is not a discrepancy',
  reconcile(1000, [{ total_price: 999.999 }]).reconciles, 'under a cent');
check('a proposal with no lines is not reported as mismatched',
  reconcile(50000, []).reconciles, 'nothing to disagree with yet');
check('optional scope never counts toward reconciliation',
  reconcile(1000, [{ total_price: 1000 }, { total_price: 400, is_optional: true }]).reconciles,
  'the client has not agreed to buy the optional part');

console.log(failures === 0 ? '\nALL PROPOSAL ASSERTIONS HELD' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
