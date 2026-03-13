import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = ['item_type','title','description','trade','responsible_party','due_date','received_date','status','warranty_start','warranty_end','warranty_duration','manufacturer','file_url','file_name','notes','reviewed_by','reviewed_at'];
    for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];
    const { data, error } = await supabase.from('closeout').update(updates).eq('id', params.id).eq('project_id', params.projectId).select().single();
    if (error) throw error;
    return NextResponse.json({ item: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
