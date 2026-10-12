import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { onboardingLink, onlinePaymentsConfigured } from '@/lib/online-payments';

/**
 * POST /api/payments/connect — start or continue the company's Stripe setup.
 * Admins only: it decides which bank the company's money goes to.
 * Returns { url } — Stripe's own onboarding page; it comes back to
 * /app/settings/payments when done.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  if (!onlinePaymentsConfigured()) {
    return NextResponse.json({ error: "Online payments aren't switched on for Saguaro yet." }, { status: 503 });
  }
  try {
    const url = await onboardingLink(g.db, g.user.tenantId, req.nextUrl.origin);
    return NextResponse.json({ url });
  } catch (e) {
    return apiError('payments/connect', e, "Couldn't open Stripe setup. Try again in a minute.");
  }
}
