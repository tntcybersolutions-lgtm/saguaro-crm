import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { notOnRoster, subRecordScope } from '@/lib/sub-portal-scope';

async function authenticateSubPortal(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token).gt('expires_at', new Date().toISOString())
    .eq('status', 'active')
    .single();

  return session;
}

/** GET — List tasks/phases assigned to this sub */
export async function GET(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    // An email-only invite has no roster sub, so no task is assigned to it (lib/sub-portal-scope).
    const scope = subRecordScope(session);
    if (!scope) return NextResponse.json({ tasks: [] });

    const db = createServerClient();

    const { data: tasks, error } = await db
      .from('portal_sub_tasks')
      .select('*')
      .eq('sub_id', scope.subId)
      .eq('project_id', scope.projectId)
      .eq('tenant_id', scope.tenantId)
      .order('due_date', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ tasks: tasks || [] });
  } catch (err) {
    return apiError('portal/sub/schedule', err, "Couldn't load your schedule.");
  }
}

/** PATCH — Update task completion or checklist */
export async function PATCH(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const scope = subRecordScope(session);
    if (!scope) {
      const r = notOnRoster(session, 'a task update');
      return NextResponse.json(r.body, { status: r.status });
    }

    const db = createServerClient();
    const body = await req.json();
    const { task_id, percent_complete, status } = body;

    if (!task_id) {
      return NextResponse.json(
        { error: 'task_id is required' },
        { status: 400 }
      );
    }

    // Verify task belongs to this sub
    const { data: existing } = await db
      .from('portal_sub_tasks')
      .select('id')
      .eq('id', task_id)
      .eq('sub_id', scope.subId)
      .eq('tenant_id', scope.tenantId)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    // Live portal_sub_tasks columns: id, tenant_id, project_id, sub_id, title,
    // description, due_date, status, completed_at, created_at.
    // percent_complete / checklist / notes / updated_at do not exist and there is
    // no jsonb column to fold them into, so only status is persisted. When a task
    // is marked complete, stamp completed_at.
    const updateData: Record<string, any> = {};
    if (status !== undefined) updateData.status = status;
    if (status === 'completed' || status === 'complete') {
      updateData.completed_at = new Date().toISOString();
    }
    if (percent_complete === 100 && updateData.completed_at === undefined) {
      updateData.completed_at = new Date().toISOString();
    }

    const { data: updated, error } = await db
      .from('portal_sub_tasks')
      .update(updateData)
      .eq('id', task_id)
      .eq('sub_id', scope.subId)
      .eq('tenant_id', scope.tenantId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ task: updated });
  } catch (err) {
    return apiError('portal/sub/schedule', err, "Couldn't update the task. Please try again.");
  }
}
