import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = ['system_name','system_type','location','phase','status','assigned_to','scheduled_date','completed_date','checklist','test_results','issues','equipment_tag','manufacturer','model_number','serial_number','warranty_start','warranty_end','notes','photos'];
    for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];
    const { data, error } = await supabase.from('commissioning').update(updates).eq('id', params.id).eq('project_id', params.projectId).select().single();
    if (error) throw error;
    return NextResponse.json({ item: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
