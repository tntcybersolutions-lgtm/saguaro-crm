import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { canSeeRates, canSetRates, withoutRates } from '@/lib/resource-assignments';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const all = params.projectId === 'all';
  // Staffing is a Projects tool; what each person costs is returned only with
  // Budget or Admin view (lib/resource-assignments).
  const g = await requirePermission(req, 'Projects', 'View', { projectId: all ? null : params.projectId });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const showRates = canSeeRates(g.perms);
    let q = g.db.from('resource_assignments').select('*').eq('tenant_id', user.tenantId);
    if (!all) q = q.eq('project_id', params.projectId);
    const { data, error } = await q.order('start_date', { ascending: true });
    if (error) throw error;
    return NextResponse.json({
      assignments: (data ?? []).map((r) => withoutRates(r as Record<string, unknown>, showRates)),
      ratesVisible: showRates,
    });
  } catch (e) {
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/resource-planning', e, 'Failed to load assignments');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit', { projectId: params.projectId === 'all' ? null : params.projectId });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    // A rate is kept only from a role that may set one (Budget or Admin: Edit).
    const rate = canSetRates(g.perms) ? (body.hourly_rate ?? body.cost_rate ?? null) : null;
    const { data, error } = await supabase.from('resource_assignments').insert({
      tenant_id: user.tenantId, project_id: body.project_id || params.projectId,
      resource_name: body.resource_name || body.person_name, // NOT NULL (page model calls it person_name)
      person_name: body.person_name, person_id: body.person_id || null,
      role: body.role || null,
      start_date: body.start_date,
      end_date: body.end_date || null, hours_per_day: body.hours_per_day || 8,
      days_per_week: body.days_per_week || 5, hourly_rate: rate, cost_rate: rate,
      status: body.status || 'assigned', notes: body.notes || null, created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ assignment: withoutRates(data as Record<string, unknown>, canSeeRates(g.perms)) }, { status: 201 });
  } catch (e: unknown) {
    return apiError('projects/[projectId]/resource-planning POST', e);
  }
}
