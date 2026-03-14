import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = ['name','description','questions','scoring_criteria','required_documents','auto_qualify_threshold','status','answers','documents','score','reviewed_by','reviewed_at','review_notes'];
    for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];
    // Try forms first, then submissions
    let { data, error } = await supabase.from('prequalification_forms').update(updates).eq('id', params.id).select().single();
    if (error) {
      const res = await supabase.from('prequalification_submissions').update(updates).eq('id', params.id).select().single();
      data = res.data; error = res.error;
    }
    if (error) throw error;
    return NextResponse.json({ item: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
