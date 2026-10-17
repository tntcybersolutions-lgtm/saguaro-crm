import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * Single role definition.
 *
 * Caller: app/app/roles-permissions/page.tsx
 *   saveRole() → PUT /api/roles/{id} with { name, description, color, permissions }
 *   deleteRole() → DELETE /api/roles/{id}
 *
 * role_definitions real columns: id, tenant_id, name, description, permissions
 * (jsonb), is_default, is_builtin, color, created_at. `color` and permission
 * changes are persisted here.
 */

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const db = createServerClient();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description ?? null;
    if (body.permissions !== undefined) updates.permissions = body.permissions ?? {};
    if (body.color !== undefined) updates.color = body.color ?? null;
    if (body.is_default !== undefined) updates.is_default = !!body.is_default;
    // 'assigned' = only the jobs the person is on (20261018r).
    if (body.scope === 'assigned' || body.scope === 'company') updates.scope = body.scope;
    const { data, error } = await db
      .from('role_definitions')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ role: data });
  } catch (e) {
    return apiError('roles/[id] PUT', e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { error } = await db
      .from('role_definitions')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('roles/[id] DELETE', e);
  }
}
