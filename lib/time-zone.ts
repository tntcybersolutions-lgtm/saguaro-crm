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

/**
 * 'YYYY-MM-DD' `n` calendar days after `day` (negative: before). Calendar
 * arithmetic only — no zone and no DST inside it, so "30 days from today" is
 * computed from whoever's today the caller already chose.
 */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 'YYYY-MM-01' … the first and last day of the month `day` falls in. */
export function monthOf(day: string): { first: string; last: string } {
  const [y, m] = day.split('-').map(Number);
  return {
    first: `${y}-${pad2(m)}-01`,
    last: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
  };
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
 * "Today" for a request handler: requestTimeZone() plus the calendar day in it.
 * When neither the device nor the company says where they are, the answer is
 * the UTC day and the fallback is logged under `scope` — never a silent stand-in.
 */
export async function requestDay(
  headers: { get(name: string): string | null } | null | undefined,
  db: Db,
  tenantId: string | null | undefined,
  scope: string,
  now: Date = new Date(),
): Promise<{ today: string; zone: string; source: 'device' | 'company' | 'utc' }> {
  const tz = await requestTimeZone(headers, db, tenantId);
  if (tz.source === 'utc') console.warn(`[${scope}] no device or company time zone for tenant ${tenantId ?? '(none)'} — using the UTC day`);
  return { ...tz, today: dayIn(tz.zone, now) };
}

/**
 * "Today" for a background job (cron, trigger) working for one company: the
 * company's zone, else the UTC day — logged under `scope`.
 */
export async function companyDay(
  db: Db,
  tenantId: string,
  scope: string,
  now: Date = new Date(),
): Promise<{ today: string; zone: string; source: 'company' | 'utc' }> {
  const zone = await companyTimeZone(db, tenantId);
  if (!zone) console.warn(`[${scope}] company ${tenantId} has no time zone yet — using the UTC day`);
  return { today: dayIn(zone ?? 'UTC', now), zone: zone ?? 'UTC', source: zone ? 'company' : 'utc' };
}

/**
 * Many companies' zones in one read, for a job that walks every company's
 * rows (a cron). A company with no zone (or a junk one) is absent from the map.
 */
export async function companyTimeZones(db: Db, tenantIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(tenantIds.filter(Boolean)));
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { data, error } = await db.from('tenants').select('id, time_zone').in('id', ids);
  if (error) throw error;
  for (const r of (data ?? []) as { id: string; time_zone: string | null }[]) {
    if (isTimeZone(r.time_zone)) out.set(r.id, r.time_zone);
  }
  return out;
}

/**
 * A per-company "today" for a cron: looks each company up in `zones`
 * (companyTimeZones), falls back to the UTC day for one that has none and logs
 * that once per company under `scope`.
 */
export function companyDayLookup(zones: Map<string, string>, scope: string, now: Date = new Date()): (tenantId: string) => string {
  const memo = new Map<string, string>();
  return (tenantId: string) => {
    const hit = memo.get(tenantId);
    if (hit) return hit;
    const zone = zones.get(tenantId);
    if (!zone) console.warn(`[${scope}] company ${tenantId} has no time zone yet — using the UTC day`);
    const day = dayIn(zone ?? 'UTC', now);
    memo.set(tenantId, day);
    return day;
  };
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

/* The zone most of each US state, DC and territory keeps. States split across
   two zones take the one most of their people live in (TX → Chicago, not El
   Paso; TN → Chicago, not Knoxville). */
const ZONE_BY_STATE: Record<string, string> = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago',
  CA: 'America/Los_Angeles', CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York',
  DC: 'America/New_York', FL: 'America/New_York', GA: 'America/New_York', HI: 'Pacific/Honolulu',
  ID: 'America/Boise', IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis', IA: 'America/Chicago',
  KS: 'America/Chicago', KY: 'America/New_York', LA: 'America/Chicago', ME: 'America/New_York',
  MD: 'America/New_York', MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago',
  MS: 'America/Chicago', MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago',
  NV: 'America/Los_Angeles', NH: 'America/New_York', NJ: 'America/New_York', NM: 'America/Denver',
  NY: 'America/New_York', NC: 'America/New_York', ND: 'America/Chicago', OH: 'America/New_York',
  OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
  UT: 'America/Denver', VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles',
  WV: 'America/New_York', WI: 'America/Chicago', WY: 'America/Denver',
  PR: 'America/Puerto_Rico', GU: 'Pacific/Guam', VI: 'America/St_Thomas', AS: 'Pacific/Pago_Pago', MP: 'Pacific/Saipan',
};

const STATE_CODE_BY_NAME: Record<string, string> = {
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA', COLORADO: 'CO',
  CONNECTICUT: 'CT', DELAWARE: 'DE', 'DISTRICT OF COLUMBIA': 'DC', FLORIDA: 'FL', GEORGIA: 'GA',
  HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS', KENTUCKY: 'KY',
  LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN',
  MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND',
  OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT',
  VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV', WISCONSIN: 'WI', WYOMING: 'WY',
  'PUERTO RICO': 'PR', GUAM: 'GU', 'U.S. VIRGIN ISLANDS': 'VI', 'VIRGIN ISLANDS': 'VI',
  'AMERICAN SAMOA': 'AS', 'NORTHERN MARIANA ISLANDS': 'MP',
};

/**
 * The zone a job's state keeps ('IA' or 'Iowa' → America/Chicago), or null
 * when the state is blank or not a US state — never a guessed home zone.
 */
export function stateTimeZone(state: unknown): string | null {
  const s = String(state ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!s) return null;
  return ZONE_BY_STATE[s] ?? ZONE_BY_STATE[STATE_CODE_BY_NAME[s] ?? ''] ?? null;
}

/**
 * The zone a job's deadlines are read in: the company's own (where the GC who
 * set them works), else the job's state, else UTC — `source` says which.
 */
export async function jobTimeZone(
  db: Db,
  tenantId: string,
  jobState: unknown,
): Promise<{ zone: string; source: 'company' | 'state' | 'utc' }> {
  const company = await companyTimeZone(db, tenantId);
  if (company) return { zone: company, source: 'company' };
  const byState = stateTimeZone(jobState);
  if (byState) return { zone: byState, source: 'state' };
  return { zone: 'UTC', source: 'utc' };
}
