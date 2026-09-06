import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/* Project to-dos — list and create.
 *
 * Both handlers targeted a table called `todos`, which does not exist in the
 * database, so every request failed. The real table is `project_todos`, and
 * three of the columns the POST wrote have no equivalent there: `category`,
 * `notes` and `completed_by`. The GET also swallowed every error as an empty
 * list.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;

  try {
    const supabase = createServerClient();
    const { data: project } = await supabase
      .from('projects').select('id')
      .eq('id', projectId).eq('tenant_id', user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const url = new URL(req.url);
    const status = url.searchParams.get('status');

    let q = supabase
      .from('project_todos')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId);
    if (status) q = q.eq('status', status);

    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ todos: data ?? [] });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error('[todos GET] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;

  try {
    const supabase = createServerClient();
    const body = await req.json();

    const { data: project } = await supabase
      .from('projects').select('id')
      .eq('id', projectId).eq('tenant_id', user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data, error } = await supabase.from('project_todos').insert({
      tenant_id: user.tenantId,
      project_id: projectId,
      title: body.title,
      description: body.description || null,
      assigned_to: body.assigned_to || null,
      assigned_to_id: body.assigned_to_id || null,
      due_date: body.due_date || null,
      priority: body.priority || 'medium',
      status: body.status || 'open',
      linked_module: body.linked_module || null,
      linked_id: body.linked_id || null,
      created_by: user.id,
    }).select().single();

    if (error) throw error;
    return NextResponse.json({ todo: data }, { status: 201 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error('[todos POST] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
