import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { computeTimesheet, dayKey, weekKey, liveElapsed, type TimeEntry } from '@/lib/timeclock';
import { leaveHoursOf } from '@/lib/leave-entry';
import {
  SHIFT_COLUMNS,
  findOpenShift,
  resolveEmployee,
  resolveTimezone,
  toShift,
  type ShiftRow,
} from '@/lib/timeclock/server';

/**
 * GET /api/timeclock/status — "am I on the clock, and what have I logged?"
 *
 * THE SERVER ANSWERS THIS, NOT localStorage. The old field clock kept its
 * clocked-in state in the browser, so the server never knew a shift was open
 * and every surface disagreed. This route is now the only source of truth:
 *   { onClock, shift, todayHours, weekHours, employee }
 *
 * todayHours / weekHours are computed from real time_entries rows through the
 * shared engine, plus the live elapsed time of an open shift so a running
 * readout is honest rather than frozen at the last clock-out.
 *
 * Gate: Projects ≥ View — the same gate its sibling field routes use. Clocking
 * yourself in is not an Edit-level privilege; a bare crew member must be able
 * to do it.
 */
export const dynamic = 'force-dynamic';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const db = g.db, t = g.user.tenantId;

  try {
    const employee = await resolveEmployee(db, g.user);
    const open = await findOpenShift(db, t, employee.id);
    const tz = open?.timezone || (await resolveTimezone(db, t, employee.id));
    const nowIso = new Date().toISOString();

    // Two weeks of rows is enough to cover the current week in any timezone
    // and any week-start convention, without dragging the whole history.
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await db
      .from('time_entries')
      .select(SHIFT_COLUMNS)
      .eq('tenant_id', t)
      .eq('employee_id', employee.id)
      .gte('work_date', since)
      .order('work_date', { ascending: false })
      .limit(200);
    if (error) throw error;
    const rows = (data as ShiftRow[] | null) || [];

    // Rows → engine entries. Worked shifts carry timestamps; leave types carry
    // explicit hours anchored at midday so they bucket into the right day.
    const entries: TimeEntry[] = rows.map((e) => {
      const worked = !e.entry_type || e.entry_type === 'regular' || e.entry_type === 'overtime';
      const rowTz = e.timezone || tz;
      return worked
        ? {
            id: e.id,
            employeeId: employee.id,
            projectId: e.project_id ?? undefined,
            type: 'regular',
            clockIn: e.clock_in ?? undefined,
            clockOut: e.clock_out ?? undefined,
            breakMinutes: Number(e.meal_break_mins ?? 0) || 0,
            timezone: rowTz,
          }
        : {
            id: e.id,
            employeeId: employee.id,
            type: e.entry_type as TimeEntry['type'],
            // hours_worked — total_hours is generated from regular+OT and is 0 on a leave row.
            hours: leaveHoursOf(e) ?? undefined,
            timezone: rowTz,
            clockIn: `${e.work_date}T12:00:00`,
          };
    });

    const sheet = computeTimesheet(entries, { weeklyOtThreshold: 40 });
    const thisWeek = weekKey(nowIso, tz, 0);
    const today = dayKey(nowIso, tz);
    const weekRow = sheet.weeks.find((w) => w.weekStart === thisWeek) ?? null;
    const dayRow = weekRow?.days.find((d) => d.date === today) ?? null;

    // A shift still running contributes its elapsed time to both totals — the
    // engine scores open entries at 0, which is right for payroll and wrong
    // for a live clock face.
    const running = open?.clock_in
      ? liveElapsed(open.clock_in, nowIso, Number(open.meal_break_mins ?? 0) || 0)
      : 0;

    return NextResponse.json({
      onClock: !!open,
      shift: open ? toShift(open) : null,
      todayHours: r2((dayRow?.worked ?? 0) + running),
      weekHours: r2((weekRow?.workedHours ?? 0) + running),
      employee: { id: employee.id, name: employee.name },
    });
  } catch (err) {
    console.error('[timeclock/status]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not read your clock status' }, { status: 500 });
  }
}
