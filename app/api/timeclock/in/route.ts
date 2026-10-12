import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import {
  SHIFT_COLUMNS,
  findOpenShift,
  gpsPayload,
  listOpenShifts,
  recordPunch,
  resolveEmployee,
  resolveCreatedBy,
  resolveProjectId,
  resolveTimezone,
  toShift,
  workDateFor,
  type ShiftRow,
  punchTime,
} from '@/lib/timeclock/server';
import { must } from '@/lib/db-write';
import { TIME_ZONE_HEADER } from '@/lib/time-zone';

/**
 * POST /api/timeclock/in
 * body { projectId?, costCodeId?, csiDivision?, lat?, lng?, address?, clientTime? }
 *  → { ok: true, shift, alreadyOpen }
 *
 * IDEMPOTENT BY DESIGN. If the server already holds an open shift for this
 * employee it returns THAT shift with alreadyOpen:true and HTTP 200 — it does
 * not open a second one. Production has two shifts opened five seconds apart
 * for the same person because a double-tapped button had no guard; this is the
 * guard, and it lives on the server where a flaky network can't skip it.
 *
 * The clock_in timestamp is the SERVER's. clientTime is kept as telemetry on
 * the GPS blob only — a device clock can never be allowed to set a paycheck.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const db = g.db, t = g.user.tenantId;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const employee = await resolveEmployee(db, g.user);

    // 1) SERVER-SIDE open-shift check — the dupe guard.
    const existing = await findOpenShift(db, t, employee.id);
    if (existing) {
      // No new punch: nothing happened. Writing a second 'in' here is exactly
      // how the audit trail filled with unpaired punches.
      return NextResponse.json({ ok: true, shift: toShift(existing), alreadyOpen: true });
    }

    // 2) time_entries.project_id is NOT NULL — a shift must land on a project.
    const projectId = await resolveProjectId(db, t, body.projectId);
    if (!projectId) {
      return NextResponse.json(
        {
          ok: false,
          error: body.projectId
            ? 'That project was not found for your company'
            : 'No project to clock in to — create a project first',
        },
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();
    // A punch kept on the phone with no signal lands at the moment it was tapped.
    const { at: punchedAt, savedOffline } = punchTime(req.headers, nowIso);
    const timezone = await resolveTimezone(db, t, employee.id, (body as { timezone?: unknown }).timezone, req.headers.get(TIME_ZONE_HEADER));
    const csiDivision = typeof body.csiDivision === 'string' && body.csiDivision.trim() ? body.csiDivision.trim() : null;
    const costCodeId = typeof body.costCodeId === 'string' && body.costCodeId.trim() ? body.costCodeId.trim() : null;

    const { data: inserted, error: insErr } = await db
      .from('time_entries')
      .insert({
        tenant_id: t,
        employee_id: employee.id,
        project_id: projectId,
        work_date: workDateFor(punchedAt, timezone),
        clock_in: punchedAt,
        clock_out: null,
        status: 'clocked_in',
        entry_type: 'regular',
        timezone,
        cost_code_id: costCodeId,
        csi_division: csiDivision,
        cost_code_description: csiDivision ? CSI_DIVISIONS[csiDivision]?.name ?? null : null,
        gps_clock_in: gpsPayload(body.lat, body.lng, body.address, body.clientTime, nowIso, savedOffline),
        created_by: await resolveCreatedBy(db, g.user.id),
      } as never)
      .select(SHIFT_COLUMNS)
      .single();
    if (insErr || !inserted) throw insErr ?? new Error('clock-in insert returned no row');

    let shiftRow = inserted as ShiftRow;

    // 3) Race reconciliation. Two requests in flight at once can both pass the
    //    check above. Whoever's clock_in is EARLIEST wins; any extra row this
    //    request created is removed, so the invariant "at most one open shift
    //    per employee" holds even under a double-tap on a slow connection.
    const openNow = await listOpenShifts(db, t, employee.id);
    if (openNow.length > 1) {
      const winner = openNow[0];
      if (winner.id !== shiftRow.id) {
        await must(db.from('time_entries').delete().eq('tenant_id', t).eq('id', shiftRow.id).is('clock_out', null), 'time_entries delete');
        return NextResponse.json({ ok: true, shift: toShift(winner), alreadyOpen: true });
      }
      for (const dupe of openNow.slice(1)) {
        await must(db.from('time_entries').delete().eq('tenant_id', t).eq('id', dupe.id).is('clock_out', null), 'time_entries delete');
      }
      shiftRow = winner;
    }

    // 4) Audit trail — same instant as time_entries.clock_in. Best effort.
    await recordPunch(db, {
      tenantId: t,
      projectId,
      employeeName: employee.name,
      punchType: 'in',
      punchedAt,
      lat: body.lat as number | null | undefined,
      lng: body.lng as number | null | undefined,
      address: body.address as string | null | undefined,
    });

    return NextResponse.json({ ok: true, shift: toShift(shiftRow), alreadyOpen: false }, { status: 201 });
  } catch (err) {
    console.error('[timeclock/in]', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'Could not clock you in' }, { status: 500 });
  }
}
