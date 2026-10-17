import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { recordOwnerSignoff } from '@/lib/change-order-stages';

export const dynamic = 'force-dynamic';

/**
 * POST /api/change-orders/[id]/owner-signoff { name?, note? }
 * The owner signed outside the app (paper, email). Recording it is a decision
 * on the owner's behalf, so it takes Change Orders: Full, and the record says
 * who recorded it. It books under the same rule as the owner's link.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Change Orders', 'Full');
  if (!g.ok) return g.res;
  const body = ((await req.json().catch(() => null)) ?? {}) as { name?: unknown; note?: unknown };
  try {
    const r = await recordOwnerSignoff(g.db, g.user.tenantId, id, g.user.id, {
      name: typeof body.name === 'string' ? body.name : null,
      note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
    });
    if (!r.ok) return NextResponse.json({ error: r.error, review: r.review }, { status: r.status });
    return NextResponse.json({ success: true, review: r.review });
  } catch (e) {
    return apiError('change-orders/[id]/owner-signoff POST', e, "Couldn't record the owner's signature.");
  }
}
