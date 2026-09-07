/**
 * lib/estimate-import.ts
 *
 * Mapping an arbitrary spreadsheet onto estimate line items.
 *
 * Buildern's import shows a dropdown above each column so you can say which of
 * their fields it is. That is the right shape — nobody's takeoff workbook has
 * the columns your software expects — but it puts the whole job on the user.
 * This guesses first and lets them correct, because an estimator importing a
 * 300-line workbook should be fixing one wrong header, not naming twelve.
 *
 * Everything here is pure so the guessing can be tested against the header
 * spellings real workbooks actually use, which is the only way to know whether
 * a guess is good.
 */

import { parseNumber, type GridRow } from './estimate-grid';

/** Fields an imported column can land on. */
export type ImportField =
  | 'csi_code' | 'description' | 'quantity' | 'unit' | 'waste_factor_pct'
  | 'unit_material_cost' | 'unit_labor_cost' | 'unit_equipment_cost' | 'unit_sub_cost'
  | 'notes' | 'ignore';

export const FIELD_LABELS: Record<ImportField, string> = {
  csi_code: 'Cost code',
  description: 'Description',
  quantity: 'Quantity',
  unit: 'Unit',
  waste_factor_pct: 'Waste %',
  unit_material_cost: 'Unit material cost',
  unit_labor_cost: 'Unit labor cost',
  unit_equipment_cost: 'Unit equipment cost',
  unit_sub_cost: 'Unit subcontract cost',
  notes: 'Notes',
  ignore: 'Skip this column',
};

export const NUMERIC_FIELDS: ImportField[] = [
  'quantity', 'waste_factor_pct',
  'unit_material_cost', 'unit_labor_cost', 'unit_equipment_cost', 'unit_sub_cost',
];

/**
 * Header patterns, most specific first.
 *
 * Order is load-bearing: "unit cost" must not match the rule for "unit", and
 * "labor rate" must not fall through to the generic price rule. Each entry is
 * tried in sequence and the first hit wins.
 */
const RULES: { field: ImportField; test: RegExp }[] = [
  { field: 'unit_material_cost', test: /\b(unit\s*)?(material|mat\.?|matl)\b.*\b(cost|price|rate|ea|each)\b|\b(material|matl)\s*(cost|price|rate)\b|^\s*material\s*$/i },
  { field: 'unit_labor_cost', test: /\b(unit\s*)?(labou?r)\b.*\b(cost|price|rate|hr|hour)\b|\b(labou?r)\s*(cost|price|rate)\b|^\s*labou?r\s*$/i },
  { field: 'unit_equipment_cost', test: /\b(equip(ment)?)\b.*\b(cost|price|rate)\b|^\s*equip(ment)?\s*$/i },
  { field: 'unit_sub_cost', test: /\b(sub(contract(or)?)?)\b.*\b(cost|price|rate|amount)\b|^\s*sub(contract(or)?)?\s*$/i },
  { field: 'waste_factor_pct', test: /waste|scrap|shrink/i },
  { field: 'quantity', test: /^\s*(qty|quantity|count|units?\s*req|no\.?)\s*$|\b(quantity|qty)\b/i },
  { field: 'csi_code', test: /\b(csi|cost\s*code|code|division|div|item\s*(no|#|number)|phase)\b/i },
  /* Generic unit price lands on material — the single-price shape most tools
     export, Buildern included. The user can move it in one click. */
  { field: 'unit_material_cost', test: /\b(unit\s*(cost|price|rate)|rate|price|cost\s*\/\s*unit|\$\s*\/\s*unit)\b/i },
  { field: 'unit', test: /^\s*(unit|uom|u\/m|units)\s*$|\b(unit\s*of\s*measure|uom)\b/i },
  { field: 'description', test: /\b(description|desc|item|scope|work|task|name|detail)\b/i },
  { field: 'notes', test: /\b(notes?|comment|remark)\b/i },
];

/** Columns that are derived downstream and must never be imported as input. */
const DERIVED = /\b(extended|ext\.?|line\s*total|amount\s*total|subtotal|sub\s*total|total)\b/i;

/** Guess a field for one header cell. */
export function guessField(header: string): ImportField {
  const h = String(header ?? '').trim();
  if (!h) return 'ignore';
  /* A total column is arithmetic we redo ourselves. Importing it as a cost
     would multiply it by the quantity a second time. */
  if (DERIVED.test(h) && !/unit/i.test(h)) return 'ignore';
  for (const r of RULES) if (r.test.test(h)) return r.field;
  return 'ignore';
}

/**
 * Guess a mapping for a whole header row.
 *
 * A field is only claimed once — if two columns both look like a description,
 * the first wins and the second is left for the user, rather than silently
 * overwriting.
 */
export function guessMapping(headers: string[]): ImportField[] {
  const taken = new Set<ImportField>();
  return headers.map((h) => {
    const f = guessField(h);
    if (f === 'ignore' || f === 'notes') return f;
    if (taken.has(f)) return 'ignore';
    taken.add(f);
    return f;
  });
}

/**
 * Does this row look like headers rather than data?
 *
 * Distinct from the clipboard heuristic: a file's first row is far more often a
 * header, so this leans toward saying yes, and the UI lets it be overridden.
 */
export function isHeaderRow(cells: unknown[]): boolean {
  const strs = cells.map((c) => String(c ?? '').trim()).filter(Boolean);
  if (strs.length === 0) return false;
  const numeric = strs.filter((s) => parseNumber(s) != null).length;
  /* Headers are words. A row where most non-empty cells parse as numbers is
     data, whatever it is called. */
  return numeric / strs.length < 0.34;
}

export interface ImportPreview {
  headers: string[];
  mapping: ImportField[];
  rows: Partial<GridRow>[];
  /** Rows read from the sheet before mapping, for the preview table. */
  raw: string[][];
  skippedHeader: boolean;
  totalRows: number;
  /** Rows dropped because every mapped field came out empty. */
  emptyRows: number;
}

/**
 * Turn a sheet (array of arrays) plus a mapping into grid rows.
 *
 * A row with no description but a cost is kept with a placeholder rather than
 * dropped: silently losing a priced line is how an import quietly understates
 * a bid. Only rows where every mapped field is empty are discarded.
 */
export function applyMapping(
  sheet: unknown[][],
  mapping: ImportField[],
  opts: { hasHeader: boolean },
): { rows: Partial<GridRow>[]; emptyRows: number } {
  const body = opts.hasHeader ? sheet.slice(1) : sheet;
  const rows: Partial<GridRow>[] = [];
  let emptyRows = 0;

  for (const line of body) {
    const row: Partial<GridRow> = {};
    let any = false;

    for (let c = 0; c < mapping.length; c++) {
      const field = mapping[c];
      if (field === 'ignore') continue;
      const raw = line?.[c];
      const s = raw == null ? '' : String(raw).trim();
      if (s === '') continue;

      if (NUMERIC_FIELDS.includes(field)) {
        const n = parseNumber(s);
        if (n == null) continue;
        (row as Record<string, unknown>)[field] = n;
        any = true;
      } else {
        (row as Record<string, unknown>)[field] = s;
        any = true;
      }
    }

    if (!any) { emptyRows++; continue; }
    if (!row.description) row.description = 'Imported line';
    rows.push(row);
  }

  return { rows, emptyRows };
}

/** Build the full preview from a raw sheet. */
export function buildPreview(sheet: unknown[][]): ImportPreview {
  const clean = sheet.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''));
  /* Blank rows are dropped here rather than by applyMapping, so they have to be
     counted here too — otherwise the import reports "0 skipped" while quietly
     discarding the spacer rows every hand-built workbook is full of, and the
     user has no way to tell a blank row from a row that failed to map. */
  const blankRows = sheet.length - clean.length;

  if (clean.length === 0) {
    return { headers: [], mapping: [], rows: [], raw: [], skippedHeader: false, totalRows: 0, emptyRows: 0 };
  }

  const width = clean.reduce((m, r) => Math.max(m, r.length), 0);
  const first = clean[0];
  const hasHeader = isHeaderRow(first);

  const headers = Array.from({ length: width }, (_, i) => {
    const h = hasHeader ? String(first[i] ?? '').trim() : '';
    return h || `Column ${i + 1}`;
  });

  const mapping = hasHeader
    ? guessMapping(headers)
    /* No header row: fall back to the grid's own column order, which is the
       order an export from this app produces. */
    : (['csi_code', 'description', 'quantity', 'unit', 'unit_material_cost', 'unit_labor_cost', 'unit_equipment_cost', 'unit_sub_cost'] as ImportField[])
        .slice(0, width)
        .concat(Array.from({ length: Math.max(0, width - 8) }, () => 'ignore' as ImportField));

  const { rows, emptyRows } = applyMapping(clean, mapping, { hasHeader });

  return {
    headers,
    mapping,
    rows,
    raw: clean.slice(0, 12).map((r) => Array.from({ length: width }, (_, i) => String(r[i] ?? ''))),
    skippedHeader: hasHeader,
    totalRows: rows.length,
    emptyRows: emptyRows + blankRows,
  };
}

/** Every field the mapping dropdown offers, in a sensible order. */
export const FIELD_OPTIONS: ImportField[] = [
  'description', 'csi_code', 'quantity', 'unit', 'waste_factor_pct',
  'unit_material_cost', 'unit_labor_cost', 'unit_equipment_cost', 'unit_sub_cost',
  'notes', 'ignore',
];
