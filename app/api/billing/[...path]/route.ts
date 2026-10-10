import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import {
  createCheckoutHandler,
  cancelHandler,
  changePlanHandler,
  billingPortalHandler,
  getSubscriptionHandler,
  webhookHandler,
} from '../../../../stripe-billing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  if (segment === 'subscription') return getSubscriptionHandler(req);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;
  const handler = {
    checkout: createCheckoutHandler,
    cancel: cancelHandler,
    'change-plan': changePlanHandler,
    portal: billingPortalHandler,
    webhook: webhookHandler,
  }[segment];
  if (!handler) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Until Stripe is connected every one of these would throw inside stripe()
  // and reach the user as a bare 500. Say what is true instead, and log it so
  // the missing setting shows up in the server logs with a reference the
  // customer can quote. Stripe itself retries a 503 webhook.
  //
  // What production needs (Vercel → saguaro-crm → Settings → Environment
  // Variables, Production): STRIPE_SECRET_KEY (the live secret key), and for
  // the webhook STRIPE_WEBHOOK_SECRET with an endpoint pointed at
  // /api/billing/webhook. The plan prices are already in the plans table
  // (stripe_price_id_monthly / stripe_price_id_annual) and must belong to the
  // same Stripe account as the key.
  if (!process.env.STRIPE_SECRET_KEY) {
    return apiError(
      `billing/${segment}`,
      new Error('STRIPE_SECRET_KEY is not set — online billing is not configured on this deployment'),
      "Online checkout isn't switched on yet, so nothing was charged. Email sales@saguarocontrol.net and we'll start your plan today.",
      503,
    );
  }
  try {
    return await handler(req);
  } catch (e) {
    return apiError(`billing/${segment}`, e, "Stripe didn't answer. Nothing was charged — please try again in a minute.");
  }
}
