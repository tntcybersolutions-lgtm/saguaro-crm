import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { reconcileScheduleProgress } from '@/lib/schedule-status';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Schedule', 'Edit');
  if (!g.ok) return g.res;
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServerClient();
    // Map every alias the app may send (camelCase or snake_case) onto the real
    // schedule_tasks columns. Only assign a column when a value was actually
    // provided so a partial PUT doesn't null out untouched fields.
    const fields: Record<string, any> = {};
    const name = body.name ?? body.title;
    if (name !== undefined) fields.name = name;
    if (body.phase !== undefined) fields.phase = body.phase;
    if (body.trade !== undefined) fields.trade = body.trade;
    const startDate = body.start_date ?? body.startDate;
    if (startDate !== undefined) fields.start_date = startDate;
    const endDate = body.end_date ?? body.endDate;
    if (endDate !== undefined) fields.end_date = endDate;
    /* pct_complete and status are two writers of one fact, in one vocabulary
       (lib/schedule-status): 100 % is `completed`, a started bar is in
       progress, Completed fills the bar, Not Started empties it. This route
       used to write `complete`, which the job schedule's labels, badges and
       "Tasks Complete" tile do not know — a task set to 100 % showed a raw
       "complete" and was not counted as finished. */
    const pctComplete = body.pct_complete ?? body.pctComplete ?? body.percent_complete ?? body.percentComplete;
    Object.assign(fields, reconcileScheduleProgress({ status: body.status, pct: pctComplete }));
    // Dependency: single predecessor task (uuid) — empty string clears it.
    const predecessorId = body.predecessor_id ?? body.predecessorId;
    if (predecessorId !== undefined) fields.predecessor_id = predecessorId || null;
    const duration = body.duration ?? body.durationDays;
    if (duration !== undefined) fields.duration = duration;
    const { error } = await db
      .from('schedule_tasks')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('schedule/[id] PUT', e, "Couldn't save the task. Please try again.");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Schedule', 'Full');
  if (!g.ok) return g.res;
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { error } = await db
      .from('schedule_tasks')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('schedule/[id] DELETE', e, "Couldn't delete the task. Please try again.");
  }
}
