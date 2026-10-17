import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { promoteToRequest, demoteToPotential, removeFromRequest } from '@/lib/change-order-stages';

export const dynamic = 'force-dynamic';

/**
 * POST /api/change-orders/[id]/stage
 *   { to: 'cor', amount? }  price a potential change and make it a request to the owner
 *   { to: 'pco' }           take an unapproved request back to a potential change
 *   { to: 'out' }           take a potential change out of the request it was rolled into
 * No money moves at any of these: only an approval does (lib/change-order-status).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Change Orders', 'Edit');
  if (!g.ok) return g.res;
  const body = ((await req.json().catch(() => null)) ?? {}) as { to?: unknown; amount?: unknown };
  const to = body.to;
  if (to !== 'cor' && to !== 'pco' && to !== 'out') {
    return NextResponse.json({ error: "to is required: 'cor', 'pco' or 'out'." }, { status: 400 });
  }
  try {
    const r = to === 'cor'
      ? await promoteToRequest(g.db, g.user.tenantId, id, g.user.id, body.amount === undefined || body.amount === null || body.amount === '' ? null : Number(body.amount))
      : to === 'pco'
        ? await demoteToPotential(g.db, g.user.tenantId, id, g.user.id)
        : await removeFromRequest(g.db, g.user.tenantId, id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ success: true, changeOrder: r.changeOrder });
  } catch (e) {
    return apiError('change-orders/[id]/stage POST', e, "Couldn't move this change order.");
  }
}
