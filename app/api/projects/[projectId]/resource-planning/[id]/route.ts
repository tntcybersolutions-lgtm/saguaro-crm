import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { canSeeRates, canSetRates, withoutRates } from '@/lib/resource-assignments';
import { apiError } from '@/lib/api-error';

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = ['person_name','role','trade','certifications','start_date','end_date','hours_per_day','days_per_week','status','notes','project_id'];
    for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];
    // A rate is changed only by a role that may set one (Budget or Admin: Edit); both columns stay equal.
    const rate = body.hourly_rate ?? body.cost_rate;
    if (rate !== undefined && canSetRates(g.perms)) { updates.hourly_rate = rate; updates.cost_rate = rate; }
    const { data, error } = await supabase.from('resource_assignments').update(updates).eq('id', params.id).eq('tenant_id', user.tenantId).select().single();
    if (error) throw error;
    return NextResponse.json({ assignment: withoutRates(data as Record<string, unknown>, canSeeRates(g.perms)) });
  } catch (e: unknown) {
    return apiError('projects/[projectId]/resource-planning/[id] PATCH', e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const g = await requirePermission(req, 'Projects', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from('resource_assignments').delete().eq('id', params.id).eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError('projects/[projectId]/resource-planning/[id] DELETE', e);
  }
}
