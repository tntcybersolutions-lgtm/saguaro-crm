import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = ['title','incident_type','incident_date','incident_time','location','description','severity','injured_person','injured_company','injury_type','body_part','treatment','days_away','days_restricted','recordable','osha_reportable','witnesses','root_cause','corrective_actions','preventive_measures','investigation_by','investigation_date','investigation_notes','photos','status','reported_by','reported_to','supervisor_name'];
    for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];
    const { data, error } = await supabase.from('incidents').update(updates).eq('id', params.id).eq('project_id', params.projectId).select().single();
    if (error) throw error;
    return NextResponse.json({ incident: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
