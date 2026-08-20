import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('schedule_milestones')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('baseline_date', { ascending: true });

    if (error) throw error;

    const milestones = data || [];
    const today = new Date().toISOString().split('T')[0];

    const summary = {
      total: milestones.length,
      complete: milestones.filter((m: Record<string, unknown>) => m.status === 'complete').length,
      at_risk: milestones.filter((m: Record<string, unknown>) => {
        if (m.status === 'complete') return false;
        const target = (m.current_date || m.baseline_date) as string;
        if (!target) return false;
        const diff = Math.floor((new Date(target).getTime() - new Date(today).getTime()) / 86400000);
        return diff >= 0 && diff <= 7;
      }).length,
      upcoming: milestones.filter((m: Record<string, unknown>) => {
        if (m.status === 'complete') return false;
        const target = (m.current_date || m.baseline_date) as string;
        if (!target) return false;
        const diff = Math.floor((new Date(target).getTime() - new Date(today).getTime()) / 86400000);
        return diff > 7;
      }).length,
      missed: milestones.filter((m: Record<string, unknown>) => {
        if (m.status === 'complete') return false;
        const target = (m.current_date || m.baseline_date) as string;
        if (!target) return false;
        return new Date(target) < new Date(today);
      }).length,
    };

    return NextResponse.json({ milestones, summary });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const title = body.title as string;
  if (!title) return NextResponse.json({ error: 'Missing required field: title' }, { status: 400 });
  if (!body.baseline_date) return NextResponse.json({ error: 'Missing required field: baseline_date' }, { status: 400 });

  try {
    const db = createServerClient();

    // Get next milestone number
    const { data: existing } = await db
      .from('schedule_milestones')
      .select('milestone_number')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('milestone_number', { ascending: false })
      .limit(1);

    const nextNum = (existing && existing.length > 0 ? (existing[0] as Record<string, unknown>).milestone_number as number : 0) + 1;

    const row = {
      project_id: projectId,
      tenant_id: user.tenantId,
      milestone_number: nextNum,
      title,
      description: body.description || null,
      milestone_type: body.milestone_type || 'other',
      baseline_date: body.baseline_date,
      current_date: body.baseline_date,
      responsible_party: body.responsible_party || null,
      responsible_name: body.responsible_name || null,
      is_critical_path: body.is_critical_path || false,
      status: 'pending',
      sort_order: nextNum,
    };

    const { data, error } = await db
      .from('schedule_milestones')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ milestone: data }, { status: 201 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const milestoneId = searchParams.get('milestoneId');
  if (!milestoneId) return NextResponse.json({ error: 'Missing required query param: milestoneId' }, { status: 400 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  try {
    const db = createServerClient();

    // Verify milestone belongs to tenant+project
    const { data: existing, error: findErr } = await db
      .from('schedule_milestones')
      .select('id')
      .eq('id', milestoneId)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (findErr || !existing) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.status === 'complete') {
      updates.status = 'complete';
      updates.actual_date = body.actual_date || new Date().toISOString().split('T')[0];
      updates.completed_by = user.id;
      if (body.completion_notes) updates.completion_notes = body.completion_notes;
    }
    if (body.current_date) updates.current_date = body.current_date;
    if (body.title) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.responsible_party !== undefined) updates.responsible_party = body.responsible_party;
    if (body.responsible_name !== undefined) updates.responsible_name = body.responsible_name;
    if (body.is_critical_path !== undefined) updates.is_critical_path = body.is_critical_path;
    if (body.status && body.status !== 'complete') updates.status = body.status;
    if (body.float_days !== undefined) updates.float_days = body.float_days;
    if (body.schedule_impact_days !== undefined) updates.schedule_impact_days = body.schedule_impact_days;

    const { data, error } = await db
      .from('schedule_milestones')
      .update(updates)
      .eq('id', milestoneId)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ milestone: data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
