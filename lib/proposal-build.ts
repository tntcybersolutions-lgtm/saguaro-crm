/**
 * lib/proposal-build.ts
 *
 * Turning an estimate into a client proposal.
 *
 * Buildern's pitch for this is "converts estimates into formatted client
 * documents instantly without manual formatting", and it is the right pitch:
 * retyping an estimate into a proposal is where numbers drift apart and where
 * an evening goes. Saguaro already had a proposals table with e-signature
 * fields and a proposal_lines table with rows in it — and no code path that
 * read or wrote those lines, so a proposal could state a total and never show
 * what was in it.
 *
 * Two things this is careful about, because both lose real money:
 *
 * MARKUP IS NOT MARGIN. Adding 20% markup to $100 of cost gives $120, and the
 * margin on that is 16.7%. Selling at 20% MARGIN means $125. Builders use both
 * words, often interchangeably, and quoting one while meaning the other is a
 * silent 4-8% haircut on every job. Both are supported and named exactly.
 *
 * EXCLUSIONS ARE NOT LINES. Scope the estimate explicitly disclaims must never
 * appear as a priced row on a document a client signs — it becomes an
 * exclusions paragraph instead. An exclusion that reads as an inclusion is a
 * lawsuit.
 */

export interface EstimateSource {
  csi_division?: string | null;
  csi_code?: string | null;
  description?: string | null;
  quantity?: unknown;
  unit?: string | null;
  waste_factor_pct?: unknown;
  unit_material_cost?: unknown;
  unit_labor_cost?: unknown;
  unit_equipment_cost?: unknown;
  unit_sub_cost?: unknown;
  is_allowance?: unknown;
  is_excluded?: unknown;
  notes?: string | null;
  sort_order?: unknown;
}

export interface ProposalLine {
  sort_order: number;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total_price: number;
  is_optional: boolean;
  notes: string | null;
}

export type Granularity = 'line' | 'division';
export type UpliftMode = 'markup' | 'margin';

export interface BuildOptions {
  /** One row per estimate line, or one summary row per CSI division. */
  granularity?: Granularity;
  /** How the percentage is interpreted. See the note above — they differ. */
  upliftMode?: UpliftMode;
  /** Percentage, e.g. 15 for 15%. */
  upliftPct?: number;
  /** Allowance lines are carried through and labelled rather than buried. */
  labelAllowances?: boolean;
  /** Treat optional scope as a separate, unpriced-in-total section. */
  optionalDivisions?: string[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Cost of one estimate line, waste factor included, exclusions at zero. */
export function lineCost(r: EstimateSource): number {
  if (r.is_excluded) return 0;
  const qty = num(r.quantity) * (1 + num(r.waste_factor_pct) / 100);
  const unit = num(r.unit_material_cost) + num(r.unit_labor_cost) + num(r.unit_equipment_cost) + num(r.unit_sub_cost);
  return round2(qty * unit);
}

/**
 * Apply markup or margin to a cost.
 *
 * markup: sell = cost × (1 + pct/100)      — 20% on 100 → 120
 * margin: sell = cost ÷ (1 − pct/100)      — 20% on 100 → 125
 *
 * A margin of 100% or more has no finite answer; it is refused rather than
 * returning Infinity into a document somebody signs.
 */
export function applyUplift(cost: number, pct: number, mode: UpliftMode): number {
  if (!pct) return round2(cost);
  if (mode === 'margin') {
    if (pct >= 100) throw new Error('Margin must be under 100% — at 100% the sell price is unbounded.');
    return round2(cost / (1 - pct / 100));
  }
  return round2(cost * (1 + pct / 100));
}

/** The margin actually achieved by a sell price, for the summary. */
export function realisedMarginPct(cost: number, sell: number): number | null {
  if (sell <= 0) return null;
  return Math.round(((sell - cost) / sell) * 1000) / 10;
}

export const CSI_NAMES: Record<string, string> = {
  '01': 'General Requirements', '02': 'Existing Conditions', '03': 'Concrete', '04': 'Masonry',
  '05': 'Metals', '06': 'Wood & Plastics', '07': 'Thermal & Moisture Protection', '08': 'Openings',
  '09': 'Finishes', '10': 'Specialties', '11': 'Equipment', '12': 'Furnishings',
  '21': 'Fire Suppression', '22': 'Plumbing', '23': 'HVAC', '26': 'Electrical',
  '27': 'Communications', '28': 'Electronic Safety', '31': 'Earthwork',
  '32': 'Exterior Improvements', '33': 'Utilities',
};

const divisionOf = (r: EstimateSource): string => {
  const d = String(r.csi_division ?? '').trim();
  if (d) return d.slice(0, 2).padStart(2, '0');
  const c = String(r.csi_code ?? '').trim();
  return c ? c.slice(0, 2).padStart(2, '0') : '—';
};

export interface BuiltProposal {
  lines: ProposalLine[];
  /** Scope the estimate disclaims, as prose for the document. */
  exclusions: string[];
  /** Allowance lines called out for the client. */
  allowances: { description: string; amount: number }[];
  costTotal: number;
  sellTotal: number;
  optionalTotal: number;
  marginPct: number | null;
  /** Lines that contributed nothing and were left out, with the reason. */
  omitted: { description: string; reason: string }[];
}

/**
 * Build proposal lines from estimate rows.
 *
 * Zero-cost lines are omitted rather than printed at $0.00 — a client reading
 * "Demolition ... $0.00" reasonably concludes it is free, and the omission is
 * reported so nothing disappears silently.
 */
export function buildProposal(rows: EstimateSource[], opts: BuildOptions = {}): BuiltProposal {
  const granularity = opts.granularity ?? 'division';
  const mode = opts.upliftMode ?? 'markup';
  const pct = num(opts.upliftPct);
  const optionalDivs = new Set((opts.optionalDivisions ?? []).map((d) => d.slice(0, 2).padStart(2, '0')));

  const exclusions: string[] = [];
  const allowances: { description: string; amount: number }[] = [];
  const omitted: { description: string; reason: string }[] = [];

  const priced: EstimateSource[] = [];
  for (const r of rows) {
    const desc = String(r.description ?? '').trim() || 'Untitled item';
    if (r.is_excluded) { exclusions.push(desc); continue; }
    const cost = lineCost(r);
    if (cost <= 0) { omitted.push({ description: desc, reason: 'no cost on the estimate line' }); continue; }
    priced.push(r);
    if (r.is_allowance) allowances.push({ description: desc, amount: applyUplift(cost, pct, mode) });
  }

  const lines: ProposalLine[] = [];
  let costTotal = 0, sellTotal = 0, optionalTotal = 0;
  let sort = 0;

  const push = (l: Omit<ProposalLine, 'sort_order'>) => { lines.push({ ...l, sort_order: sort++ }); };

  if (granularity === 'line') {
    for (const r of priced) {
      const cost = lineCost(r);
      const sell = applyUplift(cost, pct, mode);
      const optional = optionalDivs.has(divisionOf(r));
      const qty = num(r.quantity) || null;
      push({
        description: String(r.description ?? '').trim() || 'Untitled item',
        quantity: qty,
        unit: r.unit ? String(r.unit) : null,
        /* Unit price is the SELL rate, not cost — a proposal that prints cost
           per unit beside a marked-up total invites the obvious question. */
        unit_price: qty ? round2(sell / qty) : null,
        total_price: sell,
        is_optional: optional,
        notes: r.is_allowance ? 'Allowance' : (r.notes ? String(r.notes) : null),
      });
      costTotal += cost;
      if (optional) optionalTotal += sell; else sellTotal += sell;
    }
  } else {
    const byDiv = new Map<string, EstimateSource[]>();
    for (const r of priced) {
      const d = divisionOf(r);
      const a = byDiv.get(d) ?? []; a.push(r); byDiv.set(d, a);
    }
    for (const d of [...byDiv.keys()].sort()) {
      const rs = byDiv.get(d)!;
      const cost = round2(rs.reduce((s, r) => s + lineCost(r), 0));
      const sell = applyUplift(cost, pct, mode);
      const optional = optionalDivs.has(d);
      const anyAllowance = rs.some((r) => r.is_allowance);
      push({
        description: CSI_NAMES[d] ? `${d} — ${CSI_NAMES[d]}` : `Division ${d}`,
        quantity: null,
        unit: null,
        unit_price: null,
        total_price: sell,
        is_optional: optional,
        /* The client sees a division price; the count tells them it is a
           summary of real scope rather than a round number someone invented. */
        notes: `${rs.length} item${rs.length === 1 ? '' : 's'}${anyAllowance ? ' · includes allowance' : ''}`,
      });
      costTotal += cost;
      if (optional) optionalTotal += sell; else sellTotal += sell;
    }
  }

  return {
    lines,
    exclusions,
    allowances,
    costTotal: round2(costTotal),
    sellTotal: round2(sellTotal),
    optionalTotal: round2(optionalTotal),
    marginPct: realisedMarginPct(costTotal, sellTotal),
    omitted,
  };
}

/* ── reconciliation ────────────────────────────────────────────────────────
 *
 * A proposal's header amount and its line breakdown are entered independently,
 * and on live data they disagreed by $398,200 on one and $51,600 on another —
 * invisible for as long as nothing read the lines.
 *
 * The gap is almost never an error in either number. An estimator itemises
 * direct costs and then prices the job; the difference is the general
 * conditions, overhead and profit that were never written down. So the fix is
 * not to overwrite one figure with the other — it is to make the missing money
 * explicit, and only the person who priced the job can say which it is.
 */

export interface Reconciliation {
  /** Sum of the non-optional lines — what the client is being asked to buy. */
  baseTotal: number;
  optionalTotal: number;
  headerAmount: number;
  /** header − base. Positive: money the lines do not account for. */
  difference: number;
  reconciles: boolean;
  /** What can be done about it, given the sign of the difference. */
  remedy: 'none' | 'add-line' | 'sync-header';
}

export function reconcile(
  headerAmount: unknown,
  lines: { total_price?: unknown; is_optional?: unknown }[],
): Reconciliation {
  const base = round2(lines.filter((l) => !l.is_optional).reduce((s, l) => s + num(l.total_price), 0));
  const optional = round2(lines.filter((l) => l.is_optional).reduce((s, l) => s + num(l.total_price), 0));
  const header = round2(num(headerAmount));
  const difference = round2(header - base);
  /* A hundredth of a dollar is rounding, not a discrepancy. */
  const reconciles = lines.length === 0 || Math.abs(difference) < 0.01;

  return {
    baseTotal: base,
    optionalTotal: optional,
    headerAmount: header,
    difference,
    reconciles,
    /* Only a POSITIVE gap can be written as a line. When the lines already
       total more than the proposal states, adding another line makes it worse —
       the header is the figure that has to move. */
    remedy: reconciles ? 'none' : difference > 0 ? 'add-line' : 'sync-header',
  };
}

/** Default wording for the line that closes a positive gap. */
export const UNALLOCATED_LINE_LABEL = 'General Conditions, Overhead & Profit';

/** Exclusions as the paragraph the proposals table stores. */
export function exclusionsText(exclusions: string[]): string {
  if (exclusions.length === 0) return '';
  return `This proposal excludes the following scope:\n${exclusions.map((e) => `• ${e}`).join('\n')}`;
}
