import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { metaFor } from '@/lib/approvals';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/approvals/workflows/[id] — update name/module/steps/active.
 * Tenant-scoped. Used for edit, enable/disable toggle, and clone-save.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const body = await req.json();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.name === 'string') patch.name = body.name.trim();
    if (body.module !== undefined) {
      const meta = metaFor(body.module);
      if (!meta) return NextResponse.json({ error: 'invalid module' }, { status: 400 });
      patch.module = meta.entityType;
    }
    if (Array.isArray(body.steps)) patch.steps = body.steps;
    if (typeof body.active === 'boolean') patch.active = body.active;

    const db = createServerClient();
    const { data, error } = await db
      .from('approval_workflows')
      .update(patch as never)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ workflow: data, success: true });
  } catch (e) {
    return apiError('approvals/workflows/[id] PATCH', e);
  }
}

/**
 * DELETE /api/approvals/workflows/[id] — delete a template (tenant-scoped).
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Documents', 'Full');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const db = createServerClient();
    const { error } = await db
      .from('approval_workflows')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('approvals/workflows/[id] DELETE', e);
  }
}
