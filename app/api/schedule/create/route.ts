import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

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
    if (!name || !projectId) {
      return NextResponse.json({ error: 'name and projectId are required' }, { status: 400 });
    }
    const startDate = body.start_date ?? body.startDate ?? null;
    const endDate = body.end_date ?? body.endDate ?? null;
    const phase = body.phase ?? '';
    const trade = body.trade ?? null;
    const pctRaw = body.pct_complete ?? body.pctComplete ?? body.percent_complete ?? body.percentComplete;
    let status: string = body.status ?? 'not_started';
    let pctComplete = Number(pctRaw ?? 0) || 0;
    // One fact, two columns — see the PATCH route.
    if (body.status === undefined && pctRaw !== undefined) status = pctComplete >= 100 ? 'complete' : pctComplete > 0 ? 'in_progress' : 'not_started';
    else if (pctRaw === undefined && status === 'complete') pctComplete = 100;
    const predecessorId = body.predecessor_id ?? body.predecessorId ?? null;
    const db = createServerClient();
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
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
