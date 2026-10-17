/**
 * Which job is this request about?
 *
 * Permissions are per job (lib/permissions resolvePermissions: the job role
 * replaces the company role on that job). requirePermission asks this module
 * when a route did not pass a projectId, so every project-scoped route gets the
 * job role from ONE place instead of each route remembering to pass it — the
 * forgotten route is the one that leaks.
 *
 * Looked for in this order, first hit wins:
 *   1. the URL  /api/projects/<uuid>/...
 *   2. the record in the URL  /api/<tool>/<uuid>/...  → that row's project_id
 *      (tenant-filtered; RECORD_TABLES below). Ahead of the query and body on
 *      purpose: a record's job is a fact, a ?projectId= is a claim — otherwise
 *      a job role on job B would open job A's RFI with ?projectId=B.
 *   3. the query string  ?projectId= / ?project_id=
 *   4. the body  { project_id } / { projectId }  (JSON or form posts)
 *
 * Only real UUIDs count. A route that passes `projectId: null` explicitly
 * (a company-wide list) opts out and gets the company role.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/**
 * /api/<segment>/<id> → the table whose row <id> is. Every table here has
 * tenant_id and a uuid project_id (checked against the live schema, 16 Oct 2026).
 */
export const RECORD_TABLES: Readonly<Record<string, string>> = {
  rfis: 'rfis',
  submittals: 'submittals',
  'change-orders': 'change_orders',
  'daily-logs': 'daily_logs',
  'pay-apps': 'pay_applications',
  photos: 'photos',
  drawings: 'drawings',
  'punch-list': 'punch_list',
  budgets: 'budgets',
  bills: 'bills',
  invoices: 'invoices',
  contracts: 'contracts',
  'purchase-orders': 'purchase_orders',
  inspections: 'inspections',
  'bid-packages': 'bid_packages',
  'lien-waivers': 'lien_waivers',
  permits: 'permits',
  files: 'project_files',
  proposals: 'proposals',
  'warranty-claims': 'warranty_claims',
  selections: 'selections',
  'service-tickets': 'service_tickets',
  todos: 'project_todos',
  schedule: 'schedule_tasks',
  meetings: 'meetings',
  'safety/incidents': 'safety_incidents',
};

function segments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

/** /api/projects/<uuid>/… → the uuid. */
export function projectIdFromPath(pathname: string): string | null {
  const s = segments(pathname);
  if (s[0] !== 'api' || s[1] !== 'projects') return null;
  return isUuid(s[2]) ? s[2] : null;
}

/** ?projectId= / ?project_id= when it is a uuid. */
export function projectIdFromQuery(params: URLSearchParams): string | null {
  for (const k of ['projectId', 'project_id']) {
    const v = params.get(k);
    if (isUuid(v)) return v;
  }
  return null;
}

/** /api/<tool>/<uuid>/… (or /api/safety/incidents/<uuid>) → { table, id }. */
export function recordRefFromPath(pathname: string): { table: string; id: string } | null {
  const s = segments(pathname);
  if (s[0] !== 'api') return null;
  for (const depth of [2, 1]) {
    const key = s.slice(1, 1 + depth).join('/');
    const id = s[1 + depth];
    if (RECORD_TABLES[key] && isUuid(id)) return { table: RECORD_TABLES[key], id };
  }
  return null;
}

/** project_id / projectId from a JSON object. */
export function projectIdFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  for (const k of ['project_id', 'projectId']) if (isUuid(b[k])) return b[k] as string;
  return null;
}

/** Reads a copy of the body, so the route can still read the original. */
async function bodyProjectId(req: Request): Promise<string | null> {
  if (req.method === 'GET' || req.method === 'HEAD' || !req.body) return null;
  const type = (req.headers.get('content-type') || '').toLowerCase();
  try {
    if (type.includes('application/json')) {
      return projectIdFromBody(await req.clone().json());
    }
    if (type.includes('multipart/form-data') || type.includes('application/x-www-form-urlencoded')) {
      const form = await req.clone().formData();
      for (const k of ['project_id', 'projectId']) {
        const v = form.get(k);
        if (isUuid(v)) return v;
      }
    }
  } catch (e) {
    /* A body that is not what its header says, or one the route already read,
       has no job to offer. The route's own parse reports the bad body. */
    void e;
  }
  return null;
}

/** The job this request is about, or null for a company-wide request. */
export async function projectIdForRequest(
  req: Request,
  db: SupabaseClient<Database>,
  tenantId: string,
): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(req.url);
  } catch (e) {
    void e; // a request without a URL (a hand-built test stub) has no job in it
    return null;
  }

  const fromPath = projectIdFromPath(url.pathname);
  if (fromPath) return fromPath;

  const ref = recordRefFromPath(url.pathname);
  if (ref) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from(ref.table)
      .select('project_id')
      .eq('id', ref.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) console.error('[permission-scope] record lookup', ref.table, error.message);
    const pid = (data as { project_id?: unknown } | null)?.project_id;
    if (isUuid(pid)) return pid;
  }

  const fromQuery = projectIdFromQuery(url.searchParams);
  if (fromQuery) return fromQuery;

  return bodyProjectId(req);
}
