/**
 * lib/hidden-projects.ts — the jobs a company-wide money list leaves out.
 *
 * An archived or deleted job (is_archived / archived_at / is_deleted /
 * deleted_at on projects) stays in the database for its history, but its
 * invoices and payrolls must not land in the company's lists and totals: the
 * 22 archived "ZZ AUDIT" test jobs were adding a $5,000 draft to Invoicing's
 * Total Billed. A screen that shows one job (projectId given) or an explicit
 * archive view does not use this.
 *
 * Legacy rows carry NULL flags, so only an explicit true / a set timestamp
 * hides a job — the same rule as /api/projects and /api/projects/list.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type ProjectFlags = {
  id: string;
  is_archived: boolean | null;
  archived_at: string | null;
  is_deleted: boolean | null;
  deleted_at: string | null;
};

export function isHiddenProject(p: Omit<ProjectFlags, 'id'>): boolean {
  return p.is_archived === true || p.is_deleted === true || !!p.archived_at || !!p.deleted_at;
}

/** Ids of the tenant's archived or deleted jobs. Throws on a failed read, so a
 *  caller never mistakes "could not check" for "nothing hidden". */
export async function hiddenProjectIds(db: SupabaseClient<any>, tenantId: string): Promise<Set<string>> {
  const { data, error } = await db
    .from('projects')
    .select('id, is_archived, archived_at, is_deleted, deleted_at')
    .eq('tenant_id', tenantId)
    .or('is_archived.eq.true,is_deleted.eq.true,archived_at.not.is.null,deleted_at.not.is.null');
  if (error) throw error;
  return new Set(((data || []) as ProjectFlags[]).filter(isHiddenProject).map((p) => p.id));
}
