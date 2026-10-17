/**
 * Live jobs — the one rule for "which jobs show up".
 *
 * A job that is archived (is_archived = true or archived_at set) or deleted
 * (is_deleted = true or deleted_at set) is off every company-level list,
 * count, rollup and picker. Only a screen that is explicitly an archive view
 * shows them. Legacy rows carry NULL flags, so NULL counts as live.
 *
 *   liveJobs(db.from('projects').select('id, name').eq('tenant_id', t))
 *   rows.filter(isLiveJob)
 */

type Filterable<Q> = {
  or(filters: string): Q;
  is(column: string, value: null): Q;
};

/** Narrow a `projects` query to live jobs. */
export function liveJobs<Q extends Filterable<Q>>(q: Q): Q {
  return q
    .or('is_archived.is.null,is_archived.eq.false')
    .or('is_deleted.is.null,is_deleted.eq.false')
    .is('archived_at', null)
    .is('deleted_at', null);
}

/** The same rule for rows already in hand (select the four columns, or `*`). */
export function isLiveJob(p: {
  is_archived?: boolean | null; archived_at?: string | null;
  is_deleted?: boolean | null; deleted_at?: string | null;
} | null | undefined): boolean {
  if (!p) return false;
  return p.is_archived !== true && !p.archived_at && p.is_deleted !== true && !p.deleted_at;
}

/** Every live job id for a tenant — for filtering rows of another table
 *  (logs, alerts, approvals) down to the jobs still on the books. */
export async function liveJobIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { from: (table: string) => any },
  tenantId: string,
): Promise<Set<string>> {
  const { data, error } = await liveJobs(db.from('projects').select('id').eq('tenant_id', tenantId)).limit(5000);
  if (error) throw error;
  return new Set(((data || []) as Array<{ id: string }>).map((p) => p.id));
}
