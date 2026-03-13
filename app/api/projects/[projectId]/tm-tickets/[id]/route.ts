import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('tm_tickets')
      .update({ ...body, updated_at: new Date().toISOString(), updated_by: user.email })
      .eq('id', params.id)
      .eq('project_id', params.projectId)
      .select()
      .single();
    if (error) return NextResponse.json({ ticket: { id: params.id, ...body } });
    return NextResponse.json({ ticket: data });
  } catch {
    return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 });
  }
}
