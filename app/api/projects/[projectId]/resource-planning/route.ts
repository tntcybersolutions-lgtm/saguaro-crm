import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

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
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/resource-planning] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/resource-planning', e, 'Failed to load assignments');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('resource_assignments').insert({
      tenant_id: user.tenantId, project_id: body.project_id || params.projectId,
      resource_name: body.resource_name || body.person_name, // NOT NULL (page model calls it person_name)
      person_name: body.person_name, person_id: body.person_id || null,
      role: body.role || null,
      start_date: body.start_date,
      end_date: body.end_date || null, hours_per_day: body.hours_per_day || 8,
      days_per_week: body.days_per_week || 5, hourly_rate: body.hourly_rate || null,
      status: body.status || 'assigned', notes: body.notes || null, created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ assignment: data }, { status: 201 });
  } catch (e: unknown) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[projects/projectId/resource-planning]', e);
    const msg = "Failed";
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
