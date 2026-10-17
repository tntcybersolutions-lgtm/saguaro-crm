import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { reconcileScheduleProgress } from '@/lib/schedule-status';
import { cascadeSuccessors, spanDays, type CascadeTask } from '@/lib/schedule-cascade';

/* '' from the composer means "not set" — Postgres refuses '' as a date. */
const blank = (v: unknown) => (typeof v === 'string' && !v.trim() ? null : v);

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
    if (startDate !== undefined) fields.start_date = blank(startDate);
    const endDate = body.end_date ?? body.endDate;
    if (endDate !== undefined) fields.end_date = blank(endDate);
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
    const assignedTo = body.assigned_to ?? body.assignedTo;
    if (assignedTo !== undefined) fields.assigned_to = blank(assignedTo);
    if (body.notes !== undefined) fields.notes = blank(body.notes);

    /* Moving a task moves the tasks that follow it (finish-to-start links,
       lib/schedule-cascade). The job's schedule is read BEFORE the save so each
       follower keeps the spacing it had. */
    const datesTouched = 'start_date' in fields || 'end_date' in fields || 'predecessor_id' in fields;
    let job: CascadeTask[] = [];
    if (datesTouched) {
      const { data: me, error: meErr } = await db.from('schedule_tasks').select('project_id').eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
      if (meErr) throw meErr;
      if (!me) return NextResponse.json({ error: "That task isn't on this job any more." }, { status: 404 });
      if (me.project_id) {
        const { data: rows, error: jobErr } = await db.from('schedule_tasks')
          .select('id, start_date, end_date, predecessor_id, predecessors, status, pct_complete')
          .eq('project_id', me.project_id).eq('tenant_id', user.tenantId);
        if (jobErr) throw jobErr;
        job = (rows || []) as CascadeTask[];
      }
    }
    const before = job.find((t) => String(t.id) === id);
    const start = 'start_date' in fields ? fields.start_date : before?.start_date;
    const end = 'end_date' in fields ? fields.end_date : before?.end_date;
    if (start && end && duration === undefined) fields.duration = spanDays(String(start), String(end));

    const { error } = await db
      .from('schedule_tasks')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;

    const moved = before && start && end
      ? cascadeSuccessors(job.map((t) => (String(t.id) === id && 'predecessor_id' in fields ? { ...t, predecessor_id: fields.predecessor_id } : t)), id, { start_date: String(start), end_date: String(end) })
      : [];
    for (const m of moved) {
      const { error: mErr } = await db.from('schedule_tasks')
        .update({ start_date: m.start_date, end_date: m.end_date, duration: spanDays(m.start_date, m.end_date) })
        .eq('id', m.id).eq('tenant_id', user.tenantId);
      if (mErr) throw mErr;
    }
    return NextResponse.json({ success: true, moved });
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
