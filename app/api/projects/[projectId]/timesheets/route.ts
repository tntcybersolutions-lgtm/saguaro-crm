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
    const week = url.searchParams.get('week');
    const status = url.searchParams.get('status');
    let q = supabase.from('timesheets').select('*').eq('project_id', params.projectId);
    if (week) q = q.eq('week_ending', week);
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('work_date', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ timesheets: data ?? [] });
  } catch { return NextResponse.json({ timesheets: [] }); }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('timesheets').insert({
      tenant_id: user.tenantId, project_id: params.projectId,
      employee_name: body.employee_name, employee_id: body.employee_id || null,
      week_ending: body.week_ending, work_date: body.work_date,
      hours_regular: body.hours_regular || 0, hours_overtime: body.hours_overtime || 0,
      hours_double: body.hours_double || 0, cost_code: body.cost_code || null,
      location: body.location || null, description: body.description || null,
      status: body.status || 'draft', notes: body.notes || null, created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ timesheet: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
