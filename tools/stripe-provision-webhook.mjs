#!/usr/bin/env node
/**
 * stripe-provision-webhook — register the billing webhook endpoint and put its
 * signing secret into .env.local.
 *
 * The signing secret is the one Stripe value you cannot look up later: it is
 * returned once, by the call that creates the endpoint, and never again. The
 * dashboard will show it to you at creation time and that is it. So this
 * script captures it at the only moment it exists and writes it straight to
 * the env file — it is never printed, and never passes through a chat window.
 *
 *   node tools/stripe-provision-webhook.mjs                 # uses NEXT_PUBLIC_APP_URL
 *   node tools/stripe-provision-webhook.mjs --url https://…  # somewhere else
 *   node tools/stripe-provision-webhook.mjs --recreate       # replace an existing one
 *
 * Without STRIPE_WEBHOOK_SECRET the handler in stripe-billing.ts answers every
 * event with 500 "Webhook not configured" — deliberately, so a missing secret
 * cannot be mistaken in the logs for someone forging requests. The visible
 * symptom is a customer who pays and never gets access, because
 * checkout.session.completed is the event that activates the subscription.
 */

import fs from 'node:fs';
import path from 'node:path';
import Stripe from 'stripe';

const ROOT      = process.cwd();
const RECREATE  = process.argv.includes('--recreate');
const urlArgIdx = process.argv.indexOf('--url');
const urlArg    = urlArgIdx > -1 ? process.argv[urlArgIdx + 1] : null;

/** The five events stripe-billing.ts actually handles. Sending more just fills
 *  the log with events that fall through the switch. */
const EVENTS = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
];

function readEnvFile(file) {
  const out = {};
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return out;
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function die(msg) { console.error(`\n  ${msg}\n`); process.exit(1); }

const env       = { ...readEnvFile('.env'), ...readEnvFile('.env.local'), ...process.env };
const STRIPE_KEY = env.STRIPE_SECRET_KEY || '';
const APP_URL    = urlArg || env.NEXT_PUBLIC_APP_URL || '';

if (!STRIPE_KEY) die('STRIPE_SECRET_KEY is empty in .env.local.');
if (!APP_URL)    die('No URL. Set NEXT_PUBLIC_APP_URL in .env.local or pass --url https://…');

const isLive = STRIPE_KEY.startsWith('sk_live_') || STRIPE_KEY.startsWith('rk_live_');
const MODE   = isLive ? 'LIVE' : 'TEST';

const endpointUrl = `${APP_URL.replace(/\/+$/, '')}/api/billing/webhook`;

/* Stripe will not deliver to localhost — it has to reach the URL from the
   internet. For local work the answer is `stripe listen`, not this script. */
if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(endpointUrl)) {
  die(
    `Stripe cannot deliver to ${endpointUrl} — it has to be reachable from the internet.\n` +
    '  For local testing use the CLI instead:\n' +
    '    stripe listen --forward-to localhost:3000/api/billing/webhook',
  );
}

const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2025-02-24.acacia' });

function writeSecret(secret) {
  const file  = path.join(ROOT, '.env.local');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let found = false;
  const out = lines.map(l => {
    if (/^STRIPE_WEBHOOK_SECRET=/.test(l)) { found = true; return `STRIPE_WEBHOOK_SECRET=${secret}`; }
    return l;
  });
  if (!found) out.push(`STRIPE_WEBHOOK_SECRET=${secret}`);
  fs.writeFileSync(file, out.join('\n'), 'utf8');
}

async function main() {
  console.log(`\n  Stripe webhook — ${MODE} mode`);
  console.log(`  ${endpointUrl}\n`);

  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const match = existing.data.find(e => e.url === endpointUrl);

  if (match && !RECREATE) {
    console.log(`  An endpoint for this URL already exists: ${match.id}`);
    console.log(`  status ${match.status}, ${match.enabled_events.length} event(s)`);
    console.log(
      '\n  Its signing secret cannot be read back — Stripe returns it only when the\n' +
      '  endpoint is created. If you do not have it, re-run with --recreate to\n' +
      '  replace the endpoint and capture a fresh secret.\n',
    );
    process.exit(0);
  }

  if (match && RECREATE) {
    await stripe.webhookEndpoints.del(match.id);
    console.log(`  removed previous endpoint ${match.id}`);
  }

  const created = await stripe.webhookEndpoints.create({
    url: endpointUrl,
    enabled_events: EVENTS,
    description: 'Saguaro CRM billing',
  });

  writeSecret(created.secret);

  console.log(`  created ${created.id}`);
  for (const e of EVENTS) console.log(`    · ${e}`);
  console.log(
    `\n  Signing secret written to .env.local (prefix whsec_, ${created.secret.length} chars).\n` +
    '  It was not printed. Open .env.local to copy it into your Vercel\n' +
    `  environment variables — ${MODE} mode events will not verify without it.\n`,
  );
}

main().catch(e => die(e instanceof Error ? e.message : String(e)));
