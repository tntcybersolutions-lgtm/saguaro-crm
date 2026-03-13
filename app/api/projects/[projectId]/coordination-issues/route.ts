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
    const type = url.searchParams.get('type');
    let q = supabase.from('coordination_issues').select('*').eq('project_id', params.projectId);
    if (status) q = q.eq('status', status);
    if (type) q = q.eq('issue_type', type);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ issues: data ?? [] });
  } catch { return NextResponse.json({ issues: [] }); }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const count = await supabase.from('coordination_issues').select('id', { count: 'exact', head: true }).eq('project_id', params.projectId);
    const num = (count.count || 0) + 1;
    const { data, error } = await supabase.from('coordination_issues').insert({
      tenant_id: user.tenantId, project_id: params.projectId,
      issue_number: `CI-${String(num).padStart(4, '0')}`,
      title: body.title, description: body.description || null,
      issue_type: body.issue_type || 'field_conflict', location: body.location || null,
      drawing_ref: body.drawing_ref || null, trades_involved: body.trades_involved || [],
      assigned_to: body.assigned_to || null, ball_in_court: body.ball_in_court || null,
      priority: body.priority || 'medium', status: body.status || 'open',
      cost_impact: body.cost_impact || 0, schedule_impact: body.schedule_impact || 0,
      linked_rfi_id: body.linked_rfi_id || null, photos: body.photos || [],
      due_date: body.due_date || null, notes: body.notes || null, created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ issue: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
