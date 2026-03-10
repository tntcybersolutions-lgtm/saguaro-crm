import { NextRequest, NextResponse } from 'next/server';
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

  if (segment === 'checkout')    return createCheckoutHandler(req);
  if (segment === 'cancel')      return cancelHandler(req);
  if (segment === 'change-plan') return changePlanHandler(req);
  if (segment === 'portal')      return billingPortalHandler(req);
  if (segment === 'webhook')     return webhookHandler(req);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
