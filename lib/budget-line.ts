/**
 * budget-line — one shape for a budget line, whatever the database calls it.
 *
 * public.budget_lines stores approved_changes / committed / actual / projected /
 * percent_complete. The project Budget screen was written against
 * approved_cos / committed_cost / actual_cost / forecast_cost / pct_complete,
 * names that do not exist on the table. Every one of those read back
 * undefined: the screen showed $0 for change orders, committed, actual and
 * forecast on every job, and editing or adjusting a line crashed the page
 * ("toCents: invalid amount undefined").
 *
 * Every read of a budget line for the screen goes through toBudgetLineView,
 * which keeps the database names and adds the screen names, always as real
 * numbers. Every write goes through budgetLineWrite, which maps the screen
 * names back to the real columns so a value is never silently dropped.
 */

export interface BudgetLineView {
  id: string;
  cost_code: string;
  description: string;
  division: string | null;
  category: string;
  original_budget: number;
  approved_cos: number;
  revised_budget: number;
  committed_cost: number;
  actual_cost: number;
  forecast_cost: number;
  pct_complete: number;
  notes: string | null;
  [key: string]: unknown;
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** A database row → the line the screen reads (database names kept too). */
export function toBudgetLineView(row: Record<string, unknown>): BudgetLineView {
  const original = num(row.original_budget);
  const approved = num(row.approved_changes ?? row.approved_cos);
  // Revised budget IS original + approved changes. The stored column is not
  // kept in step by every writer (11 of 72 live rows disagreed), so it is
  // derived here rather than trusted.
  const revised = original + approved;
  const actual = num(row.actual ?? row.actual_cost);
  const committed = num(row.committed ?? row.committed_cost);
  const projectedRaw = num(row.projected ?? row.forecast_cost);
  // Forecast (estimate at completion) is never below what is already spent or
  // committed; an unset forecast falls back to the revised budget.
  const forecast = projectedRaw > 0 ? projectedRaw : Math.max(revised, actual, committed);
  return {
    ...row,
    id: String(row.id ?? ''),
    cost_code: String(row.cost_code ?? ''),
    description: String(row.description ?? ''),
    division: (row.division as string | null) ?? null,
    category: String(row.category ?? 'labor'),
    original_budget: original,
    approved_cos: approved,
    revised_budget: revised,
    committed_cost: committed,
    actual_cost: actual,
    forecast_cost: forecast,
    pct_complete: num(row.percent_complete ?? row.pct_complete),
    notes: (row.notes as string | null) ?? null,
  };
}

const normKey = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const divisionOf = (v: unknown): string | null => {
  const m = String(v ?? '').trim().match(/^(\d{2})(?:\D|$)/);
  return m ? m[1] : null;
};

/**
 * Which budget line a piece of paper (commitment, purchase order, bill)
 * belongs to. Paper carries a full cost code ("26 05 00"), a bare CSI
 * division ("26"), or — on the draft PO a bid award writes — the trade name
 * ("Electrical"). Matched in that order: the exact cost code, then the line's
 * description, then the first line in the same CSI division. Null when
 * nothing fits; the caller leaves that amount off every line rather than
 * guessing. Pure.
 */
export function budgetLineFinder(
  lines: Array<{ id: string; cost_code?: unknown; description?: unknown; division?: unknown }>,
): (key: unknown) => string | null {
  const byCode = new Map<string, string>();
  const byDesc = new Map<string, string>();
  const byDiv = new Map<string, string>();
  const sorted = [...lines].sort((a, b) => normKey(a.cost_code).localeCompare(normKey(b.cost_code)));
  for (const l of sorted) {
    const code = normKey(l.cost_code);
    const desc = normKey(l.description);
    const div = divisionOf(l.division) || divisionOf(l.cost_code);
    if (code && !byCode.has(code)) byCode.set(code, l.id);
    if (desc && !byDesc.has(desc)) byDesc.set(desc, l.id);
    if (div && !byDiv.has(div)) byDiv.set(div, l.id);
  }
  return (key: unknown) => {
    const k = normKey(key);
    if (!k) return null;
    const div = divisionOf(k);
    return byCode.get(k) ?? byDesc.get(k) ?? (div ? byDiv.get(div) ?? null : null);
  };
}

/** Screen field names a caller may send → the real budget_lines columns. */
const WRITE_ALIASES: Record<string, string> = {
  approved_cos: 'approved_changes',
  committed_cost: 'committed',
  actual_cost: 'actual',
  forecast_cost: 'projected',
  pct_complete: 'percent_complete',
};

/** Map any screen-named fields in a write body to the real column names. */
export function budgetLineWrite(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  for (const [ui, col] of Object.entries(WRITE_ALIASES)) {
    if (out[ui] !== undefined && out[col] === undefined) out[col] = out[ui];
    delete out[ui];
  }
  return out;
}
