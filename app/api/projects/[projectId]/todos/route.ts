import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data: project } = await supabase.from('projects').select('id').eq('id', params.projectId).eq('tenant_id', user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    let q = supabase.from('todos').select('*').eq('project_id', params.projectId);
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ todos: data ?? [] });
  } catch { return NextResponse.json({ todos: [] }); }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('todos').insert({
      tenant_id: user.tenantId, project_id: params.projectId,
      title: body.title, description: body.description || null,
      assigned_to: body.assigned_to || null, assigned_to_id: body.assigned_to_id || null,
      due_date: body.due_date || null, priority: body.priority || 'medium',
      status: body.status || 'open', category: body.category || 'general',
      linked_module: body.linked_module || null, linked_id: body.linked_id || null,
      notes: body.notes || null, created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ todo: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
