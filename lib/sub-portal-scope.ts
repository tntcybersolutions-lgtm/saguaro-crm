/**
 * Who a sub portal session can read and file as — including a session opened
 * from an email-only invite.
 *
 * /api/portal/sub/create files the session with sub_id = null when the invited
 * email is not on the GC's subcontractor roster. The company, contact and email
 * then live on the session row itself (sub_company / sub_contact_name / sub_email).
 *
 * The sub-owned portal tables (portal_sub_rfis, _daily_logs, _pay_apps, _tasks,
 * _messages, _scorecards, _compliance_docs) identify a sub ONLY by sub_id. None
 * has a session or email column. Every one of their queries used to send
 * `sub_id=eq.null`, which Postgres rejects as an invalid uuid, so every section
 * of an email-only portal errored. For such a session:
 *
 *   • Reads return empty — there is no roster sub for a record to belong to.
 *     Reading "rows where sub_id is null" instead would show one email-only sub
 *     another's RFIs, logs and invoices on the same job.
 *   • Writes are refused with a plain reason. An insert with sub_id null could
 *     never be read back by this sub, would mix with every other email-only
 *     sub's rows, and would skip the invoice compliance gate.
 *
 * Project-wide sections (documents, drawings, punch, radio, clock, end-of-day
 * media, bid invites by email, history) never needed a roster sub. Where one of
 * them needs a per-person uuid, portalMemberId() gives the roster sub or else
 * the session itself — the same fallback lib/sub-media uses for upload paths.
 *
 * Nothing here widens access: every scope is still the session's own tenant,
 * and its own project wherever the table is project-scoped.
 */

export interface PortalSessionLike {
  id: string;
  tenant_id: string;
  project_id?: string | null;
  sub_id?: string | null;
  sub_company?: string | null;
  sub_contact_name?: string | null;
}

/** The roster subcontractor behind this session, or null for an email-only invite. */
export function rosterSubId(s: Pick<PortalSessionLike, 'sub_id'>): string | null {
  const v = typeof s.sub_id === 'string' ? s.sub_id.trim() : '';
  return v || null;
}

/** The session's job, or null when the link is not tied to one. */
export function sessionProjectId(s: Pick<PortalSessionLike, 'project_id'>): string | null {
  const v = typeof s.project_id === 'string' ? s.project_id.trim() : '';
  return v || null;
}

/** The uuid this portal user is known by in project-wide tables (radio membership, receipts). */
export function portalMemberId(s: Pick<PortalSessionLike, 'id' | 'sub_id'>): string {
  return rosterSubId(s) ?? s.id;
}

/**
 * Scope for a sub-owned, project-scoped table, or null when the session has no
 * roster sub (or no job) — the caller then answers with an empty list.
 */
export function subRecordScope(s: PortalSessionLike): { tenantId: string; projectId: string; subId: string } | null {
  const subId = rosterSubId(s);
  const projectId = sessionProjectId(s);
  if (!subId || !projectId) return null;
  return { tenantId: s.tenant_id, projectId, subId };
}

export const NOT_ON_ROSTER = 'not_on_roster';

/**
 * The refusal an email-only portal gets when it tries to file something that
 * has to belong to a roster sub. 403: the link is valid, it just cannot do this.
 */
export function notOnRoster(
  s: Pick<PortalSessionLike, 'sub_company' | 'sub_contact_name'>,
  what: string,
): { status: 403; body: { error: string; code: typeof NOT_ON_ROSTER } } {
  const who = (s.sub_company || s.sub_contact_name || '').trim() || 'Your company';
  return {
    status: 403,
    body: {
      error: `${who} isn’t on this contractor’s subcontractor list yet, so ${what} can’t be filed from this link. Ask them to add you as a subcontractor and send you a new portal link.`,
      code: NOT_ON_ROSTER,
    },
  };
}
