import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getPortalSession, PORTAL_PERMS } from '@/lib/portal-auth';
import { apiError } from '@/lib/api-error';
import { invoiceCheckoutUrl, PaymentsUnavailable } from '@/lib/online-payments';

/**
 * POST /api/portal/client/pay { invoiceId } — the owner pays one invoice online.
 * Portal-token auth; the invoice must be an owner invoice on this portal's job.
 * Returns { url } — a Stripe Checkout page on the GC's own Stripe account.
 */
export async function POST(req: NextRequest) {
  const session = await getPortalSession(req, PORTAL_PERMS.VIEW_FINANCIALS);
  if (!session) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const invoiceId = typeof body.invoiceId === 'string' ? body.invoiceId : '';
    if (!invoiceId) return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
    const db = createServerClient() as any;
    const { data: inv } = await db.from('invoices')
      .select('id, tenant_id, project_id, invoice_number, amount, tax, total, paid_amount, status, direction')
      .eq('id', invoiceId).eq('tenant_id', session.tenant_id).eq('project_id', session.project_id)
      .eq('direction', 'receivable').maybeSingle();
    if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    const token = req.nextUrl.searchParams.get('token') || req.headers.get('x-portal-token') || '';
    const url = await invoiceCheckoutUrl(db, inv, req.nextUrl.origin, `/portals/client/${encodeURIComponent(token)}?tab=financials`);
    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof PaymentsUnavailable) return NextResponse.json({ error: e.message }, { status: 409 });
    return apiError('portal/client/pay', e, "Couldn't open the payment page. Nothing was charged — try again in a minute.");
  }
}
