/**
 * lib/estimate-formula.ts
 *
 * Spreadsheet formulas for the estimate grid.
 *
 * This is the one thing Buildern's estimate had that ours did not: a cell that
 * can hold `=C5*1.15` instead of a number somebody worked out on a calculator
 * and typed in. An estimator who cannot write arithmetic in the grid keeps the
 * arithmetic somewhere else — in Excel, or in their head — and the estimate
 * stops being the source of truth the moment a quantity changes.
 *
 * Two decisions worth stating.
 *
 * FORMULAS ARE AN INPUT LAYER, NOT A STORAGE FORMAT. The evaluated number is
 * written to the real numeric column, so every existing reader — the proposal
 * builder, the totals, the reports, anything written later — keeps seeing plain
 * numbers and never has to know formulas exist. The formula text rides along in
 * a separate map. A grid that stored "=C5*1.15" in unit_material_cost would
 * break every one of those readers at once.
 *
 * NAMED ROW REFERENCES. Alongside A1-style references this understands QTY,
 * MAT, LAB, EQP, SUB, WASTE and TOTAL, which mean those fields ON THE SAME ROW.
 * `=QTY*1.1` survives sorting, inserting and deleting rows; `=C5*1.1` does not,
 * and a spreadsheet full of positional references is exactly how an estimate
 * silently starts pricing the wrong line. Excel cannot express this because
 * Excel has no idea what a row means. We do.
 *
 * No eval(), ever. Tokenizer → recursive-descent parser → evaluator. A formula
 * is user input, and handing user input to eval() in a Node process is remote
 * code execution.
 */

/* ── the fields a formula can read and write ─────────────────────────────── */

export const FORMULA_FIELDS = [
  'quantity', 'waste_factor_pct',
  'unit_material_cost', 'unit_labor_cost', 'unit_equipment_cost', 'unit_sub_cost',
] as const;
export type FormulaField = (typeof FORMULA_FIELDS)[number];

/**
 * Column letters, in the order the grid shows them.
 *
 * J is virtual and read-only: the row's line total, waste and exclusions
 * included. Without it a line total is unreachable from another row, because
 * the same-row name TOTAL is by definition circular in any cell that is itself
 * part of the total — which is all four cost buckets. `=J1*0.05` ("five percent
 * of the concrete line") is the shape estimators actually want.
 */
export const COLUMN_LETTERS: Record<string, string> = {
  A: 'csi_code', B: 'description', C: 'quantity', D: 'unit', E: 'waste_factor_pct',
  F: 'unit_material_cost', G: 'unit_labor_cost', H: 'unit_equipment_cost', I: 'unit_sub_cost',
  J: 'TOTAL',
};

/** Same-row names. The reason to use this grid rather than Excel. */
export const ROW_NAMES: Record<string, FormulaField | 'TOTAL'> = {
  QTY: 'quantity', QUANTITY: 'quantity',
  WASTE: 'waste_factor_pct',
  MAT: 'unit_material_cost', MATERIAL: 'unit_material_cost',
  LAB: 'unit_labor_cost', LABOR: 'unit_labor_cost', LABOUR: 'unit_labor_cost',
  EQP: 'unit_equipment_cost', EQUIP: 'unit_equipment_cost', EQUIPMENT: 'unit_equipment_cost',
  SUB: 'unit_sub_cost',
  TOTAL: 'TOTAL',
};

export type FormulaErrorCode = '#DIV/0!' | '#REF!' | '#NAME?' | '#CIRC!' | '#VALUE!' | '#SYNTAX!' | '#NUM!';

export class FormulaError extends Error {
  constructor(public code: FormulaErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'FormulaError';
  }
}

/** "row:field" — the key a formula is stored under. */
export type FormulaMap = Record<string, string>;
export const cellKey = (row: number, field: string): string => `${row}:${field}`;

/** True when a cell's raw text should be treated as a formula. */
export const isFormula = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().startsWith('=') && v.trim().length > 1;

/* ── tokenizer ───────────────────────────────────────────────────────────── */

type Tok =
  | { t: 'num'; v: number }
  | { t: 'ref'; col: string; row: number }
  | { t: 'name'; v: string }
  | { t: 'op'; v: string }
  | { t: 'punc'; v: '(' | ')' | ',' | ':' };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const s = src;

  while (i < s.length) {
    const c = s[i];

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }

    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) j++;
      /* Percent literals: 12% is 0.12. Estimators type percentages constantly
         and a formula reading 12 where 0.12 was meant is a 100× error. */
      if (s[j] === '%') {
        out.push({ t: 'num', v: Number(s.slice(i, j)) / 100 });
        i = j + 1;
      } else {
        const n = Number(s.slice(i, j));
        if (!Number.isFinite(n)) throw new FormulaError('#SYNTAX!', `bad number near "${s.slice(i, j)}"`);
        out.push({ t: 'num', v: n });
        i = j;
      }
      continue;
    }

    if (c === '.' && s[i + 1] >= '0' && s[i + 1] <= '9') {
      let j = i;
      while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) j++;
      out.push({ t: 'num', v: Number(s.slice(i, j)) });
      i = j;
      continue;
    }

    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_$]/.test(s[j])) j++;
      const word = s.slice(i, j);
      /* $ is accepted and ignored — an estimator pasting =$C$5 from Excel
         should not get a syntax error over absolute-reference marks we have no
         use for, since named references already survive row moves. */
      const clean = word.replace(/\$/g, '');
      const m = /^([A-Za-z]{1,2})(\d{1,7})$/.exec(clean);
      if (m) {
        out.push({ t: 'ref', col: m[1].toUpperCase(), row: Number(m[2]) });
      } else {
        out.push({ t: 'name', v: clean.toUpperCase() });
      }
      i = j;
      continue;
    }

    if (c === '(' || c === ')' || c === ',' || c === ':') {
      out.push({ t: 'punc', v: c as '(' | ')' | ',' | ':' });
      i++;
      continue;
    }

    if ('+-*/^%'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }

    if ('<>='.includes(c)) {
      const two = s.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '<>') { out.push({ t: 'op', v: two }); i += 2; continue; }
      out.push({ t: 'op', v: c }); i++; continue;
    }

    throw new FormulaError('#SYNTAX!', `unexpected character "${c}"`);
  }
  return out;
}

/* ── AST ─────────────────────────────────────────────────────────────────── */

type Node =
  | { k: 'num'; v: number }
  | { k: 'ref'; col: string; row: number }
  | { k: 'name'; v: string }
  | { k: 'range'; a: { col: string; row: number }; b: { col: string; row: number } }
  | { k: 'bin'; op: string; l: Node; r: Node }
  | { k: 'neg'; e: Node }
  | { k: 'call'; fn: string; args: Node[] };

/**
 * Recursive-descent parser.
 *
 * Precedence, loosest first: comparison, +-, * / , ^ (right-associative),
 * unary minus, then primaries.
 */
function parse(toks: Tok[]): Node {
  let p = 0;
  const peek = () => toks[p];
  const eat = () => toks[p++];
  const expect = (v: string) => {
    const t = toks[p];
    if (!t || (t.t !== 'punc' && t.t !== 'op') || t.v !== v) {
      throw new FormulaError('#SYNTAX!', `expected "${v}"`);
    }
    p++;
  };

  function parseComparison(): Node {
    let l = parseAdditive();
    while (peek()?.t === 'op' && ['=', '<', '>', '<=', '>=', '<>'].includes((peek() as { v: string }).v)) {
      const op = (eat() as { v: string }).v;
      l = { k: 'bin', op, l, r: parseAdditive() };
    }
    return l;
  }

  function parseAdditive(): Node {
    let l = parseMultiplicative();
    while (peek()?.t === 'op' && ['+', '-'].includes((peek() as { v: string }).v)) {
      const op = (eat() as { v: string }).v;
      l = { k: 'bin', op, l, r: parseMultiplicative() };
    }
    return l;
  }

  function parseMultiplicative(): Node {
    let l = parsePower();
    while (peek()?.t === 'op' && ['*', '/'].includes((peek() as { v: string }).v)) {
      const op = (eat() as { v: string }).v;
      l = { k: 'bin', op, l, r: parsePower() };
    }
    return l;
  }

  function parsePower(): Node {
    const base = parseUnary();
    if (peek()?.t === 'op' && (peek() as { v: string }).v === '^') {
      eat();
      /* Right-associative: 2^3^2 is 2^9, not 8^2. */
      return { k: 'bin', op: '^', l: base, r: parsePower() };
    }
    return base;
  }

  function parseUnary(): Node {
    if (peek()?.t === 'op' && (peek() as { v: string }).v === '-') { eat(); return { k: 'neg', e: parseUnary() }; }
    if (peek()?.t === 'op' && (peek() as { v: string }).v === '+') { eat(); return parseUnary(); }
    return parsePostfix();
  }

  /* Trailing % on an expression: =QTY*10% */
  function parsePostfix(): Node {
    let e = parsePrimary();
    while (peek()?.t === 'op' && (peek() as { v: string }).v === '%') {
      eat();
      e = { k: 'bin', op: '/', l: e, r: { k: 'num', v: 100 } };
    }
    return e;
  }

  function parsePrimary(): Node {
    const t = peek();
    if (!t) throw new FormulaError('#SYNTAX!', 'unexpected end of formula');

    if (t.t === 'num') { eat(); return { k: 'num', v: t.v }; }

    if (t.t === 'ref') {
      eat();
      if (peek()?.t === 'punc' && (peek() as { v: string }).v === ':') {
        eat();
        const b = eat();
        if (!b || b.t !== 'ref') throw new FormulaError('#SYNTAX!', 'a range needs a cell on both sides of ":"');
        return { k: 'range', a: { col: t.col, row: t.row }, b: { col: b.col, row: b.row } };
      }
      return { k: 'ref', col: t.col, row: t.row };
    }

    if (t.t === 'name') {
      eat();
      if (peek()?.t === 'punc' && (peek() as { v: string }).v === '(') {
        eat();
        const args: Node[] = [];
        if (!(peek()?.t === 'punc' && (peek() as { v: string }).v === ')')) {
          args.push(parseComparison());
          while (peek()?.t === 'punc' && (peek() as { v: string }).v === ',') { eat(); args.push(parseComparison()); }
        }
        expect(')');
        return { k: 'call', fn: t.v, args };
      }
      return { k: 'name', v: t.v };
    }

    if (t.t === 'punc' && t.v === '(') {
      eat();
      const e = parseComparison();
      expect(')');
      return e;
    }

    /* Every token kind is handled above, so TypeScript narrows t to never
       here. Describe it without touching a field the narrowed type lacks. */
    throw new FormulaError('#SYNTAX!', 'unexpected token in formula');
  }

  const ast = parseComparison();
  if (p < toks.length) throw new FormulaError('#SYNTAX!', 'trailing input after the formula');
  return ast;
}

/** Parse only — used to validate a formula as it is typed. */
export function parseFormula(src: string): Node {
  const body = src.trim().replace(/^=/, '');
  if (!body.trim()) throw new FormulaError('#SYNTAX!', 'empty formula');
  return parse(tokenize(body));
}

/* ── functions ───────────────────────────────────────────────────────────── */

const round = (n: number, d = 0) => {
  const f = Math.pow(10, d);
  return Math.round((n + Number.EPSILON) * f) / f;
};

type Fn = (args: number[][]) => number;

/* Each function receives its arguments already flattened per-argument, so SUM
   can take ranges and scalars interchangeably. */
const FUNCTIONS: Record<string, Fn> = {
  SUM: (a) => a.flat().reduce((s, n) => s + n, 0),
  PRODUCT: (a) => a.flat().reduce((s, n) => s * n, 1),
  AVERAGE: (a) => { const f = a.flat(); if (!f.length) throw new FormulaError('#DIV/0!'); return f.reduce((s, n) => s + n, 0) / f.length; },
  AVG: (a) => FUNCTIONS.AVERAGE(a),
  MIN: (a) => { const f = a.flat(); if (!f.length) throw new FormulaError('#NUM!'); return Math.min(...f); },
  MAX: (a) => { const f = a.flat(); if (!f.length) throw new FormulaError('#NUM!'); return Math.max(...f); },
  COUNT: (a) => a.flat().length,
  ABS: (a) => Math.abs(one(a)),
  SQRT: (a) => { const n = one(a); if (n < 0) throw new FormulaError('#NUM!'); return Math.sqrt(n); },
  POWER: (a) => Math.pow(one(a), one(a, 1)),
  ROUND: (a) => round(one(a), a.length > 1 ? one(a, 1) : 0),
  ROUNDUP: (a) => { const d = a.length > 1 ? one(a, 1) : 0; const f = Math.pow(10, d); return Math.ceil(one(a) * f) / f; },
  ROUNDDOWN: (a) => { const d = a.length > 1 ? one(a, 1) : 0; const f = Math.pow(10, d); return Math.floor(one(a) * f) / f; },
  CEILING: (a) => { const m = a.length > 1 ? one(a, 1) : 1; if (m === 0) throw new FormulaError('#DIV/0!'); return Math.ceil(one(a) / m) * m; },
  FLOOR: (a) => { const m = a.length > 1 ? one(a, 1) : 1; if (m === 0) throw new FormulaError('#DIV/0!'); return Math.floor(one(a) / m) * m; },
  INT: (a) => Math.trunc(one(a)),
  IF: (a) => (one(a) !== 0 ? one(a, 1) : (a.length > 2 ? one(a, 2) : 0)),
  AND: (a) => (a.flat().every((n) => n !== 0) ? 1 : 0),
  OR: (a) => (a.flat().some((n) => n !== 0) ? 1 : 0),
  NOT: (a) => (one(a) === 0 ? 1 : 0),
};

function one(args: number[][], i = 0): number {
  const a = args[i];
  if (!a || a.length === 0) throw new FormulaError('#VALUE!', 'missing argument');
  return a[0];
}

/* ── evaluation ──────────────────────────────────────────────────────────── */

export interface EvalRow {
  quantity?: unknown; waste_factor_pct?: unknown;
  unit_material_cost?: unknown; unit_labor_cost?: unknown;
  unit_equipment_cost?: unknown; unit_sub_cost?: unknown;
  is_excluded?: unknown;
  [k: string]: unknown;
}

export interface RecalcResult {
  /** Rows with every formula cell replaced by its computed number. */
  rows: EvalRow[];
  /** "row:field" → error code, for the cells that could not be computed. */
  errors: Record<string, FormulaErrorCode>;
  /** How many cells actually held a formula. */
  formulaCells: number;
}

const MAX_ROWS = 100_000;

/**
 * Recompute a grid.
 *
 * Cells are resolved lazily and memoised, so a formula that depends on another
 * formula gets the right answer regardless of the order they sit in — a
 * top-down single pass would compute B before A and quietly use a stale value.
 *
 * A cell currently being resolved is marked, so a cycle is detected rather than
 * recursing until the stack dies. Excel reports a circular reference; a grid
 * that hangs the browser instead is worse than one without formulas.
 */
export function recalc(rows: EvalRow[], formulas: FormulaMap): RecalcResult {
  const out: EvalRow[] = rows.map((r) => ({ ...r }));
  const errors: Record<string, FormulaErrorCode> = {};
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  let formulaCells = 0;

  const rawNumber = (v: unknown): number => {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  /** Value of one field on one row (0-based), resolving formulas on the way. */
  function cellValue(rowIdx: number, field: string): number {
    if (rowIdx < 0 || rowIdx >= rows.length) throw new FormulaError('#REF!');

    if (field === 'TOTAL') {
      /* Derived, so it must pull each component through the same resolver
         rather than reading the raw row — otherwise TOTAL reports the value the
         row had before its own formulas ran. */
      const qty = cellValue(rowIdx, 'quantity');
      const waste = cellValue(rowIdx, 'waste_factor_pct');
      const adj = qty * (1 + waste / 100);
      if (out[rowIdx].is_excluded) return 0;
      return round(adj * (
        cellValue(rowIdx, 'unit_material_cost') + cellValue(rowIdx, 'unit_labor_cost') +
        cellValue(rowIdx, 'unit_equipment_cost') + cellValue(rowIdx, 'unit_sub_cost')
      ), 2);
    }

    const key = cellKey(rowIdx, field);
    if (memo.has(key)) return memo.get(key)!;

    const src = formulas[key];
    if (!isFormula(src)) {
      const v = rawNumber(out[rowIdx][field]);
      memo.set(key, v);
      return v;
    }

    if (visiting.has(key)) throw new FormulaError('#CIRC!');
    visiting.add(key);
    try {
      const v = evalNode(parseFormula(src), rowIdx);
      const n = Number.isFinite(v) ? v : 0;
      memo.set(key, n);
      return n;
    } finally {
      visiting.delete(key);
    }
  }

  function fieldForRef(col: string): string {
    const f = COLUMN_LETTERS[col];
    if (!f) throw new FormulaError('#REF!', `no column "${col}"`);
    return f;
  }

  /** A node's value(s). Ranges produce several; everything else produces one. */
  function evalList(n: Node, rowIdx: number): number[] {
    if (n.k === 'range') {
      const fa = fieldForRef(n.a.col);
      const fb = fieldForRef(n.b.col);
      if (fa !== fb) {
        /* A rectangular range would have to decide a column order and would
           read text columns as numbers. Estimators want a column of a range;
           refusing the ambiguous case is better than guessing. */
        throw new FormulaError('#REF!', 'a range must stay in one column');
      }
      const lo = Math.min(n.a.row, n.b.row);
      const hi = Math.max(n.a.row, n.b.row);
      if (hi - lo > MAX_ROWS) throw new FormulaError('#REF!', 'range too large');
      const vals: number[] = [];
      for (let r = lo; r <= hi; r++) {
        if (r < 1 || r > rows.length) continue; // a range may overhang the grid
        vals.push(cellValue(r - 1, fa));
      }
      return vals;
    }
    return [evalNode(n, rowIdx)];
  }

  function evalNode(n: Node, rowIdx: number): number {
    switch (n.k) {
      case 'num': return n.v;

      case 'ref': return cellValue(n.row - 1, fieldForRef(n.col));

      case 'name': {
        const f = ROW_NAMES[n.v];
        if (!f) throw new FormulaError('#NAME?', `unknown name "${n.v}"`);
        return cellValue(rowIdx, f);
      }

      case 'range': {
        /* A bare range used where one value is wanted. Excel says #VALUE!. */
        throw new FormulaError('#VALUE!', 'a range needs a function such as SUM()');
      }

      case 'neg': return -evalNode(n.e, rowIdx);

      case 'bin': {
        const l = evalNode(n.l, rowIdx);
        const r = evalNode(n.r, rowIdx);
        switch (n.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/':
            if (r === 0) throw new FormulaError('#DIV/0!');
            return l / r;
          case '^': {
            const v = Math.pow(l, r);
            if (!Number.isFinite(v)) throw new FormulaError('#NUM!');
            return v;
          }
          case '=': return l === r ? 1 : 0;
          case '<>': return l !== r ? 1 : 0;
          case '<': return l < r ? 1 : 0;
          case '>': return l > r ? 1 : 0;
          case '<=': return l <= r ? 1 : 0;
          case '>=': return l >= r ? 1 : 0;
          default: throw new FormulaError('#SYNTAX!', `unknown operator "${n.op}"`);
        }
      }

      case 'call': {
        const fn = FUNCTIONS[n.fn];
        if (!fn) throw new FormulaError('#NAME?', `unknown function "${n.fn}"`);
        /* IF must not evaluate the branch it does not take — otherwise
           =IF(QTY=0,0,100/QTY) reports #DIV/0! on exactly the rows the guard
           was written to protect. */
        if (n.fn === 'IF') {
          const cond = evalNode(n.args[0], rowIdx);
          if (cond !== 0) return n.args[1] ? evalNode(n.args[1], rowIdx) : 0;
          return n.args[2] ? evalNode(n.args[2], rowIdx) : 0;
        }
        return fn(n.args.map((a) => evalList(a, rowIdx)));
      }
    }
  }

  /* Resolve every formula cell. Errors are recorded per-cell and the rest of
     the grid still computes — one bad formula must not blank an estimate. */
  for (const key of Object.keys(formulas)) {
    const [rowStr, field] = key.split(':');
    const rowIdx = Number(rowStr);
    if (!Number.isInteger(rowIdx) || rowIdx < 0 || rowIdx >= rows.length) continue;
    if (!isFormula(formulas[key])) continue;
    formulaCells++;
    try {
      const v = cellValue(rowIdx, field);
      out[rowIdx][field] = round(v, 6);
    } catch (e) {
      errors[key] = e instanceof FormulaError ? e.code : '#VALUE!';
      /* The cell keeps whatever it last computed to rather than becoming 0 — a
         broken formula should show an error badge, not silently zero a bid. */
    }
  }

  return { rows: out, errors, formulaCells };
}

/* ── row-scoped storage ──────────────────────────────────────────────────── */

export interface RowWithFormulas extends EvalRow {
  /** field → formula text, stored on the row itself. */
  formulas?: Record<string, string> | null;
}

/**
 * Build the sheet-wide formula map the evaluator wants from rows that each
 * carry their own formulas.
 *
 * Formulas are persisted per ROW, not per sheet position, so that sorting,
 * inserting and deleting rows cannot detach a formula from the line it belongs
 * to. The index-keyed map exists only for the duration of one recalculation.
 *
 * A1-style references are positional and will point somewhere new after a
 * re-sort — exactly as in Excel. The named references (QTY, MAT, …) do not,
 * which is why they are the ones worth reaching for.
 */
export function formulaMapFromRows(rows: RowWithFormulas[]): FormulaMap {
  const map: FormulaMap = {};
  rows.forEach((r, i) => {
    const f = r.formulas;
    if (!f || typeof f !== 'object') return;
    for (const [field, src] of Object.entries(f)) {
      if (isFormula(src)) map[cellKey(i, field)] = src;
    }
  });
  return map;
}

/** Recompute rows that carry their own formulas. */
export function recalcRows(rows: RowWithFormulas[]): RecalcResult {
  return recalc(rows, formulaMapFromRows(rows));
}

/**
 * Evaluate a standalone expression against named variables, with no grid.
 *
 * Assembly component quantities are written in this same language — `=DRIVER/16*12`
 * for studs at 16 inches on centre — so an estimator learns one syntax rather
 * than two, and the assembly library is inspectable arithmetic instead of an
 * opaque multiplier somebody has to trust.
 *
 * Cell references are refused: there is no grid here, and silently reading one
 * as zero would make a wrong quantity look like a right one.
 */
export function evaluateExpression(src: string, vars: Record<string, number>): number {
  const ast = parseFormula(src);

  const ev = (n: Node): number => {
    switch (n.k) {
      case 'num': return n.v;
      case 'ref': case 'range': throw new FormulaError('#REF!', 'cell references are not available here');
      case 'name': {
        const v = vars[n.v];
        if (v === undefined) throw new FormulaError('#NAME?', `unknown name "${n.v}"`);
        return v;
      }
      case 'neg': return -ev(n.e);
      case 'bin': {
        const l = ev(n.l), r = ev(n.r);
        switch (n.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/': if (r === 0) throw new FormulaError('#DIV/0!'); return l / r;
          case '^': { const v = Math.pow(l, r); if (!Number.isFinite(v)) throw new FormulaError('#NUM!'); return v; }
          case '=': return l === r ? 1 : 0;
          case '<>': return l !== r ? 1 : 0;
          case '<': return l < r ? 1 : 0;
          case '>': return l > r ? 1 : 0;
          case '<=': return l <= r ? 1 : 0;
          case '>=': return l >= r ? 1 : 0;
          default: throw new FormulaError('#SYNTAX!');
        }
      }
      case 'call': {
        if (n.fn === 'IF') {
          return ev(n.args[0]) !== 0
            ? (n.args[1] ? ev(n.args[1]) : 0)
            : (n.args[2] ? ev(n.args[2]) : 0);
        }
        const fn = FUNCTIONS[n.fn];
        if (!fn) throw new FormulaError('#NAME?', `unknown function "${n.fn}"`);
        return fn(n.args.map((a) => [ev(a)]));
      }
    }
  };

  return ev(ast);
}

/**
 * Check a formula without running it, for live feedback as it is typed.
 * Returns null when it is well-formed.
 */
export function validateFormula(src: string): FormulaErrorCode | null {
  try { parseFormula(src); return null; }
  catch (e) { return e instanceof FormulaError ? e.code : '#SYNTAX!'; }
}

/** Every function name, for the in-grid help. */
export const FUNCTION_NAMES = Object.keys(FUNCTIONS).sort();
