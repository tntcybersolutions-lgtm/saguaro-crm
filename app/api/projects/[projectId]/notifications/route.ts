import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

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
    if (error) {
      // A Postgres error names the table, the column and the constraint.
      // apiError logs the real one with a correlation id and returns a message
      // that is safe to put in front of a GC.
      return apiError('projects/notifications', error, 'Could not load notifications.');
    }
    return NextResponse.json({ notifications: data || [] });
  } catch (e) {
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/notifications', e, 'Could not load notifications.');
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const supabase = createServerClient();

    if (body.mark_all_read) {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('project_id', params.projectId)
        .eq('user_id', user.id)
        .eq('read', false);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (body.id) {
      // Scope to this user so a spoofed id can't flip another user's notification,
      // and surface a real error instead of always reporting success.
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', body.id)
        .eq('user_id', user.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  } catch (e) {
    return apiError('projects/[projectId]/notifications PATCH', e, 'Failed to update notifications');
  }
}
