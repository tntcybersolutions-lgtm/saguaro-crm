/**
 * lib/sub-portal-expiry.ts — how long a subcontractor's portal link lasts.
 *
 * A portal_sub_sessions token used to work forever unless the GC revoked it.
 * It now lasts SUB_PORTAL_LINK_DAYS from the day it was issued, and the clock
 * restarts whenever the link is emailed again (a new invite, the GC's Resend,
 * or the sub asking for their links from their own inbox). Every token lookup
 * under app/api/portal/sub filters on expires_at > now — the server enforces
 * it, not the page.
 */
export const SUB_PORTAL_LINK_DAYS = 90;

/** The expiry stamped on a link issued or re-sent now. */
export function subPortalExpiry(from: Date = new Date()): string {
  return new Date(from.getTime() + SUB_PORTAL_LINK_DAYS * 86_400_000).toISOString();
}

export function isSubPortalExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t <= now.getTime();
}

/** What an expired link says — to the sub, in plain words. */
export const SUB_PORTAL_EXPIRED_MESSAGE =
  'This portal link has expired. Ask the general contractor to resend your invite — the new email has a fresh link.';
