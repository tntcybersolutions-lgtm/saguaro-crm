#!/usr/bin/env node
/**
 * tools/stripe-verify.mjs — read-only check of production Stripe billing and
 * Stripe Connect, run in CI with the production environment pulled from Vercel.
 *
 * Never prints or writes a key, a signing secret or a customer's details. It
 * reports only facts: which mode the key is in, the platform account's status,
 * the plan prices, the webhook endpoints (URL, events, status), the customer
 * portal settings and each connected account's charges / payouts /
 * requirements. No charge, refund, transfer, payout, customer or account is
 * created. One live Checkout Session is created for the cheapest plan to prove
 * the price can be sold, and expired at once (a session moves no money).
 *
 *   env: STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *        NEXT_PUBLIC_APP_URL, STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_WEBHOOK_SECRET
 *   out: OUT/result.json
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.OUT || 'tools/stripe-verify';
fs.mkdirSync(OUT, { recursive: true });
const KEY = (process.env.STRIPE_SECRET_KEY || '').trim();
const R = { at: new Date().toISOString(), env: {}, checks: [], facts: {} };
const check = (name, status, detail) => { R.checks.push({ name, status, detail }); console.log(`${status.padEnd(10)} ${name}`); };
const has = (k) => !!(process.env[k] || '').trim();

async function stripe(method, p, form) {
  const res = await fetch(`https://api.stripe.com${p}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Stripe-Version': '2025-02-24.acacia', ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(`${method} ${p.split('?')[0]} → ${res.status} ${j.error?.code || ''} ${j.error?.message || ''}`.trim()); e.status = res.status; throw e; }
  return j;
}
async function sb(table, query) {
  const url = `${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')}/rest/v1/${table}?${query}`;
  const res = await fetch(url, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } });
  if (!res.ok) throw new Error(`supabase ${table} ${res.status}`);
  return res.json();
}

// Which settings production has (present / missing — never values).
for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_APP_URL', 'RESEND_API_KEY']) R.env[k] = has(k) ? 'set' : 'MISSING';
R.env.key_mode = KEY.startsWith('sk_live_') || KEY.startsWith('rk_live_') ? 'live' : KEY.startsWith('sk_test_') || KEY.startsWith('rk_test_') ? 'TEST' : KEY ? 'unknown prefix' : 'none';
R.env.NEXT_PUBLIC_APP_URL_value = process.env.NEXT_PUBLIC_APP_URL || null; // public by design
const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
R.env.publishable_mode = pk.startsWith('pk_live_') ? 'live' : pk.startsWith('pk_test_') ? 'TEST' : pk ? 'unknown' : 'none';

try {
  if (!KEY) throw new Error('STRIPE_SECRET_KEY is not in the production environment (or is a Sensitive variable that cannot be read back)');

  // 1. Platform account and mode.
  const acct = await stripe('GET', '/v1/account');
  const bal = await stripe('GET', '/v1/balance');
  R.facts.platform = {
    livemode: bal.livemode, country: acct.country, default_currency: acct.default_currency,
    business_name: acct.business_profile?.name || acct.settings?.dashboard?.display_name || null,
    charges_enabled: acct.charges_enabled, payouts_enabled: acct.payouts_enabled, details_submitted: acct.details_submitted,
    requirements_currently_due: acct.requirements?.currently_due || [], requirements_past_due: acct.requirements?.past_due || [],
    disabled_reason: acct.requirements?.disabled_reason || null,
    statement_descriptor: acct.settings?.payments?.statement_descriptor || null,
  };
  check('key is live mode', bal.livemode && R.env.key_mode === 'live' ? 'READY' : 'INCOMPLETE', `key ${R.env.key_mode}, balance livemode ${bal.livemode}`);
  check('platform account can charge and pay out', acct.charges_enabled && acct.payouts_enabled ? 'READY' : 'INCOMPLETE', JSON.stringify(R.facts.platform));

  // 2. Plan prices (from the plans table) exist, are live, active and match.
  const plans = await sb('plans', 'select=id,name,is_active,price_monthly,price_annual,stripe_price_id_monthly,stripe_price_id_annual&is_active=eq.true');
  R.facts.prices = [];
  let cheapest = null;
  for (const p of plans) {
    for (const [interval, col, want] of [['month', 'stripe_price_id_monthly', p.price_monthly], ['year', 'stripe_price_id_annual', p.price_annual]]) {
      const id = p[col];
      if (!id) { R.facts.prices.push({ plan: p.id, interval, price: null, note: Number(want) > 0 ? 'NO PRICE ID' : 'quote-only plan' }); continue; }
      try {
        const pr = await stripe('GET', `/v1/prices/${id}?expand[]=product`);
        const row = { plan: p.id, interval, livemode: pr.livemode, active: pr.active, product_active: pr.product?.active, product: pr.product?.name,
          unit_amount: pr.unit_amount, currency: pr.currency, recurring: pr.recurring?.interval, matches_plans_table: pr.unit_amount === Number(want) && pr.recurring?.interval === interval };
        R.facts.prices.push(row);
        if (row.livemode && row.active && row.product_active && interval === 'month' && (!cheapest || pr.unit_amount < cheapest.amount)) cheapest = { id, amount: pr.unit_amount };
      } catch (e) { R.facts.prices.push({ plan: p.id, interval, error: e.message }); }
    }
  }
  const priced = R.facts.prices.filter((x) => x.unit_amount != null);
  const bad = priced.filter((x) => !(x.livemode && x.active && x.product_active && x.matches_plans_table));
  check('plan prices are live, active and match the plans table', priced.length && !bad.length && !R.facts.prices.some((x) => x.error || x.note === 'NO PRICE ID') ? 'READY' : 'INCOMPLETE', JSON.stringify(R.facts.prices));

  // 3. A subscription Checkout Session can be created for a live price (expired at once; no money moves).
  if (cheapest) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.saguarocontrol.net';
      const s = await stripe('POST', '/v1/checkout/sessions', {
        mode: 'subscription', 'line_items[0][price]': cheapest.id, 'line_items[0][quantity]': '1',
        'subscription_data[trial_period_days]': '14', success_url: `${appUrl}/app?checkout=verify`, cancel_url: `${appUrl}/app/billing`,
        'metadata[purpose]': 'production verification — expired immediately',
      });
      const ex = await stripe('POST', `/v1/checkout/sessions/${s.id}/expire`);
      check('subscription Checkout opens for a live price (session expired at once)', s.url && ex.status === 'expired' ? 'READY' : 'INCOMPLETE', `livemode ${s.livemode}, url host ${new URL(s.url).host}, then ${ex.status}`);
    } catch (e) { check('subscription Checkout opens for a live price', 'INCOMPLETE', e.message); }
  } else check('subscription Checkout opens for a live price', 'INCOMPLETE', 'no live, active monthly price to try');

  // 4. Webhook endpoints.
  const hooks = (await stripe('GET', '/v1/webhook_endpoints?limit=100')).data;
  R.facts.webhooks = hooks.map((h) => ({ url: h.url, status: h.status, livemode: h.livemode, api_version: h.api_version, events: h.enabled_events, application: h.application || null }));
  const billingHook = hooks.find((h) => /\/api\/billing\/webhook$/.test(h.url));
  const needBilling = ['checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.payment_succeeded', 'invoice.payment_failed'];
  const billingMissing = billingHook ? needBilling.filter((e) => !(billingHook.enabled_events.includes('*') || billingHook.enabled_events.includes(e))) : needBilling;
  check('billing webhook endpoint → /api/billing/webhook with the 5 events it handles', billingHook && billingHook.status === 'enabled' && !billingMissing.length && /saguarocontrol\.net/.test(billingHook.url) ? 'READY' : 'INCOMPLETE',
    billingHook ? `${billingHook.url} ${billingHook.status}; missing events: ${billingMissing.join(', ') || 'none'}` : 'no endpoint for /api/billing/webhook');
  const connectHook = hooks.find((h) => /\/api\/payments\/webhook$/.test(h.url));
  check('Connect webhook endpoint → /api/payments/webhook (checkout.session events on connected accounts)', connectHook && connectHook.status === 'enabled' ? 'READY' : 'INCOMPLETE',
    connectHook ? `${connectHook.url} ${connectHook.status}; events ${connectHook.enabled_events.join(', ')}` : 'no endpoint for /api/payments/webhook');
  check('webhook signing secrets set in production', has('STRIPE_WEBHOOK_SECRET') && has('STRIPE_CONNECT_WEBHOOK_SECRET') ? 'READY' : 'INCOMPLETE', `billing ${R.env.STRIPE_WEBHOOK_SECRET}, connect ${R.env.STRIPE_CONNECT_WEBHOOK_SECRET}`);

  // 5. Recent events and whether they were delivered.
  const ev = (await stripe('GET', '/v1/events?limit=25')).data;
  R.facts.recent_events = ev.map((e) => ({ type: e.type, created: new Date(e.created * 1000).toISOString().slice(0, 16), pending_webhooks: e.pending_webhooks, account: e.account ? 'connected' : 'platform' }));

  // 6. Customer portal.
  const portals = (await stripe('GET', '/v1/billing_portal/configurations?limit=10')).data;
  const def = portals.find((c) => c.is_default) || null;
  R.facts.portal = def ? { active: def.active, default_return_url: def.default_return_url, cancel: def.features?.subscription_cancel?.enabled, update: def.features?.subscription_update?.enabled,
    update_products: (def.features?.subscription_update?.products || []).length, payment_method_update: def.features?.payment_method_update?.enabled, invoice_history: def.features?.invoice_history?.enabled,
    privacy: def.business_profile?.privacy_policy_url || null, terms: def.business_profile?.terms_of_service_url || null } : null;
  check('customer portal has a live default configuration', def && def.active ? 'READY' : 'INCOMPLETE', JSON.stringify(R.facts.portal));

  // 7. Connect: platform enabled for Connect, and every company's connected account.
  try {
    const list = await stripe('GET', '/v1/accounts?limit=100');
    R.facts.connect_accounts_on_platform = list.data.length;
    check('Connect is enabled on the live platform (accounts can be listed)', 'READY', `${list.data.length} connected account(s) on the platform`);
  } catch (e) { check('Connect is enabled on the live platform', 'INCOMPLETE', e.message); }
  const tenants = await sb('tenants', 'select=id,stripe_connect_account_id,online_payments_ready&stripe_connect_account_id=not.is.null');
  R.facts.connected = [];
  for (const t of tenants) {
    try {
      const a = await stripe('GET', `/v1/accounts/${t.stripe_connect_account_id}`);
      R.facts.connected.push({ tenant: t.id.slice(0, 8), type: a.type, charges_enabled: a.charges_enabled, payouts_enabled: a.payouts_enabled, details_submitted: a.details_submitted,
        currently_due: a.requirements?.currently_due || [], past_due: a.requirements?.past_due || [], disabled_reason: a.requirements?.disabled_reason || null,
        capabilities: a.capabilities, app_says_ready: t.online_payments_ready });
    } catch (e) { R.facts.connected.push({ tenant: t.id.slice(0, 8), error: e.message }); }
  }
  check('connected accounts described as ready can charge and pay out with nothing due', !tenants.length ? 'UNVERIFIED' : R.facts.connected.every((c) => !c.app_says_ready || (c.charges_enabled && c.payouts_enabled && !c.past_due?.length && !c.currently_due?.length)) ? 'READY' : 'INCOMPLETE',
    tenants.length ? JSON.stringify(R.facts.connected) : 'no company has connected a Stripe account yet');
} catch (e) {
  R.error = e.message;
  console.log(`fatal ${e.message}`);
}
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify({ checks: R.checks.length, error: R.error || null }));
