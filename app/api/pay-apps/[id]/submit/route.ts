import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { transitionPayAppStatus } from '@/lib/pay-app-status';

/* Submit to the owner. The stamps (submitted_at, the owner's review token)
   and the owner's email live in lib/pay-app-status — the one place every
   status change goes through. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Pay Apps', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;
  try {
    const r = await transitionPayAppStatus(g.db, user.tenantId, id, 'submitted', { actorId: user.id });
    if (!r.ok) return NextResponse.json({ error: r.error, ...r.extra }, { status: r.status });
    return NextResponse.json({ success: true, owner_approval_token: r.payApp.owner_approval_token ?? null });
  } catch (e) {
    return apiError('pay-apps/[id]/submit POST', e);
  }
}
