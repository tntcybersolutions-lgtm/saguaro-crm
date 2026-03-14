import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

async function authenticateSubPortal(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token)
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

    const db = createServerClient();

    const { data: tasks, error } = await db
      .from('portal_sub_tasks')
      .select('*')
      .eq('sub_id', session.sub_id)
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .order('start_date', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ tasks: tasks || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
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

    const db = createServerClient();
    const body = await req.json();
    const { task_id, percent_complete, checklist, status, notes } = body;

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
      .eq('sub_id', session.sub_id)
      .eq('tenant_id', session.tenant_id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (percent_complete !== undefined) updateData.percent_complete = percent_complete;
    if (checklist !== undefined) updateData.checklist = checklist;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    const { data: updated, error } = await db
      .from('portal_sub_tasks')
      .update(updateData)
      .eq('id', task_id)
      .eq('tenant_id', session.tenant_id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ task: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
