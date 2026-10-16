import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { dayIn, dayRangeIn, requestTimeZone } from '@/lib/time-zone';

/**
 * Saguaro sub portal — CLOCK PUNCHES.
 *
 * Before this route existed the portal's Clock In / Clock Out buttons were
 * theater: they set React state, toasted "Clocked in successfully", and stored
 * nothing. A sub who clocked in and never got around to filing a daily log left
 * no record at all.
 *
 * Subs are not `employees` rows, so their punches land in `clock_punches` — the
 * name-keyed audit trail the geofence feature and the daily-log crew count
 * already read. Payroll's `time_entries` is deliberately untouched: a portal sub
 * is not on the GC's payroll.
 *
 *   GET  ?token=  -> { onClock, lastPunch, punches } for today
 *   POST ?token=  { type: 'in'|'out', lat?, lng?, address? } -> { ok, punch, onClock }
 *
 * Server decides `onClock` from the punch trail — never the client. Clocking in
 * twice in a row is refused honestly (409) rather than writing an unpaired
 * punch, which is exactly how the pre-fix clock produced five consecutive 'out'
 * punches with no 'in' between them.
 */

async function authenticateSubPortal(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;
  const db = createServerClient() as any;
  const { data: session, error } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token).gt('expires_at', new Date().toISOString())
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return session ? { db, session } : null;
}

/** Who the punch is attributed to — the sub's company is their identity here. */
function punchName(session: any): string {
  return String(session.sub_company || session.sub_name || 'Subcontractor').slice(0, 120);
}

/* "Today" is the sub's own day where they are — the zone their phone sends,
   else their GC's company zone (lib/time-zone). This used to be the UTC day,
   so in Arizona the day rolled over at 5 PM and in Iowa at 7 PM: a sub who
   clocked in at 4 and out at 6 was told "You are not clocked in". */
async function punchesToday(db: any, session: any, req: NextRequest) {
  const { zone, source } = await requestTimeZone(req.headers, db, session.tenant_id);
  if (source === 'utc') console.warn('[portal/sub/clock] no device or company time zone; using UTC for tenant', session.tenant_id);
  const { from, to } = dayRangeIn(zone, dayIn(zone));
  const { data, error } = await db
    .from('clock_punches')
    .select('id, punch_type, punched_at, location_lat, location_lng, location_address')
    .eq('tenant_id', session.tenant_id)
    .eq('project_id', session.project_id)
    .eq('employee_name', punchName(session))
    .gte('punched_at', from.toISOString())
    .lt('punched_at', to.toISOString())
    .order('punched_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as any[];
}

/** A shift that runs past midnight still pairs: in/out goes by the last punch in the past 20 hours. */
const SHIFT_MS = 20 * 3600_000;
async function lastPunch(db: any, session: any) {
  const { data, error } = await db
    .from('clock_punches')
    .select('id, punch_type, punched_at, location_lat, location_lng, location_address')
    .eq('tenant_id', session.tenant_id)
    .eq('project_id', session.project_id)
    .eq('employee_name', punchName(session))
    .gte('punched_at', new Date(Date.now() - SHIFT_MS).toISOString())
    .order('punched_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as any;
}

export async function GET(req: NextRequest) {
  try {
    const a = await authenticateSubPortal(req);
    if (!a) return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });
    const [punches, last] = await Promise.all([punchesToday(a.db, a.session, req), lastPunch(a.db, a.session)]);
    return NextResponse.json({
      onClock: last?.punch_type === 'in',
      lastPunch: last,
      punches,
    });
  } catch (e) {
    return apiError('portal/sub/clock GET', e, 'Could not read the clock.');
  }
}

export async function POST(req: NextRequest) {
  let a: Awaited<ReturnType<typeof authenticateSubPortal>>;
  try { a = await authenticateSubPortal(req); } catch (e) { return apiError('portal/sub/clock auth', e); }
  if (!a) return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const type = body?.type === 'out' ? 'out' : body?.type === 'in' ? 'in' : null;
  if (!type) {
    return NextResponse.json({ error: "type must be 'in' or 'out'" }, { status: 400 });
  }

  try {
    // Server-side state: the last punch (this shift) decides what is legal next.
    const last = await lastPunch(a.db, a.session);
    const onClock = last?.punch_type === 'in';

    if (type === 'in' && onClock) {
      return NextResponse.json(
        { error: 'You are already clocked in', onClock: true, lastPunch: last },
        { status: 409 },
      );
    }
    if (type === 'out' && !onClock) {
      return NextResponse.json(
        { error: 'You are not clocked in', onClock: false, lastPunch: last },
        { status: 409 },
      );
    }

    const lat = Number.isFinite(Number(body?.lat)) ? Number(body.lat) : null;
    const lng = Number.isFinite(Number(body?.lng)) ? Number(body.lng) : null;

    const { data: punch, error } = await a.db
      .from('clock_punches')
      .insert({
        tenant_id: a.session.tenant_id,
        project_id: a.session.project_id,
        employee_name: punchName(a.session),
        punch_type: type,
        location_lat: lat,
        location_lng: lng,
        location_address: body?.address ? String(body.address).slice(0, 300) : null,
        punched_at: new Date().toISOString(),
      } as never)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, punch, onClock: type === 'in' }, { status: 201 });
  } catch (e) {
    return apiError('portal/sub/clock POST', e, "Couldn't record the punch — try again.");
  }
}
