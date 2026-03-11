import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();
    const { data: project } = await db.from('projects').select('tenant_id').eq('id', body.projectId).single();
    const tenantId = user?.id || (project as any)?.tenant_id || 'demo';

    const { data: last } = await db.from('change_orders').select('co_number').eq('project_id', body.projectId).order('co_number', { ascending: false }).limit(1).single();
    const coNumber = ((last as any)?.co_number || 0) + 1;

    const { data: co, error } = await db.from('change_orders').insert({
      tenant_id: tenantId,
      project_id: body.projectId,
      co_number: coNumber,
      title: body.title,
      description: body.description,
      reason: body.reason,
      status: 'pending',
      cost_impact: body.costImpact || 0,
      schedule_impact: body.scheduleImpact || 0,
      submitted_by: user?.id,
    }).select().single();

    if (error) throw error;
    return NextResponse.json({ changeOrder: co, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
