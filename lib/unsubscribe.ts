/* Email unsubscribe.
 *
 * The link in every outgoing email carries an HMAC token minted for that exact
 * recipient (see lib/email.ts). The token IS the credential — following it
 * proves control of the mailbox — so /api/unsubscribe needs no session.
 *
 * The previous implementation upserted into a table called `email_unsubscribes`
 * that does not exist in the database, then tried to read the recipient's email
 * back out of the row it had just written without an email in it. Every call
 * failed, and the footer link carried no token at all, so nothing could ever be
 * unsubscribed — a CAN-SPAM problem as much as a bug.
 */

export const UNSUBSCRIBE_PURPOSE = 'unsubscribe';

/** Every notification category stored on profiles.email_notifications. */
export const NOTIFICATION_TYPES = [
  'rfi_assigned',
  'rfi_answered',
  'rfi_overdue',
  'submittal_assigned',
  'submittal_approved',
  'change_order_submitted',
  'lien_waiver_request',
  'budget_alert',
  'safety_incident',
  'marketing',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(v: unknown): v is NotificationType {
  return typeof v === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(v);
}

/** All categories off — a full unsubscribe. */
export function allNotificationsOff(): Record<NotificationType, boolean> {
  return Object.fromEntries(
    NOTIFICATION_TYPES.map((t) => [t, false]),
  ) as Record<NotificationType, boolean>;
}

/**
 * Merges a single category off into whatever the profile already has, so
 * unsubscribing from marketing does not silently clear the rest.
 */
export function withCategoryOff(
  existing: unknown,
  type: NotificationType,
): Record<string, boolean> {
  const base: Record<string, boolean> =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, boolean>) }
      : allNotificationsOn();
  base[type] = false;
  return base;
}

/** Defaults for a profile that has never had preferences written. */
export function allNotificationsOn(): Record<NotificationType, boolean> {
  return Object.fromEntries(
    NOTIFICATION_TYPES.map((t) => [t, true]),
  ) as Record<NotificationType, boolean>;
}
