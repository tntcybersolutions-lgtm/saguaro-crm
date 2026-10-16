import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { transitionPayAppStatus } from '@/lib/pay-app-status';

/** Mark a pay app PAID. The waiver gate (unsigned conditionals hold the
 *  payment unless body.overrideWaivers), payment_received_at, the prime
 *  contract's paid_amount and the unconditional waivers all live in
 *  lib/pay-app-status, so a payment recorded any other way does the same. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Pay Apps', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      overrideWaivers?: boolean; amountPaid?: unknown; paymentMethod?: unknown; checkNumber?: unknown; paidDate?: unknown;
    };
    const r = await transitionPayAppStatus(g.db, user.tenantId, id, 'paid', {
      actorId: user.id,
      overrideWaivers: body.overrideWaivers === true,
      payment: {
        amount: body.amountPaid != null && String(body.amountPaid).trim() !== '' ? Number(body.amountPaid) : null,
        method: typeof body.paymentMethod === 'string' ? body.paymentMethod : null,
        checkNumber: typeof body.checkNumber === 'string' ? body.checkNumber : null,
        receivedAt: typeof body.paidDate === 'string' && body.paidDate ? body.paidDate : null,
      },
    });
    if (!r.ok) return NextResponse.json({ error: r.error, ...r.extra }, { status: r.status });
    return NextResponse.json({
      success: true,
      changed: r.changed,
      unconditionalWaivers: Number(r.extra?.unconditionalWaivers ?? 0),
      overrode: !!r.extra?.overrode,
    });
  } catch (err) {
    return apiError('pay-apps/paid', err, "Couldn't mark the pay app paid. Please try again.");
  }
}
