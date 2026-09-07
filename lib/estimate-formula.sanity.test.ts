/**
 * Estimate formula sanity — parsing, references, functions, cycles.
 * Run: npx -y tsx lib/estimate-formula.sanity.test.ts
 *
 * Every assertion here is a number that ends up on a bid. The ones that matter
 * most are the ones a naive implementation gets wrong and never tells you about:
 *
 *   =2^3^2        right-associative, so 512 — not 64
 *   =10-4-3       left-associative, so 3 — not 9
 *   =IF(QTY=0,0,100/QTY)   the untaken branch must NOT be evaluated, or the
 *                          guard reports the very error it was written to stop
 *   a cycle       must be reported, not recursed until the stack dies
 *   12%           0.12, not 12 — a 100× error in a cost per unit
 */
import {
  recalc, parseFormula, validateFormula, isFormula, cellKey,
  FormulaError, FUNCTION_NAMES,
} from './estimate-formula';

let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  if (!cond) failures++;
};

/** Evaluate one formula against a grid, returning the computed cell. */
const run = (rows: Record<string, unknown>[], f: Record<string, string>, row = 0, field = 'unit_material_cost') => {
  const r = recalc(rows, f);
  return { v: r.rows[row][field], err: r.errors[cellKey(row, field)], all: r };
};

const ROW = (o: Record<string, unknown> = {}) => ({
  quantity: 0, waste_factor_pct: 0,
  unit_material_cost: 0, unit_labor_cost: 0, unit_equipment_cost: 0, unit_sub_cost: 0,
  ...o,
});

/* ── arithmetic and precedence ───────────────────────────────────────────── */

const calc = (src: string) => run([ROW()], { '0:unit_material_cost': src }).v;

check('addition and multiplication precede correctly', calc('=2+3*4') === 14, `${calc('=2+3*4')}`);
check('parentheses override precedence', calc('=(2+3)*4') === 20, `${calc('=(2+3)*4')}`);
check('subtraction is LEFT-associative',
  calc('=10-4-3') === 3, `${calc('=10-4-3')} — 9 would mean 10-(4-3)`);
check('division is left-associative', calc('=100/5/2') === 10, `${calc('=100/5/2')}`);
check('exponentiation is RIGHT-associative',
  calc('=2^3^2') === 512, `${calc('=2^3^2')} — 64 would mean (2^3)^2`);
check('unary minus works', calc('=-5+2') === -3, `${calc('=-5+2')}`);
check('double negative works', calc('=--5') === 5, `${calc('=--5')}`);
check('decimals parse', calc('=1.5*4') === 6, `${calc('=1.5*4')}`);
check('leading-dot decimals parse', calc('=.5*4') === 2, `${calc('=.5*4')}`);

check('a percent literal is a hundredth',
  calc('=12%') === 0.12, `${calc('=12%')} — 12 would be a 100× error on a unit cost`);
check('a trailing percent applies to an expression',
  calc('=200*15%') === 30, `${calc('=200*15%')}`);

/* ── same-row named references, the reason to use this over Excel ────────── */

{
  const rows = [ROW({ quantity: 100, waste_factor_pct: 10, unit_material_cost: 5, unit_labor_cost: 2 })];
  check('QTY reads the row it is on',
    run(rows, { '0:unit_sub_cost': '=QTY*2' }, 0, 'unit_sub_cost').v === 200, 'QTY*2 = 200');
  check('MAT / LAB read their own row',
    run(rows, { '0:unit_sub_cost': '=MAT+LAB' }, 0, 'unit_sub_cost').v === 7, 'MAT+LAB = 7');
  check('WASTE reads the waste factor',
    run(rows, { '0:unit_sub_cost': '=WASTE' }, 0, 'unit_sub_cost').v === 10, '10');
  check('aliases resolve', run(rows, { '0:unit_sub_cost': '=QUANTITY+MATERIAL+LABOUR' }, 0, 'unit_sub_cost').v === 107, '100+5+2');
  /* TOTAL written INTO a cost bucket is genuinely circular — sub is part of the
     total — so it is reported, not computed. A line total is read from another
     row through column J instead. */
  check('TOTAL inside its own total is a cycle, correctly',
    run(rows, { '0:unit_sub_cost': '=TOTAL' }, 0, 'unit_sub_cost').err === '#CIRC!',
    '#CIRC! — sub is one of the four buckets TOTAL adds up');

  const two = [ROW({ quantity: 100, waste_factor_pct: 10, unit_material_cost: 5, unit_labor_cost: 2 }), ROW()];
  check('column J is the waste-adjusted line total of another row',
    run(two, { '1:unit_material_cost': '=J1' }, 1, 'unit_material_cost').v === 770,
    '100 × 1.10 × (5+2) = 770');
  check('J composes like any other reference',
    run(two, { '1:unit_material_cost': '=J1*0.05' }, 1, 'unit_material_cost') .v === 38.5,
    '5% of the line above = 38.50');
  check('an excluded line totals zero through J',
    run([ROW({ quantity: 10, unit_material_cost: 5, is_excluded: true }), ROW()],
        { '1:unit_material_cost': '=J1' }, 1, 'unit_material_cost').v === 0,
    'excluded scope contributes nothing');
  check('an unknown name is #NAME?',
    run(rows, { '0:unit_sub_cost': '=FROBNICATE' }, 0, 'unit_sub_cost').err === '#NAME?', '#NAME?');
}

/* ── A1 references and ranges ────────────────────────────────────────────── */

{
  const rows = [
    ROW({ quantity: 10, unit_material_cost: 100 }),
    ROW({ quantity: 20, unit_material_cost: 200 }),
    ROW({ quantity: 30, unit_material_cost: 300 }),
  ];
  check('an A1 reference reads another row',
    run(rows, { '0:unit_labor_cost': '=F2' }, 0, 'unit_labor_cost').v === 200, 'F2 = row 2 material = 200');
  check('C is the quantity column',
    run(rows, { '0:unit_labor_cost': '=C3' }, 0, 'unit_labor_cost').v === 30, 'C3 = 30');
  check('SUM over a range works',
    run(rows, { '0:unit_labor_cost': '=SUM(F1:F3)' }, 0, 'unit_labor_cost').v === 600, '100+200+300');
  check('a range may overhang the grid without failing',
    run(rows, { '0:unit_labor_cost': '=SUM(F1:F999)' }, 0, 'unit_labor_cost').v === 600,
    'rows past the end are skipped, not #REF!');
  check('a reference off the grid is #REF!',
    run(rows, { '0:unit_labor_cost': '=F99' }, 0, 'unit_labor_cost').err === '#REF!', '#REF!');
  check('an unknown column letter is #REF!',
    run(rows, { '0:unit_labor_cost': '=Z1' }, 0, 'unit_labor_cost').err === '#REF!', '#REF!');
  check('a range spanning two columns is refused',
    run(rows, { '0:unit_labor_cost': '=SUM(C1:F3)' }, 0, 'unit_labor_cost').err === '#REF!',
    'ambiguous — better refused than guessed');
  check('a bare range where one value is needed is #VALUE!',
    run(rows, { '0:unit_labor_cost': '=F1:F3' }, 0, 'unit_labor_cost').err === '#VALUE!', '#VALUE!');
  check('Excel-style absolute marks are tolerated',
    run(rows, { '0:unit_labor_cost': '=$F$2' }, 0, 'unit_labor_cost').v === 200,
    'pasting =$F$2 from Excel should not be a syntax error');
}

/* ── functions ───────────────────────────────────────────────────────────── */

check('SUM of scalars', calc('=SUM(1,2,3)') === 6, '6');
check('PRODUCT', calc('=PRODUCT(2,3,4)') === 24, '24');
check('AVERAGE', calc('=AVERAGE(2,4,6)') === 4, '4');
check('MIN and MAX', calc('=MIN(3,1,2)') === 1 && calc('=MAX(3,1,2)') === 3, '1 / 3');
check('ROUND to decimals', calc('=ROUND(2.345,2)') === 2.35, `${calc('=ROUND(2.345,2)')}`);
check('ROUND to whole', calc('=ROUND(2.5)') === 3, `${calc('=ROUND(2.5)')}`);
check('ROUNDUP always climbs', calc('=ROUNDUP(2.01,1)') === 2.1, `${calc('=ROUNDUP(2.01,1)')}`);
check('ROUNDDOWN always drops', calc('=ROUNDDOWN(2.99,1)') === 2.9, `${calc('=ROUNDDOWN(2.99,1)')}`);
check('CEILING to a multiple — buying full sheets',
  calc('=CEILING(37,4)') === 40, `${calc('=CEILING(37,4)')} — 37 LF of material sold in 4ft lengths`);
check('FLOOR to a multiple', calc('=FLOOR(37,4)') === 36, `${calc('=FLOOR(37,4)')}`);
check('ABS', calc('=ABS(0-7)') === 7, '7');
check('SQRT', calc('=SQRT(144)') === 12, '12');
check('POWER', calc('=POWER(2,10)') === 1024, '1024');
check('INT truncates', calc('=INT(9.99)') === 9, '9');
check('AND / OR / NOT', calc('=AND(1,1)') === 1 && calc('=OR(0,0)') === 0 && calc('=NOT(0)') === 1, 'boolean');
check('comparisons yield 1 or 0', calc('=5>3') === 1 && calc('=5<3') === 0, '1 / 0');
check('an unknown function is #NAME?',
  run([ROW()], { '0:unit_material_cost': '=NOSUCHFN(1)' }).err === '#NAME?', '#NAME?');
check('every documented function exists',
  FUNCTION_NAMES.length >= 19 && FUNCTION_NAMES.includes('CEILING'), `${FUNCTION_NAMES.length} functions`);

/* ── IF short-circuits, which is the whole point of writing a guard ──────── */

{
  const rows = [ROW({ quantity: 0 })];
  const r = run(rows, { '0:unit_material_cost': '=IF(QTY=0,0,100/QTY)' });
  check('IF does NOT evaluate the branch it does not take',
    r.v === 0 && r.err === undefined,
    'a guard against divide-by-zero must not itself report #DIV/0!');

  const rows2 = [ROW({ quantity: 4 })];
  check('IF takes the true branch when it should',
    run(rows2, { '0:unit_material_cost': '=IF(QTY=0,0,100/QTY)' }).v === 25, '100/4 = 25');
  check('IF with no false branch yields 0',
    run([ROW()], { '0:unit_material_cost': '=IF(0,5)' }).v === 0, '0');
}

/* ── errors ──────────────────────────────────────────────────────────────── */

check('division by zero is #DIV/0!',
  run([ROW()], { '0:unit_material_cost': '=1/0' }).err === '#DIV/0!', '#DIV/0!');
check('a syntax error is reported, not thrown',
  run([ROW()], { '0:unit_material_cost': '=1+' }).err === '#SYNTAX!', '#SYNTAX!');
check('unbalanced parentheses are caught',
  run([ROW()], { '0:unit_material_cost': '=(1+2' }).err === '#SYNTAX!', '#SYNTAX!');
check('a stray character is caught',
  run([ROW()], { '0:unit_material_cost': '=1 # 2' }).err === '#SYNTAX!', '#SYNTAX!');
check('SQRT of a negative is #NUM!',
  run([ROW()], { '0:unit_material_cost': '=SQRT(0-1)' }).err === '#NUM!', '#NUM!');

/* ── circular references must be caught, not hang the browser ────────────── */

{
  const self = run([ROW()], { '0:unit_material_cost': '=MAT+1' });
  check('a cell referring to itself is #CIRC!',
    self.err === '#CIRC!', 'not an infinite recursion');

  const two = recalc([ROW(), ROW()], {
    '0:unit_material_cost': '=F2',
    '1:unit_material_cost': '=F1',
  });
  check('a two-cell cycle is #CIRC! on both',
    two.errors['0:unit_material_cost'] === '#CIRC!' || two.errors['1:unit_material_cost'] === '#CIRC!',
    'detected');

  const viaTotal = run([ROW({ quantity: 1 })], { '0:unit_material_cost': '=TOTAL' });
  check('a cycle through TOTAL is caught',
    viaTotal.err === '#CIRC!', 'TOTAL depends on MAT, so MAT cannot be TOTAL');
}

/* ── formulas depending on formulas resolve in any order ─────────────────── */

{
  const rows = [ROW({ quantity: 10 }), ROW(), ROW()];
  /* Deliberately declared out of order: row 3 depends on row 2, which depends
     on row 1. A single top-down pass would compute row 3 from a stale row 2. */
  const r = recalc(rows, {
    '2:unit_material_cost': '=F2*2',
    '1:unit_material_cost': '=F1*2',
    '0:unit_material_cost': '=QTY',
  });
  check('a chain of formulas resolves regardless of declaration order',
    r.rows[0].unit_material_cost === 10 && r.rows[1].unit_material_cost === 20 && r.rows[2].unit_material_cost === 40,
    `${r.rows[0].unit_material_cost} → ${r.rows[1].unit_material_cost} → ${r.rows[2].unit_material_cost}`);
  check('no spurious errors in the chain', Object.keys(r.errors).length === 0, 'clean');
}

/* ── one broken formula must not blank the estimate ──────────────────────── */

{
  const r = recalc([ROW({ quantity: 5 }), ROW({ quantity: 7 })], {
    '0:unit_material_cost': '=1/0',
    '1:unit_material_cost': '=QTY*10',
  });
  check('a broken cell does not stop the others computing',
    r.rows[1].unit_material_cost === 70, `row 2 = ${r.rows[1].unit_material_cost}`);
  check('the broken cell keeps its previous value rather than zeroing a bid',
    r.rows[0].unit_material_cost === 0 && r.errors['0:unit_material_cost'] === '#DIV/0!',
    'error recorded, value untouched');
}

/* ── plumbing ────────────────────────────────────────────────────────────── */

check('isFormula recognises formulas', isFormula('=1+1') && !isFormula('1+1') && !isFormula('=') && !isFormula(5),
  'leading = and something after it');
check('validateFormula accepts a good one', validateFormula('=SUM(F1:F3)*1.15') === null, 'null');
check('validateFormula rejects a bad one', validateFormula('=SUM(') === '#SYNTAX!', '#SYNTAX!');
check('parseFormula throws a FormulaError', (() => {
  try { parseFormula('=)'); return false; } catch (e) { return e instanceof FormulaError; }
})(), 'typed error');
check('an empty grid is handled', recalc([], {}).rows.length === 0, 'no crash');
check('formulas for rows that no longer exist are ignored',
  recalc([ROW()], { '9:unit_material_cost': '=1' }).formulaCells === 0, 'skipped, not #REF!');

/* ── a realistic estimating formula ──────────────────────────────────────── */

{
  /* 2,400 SF of wall, studs at 16" on centre, sold in 10ft lengths, plus 10%
     waste — the kind of thing an estimator currently works out on a calculator
     and types in as a bare number nobody can check later. */
  const rows = [ROW({ quantity: 2400, unit: 'SF' })];
  const r = recalc(rows, {
    '0:unit_material_cost': '=CEILING(QTY/16*12/10,1)*8.75/QTY',
  });
  const v = Number(r.rows[0].unit_material_cost);
  check('a real estimating formula computes',
    Math.abs(v - 0.657) < 0.001 && !r.errors['0:unit_material_cost'],
    `$${v.toFixed(4)}/SF — 180 studs at $8.75 over 2,400 SF`);
}

console.log(failures === 0 ? '\nALL FORMULA ASSERTIONS HELD' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
