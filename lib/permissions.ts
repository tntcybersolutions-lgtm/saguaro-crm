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
import { CATEGORIES, INHERITS_WHEN_ABSENT, type PermCategory, type PermLevel } from './permission-categories';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as supabaseServer from './supabase-server';
import { getUser } from './supabase-server';
import { projectIdForRequest } from './permission-scope';
import type { Database } from './database.types';
import { apiError } from './api-error';
import {
  resolvePermissions, hasPermission, hasAnyPermission, isAdminBaseRole, isJobScoped, roleScopeOf, refusalText,
  PROPOSAL_MONEY, MONEY_VIEW, RATE_VIEW,
  type PermissionMap, type AssignmentRow,
} from './permission-resolve';

/* ── vocabulary ── the category list lives in lib/permission-categories, the
   resolver in lib/permission-resolve (a leaf, so the database layer's job and
   money scoping can use the same rule without an import cycle). ── */
export { CATEGORIES, INHERITS_WHEN_ABSENT };
export type { PermCategory, PermLevel, PermissionMap, AssignmentRow };
export { resolvePermissions, hasPermission, hasAnyPermission, PROPOSAL_MONEY, MONEY_VIEW, RATE_VIEW };

type ServerDb = SupabaseClient<Database>;

/**
 * The client the guard reads permissions with. Not the route's client: that
 * one is scoped to the jobs the person may see (lib/viewer-scope), and the
 * guard must still find a closed job and its records so it can answer 403
 * "you don't have permission" rather than 404. Test doubles that mock
 * lib/supabase-server with createServerClient alone fall back to it.
 */
function guardDb(): ServerDb {
  const mod = supabaseServer as unknown as { createUnscopedServerClient?: () => ServerDb; createServerClient: () => ServerDb };
  return (mod.createUnscopedServerClient ?? mod.createServerClient)();
}

/** The caller's client, unless it is the scoped server client — then its unscoped twin. */
function unscoped(db: ServerDb): ServerDb {
  const mod = supabaseServer as unknown as { createUnscopedServerClient?: () => ServerDb; createServerClient: () => ServerDb };
  if (!mod.createUnscopedServerClient) return db;
  try {
    return db === mod.createServerClient() ? mod.createUnscopedServerClient() : db;
  } catch (e) {
    void e;
    return db;
  }
}

/** A role_definitions row as the guard needs it (select('*'): `scope` arrives with 20261018r). */
type RoleRow = { id: string; permissions: unknown; scope?: unknown; name?: unknown; is_builtin?: unknown };

/** Job ids this person is on through the job's team, for the job-scoped rule. */
async function memberJobIds(db: ServerDb, userId: string, tenantId: string, projectId?: string | null): Promise<Set<string>> {
  const out = new Set<string>();
  for (const table of ['project_team', 'project_users'] as const) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (db as any).from(table).select('project_id').eq('tenant_id', tenantId).eq('user_id', userId);
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q;
    if (error) { console.error('[permissions] team membership', table, error.message); continue; }
    for (const r of (data || []) as Array<{ project_id: string | null }>) if (r.project_id) out.add(r.project_id);
  }
  return out;
}

/** Everything the resolver reads for one person: base role, their rows, their roles. */
async function loadGrants(db: ServerDb, userId: string, tenantId: string) {
  const { data: profile } = await db.from('profiles').select('role').eq('id', userId).maybeSingle();
  const baseRole = (profile?.role || '').toLowerCase();
  if (isAdminBaseRole(baseRole)) return { baseRole, rows: [] as AssignmentRow[], roles: new Map<string, unknown>(), scoped: new Set<string>() };

  /* select('*'): the per-job `permissions` column arrives with 20261017h and
     role scope with 20261018r. Naming either before its migration is applied
     would fail the whole read and drop every user to the member default. */
  const { data: assignments, error } = await db
    .from('user_role_assignments')
    .select('*')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);
  if (error) throw error;
  const rows = (assignments ?? []) as AssignmentRow[];

  const roleIds = Array.from(new Set(rows.map((a) => a.role_id).filter((r): r is string => !!r)));
  const roles = new Map<string, unknown>();
  const scoped = new Set<string>();
  if (roleIds.length > 0) {
    const { data: roleDefs, error: rErr } = await db
      .from('role_definitions')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('id', roleIds);
    if (rErr) throw rErr;
    for (const rd of (roleDefs ?? []) as RoleRow[]) {
      roles.set(rd.id, rd.permissions);
      if (roleScopeOf(rd) === 'assigned') scoped.add(rd.id);
    }
  }
  return { baseRole, rows, roles, scoped };
}

/**
 * Resolve a user's effective permission map for a tenant, optionally within a
 * project — see resolvePermissions (lib/permission-resolve) for the order.
 */
export async function getEffectivePermissions(
  db: ServerDb,
  userId: string,
  tenantId: string,
  projectId?: string | null,
): Promise<PermissionMap> {
  return (await getEffectiveAccess(db, userId, tenantId, projectId)).perms;
}

/** getEffectivePermissions plus whether the company role is job-scoped (Subcontractor). */
export async function getEffectiveAccess(
  db: ServerDb,
  userId: string,
  tenantId: string,
  projectId?: string | null,
): Promise<{ perms: PermissionMap; jobScoped: boolean }> {
  db = unscoped(db);
  const { baseRole, rows, roles, scoped } = await loadGrants(db, userId, tenantId);
  if (isAdminBaseRole(baseRole)) return { perms: resolvePermissions({ baseRole, assignments: [], roles }), jobScoped: false };
  const jobScoped = isJobScoped(baseRole, rows, scoped);
  const applicable = rows.filter(
    (a) => a.project_id == null || (projectId != null && a.project_id === projectId),
  );
  /* Job-scoped (Subcontractor): on a job with no job row, being on the job's
     team is what lets the company role apply there. */
  const needsTeam = !!projectId && scoped.size > 0 && !applicable.some((a) => a.project_id === projectId);
  const members = needsTeam ? await memberJobIds(db, userId, tenantId, projectId) : undefined;
  return { perms: resolvePermissions({ baseRole, assignments: applicable, roles, projectId, scopedRoleIds: scoped, memberJobIds: members }), jobScoped };
}

/**
 * The jobs this person is shut out of:
 *  - a job role on which Projects is None ("No access", or a role that grants
 *    nothing there), and
 *  - for a job-scoped company role (Subcontractor), every job they are not on.
 * Lists, search, rollups and feeds drop them (lib/live-jobs jobsOffFor; the
 * server database client applies the same set to every read, lib/viewer-scope).
 * Admins and owners: none.
 */
export async function jobsClosedTo(db: ServerDb, userId: string, tenantId: string): Promise<Set<string>> {
  db = unscoped(db); // must see every job, so never the caller's scoped client
  const closed = new Set<string>();
  const { baseRole, rows, roles, scoped } = await loadGrants(db, userId, tenantId);
  if (isAdminBaseRole(baseRole)) return closed;

  const jobScoped = isJobScoped(baseRole, rows, scoped);

  let jobIds: string[];
  let members: Set<string> | undefined;
  if (jobScoped) {
    const { data, error } = await db.from('projects').select('id').eq('tenant_id', tenantId).limit(5000);
    if (error) throw error;
    jobIds = ((data || []) as Array<{ id: string }>).map((p) => p.id);
    members = await memberJobIds(db, userId, tenantId);
  } else {
    jobIds = Array.from(new Set(rows.map((a) => a.project_id).filter((p): p is string => !!p)));
  }
  for (const pid of jobIds) {
    const m = resolvePermissions({ baseRole, assignments: rows, roles, projectId: pid, scopedRoleIds: scoped, memberJobIds: members });
    if (m['Projects'] === 'None') closed.add(pid);
  }
  return closed;
}

export type AuthedUser = { id: string; tenantId: string; email: string };

export type PermissionGuard =
  | { ok: true; user: AuthedUser; perms: PermissionMap; db: ServerDb }
  | { ok: false; res: NextResponse };

/** The 403 every guard returns: says what was refused and who can fix it. */
export function forbidden(categories: readonly PermCategory[], minLevel: PermLevel): NextResponse {
  return NextResponse.json(
    {
      error: refusalText(categories, minLevel),
      reason: 'forbidden',
      detail: `Requires ${categories.join(' or ')} ≥ ${minLevel}`,
    },
    { status: 403 },
  );
}

/**
 * opts.projectId — the job (see requirePermission); null = company-wide.
 * opts.db — handed back as g.db.
 * opts.companyWide — a company directory or company-level list (subcontractor
 *   directory, people, reports …) that is not about any one job. A job-scoped
 *   role (Subcontractor) sees only its own jobs, so it is refused these.
 */
export type GuardOpts = { projectId?: string | null; db?: ServerDb; companyWide?: boolean };

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Writes that must still reach an archived job: the job record itself (restore,
 * rename, delete) and its archive switch. Everything else on an archived job is
 * read-only (Procore: an inactive project takes no new items).
 */
function writesToArchivedJobAllowed(pathname: string): boolean {
  return /^\/api\/projects\/[0-9a-f-]{36}\/?$/i.test(pathname)
    || /\/(archive|unarchive|restore|reactivate)\/?$/i.test(pathname);
}

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
 * company-wide. opts.db is handed back as g.db for the route's own queries.
 */
export async function requirePermission(
  req: NextRequest,
  category: PermCategory,
  minLevel: PermLevel,
  opts?: GuardOpts,
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
  opts?: GuardOpts,
): Promise<PermissionGuard> {
  const user = await getUser(req);
  if (!user) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const routeDb = opts?.db ?? supabaseServer.createServerClient();
  const db = guardDb();

  /* ⚠️ PERMISSION IS NOT ISOLATION.
   *
   * `projectId` arrives from the request — a query string or a URL segment —
   * and getEffectivePermissions() uses it only to decide WHICH role grants
   * apply. Any signed-in user could pass ANOTHER TENANT'S project id, clear
   * the gate, and have the route read that job (/api/photos did, 24 Sep 2026).
   * So the tenant check lives HERE rather than in each route that passes a
   * projectId. 404, not 403: a project in another tenant is indistinguishable
   * from one that does not exist.
   *
   * Which job: a route that names one (or names null: company-wide on
   * purpose) is taken at its word; otherwise the request itself says
   * (lib/permission-scope).
   */
  const projectId = opts?.projectId !== undefined
    ? opts.projectId
    : await projectIdForRequest(req, db, user.tenantId);

  let archived = false;
  if (projectId) {
    const { data: owned, error } = await db
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (error || !owned) {
      return {
        ok: false,
        res: NextResponse.json({ error: 'Project not found' }, { status: 404 }),
      };
    }
    const flags = owned as { is_archived?: boolean | null; archived_at?: string | null; is_deleted?: boolean | null; deleted_at?: string | null };
    archived = flags.is_archived === true || !!flags.archived_at || flags.is_deleted === true || !!flags.deleted_at;
  }

  let perms: PermissionMap;
  let jobScoped = false;
  try {
    ({ perms, jobScoped } = await getEffectiveAccess(db, user.id, user.tenantId, projectId));
  } catch (e) {
    // Could not read the person's roles: refuse rather than guess (a guess was View on everything).
    return { ok: false, res: apiError('permissions', e, "Couldn't check your access just now. Try again in a moment.", 503) };
  }

  if (!hasAnyPermission(perms, categories, minLevel) || (opts?.companyWide && jobScoped)) {
    return { ok: false, res: forbidden(categories, minLevel) };
  }

  /* An archived job is read-only: a direct URL must not add a daily log to a
     job that is off the books. Adds and edits are refused; the job's own
     record (restore) is not. */
  const method = (req.method || 'GET').toUpperCase();
  if (archived && WRITE_METHODS.has(method) && method !== 'DELETE') {
    let pathname = '';
    try { pathname = new URL(req.url).pathname; } catch (e) { void e; }
    if (!writesToArchivedJobAllowed(pathname)) {
      return {
        ok: false,
        res: NextResponse.json(
          { error: 'This job is archived, so nothing new can be added to it. Restore the job first.', reason: 'archived' },
          { status: 409 },
        ),
      };
    }
  }

  return { ok: true, user, perms, db: routeDb };
}
