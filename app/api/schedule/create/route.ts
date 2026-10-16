import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { assertProjectInTenant } from '@/lib/assert-project';
import { reconcileScheduleProgress } from '@/lib/schedule-status';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Schedule', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    // Accept both camelCase and snake_case for every field the app sends.
    const name = body.name ?? body.title;
    const projectId = body.projectId ?? body.project_id;
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'Give the task a name.' }, { status: 400 });
    }
    if (!projectId) {
      return NextResponse.json({ error: 'Pick the project this task belongs to.' }, { status: 400 });
    }
    const startDate = body.start_date ?? body.startDate ?? null;
    const endDate = body.end_date ?? body.endDate ?? null;
    const phase = body.phase ?? '';
    const trade = body.trade ?? null;
    const pctRaw = body.pct_complete ?? body.pctComplete ?? body.percent_complete ?? body.percentComplete;
    // One fact, two columns, one vocabulary — see lib/schedule-status. (This
    // wrote `complete`; the schedule screens only know `completed`.)
    const agreed = reconcileScheduleProgress({ status: body.status, pct: pctRaw });
    const status: string = agreed.status ?? 'not_started';
    const pctComplete = agreed.pct_complete ?? 0;
    const predecessorId = body.predecessor_id ?? body.predecessorId ?? null;
    const db = createServerClient();
    // projectId comes from the body: it must be one of the caller's jobs.
    const notOurs = await assertProjectInTenant(db, user.tenantId, projectId);
    if (notOurs) return notOurs;
    const { data, error } = await db.from('schedule_tasks').insert({
      tenant_id: user.tenantId,
      project_id: projectId,
      name,
      phase,
      trade,
      start_date: startDate,
      end_date: endDate,
      pct_complete: pctComplete,
      status,
      predecessor_id: predecessorId,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, task: data });
  } catch (e) {
    return apiError('schedule/create', e, "Couldn't create the task. Please try again.");
  }
}
