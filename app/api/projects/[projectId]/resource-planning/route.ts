import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const all = params.projectId === 'all';
    let q = supabase.from('resource_assignments').select('*').eq('tenant_id', user.tenantId);
    if (!all) q = q.eq('project_id', params.projectId);
    const { data, error } = await q.order('start_date', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ assignments: data ?? [] });
  } catch { return NextResponse.json({ assignments: [] }); }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('resource_assignments').insert({
      tenant_id: user.tenantId, project_id: body.project_id || params.projectId,
      person_name: body.person_name, person_id: body.person_id || null,
      role: body.role || null, trade: body.trade || null,
      certifications: body.certifications || [], start_date: body.start_date,
      end_date: body.end_date || null, hours_per_day: body.hours_per_day || 8,
      days_per_week: body.days_per_week || 5, hourly_rate: body.hourly_rate || null,
      status: body.status || 'assigned', notes: body.notes || null, created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ assignment: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
