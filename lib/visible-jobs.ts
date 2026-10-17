/**
 * Visible jobs — the server half of lib/live-jobs, for one person.
 *
 * lib/live-jobs answers "which jobs are on the books" (archived and deleted
 * jobs are off every list). This answers "which of them may THIS person see":
 * the same set minus the jobs closed to them (lib/permissions jobsClosedTo —
 * a "No access" job row, or, for a job-scoped Subcontractor, every job they
 * are not on). Kept apart from live-jobs only because that file is imported
 * by client pages and this one reads permissions with the service client.
 *
 * The server database client already removes closed jobs' rows from every
 * read (lib/viewer-scope), so a route that forgets this still cannot leak. A
 * company-wide list, search, rollup or feed that builds its answer from
 * something the database layer cannot see — an RPC, a cached rollup, rows
 * merged in memory from several sources — uses these:
 *
 *   const off = await jobsOffFor(db, user);
 *   rows = dropRowsOnJobs(rows, off);              // rows in hand
 *   q = notOnJobs(q, off);                         // a count or head query
 */
import { hiddenJobIds, dropHiddenJobRows, notOnHiddenJobs } from './live-jobs';
import { jobsClosedTo } from './permissions';
import * as supabaseServer from './supabase-server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = { from: (table: string) => any };

/** Archived or deleted jobs, plus every job closed to this person. */
export async function jobsOffFor(db: AnyDb, user: { id: string; tenantId: string }): Promise<Set<string>> {
  const mod = supabaseServer as unknown as { createUnscopedServerClient?: () => AnyDb };
  const guard = mod.createUnscopedServerClient ? mod.createUnscopedServerClient() : db;
  const [hidden, closed] = await Promise.all([
    hiddenJobIds(db, user.tenantId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jobsClosedTo(guard as any, user.id, user.tenantId),
  ]);
  closed.forEach((id) => hidden.add(id));
  return hidden;
}

/** Keep rows on visible jobs and rows on no job. */
export function dropRowsOnJobs<R extends { project_id?: string | null }>(rows: R[], off: Set<string>): R[] {
  return dropHiddenJobRows(rows, off);
}

/** The same rule inside a query (counts, head requests). */
export function notOnJobs<Q extends { or(filters: string): Q }>(q: Q, off: Set<string>): Q {
  return notOnHiddenJobs(q, off);
}

/** Is this job visible to the person (given jobsOffFor)? */
export function jobIsVisible(projectId: string | null | undefined, off: Set<string>): boolean {
  return !projectId || !off.has(projectId);
}
