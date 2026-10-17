// ─────────────────────────────────────────────────────────────────────────────
// Custom Report Builder — entity whitelist.
//
// The SINGLE source of truth for which real tables a custom report may query and
// which columns of each are exposed. Both the /api/reports/run route (server) and
// the /app/reports/builder page (client) import from here so the whitelist can
// never drift between the two.
//
// SECURITY: only tables/columns listed here are ever reachable. The run route
// intersects any caller-supplied `entity`, `columns`, filter `field`s and `sort`
// field against this map before touching the database. Nothing is string-concatted
// into SQL — the Supabase query builder is used with these validated identifiers.
//
// Every table below was confirmed to exist (with a tenant_id column and tenant RLS)
// in the live Saguaro CRM database. `soft: true` marks tables with a deleted_at
// column so the run route can exclude soft-deleted rows.
// ─────────────────────────────────────────────────────────────────────────────

export type ColType = 'text' | 'currency' | 'date' | 'number' | 'badge' | 'percent' | 'bool';

export interface ReportColumnDef {
  key: string;
  label: string;
  type: ColType;
}

export interface ReportEntityDef {
  /** Stable key used in the API + URL. */
  key: string;
  /** Human label for the dropdown. */
  label: string;
  /** Real Postgres table name. */
  table: string;
  /** True when the table has a deleted_at column (soft delete). */
  soft: boolean;
  /** Default column to sort by. */
  defaultSort: string;
  columns: ReportColumnDef[];
}

const C = (key: string, label: string, type: ColType = 'text'): ReportColumnDef => ({ key, label, type });

const ENTITY_DEFS: ReportEntityDef[] = [
  {
    key: 'rfis',
    label: 'RFIs',
    table: 'rfis',
    soft: true,
    defaultSort: 'created_at',
    columns: [
      C('rfi_number', 'RFI #'),
      C('subject', 'Subject'),
      C('status', 'Status', 'badge'),
      C('priority', 'Priority'),
      C('ball_in_court', 'Ball in Court'),
      C('assigned_to_name', 'Assigned To'),
      C('spec_section', 'Spec Section'),
      C('due_date', 'Due Date', 'date'),
      C('submitted_at', 'Submitted', 'date'),
      C('answered_at', 'Answered', 'date'),
      C('cost_impact', 'Cost Impact', 'currency'),
      C('schedule_impact_days', 'Sched Impact (days)', 'number'),
      C('is_urgent', 'Urgent', 'bool'),
      C('created_at', 'Created', 'date'),
    ],
  },
  {
    key: 'submittals',
    label: 'Submittals',
    table: 'submittals',
    soft: true,
    defaultSort: 'created_at',
    columns: [
      C('submittal_number', 'Submittal #'),
      C('title', 'Title'),
      C('spec_section', 'Spec Section'),
      C('status', 'Status', 'badge'),
      C('priority', 'Priority'),
      C('trade', 'Trade'),
      C('subcontractor', 'Subcontractor'),
      C('ball_in_court', 'Ball in Court'),
      C('review_action', 'Review Action'),
      C('revision_number', 'Rev', 'number'),
      C('due_date', 'Due Date', 'date'),
      C('submitted_at', 'Submitted', 'date'),
      C('returned_at', 'Returned', 'date'),
      C('created_at', 'Created', 'date'),
    ],
  },
  {
    key: 'change_orders',
    label: 'Change Orders',
    table: 'change_orders',
    soft: true,
    defaultSort: 'created_at',
    columns: [
      C('co_number', 'CO #'),
      C('title', 'Title'),
      C('status', 'Status', 'badge'),
      C('change_type', 'Type'),
      C('amount', 'Amount', 'currency'),
      C('cost_impact', 'Cost Impact', 'currency'),
      C('schedule_impact_days', 'Sched Impact (days)', 'number'),
      C('reason', 'Reason'),
      C('submitted_at', 'Submitted', 'date'),
      C('approved_at', 'Approved', 'date'),
      C('created_at', 'Created', 'date'),
    ],
  },
  {
    key: 'change_events',
    label: 'Change Events',
    table: 'change_events',
    soft: true,
    defaultSort: 'created_at',
    columns: [
      C('event_number', 'Event #'),
      C('title', 'Title'),
      C('status', 'Status', 'badge'),
      C('origin', 'Origin'),
      C('cost_impact', 'Cost Impact', 'currency'),
      C('markup_pct', 'Markup %', 'percent'),
      C('schedule_impact_days', 'Sched Impact (days)', 'number'),
      C('created_at', 'Created', 'date'),
    ],
  },
  {
    key: 'budget_lines',
    label: 'Budget Lines',
    table: 'budget_lines',
    soft: false,
    defaultSort: 'sort_order',
    columns: [
      C('cost_code', 'Cost Code'),
      C('description', 'Description'),
      C('division', 'Division'),
      C('category', 'Category'),
      C('original_budget', 'Original Budget', 'currency'),
      C('approved_changes', 'Approved Changes', 'currency'),
      C('revised_budget', 'Revised Budget', 'currency'),
      C('committed', 'Committed', 'currency'),
      C('actual', 'Actual', 'currency'),
      C('projected', 'Projected', 'currency'),
      C('variance', 'Variance', 'currency'),
      C('percent_complete', '% Complete', 'percent'),
      C('created_at', 'Created', 'date'),
    ],
  },
  {
    key: 'daily_logs',
    label: 'Daily Logs',
    table: 'daily_logs',
    soft: true,
    defaultSort: 'log_date',
    columns: [
      C('log_date', 'Log Date', 'date'),
      C('superintendent', 'Superintendent'),
      C('crew_count', 'Crew Count', 'number'),
      C('weather', 'Weather'),
      C('high_temp', 'High Temp', 'number'),
      C('low_temp', 'Low Temp', 'number'),
      C('work_performed', 'Work Performed'),
      C('delays', 'Delays'),
      C('status', 'Status', 'badge'),
      C('created_at', 'Created', 'date'),
    ],
  },
  {
    // The real table is `punch_list` (there is no `punch_items` table).
    key: 'punch_list',
    label: 'Punch List',
    table: 'punch_list',
    soft: false,
    defaultSort: 'created_at',
    columns: [
      C('item_number', 'Item #'),
      C('title', 'Title'),
      C('status', 'Status', 'badge'),
      C('priority', 'Priority'),
      C('trade', 'Trade'),
      C('location', 'Location'),
      C('assigned_to_name', 'Assigned To'),
      C('due_date', 'Due Date', 'date'),
      C('completed_at', 'Completed', 'date'),
      C('cost_estimate', 'Cost Estimate', 'currency'),
      C('created_at', 'Created', 'date'),
    ],
  },
  {
    key: 'observations',
    label: 'Observations',
    table: 'observations',
    soft: false,
    defaultSort: 'created_at',
    columns: [
      C('title', 'Title'),
      C('observation_type', 'Type'),
      C('severity', 'Severity', 'badge'),
      C('status', 'Status', 'badge'),
      C('location', 'Location'),
      C('assigned_to', 'Assigned To'),
      C('due_date', 'Due Date', 'date'),
      C('resolved_at', 'Resolved', 'date'),
      C('created_at', 'Created', 'date'),
    ],
  },
  {
    key: 'field_issues',
    label: 'Field Issues',
    table: 'field_issues',
    soft: true,
    defaultSort: 'created_at',
    columns: [
      C('issue_number', 'Issue #'),
      C('title', 'Title'),
      C('status', 'Status', 'badge'),
      C('priority', 'Priority'),
      C('location', 'Location'),
      C('assigned_to_name', 'Assigned To'),
      C('due_date', 'Due Date', 'date'),
      C('resolved_at', 'Resolved', 'date'),
      C('cost_impact', 'Cost Impact', 'currency'),
      C('schedule_impact_days', 'Sched Impact (days)', 'number'),
      C('created_at', 'Created', 'date'),
    ],
  },
  {
    key: 'commitments',
    label: 'Commitments',
    table: 'commitments',
    soft: false,
    defaultSort: 'created_at',
    columns: [
      C('commitment_number', 'Commitment #'),
      C('vendor_name', 'Vendor'),
      C('commitment_type', 'Type'),
      C('status', 'Status', 'badge'),
      C('csi_division', 'CSI Division'),
      C('original_amount', 'Original Amount', 'currency'),
      C('current_amount', 'Current Amount', 'currency'),
      C('invoiced_to_date', 'Invoiced to Date', 'currency'),
      C('balance_remaining', 'Balance Remaining', 'currency'),
      C('retainage_held', 'Retainage Held', 'currency'),
      C('contract_date', 'Contract Date', 'date'),
      C('created_at', 'Created', 'date'),
    ],
  },
  {
    key: 'pay_applications',
    label: 'Pay Applications',
    table: 'pay_applications',
    soft: true,
    defaultSort: 'app_number',
    columns: [
      C('app_number', 'App #', 'number'),
      C('status', 'Status', 'badge'),
      C('period_from', 'Period From', 'date'),
      C('period_to', 'Period To', 'date'),
      C('scheduled_value', 'Scheduled Value', 'currency'),
      C('this_period', 'This Period', 'currency'),
      C('total_completed', 'Total Completed', 'currency'),
      C('retainage_held', 'Retainage Held', 'currency'),
      C('net_payment_due', 'Net Payment Due', 'currency'),
      C('percent_complete', '% Complete', 'percent'),
      C('submitted_at', 'Submitted', 'date'),
      C('created_at', 'Created', 'date'),
    ],
  },
  {
    // The real table is `cost_entries` (direct costs against a project).
    key: 'direct_costs',
    label: 'Direct Costs',
    table: 'cost_entries',
    soft: false,
    defaultSort: 'entry_date',
    columns: [
      C('entry_type', 'Type'),
      C('vendor_name', 'Vendor'),
      C('invoice_number', 'Invoice #'),
      C('csi_division', 'CSI Division'),
      C('amount', 'Amount', 'currency'),
      C('entry_date', 'Entry Date', 'date'),
      C('period_from', 'Period From', 'date'),
      C('period_to', 'Period To', 'date'),
      C('approved', 'Approved', 'bool'),
      C('description', 'Description'),
      C('created_at', 'Created', 'date'),
    ],
  },
];

/**
 * Every source is per-job, so every report can show and filter by the job.
 * The column is the row's project_id; lib/reports/run turns it into the job's
 * name before the rows leave the server (so the table, the exports and the
 * scheduled emails all read "Pima County…", never a uuid). It is the first
 * column, so a new report shows the job by default.
 */
export const PROJECT_COLUMN = 'project_id';
export const REPORT_ENTITIES: ReportEntityDef[] = ENTITY_DEFS.map((e) => ({
  ...e,
  columns: [C(PROJECT_COLUMN, 'Project'), ...e.columns.filter((c) => c.key !== PROJECT_COLUMN)],
}));

/** Operators that make sense on the Project column (it holds a job id). */
export const PROJECT_FILTER_OPS = new Set(['eq', 'neq', 'is_null', 'not_null']);

export const ENTITY_MAP: Record<string, ReportEntityDef> = Object.fromEntries(
  REPORT_ENTITIES.map((e) => [e.key, e]),
);

/** Filter operators the run route accepts. `is_null` / `not_null` ignore the value. */
export const FILTER_OPS = [
  { op: 'eq', label: '= equals' },
  { op: 'neq', label: '≠ not equals' },
  { op: 'gt', label: '> greater than' },
  { op: 'gte', label: '≥ greater or equal' },
  { op: 'lt', label: '< less than' },
  { op: 'lte', label: '≤ less or equal' },
  { op: 'ilike', label: 'contains' },
  { op: 'is_null', label: 'is empty' },
  { op: 'not_null', label: 'is not empty' },
] as const;

export type FilterOp = (typeof FILTER_OPS)[number]['op'];

export const FILTER_OP_SET = new Set<string>(FILTER_OPS.map((o) => o.op));

export const MAX_ROWS = 1000;
