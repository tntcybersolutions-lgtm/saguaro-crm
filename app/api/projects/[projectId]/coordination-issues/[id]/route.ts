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
    const allowed = ['title','description','issue_type','location','drawing_ref','trades_involved','assigned_to','ball_in_court','priority','status','resolution','resolved_by','resolved_date','cost_impact','schedule_impact','photos','due_date','meeting_date','notes'];
    for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];
    // Tenant-scope the write — service-role bypasses RLS; project_id from the URL
    // is attacker-controlled, so it alone does NOT prove tenant ownership.
    const { data, error } = await supabase.from('coordination_issues').update(updates).eq('id', params.id).eq('project_id', params.projectId).eq('tenant_id', user.tenantId).select().single();
    if (error) throw error;
    return NextResponse.json({ issue: data });
  } catch (e: unknown) {
    return apiError('projects/[projectId]/coordination-issues/[id] PATCH', e);
  }
}
