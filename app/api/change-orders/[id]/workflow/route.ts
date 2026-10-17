import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, hasPermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { workflowView } from '@/lib/change-order-stages';

export const dynamic = 'force-dynamic';

/**
 * GET /api/change-orders/[id]/workflow — where a change stands: its stage
 * (PCO → request → approved) with who and when, the approvals its tier needs
 * and who has given them, the owner's link and signature, the contract before
 * and after, and the one next action for the person asking.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Change Orders', 'View');
  if (!g.ok) return g.res;
  try {
    const view = await workflowView(g.db, g.user.tenantId, id, g.user.id);
    if (!view) return NextResponse.json({ error: 'Change order not found' }, { status: 404 });
    /* The owner's link is the owner's signature pen: only someone who can
       send it (Change Orders: Edit) gets it back, never a read-only seat. */
    if (!hasPermission(g.perms, 'Change Orders', 'Edit')) view.owner.link = null;
    return NextResponse.json({ workflow: view }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return apiError('change-orders/[id]/workflow GET', e, "Couldn't load where this change order stands.");
  }
}
