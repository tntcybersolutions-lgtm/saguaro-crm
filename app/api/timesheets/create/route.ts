import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import type { Database } from '@/lib/database.types';

/**
 * Timesheet / time-clock create.
 *
 * The mobile field app punches a clock-in here with { project_id, clock_in,
 * gps_clock_in } (snake_case) — see saguaro-mobile app/(tabs)/field.tsx. The
 * row must live in `time_entries`, which is the only table that has real
 * `clock_in` / `clock_out` / `gps_clock_in` / `gps_clock_out` columns and a
 * `status` lifecycle. The companion /timesheets/[id]/status route updates this
 * SAME table on clock-out. Accepts camelCase or snake_case for every field.
 */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  /* Was a 500 on a missing field — the database's rejection surfacing as an
       "Internal server error", which tells a user nothing and tells support
       nothing either. 400 naming the field, like the nineteen other create
     endpoints in this codebase. */
  if (!(body.project_id || body.projectId)) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    // time_entries.employee_id is a NOT NULL FK -> employees(id).
    let employeeId: string | null = null;

    // Web manual crew entry sends an explicit employee NAME — the entry must be
    // attributed to THAT worker, not the logged-in approver. Resolve (or create)
    // the named employee within the tenant. Previously the typed name was only
    // stuffed into work_description and the row was attributed to the auth user.
    const employeeName = (body.employee_name ?? body.employee ?? '').toString().trim();
    const tradeIn = (body.trade ?? body.classification ?? null) as string | null;

    if (employeeName) {
      const { data: byName } = await supabase
        .from('employees').select('id')
        .eq('tenant_id', user.tenantId).ilike('full_name', employeeName).limit(1);
      let matchId: string | null = byName?.[0]?.id ?? null;
      const parts = employeeName.split(/\s+/);
      const first = parts[0] || employeeName;
      const last = parts.slice(1).join(' ');
      if (!matchId && last) {
        const { data: byParts } = await supabase
          .from('employees').select('id')
          .eq('tenant_id', user.tenantId).ilike('first_name', first).ilike('last_name', last).limit(1);
        matchId = byParts?.[0]?.id ?? null;
      }
      if (!matchId) {
        const { data: newEmp, error: empErr } = await supabase
          .from('employees')
          /* employees.full_name is GENERATED ALWAYS AS (first_name || ' ' || last_name).
             Postgres rejects any write to it outright, so passing it here made
             every timesheet entry that named a NEW crew member fail with a 500. */
          .insert({ tenant_id: user.tenantId, first_name: first, last_name: last || '(crew)', trade: tradeIn })
          .select('id').single();
        if (empErr) throw empErr;
        matchId = newEmp.id;
      }
      employeeId = matchId;
    } else {
      // Mobile clock-in: the clocking user is an auth user, not necessarily an
      // employee — resolve their employees row by email (create a minimal one on
      // first clock-in). Without this the insert FK-violates and 500s.
      if (user.email) {
        const { data: emp } = await supabase
          .from('employees').select('id')
          .eq('tenant_id', user.tenantId).eq('email', user.email).limit(1).maybeSingle();
        employeeId = emp?.id ?? null;
      }
      if (!employeeId) {
        const local = (user.email || 'Field User').split('@')[0];
        const { data: newEmp, error: empErr } = await supabase
          .from('employees')
          .insert({ tenant_id: user.tenantId, first_name: local, last_name: '(field)', email: user.email ?? null })
          .select('id').single();
        if (empErr) throw empErr;
        employeeId = newEmp.id;
      }
    }

    // Accept both casings; honor whatever the caller chose.
    const projectId   = body.project_id   ?? body.projectId   ?? null;
    const clockIn     = body.clock_in     ?? body.clockIn     ?? new Date().toISOString();
    const clockOut    = body.clock_out    ?? body.clockOut    ?? null;
    const gpsClockIn  = body.gps_clock_in ?? body.gpsClockIn  ?? null;
    const gpsClockOut = body.gps_clock_out?? body.gpsClockOut ?? null;
    const workDate    = body.work_date    ?? body.workDate    ?? new Date().toISOString().split('T')[0];
    const status      = body.status       ?? 'active';
    const notes       = body.notes        ?? body.work_description ?? body.workDescription ?? null;
    const costCodeId  = body.cost_code_id ?? body.costCodeId  ?? null;

    // Real `time_entries` columns only (see _schema.txt).
    const row: Record<string, any> = {
      tenant_id:   user.tenantId,
      project_id:  projectId,
      employee_id: employeeId,
      created_by:  user.id,
      work_date:   workDate,
      clock_in:    clockIn,
      clock_out:   clockOut,
      gps_clock_in:  gpsClockIn,
      gps_clock_out: gpsClockOut,
      status,
    };
    if (notes != null)      row.work_description = notes;
    if (costCodeId != null) row.cost_code_id = costCodeId;

    // Structured labor hours from the web manual timesheet entry. Without this
    // the user's regular/OT hours were dropped and the entry reloaded at 0h.
    const regularHours  = body.regular_hours  ?? body.regularHours  ?? body.regular_hrs;
    const overtimeHours = body.overtime_hours ?? body.overtimeHours ?? body.ot_hrs;
    if (regularHours != null)  row.regular_hours  = Number(regularHours)  || 0;
    if (overtimeHours != null) row.overtime_hours = Number(overtimeHours) || 0;
    /* NOT total_hours. time_entries.total_hours is
       GENERATED ALWAYS AS (regular_hours + overtime_hours + doubletime_hours),
       so Postgres computes it and rejects any write to it. Setting it here is
       why EVERY save from the web timesheet form returned 500 — the form
       always sends hours, so it always hit this line. The column still comes
       out correct; it just has to be left alone. */
    if (tradeIn != null) row.trade = tradeIn;

    const { data, error } = await supabase
      .from('time_entries')
      .insert(row as Database['public']['Tables']['time_entries']['Insert'])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, entry: data });
  } catch (err: unknown) {
    /* This used to log a CONSTANT: console.error(..., 'Internal server error').
       Every failure for the life of this route wrote that same string and threw
       the real cause away — which is a large part of why the GENERATED-column
       bug above went unnoticed while the whole screen could not save. apiError
       logs the actual error with a correlation id and returns a line written
       for a GC rather than a database's words. */
    return apiError('timesheets/create', err, 'Could not save the time entry');
  }
}
