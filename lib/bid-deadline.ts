/**
 * When a bid package stops taking bids, and whether it is taking them at all.
 *
 * The due date is a DAY. bid_packages.due_date is a DATE column, and every
 * screen shows bid_due_date (timestamptz) cut to its first ten characters, so a
 * GC who picks "Oct 20" means "bids are due on Oct 20". Three routes compared
 *
 *   new Date('2026-10-20').getTime() < Date.now()
 *
 * which is midnight UTC — the afternoon or evening BEFORE the due day in every
 * US zone (5 PM in Phoenix, 7 PM in Iowa) — and stayed shut through the whole
 * of the due day itself. Here the due day is read as a day and bidding stays
 * open until the last moment of that day IN THE GC COMPANY'S OWN TIME ZONE
 * (tenants.time_zone, lib/time-zone): a contractor in Iowa closes at midnight
 * Central, one in Phoenix at midnight Arizona. The deadline is the GC's, so a
 * bidder's device zone never moves it.
 *
 * The day is the one at the front of `bid_due_date || due_date` — the same day
 * every screen displays, so what the GC typed, what the invite says and when
 * the portal closes are one answer.
 *
 * Pure except deadlineZone(), which reads the company's zone.
 */
import { daysUntilDay, toDay } from '@/lib/calendar-day';
import { companyTimeZone, dayIn, endOfDayIn, isTimeZone, TIME_ZONE_HEADER } from '@/lib/time-zone';

type DueFields = { bid_due_date?: unknown; due_date?: unknown } | null | undefined;

/** 'YYYY-MM-DD' bids are due on — bid_due_date, else due_date — or null when neither is a real day. */
export function bidDueDay(p: DueFields): string | null {
  return toDay(p?.bid_due_date) ?? toDay(p?.due_date) ?? null;
}

/** The last instant bids are taken: the end of the due day in `timeZone`. null with no due day. */
export function bidDeadline(p: DueFields, timeZone: string): Date | null {
  const day = bidDueDay(p);
  return day ? endOfDayIn(timeZone, day) : null;
}

/**
 * True once the due day is over in `timeZone` — open all through the due day,
 * closed from midnight that night. A package with no due day never closes on
 * the calendar (the GC closes it).
 */
export function biddingClosed(p: DueFields, timeZone: string, now: Date = new Date()): boolean {
  const end = bidDeadline(p, timeZone);
  return !!end && now.getTime() > end.getTime();
}

/** Whole days until the due day in `timeZone` (0 = due today, negative = past), or null with no due day. */
export function daysUntilBidDue(p: DueFields, timeZone: string, now: Date = new Date()): number | null {
  return daysUntilDay(bidDueDay(p), dayIn(timeZone, now));
}

/**
 * The zone a package's deadline is kept in: the GC company's (tenants.time_zone).
 * On a GC's own request, their device zone (x-time-zone) stands in when the
 * company has none recorded yet. A bidder's device never decides it. With
 * neither, UTC — logged, because it is a stand-in, not a place.
 */
export async function deadlineZone(
  db: { from: (t: string) => any },
  tenantId: string | null | undefined,
  gcHeaders?: { get(name: string): string | null } | null,
): Promise<string> {
  if (tenantId) {
    const company = await companyTimeZone(db, tenantId);
    if (company) return company;
  }
  const device = gcHeaders?.get(TIME_ZONE_HEADER) ?? null;
  if (isTimeZone(device)) return device;
  console.error(`[bid-deadline] no time zone recorded for tenant ${tenantId ?? '(none)'} — bid deadline computed in UTC`);
  return 'UTC';
}

/** The statuses a package takes bids in: 'open' (invited the old way) and 'sent' (issued). */
export const BIDDING_STATUSES = ['open', 'sent'] as const;

export function isBiddingStatus(status: unknown): boolean {
  return (BIDDING_STATUSES as readonly string[]).includes(String(status ?? '').toLowerCase().trim());
}

export type BidRefusal = { status: number; error: string; reason: 'not_issued' | 'over' | 'portal_off' | 'past_due' };

/**
 * Whether a bid may land on this package right now — the one rule the token
 * portal, the sub portal and the reminder all apply. null = yes; otherwise the
 * HTTP status and the sentence the bidder is shown.
 *
 *   not issued yet  draft / pending — the GC is still assembling the jacket
 *   over            closed / awarded / cancelled / anything not open or sent
 *   switched off    sub_portal_enabled is the GC's kill switch for the package
 *   past due        the due day is over in the GC company's zone
 */
export function bidRefusal(
  p: DueFields & { status?: unknown; sub_portal_enabled?: unknown },
  timeZone: string,
  now: Date = new Date(),
): BidRefusal | null {
  const status = String(p?.status ?? 'draft').toLowerCase().trim() || 'draft';
  if (status === 'draft' || status === 'pending') {
    return { status: 409, reason: 'not_issued', error: 'This bid package has not been issued yet. The general contractor will send it when the documents are ready.' };
  }
  if (!isBiddingStatus(status)) {
    return { status: 409, reason: 'over', error: 'Bidding for this package has closed.' };
  }
  if (p?.sub_portal_enabled !== true) {
    return { status: 409, reason: 'portal_off', error: 'This bid package is not accepting bids online. Contact the general contractor.' };
  }
  if (biddingClosed(p, timeZone, now)) {
    return { status: 409, reason: 'past_due', error: 'Bidding for this package has closed.' };
  }
  return null;
}
