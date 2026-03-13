import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ notifications: [] });
    return NextResponse.json({ notifications: data || [] });
  } catch {
    return NextResponse.json({ notifications: [] });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const supabase = createServerClient();

    if (body.mark_all_read) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('project_id', params.projectId)
        .eq('user_id', user.id)
        .eq('read', false);
      return NextResponse.json({ success: true });
    }

    if (body.id) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', body.id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
  }
}
