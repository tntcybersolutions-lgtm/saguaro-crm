import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = ['ticket_number','waste_date','waste_type','disposal_method','quantity','unit','hauler_name','hauler_ticket','destination_facility','cost','recycled','diverted','manifest_number','notes','photos'];
    for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];
    const { data, error } = await supabase.from('waste_tracking').update(updates).eq('id', params.id).eq('project_id', params.projectId).select().single();
    if (error) throw error;
    return NextResponse.json({ record: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
