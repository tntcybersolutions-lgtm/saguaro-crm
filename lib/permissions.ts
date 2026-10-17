/**
 * lib/permissions.ts
 * Server-side enforcement of the Roles & Permissions matrix.
 *
 * The Roles & Permissions admin UI (app/app/roles-permissions/page.tsx) lets a
 * tenant define role_definitions with a permission map of the shape
 *   { [Category]: 'None' | 'View' | 'Edit' | 'Full' }
 * and assign those roles to users (optionally scoped to a single project) via
 * user_role_assignments. Until now those permissions were read and enforced
 * NOWHERE — the matrix was cosmetic. This module makes it real.
 *
 * Server only — imports the service-role client. Never import from a client component.
 */
import { NextRequest, NextResponse } from 'next/server';
import { CATEGORIES, INHERITS_WHEN_ABSENT, LEVEL_RANK, type PermCategory, type PermLevel } from './permission-categories';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient, getUser } from './supabase-server';
import { projectIdForRequest } from './permission-scope';
import type { Database } from './database.types';

/* ── vocabulary ── the category list lives in lib/permission-categories,
   which both this module and the client-side matrix in
   components/team/AccessManager read. ── */
export { CATEGORIES, INHERITS_WHEN_ABSENT };
export type { PermCategory, PermLevel };

export type PermissionMap = Record<PermCategory, PermLevel>;

/** Roles that get an unconditional Full-on-everything bypass. */
const ADMIN_ROLES = new Set(['admin', 'owner']);

type ServerDb = SupabaseClient<Database>;

/* ── helpers ── */

function fill(level: PermLevel): PermissionMap {
  return CATEGORIES.reduce((acc, c) => {
    acc[c] = level;
    return acc;
  }, {} as PermissionMap);
}

/** Full on every category — the admin/owner bypass. */
function adminAll(): PermissionMap {
  return fill('Full');
}

/**
 * Default for a NON-admin user who has ZERO role assignments.
 *
 * DECISION: View on every operational category, None on Admin. This lets a
 * bare member read the app but denies every write/approve (Edit/Full) and all
 * access-control (Admin) actions until a role is explicitly granted. It is the
 * safe, least-privilege default: nothing that mutates money or membership is
 * reachable without a deliberate role assignment.
 */
function memberDefault(): PermissionMap {
  const m = fill('View');
  m['Admin'] = 'None';
  return m;
}

/** Coerce an arbitrary jsonb value into a known PermLevel (unknown → None). */
function normalizeLevel(v: unknown): PermLevel {
  return v === 'Full' || v === 'Edit' || v === 'View' || v === 'None' ? v : 'None';
}

/** Take the higher of two levels. */
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

/** One stored role's map. A category the role never mentioned inherits from the
 *  one it used to be gated on (INHERITS_WHEN_ABSENT) rather than defaulting to
 *  None. `in` rather than a truthiness check: an explicit "Sales": "None" is a
 *  decision and must not be overridden. */
function roleLevels(stored: unknown): PermissionMap {
  const perms = (stored ?? {}) as Record<string, unknown>;
  const out = fill('None');
  for (const c of CATEGORIES) {
    const inheritFrom = INHERITS_WHEN_ABSENT[c];
    const raw = (inheritFrom && !(c in perms)) ? perms[inheritFrom] : perms[c];
    out[c] = normalizeLevel(raw);
  }
  return out;
}

/** The per-category levels on a project row, when it carries any. */
function overridesOf(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * The resolution order, as a pure function (getEffectivePermissions feeds it;
 * rbac.permission_level_for in 20261017h is its line-for-line port, and
 * tools/rls-permission-parity proves the two agree):
 *
 *  1. profiles.role 'admin' | 'owner'  ⇒  Full on every category, every job.
 *  2. COMPANY role — the user's global grants (project_id IS NULL), highest
 *     level wins per category. No global grant ⇒ memberDefault().
 *  3. No job asked about, or the person has no row for that job ⇒ company role.
 *  4. JOB role (Procore behavior) — the rows for that job REPLACE the company
 *     role there, up or down. Each row is its role (or, with no role, the
 *     company role) with the row's per-category levels laid on top; more than
 *     one row for the job ⇒ highest wins. "No access" is a row with no role and
 *     every category None.
 *  5. Admin (roles, payroll, billing, company settings) is company-wide: a job
 *     role never changes it.
 *  6. A company admin (company role Admin: Full) stays an admin everywhere: on
 *     a job the job role can add to the company role, never take from it.
 *
 * `assignments` and `roles` must already be this tenant's rows.
 */
export function resolvePermissions(input: {
  baseRole: string | null | undefined;
  assignments: readonly AssignmentRow[];
  roles: ReadonlyMap<string, unknown>;
  projectId?: string | null;
}): PermissionMap {
  if (ADMIN_ROLES.has((input.baseRole || '').toLowerCase())) return adminAll();

  const levelsFor = (roleId: string): PermissionMap =>
    input.roles.has(roleId) ? roleLevels(input.roles.get(roleId)) : fill('None');

  // 2) Company role.
  const globalIds = Array.from(new Set(
    input.assignments.filter((a) => a.project_id == null).map((a) => a.role_id).filter((r): r is string => !!r),
  ));
  let company: PermissionMap;
  if (globalIds.length === 0) {
    company = memberDefault();
  } else {
    company = fill('None');
    for (const id of globalIds) {
      const m = levelsFor(id);
      for (const c of CATEGORIES) company[c] = maxLevel(company[c], m[c]);
    }
  }

  // 3) No job, or not on this job specifically.
  const pid = input.projectId;
  if (pid == null) return company;
  const jobRows = input.assignments.filter((a) => a.project_id === pid);
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

/**
 * Resolve a user's effective permission map for a tenant, optionally within a
 * project — see resolvePermissions for the order.
 */
export async function getEffectivePermissions(
  db: ServerDb,
  userId: string,
  tenantId: string,
  projectId?: string | null,
): Promise<PermissionMap> {
  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  const baseRole = (profile?.role || '').toLowerCase();
  if (ADMIN_ROLES.has(baseRole)) return adminAll();

  /* select('*'): the per-job `permissions` column arrives with 20261017h. Naming
     it before that migration is applied would fail the whole read and drop
     every user to the member default. */
  const { data: assignments } = await db
    .from('user_role_assignments')
    .select('*')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);

  const rows = (assignments ?? []) as AssignmentRow[];
  const applicable = rows.filter(
    (a) => a.project_id == null || (projectId != null && a.project_id === projectId),
  );
  const roleIds = Array.from(new Set(applicable.map((a) => a.role_id).filter((r): r is string => !!r)));

  const roles = new Map<string, unknown>();
  if (roleIds.length > 0) {
    const { data: roleDefs } = await db
      .from('role_definitions')
      .select('id, permissions')
      .eq('tenant_id', tenantId)
      .in('id', roleIds);
    for (const rd of roleDefs ?? []) roles.set(rd.id, rd.permissions);
  }

  return resolvePermissions({ baseRole, assignments: applicable, roles, projectId });
}

/**
 * The jobs this person has been shut out of: a job role on which Projects is
 * None ("No access", or a role that grants nothing there). Project lists drop
 * them, so a job you cannot open does not sit in your picker. Admins and
 * owners: none.
 */
export async function jobsClosedTo(db: ServerDb, userId: string, tenantId: string): Promise<Set<string>> {
  const closed = new Set<string>();
  const { data: profile } = await db.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (ADMIN_ROLES.has((profile?.role || '').toLowerCase())) return closed;

  const { data: assignments, error } = await db
    .from('user_role_assignments')
    .select('*')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);
  if (error) throw error;
  const rows = (assignments ?? []) as AssignmentRow[];
  const jobIds = Array.from(new Set(rows.map((a) => a.project_id).filter((p): p is string => !!p)));
  if (jobIds.length === 0) return closed;

  const roleIds = Array.from(new Set(rows.map((a) => a.role_id).filter((r): r is string => !!r)));
  const roles = new Map<string, unknown>();
  if (roleIds.length > 0) {
    const { data: roleDefs, error: rErr } = await db
      .from('role_definitions').select('id, permissions').eq('tenant_id', tenantId).in('id', roleIds);
    if (rErr) throw rErr;
    for (const rd of roleDefs ?? []) roles.set(rd.id, rd.permissions);
  }
  for (const pid of jobIds) {
    const m = resolvePermissions({ baseRole: profile?.role, assignments: rows, roles, projectId: pid });
    if (m['Projects'] === 'None') closed.add(pid);
  }
  return closed;
}

/** True if `perms` grants at least `minLevel` on `category`. */
export function hasPermission(
  perms: PermissionMap,
  category: PermCategory,
  minLevel: PermLevel,
): boolean {
  const have = perms[category] ?? 'None';
  return LEVEL_RANK[have] >= LEVEL_RANK[minLevel];
}

/** True if `perms` grants at least `minLevel` on ANY of `categories`. */
export function hasAnyPermission(
  perms: PermissionMap,
  categories: readonly PermCategory[],
  minLevel: PermLevel,
): boolean {
  return categories.some((c) => hasPermission(perms, c, minLevel));
}

/**
 * Proposal and bid dollars, and e-sign signer details (names, emails, IPs):
 * visible to a role with Sales OR Budget, and nobody else (owner decision,
 * 16 Oct 2026). The database applies the same rule in role_gate_*_proposals,
 * _proposal_lines, _proposal_signatures, _proposal_signature_events, _bids and
 * _bid_submissions (20261017c).
 */
export const PROPOSAL_MONEY: readonly PermCategory[] = ['Sales', 'Budget'];

/**
 * Pay rates on resource planning (resource_assignments.hourly_rate /
 * cost_rate): Budget or Admin view. Labor cost is job cost.
 */
export const RATE_VIEW: readonly PermCategory[] = ['Budget', 'Admin'];

export type AuthedUser = { id: string; tenantId: string; email: string };

export type PermissionGuard =
  | { ok: true; user: AuthedUser; perms: PermissionMap; db: ServerDb }
  | { ok: false; res: NextResponse };

/**
 * Route ergonomic gate. Resolves the caller, loads their effective permissions,
 * and either lets the route proceed or hands back a ready-to-return response.
 *
 *   const g = await requirePermission(req, 'Admin', 'Full');
 *   if (!g.ok) return g.res;
 *   // ... g.user is the authenticated user, g.perms the effective map
 *
 * opts.projectId names the job (its job role applies there); left out, the
 * guard finds it in the request (lib/permission-scope); null means
 * company-wide. opts.db reuses an existing service client.
 */
export async function requirePermission(
  req: NextRequest,
  category: PermCategory,
  minLevel: PermLevel,
  opts?: { projectId?: string | null; db?: ServerDb },
): Promise<PermissionGuard> {
  return requireAnyPermission(req, [category], minLevel, opts);
}

/**
 * requirePermission for a rule that more than one category satisfies — e.g.
 * PROPOSAL_MONEY (Sales OR Budget). Same tenant check, same 401/403/404.
 */
export async function requireAnyPermission(
  req: NextRequest,
  categories: readonly PermCategory[],
  minLevel: PermLevel,
  opts?: { projectId?: string | null; db?: ServerDb },
): Promise<PermissionGuard> {
  const category = categories.join(' or ');
  const user = await getUser(req);
  if (!user) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const db = opts?.db ?? createServerClient();

  /* ⚠️ PERMISSION IS NOT ISOLATION.
   *
   * `projectId` arrives from the request — a query string or a URL segment —
   * and getEffectivePermissions() below uses it only to decide WHICH role
   * grants apply. It never asked whose project it was. A GLOBAL grant
   * (project_id IS NULL) always applies, and a user with no assignments at all
   * falls to memberDefault(), which is View on every operational category.
   *
   * So any signed-in user could pass ANOTHER TENANT'S project id, clear this
   * gate, and have the route read that job. /api/photos did exactly that and
   * handed back signed URLs to another company's site photos. Measured on
   * production 24 Sep 2026: one role assignment exists across the whole
   * platform, so effectively every user was on memberDefault().
   *
   * The guard answers "may this person do this?". It could not answer "is this
   * row theirs?" — only a tenant filter does that, and it belongs HERE rather
   * than in each of the 25 routes that pass a projectId, because one of them
   * will always be forgotten.
   *
   * 404, not 403: a project in another tenant should be indistinguishable from
   * one that does not exist, or the response confirms which ids are real.
   */
  /* Which job. A route that names one (or names null: company-wide on
     purpose) is taken at its word; otherwise the request itself says — the
     /api/projects/<id> URL, the record in the URL, ?projectId=, or the body
     (lib/permission-scope). That is how every project-scoped route gets the
     job role without each one remembering to pass it. */
  const projectId = opts?.projectId !== undefined
    ? opts.projectId
    : await projectIdForRequest(req, db, user.tenantId);

  if (projectId) {
    const { data: owned, error } = await db
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (error || !owned) {
      return {
        ok: false,
        res: NextResponse.json({ error: 'Project not found' }, { status: 404 }),
      };
    }
  }

  const perms = await getEffectivePermissions(db, user.id, user.tenantId, projectId);

  if (!hasAnyPermission(perms, categories, minLevel)) {
    return {
      ok: false,
      res: NextResponse.json(
        /* Shown to the person as-is by most screens, so it says what happened
           and who can fix it, not "Forbidden". */
        {
          error: `Your role doesn't allow this (${category}: ${minLevel === 'View' ? 'view' : 'change'}). Ask your company admin for access.`,
          reason: 'forbidden',
          detail: `Requires ${category} ≥ ${minLevel}`,
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user, perms, db };
}
