/**
 * Calendar days — for DATE columns such as a COI's expiry_date.
 *
 * A 'YYYY-MM-DD' value is a day, not an instant. new Date('2026-10-10') is
 * midnight UTC, which is 5 PM on Oct 9 in Phoenix, so a check written as
 *
 *   new Date(expiry_date).getTime() > Date.now()
 *
 * called a certificate expired from the evening BEFORE its last day and all
 * through that last day, in every US time zone — the sub portal said
 * "Expired" and the invoice gate held the sub's invoice on a day the COI was
 * still good. A date-only expiry is valid through the end of that day. These
 * helpers compare days as days ('YYYY-MM-DD' against 'YYYY-MM-DD'); there is
 * no instant and no time zone inside the comparison.
 *
 * Whose "today" is the caller's choice:
 *   • in the browser, the device's own day — localDay();
 *   • on a server, which cannot know where the sub is standing, the day the
 *     portal page says it is (it sends localDay() in the x-local-day header),
 *     taken only when it is "today" somewhere on Earth right now — so a wrong
 *     device clock or a hand-made header moves the answer by at most the width
 *     of the world's time zones, never by weeks — else the app's home zone
 *     (America/Phoenix, the fallback the rest of the app uses) — plausibleToday().
 *
 * Pure: every function takes `now` when it needs one.
 */

/** The request header a portal page carries its local calendar day in. */
export const LOCAL_DAY_HEADER = 'x-local-day';

/** The app's home zone — the same fallback lib/radio-promote DEFAULT_TZ and the home screen use. */
export const HOME_TIME_ZONE = 'America/Phoenix';

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/;
const MS_PER_DAY = 86_400_000;

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * 'YYYY-MM-DD' for a DATE value — or the date written at the front of an ISO
 * timestamp — or null for anything that is not a real calendar day.
 */
export function toDay(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = DAY_RE.exec(v.trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Days since 1970-01-01 for a valid day — exact, since Date.UTC has no DST. */
function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/**
 * Whole calendar days from `todayYmd` to `day`:
 *   0  — `day` is today (an expiry today is still good today),
 *   1  — tomorrow,
 *  -1  — yesterday (an expiry yesterday has lapsed).
 * null when either value is not a real day.
 */
export function daysUntilDay(day: unknown, todayYmd: unknown): number | null {
  const a = toDay(day);
  const t = toDay(todayYmd);
  if (!a || !t) return null;
  return dayNumber(a) - dayNumber(t);
}

/**
 * True once `day` is over — today is a later day. A date-only expiry is valid
 * through the end of its own day, so this is false on the day itself. False
 * for a missing or unreadable day (there is nothing to be past).
 */
export function isPastDay(day: unknown, todayYmd: unknown): boolean {
  const n = daysUntilDay(day, todayYmd);
  return n !== null && n < 0;
}

/** Today on this device's clock, in its own time zone (the sub's own day, in a browser). */
export function localDay(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Today in an IANA time zone, e.g. dayInZone('America/Phoenix'). */
export function dayInZone(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * The earliest and latest calendar day it is anywhere on Earth at `now`
 * (UTC−12 on Baker Island through UTC+14 on Kiritimati).
 */
export function daysOnEarth(now: Date = new Date()): { earliest: string; latest: string } {
  const at = (offsetHours: number) => new Date(now.getTime() + offsetHours * 3_600_000).toISOString().slice(0, 10);
  return { earliest: at(-12), latest: at(14) };
}

/**
 * "Today" for a server deciding a date-only expiry for someone it cannot
 * locate. `claimed` is the day their device says it is (the x-local-day
 * header); it is used when it is exactly 'YYYY-MM-DD', a real day, and today
 * somewhere on Earth at `now`. Otherwise: today in `fallbackZone`.
 */
export function plausibleToday(claimed: unknown, now: Date = new Date(), fallbackZone: string = HOME_TIME_ZONE): string {
  const raw = typeof claimed === 'string' ? claimed.trim() : '';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? toDay(raw) : null;
  if (day) {
    const { earliest, latest } = daysOnEarth(now);
    if (day >= earliest && day <= latest) return day;
  }
  return dayInZone(fallbackZone, now);
}
