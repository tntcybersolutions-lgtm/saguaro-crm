import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { transitionPayAppStatus } from '@/lib/pay-app-status';

/* Approve. approved_at and the conditional lien-waiver cascade come from
   lib/pay-app-status, shared with every other door that approves. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Pay Apps', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;
  try {
    const r = await transitionPayAppStatus(g.db, user.tenantId, id, 'approved', { actorId: user.id });
    if (!r.ok) return NextResponse.json({ error: r.error, ...r.extra }, { status: r.status });
    return NextResponse.json({ success: true, changed: r.changed });
  } catch (e) {
    return apiError('pay-apps/[id]/approve POST', e);
  }
}
