/**
 * Time Clock engine — deterministic, timezone-correct hours/overtime/timesheet math.
 * Shared AS-IS by web + iOS. Mirrors lib/finance / lib/takeoff / lib/bidleveling.
 *
 * Every entry stores its own IANA timezone (captured at clock-in), so days and weeks
 * bucket correctly no matter where the crew clocked in. Regular hours are computed
 * from clock_in/clock_out minus breaks; PTO/sick/holiday carry explicit hours.
 */

export type EntryType = 'regular' | 'overtime' | 'pto' | 'sick' | 'holiday' | 'vacation' | 'bereavement' | 'unpaid';

export interface TimeEntry {
  id: string;
  employeeId: string;
  projectId?: string;
  projectName?: string;
  costCode?: string;
  type: EntryType;
  clockIn?: string;   // ISO 8601 (with offset) — for 'regular'
  clockOut?: string;  // ISO 8601; absent = still open
  breakMinutes?: number;
  hours?: number;     // explicit hours for non-clock types (pto/sick/holiday…)
  timezone: string;   // IANA, e.g. 'America/Chicago' — the zone the shift was worked in
  notes?: string;
}

export interface TimeclockOptions {
  weeklyOtThreshold?: number;   // default 40
  dailyOtThreshold?: number;    // default 0 = off (set 8 for CA-style daily OT)
  roundMinutes?: number;        // round each entry to nearest N minutes (default 0 = off)
  weekStartsOn?: number;        // 0=Sun (default), 1=Mon
}

const PAID = new Set<EntryType>(['regular', 'overtime', 'pto', 'sick', 'holiday', 'vacation', 'bereavement']);
const isWorked = (t: EntryType) => t === 'regular' || t === 'overtime';

/** YYYY-MM-DD for an instant, in the given IANA timezone (deterministic). */
export function dayKey(iso: string, tz: string): string {
  const d = new Date(iso);
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const y = p.find((x) => x.type === 'year')!.value, m = p.find((x) => x.type === 'month')!.value, day = p.find((x) => x.type === 'day')!.value;
    return `${y}-${m}-${day}`;
  } catch { return iso.slice(0, 10); }
}

/**
 * Raw worked/paid hours for one entry (before OT split), or `null` when the value
 * was never recorded.
 *
 * A leave entry (pto/sick/holiday/…) carries its hours EXPLICITLY. When that field
 * is missing the hours are UNKNOWN — this used to silently return a full paid 8.00,
 * indistinguishable from a real value on a payroll screen. It now returns null so
 * callers can render "unknown" (see `fmtHoursOrUnknown`) instead of inventing a day.
 * Open worked entries (no clock-out) are a different case: 0 hours accrued so far.
 */
export function entryHoursOrNull(e: TimeEntry, roundMinutes = 0): number | null {
  let mins: number;
  if (isWorked(e.type)) {
    if (!e.clockIn || !e.clockOut) return 0;
    mins = (new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime()) / 60000 - (e.breakMinutes || 0);
    if (!(mins > 0)) return 0;
  } else {
    if (typeof e.hours !== 'number' || !Number.isFinite(e.hours)) return null; // never fabricate 8
    mins = e.hours * 60;
  }
  if (roundMinutes > 0) mins = Math.round(mins / roundMinutes) * roundMinutes;
  return Math.round((mins / 60) * 100) / 100;
}

/** True when this entry's hours are actually recorded (vs. never entered). */
export function hasRecordedHours(e: TimeEntry): boolean {
  return entryHoursOrNull(e) !== null;
}

/**
 * Raw worked/paid hours for one entry (before OT split). Open entries → 0.
 * An UNRECORDED leave entry contributes 0 to totals — nobody is paid for hours
 * that were never entered. Use `entryHoursOrNull` when you need to tell the
 * difference between a recorded 0 and an unknown value.
 */
export function entryHours(e: TimeEntry, roundMinutes = 0): number {
  return entryHoursOrNull(e, roundMinutes) ?? 0;
}

/** ISO week-start date key for grouping (in the entry's tz), honoring weekStartsOn. */
export function weekKey(iso: string, tz: string, weekStartsOn = 0): string {
  const dk = dayKey(iso, tz);            // YYYY-MM-DD in tz
  const [y, m, d] = dk.split('-').map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12)); // noon UTC avoids DST edge flips
  const dow = noon.getUTCDay();
  const back = (dow - weekStartsOn + 7) % 7;
  noon.setUTCDate(noon.getUTCDate() - back);
  return `${noon.getUTCFullYear()}-${String(noon.getUTCMonth() + 1).padStart(2, '0')}-${String(noon.getUTCDate()).padStart(2, '0')}`;
}

export interface DayRow { date: string; hours: number; worked: number; entryIds: string[] }
export interface WeekRow { weekStart: string; workedHours: number; regularHours: number; overtimeHours: number; paidHours: number; byType: Record<string, number>; byProject: Record<string, number>; days: DayRow[] }
export interface Timesheet {
  weeks: WeekRow[];
  totals: { workedHours: number; regularHours: number; overtimeHours: number; paidHours: number; byType: Record<string, number>; byProject: Record<string, number> };
  openEntries: number;
  /** Leave entries whose hours were never recorded — counted as 0, NOT as a paid 8. */
  unrecordedEntries: number;
}

const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

export function computeTimesheet(entries: TimeEntry[], opts: TimeclockOptions = {}): Timesheet {
  const wk = opts.weeklyOtThreshold ?? 40;
  const dailyOt = opts.dailyOtThreshold ?? 0;
  const round = opts.roundMinutes ?? 0;
  const wStart = opts.weekStartsOn ?? 0;

  // bucket entries → week → day
  const weeks = new Map<string, Map<string, { hours: number; worked: number; ids: string[]; byType: Record<string, number>; byProject: Record<string, number> }>>();
  let openEntries = 0;
  let unrecordedEntries = 0;
  for (const e of entries) {
    const anchor = e.clockIn || e.clockOut;
    if (isWorked(e.type) && (!e.clockIn || !e.clockOut)) { if (e.clockIn && !e.clockOut) openEntries++; if (!e.clockIn) continue; }
    if (!anchor) continue;
    const raw = entryHoursOrNull(e, round);
    if (raw === null) unrecordedEntries++;      // hours never entered — surface it, don't invent 8
    const h = raw ?? 0;
    const w = weekKey(anchor, e.timezone, wStart);
    const d = dayKey(anchor, e.timezone);
    if (!weeks.has(w)) weeks.set(w, new Map());
    const days = weeks.get(w)!;
    if (!days.has(d)) days.set(d, { hours: 0, worked: 0, ids: [], byType: {}, byProject: {} });
    const day = days.get(d)!;
    day.ids.push(e.id);
    if (PAID.has(e.type)) day.hours += h;
    if (isWorked(e.type)) day.worked += h;
    day.byType[e.type] = r2((day.byType[e.type] || 0) + h);
    const pk = e.projectName || e.projectId || 'Unassigned';
    if (isWorked(e.type)) day.byProject[pk] = r2((day.byProject[pk] || 0) + h);
  }

  const weekRows: WeekRow[] = [];
  const totals = { workedHours: 0, regularHours: 0, overtimeHours: 0, paidHours: 0, byType: {} as Record<string, number>, byProject: {} as Record<string, number> };

  for (const [weekStart, days] of [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const dayRows: DayRow[] = [];
    let workedWeek = 0, paidWeek = 0, dailyOtWeek = 0;
    const byType: Record<string, number> = {}, byProject: Record<string, number> = {};
    for (const [date, d] of [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      dayRows.push({ date, hours: r2(d.hours), worked: r2(d.worked), entryIds: d.ids });
      workedWeek += d.worked; paidWeek += d.hours;
      if (dailyOt > 0 && d.worked > dailyOt) dailyOtWeek += d.worked - dailyOt;
      for (const [k, v] of Object.entries(d.byType)) byType[k] = r2((byType[k] || 0) + v);
      for (const [k, v] of Object.entries(d.byProject)) byProject[k] = r2((byProject[k] || 0) + v);
    }
    // OT = daily OT already counted, plus weekly excess of the remaining (non-daily-OT) worked hours over the weekly threshold.
    const weeklyExcess = Math.max(0, (workedWeek - dailyOtWeek) - wk);
    const ot = r2(dailyOtWeek + weeklyExcess);
    const reg = r2(workedWeek - ot);
    weekRows.push({ weekStart, workedHours: r2(workedWeek), regularHours: reg, overtimeHours: ot, paidHours: r2(paidWeek), byType, byProject, days: dayRows });
    totals.workedHours = r2(totals.workedHours + workedWeek);
    totals.regularHours = r2(totals.regularHours + reg);
    totals.overtimeHours = r2(totals.overtimeHours + ot);
    totals.paidHours = r2(totals.paidHours + paidWeek);
    for (const [k, v] of Object.entries(byType)) totals.byType[k] = r2((totals.byType[k] || 0) + v);
    for (const [k, v] of Object.entries(byProject)) totals.byProject[k] = r2((totals.byProject[k] || 0) + v);
  }

  return { weeks: weekRows, totals, openEntries, unrecordedEntries };
}

/* ────────────────────────────────────────────────────────────────────────────
 * DAILY SHIFT SPLIT — the single source of truth for one shift's hour buckets.
 *
 * computeTimesheet() above answers "what does this WEEK owe" (weekly-40 OT,
 * optional daily OT). This answers the narrower question the clock endpoints
 * ask on every clock-out: "this one shift ran N hours — how does N divide?"
 * Both web and iOS call it so a shift never splits two different ways.
 *
 *   regular    = first 8 hours
 *   overtime   = hours 8 → 12 (capped at 4)
 *   doubletime = everything past 12
 *
 * regular + overtime + doubletime === worked, always, to 2dp.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Hours 0–8 of a shift are straight time. */
export const DAILY_REGULAR_CAP = 8;
/** Hours 8–12 are time-and-a-half; past 12 rolls into doubletime. */
export const DAILY_OVERTIME_CAP = 4;

export interface HoursSplit { worked: number; regular: number; overtime: number; doubletime: number }

/** Split one shift's worked hours into regular / overtime / doubletime. Pure. */
export function splitDailyHours(worked: number): HoursSplit {
  const w = r2(Math.max(0, Number(worked) || 0));
  const regular = r2(Math.min(w, DAILY_REGULAR_CAP));
  const overtime = r2(Math.min(Math.max(0, w - DAILY_REGULAR_CAP), DAILY_OVERTIME_CAP));
  const doubletime = r2(Math.max(0, w - DAILY_REGULAR_CAP - DAILY_OVERTIME_CAP));
  return { worked: w, regular, overtime, doubletime };
}

/**
 * Worked hours for a closed shift — (clock_out − clock_in) − meal break, 2dp.
 * Delegates to entryHours() so there is exactly ONE subtraction/rounding path
 * in the codebase; never recompute this inline in a route.
 */
export function shiftWorkedHours(clockIn: string, clockOut: string, mealBreakMins = 0): number {
  return entryHours({
    id: '', employeeId: '', type: 'regular',
    clockIn, clockOut, breakMinutes: Math.max(0, Number(mealBreakMins) || 0), timezone: 'UTC',
  });
}

/** Elapsed hours for an OPEN entry, as of `nowIso` — for a live clock readout. */
export function liveElapsed(clockIn: string, nowIso: string, breakMinutes = 0): number {
  const mins = (new Date(nowIso).getTime() - new Date(clockIn).getTime()) / 60000 - breakMinutes;
  return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
}

export const fmtHours = (h: number) => `${Math.floor(h)}h ${Math.round((h - Math.floor(h)) * 60)}m`;

/**
 * Display hours where the value may never have been recorded. An unrecorded value
 * reads "unknown" — never a fabricated 8h, never a misleading 0h.
 * Pair with `entryHoursOrNull()` / `Timesheet.unrecordedEntries`.
 */
export const fmtHoursOrUnknown = (h: number | null | undefined) =>
  (h == null || !Number.isFinite(h) ? 'unknown' : fmtHours(h));
