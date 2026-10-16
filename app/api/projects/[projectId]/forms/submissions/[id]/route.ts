import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const supabase = createServerClient();
    const ALLOWED_SUBMISSION_COLUMNS = [
      'project_id', 'template_id', 'submitted_by', 'data', 'status', 'reviewed_by', 'reviewed_at',
      'notes', 'responses', 'location',
    ];
    const updates: Record<string, any> = {};
    for (const k of ALLOWED_SUBMISSION_COLUMNS) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    // Tenant-scope the write — service-role bypasses RLS; project_id from the URL
    // is attacker-controlled, so it alone does NOT prove tenant ownership.
    const { data, error } = await supabase
      .from('form_submissions')
      .update({ ...updates, reviewed_by: user.email, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    // Surface a real failure instead of echoing the request back as a fake success.
    if (error || !data) return NextResponse.json({ error: 'Failed to update submission' }, { status: error?.code === 'PGRST116' ? 404 : 500 });
    return NextResponse.json({ submission: data });
  } catch (e) {
    return apiError('projects/[projectId]/forms/submissions/[id] PATCH', e, 'Failed to update submission');
  }
}
