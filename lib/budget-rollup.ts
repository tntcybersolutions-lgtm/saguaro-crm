/**
 * budget-rollup — the one roll-up of a job's cost budget.
 *
 * Every screen that shows budget money (Budget, Purchase Orders, Bills, the
 * create flows that read /api/project-context) reads it from here, so the
 * numbers agree screen to screen:
 *
 *   revised budget  = original + approved changes (Procore's "Revised Budget")
 *   committed       = live commitments + issued POs on the line, else what was
 *                     entered on the line
 *   direct costs    = live bills on the line
 *   uncommitted     = revised − committed          (Purchase Orders)
 *   remaining       = revised − actual             (Bills)
 *   cost to complete= revised − actual − committed not yet spent  (Budget)
 *
 * Remaining and Uncommitted were measured against the ORIGINAL budget on the
 * PO and Bills screens: a job with $127,650 of approved changes read
 * −$127,650 uncommitted while its Budget screen showed −$2,150 to complete.
 */
import { toBudgetLineView, budgetLineFinder, type BudgetLineView } from '@/lib/budget-line';
import { awardPackageOf } from '@/lib/commitments';

type Row = Record<string, unknown>;

export interface BudgetRollupInputs {
  /** budget_lines rows for the job. */
  lines: Row[];
  /** commitments rows (budget_line_id, budget_line_item_id, csi_division, original_amount, approved_changes, current_amount, status, bid_package_id). */
  commitments: Row[];
  /** budget_line_items rows (id, cost_code, csi_division) — commitments point here. */
  lineItems: Row[];
  /** purchase_orders rows (cost_code, total, status, notes). */
  purchaseOrders: Row[];
  /** bills rows (cost_code, total, amount, status). */
  bills: Row[];
}

export interface RolledBudgetLine extends BudgetLineView {
  committed_source: 'commitments' | 'entered';
  direct_costs: number;
  projected_cost: number;
  over_under: number;
}

export interface BudgetTotals {
  lineCount: number;
  original: number;
  approvedChanges: number;
  revised: number;
  committed: number;
  actual: number;
  direct: number;
  forecast: number;
  /** revised − committed: budget not yet bought out. */
  uncommitted: number;
  /** revised − actual: budget not yet spent. */
  remaining: number;
  /** Σ per line: revised − actual − (committed not yet spent). */
  costToComplete: number;
  /** revised − forecast. */
  overUnder: number;
}

const DEAD = new Set(['void', 'voided', 'cancelled', 'canceled', 'rejected', 'draft']);
const norm = (c: unknown) => String(c ?? '').trim().toLowerCase();
const num = (v: unknown) => Number(v) || 0;
const round = (n: number) => Math.round(n * 100) / 100;

/** Budget lines with live committed / direct costs. Pure. */
export function rollupBudgetLines(inp: BudgetRollupInputs): RolledBudgetLine[] {
  /* Which line each piece of paper lands on (lib/budget-line). Commitments
     reference budget_LINE_ITEMS (the FK says so), never budget_lines. A
     commitment is placed by its own budget_line_id when it names a line on
     this budget (the on_bid_awarded trigger sets it), else its line item's
     cost code or division, else its own division, else the cost code on its
     award PO. */
  const findLine = budgetLineFinder(inp.lines as { id: string; cost_code?: unknown; description?: unknown; division?: unknown }[]);
  const lineItem = new Map((inp.lineItems as { id: string; cost_code: string | null; csi_division: string | null }[]).map((r) => [r.id, r]));
  const twinCode = new Map<string, string>();
  for (const x of inp.purchaseOrders) {
    const pkg = awardPackageOf(x);
    if (pkg && x.cost_code) twinCode.set(pkg, String(x.cost_code));
  }
  const committedByLine = new Map<string, number>();
  const add = (m: Map<string, number>, id: string | null, amt: number) => { if (id && amt) m.set(id, (m.get(id) || 0) + amt); };
  const lineIds = new Set(inp.lines.map((l) => String(l.id)));
  for (const c of inp.commitments) {
    if (DEAD.has(norm(c.status))) continue;
    const item = c.budget_line_item_id ? lineItem.get(String(c.budget_line_item_id)) : undefined;
    const lineId = (c.budget_line_id && lineIds.has(String(c.budget_line_id)) ? String(c.budget_line_id) : null)
      || (item && (findLine(item.cost_code) || findLine(item.csi_division)))
      || findLine(c.csi_division)
      || (c.bid_package_id ? findLine(twinCode.get(String(c.bid_package_id))) : null);
    add(committedByLine, lineId, num(c.current_amount) || num(c.original_amount) + num(c.approved_changes));
  }
  // A bid award writes both a commitment and a draft PO for the same deal —
  // count the commitment, not its PO twin.
  const awarded = new Set(inp.commitments.map((c) => c.bid_package_id).filter(Boolean).map(String));
  for (const x of inp.purchaseOrders) {
    if (!x.cost_code || DEAD.has(norm(x.status)) || awarded.has(awardPackageOf(x) || '')) continue;
    add(committedByLine, findLine(x.cost_code), num(x.total));
  }
  const billsByLine = new Map<string, number>();
  for (const x of inp.bills) {
    if (!x.cost_code || DEAD.has(norm(x.status))) continue;
    add(billsByLine, findLine(x.cost_code), num(x.total) || num(x.amount));
  }
  return inp.lines.map((r) => {
    const v = toBudgetLineView(r);
    const liveCommitted = committedByLine.get(v.id) || 0;
    const committed = liveCommitted > 0 ? round(liveCommitted) : v.committed_cost;
    const direct = round(billsByLine.get(v.id) || 0);
    const projectedCost = round(committed + direct);
    const eac = Math.max(v.forecast_cost, projectedCost);
    return {
      ...v,
      committed_cost: committed,
      committed_source: liveCommitted > 0 ? 'commitments' : 'entered',
      direct_costs: direct,
      projected_cost: projectedCost,
      forecast_cost: round(eac),
      over_under: round(v.revised_budget - eac),
    };
  });
}

/** Job totals from rolled lines. Pure; cents-safe rounding. */
export function budgetTotals(lines: Array<Pick<RolledBudgetLine, 'original_budget' | 'approved_cos' | 'revised_budget' | 'committed_cost' | 'actual_cost' | 'forecast_cost'> & { direct_costs?: number }>): BudgetTotals {
  let original = 0, approved = 0, revised = 0, committed = 0, actual = 0, direct = 0, forecast = 0, ctc = 0;
  for (const l of lines) {
    original += num(l.original_budget);
    approved += num(l.approved_cos);
    revised += num(l.revised_budget);
    committed += num(l.committed_cost);
    actual += num(l.actual_cost);
    direct += num(l.direct_costs);
    forecast += num(l.forecast_cost);
    const committedNotSpent = Math.max(0, num(l.committed_cost) - num(l.actual_cost));
    ctc += num(l.revised_budget) - num(l.actual_cost) - committedNotSpent;
  }
  return {
    lineCount: lines.length,
    original: round(original),
    approvedChanges: round(approved),
    revised: round(revised),
    committed: round(committed),
    actual: round(actual),
    direct: round(direct),
    forecast: round(forecast),
    uncommitted: round(revised - committed),
    remaining: round(revised - actual),
    costToComplete: round(ctc),
    overUnder: round(revised - forecast),
  };
}

/** Read a job's budget lines and the paper that rolls into them, tenant-scoped,
 *  and roll them up. Throws on a failed read. */
export async function loadBudgetRollup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { from: (table: string) => any },
  tenantId: string,
  projectId: string,
): Promise<{ lines: RolledBudgetLine[]; totals: BudgetTotals }> {
  const scoped = (table: string, cols: string) => db.from(table).select(cols).eq('project_id', projectId).eq('tenant_id', tenantId);
  const [bl, cm, bli, po, bills] = await Promise.all([
    scoped('budget_lines', '*').order('cost_code', { ascending: true }),
    scoped('commitments', 'budget_line_id, budget_line_item_id, csi_division, original_amount, approved_changes, current_amount, status, bid_package_id'),
    scoped('budget_line_items', 'id, cost_code, csi_division'),
    scoped('purchase_orders', 'cost_code, total, status, notes'),
    scoped('bills', 'cost_code, total, amount, status'),
  ]);
  for (const q of [bl, cm, bli, po, bills]) if (q.error) throw q.error;
  const lines = rollupBudgetLines({
    lines: (bl.data ?? []) as Row[],
    commitments: (cm.data ?? []) as Row[],
    lineItems: (bli.data ?? []) as Row[],
    purchaseOrders: (po.data ?? []) as Row[],
    bills: (bills.data ?? []) as Row[],
  });
  return { lines, totals: budgetTotals(lines) };
}
