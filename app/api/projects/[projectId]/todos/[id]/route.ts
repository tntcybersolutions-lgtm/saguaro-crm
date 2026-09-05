import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/* Project to-dos.
 *
 * This route wrote to a table called `todos`, which does not exist in the
 * database — every PATCH and DELETE failed at runtime. The real table is
 * `project_todos`, and three of the fields this route accepted (`category`,
 * `completed_by`, `notes`) have no column there.
 */

// Column names as they exist on public.project_todos.
const COLUMNS = [
  'title', 'description', 'assigned_to', 'assigned_to_id', 'due_date',
  'priority', 'status', 'completed_at', 'linked_module', 'linked_id',
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, id } = await params;

  try {
    const supabase = createServerClient();
    const body = await req.json();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const ignored: string[] = [];

    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (value === undefined) continue;
      if ((COLUMNS as readonly string[]).includes(key)) updates[key] = value;
      else ignored.push(key);
    }

    const { data, error } = await supabase
      .from('project_todos')
      .update(updates)
      .eq('tenant_id', user.tenantId)
      .eq('id', id)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'To-do not found' }, { status: 404 });

    return NextResponse.json(ignored.length ? { todo: data, ignored } : { todo: data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error('[todos PATCH] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, id } = await params;

  try {
    const supabase = createServerClient();
    const { error, count } = await supabase
      .from('project_todos')
      .delete({ count: 'exact' })
      .eq('tenant_id', user.tenantId)
      .eq('id', id)
      .eq('project_id', projectId);

    if (error) throw error;
    if (!count) return NextResponse.json({ error: 'To-do not found' }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error('[todos DELETE] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
