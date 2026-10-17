import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import {
  SHIFT_COLUMNS,
  findOpenShift,
  gpsPayload,
  minutesOrNull,
  recordPunch,
  resolveEmployee,
  splitHours,
  toShift,
  workedHoursFor,
  type ShiftRow,
  punchTime,
} from '@/lib/timeclock/server';
import { apiError } from '@/lib/api-error';
import { readClientId } from '@/lib/offline/client-id';

/**
 * POST /api/timeclock/out
 * body { shiftId?, breakMinutes?, lat?, lng?, address?, clientTime? }
 *  → { ok: true, shift, hours: { worked, regular, overtime, doubletime } }
 *
 * NEVER RETURNS FAKE SUCCESS. The route this replaces caught its own database
 * failure and answered { success: true, demo: true } — the UI said "clocked
 * out" while nothing was written, which is how five consecutive 'out' punches
 * with no 'in' between them reached production. Here, no open shift is an
 * honest 409 and a failed write is an honest 500.
 *
 * Hours come from the shared engine, computed from the STORED clock_in and the
 * SERVER's clock_out. A client-supplied clock-in time is never used for math.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const db = g.db, t = g.user.tenantId;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const employee = await resolveEmployee(db, g.user);

    // 0) A clock-out kept on the phone and sent again: the shift this tap
    //    already closed is the answer, not an "you are not on the clock" 409.
    const clientId = readClientId(req.headers, body);
    if (clientId) {
      const { data, error } = await db.from('time_entries').select(SHIFT_COLUMNS)
        .eq('tenant_id', t).eq('employee_id', employee.id).eq('client_out_id' as never, clientId as never).limit(1);
      if (error) throw error;
      const closed = ((data as ShiftRow[] | null) || [])[0];
      if (closed) {
        return NextResponse.json({ ok: true, shift: toShift(closed), hours: splitHours(Number(closed.hours_worked ?? 0) || 0), replayed: true });
      }
    }

    // 1) Find the shift to close — server state only.
    let open: ShiftRow | null = null;
    const askedId = typeof body.shiftId === 'string' && body.shiftId.trim() ? body.shiftId.trim() : null;
    if (askedId) {
      const { data, error } = await db
        .from('time_entries')
        .select(SHIFT_COLUMNS)
        .eq('tenant_id', t)
        .eq('employee_id', employee.id)
        .eq('id', askedId)
        .is('clock_out', null)
        .not('clock_in', 'is', null)
        .limit(1);
      if (error) throw error;
      open = ((data as ShiftRow[] | null) || [])[0] ?? null;
    } else {
      open = await findOpenShift(db, t, employee.id);
    }

    if (!open || !open.clock_in) {
      return NextResponse.json({ ok: false, error: 'You are not on the clock' }, { status: 409 });
    }

    // 2) Server time closes the shift. Break minutes come from the request when
    //    supplied, otherwise whatever the shift already carried — never an
    //    invented default deduction.
    const nowIso = new Date().toISOString();
    // A punch kept on the phone lands when it was tapped — never before the shift began.
    const saved = punchTime(req.headers, nowIso);
    const punchedAt = new Date(saved.at).getTime() > new Date(open.clock_in).getTime() ? saved.at : nowIso;
    const savedOffline = saved.savedOffline && punchedAt === saved.at;
    const mealBreakMins = minutesOrNull(body.breakMinutes) ?? (Number(open.meal_break_mins ?? 0) || 0);
    const worked = workedHoursFor(open.clock_in, punchedAt, mealBreakMins);
    const hours = splitHours(worked);

    // 3) `.is('clock_out', null)` makes the close itself idempotent: a second
    //    concurrent clock-out updates zero rows and gets the honest 409 below.
    const { data: updated, error: updErr } = await db
      .from('time_entries')
      .update({
        clock_out: punchedAt,
        meal_break_mins: mealBreakMins,
        hours_worked: hours.worked,
        // total_hours is a GENERATED column in Postgres — writing it makes the
        // whole UPDATE fail with 428C9 and the shift silently stays open.
        regular_hours: hours.regular,
        overtime_hours: hours.overtime,
        doubletime_hours: hours.doubletime,
        is_overtime: hours.overtime > 0 || hours.doubletime > 0,
        status: 'pending',
        gps_clock_out: gpsPayload(body.lat, body.lng, body.address, body.clientTime, nowIso, savedOffline),
        updated_at: nowIso,
        ...(clientId ? { client_out_id: clientId } : {}),
      } as never)
      .eq('tenant_id', t)
      .eq('id', open.id)
      .is('clock_out', null)
      .select(SHIFT_COLUMNS)
      .maybeSingle();
    if (updErr) throw updErr;
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'You are not on the clock' }, { status: 409 });
    }

    // 4) Audit trail — same instant as time_entries.clock_out. Best effort.
    await recordPunch(db, {
      tenantId: t,
      projectId: open.project_id,
      employeeName: employee.name,
      punchType: 'out',
      punchedAt,
      lat: body.lat as number | null | undefined,
      lng: body.lng as number | null | undefined,
      address: body.address as string | null | undefined,
    });

    return NextResponse.json({ ok: true, shift: toShift(updated as ShiftRow), hours });
  } catch (err) {
    return apiError('timeclock/out POST', err, 'Could not clock you out', 500, { ok: false });
  }
}
