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
  // and reach the user as a bare 500. Say what is true instead; Stripe itself
  // retries a 503 webhook.
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({
      error: "Online checkout isn't switched on yet. Email sales@saguarocontrol.net and we'll start your plan today.",
      code: 'billing_not_configured',
    }, { status: 503 });
  }
  try {
    return await handler(req);
  } catch (e) {
    return apiError(`billing/${segment}`, e, "Stripe didn't answer. Nothing was charged — please try again in a minute.");
  }
}
