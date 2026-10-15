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
 * Per-line amounts are optional input. bid_submissions.unit_price_items and
 * the alternate columns exist but no flow writes them yet; parseLineAmounts /
 * parseAlternates read them defensively so the grid fills in the moment they
 * are captured, and level on base totals + scope status until then.
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

export interface LineAmount { amountCents: number | null; status?: 'included' | 'excluded' | 'clarify' }

/**
 * Read bid_submissions.unit_price_items into per-line amounts keyed by
 * bid_package_items.id. Accepts an array of objects ({ itemId | lineId |
 * scopeLineId | bid_package_item_id | id, amount | total | total_amount |
 * price | value, status? }) or a plain { [itemId]: amount } map. Anything that
 * does not name a known line is dropped — never guessed onto one.
 */
export function parseLineAmounts(raw: unknown, lineIds: Iterable<string>): Record<string, LineAmount> {
  const valid = new Set(Array.from(lineIds, String));
  const out: Record<string, LineAmount> = {};
  let v: unknown = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return out; } }
  if (!v || typeof v !== 'object') return out;
  const put = (id: unknown, amt: unknown, status?: unknown) => {
    const key = String(id ?? '');
    if (!valid.has(key)) return;
    const st = typeof status === 'string' ? status.toLowerCase() : '';
    const cents = toCentsNum(amt);
    out[key] = {
      amountCents: cents != null && cents > 0 ? cents : null,
      ...(st === 'included' || st === 'excluded' || st === 'clarify' ? { status: st as LineAmount['status'] } : {}),
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
