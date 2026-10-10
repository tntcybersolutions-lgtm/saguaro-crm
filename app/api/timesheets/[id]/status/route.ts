import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { must } from '@/lib/db-write';
import { requestDay } from '@/lib/time-zone';

/**
 * Timesheet / time-clock status transition.
 *
 * Updates the SAME `time_entries` row that /timesheets/create inserted (the
 * mobile field clock-in/out flow). On a clock-out transition the app PATCHes
 * { status: 'submitted' }; we stamp clock_out then. Accepts camelCase or
 * snake_case. The `approved` branch (web approval) is preserved.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({} as Record<string, any>));
    const status = body.status ?? body.Status;
    if (!status) {
      return NextResponse.json({ error: 'status is required' }, { status: 400 });
    }

    const db = createServerClient();
    const updatePayload: Record<string, any> = { status };

    // A submitted/completed transition is the clock-out punch — stamp the
    // out time (and gps) onto the running entry unless the caller supplied one.
    if (status === 'submitted' || status === 'completed' || status === 'clocked_out') {
      updatePayload.clock_out = body.clock_out ?? body.clockOut ?? new Date().toISOString();
      const gpsOut = body.gps_clock_out ?? body.gpsClockOut;
      if (gpsOut != null) updatePayload.gps_clock_out = gpsOut;
    }
    if (status === 'approved') {
      updatePayload.approved_by = user.id;
      updatePayload.approved_at = new Date().toISOString();
    }

    const { error } = await db
      .from('time_entries')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;

    // ── APPROVED LABOR IS JOB COST. On approval, the entry's total_cost becomes
    //    a cost entry and rolls into the budget line's actual — labor stops
    //    being invisible in the budget. Idempotent via the cost_entries note tag. ──
    if (status === 'approved') {
      try {
        const { data: te } = await db
          .from('time_entries')
          .select('id, project_id, total_cost, total_hours, hours_worked, hourly_rate, csi_division, cost_code_description')
          .eq('id', id)
          .eq('tenant_id', user.tenantId)
          .single();
        const t = te as Record<string, any> | null;
        const laborCost = Number(t?.total_cost) || (Number(t?.hours_worked ?? t?.total_hours) || 0) * (Number(t?.hourly_rate) || 0);
        if (t?.project_id && laborCost > 0) {
          const tag = `time_entry:${id}`;
          const { data: dup } = await db
            .from('cost_entries')
            .select('id')
            .eq('tenant_id', user.tenantId)
            .eq('notes', tag)
            .limit(1)
            .maybeSingle();
          if (!dup) {
            const { error: writeErr } = await db.from('cost_entries').insert({
              tenant_id: user.tenantId,
              project_id: t.project_id,
              entry_type: 'labor',
              entry_date: (await requestDay(req.headers, db, user.tenantId, 'timesheets/status')).today,
              description: `Approved labor — ${t.cost_code_description || 'field time'} (${Number(t.hours_worked ?? t.total_hours) || 0} hrs)`,
              amount: laborCost,
              csi_division: t.csi_division || null,
              approved: true,
              approved_by: user.id,
              approved_at: new Date().toISOString(),
              created_by: user.id,
              notes: tag,
            } as never);
            // This route answers success right after. A rejected write used to
            // vanish — supabase-js returns { error } rather than throwing.
            if (writeErr) { console.error('[timesheets/cost-entry]', writeErr); throw writeErr; }
            if (t.csi_division) {
              const { data: bLine } = await db
                .from('budget_lines')
                .select('id, actual')
                .eq('project_id', t.project_id)
                .eq('tenant_id', user.tenantId)
                .eq('division', String(t.csi_division).slice(0, 2))
                .limit(1)
                .maybeSingle();
              if (bLine) {
                await must(db.from('budget_lines')
                  .update({ actual: ((bLine as { actual: number | null }).actual || 0) + laborCost })
                  .eq('tenant_id', user.tenantId)
          .eq('id', (bLine as { id: string }).id), 'budget_lines write');
              }
            }
          }
        }
      } catch (e) { console.error('labor->cost wiring skipped:', e); }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
