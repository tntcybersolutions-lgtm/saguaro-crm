/**
 * Reading lines back out of a saved cost report (cost_reports.lines).
 *
 * The Cost Control screen is rebuilt live from budget_lines, purchase_orders and
 * invoices on every load. Two things from the last saved report ride on top:
 *
 *   overrides    a committed / actual figure typed over the auto value
 *   manual lines a cost code ADDED by hand with "Add Cost Code" — it has no
 *                budget line, PO or invoice behind it, so the live rebuild never
 *                produces it. Without carrying it forward, a saved report with a
 *                new code in it reloaded without that code.
 *
 * A line is keyed by its cost code, or — for a hand-added line saved before the
 * page started writing one — by the text typed in its description box.
 */

export interface SavedCostLine {
  costCode?: unknown;
  description?: unknown;
  originalBudgetCents?: unknown;
  approvedChangesCents?: unknown;
  committedCents?: unknown;
  actualCents?: unknown;
  committedOverrideCents?: unknown;
  actualOverrideCents?: unknown;
  /** Set by the page on lines added by hand. Older reports lack it — see isManual(). */
  manual?: unknown;
}

export interface ManualCostLine {
  code: string;
  description: string;
  origCents: number;
  changeCents: number;
  committedCents: number;
  actualCents: number;
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
/** Integer cents from whatever JSON held; junk → 0. */
export const intCents = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/** The key a saved line answers to. Live rows always carry a cost code ('Unassigned' at worst). */
export function savedLineCode(l: SavedCostLine | null | undefined): string {
  return text(l?.costCode) || text(l?.description) || 'Unassigned';
}

/** Per-code committed/actual overrides typed on the saved report. */
export function savedOverrides(lines: unknown): Record<string, { committedCents?: number; actualCents?: number }> {
  const out: Record<string, { committedCents?: number; actualCents?: number }> = {};
  if (!Array.isArray(lines)) return out;
  for (const l of lines as SavedCostLine[]) {
    const o: { committedCents?: number; actualCents?: number } = {};
    if (typeof l?.committedOverrideCents === 'number') o.committedCents = l.committedOverrideCents;
    if (typeof l?.actualOverrideCents === 'number') o.actualCents = l.actualOverrideCents;
    if (o.committedCents !== undefined || o.actualCents !== undefined) out[savedLineCode(l)] = o;
  }
  return out;
}

/**
 * Was this saved line added by hand? New saves say so (`manual: true`). Older
 * reports do not, but there the tell is exact: every live row carries a cost
 * code, and a hand-added row was saved with an empty one. A live row whose
 * budget line / PO later went away is NOT resurrected by this.
 */
export function isManual(l: SavedCostLine): boolean {
  return l.manual === true || !text(l.costCode);
}

/**
 * Hand-added lines on a saved report whose code the live rebuild did not
 * produce, as they were on the report. First occurrence of a code wins; a
 * blank row nobody typed into is skipped.
 */
export function manualLinesFromReport(lines: unknown, liveCodes: ReadonlySet<string>): ManualCostLine[] {
  const out: ManualCostLine[] = [];
  if (!Array.isArray(lines)) return out;
  const seen = new Set<string>();
  for (const l of lines as SavedCostLine[]) {
    if (!l || typeof l !== 'object' || !isManual(l)) continue;
    if (!text(l.costCode) && !text(l.description)) continue;
    const code = savedLineCode(l);
    if (liveCodes.has(code) || seen.has(code)) continue;
    seen.add(code);
    out.push({
      code,
      description: text(l.description) || code,
      origCents: intCents(l.originalBudgetCents),
      changeCents: intCents(l.approvedChangesCents),
      committedCents: intCents(l.committedCents),
      actualCents: intCents(l.actualCents),
    });
  }
  return out;
}
