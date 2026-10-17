/**
 * lib/resource-assignments.ts — the page shape of a staffing assignment, and
 * who may see what a person costs.
 *
 * resource_assignments.cost_rate / hourly_rate are what a named person costs
 * per hour: job cost. The database already keeps them out of the browser
 * (20261016h: column privileges); the resource-planning routes, which use the
 * service role, handed them to every member. Now a role sees rates only with
 * Budget or Admin view (RATE_VIEW in lib/permissions), and only a role that
 * may edit Budget or Admin can set one.
 *
 * Shared by /api/projects/all/resource-planning, its [id] route and
 * /api/projects/[projectId]/resource-planning so the rule exists once.
 */
import { hasAnyPermission, RATE_VIEW, type PermissionMap } from './permissions';

export type AssignmentRow = {
  id: string;
  project_id: string | null;
  resource_type: string | null;
  resource_name: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  hours_per_day: number | null;
  cost_rate: number | null;
  hourly_rate?: number | null;
  status: string | null;
  notes: string | null;
  [k: string]: unknown;
};

/** The two rate columns, by name — never sent to a role without RATE_VIEW. */
export const RATE_COLUMNS = ['cost_rate', 'hourly_rate'] as const;

export const canSeeRates = (perms: PermissionMap) => hasAnyPermission(perms, RATE_VIEW, 'View');
export const canSetRates = (perms: PermissionMap) => hasAnyPermission(perms, RATE_VIEW, 'Edit');

/** The page's Assignment shape. hourly_rate is null when the viewer may not see rates. */
export function toPage(r: AssignmentRow, showRates: boolean) {
  return {
    id: r.id,
    person_name: r.resource_name || '',
    person_id: r.id,
    role: r.role || 'Laborer',
    trade: r.resource_type || 'General',
    certifications: [] as string[],
    start_date: r.start_date || '',
    end_date: r.end_date || '',
    hours_per_day: Number(r.hours_per_day ?? 8),
    days_per_week: 5,
    hourly_rate: showRates ? Number(r.cost_rate ?? r.hourly_rate ?? 0) : null,
    status: (r.status as string) || 'assigned',
    notes: r.notes || '',
    project_id: r.project_id || '',
  };
}

/** A raw row with the rate columns removed unless the viewer may see them. */
export function withoutRates<T extends Record<string, unknown>>(row: T, showRates: boolean): T {
  if (showRates) return row;
  const out = { ...row };
  for (const k of RATE_COLUMNS) delete out[k];
  return out;
}

/** Page body → table columns. Rate fields are dropped unless the writer may set rates. */
export function toDb(body: Record<string, unknown>, tenantId: string, setRates: boolean, opts: { insert?: boolean } = {}) {
  const row: Record<string, unknown> = {};
  if (body.person_name !== undefined) row.resource_name = body.person_name;
  if (body.resource_name !== undefined) row.resource_name = body.resource_name;
  if (body.role !== undefined) row.role = body.role;
  if (body.trade !== undefined) row.resource_type = body.trade;
  if (body.resource_type !== undefined) row.resource_type = body.resource_type;
  if (body.start_date !== undefined) row.start_date = body.start_date || null;
  if (body.end_date !== undefined) row.end_date = body.end_date || null;
  if (body.hours_per_day !== undefined) row.hours_per_day = body.hours_per_day;
  if (setRates) {
    // One figure: the page's hourly_rate is the table's cost_rate; keep both columns equal.
    const rate = body.cost_rate !== undefined ? body.cost_rate : body.hourly_rate;
    if (rate !== undefined) { row.cost_rate = rate; row.hourly_rate = rate; }
  }
  if (body.status !== undefined) row.status = body.status;
  if (body.notes !== undefined) row.notes = body.notes;
  if (body.project_id !== undefined) row.project_id = body.project_id || null;
  row.tenant_id = tenantId;
  // An edit that does not mention the trade keeps it; only a new row defaults to labor.
  if (opts.insert && row.resource_type === undefined) row.resource_type = 'labor';
  return row;
}
