import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

/**
 * PATCH /api/punch-list/[id]/complete
 * Updates a punch item's status within the caller's tenant.
 *
 * Writes go through the service-role client (from requirePermission). The
 * previous bare anon client matched no RLS policy on punch_list — every policy
 * targets `authenticated` or `service_role` — so every update was rejected with
 * 42501 and this endpoint returned 500 for every status change.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;

  const { db, user } = g;

  const body: Record<string, unknown> = await req.json().catch(() => ({}));
  const newStatus = (body.status as string) || 'complete';

  const updateData: Record<string, unknown> = { status: newStatus };
  // 'completed' is the value lib/project-lifecycle PUNCH_DONE counts as done;
  // stamp completed_at for it too, not only for the legacy 'complete'.
  if (['complete', 'completed'].includes(newStatus.toLowerCase())) {
    updateData.completed_at = new Date().toISOString();
  }

  // .select() so we can tell an applied update from one that matched no row.
  // Without it, updating a non-existent or other-tenant id returns no error and
  // this route reported success for a write that never happened.
  const { data, error } = await db
    .from('punch_list')
    .update(updateData)
    .eq('id', id)
    .eq('tenant_id', user.tenantId)
    .select('id');

  if (error) {
    console.error('[punch-list/complete] update failed:', error.message);
    return apiError('punch-list/id/complete', error, 'Failed to update punch item');
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Punch item not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, id, status: newStatus });
}
