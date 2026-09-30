#!/usr/bin/env node
/**
 * stripe-provision-prices — create the Stripe products and prices the checkout
 * flow needs, and write their ids back into the plans table.
 *
 * getStripePriceId() reads plans.stripe_price_id_monthly / _annual. Until
 * those hold real Stripe price ids, POST /api/billing/checkout answers
 * "No Stripe price configured for plan X" and nobody can subscribe. This
 * script is what fills them.
 *
 *   node tools/stripe-provision-prices.mjs            # test mode (default)
 *   node tools/stripe-provision-prices.mjs --live     # live mode, must be explicit
 *   node tools/stripe-provision-prices.mjs --dry-run  # show the plan, touch nothing
 *
 * Safe to run repeatedly. Products are matched by the saguaro_plan_id metadata
 * we set, prices by lookup_key, so a second run adopts what the first created
 * instead of making a duplicate — Stripe will happily create a second $499
 * price with the same name, and the only way to tell them apart afterwards is
 * the id.
 *
 * Prices are immutable in Stripe: you cannot edit an amount. If a plan's price
 * has changed, this creates a NEW price under the same product, points the
 * plans row at it, and leaves the old one alone so existing subscribers keep
 * billing at the rate they signed up on.
 */

import fs from 'node:fs';
import path from 'node:path';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const LIVE = process.argv.includes('--live');
const DRY  = process.argv.includes('--dry-run');

/* ── env ──────────────────────────────────────────────────────────────── */

/** Minimal .env reader — no dependency, and it must not choke on `KEY=` with
 *  an empty value, which is exactly the state this repo is in today. */
function readEnvFile(file) {
  const out = {};
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return out;
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...readEnvFile('.env'), ...readEnvFile('.env.local'), ...process.env };

const STRIPE_KEY   = env.STRIPE_SECRET_KEY || '';
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY || '';

function die(msg) { console.error(`\n  ${msg}\n`); process.exit(1); }

if (!STRIPE_KEY) {
  die(
    'STRIPE_SECRET_KEY is empty.\n' +
    '  Put your TEST secret key (it starts sk_test_) in .env.local, then run this again.\n' +
    '  Stripe dashboard -> Developers -> API keys, with the Test mode toggle ON.',
  );
}

const keyIsLive = STRIPE_KEY.startsWith('sk_live_') || STRIPE_KEY.startsWith('rk_live_');

/* The guard that matters. Running this against a live key by accident creates
   real, chargeable products in the real account, and Stripe products can be
   archived but never deleted. Live mode has to be asked for out loud. */
if (keyIsLive && !LIVE) {
  die(
    'That is a LIVE Stripe key, and --live was not passed.\n' +
    '  Live products are chargeable immediately and cannot be deleted, only archived.\n' +
    '  Use a sk_test_ key, or re-run with --live if live is genuinely what you want.',
  );
}
if (!keyIsLive && LIVE) {
  die('--live was passed but the key is a test key. Nothing to do — remove --live or swap the key.');
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  die('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env.local.');
}

const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2025-02-24.acacia' });
const db     = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const MODE = keyIsLive ? 'LIVE' : 'TEST';

/* ── the work ─────────────────────────────────────────────────────────── */

/** The product for a plan, reused if this has run before. */
async function ensureProduct(plan) {
  const existing = await stripe.products.search({
    query: `metadata['saguaro_plan_id']:'${plan.id}'`,
    limit: 1,
  });
  if (existing.data[0]) return { product: existing.data[0], created: false };

  if (DRY) return { product: { id: '(would create)', name: plan.name }, created: true };

  const product = await stripe.products.create({
    name: `Saguaro ${plan.name}`,
    metadata: { saguaro_plan_id: plan.id },
  });
  return { product, created: true };
}

/**
 * The price for one interval of one plan.
 *
 * A price's amount cannot be edited once created, so when the plans table
 * disagrees with the price Stripe holds under that lookup_key, the old price
 * has its key released and a new one takes it. Anyone already subscribed stays
 * on the old price — this only changes what new checkouts are charged.
 */
async function ensurePrice(product, plan, interval, amountCents) {
  const lookupKey = `saguaro_${plan.id}_${interval}`;
  const recurring = interval === 'monthly' ? { interval: 'month' } : { interval: 'year' };

  const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  const hit = found.data[0];

  if (hit && hit.unit_amount === amountCents && hit.active) {
    return { price: hit, action: 'reused' };
  }

  if (DRY) {
    return { price: { id: '(would create)', unit_amount: amountCents }, action: hit ? 'replaced' : 'created' };
  }

  if (hit) {
    // Free the lookup_key so the replacement can take it; keep the price itself
    // active so existing subscribers are undisturbed.
    await stripe.prices.update(hit.id, { lookup_key: '' });
  }

  const price = await stripe.prices.create({
    product:     product.id,
    currency:    'usd',
    unit_amount: amountCents,
    recurring,
    lookup_key:  lookupKey,
    metadata:    { saguaro_plan_id: plan.id, saguaro_interval: interval },
  });

  return { price, action: hit ? 'replaced' : 'created' };
}

async function main() {
  console.log(`\n  Stripe provisioning — ${MODE} mode${DRY ? ' (dry run)' : ''}\n`);

  const { data: plans, error } = await db
    .from('plans')
    .select('id, name, price_monthly, price_annual, is_active')
    .eq('is_active', true)
    .order('price_monthly');

  if (error) die(`Could not read plans: ${error.message}`);

  /* Enterprise is quote-only: price_monthly 0 is what app/app/billing keys on
     to route that button to sales instead of to checkout, so it must NOT get a
     Stripe price. */
  const sellable = plans.filter(p => (p.price_monthly ?? 0) > 0);
  const skipped  = plans.filter(p => (p.price_monthly ?? 0) === 0);

  for (const plan of skipped) {
    console.log(`  ${plan.id.padEnd(14)} quote-only, no Stripe price (correct)`);
  }

  for (const plan of sellable) {
    const { product, created } = await ensureProduct(plan);
    const monthly = await ensurePrice(product, plan, 'monthly', plan.price_monthly);
    const annual  = await ensurePrice(product, plan, 'annual',  plan.price_annual);

    console.log(`\n  ${plan.id}`);
    console.log(`    product  ${product.id} ${created ? '(created)' : '(reused)'}`);
    console.log(`    monthly  ${monthly.price.id} $${(plan.price_monthly / 100).toFixed(2)}/mo (${monthly.action})`);
    console.log(`    annual   ${annual.price.id} $${(plan.price_annual / 100).toFixed(2)}/yr (${annual.action})`);

    if (DRY) continue;

    const { error: upErr } = await db
      .from('plans')
      .update({
        stripe_price_id_monthly: monthly.price.id,
        stripe_price_id_annual:  annual.price.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', plan.id);

    if (upErr) die(`Wrote Stripe prices for ${plan.id} but could not save them: ${upErr.message}`);
    console.log(`    saved to plans.${plan.id}`);
  }

  console.log(
    DRY
      ? '\n  Dry run — nothing was created or saved.\n'
      : `\n  Done. ${sellable.length} plan(s) are now sellable in ${MODE} mode.\n`,
  );
}

main().catch(e => die(e instanceof Error ? e.message : String(e)));
