import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/approvals/delegations/[id] — revoke / reactivate.
 * Body: { active: boolean }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const body = await req.json();
    const active = typeof body.active === 'boolean' ? body.active : false;

    const db = createServerClient();
    const { data, error } = await db
      .from('approval_delegations')
      .update({ active } as never)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ delegation: data, success: true });
  } catch (e) {
    return apiError('approvals/delegations/[id] PATCH', e);
  }
}

/**
 * DELETE /api/approvals/delegations/[id] — remove a delegation (tenant-scoped).
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
      .from('approval_delegations')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('approvals/delegations/[id] DELETE', e);
  }
}
