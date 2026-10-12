import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { invoiceCheckoutUrl, PaymentsUnavailable } from '@/lib/online-payments';

/**
 * POST /api/portal/invoice/pay { token } — pay from the emailed invoice link.
 * The invoice's unguessable public token is the auth (same as viewing it).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token : '';
    if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
    const db = createServerClient() as any;
    const { data: inv } = await db.from('invoices')
      .select('id, tenant_id, project_id, invoice_number, amount, tax, total, paid_amount, status, direction')
      .eq('public_token', token).eq('direction', 'receivable').maybeSingle();
    if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    const url = await invoiceCheckoutUrl(db, inv, req.nextUrl.origin, `/portals/invoice/${token}`);
    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof PaymentsUnavailable) return NextResponse.json({ error: e.message }, { status: 409 });
    return apiError('portal/invoice/pay', e, "Couldn't open the payment page. Nothing was charged — try again in a minute.");
  }
}
