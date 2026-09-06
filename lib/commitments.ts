/**
 * lib/commitments.ts
 *
 * Rolls purchase orders, bills and invoices up onto budget_lines — the
 * committed/actual/projected chain that makes a cost report maintain itself.
 *
 * WHY THIS REPLACES WHAT WAS THERE
 *
 * purchase-orders/create did `committed = committed + total`, and bills/create
 * did the same to `actual`. Only the create routes ever touched the budget:
 * update, delete and status changes did not. So issuing a $50k PO added $50k,
 * deleting it left the $50k, editing it down to $30k left the $50k, and
 * cancelling it left the $50k. Committed cost only ever drifted upward and could
 * never be corrected except by hand — and a forecast built on that number is
 * confidently wrong, which is worse than having no forecast.
 *
 * This recomputes from source instead: sum every live document for a cost code
 * and SET the figure. That is idempotent, self-healing, order-independent, and
 * correct no matter how the underlying row changed — including rows edited
 * directly in the database, which no incremental scheme can ever catch up with.
 *
 * Status vocabulary is deliberately imported from the same sets the existing
 * /api/cost-control report uses. Two places disagreeing about whether a
 * cancelled PO is committed is how a platform ends up with two different
 * "true" numbers on two screens.
 */

/** A PO is a commitment unless it was killed. Mirrors /api/cost-control. */
export const DEAD_PO = new Set(['cancelled', 'canceled', 'void', 'voided', 'rejected', 'declined']);
/** Invoices that represent real incurred cost. Mirrors /api/cost-control. */
export const ACTUAL_INV = new Set(['approved', 'paid', 'partial', 'partially_paid', 'partially paid']);
/** Bills that represent real incurred cost. A draft or voided bill is not spend. */
export const ACTUAL_BILL = new Set(['approved', 'paid', 'unpaid', 'partial', 'partially_paid', 'partially paid', 'overdue']);
/** Bills that are explicitly not cost. */
export const DEAD_BILL = new Set(['void', 'voided', 'cancelled', 'canceled', 'rejected', 'draft']);

export interface BudgetLine {
  id: string;
  cost_code?: string | null;
  division?: string | null;
  description?: string | null;
  original_budget?: unknown;
  approved_changes?: unknown;
  revised_budget?: unknown;
  committed?: unknown;
  actual?: unknown;
  projected?: unknown;
  /**
   * Cost carried in from before this line joined the document ledger.
   *
   * NULL means the line has never been through a rollup. On its first pass the
   * balance no document explains is captured here instead of being zeroed —
   * which is what stops adopting the ledger from destroying figures a GC
   * entered by hand years ago. Once set (commonly to 0) it is never recomputed,
   * so deleting a purchase order releases only the part the ledger contributed.
   */
  carried_actual?: unknown;
  carried_committed?: unknown;
}

export interface SourceDoc {
  id?: string | null;
  cost_code?: string | null;
  status?: string | null;
  /** Preferred amount field, then fallbacks — schemas differ per table. */
  total?: unknown;
  subtotal?: unknown;
  amount?: unknown;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Trimmed cost code, or '' when absent — never the string "null". */
export const codeOf = (c: unknown): string => (typeof c === 'string' ? c.trim() : '');

/** Leading division of a cost code: "03-300" → "03". */
export const divisionOf = (c: unknown): string => codeOf(c).slice(0, 2);

const amountOf = (d: SourceDoc): number => {
  const t = num(d.total);
  if (t) return t;
  const s = num(d.subtotal);
  if (s) return s;
  return num(d.amount);
};

export const poCounts = (d: SourceDoc): boolean => !DEAD_PO.has(String(d.status ?? '').toLowerCase());
export const billCounts = (d: SourceDoc): boolean => {
  const s = String(d.status ?? '').toLowerCase();
  if (DEAD_BILL.has(s)) return false;
  /* An unknown status counts. A bill that exists is money owed until somebody
     says otherwise, and silently dropping it understates cost — the direction
     of error that loses money rather than merely annoying someone. */
  return s === '' || ACTUAL_BILL.has(s) || !DEAD_BILL.has(s);
};
export const invoiceCounts = (d: SourceDoc): boolean =>
  ACTUAL_INV.has(String(d.status ?? '').toLowerCase());

export interface LineUpdate {
  id: string;
  costCode: string;
  description: string;
  budget: number;
  committed: number;
  actual: number;
  projected: number;
  /** The part the document ledger accounts for. */
  derivedCommitted: number;
  derivedActual: number;
  /** The part carried in from before the ledger — preserved, never recomputed. */
  carriedCommitted: number;
  carriedActual: number;
  /** True on the pass that first captures the carried balance for this line. */
  adopting: boolean;
  /** Budget minus projected: negative is an overrun on this line. */
  variance: number;
  /** What the row holds now, so a caller can show the diff before writing. */
  wasCommitted: number;
  wasActual: number;
  wasProjected: number;
  changed: boolean;
}

export interface RollupResult {
  updates: LineUpdate[];
  /** Documents whose cost code matched no budget line — real money, no home. */
  unmatched: { costCode: string; committed: number; actual: number; docs: number }[];
  totals: { committed: number; actual: number; projected: number; budget: number };
  /** True when the project has no purchase orders, bills or invoices at all.
   *  Informational only now — carrying makes the rollup safe either way. */
  noSourceDocuments: boolean;
}

/**
 * Match a document's cost code to a budget line.
 *
 * Exact code wins. Failing that, the division prefix — a bill coded 03-350
 * against a budget carrying only 03-300 still belongs to concrete. The
 * candidate list is sorted so the same document always lands on the same line;
 * the previous `.or(...).limit(1)` returned whichever row the planner happened
 * to produce first, which meant the same PO could hit different lines on
 * different runs.
 */
export function matchLine(code: string, lines: BudgetLine[]): BudgetLine | null {
  if (!code) return null;
  const sorted = [...lines].sort((a, b) => codeOf(a.cost_code).localeCompare(codeOf(b.cost_code)));
  const exact = sorted.find((l) => codeOf(l.cost_code) === code);
  if (exact) return exact;
  const div = divisionOf(code);
  if (!div) return null;
  return sorted.find((l) => codeOf(l.cost_code).startsWith(div) || codeOf(l.division) === div) ?? null;
}

/**
 * Recompute committed / actual / projected for every budget line on a project.
 *
 * Projected is the largest of what was budgeted, what has been committed, and
 * what has already been spent. It is deliberately not a clever forecast: on a
 * cost report the number a GC needs is "this line will not come in under X",
 * and anything more speculative belongs in the earned-value forecast where it
 * is labelled as a projection rather than sitting in a ledger column.
 */
export function rollup(
  lines: BudgetLine[],
  pos: SourceDoc[],
  bills: SourceDoc[],
  invoices: SourceDoc[] = [],
): RollupResult {
  const committedBy = new Map<string, number>();
  const actualBy = new Map<string, number>();
  const orphan = new Map<string, { committed: number; actual: number; docs: number }>();

  const add = (map: Map<string, number>, id: string, v: number) =>
    map.set(id, (map.get(id) ?? 0) + v);

  const stray = (code: string, kind: 'committed' | 'actual', v: number) => {
    const cur = orphan.get(code) ?? { committed: 0, actual: 0, docs: 0 };
    cur[kind] += v;
    cur.docs += 1;
    orphan.set(code, cur);
  };

  for (const p of pos) {
    if (!poCounts(p)) continue;
    const v = amountOf(p);
    if (!v) continue;
    const code = codeOf(p.cost_code);
    const line = matchLine(code, lines);
    if (line) add(committedBy, line.id, v);
    else stray(code || 'Unassigned', 'committed', v);
  }

  for (const b of bills) {
    if (!billCounts(b)) continue;
    const v = amountOf(b);
    if (!v) continue;
    const code = codeOf(b.cost_code);
    const line = matchLine(code, lines);
    if (line) add(actualBy, line.id, v);
    else stray(code || 'Unassigned', 'actual', v);
  }

  for (const i of invoices) {
    if (!invoiceCounts(i)) continue;
    const v = amountOf(i);
    if (!v) continue;
    const code = codeOf(i.cost_code);
    const line = matchLine(code, lines);
    if (line) add(actualBy, line.id, v);
    else stray(code || 'Unassigned', 'actual', v);
  }

  const updates: LineUpdate[] = lines.map((l) => {
    const budget = num(l.revised_budget) || num(l.original_budget) + num(l.approved_changes);
    const derivedCommitted = round2(committedBy.get(l.id) ?? 0);
    const derivedActual = round2(actualBy.get(l.id) ?? 0);
    const wasCommitted = round2(num(l.committed));
    const wasActual = round2(num(l.actual));
    const wasProjected = round2(num(l.projected));

    /* Adoption. A line that has never been rolled up carries whatever balance
       its documents cannot explain — money entered by hand, or imported from
       whatever the GC used before. Capturing it once, here, is what makes
       adopting the ledger non-destructive; zeroing it would be arithmetically
       correct and would delete real history. Afterwards the value is fixed, so
       deleting a purchase order releases only the ledger's own contribution. */
    const adopting = l.carried_actual == null || l.carried_committed == null;
    const carriedActual = l.carried_actual == null
      ? round2(Math.max(0, wasActual - derivedActual))
      : round2(num(l.carried_actual));
    const carriedCommitted = l.carried_committed == null
      ? round2(Math.max(0, wasCommitted - derivedCommitted))
      : round2(num(l.carried_committed));

    const committed = round2(carriedCommitted + derivedCommitted);
    const actual = round2(carriedActual + derivedActual);
    const projected = round2(Math.max(budget, committed, actual));

    return {
      id: l.id,
      costCode: codeOf(l.cost_code) || '—',
      description: String(l.description ?? ''),
      budget: round2(budget),
      committed, actual, projected,
      derivedCommitted, derivedActual,
      carriedCommitted, carriedActual,
      adopting,
      variance: round2(budget - projected),
      wasCommitted, wasActual, wasProjected,
      changed:
        committed !== wasCommitted || actual !== wasActual || projected !== wasProjected || adopting,
    };
  });

  return {
    updates,
    noSourceDocuments: pos.length === 0 && bills.length === 0 && invoices.length === 0,
    unmatched: [...orphan.entries()]
      .map(([costCode, v]) => ({ costCode, committed: round2(v.committed), actual: round2(v.actual), docs: v.docs }))
      .sort((a, b) => (b.committed + b.actual) - (a.committed + a.actual)),
    totals: {
      committed: round2(updates.reduce((s, u) => s + u.committed, 0)),
      actual: round2(updates.reduce((s, u) => s + u.actual, 0)),
      projected: round2(updates.reduce((s, u) => s + u.projected, 0)),
      budget: round2(lines.reduce((s, l) => s + (num(l.revised_budget) || num(l.original_budget) + num(l.approved_changes)), 0)),
    },
  };
}
