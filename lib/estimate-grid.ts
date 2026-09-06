/**
 * lib/estimate-grid.ts
 *
 * The arithmetic and clipboard handling behind the estimate grid — pure, so the
 * paste path can be tested without a browser.
 *
 * Buildern's estimate row is Name / Cost Type / Group / Quantity / Unit / Unit
 * Cost / Markup. takeoff_line_items already carries more than that: four cost
 * buckets per line rather than one, a waste factor that drives a generated
 * adjusted quantity, and page/sheet/spec references tying the line back to the
 * drawing it came off. The grid's job is to make that editable at the speed of a
 * spreadsheet without losing any of it.
 *
 * Clipboard parsing gets its own attention because it is where estimating tools
 * quietly corrupt money. Excel hands over TSV whose fields may be quoted, may
 * contain tabs and newlines inside the quotes, and whose numbers arrive as
 * "$1,234.50", "(500)" for negative, "12%" and "1 234,50" depending on locale.
 * Reading those naively with split('\t') and Number() turns a $1,234.50 line
 * into NaN and a bracketed credit into a positive number.
 */

export type CostBucket = 'material' | 'labor' | 'equipment' | 'sub';

export interface GridRow {
  id?: string | null;
  csi_division?: string | null;
  csi_code?: string | null;
  description?: string;
  quantity?: number | null;
  unit?: string | null;
  waste_factor_pct?: number | null;
  unit_material_cost?: number | null;
  unit_labor_cost?: number | null;
  unit_equipment_cost?: number | null;
  unit_sub_cost?: number | null;
  is_allowance?: boolean | null;
  is_excluded?: boolean | null;
  notes?: string | null;
  sheet_number?: string | null;
  spec_section?: string | null;
  sort_order?: number | null;
  /** Set by the grid when a user edits a row the AI produced. */
  manually_edited?: boolean | null;
}

/**
 * Parse a number the way a spreadsheet user types one.
 *
 * Returns null rather than 0 for genuinely empty input: a blank unit cost and a
 * zero unit cost are different claims, and collapsing them silently fills an
 * estimate with zeros nobody entered.
 */
export function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;

  /* Accounting negatives: (500) means -500. */
  let negative = false;
  if (/^\((.*)\)$/.test(s)) { negative = true; s = s.replace(/^\(|\)$/g, ''); }
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }

  s = s.replace(/[$£€\s]/g, '').replace(/%$/, '');

  /* "1.234,50" (European) vs "1,234.50" (US). Whichever separator appears last
     is the decimal point; the other is a thousands separator. */
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    /* A lone comma is a decimal point only when it is not grouping digits. */
    s = /,\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * Split a clipboard payload into a grid of cells.
 *
 * Handles Excel's quoted fields, which may contain the delimiter and newlines,
 * and doubled quotes as an escaped quote. Delimiter is detected per payload —
 * Excel gives tabs, a CSV export gives commas.
 */
export function parseClipboard(text: string): string[][] {
  if (!text) return [];
  const body = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '');
  if (!body) return [];

  /* Tab wins whenever one is present, however many commas there are.
     Excel and Sheets always put tabs on the clipboard, so a payload containing
     any unquoted tab came from a spreadsheet and its cells may legitimately
     contain commas — "Slab, 6in<TAB>1200" must stay two cells, not three.
     Commas are only the delimiter when the paste came from a CSV file. */
  let tabs = 0, q = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"') q = !q;
    else if (!q && c === '\t') tabs++;
  }
  const delim = tabs > 0 ? '\t' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inQuotes) {
      if (c === '"') {
        if (body[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === delim) { row.push(cell); cell = ''; continue; }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += c;
  }
  row.push(cell);
  rows.push(row);

  return rows.map((r) => r.map((c) => c.trim()));
}

/** Column order the grid pastes into, matching what it displays. */
export const PASTE_COLUMNS = [
  'csi_code', 'description', 'quantity', 'unit',
  'unit_material_cost', 'unit_labor_cost', 'unit_equipment_cost', 'unit_sub_cost',
] as const;

const NUMERIC = new Set<string>([
  'quantity', 'waste_factor_pct',
  'unit_material_cost', 'unit_labor_cost', 'unit_equipment_cost', 'unit_sub_cost',
]);

/** Does this look like a header row rather than data? */
export function looksLikeHeader(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase();
  if (!joined.trim()) return false;
  const words = ['description', 'qty', 'quantity', 'unit', 'cost', 'material', 'labor', 'labour', 'code', 'item', 'total'];
  const hits = words.filter((w) => joined.includes(w)).length;
  /* Header rows name columns and carry no numbers in the numeric positions. */
  const numericish = cells.slice(2).filter((c) => parseNumber(c) != null).length;
  return hits >= 2 && numericish === 0;
}

/**
 * Turn a clipboard grid into rows, starting at a column offset so a paste can
 * land mid-grid the way it does in Excel.
 */
export function clipboardToRows(
  cells: string[][],
  startColumn = 0,
): { rows: Partial<GridRow>[]; skippedHeader: boolean } {
  if (cells.length === 0) return { rows: [], skippedHeader: false };

  let start = 0;
  let skippedHeader = false;
  if (looksLikeHeader(cells[0])) { start = 1; skippedHeader = true; }

  const rows: Partial<GridRow>[] = [];
  for (let r = start; r < cells.length; r++) {
    const line = cells[r];
    if (line.every((c) => c === '')) continue;
    const row: Partial<GridRow> = {};
    for (let c = 0; c < line.length; c++) {
      const col = PASTE_COLUMNS[startColumn + c];
      if (!col) continue;
      const raw = line[c];
      if (raw === '') continue;
      if (NUMERIC.has(col)) {
        const n = parseNumber(raw);
        if (n != null) (row as Record<string, unknown>)[col] = n;
      } else {
        (row as Record<string, unknown>)[col] = raw;
      }
    }
    if (Object.keys(row).length > 0) rows.push(row);
  }
  return { rows, skippedHeader };
}

export interface LineTotals {
  adjustedQuantity: number;
  material: number;
  labor: number;
  equipment: number;
  sub: number;
  total: number;
}

/**
 * Line arithmetic, mirroring the generated columns in the database.
 *
 * The database computes adjusted_quantity and the four totals itself; this
 * reproduces them so the grid can show a running total as somebody types
 * instead of after a round trip. Excluded lines contribute nothing — they are
 * scope the estimate explicitly does not cover, and quietly adding them to the
 * total is how an exclusion turns into a liability.
 */
export function lineTotals(row: GridRow): LineTotals {
  const qty = Number(row.quantity) || 0;
  const waste = Number(row.waste_factor_pct) || 0;
  const adjustedQuantity = Math.round(qty * (1 + waste / 100) * 10000) / 10000;

  if (row.is_excluded) {
    return { adjustedQuantity, material: 0, labor: 0, equipment: 0, sub: 0, total: 0 };
  }

  const at = (v: unknown) => Math.round(adjustedQuantity * (Number(v) || 0) * 100) / 100;
  const material = at(row.unit_material_cost);
  const labor = at(row.unit_labor_cost);
  const equipment = at(row.unit_equipment_cost);
  const sub = at(row.unit_sub_cost);
  return {
    adjustedQuantity, material, labor, equipment, sub,
    total: Math.round((material + labor + equipment + sub) * 100) / 100,
  };
}

export interface GroupTotals {
  division: string;
  label: string;
  rows: number;
  material: number;
  labor: number;
  equipment: number;
  sub: number;
  total: number;
  allowances: number;
  exclusions: number;
}

/** CSI division names, so a group header reads "03 · Concrete" not "03". */
export const CSI_DIVISIONS: Record<string, string> = {
  '00': 'Procurement & Contracting', '01': 'General Requirements', '02': 'Existing Conditions',
  '03': 'Concrete', '04': 'Masonry', '05': 'Metals', '06': 'Wood & Plastics',
  '07': 'Thermal & Moisture', '08': 'Openings', '09': 'Finishes', '10': 'Specialties',
  '11': 'Equipment', '12': 'Furnishings', '13': 'Special Construction', '14': 'Conveying',
  '21': 'Fire Suppression', '22': 'Plumbing', '23': 'HVAC', '25': 'Integrated Automation',
  '26': 'Electrical', '27': 'Communications', '28': 'Electronic Safety',
  '31': 'Earthwork', '32': 'Exterior Improvements', '33': 'Utilities',
};

export const divisionOf = (row: GridRow): string => {
  const d = String(row.csi_division ?? '').trim();
  if (d) return d.slice(0, 2).padStart(2, '0');
  const c = String(row.csi_code ?? '').trim();
  return c ? c.slice(0, 2).padStart(2, '0') : '—';
};

/** Group rows by CSI division with subtotals, ordered by division number. */
export function groupRows(rows: GridRow[]): GroupTotals[] {
  const m = new Map<string, GridRow[]>();
  for (const r of rows) {
    const d = divisionOf(r);
    const arr = m.get(d) ?? [];
    arr.push(r);
    m.set(d, arr);
  }
  return [...m.entries()]
    .map(([division, rs]) => {
      const t = rs.map(lineTotals);
      const sum = (k: keyof LineTotals) => Math.round(t.reduce((s, x) => s + (x[k] as number), 0) * 100) / 100;
      return {
        division,
        label: CSI_DIVISIONS[division] ? `${division} · ${CSI_DIVISIONS[division]}` : division,
        rows: rs.length,
        material: sum('material'), labor: sum('labor'),
        equipment: sum('equipment'), sub: sum('sub'), total: sum('total'),
        allowances: rs.filter((r) => r.is_allowance).length,
        exclusions: rs.filter((r) => r.is_excluded).length,
      };
    })
    .sort((a, b) => a.division.localeCompare(b.division));
}

/** Whole-estimate totals. */
export function estimateTotals(rows: GridRow[]) {
  const g = groupRows(rows);
  const sum = (k: keyof GroupTotals) => Math.round(g.reduce((s, x) => s + (x[k] as number), 0) * 100) / 100;
  return {
    material: sum('material'), labor: sum('labor'),
    equipment: sum('equipment'), sub: sum('sub'), total: sum('total'),
    lines: rows.length,
    allowances: rows.filter((r) => r.is_allowance).length,
    exclusions: rows.filter((r) => r.is_excluded).length,
  };
}
