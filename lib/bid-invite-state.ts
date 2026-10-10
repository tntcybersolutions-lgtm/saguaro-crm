/**
 * The state of one bid invitation, read the same way by the server and the
 * GC's package page. Pure and client-safe.
 *
 * bid_package_invites carries two status columns. The portal writes
 * `response_status` when a bidder opens their link ('viewed'); the GC's page
 * read `status`, so a GC never once saw "Viewed". Read response_status first,
 * then status — and 'revoked' on either wins, because a cut-off link is cut off
 * whatever the bidder had done before.
 */

export type InviteState = 'suggested' | 'invited' | 'viewed' | 'submitted' | 'declined' | 'revoked';

const STATES: InviteState[] = ['suggested', 'invited', 'viewed', 'submitted', 'declined', 'revoked'];

type InviteRow = {
  status?: string | null;
  response_status?: string | null;
  invited_at?: string | null;
  sub_email?: string | null;
};

export function inviteState(inv: InviteRow | null | undefined): InviteState {
  const s = String(inv?.status ?? '').toLowerCase().trim();
  const r = String(inv?.response_status ?? '').toLowerCase().trim();
  if (s === 'revoked' || r === 'revoked' || s === 'withdrawn' || r === 'withdrawn') return 'revoked';
  const v = (r || s) as InviteState;
  return STATES.includes(v) ? v : 'invited';
}

/** Still in the running: invited and not yet answered either way. */
export function isPending(inv: InviteRow | null | undefined): boolean {
  const st = inviteState(inv);
  return st === 'invited' || st === 'viewed';
}

/**
 * Has this bidder been sent the jacket as issued?
 *
 * invited_at is stamped only when the jacket email actually leaves
 * (onSubInvitedToBid), so a delivered send at or after the issue time means
 * they hold the issued jacket — and are not emailed it again. Addenda reach
 * every holder by their own email and do not move the issue time.
 */
export function holdsIssuedJacket(inv: InviteRow | null | undefined, issuedAt: string | null | undefined): boolean {
  if (!inv || !issuedAt || inviteState(inv) === 'revoked') return false;
  const sent = inv.invited_at ? Date.parse(inv.invited_at) : NaN;
  const at = Date.parse(issuedAt);
  return Number.isFinite(sent) && Number.isFinite(at) && sent >= at;
}

export type LastEmail = { status?: string | null; error?: string | null; created_at?: string | null } | null | undefined;

export type JacketDelivery = {
  state: 'emailed' | 'failed' | 'not_emailed';
  at: string | null;
  error: string | null;
};

/**
 * What the GC's invite table says about the invitation email: when it went,
 * or that it did not (and why, from the communications record).
 */
export function jacketDelivery(
  inv: InviteRow | null | undefined,
  issuedAt: string | null | undefined,
  lastEmail?: LastEmail,
): JacketDelivery {
  const sentAt = inv?.invited_at || null;
  const emailed = issuedAt ? holdsIssuedJacket(inv, issuedAt) : !!sentAt;
  if (emailed) return { state: 'emailed', at: sentAt, error: null };
  const st = String(lastEmail?.status ?? '').toLowerCase();
  if (st === 'failed' || st === 'not_sent') {
    return { state: 'failed', at: lastEmail?.created_at ?? null, error: lastEmail?.error || 'The email was not delivered.' };
  }
  return { state: 'not_emailed', at: null, error: null };
}

/**
 * The update for re-inviting someone who is already on the package.
 *
 * Re-inviting used to upsert status and response_status back to 'invited',
 * which wiped a bid already in ('submitted') or a decline. Contact details are
 * refreshed; the answer is never touched. Only a revoked or merely suggested
 * invite becomes 'invited' again — that is the GC deliberately (re)opening it.
 */
export function reinvitePatch(
  existing: InviteRow & { sub_id?: string | null },
  input: { subId?: string | null; name?: string | null; company?: string | null; contactName?: string | null; phone?: string | null },
): { patch: Record<string, unknown>; restored: boolean } {
  const patch: Record<string, unknown> = {};
  if (input.subId && !existing.sub_id) patch.sub_id = input.subId;
  if (input.company || input.name) patch.company_name = input.company || input.name;
  if (input.contactName || input.name) patch.contact_name = input.contactName || input.name;
  if (input.phone) patch.contact_phone = input.phone;
  const st = inviteState(existing);
  const restored = st === 'revoked' || st === 'suggested';
  if (restored) {
    patch.status = 'invited';
    patch.response_status = 'invited';
  }
  return { patch, restored };
}
