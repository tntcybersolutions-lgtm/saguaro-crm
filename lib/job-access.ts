/**
 * Job roles — the vocabulary shared by the job Team screen, the company Access
 * screen and /api/projects/[projectId]/access. A leaf (no server imports), so
 * client components can read it.
 *
 * A job role is a user_role_assignments row with project_id set:
 *   role       role_id set, no levels        → that role on this job
 *   none       no role, every category None   → no access on this job
 *   custom     anything else (levels on top)  → shown as "Custom"
 * No row at all = "company": the company role applies on this job.
 */
import { CATEGORIES, type PermCategory, type PermLevel } from './permission-categories';

export type JobAccessMode = 'company' | 'role' | 'none' | 'custom';

export type JobAccess = { mode: JobAccessMode; roleId: string | null; label: string };

export type JobAccessPerson = {
  userId: string;
  name: string;
  email: string;
  isAdmin: boolean;
  companyRole: string;
  job: JobAccess;
  effective: Record<PermCategory, PermLevel>;
};

/** Every category None — what "No access" stores. */
export const NO_ACCESS_LEVELS: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c, 'None']));

function isNoAccess(levels: unknown): boolean {
  if (!levels || typeof levels !== 'object' || Array.isArray(levels)) return false;
  const l = levels as Record<string, unknown>;
  return CATEGORIES.every((c) => l[c] === 'None');
}

/** What a person's job row means, for display. */
export function describeJobRow(
  row: { role_id: string | null; permissions?: unknown } | null | undefined,
  roleName: ReadonlyMap<string, string>,
): JobAccess {
  if (!row) return { mode: 'company', roleId: null, label: 'Company role' };
  const levels = row.permissions;
  const hasLevels = !!levels && typeof levels === 'object' && !Array.isArray(levels) && Object.keys(levels as object).length > 0;
  if (!row.role_id && isNoAccess(levels)) return { mode: 'none', roleId: null, label: 'No access' };
  if (row.role_id && !hasLevels) return { mode: 'role', roleId: row.role_id, label: roleName.get(row.role_id) ?? 'Removed role' };
  return { mode: 'custom', roleId: row.role_id, label: row.role_id ? `${roleName.get(row.role_id) ?? 'Role'} (custom)` : 'Custom' };
}

/** The select's value for a person: 'company', 'none', a role id, or 'custom'. */
export function jobAccessValue(job: JobAccess): string {
  if (job.mode === 'role' && job.roleId) return job.roleId;
  return job.mode;
}
