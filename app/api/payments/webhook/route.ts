import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { recordInvoicePayment, stripeClient } from '@/lib/online-payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/payments/webhook — Stripe Connect events from the companies'
 * accounts. A card payment arrives as checkout.session.completed (paid); a bank
 * (ACH) payment completes days later as checkout.session.async_payment_succeeded.
 * Recording is idempotent (one portal_payments row per Checkout session).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    // Stripe retries a 503; the log names the missing setting.
    return apiError('payments/webhook', new Error('STRIPE_CONNECT_WEBHOOK_SECRET / STRIPE_SECRET_KEY not set'), 'Payments webhook is not configured.', 503);
  }
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(raw, req.headers.get('stripe-signature') || '', secret);
  } catch {
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
  }
  const db = createServerClient() as any;
  try {
    const s = event.data.object as Stripe.Checkout.Session;
    const paidNow =
      (event.type === 'checkout.session.completed' && s.payment_status === 'paid') ||
      event.type === 'checkout.session.async_payment_succeeded';
    if (paidNow) await recordInvoicePayment(db, s as any);
    await db.from('stripe_webhook_events').insert({ event_id: event.id, event_type: event.type, received_at: new Date().toISOString(), processed_at: new Date().toISOString() });
    return NextResponse.json({ received: true });
  } catch (e) {
    await db.from('stripe_webhook_events').insert({ event_id: event.id, event_type: event.type, received_at: new Date().toISOString(), error: String((e as Error)?.message || e).slice(0, 500) });
    return apiError('payments/webhook', e, 'Payment could not be recorded.');
  }
}
