/**
 * lib/selections.ts
 *
 * Client selections and allowances — the arithmetic, as pure functions.
 *
 * A selection is a promise with a number attached: the contract carries an
 * allowance for "bath fixtures", the client picks something, and the difference
 * is a change order waiting to be written. Buildern organises the choices with
 * spec sheets and photos, which is the easy half. The half that decides whether
 * anyone trusts the screen is the money, and on live data that half was broken:
 * every row carried variance 0 while the numbers plainly disagreed — bath
 * fixtures sat $2,500 over a $22,000 allowance and the system said nothing.
 *
 * Variance is therefore derived here and never read from the column. A stored
 * number nobody recomputes is a number that is wrong the first time anything
 * changes.
 */

export type SelectionStatus = 'pending' | 'selected' | 'approved' | 'ordered' | 'installed' | 'cancelled';

export interface SelectionRow {
  id?: string;
  category?: string | null;
  item_name?: string | null;
  allowance?: unknown;
  selected_amount?: unknown;
  /** The stored column. Read only to detect drift — never trusted as the answer. */
  variance?: unknown;
  status?: string | null;
  owner_approved?: unknown;
  due_date?: string | null;
  lead_time?: unknown;
  vendor?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  color?: string | null;
  finish?: string | null;
  link?: string | null;
  photo_url?: string | null;
  selected_at?: string | null;
  notes?: string | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** True when a real amount has been chosen — 0 is a choice, null is not. */
export const hasSelection = (r: SelectionRow): boolean =>
  r.selected_amount !== null && r.selected_amount !== undefined && r.selected_amount !== '' &&
  Number.isFinite(Number(r.selected_amount));

/**
 * Allowance minus what was picked.
 *
 * Positive is money returned to the owner, negative is an overage somebody has
 * to approve. Null when nothing is picked yet — a pending selection has no
 * variance, and reporting 0 for it makes an untouched allowance look settled,
 * which is exactly the lie the live data was telling.
 */
export function variance(r: SelectionRow): number | null {
  if (!hasSelection(r)) return null;
  return round2(num(r.allowance) - num(r.selected_amount));
}

export const isOver = (r: SelectionRow): boolean => {
  const v = variance(r);
  return v != null && v < 0;
};

/**
 * The status a row has actually reached, from its own fields.
 *
 * Stored status drifts — a row can say "pending" long after an amount was
 * entered. Approval and an explicit later stage are respected; otherwise
 * whether an amount exists decides between pending and selected.
 */
export function effectiveStatus(r: SelectionRow): SelectionStatus {
  const s = String(r.status ?? '').toLowerCase().trim();
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'installed') return 'installed';
  if (s === 'ordered') return 'ordered';
  if (r.owner_approved === true) return 'approved';
  if (s === 'approved') return 'approved';
  return hasSelection(r) ? 'selected' : 'pending';
}

/**
 * Lead time as a number of days.
 *
 * `selections.lead_time` is a TEXT column, so it holds what people type: "21",
 * "3 weeks", "6-8 wks", "2 months". Running Number() over that yields NaN for
 * everything except the bare integer, and a NaN quietly treated as 0 means the
 * lead-time check never fires for any real user — the one failure this log
 * exists to catch.
 *
 * A range takes the LONGER end. "6-8 weeks" that lands at 8 is late, and the
 * optimistic read is the one that misses the job.
 */
export function parseLeadDays(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  const s = String(v).toLowerCase().trim();
  const nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums) return null;
  const n = Math.max(...nums.map(Number));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (/week|wks?\b|\bwk\b/.test(s)) return Math.round(n * 7);
  if (/month|mos?\b/.test(s)) return Math.round(n * 30);
  return Math.round(n);
}

/** Days until the decision is due; negative is overdue. Null without a date. */
export function daysUntilDue(r: SelectionRow, now = Date.now()): number | null {
  if (!r.due_date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(r.due_date).trim());
  const t = m ? Date.UTC(+m[1], +m[2] - 1, +m[3], 12) : Date.parse(String(r.due_date));
  if (!Number.isFinite(t)) return null;
  return Math.round((t - now) / 86400000);
}

/**
 * A selection is late when the decision is overdue and nothing has been picked.
 *
 * An overdue row that HAS a pick is not late — the decision was made; only the
 * paperwork is behind, and flagging it buries the ones that actually block
 * procurement.
 */
export function isLate(r: SelectionRow, now = Date.now()): boolean {
  const d = daysUntilDue(r, now);
  return d != null && d < 0 && !hasSelection(r) && effectiveStatus(r) !== 'cancelled';
}

/**
 * A pick can be on time and still miss the job, if its lead time runs past the
 * date it is needed. That is the failure a selections log exists to prevent and
 * the one a plain due-date check never sees.
 */
export function missesLeadTime(r: SelectionRow, now = Date.now()): boolean {
  const lead = parseLeadDays(r.lead_time);
  if (lead == null) return false;
  const d = daysUntilDue(r, now);
  if (d == null) return false;
  return lead > d;
}

/**
 * A selection row shaped for the UI.
 *
 * The write path already maps the page's names onto the real columns
 * (item → item_name, cost → selected_amount) but the read path never mapped
 * back, so a selection saved correctly came back as a blank row with no price:
 * the card title read `item.item` and the amount read `item.cost`, and neither
 * exists on a `selections` row. Both spellings are emitted here so the screen,
 * the client portal, and anything else reading this endpoint all see the same
 * record whichever name they were written against.
 *
 * The derived fields ride along for the same reason variance is computed rather
 * than read: a number the server works out once is a number every caller agrees
 * on.
 */
export interface NormalisedSelection extends SelectionRow {
  /** Legacy UI alias for item_name. */
  item: string;
  /** Legacy UI alias for selected_amount. */
  cost: number | null;
  variance: number | null;
  effective_status: SelectionStatus;
  is_over: boolean;
  is_late: boolean;
  lead_days: number | null;
  misses_lead_time: boolean;
  days_until_due: number | null;
}

export function normaliseSelection(r: SelectionRow, now = Date.now()): NormalisedSelection {
  return {
    ...r,
    item: String(r.item_name ?? '').trim(),
    cost: hasSelection(r) ? num(r.selected_amount) : null,
    variance: variance(r),
    effective_status: effectiveStatus(r),
    is_over: isOver(r),
    is_late: isLate(r, now),
    lead_days: parseLeadDays(r.lead_time),
    misses_lead_time: missesLeadTime(r, now),
    days_until_due: daysUntilDue(r, now),
  };
}

/* ── options: the choices a client is actually shown ───────────────────────
 *
 * A selection with options is the Buildern shape — three tiles of tile, each
 * with a photo, a spec sheet and a price. What makes it useful rather than
 * decorative is pricing each option against the allowance at the moment of
 * choosing, so the client reads "included" or "adds $2,500" instead of a bare
 * number they have to reconcile themselves.
 */

export interface SelectionOption {
  id?: string;
  selection_id?: string | null;
  name?: string | null;
  description?: string | null;
  manufacturer?: string | null;
  model_number?: string | null;
  color?: string | null;
  finish?: string | null;
  unit_cost?: unknown;
  quantity?: unknown;
  total_cost?: unknown;
  image_url?: string | null;
  spec_url?: string | null;
  is_recommended?: unknown;
  sort_order?: unknown;
}

/**
 * What an option costs.
 *
 * `total_cost` is a plain column, not a generated one, so it can disagree with
 * unit_cost × quantity. When both are present the multiplication wins: a stored
 * total that nobody recomputes is the same failure as the variance column that
 * read 0 on every row.
 */
export function optionCost(o: SelectionOption): number {
  const unit = Number(o.unit_cost);
  const qty = Number(o.quantity);
  if (Number.isFinite(unit) && unit !== 0) {
    return round2(unit * (Number.isFinite(qty) && qty > 0 ? qty : 1));
  }
  const total = Number(o.total_cost);
  return Number.isFinite(total) ? round2(total) : 0;
}

export interface PricedOption extends SelectionOption {
  cost: number;
  /** Allowance minus this option. Negative is an upcharge the client pays. */
  varianceIfChosen: number | null;
  /** Plain-language price effect, which is what a client actually reads. */
  effect: string;
  isChosen: boolean;
}

/**
 * Price every option against the parent selection's allowance.
 *
 * The recommended option is surfaced first and the rest follow the builder's
 * sort order, because the order options appear in is itself a recommendation.
 */
export function priceOptions(row: SelectionRow, options: SelectionOption[]): PricedOption[] {
  const allowance = num(row.allowance);
  const chosen = hasSelection(row) ? num(row.selected_amount) : null;

  return [...options]
    .sort((a, b) => {
      if (!!a.is_recommended !== !!b.is_recommended) return a.is_recommended ? -1 : 1;
      return num(a.sort_order) - num(b.sort_order);
    })
    .map((o) => {
      const cost = optionCost(o);
      const v = allowance > 0 ? round2(allowance - cost) : null;
      return {
        ...o,
        cost,
        varianceIfChosen: v,
        effect: v == null
          ? money(cost)
          : v < 0 ? `adds ${money(v)}`
          : v > 0 ? `${money(v)} under your allowance`
          : 'exactly your allowance',
        /* Matched on price, not on name: the pick is stored as an amount on the
           selections row, and an option renamed after the fact should still
           show as the one that was chosen. */
        isChosen: chosen != null && Math.abs(chosen - cost) < 0.005,
      };
    });
}

export interface SelectionTotals {
  items: number;
  pending: number;
  selected: number;
  approved: number;
  late: number;
  leadTimeRisk: number;
  allowanceTotal: number;
  /** Allowance for rows still undecided — money not yet committed either way. */
  allowanceOutstanding: number;
  selectedTotal: number;
  /** Net of decided rows only. Negative is a projected overage. */
  varianceTotal: number;
  overCount: number;
  overTotal: number;
  underTotal: number;
}

/**
 * Portfolio maths over a set of selections.
 *
 * varianceTotal counts only decided rows. Folding undecided allowances into it
 * would report a project as massively under budget purely because nobody has
 * chosen a tile yet.
 */
export function selectionTotals(rows: SelectionRow[], now = Date.now()): SelectionTotals {
  let allowanceTotal = 0, allowanceOutstanding = 0, selectedTotal = 0;
  let overTotal = 0, underTotal = 0, overCount = 0;
  let pending = 0, selected = 0, approved = 0, late = 0, leadTimeRisk = 0;

  for (const r of rows) {
    const st = effectiveStatus(r);
    if (st === 'cancelled') continue;

    allowanceTotal += num(r.allowance);
    if (st === 'pending') { pending++; allowanceOutstanding += num(r.allowance); }
    if (st === 'selected') selected++;
    if (st === 'approved' || st === 'ordered' || st === 'installed') approved++;
    if (isLate(r, now)) late++;
    if (missesLeadTime(r, now)) leadTimeRisk++;

    if (hasSelection(r)) {
      selectedTotal += num(r.selected_amount);
      const v = variance(r);
      if (v != null) {
        if (v < 0) { overTotal += -v; overCount++; }
        else underTotal += v;
      }
    }
  }

  return {
    items: rows.length,
    pending, selected, approved, late, leadTimeRisk,
    allowanceTotal: round2(allowanceTotal),
    allowanceOutstanding: round2(allowanceOutstanding),
    selectedTotal: round2(selectedTotal),
    varianceTotal: round2(underTotal - overTotal),
    overCount,
    overTotal: round2(overTotal),
    underTotal: round2(underTotal),
  };
}

export interface CategoryGroup {
  category: string;
  items: number;
  allowanceTotal: number;
  selectedTotal: number;
  varianceTotal: number;
  pending: number;
  overCount: number;
}

/** Group by category, which is how an owner reads a selections log. */
export function groupByCategory(rows: SelectionRow[]): CategoryGroup[] {
  const m = new Map<string, SelectionRow[]>();
  for (const r of rows) {
    const c = String(r.category ?? '').trim() || 'Uncategorised';
    const a = m.get(c) ?? []; a.push(r); m.set(c, a);
  }
  return [...m.entries()]
    .map(([category, rs]) => {
      const t = selectionTotals(rs);
      return {
        category,
        items: rs.length,
        allowanceTotal: t.allowanceTotal,
        selectedTotal: t.selectedTotal,
        varianceTotal: t.varianceTotal,
        pending: t.pending,
        overCount: t.overCount,
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category));
}

/**
 * One sentence per row that a PM can act on, most urgent first.
 *
 * Deliberately not a severity score: "3 selections need attention" makes nobody
 * do anything, where "Bath Fixtures is $2,500 over its allowance" is a decision
 * with a number attached.
 */
export interface SelectionFlag {
  id?: string;
  item: string;
  category: string;
  severity: 'critical' | 'watch';
  message: string;
}

const money = (n: number) => '$' + Math.abs(Math.round(n)).toLocaleString('en-US');

export function selectionFlags(rows: SelectionRow[], now = Date.now()): SelectionFlag[] {
  const out: SelectionFlag[] = [];

  for (const r of rows) {
    const item = String(r.item_name ?? 'Untitled');
    const category = String(r.category ?? 'Uncategorised');
    if (effectiveStatus(r) === 'cancelled') continue;

    const v = variance(r);
    if (v != null && v < 0) {
      const pct = num(r.allowance) > 0 ? (-v / num(r.allowance)) * 100 : 0;
      out.push({
        id: r.id, item, category,
        severity: pct >= 10 ? 'critical' : 'watch',
        message: `${money(v)} over its ${money(num(r.allowance))} allowance${pct ? ` (${pct.toFixed(0)}%)` : ''} — needs a change order or a cheaper pick.`,
      });
    }

    if (isLate(r, now)) {
      const d = daysUntilDue(r, now)!;
      out.push({
        id: r.id, item, category, severity: 'critical',
        message: `Decision was due ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ago and nothing is picked.`,
      });
    }

    if (missesLeadTime(r, now)) {
      const d = daysUntilDue(r, now)!;
      out.push({
        id: r.id, item, category, severity: 'critical',
        message: `${parseLeadDays(r.lead_time)}-day lead time against ${d} day${d === 1 ? '' : 's'} left — ordering now still lands late.`,
      });
    }

    if (effectiveStatus(r) === 'selected' && !r.owner_approved && hasSelection(r)) {
      out.push({
        id: r.id, item, category, severity: 'watch',
        message: `Picked at ${money(num(r.selected_amount))} but not owner-approved.`,
      });
    }
  }

  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));
}
