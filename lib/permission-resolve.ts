/**
 * The permission resolver as pure functions — no Supabase, no Next imports.
 *
 * lib/permissions (the route guard) and lib/viewer-scope (the database layer's
 * job and money scoping) both resolve a person's levels. The guard imports the
 * server client, and the server client's fetch imports the scope, so the rule
 * itself has to live in a leaf both can import without a cycle. One copy of the
 * rule; rbac.permission_level_for (20261017h, 20261018r) is its SQL port.
 */
import { CATEGORIES, INHERITS_WHEN_ABSENT, LEVEL_RANK, type PermCategory, type PermLevel } from './permission-categories';

export type PermissionMap = Record<PermCategory, PermLevel>;

/** Roles that get an unconditional Full-on-everything bypass. */
export const ADMIN_ROLES = new Set(['admin', 'owner']);

export function isAdminBaseRole(role: string | null | undefined): boolean {
  return ADMIN_ROLES.has((role || '').toLowerCase());
}

export function fill(level: PermLevel): PermissionMap {
  return CATEGORIES.reduce((acc, c) => {
    acc[c] = level;
    return acc;
  }, {} as PermissionMap);
}

/**
 * Default for a NON-admin user who has ZERO role assignments: View on every
 * operational category, None on Admin. Least privilege — nothing that mutates
 * money or membership is reachable without a deliberate role assignment.
 */
export function memberDefault(): PermissionMap {
  const m = fill('View');
  m['Admin'] = 'None';
  return m;
}

/** Coerce an arbitrary jsonb value into a known PermLevel (unknown → None). */
export function normalizeLevel(v: unknown): PermLevel {
  return v === 'Full' || v === 'Edit' || v === 'View' || v === 'None' ? v : 'None';
}

function maxLevel(a: PermLevel, b: PermLevel): PermLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

/** A user_role_assignments row as the resolver reads it. */
export type AssignmentRow = {
  role_id: string | null;
  project_id: string | null;
  /** Per-category levels for this job. Honored on project rows only. */
  permissions?: unknown;
};

/** One stored role's map. A category the role never mentioned inherits from
 *  the one it used to be gated on (INHERITS_WHEN_ABSENT). */
export function roleLevels(stored: unknown): PermissionMap {
  const perms = (stored ?? {}) as Record<string, unknown>;
  const out = fill('None');
  for (const c of CATEGORIES) {
    const inheritFrom = INHERITS_WHEN_ABSENT[c];
    const raw = (inheritFrom && !(c in perms)) ? perms[inheritFrom] : perms[c];
    out[c] = normalizeLevel(raw);
  }
  return out;
}

function overridesOf(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** The company role's grants, highest wins (step 2). */
function companyLevels(
  assignments: readonly AssignmentRow[],
  levelsFor: (roleId: string) => PermissionMap,
): PermissionMap {
  const globalIds = Array.from(new Set(
    assignments.filter((a) => a.project_id == null).map((a) => a.role_id).filter((r): r is string => !!r),
  ));
  if (globalIds.length === 0) return memberDefault();
  const company = fill('None');
  for (const id of globalIds) {
    const m = levelsFor(id);
    for (const c of CATEGORIES) company[c] = maxLevel(company[c], m[c]);
  }
  return company;
}

/**
 * Is this person's company role limited to the jobs they are on (Procore's
 * subcontractor model)? True when they hold at least one company role and
 * EVERY company role they hold is scoped to assigned jobs — one company-wide
 * role (Foreman, PM …) beside it lifts the limit, as the highest grant wins
 * everywhere else.
 */
export function isJobScoped(
  baseRole: string | null | undefined,
  assignments: readonly AssignmentRow[],
  scopedRoleIds: ReadonlySet<string> | undefined,
): boolean {
  if (isAdminBaseRole(baseRole) || !scopedRoleIds || scopedRoleIds.size === 0) return false;
  const globalIds = Array.from(new Set(
    assignments.filter((a) => a.project_id == null).map((a) => a.role_id).filter((r): r is string => !!r),
  ));
  return globalIds.length > 0 && globalIds.every((id) => scopedRoleIds.has(id));
}

/**
 * The resolution order:
 *
 *  1. profiles.role 'admin' | 'owner'  ⇒  Full on every category, every job.
 *  2. COMPANY role — the user's global grants (project_id IS NULL), highest
 *     level wins per category. No global grant ⇒ memberDefault().
 *  2b. JOB-SCOPED company role (Subcontractor): on a job the person is not on
 *     — no job row and not on the job's team — every category is None. Admin
 *     stays company-wide (5).
 *  3. No job asked about, or the person has no row for that job ⇒ company role.
 *  4. JOB role — the rows for that job REPLACE the company role there, up or
 *     down. Each row is its role (or, with no role, the company role) with the
 *     row's per-category levels laid on top; several rows ⇒ highest wins.
 *     "No access" is a row with no role and every category None.
 *  5. Admin (roles, payroll, billing, company settings) is company-wide.
 *  6. A company admin (company role Admin: Full) stays an admin everywhere.
 *
 * `assignments` and `roles` must already be this tenant's rows.
 */
export function resolvePermissions(input: {
  baseRole: string | null | undefined;
  assignments: readonly AssignmentRow[];
  roles: ReadonlyMap<string, unknown>;
  projectId?: string | null;
  /** Role ids whose scope is "the jobs they're on" (role_definitions.scope = 'assigned'). */
  scopedRoleIds?: ReadonlySet<string>;
  /** Job ids the person is on through the job's team (project_team / project_users). */
  memberJobIds?: ReadonlySet<string>;
}): PermissionMap {
  if (isAdminBaseRole(input.baseRole)) return fill('Full');

  const levelsFor = (roleId: string): PermissionMap =>
    input.roles.has(roleId) ? roleLevels(input.roles.get(roleId)) : fill('None');

  const company = companyLevels(input.assignments, levelsFor);

  const pid = input.projectId;
  if (pid == null) return company;
  const jobRows = input.assignments.filter((a) => a.project_id === pid);

  // 2b) Scoped to the jobs they're on, and not on this one.
  if (jobRows.length === 0 && isJobScoped(input.baseRole, input.assignments, input.scopedRoleIds)
      && !(input.memberJobIds?.has(pid))) {
    const none = fill('None');
    none['Admin'] = company['Admin'];
    return none;
  }

  // 3) Not on this job specifically.
  if (jobRows.length === 0) return company;

  // 4) Job role replaces the company role on this job.
  const job = fill('None');
  for (const row of jobRows) {
    const m: PermissionMap = row.role_id ? levelsFor(row.role_id) : { ...company };
    const ov = overridesOf(row.permissions);
    if (ov) for (const c of CATEGORIES) if (c in ov) m[c] = normalizeLevel(ov[c]);
    for (const c of CATEGORIES) job[c] = maxLevel(job[c], m[c]);
  }

  // 5) Admin stays company-wide.
  job['Admin'] = company['Admin'];

  // 6) A company admin is never reduced on a job.
  if (company['Admin'] === 'Full') {
    for (const c of CATEGORIES) job[c] = maxLevel(job[c], company[c]);
  }
  return job;
}

/** True if `perms` grants at least `minLevel` on `category`. */
export function hasPermission(perms: PermissionMap, category: PermCategory, minLevel: PermLevel): boolean {
  const have = perms[category] ?? 'None';
  return LEVEL_RANK[have] >= LEVEL_RANK[minLevel];
}

/** True if `perms` grants at least `minLevel` on ANY of `categories`. */
export function hasAnyPermission(perms: PermissionMap, categories: readonly PermCategory[], minLevel: PermLevel): boolean {
  return categories.some((c) => hasPermission(perms, c, minLevel));
}

/**
 * Proposal and bid dollars, and e-sign signer details: Sales OR Budget
 * (owner decision, 16 Oct 2026; the database applies it in role_gate_*_proposals …).
 */
export const PROPOSAL_MONEY: readonly PermCategory[] = ['Sales', 'Budget'];

/**
 * Job money — contract values, budgets, costs, commitments, billed totals, pay
 * application and change-order amounts, the pipeline's dollars: a role with
 * View on any money tool (Budget, Pay Apps, Change Orders, Sales). A Foreman
 * holds none of them and never receives the figures (lib/money-fields).
 */
export const MONEY_VIEW: readonly PermCategory[] = ['Budget', 'Pay Apps', 'Change Orders', 'Sales'];

/** Pay rates (wages, labor rates, cost rates): Budget or Admin view. Labor cost is job cost. */
export const RATE_VIEW: readonly PermCategory[] = ['Budget', 'Admin'];

/** Every role_definitions row's scope: the whole company, or only the jobs the person is on. */
export type RoleScope = 'company' | 'assigned';

export function roleScopeOf(row: { scope?: unknown; name?: unknown; is_builtin?: unknown } | null | undefined): RoleScope {
  if (!row) return 'company';
  if (row.scope === 'assigned' || row.scope === 'company') return row.scope;
  // Before 20261018r adds the column: the built-in Subcontractor template is job-scoped.
  return row.is_builtin === true && row.name === 'Subcontractor' ? 'assigned' : 'company';
}

/** The verb and noun of a refusal: "view Budget", "change RFIs". */
export function refusalText(categories: readonly PermCategory[], minLevel: PermLevel): string {
  const what = categories.length > 1 ? categories.join(' or ') : categories[0];
  return `You don't have permission to ${minLevel === 'View' ? 'view' : 'change'} ${what}. Ask your company admin for access.`;
}
