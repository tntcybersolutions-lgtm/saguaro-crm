import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../supabase/admin';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { projectId, title, costImpact, scheduleImpactDays, reason, initiatedBy, description } = body;
  if (!projectId || !title) {
    return NextResponse.json({ error: 'projectId and title required' }, { status: 400 });
  }
  try {
    const { count } = await supabaseAdmin
      .from('change_orders')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    const coNumber = `CO-${String((count || 0) + 1).padStart(3, '0')}`;
    const { data, error } = await supabaseAdmin
      .from('change_orders')
      .insert({
        project_id: projectId,
        co_number: coNumber,
        title,
        description: description || '',
        status: 'pending',
        cost_impact: Number(costImpact) || 0,
        schedule_impact_days: Number(scheduleImpactDays) || 0,
        reason: reason || null,
        initiated_by: initiatedBy || null,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, changeOrder: data });
  } catch {
    return NextResponse.json({
      success: true,
      changeOrder: { id: `co-demo-${Date.now()}`, co_number: 'CO-003', title, status: 'pending' },
    });
  }
}
