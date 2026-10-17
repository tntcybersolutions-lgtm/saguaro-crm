/**
 * Money fields — which columns are dollars a role must hold rights to see.
 *
 * The rule (owner decision, generalizing "proposal dollars and signer details
 * only for Sales or Budget roles", 16 Oct 2026): a person sees job money only
 * with View on a money tool (MONEY_VIEW: Budget, Pay Apps, Change Orders or
 * Sales) on that job, and pay rates only with RATE_VIEW (Budget or Admin).
 * A Foreman holds none, so contract values, pipeline, billed totals and pay
 * rates never leave the server for them.
 *
 * Enforced in ONE place: the server database client (lib/supabase-server →
 * lib/viewer-scope) nulls these columns in every row it reads for a person
 * without the right, on every API route. A screen cannot leak a figure the
 * server never sent. Insurance limits, catalog prices and plan prices are not
 * here: they are not the company's job money.
 *
 * A leaf (no imports) so client code can read the same lists.
 */

/** table → job-money columns. */
export const MONEY_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  projects: [
    'contract_value', 'original_contract_value', 'approved_change_orders', 'revised_contract_value', 'billed_to_date',
    'retainage_held', 'balance_to_finish', 'contract_amount', 'total_contract_amount', 'original_contract_amount',
    'contract_sum', 'scheduled_value', 'total_earned', 'total_billed', 'total_paid', 'total_retainage', 'total_pending',
    'cost_to_date', 'estimated_cost', 'projected_cost', 'contingency', 'original_contract', 'net_change_by_co',
    'bond_amount', 'liquidated_damages',
  ],
  lead_pipeline: ['estimated_value'],
  change_orders: [
    'amount', 'original_co_amount', 'subtrade_amount', 'materials_amount', 'labor_amount', 'equipment_amount',
    'overhead_amount', 'profit_amount',
  ],
  change_order_line_items: ['unit_cost', 'amount', 'total'],
  change_events: ['cost_impact'],
  pay_applications: [
    'scheduled_value', 'prev_completed', 'this_period', 'stored_materials', 'retainage_held', 'net_payment_due',
    'change_orders_total', 'total_completed_stored', 'balance_to_finish', 'retainage_this_period', 'retainage_previous',
    'total_retainage', 'total_earned_less_retainage', 'less_previous_certificates', 'current_payment_due',
    'balance_to_finish_including_retainage', 'original_contract_sum', 'net_change_by_change_orders',
    'contract_sum_to_date', 'certified_amount', 'payment_amount', 'labor_rate', 'labor_total', 'material_total',
    'equipment_total', 'markup_total', 'tax_total', 'contract_sum',
  ],
  owner_pay_applications: [
    'original_contract_sum', 'net_change_by_change_orders', 'contract_sum_to_date', 'completed_stored_to_date',
    'retainage_on_completed_work', 'retainage_on_stored_materials', 'total_retainage', 'total_earned_less_retainage',
    'less_previous_certificates', 'current_payment_due', 'balance_to_finish_including_retainage', 'certified_amount',
    'paid_amount',
  ],
  pay_app_line_items: [
    'scheduled_value', 'prev_work_completed', 'prev_stored_materials', 'this_period_work', 'this_period_materials',
    'total_completed', 'balance_to_finish', 'retainage',
  ],
  owner_pay_app_line_items: [
    'scheduled_value', 'previous_applications', 'work_this_period', 'materials_stored', 'total_completed_stored',
    'balance_to_finish', 'retainage',
  ],
  pay_application_lines: ['scheduled_value', 'previous_completed', 'this_period_work', 'this_period_materials', 'total_completed', 'balance_to_finish', 'retainage'],
  schedule_of_values: ['scheduled_value', 'prev_completed', 'this_period', 'stored_materials', 'total_completed', 'balance_to_finish', 'retainage'],
  sov_line_items: ['scheduled_value', 'work_from_previous', 'work_this_period', 'materials_presently_stored', 'total_completed_stored', 'balance_to_finish', 'retainage'],
  prime_contracts: [
    'original_contract_value', 'approved_change_orders', 'current_contract_value', 'retainage_released', 'total_billed',
    'total_paid', 'total_retainage_held', 'net_due',
  ],
  prime_contract_sov: ['scheduled_value', 'billed_to_date', 'retainage_held', 'balance_to_finish', 'materials_stored'],
  contracts: ['amount', 'contract_amount', 'liquidated_damages', 'approved_changes', 'invoiced_amount', 'paid_amount'],
  commitments: ['original_amount', 'approved_changes', 'current_amount', 'invoiced_to_date', 'balance_remaining', 'retainage_held'],
  project_subcontractors: ['contract_amount'],
  resource_subcontractors: ['contract_amount'],
  subcontractors: ['total_awarded', 'annual_revenue_estimate'],
  bid_packages: ['budget_estimate', 'awarded_amount', 'estimated_value', 'low_bid_amount'],
  bid_package_items: ['estimated_cost', 'unit_price', 'total_amount', 'unit_cost_estimate', 'total_estimate'],
  bid_submissions: ['amount', 'base_amount', 'base_bid', 'alternate_1', 'alternate_2', 'alternate_3', 'adjusted_amount', 'scope_gap_amount'],
  bids: ['amount'],
  bid_outcomes: ['bid_amount', 'estimated_cost', 'winning_bid_amount'],
  budgets: ['original_total', 'revised_total', 'committed_total', 'actual_total', 'variance', 'contingency_amount'],
  budget_lines: ['original_budget', 'approved_changes', 'revised_budget', 'committed', 'actual', 'projected', 'variance', 'carried_actual', 'carried_committed'],
  budget_line_items: ['original_budget', 'approved_changes', 'current_budget', 'committed_cost', 'uncommitted_cost', 'cost_to_date', 'estimated_final_cost', 'variance'],
  budget_snapshots: ['total_original_budget', 'total_current_budget', 'total_committed', 'total_cost_to_date', 'total_forecast', 'total_variance'],
  cost_codes: ['budget_amount', 'committed_amount', 'actual_amount'],
  cost_entries: ['amount'],
  cash_flow_projections: ['total_receivables', 'total_payables', 'net_cash_flow'],
  cash_flow_line_items: ['amount'],
  invoices: ['amount', 'tax', 'total', 'paid_amount'],
  invoice_line_items: ['unit_cost', 'amount', 'tax_amount', 'total'],
  bills: ['amount', 'tax', 'total', 'paid_amount'],
  purchase_orders: ['subtotal', 'tax', 'shipping', 'total'],
  lien_waivers: ['amount', 'retainage_amount', 'amount_covered'],
  lien_deadlines: ['amount_claimed'],
  portal_sub_pay_apps: ['amount', 'retainage', 'net_amount'],
  proposals: ['amount', 'total_amount'],
  proposal_lines: ['unit_price', 'total_price'],
  tm_tickets: ['labor_rate', 'labor_total', 'materials_total', 'equipment_total', 'total'],
  takeoffs: [
    'total_cost', 'material_cost', 'labor_cost', 'sell_price', 'gross_profit', 'total_material', 'total_labor',
    'total_equipment', 'total_subcontractor', 'subtotal', 'total_overhead', 'total_profit', 'grand_total', 'cost_per_sqft',
    'contract_value', 'total_contingency',
  ],
  takeoff_projects: ['total_cost', 'material_cost', 'labor_cost', 'equipment_cost', 'sell_price', 'gross_margin', 'total_cost_estimate'],
  takeoff_line_items: [
    'unit_material_cost', 'unit_labor_cost', 'unit_equipment_cost', 'unit_sub_cost', 'total_material', 'total_labor',
    'total_equipment', 'total_sub',
  ],
  resource_forecast: ['labor_cost', 'equipment_cost', 'material_cost', 'total_cost'],
  equipment_rentals: ['rate_amount', 'actual_total_cost'],
  bonds: ['amount', 'premium'],
  approval_requests: ['item_amount'],
  rfis: ['cost_impact'],
  submittals: ['cost_impact'],
  field_issues: ['cost_impact'],
  punch_list: ['cost_estimate', 'cost_to_correct'],
  warranty_claims: ['cost'],
  selections: ['allowance', 'selected_amount', 'variance'],
  selection_categories: ['allowance_amount'],
  material_selections: ['unit_price', 'total_price'],
};

/** table → pay-rate columns (wages, labor rates, cost rates). */
export const RATE_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  employees: ['regular_rate', 'overtime_rate', 'doubletime_rate'],
  workers: ['hourly_rate'],
  time_entries: ['regular_rate_used', 'overtime_rate_used', 'doubletime_rate_used', 'labor_cost', 'hourly_rate', 'total_cost'],
  timesheet_entries: ['hourly_rate', 'total_pay'],
  certified_payroll: ['total_gross', 'total_deductions', 'total_net'],
  certified_payroll_lines: [
    'hourly_rate', 'ot_rate', 'gross_wages', 'deductions', 'net_wages', 'fica', 'federal_withholding',
    'state_withholding', 'other_deductions',
  ],
  payroll_periods: ['total_wages'],
  payroll_records: ['total_gross_wages'],
  resource_assignments: ['hourly_rate', 'cost_rate'],
  prevailing_wage_rates: ['base_rate', 'fringe', 'total_package'],
  union_rate_classes: ['base_rate', 'fringe_rate'],
  wage_determinations: ['base_rate', 'fringe_rate'],
};

type Row = Record<string, unknown>;

/** An embedded resource in a PostgREST select: the key it arrives under, its table, its own embeds. */
export type Embed = { key: string; table: string; embeds: Embed[]; aliases: Array<[string, string]> };

/** Split on commas that are not inside parentheses. */
function topLevel(list: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * The embedded resources of a PostgREST `select=` list:
 *   "*,project:projects(id,name),lines:pay_app_line_items(*)"
 *   → [{ key: 'project', table: 'projects' }, { key: 'lines', table: 'pay_app_line_items' }]
 * Handles `!hint` / `!inner` and nesting. Plain columns and jsonb paths are not embeds.
 */
export function parseEmbeds(select: string | null | undefined): Embed[] {
  if (!select) return [];
  const out: Embed[] = [];
  for (const item of topLevel(select.replace(/\s+/g, ''))) {
    const open = item.indexOf('(');
    if (open < 0 || !item.endsWith(')')) continue;
    const head = item.slice(0, open);
    const inner = item.slice(open + 1, -1);
    const [aliasOrTable, maybeTable] = head.split(':');
    const table = (maybeTable ?? aliasOrTable).split('!')[0];
    const key = (maybeTable ? aliasOrTable : table).split('!')[0];
    if (!/^[A-Za-z_][\w]*$/.test(table)) continue; // aggregates like count() are not embeds
    out.push({ key, table, embeds: parseEmbeds(inner), aliases: parseAliases(inner) });
  }
  return out;
}

/** Renamed plain columns of a select list: "value:contract_value::text" → ['value', 'contract_value']. */
export function parseAliases(select: string | null | undefined): Array<[string, string]> {
  if (!select) return [];
  const out: Array<[string, string]> = [];
  for (const item of topLevel(select.replace(/\s+/g, ''))) {
    if (item.includes('(')) continue;
    const m = item.match(/^([A-Za-z_]\w*):([A-Za-z_]\w*)/);
    if (m) out.push([m[1], m[2]]);
  }
  return out;
}

/**
 * Null the money (and rate) columns of one row of `table` and of the rows
 * embedded in it (`embeds`, from parseEmbeds). Only known columns of known
 * tables are touched — a jsonb field that happens to hold an "amount" key is
 * left alone. Returns the same row (mutated).
 */
export function redactRow(
  table: string,
  row: Row,
  opts: { money: boolean; rates: boolean },
  embeds: readonly Embed[] = [],
  aliases: ReadonlyArray<readonly [string, string]> = [],
): Row {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  const drop = new Set<string>([
    ...(opts.money ? [] : MONEY_COLUMNS[table] || []),
    ...(opts.rates ? [] : RATE_COLUMNS[table] || []),
  ]);
  for (const [alias, column] of aliases) if (drop.has(column)) drop.add(alias);
  drop.forEach((k) => { if (k in row && row[k] !== null) row[k] = null; });
  for (const e of embeds) {
    const v = row[e.key];
    if (Array.isArray(v)) v.forEach((x) => redactRow(e.table, x as Row, opts, e.embeds, e.aliases));
    else if (v && typeof v === 'object') redactRow(e.table, v as Row, opts, e.embeds, e.aliases);
  }
  return row;
}

/** Does this select touch any table redactRow would change? */
export function touchesGuardedColumns(table: string, embeds: readonly Embed[]): boolean {
  return hasGuardedColumns(table) || embeds.some((e) => touchesGuardedColumns(e.table, e.embeds));
}

/** Does this table carry anything redactRow would remove? */
export function hasGuardedColumns(table: string): boolean {
  return !!(MONEY_COLUMNS[table] || RATE_COLUMNS[table]);
}

/** Remove money/rate columns from a write payload (one row or many). */
export function stripGuardedColumns(table: string, payload: unknown, opts: { money: boolean; rates: boolean }): unknown {
  const drop = new Set<string>([
    ...(opts.money ? [] : MONEY_COLUMNS[table] || []),
    ...(opts.rates ? [] : RATE_COLUMNS[table] || []),
  ]);
  if (drop.size === 0) return payload;
  const one = (r: unknown) => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return r;
    const out: Row = {};
    for (const [k, v] of Object.entries(r as Row)) if (!drop.has(k)) out[k] = v;
    return out;
  };
  return Array.isArray(payload) ? payload.map(one) : one(payload);
}
