import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = ['ticket_number','waste_date','waste_type','disposal_method','quantity','unit','hauler_name','hauler_ticket','destination_facility','cost','recycled','diverted','manifest_number','notes','photos'];
    for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];
    const { data, error } = await supabase.from('waste_tracking').update(updates).eq('id', params.id).eq('project_id', params.projectId).eq('tenant_id', user.tenantId).select().single();
    if (error) throw error;
    return NextResponse.json({ record: data });
  } catch (e: unknown) {
    return apiError('projects/[projectId]/waste-tracking/[id] PATCH', e);
  }
}
