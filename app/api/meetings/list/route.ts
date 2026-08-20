import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (!projectId) return NextResponse.json({ error: 'Missing required field: projectId' }, { status: 400 });

    const db = createServerClient();

    let query = db
      .from('meetings')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .order('meeting_date', { ascending: false })
      .limit(limit);

    if (type) {
      query = query.eq('meeting_type', type);
    }

    const { data: meetings, error } = await query;
    if (error) throw error;

    const result = [];
    for (const meeting of meetings || []) {
      const { count: attendee_count, error: attErr } = await db
        .from('meeting_attendees')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', user.tenantId)
        .eq('meeting_id', meeting.id);

      if (attErr) throw attErr;

      const { count: open_actions, error: openErr } = await db
        .from('action_items')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', user.tenantId)
        .eq('meeting_id', meeting.id)
        .neq('status', 'complete');

      if (openErr) throw openErr;

      const { count: overdue_actions, error: overdueErr } = await db
        .from('action_items')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', user.tenantId)
        .eq('meeting_id', meeting.id)
        .neq('status', 'complete')
        .lt('due_date', new Date().toISOString());

      if (overdueErr) throw overdueErr;

      result.push({
        ...meeting,
        attendee_count: attendee_count || 0,
        open_actions: open_actions || 0,
        overdue_actions: overdue_actions || 0,
      });
    }

    return NextResponse.json({ data: result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
