import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.name || !body.projectId) {
      return NextResponse.json({ error: 'name and projectId are required' }, { status: 400 });
    }
    const db = createServerClient();
    const { data, error } = await db.from('project_tasks').insert({
      tenant_id: user.tenantId,
      project_id: body.projectId,
      name: body.name,
      phase: body.phase || '',
      start_date: body.start_date || body.startDate,
      end_date: body.end_date || body.endDate,
      pct_complete: body.pct_complete ?? body.pctComplete ?? 0,
      status: body.status || 'not_started',
      predecessor: body.predecessor || '',
      assigned_to: body.assigned_to || '',
      notes: body.notes || '',
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, task: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
