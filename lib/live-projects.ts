import { liveJobs, isLiveJob } from '@/lib/live-jobs';

/**
 * Same rule as lib/live-jobs (this file delegates to it).
 * Live jobs — one rule for every job list, count and rollup.
 *
 * A job is live unless it was archived (projects.is_archived, set with
 * archived_at by DELETE /api/projects/[id]) or deleted (is_deleted /
 * deleted_at). Legacy rows carry NULL flags, so NULL counts as live and only
 * an explicit `true` hides the row. Only an explicit archive view reads
 * archived jobs; every other list, picker, count and rollup goes through here.
 */

type ProjectFlags = Parameters<typeof isLiveJob>[0];

/** The columns isLiveProject reads — add them to a select that filters in memory. */
export const LIVE_PROJECT_COLUMNS = 'is_archived, archived_at, is_deleted, deleted_at';

/** In-memory form of the rule, for rows that were already read. */
export function isLiveProject(p: ProjectFlags): boolean {
  return isLiveJob(p);
}

/**
 * Narrows a `from('projects')` query to live jobs. Works on any PostgREST
 * filter builder (select, count/head). Returns the same builder type.
 */
export function onlyLiveProjects<Q>(query: Q): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return liveJobs(query as any) as Q;
}

/**
 * Ids of this tenant's archived or deleted jobs, for rollups over child
 * tables (bid packages, takeoffs, leads) that must not count a hidden job's
 * rows. Throws on a read error so a rollup never silently includes them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function hiddenProjectIds(db: any, tenantId: string): Promise<Set<string>> {
  const { data, error } = await db
    .from('projects')
    .select('id')
    .eq('tenant_id', tenantId)
    .or('is_archived.eq.true,archived_at.not.is.null,is_deleted.eq.true,deleted_at.not.is.null');
  if (error) throw error;
  return new Set(((data || []) as { id: string }[]).map((r) => r.id));
}
