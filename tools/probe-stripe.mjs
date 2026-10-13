/**
 * tools/probe-stripe.mjs — production Stripe readiness, from the outside, writing nothing.
 *
 *   signed in (the company CI user):
 *     GET /api/billing/status        is a Stripe secret key set (checkoutEnabled)
 *     GET /api/billing/subscription  this company's subscription as the app sees it
 *     GET /api/payments/status       Connect: configured / connected / ready / due
 *   signed out:
 *     POST /api/billing/webhook   unsigned → 400 "Invalid signature" proves the
 *                                 signing secret is set and verification runs
 *                                 (500 "Webhook not configured" = secret missing)
 *     POST /api/payments/webhook  same for Connect (503 = not configured)
 *   the billing and Get Paid Online pages: which mode the publishable key in
 *   the shipped JavaScript is (live / test — never the key), and screenshots.
 * Nothing is clicked that starts a checkout, a portal session or a Stripe
 * account; the unsigned webhook posts are refused before any write.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const SITE = (process.env.SITE || 'https://www.saguarocontrol.net').replace(/\/$/, '');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'tools/probe');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR, 'noop.js'));
const pw = require('playwright');
const R = { site: SITE, startedAt: new Date().toISOString(), facts: {}, checks: [], error: null };
const check = (name, ok, detail) => { R.checks.push({ name, ok: !!ok, detail: detail == null ? undefined : String(detail).slice(0, 300) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail != null ? ' — ' + String(detail).slice(0, 200) : ''}`); };
const shot = (page, name) => page.screenshot({ path: path.join(OUT, 'shots', `${name}.jpg`), type: 'jpeg', quality: 72, fullPage: true }).catch(() => {});

const browser = await pw.chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });

  const get = (p) => page.evaluate(async (u) => { const r = await fetch(u, { credentials: 'include' }); return { status: r.status, body: await r.json().catch(() => null) }; }, p);
  const billing = await get('/api/billing/status');
  R.facts.billing_status = billing;
  check('billing: a Stripe secret key is set in production (checkout enabled)', billing.status === 200 && billing.body?.checkoutEnabled === true, JSON.stringify(billing));
  const sub = await get('/api/billing/subscription');
  R.facts.subscription = { status: sub.status, hasSubscription: sub.body?.hasSubscription, isActive: sub.body?.isActive, state: sub.body?.subscription?.status ?? null, plan: sub.body?.subscription?.plan_id ?? null, stripe_customer: !!sub.body?.subscription?.stripe_customer_id, stripe_subscription: !!sub.body?.subscription?.stripe_subscription_id };
  const pay = await get('/api/payments/status');
  R.facts.connect_status = pay;
  check('Connect: online payments switched on in production', pay.status === 200 && pay.body?.configured === true, JSON.stringify(pay));

  // Unsigned webhook posts, signed out: refused before any write.
  const api = await pw.request.newContext();
  for (const [p, label] of [['/api/billing/webhook', 'billing'], ['/api/payments/webhook', 'Connect']]) {
    const r = await api.post(`${SITE}${p}`, { data: '{"id":"evt_probe","type":"ping"}', headers: { 'content-type': 'application/json' } });
    const body = await r.json().catch(() => null);
    R.facts[`${label}_webhook`] = { status: r.status(), error: body?.error || null };
    check(`${label} webhook: signing secret set and unsigned events refused`, r.status() === 400, `${r.status()} ${body?.error || ''}`);
  }
  await api.dispose();

  // Publishable key mode in the shipped JavaScript (never the key), and the pages.
  for (const [route, name] of [['/app/billing', 'stripe-billing-1440'], ['/app/settings/payments', 'stripe-get-paid-online-1440']]) {
    const scripts = new Set();
    page.on('response', (res) => { if (/\/_next\/static\/.*\.js/.test(res.url())) scripts.add(res.url()); });
    await page.goto(`${SITE}${route}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, name);
    R.facts[`${route}_text`] = (await page.evaluate(() => document.querySelector('.main-content-area')?.innerText || document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 700);
    let live = 0, test = 0, oldDomain = 0;
    for (const u of scripts) {
      const t = await page.evaluate(async (x) => (await fetch(x)).text(), u).catch(() => '');
      live += (t.match(/pk_live_[A-Za-z0-9]{8,}/g) || []).length;
      test += (t.match(/pk_test_[A-Za-z0-9]{8,}/g) || []).length;
      oldDomain += (t.match(/saguarocrm\.com/g) || []).length;
    }
    R.facts[`${route}_js`] = { scripts: scripts.size, publishable_live: live, publishable_test: test, old_domain_refs: oldDomain };
  }
} catch (err) {
  R.error = String(err.message || err).split('\n')[0].slice(0, 300);
  console.log('fatal', R.error);
}
await browser.close();
R.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify({ error: R.error, checks: R.checks.length, failed: R.checks.filter((c) => !c.ok).length }));
