/**
 * Bid leveling GRID — the view model for the scope × bidder leveling sheet.
 *
 * The money math is lib/bidleveling (the one engine; the iOS shell runs the
 * same web screen). This file turns its result into the grid a GC reads:
 *   rows    = the package's scope lines, then Alternates, Bond, Exclusions /
 *             Clarifications and the totals;
 *   columns = each bidder, sorted low → high by LEVELED total;
 *   cells   = that bidder's amount for the line, or Included / Excluded /
 *             Clarify / Not quoted, toned per row: lowest priced (low),
 *             missing or excluded scope (gap), more than 25% over the row
 *             median (outlier).
 *
 * Plugging: a gap is filled with the row median of the bidders who DID price
 * that line, so totals compare like for like. The plug can be switched off to
 * see the bids as submitted. A gap on a line nobody priced has no median and
 * is never given a made-up figure — it is counted as an unpriced gap instead.
 *
 * Per-line amounts come from the bidder's price sheet on the bid portal
 * (normalizeBidSheet writes bid_submissions.unit_price_items and
 * alternate_amounts; parseLineAmounts / parseAlternates / parseBond read them
 * back). A bid submitted without a sheet levels on its base total + scope
 * status.
 */
import { levelBids, type ScopeLine, type Bidder, type Alternate, type LevelingResult, type LeveledBidder } from '@/lib/bidleveling';

export type CellKind = 'priced' | 'included' | 'excluded' | 'clarify' | 'alternate' | 'not_quoted';
export type CellTone = 'low' | 'gap' | 'outlier' | null;

export interface GridCell {
  bidderId: string;
  kind: CellKind;
  amountCents: number | null;
  /** Median plug added to the leveled total for this gap (0 when off/none). */
  plugCents: number;
  /** A gap with no row median to plug it with. */
  unpricedGap: boolean;
  tone: CellTone;
}

export interface GridRow {
  lineId: string;
  code?: string;
  description: string;
  medianCents: number | null;
  pricedCount: number;
  cells: GridCell[];
}

export interface BidderExtras {
  exclusions?: string | null;
  inclusions?: string | null;
  clarifications?: string | null;
  awarded?: boolean;
}

export interface GridColumn {
  id: string;
  name: string;
  baseCents: number;
  plugCents: number;
  plugCount: number;
  unpricedGapCount: number;
  alternatesCents: number;
  alternates: Alternate[];
  adjustmentsCents: number;
  bondCents: number;
  bondIncluded: boolean | null;
  leveledCents: number;
  vsLowCents: number;
  vsLowPct: number | null;
  baseTone: CellTone;
  leveledTone: CellTone;
  isLowLeveled: boolean;
  extras: BidderExtras;
}

export interface LevelingGrid {
  columns: GridColumn[];
  rows: GridRow[];
  plugGaps: boolean;
  lowLeveledCents: number | null;
  highLeveledCents: number | null;
  spreadCents: number;
  spreadPct: number | null;
  medianLeveledCents: number | null;
  result: LevelingResult;
}

export interface GridOptions {
  plugGaps?: boolean;
  selectedAlternateKeys?: string[];
  budgetCents?: number;
  /** Fraction above the row median that marks an outlier. Default 0.25. */
  outlierPct?: number;
  extras?: Record<string, BidderExtras>;
}

const round = (n: number) => Math.round(n || 0);

export function median(vals: number[]): number | null {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function kindOf(line: LeveledBidder['lines'][number]): CellKind {
  if (line.status === 'missing') return 'not_quoted';
  if ((line.status === 'included' || line.status === 'alternate') && line.valueCents != null && line.valueCents > 0) return 'priced';
  return line.status;
}

/** Tone a set of priced figures: lowest of 2+ is 'low', > median × (1+k) is 'outlier'. */
function toneFigures(values: { id: string; v: number }[], k: number): Map<string, CellTone> {
  const out = new Map<string, CellTone>();
  const priced = values.filter((x) => x.v > 0);
  if (priced.length < 2) return out;
  const med = median(priced.map((x) => x.v))!;
  const low = Math.min(...priced.map((x) => x.v));
  for (const x of priced) {
    if (x.v === low) out.set(x.id, 'low');
    else if (med > 0 && x.v > med * (1 + k)) out.set(x.id, 'outlier');
  }
  return out;
}

export function buildLevelingGrid(scopeLines: ScopeLine[], bidders: Bidder[], opts: GridOptions = {}): LevelingGrid {
  const plugGaps = opts.plugGaps !== false;
  const k = opts.outlierPct ?? 0.25;
  /* Plug off = an explicit zero allowance on every line; the engine then adds
     nothing for gaps and everything else stays identical. */
  const gapAllowanceCents = plugGaps ? undefined : Object.fromEntries(scopeLines.map((l) => [l.id, 0]));
  const result = levelBids(scopeLines, bidders, {
    gapAllowanceCents,
    selectedAlternateKeys: opts.selectedAlternateKeys,
    budgetCents: opts.budgetCents,
  });

  const byId = new Map(bidders.map((b) => [b.id, b]));
  const sorted = [...result.bidders].sort((a, b) =>
    a.leveledTotalCents - b.leveledTotalCents || a.baseBidCents - b.baseBidCents || a.name.localeCompare(b.name));

  const rows: GridRow[] = scopeLines.map((l) => {
    const cov = result.scopeCoverage.find((c) => c.scopeLineId === l.id);
    const cells: GridCell[] = sorted.map((lb) => {
      const ln = lb.lines.find((x) => x.scopeLineId === l.id)!;
      const kind = kindOf(ln);
      return {
        bidderId: lb.id,
        kind,
        amountCents: ln.valueCents,
        plugCents: ln.allowanceAppliedCents,
        unpricedGap: ln.isGap && ln.allowanceAppliedCents === 0,
        tone: ln.isGap || kind === 'excluded' || kind === 'not_quoted' || kind === 'clarify' ? 'gap' : null,
      };
    });
    const tones = toneFigures(cells.filter((c) => c.kind === 'priced').map((c) => ({ id: c.bidderId, v: c.amountCents || 0 })), k);
    for (const c of cells) { const t = tones.get(c.bidderId); if (t) c.tone = t; }
    return {
      lineId: l.id,
      code: l.csi,
      description: l.description,
      medianCents: cov?.benchmarkCents ?? null,
      pricedCount: cells.filter((c) => c.kind === 'priced').length,
      cells,
    };
  });

  const baseTones = toneFigures(sorted.map((b) => ({ id: b.id, v: b.baseBidCents })), k);
  const levTones = toneFigures(sorted.map((b) => ({ id: b.id, v: b.leveledTotalCents })), k);
  const leveledPos = sorted.map((b) => b.leveledTotalCents).filter((v) => v > 0);
  const low = leveledPos.length ? Math.min(...leveledPos) : null;
  const high = leveledPos.length ? Math.max(...leveledPos) : null;

  const columns: GridColumn[] = sorted.map((lb) => {
    const src = byId.get(lb.id);
    const gapLines = lb.lines.filter((x) => x.isGap);
    return {
      id: lb.id,
      name: lb.name,
      baseCents: lb.baseBidCents,
      plugCents: lb.gapAllowanceCents,
      plugCount: gapLines.filter((x) => x.allowanceAppliedCents > 0).length,
      unpricedGapCount: gapLines.filter((x) => x.allowanceAppliedCents === 0).length,
      alternatesCents: lb.alternatesAdjCents,
      alternates: src?.alternates || [],
      adjustmentsCents: lb.adjustmentsCents,
      bondCents: round(src?.adjustments?.bondCents || 0),
      bondIncluded: typeof src?.bondIncluded === 'boolean' ? src.bondIncluded : null,
      leveledCents: lb.leveledTotalCents,
      vsLowCents: low != null && lb.leveledTotalCents > 0 ? lb.leveledTotalCents - low : 0,
      vsLowPct: low != null && low > 0 && lb.leveledTotalCents > 0 ? Math.round(((lb.leveledTotalCents - low) / low) * 1000) / 10 : null,
      baseTone: baseTones.get(lb.id) ?? null,
      leveledTone: levTones.get(lb.id) ?? null,
      isLowLeveled: low != null && lb.leveledTotalCents === low,
      extras: opts.extras?.[lb.id] || {},
    };
  });

  return {
    columns,
    rows,
    plugGaps,
    lowLeveledCents: low,
    highLeveledCents: high,
    spreadCents: low != null && high != null ? high - low : 0,
    spreadPct: low != null && high != null && low > 0 ? Math.round(((high - low) / low) * 1000) / 10 : null,
    medianLeveledCents: median(leveledPos),
    result,
  };
}

/* ── Stored per-line data ──────────────────────────────────────────────────── */

const toCentsNum = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(/[^0-9.-]/g, '')) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export interface LineAmount { amountCents: number | null; status?: 'included' | 'excluded' | 'clarify' | 'not_quoted' }

/* ── The bidder's line-item price sheet (portal writer ⇄ leveling reader) ────
 *
 * The bid portal writes bid_submissions.unit_price_items in ONE canonical
 * shape, and the leveling route reads it back through parseLineAmounts /
 * parseBond below. Both sides go through this section so the shape cannot
 * drift between them:
 *
 *   unit_price_items = {
 *     version: 1,
 *     lines: [{ itemId, status, amount }],   // amount: dollars, priced only
 *     bond:  { status, amount } | null,       // amount: dollars, priced only
 *     linesTotal: dollars,                    // sum of priced lines
 *     totalNote?: string,                     // why the base differs from linesTotal
 *   }
 *   alternate_amounts = [{ key, label, amount, kind }]  // amount signed: deduct < 0
 *
 * Amounts are dollars rounded to the cent, as every other bid_submissions
 * money column is.
 */

export type LineQuote = 'priced' | 'included' | 'excluded' | 'not_quoted';
export const LINE_QUOTES: readonly LineQuote[] = ['priced', 'included', 'excluded', 'not_quoted'];
export type BondQuote = 'included' | 'priced' | 'not_offered';
export const BOND_QUOTES: readonly BondQuote[] = ['included', 'priced', 'not_offered'];

export interface BidLine { itemId: string; status: LineQuote; amount: number | null }
export interface BidBond { status: BondQuote; amount: number | null }
export interface BidAlternateEntry { key: string; label: string; amount: number; kind: 'add' | 'deduct' }
export interface UnitPriceItems {
  version: 1;
  lines: BidLine[];
  bond: BidBond | null;
  linesTotal: number;
  totalNote?: string;
}

/** Largest single figure accepted ($10bn) — anything above is a typo. */
export const MAX_BID_DOLLARS = 10_000_000_000;
export const MAX_ALTERNATES = 10;

const toDollars = (cents: number) => Math.round(cents) / 100;

/** A money input → whole cents, or null when it is not a finite number ≥ 0. */
export function moneyToCents(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\$?\s*[0-9,]*\.?[0-9]+\s*$/.test(v) ? parseFloat(v.replace(/[$,\s]/g, '')) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > MAX_BID_DOLLARS) return null;
  return Math.round(n * 100);
}

export interface BidSheetInput {
  lines?: unknown;
  alternates?: unknown;
  bond?: unknown;
}

export type BidSheetResult =
  | { ok: true; unitPriceItems: UnitPriceItems | null; alternateAmounts: BidAlternateEntry[]; linesTotalCents: number; pricedLineCount: number; bondIncluded: boolean }
  | { ok: false; error: string };

/**
 * Validate the bidder's price sheet against THIS package's line ids and turn
 * it into the stored shape. Rejects (never silently drops) an unknown line,
 * a repeated line, an unknown status, and any amount that is not a number
 * ≥ 0. A priced line needs an amount; a priced line of $0 is stored as
 * Included. Lines the sheet does not mention are stored as Not quoted, so a
 * stored sheet always covers every line of the package.
 */
export function normalizeBidSheet(input: BidSheetInput, lineIds: Iterable<string>, lineNames: Record<string, string> = {}): BidSheetResult {
  const ids = Array.from(lineIds, String);
  const valid = new Set(ids);
  const name = (id: string) => lineNames[id] || 'a scope line';
  const byId = new Map<string, BidLine>();
  let totalCents = 0;
  let priced = 0;

  if (input.lines != null) {
    if (!Array.isArray(input.lines)) return { ok: false, error: 'Line prices must be a list.' };
    for (const raw of input.lines) {
      if (!raw || typeof raw !== 'object') return { ok: false, error: 'A line price is malformed.' };
      const o = raw as Record<string, unknown>;
      const id = String(o.itemId ?? '');
      if (!valid.has(id)) return { ok: false, error: 'A priced line is not part of this bid package. Reload the page and try again.' };
      if (byId.has(id)) return { ok: false, error: `${name(id)} is listed twice.` };
      const status = String(o.status ?? '') as LineQuote;
      if (!LINE_QUOTES.includes(status)) return { ok: false, error: `Choose a price, Included, Excluded or Not quoted for ${name(id)}.` };
      if (status === 'priced') {
        const cents = moneyToCents(o.amount);
        if (cents == null) return { ok: false, error: `Enter a dollar amount of 0 or more for ${name(id)}.` };
        if (cents === 0) { byId.set(id, { itemId: id, status: 'included', amount: null }); continue; }
        totalCents += cents;
        priced += 1;
        byId.set(id, { itemId: id, status, amount: toDollars(cents) });
      } else {
        byId.set(id, { itemId: id, status, amount: null });
      }
    }
  }

  let bond: BidBond | null = null;
  if (input.bond != null) {
    const o = input.bond as Record<string, unknown>;
    const status = String((o && typeof o === 'object' ? o.status : '') ?? '') as BondQuote;
    if (!BOND_QUOTES.includes(status)) return { ok: false, error: 'Choose how the bond is priced.' };
    if (status === 'priced') {
      const cents = moneyToCents(o.amount);
      if (cents == null || cents === 0) return { ok: false, error: 'Enter the bond price, or choose Included or Not offered.' };
      bond = { status, amount: toDollars(cents) };
    } else bond = { status, amount: null };
  }

  const alternateAmounts: BidAlternateEntry[] = [];
  if (input.alternates != null) {
    if (!Array.isArray(input.alternates)) return { ok: false, error: 'Alternates must be a list.' };
    if (input.alternates.length > MAX_ALTERNATES) return { ok: false, error: `Up to ${MAX_ALTERNATES} alternates.` };
    input.alternates.forEach((raw) => {
      if (!raw || typeof raw !== 'object') return;
      const o = raw as Record<string, unknown>;
      const label = String(o.label ?? '').trim().slice(0, 200);
      const cents = moneyToCents(o.amount);
      if (!label && (o.amount === '' || o.amount == null)) return; // an empty row the bidder never filled
      alternateAmounts.push({ key: '', label, amount: cents ?? NaN, kind: o.kind === 'deduct' ? 'deduct' : 'add' });
    });
    for (const a of alternateAmounts) {
      if (!a.label) return { ok: false, error: 'Describe each alternate.' };
      if (!Number.isFinite(a.amount) || a.amount <= 0) return { ok: false, error: `Enter an amount above 0 for "${a.label}".` };
    }
    alternateAmounts.forEach((a, i) => {
      a.key = `Alt ${i + 1}`;
      a.amount = toDollars(a.amount) * (a.kind === 'deduct' ? -1 : 1);
    });
  }

  const sheetGiven = input.lines != null || bond != null;
  const unitPriceItems: UnitPriceItems | null = sheetGiven
    ? {
        version: 1,
        /* Package order, every line present: unmentioned = Not quoted. */
        lines: ids.map((id) => byId.get(id) || { itemId: id, status: 'not_quoted' as const, amount: null }),
        bond,
        linesTotal: toDollars(totalCents),
      }
    : null;
  return { ok: true, unitPriceItems, alternateAmounts, linesTotalCents: totalCents, pricedLineCount: priced, bondIncluded: bond?.status === 'included' };
}

/** The stored sheet's lines, in canonical form, on known lines only. */
export function readBidLines(raw: unknown, lineIds: Iterable<string>): BidLine[] {
  const amounts = parseLineAmounts(raw, lineIds);
  return Object.entries(amounts).map(([itemId, a]) => ({
    itemId,
    status: a.status === 'not_quoted' ? 'not_quoted'
      : a.status === 'excluded' ? 'excluded'
        : a.amountCents ? 'priced'
          : 'included',
    amount: a.status === 'not_quoted' || a.status === 'excluded' || !a.amountCents ? null : toDollars(a.amountCents),
  }));
}

/** The stored bond quote, or null when the sheet carries none. */
export function parseBond(raw: unknown): { status: BondQuote; amountCents: number | null } | null {
  let v: unknown = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const b = (v as Record<string, unknown>).bond as Record<string, unknown> | null | undefined;
  if (!b || typeof b !== 'object') return null;
  const status = String(b.status ?? '') as BondQuote;
  if (!BOND_QUOTES.includes(status)) return null;
  const cents = status === 'priced' ? toCentsNum(b.amount) : null;
  if (status === 'priced' && (cents == null || cents <= 0)) return null;
  return { status, amountCents: cents };
}

/** The bidder's note on why their base differs from the line total. */
export function parseTotalNote(raw: unknown): string | null {
  let v: unknown = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const n = (v as Record<string, unknown>).totalNote;
  return typeof n === 'string' && n.trim() ? n.trim() : null;
}

/**
 * Read bid_submissions.unit_price_items into per-line amounts keyed by
 * bid_package_items.id. Reads the canonical sheet above ({ version, lines })
 * and, defensively, the older loose shapes: an array of objects ({ itemId |
 * lineId | scopeLineId | bid_package_item_id | id, amount | total |
 * total_amount | price | value, status? }) or a plain { [itemId]: amount }
 * map. Anything that does not name a known line is dropped — never guessed
 * onto one.
 */
export function parseLineAmounts(raw: unknown, lineIds: Iterable<string>): Record<string, LineAmount> {
  const valid = new Set(Array.from(lineIds, String));
  const out: Record<string, LineAmount> = {};
  let v: unknown = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return out; } }
  if (!v || typeof v !== 'object') return out;
  if (!Array.isArray(v) && Array.isArray((v as Record<string, unknown>).lines)) v = (v as Record<string, unknown>).lines;
  const put = (id: unknown, amt: unknown, status?: unknown) => {
    const key = String(id ?? '');
    if (!valid.has(key)) return;
    const st = typeof status === 'string' ? status.toLowerCase() : '';
    const cents = st === 'not_quoted' ? null : toCentsNum(amt);
    out[key] = {
      amountCents: cents != null && cents > 0 ? cents : null,
      ...(st === 'included' || st === 'excluded' || st === 'clarify' || st === 'not_quoted' ? { status: st as LineAmount['status'] } : {}),
    };
  };
  if (Array.isArray(v)) {
    for (const it of v) {
      if (!it || typeof it !== 'object') continue;
      const o = it as Record<string, unknown>;
      put(o.itemId ?? o.lineId ?? o.scopeLineId ?? o.bid_package_item_id ?? o.item_id ?? o.id,
        o.amount ?? o.total ?? o.total_amount ?? o.price ?? o.value, o.status);
    }
  } else {
    for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
      if (val && typeof val === 'object') { const o = val as Record<string, unknown>; put(key, o.amount ?? o.total ?? o.price ?? o.value, o.status); }
      else put(key, val);
    }
  }
  return out;
}

/**
 * Read a submission's alternates: alternate_amounts (array of { key?, label |
 * description | name, amount }) first, else alternate_1..3 with the
 * `alternates` text as the description. A negative amount is a deduct.
 */
export function parseAlternates(row: Record<string, unknown>): Alternate[] {
  const out: Alternate[] = [];
  let arr: unknown = row.alternate_amounts;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { arr = null; } }
  if (Array.isArray(arr)) {
    arr.forEach((it, i) => {
      if (!it || typeof it !== 'object') return;
      const o = it as Record<string, unknown>;
      const cents = toCentsNum(o.amount ?? o.value ?? o.price);
      if (cents == null || cents === 0) return;
      const kind = o.kind === 'deduct' || cents < 0 ? 'deduct' : 'add';
      out.push({ key: String(o.key ?? `Alt ${i + 1}`), description: String(o.label ?? o.description ?? o.name ?? `Alternate ${i + 1}`), valueCents: Math.abs(cents), kind });
    });
    if (out.length) return out;
  }
  const label = typeof row.alternates === 'string' ? row.alternates.trim() : '';
  ([1, 2, 3] as const).forEach((n) => {
    const cents = toCentsNum(row[`alternate_${n}`]);
    if (cents == null || cents === 0) return;
    out.push({ key: `Alt ${n}`, description: label ? `${label} (${n})` : `Alternate ${n}`, valueCents: Math.abs(cents), kind: cents < 0 ? 'deduct' : 'add' });
  });
  return out;
}

/* ── CSV ───────────────────────────────────────────────────────────────────── */

const dollars = (cents: number) => (cents / 100).toFixed(2);
/** Quote, and defuse a leading = + - @ so a spreadsheet never runs a cell. */
function csvText(s: string): string {
  const t = !/^-?\d+(\.\d+)?$/.test(s) && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
const CELL_LABEL: Record<CellKind, string> = { priced: '', included: 'Included', excluded: 'Excluded', clarify: 'Clarify', alternate: 'Alternate', not_quoted: 'Not quoted' };

export function cellText(c: GridCell): string {
  const base = c.kind === 'priced' ? dollars(c.amountCents || 0) : CELL_LABEL[c.kind];
  return c.plugCents > 0 ? `${base} (plug ${dollars(c.plugCents)})` : base;
}

export function toLevelingCsv(grid: LevelingGrid, title?: string): string {
  const lines: string[][] = [];
  if (title) lines.push([title]);
  lines.push(['Scope', 'Row median', ...grid.columns.map((c) => c.name)]);
  for (const r of grid.rows) {
    lines.push([[r.code, r.description].filter(Boolean).join(' '), r.medianCents != null ? dollars(r.medianCents) : '', ...r.cells.map(cellText)]);
  }
  lines.push(['Alternates', '', ...grid.columns.map((c) => (c.alternatesCents ? dollars(c.alternatesCents) : c.alternates.length ? `${c.alternates.length} offered, none applied` : ''))]);
  lines.push(['Bond', '', ...grid.columns.map((c) => (c.bondCents ? dollars(c.bondCents) : c.bondIncluded === true ? 'Included' : c.bondIncluded === false ? 'Not included' : ''))]);
  lines.push(['Exclusions', '', ...grid.columns.map((c) => c.extras.exclusions || '')]);
  lines.push(['Clarifications', '', ...grid.columns.map((c) => c.extras.clarifications || '')]);
  lines.push(['Base bid', '', ...grid.columns.map((c) => dollars(c.baseCents))]);
  lines.push([grid.plugGaps ? 'Gap plugs (row median)' : 'Gap plugs (off)', '', ...grid.columns.map((c) => dollars(c.plugCents))]);
  lines.push(['Adjustments', '', ...grid.columns.map((c) => dollars(c.adjustmentsCents))]);
  lines.push(['Leveled total', '', ...grid.columns.map((c) => dollars(c.leveledCents))]);
  lines.push(['vs low', '', ...grid.columns.map((c) => (c.vsLowPct == null ? '' : `${dollars(c.vsLowCents)} (${c.vsLowPct}%)`))]);
  lines.push(['Spread', grid.spreadPct == null ? '' : `${dollars(grid.spreadCents)} (${grid.spreadPct}%)`]);
  return lines.map((row) => row.map((v) => csvText(String(v))).join(',')).join('\r\n') + '\r\n';
}
