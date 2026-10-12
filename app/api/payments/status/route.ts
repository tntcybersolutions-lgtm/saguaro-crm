import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { companyPaymentAccount, onlinePaymentsConfigured } from '@/lib/online-payments';

/**
 * GET /api/payments/status — can this company take online payments?
 *   configured  this deployment has Stripe switched on
 *   connected   the company has started Stripe setup
 *   ready       Stripe says it can take payments (setup finished)
 *   due         what Stripe still needs from the company, if anything
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    if (!onlinePaymentsConfigured()) return NextResponse.json({ configured: false, connected: false, ready: false, due: [] });
    const acct = await companyPaymentAccount(g.db, g.user.tenantId, true);
    return NextResponse.json({ configured: true, connected: !!acct.accountId, ready: acct.ready, due: acct.due });
  } catch (e) {
    return apiError('payments/status', e, "Couldn't reach Stripe to check online payments. Try again in a minute.");
  }
}
