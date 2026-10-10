/**
 * Time zones — each company works in its own.
 *
 * A contractor in Iowa lives in America/Chicago: "today", a bid due date, the
 * day a COI lapses and the window a sub's clock punches pair in are all
 * Chicago days for them. Nothing here assumes a home zone.
 *
 * Whose zone, in order:
 *   1. the device making the request — the browser sends its IANA zone in the
 *      x-time-zone header (deviceTimeZone() on the client; the person is where
 *      their phone is);
 *   2. the company's zone — tenants.time_zone, recorded from the owner's device
 *      the first time it is missing and editable in Settings;
 *   3. UTC — only when neither is known (a background job for a company that
 *      has never signed in). Callers that land here log it; it is never a
 *      silent stand-in for a real place.
 *
 * Pure helpers (no I/O) first; companyTimeZone() reads the database.
 */

/** The request header a browser carries its IANA time zone in. */
export const TIME_ZONE_HEADER = 'x-time-zone';

/** True for a real IANA zone name this runtime knows (e.g. 'America/Chicago'). */
export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false; // RangeError: not a zone
  }
}

/** This device's zone (browser), or null when the runtime can't say. */
export function deviceTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isTimeZone(tz) ? tz : null;
  } catch {
    return null;
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Wall-clock parts of an instant in a zone. */
function wallParts(timeZone: string, at: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? NaN);
  return { y: n('year'), m: n('month'), d: n('day'), h: n('hour') % 24, mi: n('minute'), s: n('second') };
}

/** The zone's offset from UTC at an instant, in ms (Chicago in winter: -6 h). */
export function zoneOffsetMs(timeZone: string, at: Date): number {
  const w = wallParts(timeZone, at);
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** 'YYYY-MM-DD' — the calendar day it is in `timeZone` at `now`. */
export function dayIn(timeZone: string, now: Date = new Date()): string {
  const w = wallParts(timeZone, now);
  return `${w.y}-${pad2(w.m)}-${pad2(w.d)}`;
}

/** The UTC instant of local midnight starting `day` ('YYYY-MM-DD') in `timeZone`. */
export function startOfDayIn(timeZone: string, day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // Two passes settle the offset across a DST change at or near midnight.
  let t = guess - zoneOffsetMs(timeZone, new Date(guess));
  t = guess - zoneOffsetMs(timeZone, new Date(t));
  return new Date(t);
}

/**
 * [from, to) of a calendar day in a zone, as UTC instants — for "today's
 * punches", "logged today", etc. 23 or 25 hours long on DST change days.
 */
export function dayRangeIn(timeZone: string, day: string): { from: Date; to: Date } {
  const [y, m, d] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { from: startOfDayIn(timeZone, day), to: startOfDayIn(timeZone, next) };
}

/**
 * The instant a date-only deadline ends: the last moment of `day` in the zone
 * (a bid due Oct 20 is open through 11:59:59 PM Oct 20 where the GC is).
 */
export function endOfDayIn(timeZone: string, day: string): Date {
  return new Date(dayRangeIn(timeZone, day).to.getTime() - 1);
}

type Db = { from: (t: string) => any };

/** The company's recorded zone, or null when it has none yet (or it isn't a real zone). */
export async function companyTimeZone(db: Db, tenantId: string): Promise<string | null> {
  const { data, error } = await db.from('tenants').select('time_zone').eq('id', tenantId).maybeSingle();
  if (error) throw error;
  const tz = (data as { time_zone?: string | null } | null)?.time_zone ?? null;
  return isTimeZone(tz) ? tz : null;
}

/**
 * The zone to compute "today" in for a request: the device's (header), else the
 * company's, else UTC — and `source` says which, so a caller can log a UTC
 * answer. `headers` is anything with get() (Request/NextRequest headers).
 */
export async function requestTimeZone(
  headers: { get(name: string): string | null } | null | undefined,
  db: Db,
  tenantId: string | null | undefined,
): Promise<{ zone: string; source: 'device' | 'company' | 'utc' }> {
  const claimed = headers?.get(TIME_ZONE_HEADER) ?? null;
  if (isTimeZone(claimed)) return { zone: claimed, source: 'device' };
  if (tenantId) {
    const company = await companyTimeZone(db, tenantId);
    if (company) return { zone: company, source: 'company' };
  }
  return { zone: 'UTC', source: 'utc' };
}
