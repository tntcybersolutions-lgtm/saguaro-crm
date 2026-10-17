/**
 * Viewer scope — what the signed-in person may see, applied by the server's
 * own database client so that EVERY API route inherits it.
 *
 * Three rules, each the shared form of one the guard (lib/permissions) already
 * enforces on a route that names its job:
 *
 *  1. CLOSED JOBS. A job on which the person's Projects level is None — a
 *     "No access" job row, or, for a job-scoped company role (Subcontractor,
 *     Procore's model), any job they are not on — is not in any list, search,
 *     rollup, count or feed. Rows on it are filtered out in the database query
 *     itself (`project_id not in (…)`, or `in (…)` for a job-scoped person).
 *     Rows on no job are kept.
 *  2. JOB MONEY. Without View on a money tool (MONEY_VIEW) on the row's job,
 *     the money columns (lib/money-fields MONEY_COLUMNS) arrive as null.
 *  3. PAY RATES. Without RATE_VIEW, wage and rate columns arrive as null.
 *
 * Why the database client and not each route: 800 routes read job-owned
 * tables, and every company-wide list that forgot `jobsClosedTo()` leaked a
 * No-access job (live QA, 17 Oct 2026: search, /api/rfis, /api/daily-logs/list
 * …). A route can no longer forget.
 *
 * What it does NOT do:
 *  - change anything for admins/owners or a person with every right (the
 *    common case costs one cached lookup, then nothing);
 *  - touch requests with no signed-in person (cron, webhooks, token portals);
 *  - redact during a write request: a route that reads a total to recompute
 *    it must read the real value. And during a READ request, a write's money
 *    columns are dropped, so a read can never save a nulled figure back.
 *  - stand in for the guard: the route still checks the category. The guard
 *    reads with the unscoped client so a closed job answers 403, not 404.
 *
 * Pure planning functions are exported for tests; supabase-server wires them.
 */
import {
  resolvePermissions, hasAnyPermission, isAdminBaseRole, isJobScoped, roleScopeOf, MONEY_VIEW, RATE_VIEW,
  type AssignmentRow,
} from './permission-resolve';
import { MONEY_COLUMNS, parseAliases, parseEmbeds, redactRow, stripGuardedColumns, touchesGuardedColumns, hasGuardedColumns } from './money-fields';

export type JobVisibility =
  | { mode: 'all' }
  | { mode: 'except'; closed: ReadonlySet<string> }
  | { mode: 'only'; allowed: ReadonlySet<string> };

export type ViewerScope = {
  jobs: JobVisibility;
  money: { company: boolean; jobs: ReadonlyMap<string, boolean> };
  rates: { company: boolean; jobs: ReadonlyMap<string, boolean> };
};

export const UNRESTRICTED: ViewerScope = {
  jobs: { mode: 'all' },
  money: { company: true, jobs: new Map() },
  rates: { company: true, jobs: new Map() },
};

function allTrue(x: { company: boolean; jobs: ReadonlyMap<string, boolean> }): boolean {
  if (!x.company) return false;
  for (const v of Array.from(x.jobs.values())) if (!v) return false;
  return true;
}

/** Nothing to filter and nothing to hide. */
export function isUnrestricted(s: ViewerScope): boolean {
  return s.jobs.mode === 'all' && allTrue(s.money) && allTrue(s.rates);
}

/** May the person see rows on this job? Rows on no job: yes. */
export function jobVisible(s: ViewerScope, projectId: string | null | undefined): boolean {
  if (!projectId) return true;
  if (s.jobs.mode === 'except') return !s.jobs.closed.has(projectId);
  if (s.jobs.mode === 'only') return s.jobs.allowed.has(projectId);
  return true;
}

export function moneyOn(s: ViewerScope, projectId: string | null | undefined): boolean {
  return projectId && s.money.jobs.has(projectId) ? !!s.money.jobs.get(projectId) : s.money.company;
}

export function ratesOn(s: ViewerScope, projectId: string | null | undefined): boolean {
  return projectId && s.rates.jobs.has(projectId) ? !!s.rates.jobs.get(projectId) : s.rates.company;
}

/**
 * The scope from the same rows the guard reads. `memberJobIds` are the jobs the
 * person is on through the job's team (project_team / project_users).
 */
export function computeViewerScope(input: {
  baseRole: string | null | undefined;
  assignments: readonly AssignmentRow[];
  roles: ReadonlyMap<string, unknown>;
  scopedRoleIds?: ReadonlySet<string>;
  memberJobIds?: ReadonlySet<string>;
}): ViewerScope {
  if (isAdminBaseRole(input.baseRole)) return UNRESTRICTED;
  const base = { baseRole: input.baseRole, assignments: input.assignments, roles: input.roles, scopedRoleIds: input.scopedRoleIds, memberJobIds: input.memberJobIds };
  const company = resolvePermissions({ ...base, projectId: null });
  const companyMoney = hasAnyPermission(company, MONEY_VIEW, 'View');
  const companyRates = hasAnyPermission(company, RATE_VIEW, 'View');
  const jobScoped = isJobScoped(input.baseRole, input.assignments, input.scopedRoleIds);

  const jobIds = new Set<string>(input.assignments.map((a) => a.project_id).filter((p): p is string => !!p));
  if (jobScoped) for (const p of Array.from(input.memberJobIds ?? [])) jobIds.add(p);

  const closed = new Set<string>();
  const allowed = new Set<string>();
  const money = new Map<string, boolean>();
  const rates = new Map<string, boolean>();
  for (const pid of Array.from(jobIds)) {
    const m = resolvePermissions({ ...base, projectId: pid });
    if (m['Projects'] === 'None') { closed.add(pid); continue; }
    allowed.add(pid);
    const mo = hasAnyPermission(m, MONEY_VIEW, 'View');
    const ra = hasAnyPermission(m, RATE_VIEW, 'View');
    if (mo !== companyMoney) money.set(pid, mo);
    if (ra !== companyRates) rates.set(pid, ra);
  }

  const jobs: JobVisibility = jobScoped
    ? { mode: 'only', allowed }
    : closed.size ? { mode: 'except', closed } : { mode: 'all' };
  return { jobs, money: { company: companyMoney, jobs: money }, rates: { company: companyRates, jobs: rates } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = { from: (table: string) => any };

/** Read everything computeViewerScope needs. `db` must be an UNSCOPED client. */
export async function loadViewerScope(db: AnyDb, userId: string, tenantId: string): Promise<ViewerScope> {
  const { data: profile, error: pErr } = await db.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (pErr) throw pErr;
  const baseRole = ((profile as { role?: string } | null)?.role || '').toLowerCase();
  if (isAdminBaseRole(baseRole)) return UNRESTRICTED;

  const { data: rows, error } = await db.from('user_role_assignments').select('*').eq('user_id', userId).eq('tenant_id', tenantId);
  if (error) throw error;
  const assignments = (rows || []) as AssignmentRow[];
  const roleIds = Array.from(new Set(assignments.map((a) => a.role_id).filter((r): r is string => !!r)));
  const roles = new Map<string, unknown>();
  const scoped = new Set<string>();
  if (roleIds.length) {
    const { data: defs, error: rErr } = await db.from('role_definitions').select('*').eq('tenant_id', tenantId).in('id', roleIds);
    if (rErr) throw rErr;
    for (const d of (defs || []) as Array<{ id: string; permissions: unknown; scope?: unknown; name?: unknown; is_builtin?: unknown }>) {
      roles.set(d.id, d.permissions);
      if (roleScopeOf(d) === 'assigned') scoped.add(d.id);
    }
  }
  const members = new Set<string>();
  if (isJobScoped(baseRole, assignments, scoped)) {
    for (const table of ['project_team', 'project_users']) {
      const { data, error: tErr } = await db.from(table).select('project_id').eq('tenant_id', tenantId).eq('user_id', userId);
      if (tErr) { console.error('[viewer-scope] membership', table, tErr.message); continue; }
      for (const r of (data || []) as Array<{ project_id: string | null }>) if (r.project_id) members.add(r.project_id);
    }
  }
  return computeViewerScope({ baseRole, assignments, roles, scopedRoleIds: scoped, memberJobIds: members });
}

/**
 * Tables whose rows belong to a job (a uuid project_id referencing projects,
 * plus tenant_id) — read from the live schema 17 Oct 2026. Not here on
 * purpose: user_role_assignments (it IS the access list; admins edit closed
 * jobs' rows through it).
 */
export const JOB_TABLES: ReadonlySet<string> = new Set((
  'action_items,action_plans,activity_events,activity_log,ai_briefings,ai_predictions,approval_requests,' +
  'ar_calibrations,assets,audit_logs,autopilot_alerts,autopilot_runs,badges,bid_analytics,bid_leveling_analyses,' +
  'bid_levelings,bid_outcomes,bid_packages,bid_submissions,bids,bills,bim_models,bim_uploads,bonds,bookmarks,' +
  'budget_line_items,budget_lines,budget_snapshots,budgets,cash_flow_projections,certified_payroll,' +
  'certified_payroll_lines,change_events,change_orders,clock_punches,closeout,closeout_items,closeout_packages,' +
  'commissioning,commitments,communication_log,contacts,contracts,coordination_issues,correspondence,cost_codes,' +
  'cost_entries,cost_reports,crew_assignments,crew_location_pings,crew_locations,crews,custom_field_values,' +
  'custom_fields,customer_reviews,daily_logs,dashboard_metrics,deliveries,delivery_tracking,' +
  'directory_project_links,distribution_groups,document_control,document_folder_permissions,document_signatures,' +
  'document_versions,drawing_markups,drawing_pins,drawing_review_links,drawing_sets,drawing_sheets,' +
  'drawing_split_jobs,drawings,drone_jobs,drone_media,email_logs,employee_incidents,employee_project_assignments,' +
  'entity_comments,equipment,equipment_locations,equipment_log,equipment_rentals,escalations,favorites,' +
  'field_issues,file_uploads,fleet_assets,fleet_assignments,floor_plan_pins,form_submissions,form_templates,' +
  'franchise_verifications,generated_documents,geofence_events,heatmap_designs,ics_feed_tokens,' +
  'inbound_email_events,inbound_emails,inspection_records,inspection_templates,inspections,instructions,' +
  'insurance_certificates,invoices,item_links,laser_measurements,lead_pipeline,leaderboards,learning_events,' +
  'lien_deadlines,lien_waivers,material_selections,measurement_log,meeting_items,meetings,message_threads,' +
  'messages,milestone_letters,network_access_log,network_access_tokens,network_connections,' +
  'network_heatmap_surveys,network_ip_tracker,network_projects,notifications,observations,' +
  'owner_pay_app_line_items,owner_pay_applications,owner_portal_tokens,owner_reports,pay_app_line_items,' +
  'pay_applications,payroll_periods,payroll_records,permit_correspondence,permit_inspections,permits,photos,' +
  'plan_room_tokens,portal_access_tokens,portal_activity,portal_approvals,portal_client_sessions,portal_clients,' +
  'portal_documents,portal_messages,portal_payments,portal_punch_items,portal_sub_bid_invitations,' +
  'portal_sub_daily_logs,portal_sub_messages,portal_sub_pay_apps,portal_sub_rfis,portal_sub_scorecards,' +
  'portal_sub_sessions,portal_sub_tasks,portal_subcontractors,portal_summaries,portal_users,' +
  'portal_warranty_claims,prequalification_forms,presence_sessions,prime_contract_sov,prime_contracts,' +
  'procurement_items,project_compliance_dashboard,project_contacts,project_documents,project_files,' +
  'project_folders,project_intelligence,project_milestones,project_phases,project_photos,project_subcontractors,' +
  'project_systems,project_team,project_todos,project_users,proposal_signatures,proposals,punch_list,' +
  'punch_list_items,purchase_orders,qc_checklists,radio_assists,radio_channels,radio_message_records,' +
  'radio_messages,related_items,report_runs,report_schedules,resource_assignments,resource_forecast,' +
  'resource_requests,resource_subcontractors,rfis,risk_register,room_progress,safety_corrective_actions,' +
  'safety_incidents,safety_inspections,safety_plans,safety_talks,sage_messages,sage_proactive_insights,' +
  'sage_quick_actions,sage_trigger_events,schedule_baselines,schedule_milestones,schedule_of_values,' +
  'schedule_phases,schedule_task_dependencies,schedule_tasks,selection_categories,selection_picks,selections,' +
  'service_tickets,sov_line_items,spec_sections,specifications,stock_moves,sub_communications,' +
  'sub_media_submissions,sub_portal_sessions,subcontractor_insurance,subcontractor_scores,submittals,' +
  'takeoff_line_items,takeoff_projects,takeoff_revisions,takeoffs,time_entries,timesheet_entries,timesheets,' +
  'tm_tickets,toolbox_talks,transmittals,union_rate_classes,user_badges,voice_memos,w9_requests,' +
  'warranty_claims,warranty_items,waste_tracking,work_assignments'
).split(','));

/** The nil uuid: an `in` list that matches no job. */
const NO_JOB = [8, 4, 4, 4, 12].map((n) => '0'.repeat(n)).join('-');

/** An id list PostgREST can read; an empty `in` matches nothing. */
function idList(ids: ReadonlySet<string>): string {
  const list = Array.from(ids).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  return list.length ? list.join(',') : NO_JOB;
}

const READ = new Set(['GET', 'HEAD']);
const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** The job a PostgREST query is pinned to by an `eq` filter, if any. */
function pinnedJob(params: URLSearchParams, table: string): string | null {
  const col = table === 'projects' ? 'id' : 'project_id';
  for (const v of params.getAll(col)) {
    const m = v.match(/^eq\.([0-9a-f-]{36})$/i);
    if (m) return m[1];
  }
  return null;
}

export type ScopePlan = {
  url: string;
  /** Redact the response body (a read during a read request). */
  redact: null | { table: string; select: string | null; pinned: string | null };
  /**
   * Drop guarded columns from the request body.
   *  - during a READ request: money and rates (a read never saves money);
   *  - an UPDATE during a write request by someone without money rights on
   *    the row's job: money only. A screen that never received a figure (it
   *    arrived null) must not save that null — or a 0 — over the real one.
   *    Inserts keep what they carry, and rates are never stripped from a write
   *    request (the server computes labor cost from them on clock-out).
   */
  strip: null | { table: string; pinned: string | null; rates: boolean; update: boolean; url: string };
};

/**
 * What to do with one PostgREST request for this viewer.
 * `incomingMethod` is the API request's own method (set by middleware), or
 * null outside an API request (treated as a read).
 */
export function planScopedRequest(rawUrl: string, method: string, scope: ViewerScope, incomingMethod: string | null): ScopePlan {
  const plan: ScopePlan = { url: rawUrl, redact: null, strip: null };
  let u: URL;
  try { u = new URL(rawUrl); } catch { return plan; }
  const m = u.pathname.match(/\/rest\/v1\/([A-Za-z_][\w]*)$/);
  if (!m) return plan; // rpc, storage, auth — not a table read
  const table = m[1];
  const verb = (method || 'GET').toUpperCase();
  const inWrite = !!incomingMethod && WRITE.has(incomingMethod.toUpperCase());

  // 1. Closed jobs — on every read, update and delete of a job's rows.
  if (verb !== 'POST' && scope.jobs.mode !== 'all') {
    if (table === 'projects') {
      u.searchParams.append('id', scope.jobs.mode === 'except' ? `not.in.(${idList(scope.jobs.closed)})` : `in.(${idList(scope.jobs.allowed)})`);
    } else if (JOB_TABLES.has(table)) {
      u.searchParams.append('or', scope.jobs.mode === 'except'
        ? `(project_id.is.null,project_id.not.in.(${idList(scope.jobs.closed)}))`
        : `(project_id.is.null,project_id.in.(${idList(scope.jobs.allowed)}))`);
    }
    plan.url = u.toString();
  }

  const guarded = !(allTrue(scope.money) && allTrue(scope.rates));
  if (!guarded) return plan;
  const select = u.searchParams.get('select');
  const pinned = pinnedJob(u.searchParams, table);

  // 2/3. Money and rates — hidden on reads made while answering a read.
  if (READ.has(verb) && !inWrite && touchesGuardedColumns(table, parseEmbeds(select))) {
    plan.redact = { table, select, pinned };
  }
  // A read request never saves money: whatever it writes goes without those columns.
  const isUpdate = verb === 'PATCH' || verb === 'PUT' || (verb === 'POST' && u.searchParams.has('on_conflict'));
  if (WRITE.has(verb) && verb !== 'DELETE' && !inWrite && hasGuardedColumns(table)) {
    plan.strip = { table, pinned, rates: true, update: isUpdate, url: plan.url };
  } else if (inWrite && isUpdate && MONEY_TABLES.has(table) && !allTrue(scope.money)) {
    plan.strip = { table, pinned, rates: false, update: true, url: plan.url };
  }
  return plan;
}

/** Redact a PostgREST JSON body (array or single object) per the plan. */
export function redactBody(body: unknown, plan: NonNullable<ScopePlan['redact']>, scope: ViewerScope): unknown {
  const embeds = parseEmbeds(plan.select);
  const aliases = parseAliases(plan.select);
  const one = (row: unknown) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const r = row as Record<string, unknown>;
    const pid = (plan.table === 'projects' ? r.id : r.project_id) as string | null | undefined;
    const job = typeof pid === 'string' ? pid : plan.pinned;
    return redactRow(plan.table, r, { money: moneyOn(scope, job), rates: ratesOn(scope, job) }, embeds, aliases);
  };
  return Array.isArray(body) ? body.map(one) : one(body);
}

const MONEY_TABLES: ReadonlySet<string> = new Set(Object.keys(MONEY_COLUMNS));

/**
 * Strip a write body per the plan. `rowJobs` are the jobs of the rows an
 * update will touch (looked up when the request does not say); money stays
 * only when the person may see money on every one of them.
 */
export function stripBody(body: unknown, plan: NonNullable<ScopePlan['strip']>, scope: ViewerScope, rowJobs?: ReadonlyArray<string | null>): unknown {
  const own = (!Array.isArray(body) && body && typeof body === 'object' && typeof (body as Record<string, unknown>).project_id === 'string')
    ? (body as Record<string, string>).project_id
    : plan.pinned;
  const jobs: Array<string | null> = rowJobs && rowJobs.length ? [...rowJobs] : [own];
  if (own && !jobs.includes(own)) jobs.push(own);
  const money = jobs.every((j) => moneyOn(scope, j));
  const rates = plan.rates ? jobs.every((j) => ratesOn(scope, j)) : true;
  return stripGuardedColumns(plan.table, body, { money, rates });
}

/** Does deciding the strip need the rows' jobs (money differs by job, and the request does not pin one)? */
function needsRowJobs(plan: NonNullable<ScopePlan['strip']>, scope: ViewerScope): boolean {
  if (!plan.update || plan.pinned) return false;
  return scope.money.jobs.size > 0 || (plan.rates && scope.rates.jobs.size > 0);
}

/** The jobs of the rows an update's filters match (one extra read, only when needed). */
async function jobsOfRows(
  doFetch: (input: string, init?: RequestInit) => Promise<Response>,
  plan: NonNullable<ScopePlan['strip']>,
  headers: HeadersInit | undefined,
): Promise<Array<string | null> | null> {
  try {
    const u = new URL(plan.url);
    u.searchParams.set('select', plan.table === 'projects' ? 'id' : 'project_id');
    u.searchParams.delete('on_conflict');
    u.searchParams.delete('columns');
    const h = new Headers(headers);
    h.delete('prefer');
    h.delete('content-type');
    h.set('accept', 'application/json');
    const res = await doFetch(u.toString(), { method: 'GET', headers: h });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ id?: string; project_id?: string | null }>;
    return rows.map((r) => (plan.table === 'projects' ? r.id ?? null : r.project_id ?? null));
  } catch (e) {
    void e;
    return null;
  }
}

/**
 * Run one database request under the viewer's scope. `doFetch` is the real
 * fetch; the result is the response the caller would have had, with closed
 * jobs' rows absent and guarded columns null.
 */
export async function fetchWithScope(
  doFetch: (input: string, init?: RequestInit) => Promise<Response>,
  input: string,
  init: RequestInit | undefined,
  scope: ViewerScope,
  incomingMethod: string | null,
): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  const plan = planScopedRequest(input, method, scope, incomingMethod);
  let nextInit = init;
  if (plan.strip && typeof init?.body === 'string') {
    // Unknown rows' jobs (the lookup failed) count as no money: never overwrite a figure blind.
    const rowJobs = needsRowJobs(plan.strip, scope) ? ((await jobsOfRows(doFetch, plan.strip, init.headers)) ?? [null]) : undefined;
    try {
      nextInit = { ...init, body: JSON.stringify(stripBody(JSON.parse(init.body), plan.strip, scope, rowJobs)) };
    } catch (e) {
      void e; // not JSON (a file upload) — nothing to strip
    }
  }
  const res = await doFetch(plan.url, nextInit);
  if (!plan.redact || !res.ok || method === 'HEAD') return res;
  const type = res.headers.get('content-type') || '';
  if (!type.includes('json')) return res;
  const text = await res.text();
  let out = text;
  try {
    out = JSON.stringify(redactBody(JSON.parse(text), plan.redact, scope));
  } catch (e) {
    void e; // an empty or non-JSON body passes through as it came
  }
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(out, { status: res.status, statusText: res.statusText, headers });
}
