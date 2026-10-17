/**
 * lib/timeclock/server.ts
 * SERVER-SIDE timeclock spine. Every clock surface — web /app/time, the field
 * clock, the iOS app, the geofence auto-punch — goes through these helpers so
 * the answer to "am I on the clock?" is computed in exactly one place.
 *
 * WHY THIS EXISTS: four surfaces used to clock in against three different
 * tables with three different notions of state, and one of them kept its state
 * in localStorage. Production ended up with five consecutive 'out' punches with
 * no 'in' between them, an 'in' whose 'out' landed thirteen days later, and two
 * shifts opened five seconds apart for the same employee. The rules below are
 * the fix:
 *
 *   • time_entries is CANONICAL. Open-shift detection is ALWAYS a server query.
 *   • clock_punches is the AUDIT TRAIL (the geofence map reads it). Best-effort:
 *     a failed audit write never fails the clock action.
 *   • timesheet_entries is NOT a clock table. Nothing here touches it.
 *   • employee_id is NEVER null. Un-resolvable employees are created honestly.
 *
 * Server only — imports the service-role client type. Never import from a
 * client component.
 */
import { SAVED_AT_HEADER } from '@/lib/offline/saved-at';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../database.types';
import {
  dayKey,
  shiftWorkedHours,
  splitDailyHours,
  type HoursSplit,
} from './index';
import { companyTimeZone, isTimeZone } from '../time-zone';
import { liveJobs } from '@/lib/live-jobs';

export type TimeclockDb = SupabaseClient<Database>;

/** The caller, as `requirePermission` / `getUser` hand them over. */
export interface TimeclockUser { id: string; tenantId: string; email: string }

/** An employees row resolved (or created) for a caller. employee_id is never null. */
export interface ResolvedEmployee {
  id: string;
  name: string;
  tenantId: string;
  /** True when this call had to create the employees row (first ever clock event). */
  created: boolean;
}

/** The wire shape every timeclock endpoint returns for a shift. */
export interface Shift {
  id: string;
  projectId: string | null;
  workDate: string;
  clockIn: string | null;
  clockOut: string | null;
  status: string | null;
  timezone: string | null;
  costCodeId: string | null;
  csiDivision: string | null;
  hoursWorked: number;
  mealBreakMins: number;
}

/** Exactly the time_entries columns a shift needs. One list, used by every query. */
export const SHIFT_COLUMNS =
  'id, project_id, work_date, clock_in, clock_out, status, timezone, cost_code_id, csi_division, hours_worked, meal_break_mins, entry_type, total_hours, employee_id, tenant_id';

/** A time_entries row as selected through SHIFT_COLUMNS. */
export interface ShiftRow {
  id: string;
  project_id: string | null;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: string | null;
  timezone: string | null;
  cost_code_id: string | null;
  csi_division: string | null;
  hours_worked: number | null;
  meal_break_mins: number | null;
  entry_type: string | null;
  total_hours: number | null;
  employee_id: string;
  tenant_id: string;
}

/** Map a canonical time_entries row onto the wire Shift. */
export function toShift(row: ShiftRow): Shift {
  return {
    id: row.id,
    projectId: row.project_id,
    workDate: row.work_date,
    clockIn: row.clock_in,
    clockOut: row.clock_out,
    status: row.status,
    timezone: row.timezone,
    costCodeId: row.cost_code_id,
    csiDivision: row.csi_division,
    hoursWorked: Number(row.hours_worked ?? 0) || 0,
    mealBreakMins: Number(row.meal_break_mins ?? 0) || 0,
  };
}

/* ── employee resolution ─────────────────────────────────────────────────── */

/**
 * The person's name for a new employees row: profile full_name first, then the
 * email local part. Returns an empty last name rather than a placeholder.
 * Exported so every place that creates an employee from a login names it the
 * same way.
 */
export async function realNameFor(
  db: TimeclockDb,
  user: { id: string },
  email: string,
): Promise<{ first: string; last: string }> {
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const { data: prof } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const profName = String((prof as { full_name?: string | null } | null)?.full_name ?? '').trim();
  if (profName && profName.toLowerCase() !== email.toLowerCase()) {
    const words = profName.split(/\s+/).filter(Boolean).map(cap);
    return { first: words[0], last: words.slice(1).join(' ') };
  }
  const local = (email.split('@')[0] || 'team').trim();
  const parts = local.split(/[._+-]+/).filter(Boolean).map(cap);
  return { first: parts[0] || 'Team', last: parts.slice(1).join(' ') };
}


const EMPLOYEE_COLUMNS = 'id, tenant_id, full_name, first_name, last_name, email';

interface EmployeeLookupRow {
  id: string;
  tenant_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

function displayName(row: EmployeeLookupRow, fallback: string): string {
  const joined = [row.first_name, row.last_name].filter((p) => p && p !== '—').join(' ').trim();
  return (joined || row.full_name || row.email || fallback).trim() || fallback;
}

/**
 * Resolve the caller to an employees row for their tenant.
 *
 * Order: user_id link column (only if the live schema carries one) → email →
 * full_name. If nothing matches, the row is CREATED. A clock event is never
 * written with a null employee_id — that is precisely what orphaned the June
 * rows nobody can attribute or pay.
 *
 * Every lookup is tenant-scoped; two tenants may legitimately employ the same
 * email address and must never collide.
 */
export async function resolveEmployee(
  db: TimeclockDb,
  user: TimeclockUser,
): Promise<ResolvedEmployee> {
  const tenantId = user.tenantId;
  const email = (user.email || '').trim();
  const fallbackName = email || 'Team member';

  // 1) user_id link. The generated types predate this column and the live
  //    schema may not have it at all, so the column name is cast and a
  //    PostgREST "column does not exist" (42703) is treated as "no link
  //    column here" rather than an error.
  const byUser = await db
    .from('employees')
    .select(EMPLOYEE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('user_id' as never, user.id)
    .limit(1);
  if (!byUser.error) {
    const hit = (byUser.data as EmployeeLookupRow[] | null)?.[0];
    if (hit) return { id: hit.id, name: displayName(hit, fallbackName), tenantId, created: false };
  } else if (byUser.error.code !== '42703') {
    throw byUser.error;
  }

  // 2) email
  if (email) {
    const { data, error } = await db
      .from('employees')
      .select(EMPLOYEE_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('email', email)
      .limit(1);
    if (error) throw error;
    const hit = (data as EmployeeLookupRow[] | null)?.[0];
    if (hit) return { id: hit.id, name: displayName(hit, fallbackName), tenantId, created: false };
  }

  // 3) full_name
  if (email) {
    const { data, error } = await db
      .from('employees')
      .select(EMPLOYEE_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('full_name', email)
      .limit(1);
    if (error) throw error;
    const hit = (data as EmployeeLookupRow[] | null)?.[0];
    if (hit) return { id: hit.id, name: displayName(hit, fallbackName), tenantId, created: false };
  }

  // 4) Create honestly, with the person's REAL name. Their login profile
  //    carries the name they signed up with — use it. Only when the profile
  //    has none is the email local part split (jane.doe@ → Jane Doe). The
  //    surname is left EMPTY when unknown: an em-dash placeholder used to sit
  //    here and printed "Avery —" on every roster, schedule and timesheet,
  //    because full_name is generated as first || ' ' || last.
  const { first, last } = await realNameFor(db, user, email);
  const { data: created, error: insErr } = await db
    .from('employees')
    .insert({
      tenant_id: tenantId,
      email: email || null,
      first_name: first,
      last_name: last,
      is_active: true,
    } as never)
    .select(EMPLOYEE_COLUMNS)
    .single();
  if (insErr || !created) {
    // Losing an insert race to a parallel clock-in is fine — re-read and use
    // the row the other request created rather than failing the punch.
    if (email) {
      const { data: raced } = await db
        .from('employees')
        .select(EMPLOYEE_COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('email', email)
        .limit(1);
      const hit = (raced as EmployeeLookupRow[] | null)?.[0];
      if (hit) return { id: hit.id, name: displayName(hit, fallbackName), tenantId, created: false };
    }
    throw insErr ?? new Error('Could not resolve an employee record for this account');
  }
  const row = created as EmployeeLookupRow;
  return { id: row.id, name: displayName(row, fallbackName), tenantId, created: true };
}

/* ── open-shift detection ────────────────────────────────────────────────── */

/**
 * THE definition of "on the clock": a canonical time_entries row for this
 * employee with a clock_in and no clock_out. Newest first, tenant-scoped.
 * No client-supplied state ever substitutes for this query.
 */
export async function findOpenShift(
  db: TimeclockDb,
  tenantId: string,
  employeeId: string,
): Promise<ShiftRow | null> {
  const { data, error } = await db
    .from('time_entries')
    .select(SHIFT_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('employee_id', employeeId)
    .not('clock_in', 'is', null)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1);
  if (error) throw error;
  return ((data as ShiftRow[] | null) || [])[0] ?? null;
}

/** Every open shift for an employee, OLDEST first — the dupe-race reconciler. */
export async function listOpenShifts(
  db: TimeclockDb,
  tenantId: string,
  employeeId: string,
): Promise<ShiftRow[]> {
  const { data, error } = await db
    .from('time_entries')
    .select(SHIFT_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('employee_id', employeeId)
    .not('clock_in', 'is', null)
    .is('clock_out', null)
    .order('clock_in', { ascending: true });
  if (error) throw error;
  return (data as ShiftRow[] | null) || [];
}

/* ── hours ───────────────────────────────────────────────────────────────── */

/**
 * Split a shift's worked hours into regular / overtime / doubletime.
 * Thin re-export of the shared engine so routes never do the math themselves.
 */
export function splitHours(workedHours: number): HoursSplit {
  return splitDailyHours(workedHours);
}

/** Worked hours for a shift from its stored timestamps — server truth, 2dp. */
export function workedHoursFor(clockIn: string, clockOut: string, mealBreakMins = 0): number {
  return shiftWorkedHours(clockIn, clockOut, mealBreakMins);
}

/* ── context resolution ──────────────────────────────────────────────────── */

/**
 * IANA timezone for a new shift. The server process runs in UTC, so guessing
 * from the server clock would mis-bucket every crew's day. Preference order:
 * caller-supplied (body) → the device's zone (the x-time-zone header every app
 * call carries) → the company's zone (tenants.time_zone) → this employee's most
 * recent entry → this tenant's most recent entry → UTC (honest "we don't know"
 * rather than a fabricated zone).
 */
export async function resolveTimezone(
  db: TimeclockDb,
  tenantId: string,
  employeeId: string,
  requested?: unknown,
  deviceZone?: string | null,
): Promise<string> {
  const asked = typeof requested === 'string' ? requested.trim() : '';
  if (asked && isValidTimezone(asked)) return asked;
  if (isTimeZone(deviceZone)) return deviceZone;
  const company = await companyTimeZone(db, tenantId);
  if (company) return company;

  const { data: mine } = await db
    .from('time_entries')
    .select('timezone')
    .eq('tenant_id', tenantId)
    .eq('employee_id', employeeId)
    .not('timezone', 'is', null)
    .order('work_date', { ascending: false })
    .limit(1);
  const mineTz = ((mine as { timezone: string | null }[] | null) || [])[0]?.timezone;
  if (mineTz) return mineTz;

  const { data: theirs } = await db
    .from('time_entries')
    .select('timezone')
    .eq('tenant_id', tenantId)
    .not('timezone', 'is', null)
    .order('work_date', { ascending: false })
    .limit(1);
  const tenantTz = ((theirs as { timezone: string | null }[] | null) || [])[0]?.timezone;
  return tenantTz || 'UTC';
}

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * time_entries.project_id is NOT NULL, so a clock-in must land on a project.
 * Uses the requested project when it belongs to the tenant; otherwise falls
 * back to the tenant's most recently touched project. Archived and deleted
 * jobs take no time (lib/live-jobs). Returns null when the
 * tenant has no live projects at all — the caller turns that into an honest 400
 * rather than inventing a placeholder project.
 */
export async function resolveProjectId(
  db: TimeclockDb,
  tenantId: string,
  requested?: unknown,
): Promise<string | null> {
  const asked = typeof requested === 'string' ? requested.trim() : '';
  if (asked) {
    const { data } = await liveJobs(db
      .from('projects')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', asked))
      .limit(1);
    const hit = ((data as { id: string }[] | null) || [])[0];
    if (hit) return hit.id;
    return null; // named a project that isn't theirs — say so, don't silently swap
  }
  const { data } = await liveJobs(db
    .from('projects')
    .select('id')
    .eq('tenant_id', tenantId))
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1);
  return ((data as { id: string }[] | null) || [])[0]?.id ?? null;
}

/**
 * time_entries.created_by carries a FOREIGN KEY to profiles.id, so stamping it
 * blindly turns "this account has no profiles row" into a hard clock-in
 * failure. getUser() already tolerates profile-less accounts (it falls back to
 * the auth id for the tenant), so they genuinely exist. Provenance is a
 * nice-to-have; being able to clock in is not. Returns the id only when the
 * profile is really there, otherwise null.
 */
export async function resolveCreatedBy(db: TimeclockDb, userId: string): Promise<string | null> {
  try {
    const { data } = await db.from('profiles').select('id').eq('id', userId).maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}

/* ── audit trail ─────────────────────────────────────────────────────────── */

export interface PunchInput {
  tenantId: string;
  projectId: string | null;
  employeeName: string;
  punchType: 'in' | 'out';
  /** MUST be the same instant written to time_entries.clock_in / clock_out. */
  punchedAt: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}

/**
 * Best-effort clock_punches audit row. The geofence map reads this table, so
 * every clock action mirrors into it — but a failed audit insert NEVER fails
 * the clock action. It logs and moves on; the canonical row is already safe in
 * time_entries.
 */
export async function recordPunch(db: TimeclockDb, p: PunchInput): Promise<boolean> {
  try {
    const { error } = await db.from('clock_punches').insert({
      tenant_id: p.tenantId,
      project_id: p.projectId,
      employee_name: p.employeeName,
      punch_type: p.punchType,
      punched_at: p.punchedAt,
      location_lat: numOrNull(p.lat),
      location_lng: numOrNull(p.lng),
      location_address: typeof p.address === 'string' && p.address.trim() ? p.address.trim() : null,
    } as never);
    if (error) {
      console.error('[timeclock] audit punch failed (clock action stands):', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[timeclock] audit punch threw (clock action stands):', e instanceof Error ? e.message : e);
    return false;
  }
}

/* ── small shared utilities ──────────────────────────────────────────────── */

export function numOrNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Non-negative finite minutes, or null when the caller sent nothing usable. */
export function minutesOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  return n === null || n < 0 ? null : Math.round(n);
}

/**
 * The GPS/context blob stored on gps_clock_in / gps_clock_out.
 * `client_time` is recorded as TELEMETRY ONLY — hours are always computed from
 * the server timestamps, so a wrong or hostile device clock can never inflate
 * a paycheck.
 */
export function gpsPayload(
  lat: unknown,
  lng: unknown,
  address: unknown,
  clientTime: unknown,
  serverTime: string,
  savedOffline = false,
): Json {
  const payload: Record<string, Json> = { source: 'api', server_time: serverTime };
  // Kept on the phone with no signal and sent later: server_time is when it ARRIVED.
  if (savedOffline) { payload.saved_offline = true; payload.sent_at = serverTime; }
  const la = numOrNull(lat);
  const ln = numOrNull(lng);
  if (la !== null) payload.lat = la;
  if (ln !== null) payload.lng = ln;
  if (typeof address === 'string' && address.trim()) payload.address = address.trim();
  if (typeof clientTime === 'string' && clientTime.trim()) {
    payload.client_time = clientTime.trim();
    const skewMs = new Date(clientTime).getTime() - new Date(serverTime).getTime();
    if (Number.isFinite(skewMs)) payload.client_skew_secs = Math.round(skewMs / 1000);
  }
  return payload as Json;
}

/** How far back a punch kept on the phone may land — a weekend with no signal. */
const SAVED_PUNCH_MAX_AGE_MS = 72 * 3600 * 1000;

/**
 * When a punch happened. Normally the server's clock — a worker can't pick their
 * own time. The one exception is a punch kept on the phone with no signal
 * (lib/offline/outbox): stamping it with the moment it finally SENT would cost
 * the crew the hours they worked out of range. Its tap time is used only when it
 * is in the past and no older than 72 hours, and the row says so
 * (saved_offline + sent_at in its gps payload) so a reviewer sees it was sent late.
 */
export function punchTime(headers: Headers, nowIso: string): { at: string; savedOffline: boolean } {
  const raw = headers.get(SAVED_AT_HEADER);
  const t = raw ? new Date(raw).getTime() : NaN;
  const now = new Date(nowIso).getTime();
  if (!Number.isFinite(t) || t > now + 60_000 || now - t > SAVED_PUNCH_MAX_AGE_MS) return { at: nowIso, savedOffline: false };
  return { at: new Date(Math.min(t, now)).toISOString(), savedOffline: true };
}

/** work_date for an instant, bucketed in the shift's own timezone. */
export function workDateFor(iso: string, timezone: string): string {
  return dayKey(iso, timezone);
}
