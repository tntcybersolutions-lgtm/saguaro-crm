import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { sendToOwner } from '@/lib/change-order-stages';

export const dynamic = 'force-dynamic';

/**
 * POST /api/change-orders/[id]/send-to-owner { email? }
 * Sends the owner the approval link (/portals/owner/<token>, no login) and
 * records when. The owner's signature on that link books the change once the
 * company's approvers are done (lib/change-order-status).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Change Orders', 'Edit');
  if (!g.ok) return g.res;
  const body = ((await req.json().catch(() => null)) ?? {}) as { email?: unknown };
  try {
    const r = await sendToOwner(g.db, g.user.tenantId, id, { email: typeof body.email === 'string' ? body.email : null });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ success: true, link: r.link, emailed: r.emailed, to: r.to, changeOrder: r.changeOrder });
  } catch (e) {
    return apiError('change-orders/[id]/send-to-owner POST', e, "Couldn't send this to the owner.");
  }
}
