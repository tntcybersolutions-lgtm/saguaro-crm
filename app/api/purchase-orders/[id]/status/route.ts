import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { transitionPoStatus } from '@/lib/purchase-order-status';

/**
 * PATCH /api/purchase-orders/:id/status { status }
 * One move along lib/purchase-order-status (draft → sent → acknowledged →
 * partially received → received → closed; void from anything not closed).
 * A move the map refuses is a 409 that names the moves it does allow.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Budget', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const body = await req.json().catch(() => ({}));
  if (!body.status) return NextResponse.json({ error: 'Status is required' }, { status: 400 });
  try {
    const r = await transitionPoStatus(g.db, user.tenantId, params.id, body.status, { actorId: user.id });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ success: true, purchase_order: r.after });
  } catch (err) {
    return apiError('purchase-orders/[id]/status PATCH', err, 'Failed to update purchase order status');
  }
}
