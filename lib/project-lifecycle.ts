/**
 * PROJECT LIFECYCLE — closing a job out, and what stands in the way.
 *
 * The closeout screen already tracked twelve documents. What it could not do
 * was close the project: there was no API and no button, so `projects.status`
 * sat at 'active' forever and every "open projects" count in the app kept
 * counting jobs that finished last year. The columns to record it
 * (closeout_date, substantial_completion_date, final_completion_date,
 * actual_end_date, is_archived) were already on the table, unused.
 *
 * WHY THE GATE IS A WARNING, NOT A WALL:
 * Real jobs close with loose ends — a punch item the owner waived, an RFI
 * nobody will ever answer. Procore shows you what is open and lets you
 * decide. Blocking outright teaches people to lie in the fields that feed
 * the gate. So: the blockers are computed, named, counted and linked, and a
 * close that ignores them has to say so explicitly (`force`), which is
 * recorded. What is NOT negotiable is that the list is honest.
 *
 * STATUS VOCABULARIES are read off what the app actually writes, not
 * invented here:
 *   punch_list      open | in_progress | completed | voided   (page.tsx:48)
 *   rfis            open | answered | closed                  (page.tsx:580)
 *   change_orders   pending | approved | rejected             (page.tsx:339)
 *   pay_applications draft|submitted|approved|certified|paid|rejected|void…
 *   projects        active | … | completed                    (default 'active')
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Project statuses that mean the job is no longer running. Mirrors
 *  CLOSED_PROJECT in lib/suggestions.ts — keep the two in step. */
export const CLOSED_PROJECT_STATUSES = [
  'completed', 'complete', 'closed', 'cancelled', 'canceled', 'archived', 'lost',
] as const;

/** What `Close Project` writes. One value, so every reader agrees. */
export const CLOSED_STATUS = 'completed';
/** What `Reopen` writes. Matches the projects.status column default. */
export const ACTIVE_STATUS = 'active';

/** Finished, as opposed to merely stopped. A cancelled or lost job is closed
 *  but it is not complete, and a "Complete" count that includes it is lying
 *  about how much work got delivered. */
export const DONE_PROJECT_STATUSES = ['completed', 'complete', 'closed'] as const;

export const isClosedStatus = (s: unknown): boolean =>
  CLOSED_PROJECT_STATUSES.includes(String(s || '').toLowerCase() as typeof CLOSED_PROJECT_STATUSES[number]);

export const isDoneStatus = (s: unknown): boolean =>
  DONE_PROJECT_STATUSES.includes(String(s || '').toLowerCase() as typeof DONE_PROJECT_STATUSES[number]);

/** Punch items still needing work. */
/** Punch statuses that need no further work. Exported so the project API
    counts the same words this module filters on — it used to look for
    'complete' and 'closed', which the app has never written, so every
    finished punch item was counted as neither open nor complete. */
export const PUNCH_DONE = ['completed', 'voided'] as const;
/** RFIs that no longer need an answer. */
const RFI_DONE = ['answered', 'closed'];
/** Pay applications that have reached a terminal state. */
const PAY_APP_DONE = ['paid', 'rejected', 'void', 'voided', 'cancelled', 'canceled'];

/**
 * PLACEHOLDER WAIVERS. lib/compliance-autofile files one conditional waiver
 * per bid package the moment Sage builds the packages — before anyone is
 * awarded. Those rows have no sub (sub_id and subcontractor_id null) and a
 * claimant of "[Award pending] <trade> subcontractor". Nobody can sign them:
 * there is no claimant. Counting them as "unsigned lien waivers" blocked the
 * close of a job with no subs at all, while the checklist beside it said "No
 * subs on the roster", so the two halves of one screen contradicted each
 * other. They are reported separately and never as blockers.
 */
export const PLACEHOLDER_WAIVER_PREFIX = '[Award pending]';

/** Unsigned waivers that a real party could sign, plus the placeholder count.
 *  Soft-deleted rows are excluded. `error` is set if either count failed. */
export async function unsignedWaiverCounts(
  db: SupabaseClient<any>,
  tenantId: string,
  projectId: string,
): Promise<{ real: number; placeholders: number; error: unknown }> {
  const base = () =>
    db.from('lien_waivers').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('project_id', projectId)
      .is('signed_at', null).is('deleted_at', null);
  const [all, ph] = await Promise.all([
    base(),
    base().is('sub_id', null).is('subcontractor_id', null)
      .ilike('claimant_name', `${PLACEHOLDER_WAIVER_PREFIX}%`),
  ]);
  const error = all.error || ph.error || null;
  const placeholders = ph.count || 0;
  return { real: Math.max(0, (all.count || 0) - placeholders), placeholders, error };
}

export interface Blocker {
  /** Stable id so the UI can key and the API can report consistently. */
  key: string;
  /** Sentence fragment naming what is open, e.g. "3 open punch items". */
  label: string;
  count: number;
  /** Where to go and deal with it. Relative to the project. */
  href: string;
}

/**
 * Everything still open on a project, as a list a human can act on.
 *
 * Every query is tenant-scoped — `tenant_id` comes from the authenticated
 * session, never from a request body. Counts use `head: true` so none of
 * these pull rows across the wire.
 *
 * A query that FAILS is not silently treated as "nothing open". It is
 * reported as an unknown so the UI can say the gate could not be checked
 * rather than implying a clean bill of health, which is how a closeout gate
 * ends up rubber-stamping a job with forty open punch items.
 */
export async function closeoutBlockers(
  db: SupabaseClient<any>,
  tenantId: string,
  projectId: string,
): Promise<{ blockers: Blocker[]; unchecked: string[]; placeholderWaivers: number }> {
  const scope = (table: string) =>
    db.from(table).select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('project_id', projectId);

  const [punch, rfis, cos, payApps, waiverCounts] = await Promise.all([
    scope('punch_list').not('status', 'in', `(${PUNCH_DONE.join(',')})`),
    scope('rfis').not('status', 'in', `(${RFI_DONE.join(',')})`),
    scope('change_orders').eq('status', 'pending'),
    scope('pay_applications').not('status', 'in', `(${PAY_APP_DONE.join(',')})`),
    unsignedWaiverCounts(db, tenantId, projectId),
  ]);
  // Placeholder waivers (no claimant to sign them) are not blockers.
  const waivers = { count: waiverCounts.real, error: waiverCounts.error };

  const blockers: Blocker[] = [];
  const unchecked: string[] = [];
  const add = (
    res: { count: number | null; error: unknown },
    key: string,
    one: string,
    many: string,
    href: string,
  ) => {
    if (res.error) { unchecked.push(key); return; }
    const n = res.count || 0;
    if (n > 0) blockers.push({ key, count: n, label: `${n} ${n === 1 ? one : many}`, href });
  };

  add(punch, 'punch', 'open punch item', 'open punch items', 'punch-list');
  add(rfis, 'rfis', 'unanswered RFI', 'unanswered RFIs', 'rfis');
  add(cos, 'change_orders', 'undecided change order', 'undecided change orders', 'change-orders');
  add(payApps, 'pay_apps', 'unfinalized pay application', 'unfinalized pay applications', 'pay-apps');
  add(waivers, 'lien_waivers', 'unsigned lien waiver', 'unsigned lien waivers', 'lien-waivers');

  return { blockers, unchecked, placeholderWaivers: waiverCounts.error ? 0 : waiverCounts.placeholders };
}
