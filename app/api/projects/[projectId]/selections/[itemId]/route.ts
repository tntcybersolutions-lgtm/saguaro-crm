import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/** GET a single selection item. */
export async function GET(req: NextRequest, { params }: { params: { projectId: string; itemId: string } }) {
  // Role check, not just sign-in: Projects: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requirePermission(req, 'Projects', 'View', { projectId: params.projectId });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('selections')
      .select('*')
      .eq('id', params.itemId)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ selection: data });
  } catch (e) {
    return apiError('projects/[projectId]/selections/[itemId] GET', e);
  }
}

/** PATCH update a selection item (status change, edits). */
export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; itemId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = [
      'category', 'item_name', 'description', 'allowance', 'selected_amount',
      'variance', 'status', 'vendor', 'lead_time', 'due_date', 'selected_by',
      'selected_at', 'photo_url', 'notes',
    ];
    for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];

    const { data, error } = await supabase
      .from('selections')
      .update(updates)
      .eq('id', params.itemId)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ selection: data });
  } catch (e) {
    return apiError('projects/[projectId]/selections/[itemId] PATCH', e);
  }
}

/** DELETE a selection item. */
export async function DELETE(req: NextRequest, { params }: { params: { projectId: string; itemId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from('selections')
      .delete()
      .eq('id', params.itemId)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('projects/[projectId]/selections/[itemId] DELETE', e);
  }
}
