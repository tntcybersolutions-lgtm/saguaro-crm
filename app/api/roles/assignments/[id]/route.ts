import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

/**
 * PATCH /api/roles/assignments/[id]
 * Update a user role assignment (e.g. change role or project scope).
 * Only FK columns that exist on user_role_assignments are persisted.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const db = createServerClient();

    const fields: Record<string, unknown> = {};
    const roleId = body.roleId ?? body.role_id;
    const userId = body.userId ?? body.user_id;
    if (roleId !== undefined) fields.role_id = roleId;
    if (userId !== undefined) fields.user_id = userId;
    if (body.projectId !== undefined) fields.project_id = body.projectId || null;
    else if (body.project_id !== undefined) fields.project_id = body.project_id || null;

    const { data, error } = await db
      .from('user_role_assignments')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, assignment: data });
  } catch (e) {
    return apiError('roles/assignments/[id] PATCH', e);
  }
}

/**
 * DELETE /api/roles/assignments/[id]
 * Remove a user role assignment.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { error } = await db
      .from('user_role_assignments')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('roles/assignments/[id] DELETE', e);
  }
}
