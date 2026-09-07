/**
 * Scale test for the estimate grid — the gap named out loud.
 *
 * The grid had been proven against a 3-row takeoff. A real commercial bid is
 * 300-800 lines, and the things that break at that size are not the things that
 * break at three: recalculation that is quadratic in the row count, a paste that
 * reparses the whole sheet per cell, a save payload too big for the request.
 *
 * Budgets are deliberately tight. A recalculation an estimator can feel is a
 * recalculation they will turn off.
 *
 * Run: npx tsx scripts/estimate-scale.test.mjs
 */
import { recalc, recalcRows, formulaMapFromRows, cellKey } from '../lib/estimate-formula.ts';
import { expandAssembly, ASSEMBLIES, ASSEMBLY_BY_ID } from '../lib/estimate-assemblies.ts';
import { clipboardToRows, parseClipboard, estimateTotals, lineTotals, groupRows } from '../lib/estimate-grid.ts';

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
};
const ms = (f) => { const t = process.hrtime.bigint(); const r = f(); return { r, ms: Number(process.hrtime.bigint() - t) / 1e6 }; };
const n = (x) => x.toLocaleString('en-US');

/* ── build a realistic 500-line estimate ─────────────────────────────────── */

const DIVISIONS = ['03', '04', '05', '06', '07', '08', '09', '21', '22', '23', '26', '31', '32'];
const N = 500;

const rows = Array.from({ length: N }, (_, i) => ({
  csi_division: DIVISIONS[i % DIVISIONS.length],
  csi_code: `${DIVISIONS[i % DIVISIONS.length]} ${String(10 + (i % 80)).padStart(2, '0')} 00`,
  description: `Line item ${i + 1} — scope of work for bid package ${1 + (i % 12)}`,
  quantity: 10 + (i % 400),
  unit: ['SF', 'LF', 'CY', 'EA', 'LB', 'TON'][i % 6],
  waste_factor_pct: i % 5 === 0 ? 10 : 0,
  unit_material_cost: Math.round((5 + (i % 190)) * 100) / 100,
  unit_labor_cost: Math.round((2 + (i % 95)) * 100) / 100,
  unit_equipment_cost: i % 7 === 0 ? 12.5 : 0,
  unit_sub_cost: i % 11 === 0 ? 340 : 0,
  is_allowance: i % 40 === 0,
  is_excluded: i % 97 === 0,
  sort_order: i,
  formulas: null,
}));

console.log(`\n${n(N)} line estimate\n`);

/* ── plain totals ────────────────────────────────────────────────────────── */

{
  const t = ms(() => estimateTotals(rows));
  check(`totals across ${n(N)} lines are fast`, t.ms < 60, `${t.ms.toFixed(1)}ms — $${n(Math.round(t.r.total))}`);
  check('the totals are non-trivial', t.r.total > 1_000_000, `$${n(Math.round(t.r.total))}`);

  const g = ms(() => groupRows(rows));
  check('grouping by division is fast', g.ms < 60, `${g.ms.toFixed(1)}ms, ${g.r.length} divisions`);

  const sumOfGroups = Math.round(g.r.reduce((s, x) => s + x.total, 0) * 100) / 100;
  check('group totals reconcile with the estimate total',
    Math.abs(sumOfGroups - t.r.total) < 0.01, `${n(sumOfGroups)} = ${n(t.r.total)}`);
}

/* ── every row carrying a formula ────────────────────────────────────────── */

{
  const withFormulas = rows.map((r, i) => ({
    ...r,
    formulas: {
      /* A mix of the shapes estimators actually write: same-row arithmetic, a
         percentage, and a cross-row reference to the line above. */
      unit_labor_cost: i % 3 === 0 ? '=MAT*0.65' : undefined,
      unit_material_cost: i % 5 === 1 ? '=QTY*0.12+4' : undefined,
      unit_equipment_cost: i % 7 === 2 && i > 0 ? `=G${i}*0.1` : undefined,
    },
  })).map((r) => ({ ...r, formulas: Object.fromEntries(Object.entries(r.formulas).filter(([, v]) => v)) }));

  const map = formulaMapFromRows(withFormulas);
  const count = Object.keys(map).length;
  check(`about half the sheet holds formulas`, count > N * 0.4, `${n(count)} formula cells`);

  const t = ms(() => recalcRows(withFormulas));
  check(`recalculating ${n(count)} formulas stays interactive`,
    t.ms < 400, `${t.ms.toFixed(0)}ms — anything an estimator can feel gets switched off`);
  check('no errors across the whole sheet',
    Object.keys(t.r.errors).length === 0, `${Object.keys(t.r.errors).length} errors`);
  check('every formula cell was computed', t.r.formulaCells === count, `${n(t.r.formulaCells)}`);

  /* Spot-check one: row 3 (index 3) has unit_labor_cost = MAT * 0.65. */
  const i = 3;
  const expect = Math.round(withFormulas[i].unit_material_cost * 0.65 * 1e6) / 1e6;
  check('a spot-checked formula row is right',
    Math.abs(Number(t.r.rows[i].unit_labor_cost) - expect) < 0.000001,
    `row ${i + 1} labor = ${t.r.rows[i].unit_labor_cost} = material × 0.65`);
}

/* ── a deep dependency chain, the shape that kills a naive evaluator ─────── */

{
  const chain = Array.from({ length: 400 }, () => ({
    quantity: 1, waste_factor_pct: 0,
    unit_material_cost: 0, unit_labor_cost: 0, unit_equipment_cost: 0, unit_sub_cost: 0,
  }));
  chain[0].unit_material_cost = 2;
  const f = {};
  for (let i = 1; i < chain.length; i++) f[cellKey(i, 'unit_material_cost')] = `=F${i}+1`;

  const t = ms(() => recalc(chain, f));
  check('a 400-deep dependency chain resolves',
    Number(t.r.rows[399].unit_material_cost) === 401 && Object.keys(t.r.errors).length === 0,
    `last cell = ${t.r.rows[399].unit_material_cost}, ${t.ms.toFixed(0)}ms`);
  check('the chain does not blow the stack or crawl', t.ms < 400, `${t.ms.toFixed(0)}ms`);
}

/* ── a wide SUM over the whole column ────────────────────────────────────── */

{
  const wide = rows.map((r) => ({ ...r }));
  const t = ms(() => recalc(wide, { [cellKey(0, 'unit_sub_cost')]: `=SUM(F1:F${N})` }));
  const expected = Math.round(rows.reduce((s, r) => s + r.unit_material_cost, 0) * 1e6) / 1e6;
  /* Row 1 is itself in the range, so its own pre-formula value is what feeds
     the sum — the memoised value, not a cycle. */
  check(`SUM across ${n(N)} rows computes`,
    Math.abs(Number(t.r.rows[0].unit_sub_cost) - expected) < 0.01,
    `${n(Math.round(Number(t.r.rows[0].unit_sub_cost)))} in ${t.ms.toFixed(0)}ms`);
  check('a full-column SUM is fast', t.ms < 200, `${t.ms.toFixed(0)}ms`);
}

/* ── pasting a big block ─────────────────────────────────────────────────── */

{
  const lines = [];
  for (let i = 0; i < 300; i++) {
    lines.push(`03 30 00\tPasted line ${i + 1}\t${100 + i}\tSF\t$${(12.5 + i / 10).toFixed(2)}\t${(4.25).toFixed(2)}\t0\t0`);
  }
  const tsv = lines.join('\n');
  /* The real path: parse the clipboard text into a grid, then map it onto rows.
     Timing them together is what the user actually waits for. */
  const t = ms(() => clipboardToRows(parseClipboard(tsv)));
  check('pasting 300 rows from Excel is instant',
    t.ms < 150 && t.r.rows.length === 300, `${t.r.rows.length} rows in ${t.ms.toFixed(0)}ms`);
  check('pasted money survives the $ and the commas',
    t.r.rows[0].unit_material_cost === 12.5, `${t.r.rows[0].unit_material_cost}`);
  check('pasted quantities survive', t.r.rows[299].quantity === 399, `${t.r.rows[299].quantity}`);
}

/* ── expanding every assembly in the library at once ─────────────────────── */

{
  const t = ms(() => {
    const all = [];
    let sort = 0;
    for (const a of ASSEMBLIES) {
      const r = expandAssembly(a, 250, { startSortOrder: sort });
      sort += r.lines.length;
      all.push(...r.lines);
    }
    return all;
  });
  check('the whole assembly library expands quickly',
    t.ms < 120, `${t.r.length} lines from ${ASSEMBLIES.length} assemblies in ${t.ms.toFixed(0)}ms`);
  check('every expanded line has a positive quantity',
    t.r.every((l) => Number(l.quantity) > 0), 'no zero-quantity lines');
  check('an expansion is immediately priceable',
    t.r.every((l) => Number.isFinite(lineTotals(l).total)), 'totals compute');
}

/* ── the save payload ────────────────────────────────────────────────────── */

{
  const payload = JSON.stringify({ rows: rows.map((r) => ({ ...r, formulas: { unit_labor_cost: '=MAT*0.65' } })) });
  const kb = payload.length / 1024;
  check(`a ${n(N)}-line save payload is well within request limits`,
    kb < 1024, `${kb.toFixed(0)} KB — Next.js defaults allow 4 MB`);
}

/* ── one bad formula in a big sheet ──────────────────────────────────────── */

{
  const sheet = rows.map((r) => ({ ...r }));
  const f = { [cellKey(250, 'unit_material_cost')]: '=1/0' };
  for (let i = 0; i < 100; i++) f[cellKey(i, 'unit_labor_cost')] = '=MAT*0.5';
  const t = ms(() => recalc(sheet, f));
  check('one broken formula does not stop the other 100 computing',
    Object.keys(t.r.errors).length === 1 && Number(t.r.rows[5].unit_labor_cost) === rows[5].unit_material_cost * 0.5,
    `1 error, the rest computed in ${t.ms.toFixed(0)}ms`);
}

console.log(failures === 0 ? '\nGRID HOLDS AT SCALE\n' : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
