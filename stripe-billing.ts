/**
 * stripe-billing.ts
 *
 * Complete Stripe billing integration for Saguaro CRM.
 *
 * Handles the full purchase lifecycle:
 *   1. createCheckoutSession()    — sends user to Stripe-hosted checkout
 *   2. handleStripeWebhook()      — processes all Stripe events
 *   3. createBillingPortalSession() — lets users manage their subscription
 *   4. cancelSubscription()       — cancels at period end
 *   5. changePlan()               — upgrades/downgrades mid-cycle
 *   6. trackUsage()               — records AI usage against plan limits
 *   7. checkUsageLimit()          — gate AI features by plan limits
 *
 * Webhook events handled:
 *   checkout.session.completed       → activate subscription, provision tenant
 *   customer.subscription.updated   → sync plan changes
 *   customer.subscription.deleted   → mark canceled, send win-back email
 *   invoice.payment_succeeded        → record payment, send receipt
 *   invoice.payment_failed           → send dunning email, mark past_due
 *
 * Mount as:
 *   POST /api/billing/checkout        → createCheckoutHandler
 *   POST /api/billing/webhook         → webhookHandler (no auth — Stripe-signed)
 *   POST /api/billing/portal          → billingPortalHandler
 *   GET  /api/billing/subscription    → getSubscriptionHandler
 *   POST /api/billing/cancel          → cancelHandler
 *   POST /api/billing/change-plan     → changePlanHandler
 */

import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from './supabase/admin';
import { Resend } from 'resend';

// ─────────────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────────────

function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not set');
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
}

function resend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM    = process.env.EMAIL_FROM    ?? 'Saguaro CRM <noreply@mail.saguarocrm.com>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.saguarocrm.com';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: CORS-OK JSON response
// ─────────────────────────────────────────────────────────────────────────────

function ok(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status });
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan → Stripe price ID mapping (prices live in DB + env fallback)
// ─────────────────────────────────────────────────────────────────────────────

async function getStripePriceId(planId: string, interval: 'monthly' | 'annual'): Promise<string | null> {
  const col = interval === 'monthly' ? 'stripe_price_monthly' : 'stripe_price_annual';

  const { data } = await supabaseAdmin
    .from('plans')
    .select(col)
    .eq('id', planId)
    .single();

  return (data?.[col as keyof typeof data] as string | null | undefined) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CREATE CHECKOUT SESSION
// POST /api/billing/checkout
// Body: { planId, interval, tenantId, email, successUrl?, cancelUrl?, couponCode? }
// ─────────────────────────────────────────────────────────────────────────────

export async function createCheckoutHandler(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const planId   = String(body.planId   ?? '');
  const interval = String(body.interval ?? 'monthly') as 'monthly' | 'annual';
  const tenantId = String(body.tenantId ?? '');
  const email    = String(body.email    ?? '').toLowerCase().trim();

  if (!planId || !tenantId || !email) {
    return err('planId, tenantId, and email are required');
  }

  const priceId = await getStripePriceId(planId, interval);
  if (!priceId) {
    return err(`No Stripe price configured for plan '${planId}' ${interval}. Contact support.`);
  }

  const s = stripe();

  // Fetch or create Stripe customer
  let stripeCustomerId: string | undefined;
  const { data: existingSub } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (existingSub?.stripe_customer_id) {
    stripeCustomerId = existingSub.stripe_customer_id as string;
  } else {
    const customer = await s.customers.create({
      email,
      metadata: { tenantId, planId },
    });
    stripeCustomerId = customer.id;
  }

  // Apply referral/coupon discounts
  const discounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];
  if (body.couponCode) {
    discounts.push({ coupon: String(body.couponCode) });
  }

  const session = await s.checkout.sessions.create({
    customer:   stripeCustomerId,
    mode:       'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    discounts:  discounts.length ? discounts : undefined,
    allow_promotion_codes: !discounts.length,
    subscription_data: {
      trial_period_days: 30,
      metadata: { tenantId, planId, interval, email },
    },
    metadata: { tenantId, planId, interval, email },
    success_url: body.successUrl
      ? String(body.successUrl)
      : `${APP_URL}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: body.cancelUrl
      ? String(body.cancelUrl)
      : `${APP_URL}/pricing?checkout=canceled`,
    customer_update: { address: 'auto' },
    billing_address_collection: 'required',
    phone_number_collection: { enabled: false },
  });

  return ok({ checkoutUrl: session.url, sessionId: session.id });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. STRIPE WEBHOOK HANDLER
// POST /api/billing/webhook  (no auth — raw body needed for signature verification)
// ─────────────────────────────────────────────────────────────────────────────

export async function webhookHandler(request: NextRequest) {
  const rawBody = await request.text();
  const sig     = request.headers.get('stripe-signature') ?? '';
  const secret  = process.env.STRIPE_WEBHOOK_SECRET ?? '';

  const s = stripe();
  let event: Stripe.Event;

  try {
    event = s.webhooks.constructEvent(rawBody, sig, secret);
  } catch (e) {
    console.error('[Webhook] Signature verification failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log(`[Webhook] ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, s);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoiceFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        // Unhandled event — not an error, just ignore
        break;
    }
  } catch (err) {
    console.error(`[Webhook] Error handling ${event.type}:`, err instanceof Error ? err.message : err);
    // Return 200 so Stripe doesn't retry — log for investigation
    return ok({ received: true, warning: 'Handler error — check logs' });
  }

  return ok({ received: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook sub-handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  s: Stripe,
) {
  const meta       = session.metadata ?? {};
  const tenantId   = meta.tenantId;
  const planId     = meta.planId;
  const interval   = (meta.interval ?? 'monthly') as 'monthly' | 'annual';
  const email      = meta.email ?? session.customer_email ?? '';
  const stripeSubId = session.subscription as string | null;

  if (!tenantId || !planId) {
    console.warn('[Webhook] checkout.session.completed missing tenantId/planId in metadata');
    return;
  }

  // Fetch subscription from Stripe to get price amount
  let priceCents = 0;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let trialEnd: string | null = null;

  if (stripeSubId) {
    const stripeSub = await s.subscriptions.retrieve(stripeSubId);
    priceCents   = stripeSub.items.data[0]?.price?.unit_amount ?? 0;
    periodStart  = new Date(stripeSub.current_period_start * 1000).toISOString();
    periodEnd    = new Date(stripeSub.current_period_end   * 1000).toISOString();
    trialEnd     = stripeSub.trial_end
      ? new Date(stripeSub.trial_end * 1000).toISOString()
      : null;
  }

  const now = new Date().toISOString();

  // Upsert the subscription record
  await supabaseAdmin.from('subscriptions').upsert(
    {
      tenant_id:             tenantId,
      plan_id:               planId,
      billing_interval:      interval,
      status:                trialEnd ? 'trialing' : 'active',
      stripe_customer_id:    session.customer as string,
      stripe_subscription_id: stripeSubId ?? null,
      price_cents:           priceCents,
      trial_ends_at:         trialEnd,
      current_period_start:  periodStart,
      current_period_end:    periodEnd,
      updated_at:            now,
    },
    { onConflict: 'tenant_id' },
  );

  // Mark lead as converted if found
  await supabaseAdmin
    .from('leads')
    .update({
      status:               'converted',
      converted_at:         now,
      converted_plan_id:    planId,
      converted_tenant_id:  tenantId,
      updated_at:           now,
    })
    .eq('email', email)
    .in('status', ['new','contacted','demo_scheduled','trial']);

  // Initialize usage tracking for this period
  if (periodStart && periodEnd) {
    await supabaseAdmin.from('usage_tracking').insert({
      tenant_id:      tenantId,
      period_start:   periodStart.split('T')[0],
      period_end:     periodEnd.split('T')[0],
      created_at:     now,
    }).then(() => null);
  }

  // Send welcome email
  await sendWelcomeEmail(email, planId, tenantId, trialEnd);

  // If this is a white-label plan, kick off provisioning
  if (planId.startsWith('white_label')) {
    await supabaseAdmin
      .from('reseller_accounts')
      .update({ status: 'onboarding', updated_at: now })
      .eq('tenant_id', tenantId);

    await sendWhiteLabelOnboardingEmail(email, tenantId);
  }

  console.log(`[Webhook] Subscription activated for tenant ${tenantId} on plan ${planId}`);
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const tenantId = sub.metadata?.tenantId;
  if (!tenantId) return;

  const priceCents = sub.items.data[0]?.price?.unit_amount ?? 0;
  const interval   = sub.items.data[0]?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly';
  const planId     = sub.metadata?.planId ?? '';

  await supabaseAdmin
    .from('subscriptions')
    .update({
      status:               sub.status as string,
      plan_id:              planId || undefined,
      billing_interval:     interval,
      price_cents:          priceCents,
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end:   new Date(sub.current_period_end   * 1000).toISOString(),
      cancel_at:            sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
      updated_at:           new Date().toISOString(),
    })
    .eq('tenant_id', tenantId);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const tenantId = sub.metadata?.tenantId;
  if (!tenantId) return;

  await supabaseAdmin
    .from('subscriptions')
    .update({
      status:       'canceled',
      canceled_at:  new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    })
    .eq('tenant_id', tenantId);

  // Send churn win-back email
  const email = sub.metadata?.email ?? '';
  if (email) await sendChurnEmail(email, tenantId, sub.metadata?.planId ?? '');
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const tenantId = invoice.metadata?.tenantId ??
    ((invoice.subscription_details?.metadata as Record<string,string> | null)?.tenantId);
  if (!tenantId) return;

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (sub) {
    await supabaseAdmin.from('subscription_invoices').insert({
      subscription_id:   sub.id as string,
      tenant_id:         tenantId,
      stripe_invoice_id: invoice.id,
      stripe_charge_id:  typeof invoice.charge === 'string' ? invoice.charge : invoice.charge?.id ?? null,
      amount_cents:      invoice.amount_paid,
      status:            'paid',
      paid_at:           invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : new Date().toISOString(),
      period_start:      invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
      period_end:        invoice.period_end   ? new Date(invoice.period_end   * 1000).toISOString() : null,
      invoice_pdf_url:   invoice.invoice_pdf ?? null,
      created_at:        new Date().toISOString(),
    });

    // Update subscription status to active if it was past_due
    await supabaseAdmin
      .from('subscriptions')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('status', 'past_due');
  }
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  const tenantId = invoice.metadata?.tenantId ??
    ((invoice.subscription_details?.metadata as Record<string,string> | null)?.tenantId);
  if (!tenantId) return;

  await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'past_due', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId);

  const email = (invoice.customer_email ?? invoice.metadata?.email) ?? null;
  if (email) await sendPaymentFailedEmail(email, invoice.amount_due, invoice.hosted_invoice_url ?? null);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. BILLING PORTAL  (let customers manage their own subscription)
// POST /api/billing/portal
// ─────────────────────────────────────────────────────────────────────────────

export async function billingPortalHandler(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const tenantId = String(body?.tenantId ?? '');
  if (!tenantId) return err('tenantId required');

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!sub?.stripe_customer_id) return err('No active subscription found');

  const s = stripe();
  const session = await s.billingPortal.sessions.create({
    customer:   sub.stripe_customer_id as string,
    return_url: body?.returnUrl ?? `${APP_URL}/app/settings/billing`,
  });

  return ok({ portalUrl: session.url });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET SUBSCRIPTION
// GET /api/billing/subscription?tenantId=xxx
// ─────────────────────────────────────────────────────────────────────────────

export async function getSubscriptionHandler(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return err('tenantId required');

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select(`
      *,
      plans(name, monthly_price_cents, annual_price_cents, ai_takeoffs_per_month,
            feature_bid_intelligence, feature_white_label, feature_api_access, feature_unlimited_ai)
    `)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!sub) return ok({ hasSubscription: false, isTrialing: false });

  // Get current usage
  const today = new Date().toISOString().split('T')[0];
  const { data: usage } = await supabaseAdmin
    .from('usage_tracking')
    .select('*')
    .eq('tenant_id', tenantId)
    .lte('period_start', today)
    .gte('period_end', today)
    .maybeSingle();

  return ok({
    hasSubscription: true,
    subscription: sub,
    usage: usage ?? null,
    isTrialing:   sub.status === 'trialing',
    isActive:     ['trialing','active'].includes(sub.status as string),
    isPastDue:    sub.status === 'past_due',
    isCanceled:   sub.status === 'canceled',
    daysUntilRenewal: sub.current_period_end
      ? Math.max(0, Math.ceil(
          (new Date(sub.current_period_end as string).getTime() - Date.now()) / 86400000,
        ))
      : null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. CANCEL SUBSCRIPTION
// POST /api/billing/cancel
// ─────────────────────────────────────────────────────────────────────────────

export async function cancelHandler(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const tenantId = String(body?.tenantId ?? '');
  if (!tenantId) return err('tenantId required');

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_subscription_id, stripe_customer_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) return err('No active subscription found');

  const s = stripe();

  // Retention offer: apply a 20% discount coupon before canceling.
  // Creates the coupon if it doesn't exist, applies once to next invoice.
  let retentionCouponId: string | null = null;
  try {
    const coupon = await s.coupons.create({
      percent_off: 20,
      duration:    'once',
      name:        'Retention Offer — 20% off',
      max_redemptions: 1,
    });
    retentionCouponId = coupon.id;
  } catch { /* non-fatal — proceed with cancel if coupon creation fails */ }

  // Cancel at period end — customer keeps access through paid period
  const updated = await s.subscriptions.update(sub.stripe_subscription_id as string, {
    cancel_at_period_end: true,
    metadata: { cancel_reason: body?.reason ?? 'user_requested' },
  });

  await supabaseAdmin
    .from('subscriptions')
    .update({
      cancel_at:  new Date(updated.cancel_at! * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId);

  // Send retention email with the discount offer
  const r = resend();
  const cancelEmail = body?.email as string | undefined;
  if (r && cancelEmail) {
    await r.emails.send({
      from: FROM,
      to:   cancelEmail,
      subject: 'We want you to stay — here\'s 20% off your next month',
      html: `
        <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#2d3748">
          <h2 style="color:#1b3a5c">Before you go — we have an offer.</h2>
          <p>We noticed you just canceled your Saguaro subscription. We're sorry to see you go.</p>
          <p>If cost was a factor, we'd like to offer you <strong>20% off your next month</strong> — no strings attached.</p>
          <p>If there was a feature issue or something wasn't working, <strong>reply to this email</strong> and our team will personally help you within 24 hours.</p>
          ${retentionCouponId ? `<p><a href="${APP_URL}/billing/reactivate?coupon=${retentionCouponId}" style="display:inline-block;background:#e07b39;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700">Stay &amp; Save 20% This Month</a></p>` : ''}
          <p style="font-size:13px;color:#718096">Your account stays active until ${updated.cancel_at ? new Date(updated.cancel_at * 1000).toLocaleDateString() : 'end of billing period'}. You can reactivate any time.</p>
        </div>
      `,
    });
  }

  return ok({
    success:          true,
    cancelAt:         updated.cancel_at ? new Date(updated.cancel_at * 1000).toISOString() : null,
    retentionCoupon:  retentionCouponId,
    message:          'Your subscription will remain active until the end of your billing period.',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. CHANGE PLAN (upgrade / downgrade)
// POST /api/billing/change-plan
// Body: { tenantId, newPlanId, newInterval }
// ─────────────────────────────────────────────────────────────────────────────

export async function changePlanHandler(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const tenantId    = String(body?.tenantId    ?? '');
  const newPlanId   = String(body?.newPlanId   ?? '');
  const newInterval = (String(body?.newInterval ?? 'monthly')) as 'monthly' | 'annual';

  if (!tenantId || !newPlanId) return err('tenantId and newPlanId are required');

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) return err('No active subscription found');

  const newPriceId = await getStripePriceId(newPlanId, newInterval);
  if (!newPriceId) return err(`No Stripe price configured for plan '${newPlanId}'`);

  const s = stripe();
  const stripeSub = await s.subscriptions.retrieve(sub.stripe_subscription_id as string);

  // Swap price on existing subscription (prorated)
  await s.subscriptions.update(sub.stripe_subscription_id as string, {
    items: [{
      id:    stripeSub.items.data[0].id,
      price: newPriceId,
    }],
    proration_behavior: 'create_prorations',
    metadata: { planId: newPlanId, interval: newInterval },
  });

  return ok({ success: true, message: 'Plan updated. Proration will be applied on your next invoice.' });
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. FEATURE FLAG ENFORCEMENT
// Call this at the START of any premium API endpoint.
// Returns { allowed: true } or throws a 403 with an upgrade prompt.
//
// Usage:
//   const access = await checkFeatureAccess(tenantId, 'bid_intelligence');
//   if (!access.allowed) return Response.json({ error: access.message, upgradeUrl: access.upgradeUrl }, { status: 403 });
// ─────────────────────────────────────────────────────────────────────────────

type Feature =
  | 'bid_intelligence'
  | 'unlimited_ai'
  | 'white_label'
  | 'api_access'
  | 'custom_ai'
  | 'sso';

const FEATURE_PLAN_MAP: Record<Feature, string[]> = {
  bid_intelligence: ['professional', 'enterprise', 'white_label_growth', 'white_label_agency'],
  unlimited_ai:     ['professional', 'enterprise', 'white_label_growth', 'white_label_agency'],
  white_label:      ['enterprise', 'white_label_growth', 'white_label_agency'],
  api_access:       ['enterprise', 'white_label_agency'],
  custom_ai:        ['enterprise', 'white_label_agency'],
  sso:              ['enterprise', 'white_label_agency'],
};

const FEATURE_UPGRADE_MESSAGE: Record<Feature, string> = {
  bid_intelligence: 'Bid Intelligence is available on Professional and Enterprise plans. Upgrade to unlock win/loss analysis, opportunity scoring, and pricing strategy recommendations.',
  unlimited_ai:     'Unlimited AI takeoffs are available on Professional and Enterprise plans. You have used your monthly allocation on Starter.',
  white_label:      'White-label platform is available on Enterprise and White-Label plans.',
  api_access:       'API access is available on Enterprise and Agency plans.',
  custom_ai:        'Custom AI training is available on Enterprise and Agency plans.',
  sso:              'SSO/SAML integration is available on Enterprise and Agency plans.',
};

export async function checkFeatureAccess(
  tenantId: string,
  feature: Feature,
): Promise<{ allowed: boolean; planId: string | null; message?: string; upgradeUrl?: string }> {
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('plan_id, status')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  // No subscription → sandbox or trial (allow basic features only)
  if (!sub) {
    const basicFeatures: Feature[] = []; // sandbox users get no premium features by default
    if (basicFeatures.includes(feature)) return { allowed: true, planId: null };
    return {
      allowed:    false,
      planId:     null,
      message:    FEATURE_UPGRADE_MESSAGE[feature],
      upgradeUrl: `${APP_URL}/pricing`,
    };
  }

  // Inactive subscription
  if (!['trialing', 'active'].includes(sub.status as string)) {
    return {
      allowed:    false,
      planId:     sub.plan_id as string,
      message:    'Your subscription is inactive. Please update your billing to continue.',
      upgradeUrl: `${APP_URL}/app/settings/billing`,
    };
  }

  const allowedPlans = FEATURE_PLAN_MAP[feature];
  const planId = sub.plan_id as string;

  if (!allowedPlans.includes(planId)) {
    return {
      allowed:    false,
      planId,
      message:    FEATURE_UPGRADE_MESSAGE[feature],
      upgradeUrl: `${APP_URL}/pricing`,
    };
  }

  return { allowed: true, planId };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. TRACK AI USAGE + CHECK LIMITS
// ─────────────────────────────────────────────────────────────────────────────

export async function trackAiTakeoff(tenantId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number | null;
  overagePrice?: number;
}> {
  const today = new Date().toISOString().split('T')[0];

  // Fetch subscription + plan limits
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select(`
      plan_id, status,
      plans(ai_takeoffs_per_month, feature_unlimited_ai)
    `)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!sub || !['trialing','active'].includes(sub.status as string)) {
    return { allowed: false, used: 0, limit: 0 };
  }

  const plan = (sub as Record<string, unknown>).plans as Record<string, unknown> | null;
  const unlimitedAi = plan?.feature_unlimited_ai as boolean ?? false;
  const limit       = unlimitedAi ? null : (plan?.ai_takeoffs_per_month as number | null ?? 10);

  // Get current period usage
  const { data: usage } = await supabaseAdmin
    .from('usage_tracking')
    .select('id, ai_takeoffs_used')
    .eq('tenant_id', tenantId)
    .lte('period_start', today)
    .gte('period_end', today)
    .maybeSingle();

  const used = (usage?.ai_takeoffs_used as number) ?? 0;

  if (limit !== null && used >= limit) {
    return { allowed: false, used, limit, overagePrice: 2900 }; // $29 per overage
  }

  // Increment usage
  if (usage) {
    await supabaseAdmin
      .from('usage_tracking')
      .update({
        ai_takeoffs_used: used + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', usage.id);
  }

  return { allowed: true, used: used + 1, limit };
}

// ─────────────────────────────────────────────────────────────────────────────
// Email helpers
// ─────────────────────────────────────────────────────────────────────────────

async function sendWelcomeEmail(
  email: string,
  planId: string,
  tenantId: string,
  trialEnd: string | null,
) {
  const r = resend();
  if (!r || !email) return;

  const planNames: Record<string, string> = {
    starter:              'Starter',
    professional:         'Professional',
    enterprise:           'Enterprise',
    white_label_growth:   'White-Label Growth',
    white_label_agency:   'White-Label Agency',
  };
  const planName = planNames[planId] ?? planId;

  await r.emails.send({
    from:    FROM,
    to:      email,
    subject: `Welcome to Saguaro ${planName} — You're all set!`,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#2d3748">
        <div style="background:#1b3a5c;padding:24px 32px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:22px">Welcome to Saguaro CRM</h1>
          <p style="color:#a8c4e0;margin:4px 0 0;font-size:13px">${planName} Plan</p>
        </div>
        <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:28px 32px;border-radius:0 0 8px 8px">
          ${trialEnd
            ? `<p>Your <strong>30-day free trial</strong> is now active. No charge until ${new Date(trialEnd).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}.</p>`
            : `<p>Your <strong>${planName}</strong> subscription is now active.</p>`
          }
          <p>Here's what to do first:</p>
          <ol style="line-height:2">
            <li><strong>Upload your first blueprint</strong> — AI takeoff runs in under 60 seconds</li>
            <li><strong>Add your team</strong> — unlimited users on all plans</li>
            <li><strong>Connect QuickBooks</strong> — go to Settings → Integrations</li>
          </ol>
          <a href="${APP_URL}/app" style="display:inline-block;background:#e07b39;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px">Open Your Dashboard →</a>
          <p style="margin-top:24px;font-size:13px;color:#718096">Questions? Reply to this email or chat with our AI at any time.</p>
        </div>
      </div>
    `,
  });
}

async function sendChurnEmail(email: string, tenantId: string, planId: string) {
  const r = resend();
  if (!r || !email) return;

  await r.emails.send({
    from:    FROM,
    to:      email,
    subject: 'Your Saguaro subscription has been canceled',
    html: `
      <p>We're sorry to see you go. Your account data is preserved for 90 days.</p>
      <p>If you canceled by mistake or want to reactivate, <a href="${APP_URL}/pricing">click here</a>.</p>
      <p>If there was a specific reason you canceled, we'd love to hear it — reply to this email.</p>
      <p>— The Saguaro Team</p>
    `,
  });
}

async function sendPaymentFailedEmail(
  email: string,
  amountCents: number,
  invoiceUrl: string | null,
) {
  const r = resend();
  if (!r || !email) return;

  const amount = `$${(amountCents / 100).toFixed(2)}`;
  await r.emails.send({
    from:    FROM,
    to:      email,
    subject: `Action Required: Payment of ${amount} failed — Saguaro CRM`,
    html: `
      <p>We were unable to process your payment of <strong>${amount}</strong>.</p>
      <p>Your account remains active for now. Please update your payment method to avoid interruption.</p>
      ${invoiceUrl ? `<p><a href="${invoiceUrl}" style="color:#e07b39;font-weight:700">Update Payment Method →</a></p>` : ''}
      <p>Stripe will retry the charge in 3 days. If payment fails again, your account will be paused.</p>
      <p>Need help? Reply to this email or call us.</p>
    `,
  });
}

async function sendWhiteLabelOnboardingEmail(email: string, tenantId: string) {
  const r = resend();
  if (!r || !email) return;

  await r.emails.send({
    from:    FROM,
    to:      email,
    replyTo: process.env.SALES_EMAIL ?? 'sales@saguarocrm.com',
    subject: 'Your Saguaro White-Label Platform — Next Steps',
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#1b3a5c">Your White-Label Platform is Being Set Up</h2>
        <p>Your payment was successful. Here's what happens next:</p>
        <ol style="line-height:2.2">
          <li><strong>Today:</strong> You'll receive your branding setup form. Upload your logo, set colors, and enter your custom domain.</li>
          <li><strong>Day 1–3:</strong> Set up your DNS record (we send you the exact CNAME value). Takes 5 minutes.</li>
          <li><strong>Day 3–5:</strong> We verify DNS and provision your SSL certificate. Your branded platform goes live.</li>
          <li><strong>Day 5–7:</strong> Onboarding call with your dedicated account manager to walk through everything.</li>
        </ol>
        <p><strong>While you wait</strong>, complete your brand settings:</p>
        <a href="${APP_URL}/app/white-label/setup?tenant=${tenantId}" style="display:inline-block;background:#1b3a5c;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:700">Set Up My Brand →</a>
        <p style="margin-top:24px;font-size:13px;color:#718096">Your account manager will call you within 24 hours. Reply to this email if you have urgent questions.</p>
      </div>
    `,
  });
}
