/**
 * app/api/stripe/webhook/route.ts
 *
 * Stripe webhook endpoint — receives raw body (required for signature verification).
 *
 * Events handled:
 *   checkout.session.completed  → activate tenant subscription, clear trial gate
 *   customer.subscription.updated → sync plan changes (upgrade/downgrade)
 *   customer.subscription.deleted → mark tenant as canceled
 *   invoice.payment_succeeded   → mark subscription active (clears past_due)
 *   invoice.payment_failed      → mark subscription past_due
 *
 * After checkout.session.completed:
 *   - tenants.plan is set to planId (silver/gold/platinum)
 *   - tenants.expires_at is set to 1 year from now (far future = never expires for middleware)
 *   - subscriptions row is upserted
 *
 * Configure in Stripe Dashboard:
 *   Endpoint URL: https://www.saguarocontrol.net/api/stripe/webhook
 *   Events: checkout.session.completed, customer.subscription.*, invoice.payment_*
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Must be raw body — do NOT use request.json()
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function verifyStripeSignature(
  rawBody: string,
  signature: string,
  secret: string
): Promise<unknown | null> {
  // Stripe signature: t=timestamp,v1=hash
  const parts = signature.split(',');
  const tPart = parts.find(p => p.startsWith('t='));
  if (!tPart) return null;
  const timestamp = tPart.slice(2);
  const signedPayload = `${timestamp}.${rawBody}`;

  // Use Web Crypto API (Edge-safe HMAC-SHA256)
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(signedPayload);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const computedHex = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const expectedSig = parts.find(p => p.startsWith('v1='))?.slice(3) ?? '';
  if (computedHex !== expectedSig) return null;

  // Check timestamp is within 5 minutes (replay attack prevention)
  const eventTime = parseInt(timestamp, 10);
  if (Math.abs(Date.now() / 1000 - eventTime) > 300) return null;

  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

// Map planId to a human-readable plan name for emails
const PLAN_NAMES: Record<string, string> = {
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  enterprise: 'Enterprise',
};

// Far-future date for paid subscribers — middleware will never block them
const PAID_EXPIRES_AT = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

  if (!webhookSecret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  let event: Record<string, unknown>;
  try {
    const verified = await verifyStripeSignature(rawBody, signature, webhookSecret);
    if (!verified) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
    event = verified as Record<string, unknown>;
  } catch (e) {
    console.error('[stripe/webhook] Signature error:', e);
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 400 });
  }

  const eventType = event.type as string;
  const data = (event.data as Record<string, unknown>)?.object as Record<string, unknown>;
  const db = supabaseAdmin();

  try {
    switch (eventType) {

      // ── New subscription started (free trial or paid checkout) ──────────────
      case 'checkout.session.completed': {
        const meta = (data.metadata as Record<string, string>) ?? {};
        const tenantId = meta.tenantId;
        const planId = meta.planId ?? 'silver';
        const interval = (meta.interval ?? 'monthly') as string;
        const email = meta.email ?? (data.customer_email as string) ?? '';
        const stripeCustomerId = data.customer as string;
        const stripeSubId = data.subscription as string | null;

        if (!tenantId) {
          console.warn('[stripe/webhook] checkout.session.completed missing tenantId');
          break;
        }

        const now = new Date().toISOString();
        const paidExpiry = PAID_EXPIRES_AT();

        // Update tenant: set plan + clear the trial expiry gate (far-future date)
        await db.from('tenants').update({
          plan: planId,
          trial_ends_at: paidExpiry,
          expires_at: paidExpiry,
          updated_at: now,
        }).eq('id', tenantId);

        // Upsert subscription record
        await db.from('subscriptions').upsert({
          tenant_id: tenantId,
          plan_id: planId,
          billing_interval: interval,
          status: 'active',
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubId ?? null,
          updated_at: now,
        }, { onConflict: 'tenant_id' });

        console.log(`[stripe/webhook] Subscription activated: tenant=${tenantId} plan=${planId}`);
        break;
      }

      // ── Subscription upgraded / downgraded ────────────────────────────────
      case 'customer.subscription.updated': {
        const meta = (data.metadata as Record<string, string>) ?? {};
        const tenantId = meta.tenantId;
        if (!tenantId) break;

        const items = (data.items as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
        const price = items[0]?.price as Record<string, unknown> | undefined;
        const recurring = price?.recurring as Record<string, unknown> | undefined;
        const priceInterval = recurring?.interval === 'year' ? 'annual' : 'monthly';
        const newPlanId = (meta.planId as string) ?? '';
        const status = (data.status as string) ?? 'active';
        const now = new Date().toISOString();

        const isActive = ['active', 'trialing'].includes(status);

        // Update tenant plan and clear expiry gate if subscription is active
        const tenantUpdate: Record<string, unknown> = { updated_at: now };
        if (newPlanId) tenantUpdate.plan = newPlanId;
        if (isActive) {
          tenantUpdate.trial_ends_at = PAID_EXPIRES_AT();
          tenantUpdate.expires_at = PAID_EXPIRES_AT();
        }

        await db.from('tenants').update(tenantUpdate).eq('id', tenantId);

        await db.from('subscriptions').update({
          status,
          plan_id: newPlanId || undefined,
          billing_interval: priceInterval,
          updated_at: now,
        }).eq('tenant_id', tenantId);

        console.log(`[stripe/webhook] Subscription updated: tenant=${tenantId} plan=${newPlanId} status=${status}`);
        break;
      }

      // ── Subscription canceled ─────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const meta = (data.metadata as Record<string, string>) ?? {};
        const tenantId = meta.tenantId;
        if (!tenantId) break;

        const now = new Date().toISOString();

        // Set plan back to 'canceled' — middleware will block access
        await db.from('tenants').update({
          plan: 'canceled',
          trial_ends_at: now,
          expires_at: now, // expired immediately
          updated_at: now,
        }).eq('id', tenantId);

        await db.from('subscriptions').update({
          status: 'canceled',
          canceled_at: now,
          updated_at: now,
        }).eq('tenant_id', tenantId);

        console.log(`[stripe/webhook] Subscription canceled: tenant=${tenantId}`);
        break;
      }

      // ── Payment succeeded (clears past_due) ───────────────────────────────
      case 'invoice.payment_succeeded': {
        const subMeta = ((data.subscription_details as Record<string, unknown>)?.metadata as Record<string, string>) ?? {};
        const tenantId = subMeta.tenantId ?? (data.metadata as Record<string, string>)?.tenantId;
        if (!tenantId) break;

        const now = new Date().toISOString();

        await db.from('subscriptions')
          .update({ status: 'active', updated_at: now })
          .eq('tenant_id', tenantId)
          .eq('status', 'past_due');

        // Restore access if previously canceled/expired
        await db.from('tenants')
          .update({ trial_ends_at: PAID_EXPIRES_AT(), expires_at: PAID_EXPIRES_AT(), updated_at: now })
          .eq('id', tenantId)
          .in('plan', ['canceled', 'trial']);

        break;
      }

      // ── Payment failed ────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const subMeta = ((data.subscription_details as Record<string, unknown>)?.metadata as Record<string, string>) ?? {};
        const tenantId = subMeta.tenantId ?? (data.metadata as Record<string, string>)?.tenantId;
        if (!tenantId) break;

        await db.from('subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('tenant_id', tenantId);

        break;
      }

      default:
        // Unknown event type — ignore silently
        break;
    }
  } catch (err) {
    console.error(`[stripe/webhook] Error handling ${eventType}:`, err);
    // Return 200 so Stripe doesn't retry — investigate via Stripe dashboard
    return NextResponse.json({ received: true, warning: 'Handler error' });
  }

  return NextResponse.json({ received: true });
}
