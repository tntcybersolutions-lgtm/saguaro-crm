#!/usr/bin/env node
/**
 * App Store screenshots of the real app — captured from the live site, the
 * same pages the iOS shell loads, signed in as the App Review demo account.
 *
 *   capture  sign in, render each screen at iPhone 6.9" (1290x2796) and
 *            iPad 13" (2048x2732), write tools/screens/{iphone,ipad}/NN-name.png
 *   upload   replace the en-US App Store screenshots with those files
 *
 * The demo sign-in comes from APP_REVIEW_DEMO_EMAIL / APP_REVIEW_DEMO_PASS, else
 * from App Store Connect (betaAppReviewDetail), and is never printed. Needs ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8_BASE64; capture
 * also needs PLAYWRIGHT_DIR (a folder where `playwright` is installed).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/screens');
const BUNDLE_ID = 'net.saguarocontrol.field';
const SITE = 'https://www.saguarocontrol.net';
const MODE = process.argv[2];

const DEVICES = {
  iphone: { display: 'APP_IPHONE_67', viewport: { width: 430, height: 932 }, deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 SaguaroField/1.0' },
  ipad: { display: 'APP_IPAD_PRO_3GEN_129', viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 SaguaroField/1.0' },
};

// Screens in App Store order (the store shows the first 10). {project} is the demo job below.
const PROJECT_NAME = 'Desert Vista Medical Plaza';
const SCREENS = [
  ['dashboard', '/app'],
  ['project', '/app/projects/{project}/overview'],
  ['change-orders', '/app/projects/{project}/change-orders'],
  ['rfis', '/app/projects/{project}/rfis'],
  ['daily-logs', '/app/projects/{project}/daily-logs'],
  ['pay-apps', '/app/projects/{project}/pay-apps'],
  ['schedule', '/app/projects/{project}/schedule'],
  ['punch-list', '/app/projects/{project}/punch-list'],
  ['time', '/app/time'],
  ['my-work', '/app/my-work'],
  ['projects', '/app/projects'],
  ['takeoff', '/app/takeoff'],
];

// ── App Store Connect API ────────────────────────────────────────────────────
function b64url(buf) { return Buffer.from(buf).toString('base64url'); }
function token() {
  const key = Buffer.from(process.env.ASC_KEY_P8_BASE64, 'base64').toString('utf8');
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: process.env.ASC_KEY_ID, typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ iss: process.env.ASC_ISSUER_ID, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64url(sig)}`;
}
async function api(method, p, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${p}`, {
    method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const why = (json.errors || []).map((e) => `${e.code || ''} ${e.detail || e.title || ''}`.trim()).join(' | ');
    throw Object.assign(new Error(`${method} ${p.split('?')[0]} → ${res.status}: ${why}`), { status: res.status });
  }
  return json;
}
async function findApp() {
  const app = (await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE_ID}`)).data[0];
  if (!app) throw new Error(`no app for ${BUNDLE_ID}`);
  return app;
}

// ── capture ──────────────────────────────────────────────────────────────────
async function capture() {
  const app = await findApp();
  // Prefer the demo login from repo secrets; fall back to what App Store Connect holds.
  const review = process.env.APP_REVIEW_DEMO_EMAIL && process.env.APP_REVIEW_DEMO_PASS
    ? { demoAccountName: process.env.APP_REVIEW_DEMO_EMAIL.trim(), demoAccountPassword: process.env.APP_REVIEW_DEMO_PASS }
    : (await api('GET', `/v1/apps/${app.id}/betaAppReviewDetail`)).data.attributes;
  if (!review.demoAccountName || !review.demoAccountPassword) throw new Error('no demo sign-in in App Store Connect');
  const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR, 'noop.js'));
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  let project = null;

  for (const [kind, dev] of Object.entries(DEVICES)) {
    const dir = path.join(OUT, kind);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor,
      userAgent: dev.userAgent, isMobile: true, hasTouch: true, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="email"]', review.demoAccountName);
    await page.fill('input[name="password"]', review.demoAccountPassword);
    const session = page.waitForResponse((r) => r.url().includes('/api/auth/session'), { timeout: 60000 }).catch(() => null);
    await page.click('button[type="submit"]');
    const res = await session;
    const outcome = await Promise.race([
      page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).then(() => 'ok'),
      page.waitForSelector('[data-tone="bad"]', { timeout: 60000 }).then(async (el) => `error shown: "${(await el.innerText()).trim()}"`),
    ]).catch(() => 'no navigation and no error within 60s');
    if (outcome !== 'ok') {
      fs.mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: path.join(OUT, `debug-login-${kind}.png`) });
      throw new Error(`${kind} sign-in failed: /api/auth/session → ${res ? res.status() : 'no response'}; ${outcome}; url ${page.url()}`);
    }
    await page.waitForLoadState('networkidle').catch(() => {});
    console.log(`${kind}: signed in (session ${res?.status()}), landed on ${new URL(page.url()).pathname}`);

    if (!project) {
      await page.goto(`${SITE}/app/projects`, { waitUntil: 'networkidle' });
      // The fullest demo job (PROJECT_NAME) when present, else the first one listed.
      const links = await page.$$eval('a[href*="/app/projects/"]', (as) => as.map((a) => [a.getAttribute('href'), a.innerText]));
      const idOf = (h) => h && h.match(/\/app\/projects\/([0-9a-f-]{36})/i)?.[1];
      project = idOf(links.find(([h, t]) => idOf(h) && t.includes(PROJECT_NAME))?.[0]) || links.map(([h]) => idOf(h)).find(Boolean) || null;
      console.log(`  demo account projects: ${project ? 'found one' : 'NONE'}`);
    }

    let n = 0;
    for (const [name, route] of SCREENS) {
      if (route.includes('{project}') && !project) { console.log(`  skip ${name} (no project)`); continue; }
      const url = SITE + route.replace('{project}', project);
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(2500); // charts, counters and fonts settle
        // No cookie banners, toasts or install prompts in a store screenshot.
        await page.addStyleTag({ content: '[role="alert"],[data-sonner-toaster],[aria-live="polite"]:empty{display:none!important}' }).catch(() => {});
        const file = path.join(dir, `${String(++n).padStart(2, '0')}-${name}.png`);
        await page.screenshot({ path: file });
        const text = (await page.innerText('main').catch(() => page.innerText('body'))).replace(/\s+/g, ' ').trim();
        console.log(`  ${path.basename(file)}  ${page.url().replace(SITE, '')}  "${text.slice(0, 110)}"`);
      } catch (e) {
        console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`);
      }
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
}

// ── proof ────────────────────────────────────────────────────────────────────
// Design proof: the same demo sign-in, phone + desktop, real pages, some with a
// menu or picker opened. Written to tools/proof (never uploaded anywhere).
const PROOF_DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: DEVICES.iphone.userAgent },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};
// [name, route, action, fullPage]; action opens a pop-up before the shot.
const PROOF = [
  ['home-owner', '/app?view=owner&window=7d', null, true],
  ['home-owner-create-menu', '/app?view=owner&window=7d', 'create', false],
  ['home-operations', '/app?view=operations&scope=team&window=7d', null, true],
  ['project-overview', '/app/projects/{project}/overview', null, false],
  ['job-picker-open', '/app/projects/{project}/pay-apps', 'picker', false],
  ['menu-with-job-button', '/app/projects/{project}/overview', 'menu', false],
  ['photos', '/app/projects/{project}/photos', null, false],
  ['photos-add-open', '/app/projects/{project}/photos', 'addphoto', false],
  ['photos-add-from-create', '/app/projects/{project}/photos?add=1', null, false],
  ['files-upload-video', '/app/projects/{project}/files', null, false],
  ['pay-apps', '/app/projects/{project}/pay-apps', null, false],
  ['rfis', '/app/projects/{project}/rfis', null, false],
  ['projects', '/app/projects', null, false],
  ['my-work', '/app/my-work', null, false],
  ['compliance', '/app/compliance', null, false],
  ['documents', '/app/documents', null, true],
  ['documents-one-job', '/app/documents?project={project}', null, true],
  ['notifications-alerts', '/app/notifications', null, false],
];

async function proof() {
  const review = process.env.APP_REVIEW_DEMO_EMAIL && process.env.APP_REVIEW_DEMO_PASS
    ? { demoAccountName: process.env.APP_REVIEW_DEMO_EMAIL.trim(), demoAccountPassword: process.env.APP_REVIEW_DEMO_PASS }
    : (await api('GET', `/v1/apps/${(await findApp()).id}/betaAppReviewDetail`)).data.attributes;
  if (!review.demoAccountName || !review.demoAccountPassword) throw new Error('no demo sign-in available');
  const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR, 'noop.js'));
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const root = path.join(ROOT, 'tools/proof');
  let project = null;
  for (const [kind, dev] of Object.entries(PROOF_DEVICES)) {
    const dir = path.join(root, kind);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ ...dev, colorScheme: 'dark' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 160)));
    await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="email"]', review.demoAccountName);
    await page.fill('input[name="password"]', review.demoAccountPassword);
    await page.click('button[type="submit"]');
    const ok = await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).then(() => true).catch(() => false);
    if (!ok) { await page.screenshot({ path: path.join(dir, 'debug-login.png') }); throw new Error(`${kind} sign-in failed`); }
    await page.waitForLoadState('networkidle').catch(() => {});
    console.log(`${kind}: signed in`);
    if (!project) {
      await page.goto(`${SITE}/app/projects`, { waitUntil: 'networkidle' });
      const links = await page.$$eval('a[href*="/app/projects/"]', (as) => as.map((a) => [a.getAttribute('href'), a.innerText]));
      const idOf = (h) => h && h.match(/\/app\/projects\/([0-9a-f-]{36})/i)?.[1];
      project = idOf(links.find(([h, t]) => idOf(h) && t.includes(PROJECT_NAME))?.[0]) || links.map(([h]) => idOf(h)).find(Boolean) || null;
    }
    await page.close();
    let n = 0;
    for (const [name, route, action, full] of PROOF) {
      if (route.includes('{project}') && !project) { console.log(`  skip ${name} (no project)`); continue; }
      // A fresh tab per shot: a full-page screenshot switches touch emulation
      // off for the rest of its tab, so later phone shots acted like a mouse.
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 160)));
      try {
        await page.goto(SITE + route.replace('{project}', project), { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(2500);
        if (action === 'create') await page.click('.hv2-create button');
        // The phone keeps the job button in the menu drawer; desktop has it in the top bar already.
        if (action === 'menu' && kind === 'phone') await page.click('.mobile-hamburger-topbar').catch(() => {});
        if (action === 'addphoto') await page.click('button:has-text("Add Photos & Video"), button:has-text("Add Photo"), button:has-text("Add First Photo")');
        if (action === 'picker') {
          // On a phone the picker lives in the menu drawer.
          if (kind === 'phone') { await page.click('.mobile-hamburger-topbar').catch(() => {}); await page.waitForTimeout(600); }
          await page.click('[data-tour="project-picker"]:visible');
        }
        if (action) await page.waitForTimeout(800);
        // What the upload sheet decided about this browser (camera buttons vs drop zone).
        if (action === 'addphoto') console.log('  touch-check', JSON.stringify(await page.evaluate(() => {
          const mu = document.querySelector('.mu');
          return { mtp: navigator.maxTouchPoints, coarse: matchMedia('(any-pointer: coarse)').matches, fine: matchMedia('(any-pointer: fine)').matches,
            dataTouch: mu?.getAttribute('data-touch') ?? null, dataMouse: mu?.getAttribute('data-mouse') ?? null,
            cams: [...document.querySelectorAll('.muCam')].map((e) => getComputedStyle(e).display),
            newCss: [...document.querySelectorAll('style')].some((t) => t.textContent.includes('.mu:not([data-touch]) .muCam')) };
        })));
        const file = path.join(dir, `${String(++n).padStart(2, '0')}-${name}.png`);
        await page.screenshot({ path: file, fullPage: !!full });
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        console.log(`  ${path.basename(file)}  ${page.url().replace(SITE, '').replace(/[0-9a-f-]{36}/gi, ':id')}  overflow:${m.sw > m.cw ? m.sw - m.cw + 'px' : 'none'}`);
      } catch (e) {
        console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`);
      }
    }
    // Subs & crews, end to end on the live site: the GC makes a ZZ AUDIT sub
    // link, a sub on a phone (no GC sign-in) sends a labelled test photo + clip
    // to the GC only, the GC finds them in the job's inbox and gets the
    // notification, then the test items are dismissed and the link revoked.
    if (kind === 'phone' && project) {
      const gc = await ctx.newPage();
      let session = null;
      const shotOf = async (pg, name) => {
        const file = path.join(dir, `${String(++n).padStart(2, '0')}-${name}.png`);
        await pg.screenshot({ path: file });
        console.log(`  ${path.basename(file)}`);
      };
      try {
        const r = await gc.request.post(`${SITE}/api/portal/sub/create`, { data: {
          projectId: project, companyName: 'ZZ AUDIT Sub', contactName: 'ZZ Audit', email: 'delivered@resend.dev' } });
        const j = await r.json().catch(() => ({}));
        session = j.session || null;
        console.log(`  sub-e2e: GC made a sub link → ${r.status()} ${session ? 'ok' : JSON.stringify(j).slice(0, 160)}`);
        if (!session?.token) throw new Error('no sub link');
        const subCtx = await browser.newContext({ ...dev, colorScheme: 'dark' });
        const sub = await subCtx.newPage();
        sub.on('pageerror', (e) => errors.push('sub portal: ' + String(e.message || e).slice(0, 160)));
        await sub.goto(`${SITE}/portals/sub/${session.token}?tab=photos`, { waitUntil: 'networkidle', timeout: 45000 });
        await sub.waitForTimeout(2000);
        await shotOf(sub, 'sub-end-of-day');
        await sub.click('button[role="radio"]:has-text("Send to the GC only")');
        await sub.fill('#eod-note', 'ZZ AUDIT — automated end-of-day test, not a real upload');
        await sub.setInputFiles('input[type="file"][multiple][accept="image/*,video/*"]',
          [path.join(ROOT, 'tools/fixtures/zz-audit-photo.jpg'), path.join(ROOT, 'tools/fixtures/zz-audit-clip.webm')]);
        const sent = await sub.waitForSelector('text=/Sent 2 to the GC/', { timeout: 120000 }).then(() => true).catch(() => false);
        console.log(`  sub-e2e: sub sent photo + clip to the GC → ${sent ? 'ok' : 'NO CONFIRMATION'}`);
        await sub.waitForTimeout(1500);
        await shotOf(sub, 'sub-sent-to-gc');
        await subCtx.close();

        // The GC's side: the job's inbox, and the notification.
        await gc.goto(`${SITE}/app/projects/${project}/photos?inbox=1`, { waitUntil: 'networkidle', timeout: 45000 });
        await gc.waitForTimeout(2500);
        const inbox = await gc.evaluate(() => document.body.innerText.includes('ZZ AUDIT Sub'));
        console.log(`  sub-e2e: GC inbox shows ZZ AUDIT Sub → ${inbox ? 'ok' : 'NOT FOUND'}`);
        await shotOf(gc, 'gc-inbox-from-sub');
        const nr = await gc.request.get(`${SITE}/api/notifications`);
        const note = ((await nr.json().catch(() => ({}))).notifications || []).find((x) => String(x.title || '').startsWith('ZZ AUDIT Sub'));
        console.log(`  sub-e2e: GC notification → ${note ? JSON.stringify({ title: note.title, link: String(note.link || '').replace(/[0-9a-f-]{36}/gi, ':id') }) : 'NOT FOUND'}`);

        // Clean up: dismiss the test items, revoke the link.
        const list = await (await gc.request.get(`${SITE}/api/projects/${project}/sub-media`)).json().catch(() => ({}));
        const ids = (list.items || list.submissions || list.data || []).filter((x) => x.portal_session_id === session.id).map((x) => x.id);
        if (ids.length) {
          const d = await gc.request.patch(`${SITE}/api/projects/${project}/sub-media`, { data: { ids, action: 'dismiss' } });
          console.log(`  sub-e2e: dismissed ${ids.length} test item(s) → ${d.status()}`);
        } else console.log(`  sub-e2e: no test items listed to dismiss (keys: ${Object.keys(list).join(',')})`);
      } catch (e) {
        console.log(`  ✗ sub-e2e: ${e.message.split('\n')[0]}`);
      }
      if (session?.id) {
        const rv = await gc.request.post(`${SITE}/api/portal/revoke`, { data: { sessionId: session.id, type: 'sub' } });
        console.log(`  sub-e2e: test sub link revoked → ${rv.status()}`);
      }
      await gc.close();
    }
    if (errors.length) console.log(`  page errors: ${[...new Set(errors)].join(' | ')}`);
    await ctx.close();
  }
  await browser.close();
  await pushProof(review, root);
  await photosProof(review, root, project);
}

// Alerts, end to end: real Google Chrome (it has a push service; open-source
// Chromium doesn't) turns alerts on from the Notifications page, sends itself
// a test, and we wait for the alert to land in the browser — then turn it off
// so the demo account keeps no device.
// Each step of turning alerts on, in the page, reporting the first that throws.
const PUSH_STEPS = async () => {
  const out = { steps: [] };
  const step = async (name, fn) => { try { const v = await fn(); out.steps.push(`${name}: ok${v !== undefined ? ' ' + v : ''}`); return v; } catch (e) { out.steps.push(`${name}: FAILED ${e && e.name}: ${e && e.message}`); throw e; } };
  try {
    const cfg = await step('push-config', async () => { const r = await fetch('/api/notifications/push-config'); const j = await r.json(); out.cfg = { status: r.status, hasKey: !!j.webPublicKey }; return JSON.stringify(out.cfg); });
    await step('support', async () => `${'serviceWorker' in navigator}/${'PushManager' in window}/${'Notification' in window}`);
    await step('permission', async () => Notification.requestPermission());
    const reg = await step('register', async () => { const r = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' }); await navigator.serviceWorker.ready; return r; });
    const key = (await (await fetch('/api/notifications/push-config')).json()).webPublicKey;
    const pad = '='.repeat((4 - (key.length % 4)) % 4);
    const bytes = Uint8Array.from(atob((key + pad).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const sub = await step('subscribe', async () => (await reg.pushManager.getSubscription()) || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }));
    out.endpointHost = new URL(sub.endpoint).host;
    await step('save', async () => { const r = await fetch('/api/notifications/push-subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) }); return r.status; });
    void cfg;
  } catch { /* first failure recorded */ }
  return out;
};

async function pushProof(review, root) {
  const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR, 'noop.js'));
  const { chromium } = require('playwright');
  // Headless Chrome can't always reach a push service; a real window on a
  // virtual display (Xvfb) can. Try headless, then headed.
  for (const headed of [false, true]) {
    let xvfb = null;
    if (headed) {
      try {
        const { spawn } = await import('node:child_process');
        xvfb = spawn('Xvfb', [':99', '-screen', '0', '1440x900x24'], { stdio: 'ignore' });
        await new Promise((r) => setTimeout(r, 1500));
      } catch (e) { console.log(`push-e2e: no Xvfb — ${e.message}`); return; }
    }
    const done = await pushProofOnce(chromium, review, root, headed);
    if (xvfb) xvfb.kill();
    if (done) return;
  }
}

async function pushProofOnce(chromium, review, root, headed) {
  console.log(`push-e2e: ${headed ? 'headed Chrome on Xvfb' : 'headless Chrome'}`);
  // A normal (persistent) profile: browser.newContext() is incognito, and
  // Chrome refuses push subscriptions in incognito ("permission denied").
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sag-push-'));
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: !headed, ...PROOF_DEVICES.desktop, colorScheme: 'dark',
      env: headed ? { ...process.env, DISPLAY: ':99' } : process.env });
  } catch (e) { console.log(`push-e2e: Google Chrome not available — ${e.message.split('\n')[0]}`); return false; }
  const chrome = { close: async () => { fs.rmSync(profile, { recursive: true, force: true }); } };
  let delivered = false;
  const dir = path.join(root, 'desktop');
  await ctx.grantPermissions(['notifications'], { origin: SITE });
  const page = await ctx.newPage();
  try {
    await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="email"]', review.demoAccountName);
    await page.fill('input[name="password"]', review.demoAccountPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
    await page.goto(`${SITE}/app/notifications`, { waitUntil: 'networkidle' });
    const card = page.locator('.pac');
    if (!(await card.count())) { console.log('push-e2e: no alerts card on the Notifications page'); return false; }
    console.log(`push-e2e: card state → ${await card.getAttribute('data-state')}`);
    console.log(`push-e2e: steps → ${JSON.stringify(await page.evaluate(PUSH_STEPS))}`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.pac', { timeout: 15000 });
    if ((await card.getAttribute('data-state')) === 'off') {
      await page.click('.pac button:has-text("Turn on alerts")');
      await page.waitForSelector('.pac[data-state="on"], .pacMsg', { timeout: 30000 });
    }
    console.log(`push-e2e: after turn-on → ${await card.getAttribute('data-state')} ${(await page.locator('.pacMsg').textContent().catch(() => '')) || ''}`);
    if ((await card.getAttribute('data-state')) !== 'on') return false;
    await page.click('.pac button:has-text("Send a test alert")');
    await page.waitForSelector('.pacMsg', { timeout: 30000 });
    console.log(`push-e2e: test → ${await page.locator('.pacMsg').textContent()}`);
    const landed = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration('/');
      for (let i = 0; i < 30; i++) {
        const list = reg ? await reg.getNotifications() : [];
        const n = list.find((x) => x.title === 'Saguaro alerts are on');
        if (n) return { title: n.title, body: n.body };
        await new Promise((r) => setTimeout(r, 1000));
      }
      return null;
    });
    console.log(`push-e2e: alert delivered to the browser → ${landed ? JSON.stringify(landed) : 'NOT RECEIVED in 30s'}`);
    delivered = !!landed;
    await card.screenshot({ path: path.join(dir, '90-alerts-on-test-sent.png') });
  } catch (e) {
    console.log(`push-e2e: ✗ ${e.message.split('\n')[0]}`);
  } finally {
    // Leave the demo account with no signed-up device.
    if (await page.locator('.pac button:has-text("Turn off")').count().catch(() => 0)) {
      await page.click('.pac button:has-text("Turn off")').catch(() => {});
      await page.waitForTimeout(1500);
      console.log(`push-e2e: turned off again → ${await page.locator('.pac').getAttribute('data-state').catch(() => '?')}`);
    }
    await ctx.close();
    await chrome.close();
  }
  return delivered;
}

// ── upload ───────────────────────────────────────────────────────────────────
const EDITABLE = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'WAITING_FOR_REVIEW', 'INVALID_BINARY'];

async function uploadOne(setId, file) {
  const bytes = fs.readFileSync(file);
  const shot = (await api('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots',
    attributes: { fileName: path.basename(file), fileSize: bytes.length },
    relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } } } })).data;
  for (const op of shot.attributes.uploadOperations) {
    const headers = Object.fromEntries((op.requestHeaders || []).map((h) => [h.name, h.value]));
    const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
    if (!res.ok) throw new Error(`upload part ${op.offset} → ${res.status}`);
  }
  await api('PATCH', `/v1/appScreenshots/${shot.id}`, { data: { type: 'appScreenshots', id: shot.id,
    attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(bytes).digest('hex') } } });
  return shot.id;
}

async function upload() {
  const app = await findApp();
  const ver = (await api('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`)).data
    .find((v) => EDITABLE.includes(v.attributes.appStoreState));
  if (!ver) throw new Error('no editable App Store version');
  const loc = (await api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?limit=50`)).data
    .find((l) => l.attributes.locale === 'en-US');
  if (!loc) throw new Error('no en-US localization');
  console.log(`App Store ${ver.attributes.versionString} (${ver.attributes.appStoreState}), en-US`);

  const sets = (await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=50`)).data;
  for (const [kind, dev] of Object.entries(DEVICES)) {
    const dir = path.join(OUT, kind);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort().slice(0, 10) : [];
    if (!files.length) { console.log(`  ${dev.display}: no files in tools/screens/${kind}, left as is`); continue; }
    let set = sets.find((s) => s.attributes.screenshotDisplayType === dev.display);
    if (!set) {
      set = (await api('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: dev.display },
        relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } } })).data;
    }
    const old = (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data;
    for (const s of old) await api('DELETE', `/v1/appScreenshots/${s.id}`);
    for (const f of files) await uploadOne(set.id, path.join(dir, f));
    console.log(`  ✓ ${dev.display}: removed ${old.length}, uploaded ${files.length} (${files.join(', ')})`);
  }
  // Apple processes uploads asynchronously; report what it accepted.
  await new Promise((r) => setTimeout(r, 15000));
  for (const set of (await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=50`)).data) {
    const shots = (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data;
    const states = shots.map((s) => `${s.attributes.fileName}:${s.attributes.assetDeliveryState?.state}`);
    console.log(`  ${set.attributes.screenshotDisplayType}: ${states.join(', ') || 'empty'}`);
  }
}


// ── walk ─────────────────────────────────────────────────────────────────────
// Phase 1: tap every control on every screen of the iPhone app (WebKit, iPhone
// profile) and report what does nothing, what errors, and what 404s. It reads a
// job with real data, so it lists — never taps — anything that writes. Phase 2
// (writeWalk) does every one of those writes on ZZ AUDIT test records.
const WALK_TOP = ['/app', '/app/my-work', '/app/projects', '/app/time', '/app/notifications', '/app/documents', '/app/daily-logs',
  '/app/schedule', '/app/compliance', '/app/takeoff', '/app/reports', '/app/people', '/app/subs', '/app/customers', '/app/leads',
  '/app/sales', '/app/bids', '/app/billing', '/app/billing/payapp', '/app/billing/cost-control', '/app/invoicing', '/app/catalog',
  '/app/certified-payroll', '/app/command-center', '/app/command-center/daily-logs', '/app/command-center/directory',
  '/app/command-center/financials', '/app/command-center/budget', '/app/command-center/checklists', '/app/command-center/escalations',
  '/app/command-center/kpis', '/app/command-center/long-lead', '/app/command-center/milestones', '/app/command-center/oac',
  '/app/command-center/owner-updates', '/app/command-center/portals', '/app/command-center/pre-site', '/app/command-center/qc',
  '/app/command-center/risks', '/app/command-center/rollout', '/app/command-center/vendors', '/app/command-center/verify',
  '/app/document-versions', '/app/fleet', '/app/intelligence', '/app/portals', '/app/prequalification', '/app/radio',
  '/app/resource-planning', '/app/reviews', '/app/service', '/app/settings', '/app/signal-studio', '/app/warranty-claims', '/app/ask'];
const WALK_JOB = ['overview', 'photos', 'files', 'daily-logs', 'rfis', 'submittals', 'punch-list', 'change-orders', 'pay-apps',
  'lien-waivers', 'schedule', 'drawings', 'specs', 'inspections', 'safety', 'todos', 'messages', 'team', 'directory', 'subs',
  'crews', 'timesheets', 'tm-tickets', 'budget', 'cash-flow', 'bills', 'invoices', 'contracts', 'purchase-orders', 'estimate',
  'proposal', 'bid-packages', 'closeout', 'compliance', 'insurance', 'permits', 'payroll', 'selections', 'w9', 'takeoff',
  'intelligence', 'autopilot', 'network'];
// Anything that writes, sends, pays, signs or leaves is listed, never tapped.
const WALK_DENY = /\b(delete|remove|archive|trash|send|submit|approve|reject|decline|pay|void|log ?out|sign ?out|revoke|disconnect|reset|unsubscribe|deactivate|terminate|cancel (plan|subscription)|save|create|generate|sync|import|duplicate|clone|copy to|convert|clock (in|out)|start|run|accept|assign|notify|remind|request|upload|post|publish|award|execute|e-?sign|sign|invite|resend|mark (as )?(paid|complete|done|read)|complete|finali[sz]e|close (out|job)|reopen|restore|apply|confirm|place order|purchase|buy|subscribe|upgrade|checkout|book)\b/i;

async function walk() {
  // Chad's real account when the E2E_EMAIL / E2E_PASSWORD secrets are set,
  // otherwise the App Review demo sign-in. Never printed.
  const real = !!(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);
  const review = real
    ? { demoAccountName: process.env.E2E_EMAIL.trim(), demoAccountPassword: process.env.E2E_PASSWORD }
    : process.env.APP_REVIEW_DEMO_EMAIL && process.env.APP_REVIEW_DEMO_PASS
      ? { demoAccountName: process.env.APP_REVIEW_DEMO_EMAIL.trim(), demoAccountPassword: process.env.APP_REVIEW_DEMO_PASS }
      : (await api('GET', `/v1/apps/${(await findApp()).id}/betaAppReviewDetail`)).data.attributes;
  console.log(`walk: signed in as ${real ? 'the real account (E2E secrets)' : 'the demo account (E2E secrets not set)'}`);
  const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR, 'noop.js'));
  const pw = require('playwright');
  const outDir = path.join(ROOT, 'tools/walk');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'shots'), { recursive: true });
  const browser = await pw.webkit.launch();
  const device = { ...pw.devices['iPhone 15'], colorScheme: 'dark' };

  // Sign in ONCE; every walker phone reuses that session (parallel sign-ins
  // with one account timed out and took the whole run down).
  let session = null;
  async function signedInContext() {
    if (session) return browser.newContext({ ...device, storageState: session });
    const ctx = await browser.newContext(device);
    const page = await ctx.newPage();
    await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="email"]', review.demoAccountName);
    await page.fill('input[name="password"]', review.demoAccountPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    session = await ctx.storageState();
    await page.close();
    return ctx;
  }

  // The demo job.
  const ctx0 = await signedInContext();
  const p0 = await ctx0.newPage();
  await p0.goto(`${SITE}/app`, { waitUntil: 'networkidle' });
  let jobs = [];
  try { const d = await (await p0.request.get(`${SITE}/api/projects?limit=200&fields=id,name`)).json(); jobs = d.projects || d.data || (Array.isArray(d) ? d : []); } catch (e) { console.log(`walk: jobs list failed — ${e.message}`); }
  const project = (jobs.find((j) => (j.name || '').includes(PROJECT_NAME)) || jobs.find((j) => !/ZZ AUDIT/i.test(j.name || '')) || jobs[0] || {}).id || null;
  console.log(`walk: ${jobs.length} jobs; walking job screens on ${project ? (jobs.find((j) => j.id === project) || {}).name : 'NO JOB FOUND'}`);
  await ctx0.close();
  // Phase 2 runs beside the tap walk in its own browser: every Add/New, every
  // record button, payments, archive and Sign Out, on ZZ AUDIT test records.
  const writeP = writeWalk(pw, device, session, outDir, real).catch((e) => console.log(`write-walk: ✗ ${String(e.message || e).split('\n')[0]}`));
  const routes = [...WALK_TOP, ...(project ? WALK_JOB.map((t) => `/app/projects/${project}/${t}`) : [])];
  const shortUrl = (u) => u.replace(SITE, '').replace(/[0-9a-f-]{36}/gi, ':id');
  const results = [];
  const writeReport = () => writeWalkReport(outDir, results, real ? 'real account' : 'demo account');
  const chromeSeen = new Set(); // controls in the shared top/bottom bars: test once

  async function walkRoute(ctx, route, idx) {
    const res = { route: shortUrl(route), status: null, loadErrors: [], apiErrors: [], dead: [], covered: [], erroring: [], notTapped: [], tapped: 0, ok: 0 };
    const page = await ctx.newPage();
    let reqs = 0; const apiErrs = []; const pageErrs = [];
    page.on('request', (r) => { if (['fetch', 'xhr', 'document'].includes(r.resourceType())) reqs++; });
    page.on('response', (r) => { const u = r.url(); if (u.startsWith(SITE + '/api/') && r.status() >= 400 && r.status() !== 401) apiErrs.push(`${r.request().method()} ${shortUrl(u).replace(/\?.*$/, '')} → ${r.status()}`); });
    page.on('pageerror', (e) => pageErrs.push(String(e.message || e).slice(0, 180)));
    let popups = 0, dialogs = 0, downloads = 0;
    ctx.on('page', () => { popups++; });
    page.on('dialog', (d) => { dialogs++; d.dismiss().catch(() => {}); });
    page.on('download', () => { downloads++; });
    const open = async () => {
      const r = await page.goto(SITE + route, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null);
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        window.__mut = 0;
        new MutationObserver((ms) => { window.__mut += ms.length; }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      });
      return r;
    };
    try {
      const r = await open();
      res.status = r ? r.status() : 'no response';
      const notFound = await page.evaluate(() => /could not be found|404|page not found/i.test(document.body.innerText.slice(0, 2000)));
      if (notFound) res.loadErrors.push('page says not found');
      res.loadErrors.push(...pageErrs.splice(0));
      res.apiErrors.push(...apiErrs.splice(0));
      await page.screenshot({ path: path.join(outDir, 'shots', `${String(idx).padStart(3, '0')}${route.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.png`) });
      // Tag every visible control once, in DOM order.
      const list = await page.evaluate(() => {
        const sel = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="switch"], summary, select, input[type="checkbox"], input[type="radio"]';
        const out = [];
        let i = 0;
        for (const el of document.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect();
          const st = getComputedStyle(el);
          if (r.width < 4 || r.height < 4 || st.visibility === 'hidden' || st.display === 'none' || el.closest('[aria-hidden="true"]')) continue;
          const label = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('name') || el.getAttribute('placeholder') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 70);
          const chrome = !!el.closest('header, nav, aside, footer, [class*="bottom-nav"], [class*="BottomNav"], [class*="topbar"], [class*="TopBar"], [class*="sidebar"], [class*="Sidebar"]');
          el.setAttribute('data-walk', String(i));
          out.push({ i, label, tag: el.tagName.toLowerCase(), href: el.getAttribute('href'), disabled: el.disabled || el.getAttribute('aria-disabled') === 'true', chrome, target: el.getAttribute('target'), html: el.outerHTML.slice(0, 160) });
          i++;
        }
        return out;
      });
      const baseDialogs = await page.locator('[role="dialog"], [aria-modal="true"]').count();
      let tapped = 0;
      for (const c of list) {
        if (tapped >= 70) break;
        const key = `${c.label}|${c.href || ''}`;
        if (c.chrome) { if (chromeSeen.has(key)) continue; chromeSeen.add(key); }
        if (c.disabled) continue;
        if (c.href && /^(tel:|mailto:|sms:|https?:\/\/(?!www\.saguarocontrol\.net))/.test(c.href)) continue;
        if (WALK_DENY.test(c.label)) { res.notTapped.push(c.label); continue; }
        tapped++;
        const el = page.locator(`[data-walk="${c.i}"]`).first();
        if (!(await el.count())) continue; // gone after an earlier reload
        const url0 = page.url();
        const m0 = await page.evaluate(() => window.__mut).catch(() => 0);
        const r0 = reqs, p0 = popups, d0 = dialogs, dl0 = downloads, e0 = pageErrs.length, a0 = apiErrs.length;
        let clicked = false, lastErr = '';
        for (const attempt of [0, 1]) {
          try {
            // A real thumb scrolls the button into the open middle of the screen,
            // not under the fixed top bar or the tab bar.
            await el.evaluate((n) => n.scrollIntoView({ block: 'center', inline: 'center' }));
            await page.waitForTimeout(attempt ? 400 : 120);
            await el.click({ timeout: 2500 });
            clicked = true;
            break;
          } catch (e) { lastErr = String(e.message || e); }
        }
        if (!clicked) {
          if (/intercepts pointer events|not visible|outside of the viewport|not stable/i.test(lastErr)) {
            res.covered.push({ label: c.label, why: (lastErr.match(/<[^\n]{0,140}> (?:from <[^\n]{0,80}> )?(?:subtree )?intercepts pointer events/) || [lastErr.split('\n')[0]])[0].slice(0, 220), html: c.html });
          }
          continue;
        }
        await page.waitForTimeout(1300);
        const moved = page.url() !== url0;
        const m1 = await page.evaluate(() => window.__mut).catch(() => m0 + 1);
        const responded = moved || (m1 - m0) > 0 || reqs > r0 || popups > p0 || dialogs > d0 || downloads > dl0;
        if (!responded) res.dead.push({ label: c.label, tag: c.tag, href: c.href, html: c.html });
        else res.ok++;
        const newErr = pageErrs.slice(e0).concat(apiErrs.slice(a0));
        if (newErr.length) res.erroring.push({ label: c.label, errors: [...new Set(newErr)].slice(0, 3) });
        // Put the page back the way it was.
        if (moved) { await open(); await page.evaluate((list) => { const sel = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="switch"], summary, select, input[type="checkbox"], input[type="radio"]'; let i = 0; for (const el of document.querySelectorAll(sel)) { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); if (r.width < 4 || r.height < 4 || st.visibility === 'hidden' || st.display === 'none' || el.closest('[aria-hidden="true"]')) continue; el.setAttribute('data-walk', String(i)); i++; } }, null); continue; }
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(250);
        if ((await page.locator('[role="dialog"], [aria-modal="true"]').count()) > baseDialogs) {
          await open();
          await page.evaluate(() => { const sel = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="switch"], summary, select, input[type="checkbox"], input[type="radio"]'; let i = 0; for (const el of document.querySelectorAll(sel)) { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); if (r.width < 4 || r.height < 4 || st.visibility === 'hidden' || st.display === 'none' || el.closest('[aria-hidden="true"]')) continue; el.setAttribute('data-walk', String(i)); i++; } });
        }
      }
      res.tapped = tapped;
    } catch (e) {
      res.loadErrors.push(`walk stopped: ${String(e.message || e).split('\n')[0].slice(0, 160)}`);
    }
    res.loadErrors = [...new Set(res.loadErrors.concat(pageErrs))].slice(0, 8);
    res.apiErrors = [...new Set(res.apiErrors.concat(apiErrs))].slice(0, 12);
    res.notTapped = [...new Set(res.notTapped)];
    await page.close();
    console.log(`walk ${idx + 1}/${routes.length} ${res.route}: ${res.tapped} tapped, ${res.dead.length} dead, ${res.covered.length} covered, ${res.erroring.length} erroring, ${res.apiErrors.length} api errors${res.loadErrors.length ? ', load: ' + res.loadErrors[0] : ''}`);
    return res;
  }

  // Four signed-in phones in parallel; the shared bars are walked on the first screen only.
  const WORKERS = 4;
  const queue = routes.map((r, i) => [r, i]);
  const first = queue.shift();
  const ctxA = await signedInContext();
  try { results[first[1]] = await walkRoute(ctxA, first[0], first[1]); } catch (e) { results[first[1]] = { route: shortUrl(first[0]), status: 'walk error', loadErrors: [String(e.message || e).split('\n')[0]], apiErrors: [], dead: [], covered: [], erroring: [], notTapped: [], tapped: 0, ok: 0 }; }
  writeReport();
  await ctxA.close();
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    const ctx = await signedInContext();
    while (queue.length) {
      const [r, i] = queue.shift();
      try { results[i] = await walkRoute(ctx, r, i); }
      catch (e) { results[i] = { route: shortUrl(r), status: 'walk error', loadErrors: [String(e.message || e).split('\n')[0]], apiErrors: [], dead: [], covered: [], erroring: [], notTapped: [], tapped: 0, ok: 0 }; }
      writeReport();
    }
    await ctx.close();
  }));
  await browser.close();

  writeReport();
  console.log(fs.readFileSync(path.join(outDir, 'report.md'), 'utf8').split('\n').slice(0, 3).join('\n'));
  await writeP;
  process.exit(0);
}

function writeWalkReport(outDir, rawResults, signedInAs) {
  const results = rawResults.filter(Boolean);
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 1));
  const lines = [`# App walk — iPhone (WebKit), ${signedInAs}`, '', `${results.length} screens · ${results.reduce((n, r) => n + r.tapped, 0)} controls tapped · ${results.reduce((n, r) => n + r.dead.length, 0)} dead · ${results.reduce((n, r) => n + r.covered.length, 0)} covered · ${results.reduce((n, r) => n + r.erroring.length, 0)} erroring · ${results.reduce((n, r) => n + r.apiErrors.length, 0)} API errors`, ''];
  for (const r of results) {
    if (!r.dead.length && !r.covered.length && !r.erroring.length && !r.apiErrors.length && !r.loadErrors.length) continue;
    lines.push(`## ${r.route}  (HTTP ${r.status})`);
    for (const e of r.loadErrors) lines.push(`- LOAD: ${e}`);
    for (const e of r.apiErrors) lines.push(`- API: ${e}`);
    for (const d of r.dead) lines.push(`- DEAD: "${d.label}" <${d.tag}${d.href ? ' href=' + d.href : ''}>  \`${d.html.replace(/`/g, "'")}\``);
    for (const d of r.covered) lines.push(`- COVERED: "${d.label}" — ${d.why}`);
    for (const d of r.erroring) lines.push(`- ERRORS after "${d.label}": ${d.errors.join(' | ')}`);
    lines.push('');
  }
  lines.push('## Not tapped (would write data or leave)', '');
  for (const r of results) if (r.notTapped.length) lines.push(`- ${r.route}: ${r.notTapped.slice(0, 20).join(' · ')}`);
  fs.writeFileSync(path.join(outDir, 'report.md'), lines.join('\n') + '\n');
}


// Photos & video, end to end on the live site, the way the iPhone app does it:
// WebKit (the engine inside the iPhone app) with an iPhone profile, then
// Chromium as a control. Upload a labelled photo + clip, wait for the queue,
// check every thumbnail actually draws, open one, then delete the test items.
async function photosProof(review, root, project) {
  if (!project) { console.log('photos-e2e: no project'); return; }
  const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR, 'noop.js'));
  const pw = require('playwright');
  const runs = [
    ['webkit-iphone', pw.webkit, { ...pw.devices['iPhone 15'] }, 'tools/fixtures/ZZ AUDIT clip.mp4'],
    ['chromium-phone', pw.chromium, { ...PROOF_DEVICES.phone }, 'tools/fixtures/zz-audit-clip.webm'],
  ];
  for (const [label, engine, device, clip] of runs) {
    let browser;
    try { browser = await engine.launch(); } catch (e) { console.log(`photos-e2e[${label}]: cannot launch — ${e.message.split('\n')[0]}`); continue; }
    const ctx = await browser.newContext({ ...device, colorScheme: 'dark' });
    const page = await ctx.newPage();
    const net = [];
    const errs = [];
    const short = (u) => u.replace(SITE, '').replace(/https:\/\/[a-z0-9]+\.supabase\.co/, 'SUPABASE').replace(/[0-9a-f-]{36}/gi, ':id').replace(/\?.*$/, '');
    page.on('response', (r) => { const u = r.url(); if (/\/api\/(photos|files)|supabase\.co\/storage/.test(u)) net.push(`${r.request().method()} ${short(u)} → ${r.status()}`); });
    page.on('requestfailed', (r) => { const u = r.url(); if (/\/api\/|supabase/.test(u)) net.push(`${r.method()} ${short(u)} → FAILED ${r.failure()?.errorText || ''}`); });
    page.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
    const dir = path.join(root, 'phone');
    const shot = async (name) => { await page.screenshot({ path: path.join(dir, `95-${label}-${name}.png`) }).catch(() => {}); };
    try {
      await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
      await page.fill('input[name="email"]', review.demoAccountName);
      await page.fill('input[name="password"]', review.demoAccountPassword);
      await page.click('button[type="submit"]');
      await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
      await page.goto(`${SITE}/app/projects/${project}/photos`, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(2000);
      await page.click('button:has-text("Add Photos & Video"), button:has-text("Add Photo"), button:has-text("Add First Photo")');
      await page.waitForSelector('.muSheet', { timeout: 10000 });
      await page.setInputFiles('.mu input[type="file"][multiple][accept="image/*,video/*"]',
        [path.join(ROOT, 'tools/fixtures/ZZ AUDIT phone photo.jpg'), path.join(ROOT, clip)]);
      // Wait until no row is still uploading (or 90 s).
      const t0 = Date.now();
      let rows = [];
      while (Date.now() - t0 < 90000) {
        rows = await page.$$eval('.muRow', (rs) => rs.map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
        if (rows.length >= 2 && !rows.some((t) => /Uploading|Waiting|Preparing|Saving|%/.test(t))) break;
        await page.waitForTimeout(1000);
      }
      console.log(`photos-e2e[${label}]: queue after ${Math.round((Date.now() - t0) / 1000)}s → ${JSON.stringify(rows)}`);
      await shot('1-queue');
      await page.click('.muDone').catch(() => {});
      await page.waitForTimeout(3000);
      const tiles = await page.$$eval('.phCard img', (imgs) => imgs.map((i) => ({ ok: i.complete && i.naturalWidth > 0, src: (i.currentSrc || i.src).replace(/\?.*$/, '').slice(-60) })));
      const missing = await page.locator('.phCard .phThumb[data-missing="true"]').count().catch(() => 0);
      console.log(`photos-e2e[${label}]: gallery thumbnails → ${tiles.filter((t) => t.ok).length} drawn, ${tiles.filter((t) => !t.ok).length} broken, ${missing} marked missing`);
      await shot('2-gallery');
      // Open the newest tile.
      await page.locator('.phCard').first().click({ timeout: 10000 });
      await page.waitForTimeout(2500);
      const viewer = await page.evaluate(() => {
        const img = document.querySelector('.zl img, [role="dialog"] img');
        const vid = document.querySelector('.zl video, [role="dialog"] video');
        return { img: img ? { ok: img.complete && img.naturalWidth > 0 } : null, video: vid ? { readyState: vid.readyState, error: vid.error ? vid.error.code : null } : null, dialogs: document.querySelectorAll('[role="dialog"]').length };
      });
      console.log(`photos-e2e[${label}]: tap thumbnail → ${JSON.stringify(viewer)}`);
      await shot('3-open');
    } catch (e) {
      console.log(`photos-e2e[${label}]: ✗ ${e.message.split('\n')[0]}`);
      await shot('x-failed');
    } finally {
      console.log(`photos-e2e[${label}]: requests → ${JSON.stringify(net.slice(0, 40))}`);
      if (errs.length) console.log(`photos-e2e[${label}]: page errors → ${JSON.stringify([...new Set(errs)].slice(0, 10))}`);
      // Delete every ZZ AUDIT test item on this job.
      try {
        const list = await (await page.request.get(`${SITE}/api/photos/list?projectId=${project}&include=files`)).json();
        const mine = (list.photos || []).filter((p) => /zz.?audit/i.test(`${p.title || ''} ${p.filename || ''} ${p.file_name || ''}`));
        for (const p of mine) {
          const r = p.file_id
            ? await page.request.delete(`${SITE}/api/files/${p.file_id}?hard=1`)
            : await page.request.delete(`${SITE}/api/photos/${p.id}`);
          console.log(`photos-e2e[${label}]: deleted test item ${p.file_id ? 'file' : 'photo'} → ${r.status()}`);
        }
      } catch (e) { console.log(`photos-e2e[${label}]: cleanup ✗ ${e.message.split('\n')[0]}`); }
      await ctx.close();
      await browser.close();
    }
  }
}

// ── write walk ───────────────────────────────────────────────────────────────
// Phase 2, the Definition of Done on every screen, on test records only:
//   a fresh "ZZ AUDIT Walk Job" made through the real New Project form, then on
//   every screen: each Add/New → fill every field (files too) → save → reload →
//   reopen → every field back? → Edit (pre-filled?) → save → reload → every
//   other button on the record (send, submit, approve, status…) → delete.
//   Then the payment buttons, archiving the test job, and Sign Out last.
// Mail and texts only ever go to a test inbox / reserved number: email fields
// get delivered@resend.dev (accepted and thrown away), phones 555-0100, and
// person pickers choose the ZZ AUDIT contact made first — never a real sub.
const TEST_EMAIL = 'delivered@resend.dev';
const PEOPLE_TOP = ['/app/subs', '/app/people', '/app/customers'];
const PEOPLE_JOB = ['directory', 'subs', 'team', 'crews'];
const ADD_RE = /^\s*(\+\s*)?(new|add|create|log|report|record|start|upload|invite|schedule|request|draft|import|capture|take)\b/i;
const SAVE_RE = /^\s*(save|create|add|submit|log|post|record|done|confirm|finish|send|invite|upload|continue|next|apply|yes|ok)\b/i;
const CANCEL_RE = /^\s*(cancel|close|back|no|not now|dismiss|skip|×|✕|x)\s*$/i;
const DELETE_RE = /^\s*(delete|remove|archive|trash)\b/i;
const NOT_ACTION_RE = /^\s*(edit|delete|remove|archive|trash|cancel|close|back|×|✕|x|sign out|log ?out)\b/i;
const LAST_RE = /\b(close|complete|approve|reject|void|cancel|decline|finali[sz]e|archive|lock|sign|execute|award)\b/i;
const WRITE_BUDGET_MS = 270 * 60 * 1000;
const SCREEN_BUDGET_MS = 10 * 60 * 1000;

function writeWalkPdf(dir) {
  // A one-page PDF for document/drawing uploads.
  const f = path.join(dir, 'ZZ AUDIT document.pdf');
  if (!fs.existsSync(f)) {
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    const text = 'BT /F1 24 Tf 72 700 Td (ZZ AUDIT test document) Tj ET';
    objs[3] = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
    let out = '%PDF-1.4\n'; const offs = [];
    objs.forEach((o, k) => { offs.push(out.length); out += `${k + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    fs.writeFileSync(f, out);
  }
  return f;
}

// Runs in the page: fill every empty field of the open form (the top dialog,
// else the visible form, else the page). Returns what it typed.
function fillFormInPage({ marker, email }) {
  const vis = (el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 1 && r.height > 1 && st.visibility !== 'hidden' && st.display !== 'none'; };
  const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')].filter(vis);
  const root = dialogs[dialogs.length - 1] || [...document.querySelectorAll('form')].filter(vis).pop() || document.querySelector('main') || document.body;
  const set = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  };
  const labelOf = (el) => {
    const id = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    return [el.name, el.placeholder, el.getAttribute('aria-label'), id && id.innerText, el.closest('label') && el.closest('label').innerText].filter(Boolean).join(' ').toLowerCase();
  };
  const today = new Date().toISOString().slice(0, 10);
  const fields = [...root.querySelectorAll('input, textarea, select')].filter((el) => {
    if (el.disabled || el.readOnly) return false;
    if (el.tagName === 'SELECT') return vis(el) || (el.parentElement && vis(el.parentElement));
    return vis(el);
  });
  // The marker goes in the title/name/subject field; the rest get labelled values.
  const textLike = (el) => el.tagName === 'TEXTAREA' || ['text', ''].includes((el.getAttribute('type') || '').toLowerCase());
  const titleField = fields.find((el) => textLike(el) && /title|subject|name|company|summary|description|item|question/.test(labelOf(el)) && !/first|last|email/.test(labelOf(el))) || fields.find(textLike);
  const typed = [];
  for (const el of fields) {
    const type = (el.getAttribute('type') || el.tagName).toLowerCase();
    if (['hidden', 'file', 'checkbox', 'radio', 'submit', 'button', 'search', 'password', 'range', 'color'].includes(type)) continue;
    if (el.value && el.tagName !== 'SELECT') continue; // keep what the form pre-filled
    const lab = labelOf(el);
    if (el.tagName === 'SELECT') {
      const opts = [...el.options].filter((o) => o.value && !o.disabled);
      const zz = opts.find((x) => /zz audit/i.test(x.text));
      if (el.value && (!zz || el.value === zz.value)) continue;
      const o = zz || opts[0];
      if (o) { set(el, o.value); typed.push({ kind: 'select', label: lab, value: o.text }); }
      continue;
    }
    let v;
    if (type === 'date') v = today;
    else if (type === 'time') v = '09:00';
    else if (type === 'datetime-local') v = `${today}T09:00`;
    else if (type === 'month') v = today.slice(0, 7);
    else if (type === 'week') v = `${today.slice(0, 4)}-W20`;
    else if (type === 'number') v = /percent|%/.test(lab) ? '10' : /year/.test(lab) ? '2026' : '100';
    else if (type === 'email' || /e-?mail/.test(lab)) v = email;
    else if (type === 'tel' || /phone|mobile|cell/.test(lab)) v = '6025550100';
    else if (type === 'url' || /website|url|link/.test(lab)) v = 'https://example.com';
    else if (/zip|postal/.test(lab)) v = '85001';
    else if (/\bcity\b/.test(lab)) v = 'Phoenix';
    else if (/\bstate\b/.test(lab)) v = 'AZ';
    else if (/address|street/.test(lab)) v = '100 Test Way, Phoenix, AZ 85001';
    else if (/amount|price|cost|total|rate|qty|quantity|hours|value|budget|sum|\$/.test(lab)) v = '100';
    else if (/\bein\b|tax id|tin\b/.test(lab)) v = '12-3456789';
    else if (/license|lic\.? ?#|number|#/.test(lab)) v = `ZZ-${Date.now() % 100000}`;
    else if (el === titleField) v = marker;
    else v = `${marker} note`;
    set(el, v);
    typed.push({ kind: type, label: lab, value: v });
  }
  return typed;
}

// Runs in the page: is this value on screen (or in a field)? Phone numbers
// match on digits, links without https://.
function looseHasInPage({ x, inputsOnly }) {
  const vals = [...document.querySelectorAll('input, textarea, select')].map((e) => e.tagName === 'SELECT' ? (e.selectedOptions[0]?.text || '') : (e.value || ''));
  const hay = (inputsOnly ? '' : document.body.innerText + '\n') + vals.join('\n');
  if (hay.includes(x)) return true;
  if (/^[\d\s()+.-]{7,}$/.test(x)) { const d = x.replace(/\D/g, ''); return hay.replace(/\D/g, '').includes(d); }
  if (/^https?:\/\//.test(x)) return hay.includes(x.replace(/^https?:\/\//, ''));
  return false;
}

// Runs in the page: tag the visible controls of the open dialog (or the page
// body outside the app's header/nav/tab bar) and return their labels.
function tagControlsInPage({ attr, chrome }) {
  const vis = (el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 3 && r.height > 3 && st.visibility !== 'hidden' && st.display !== 'none' && !el.closest('[aria-hidden="true"]'); };
  const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')].filter(vis);
  const root = dialogs[dialogs.length - 1] || document.body;
  // The app's own bars: the fixed, full-width strip at the top (it holds the
  // Notifications bell) or bottom (the tab bar), plus nav/tab strips.
  const isChrome = (el) => {
    if (el.closest('nav, [role="navigation"], [role="tablist"], [role="banner"]')) return true;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const st = getComputedStyle(a);
      if (st.position !== 'fixed' && st.position !== 'sticky') continue;
      const r = a.getBoundingClientRect();
      if (r.width > innerWidth * 0.8 && r.height < 160 && (r.top < 130 || r.bottom > innerHeight - 130)
        && (a.querySelector('[aria-label="Notifications"]') || a.querySelectorAll('a[href^="/app/"]').length >= 3)) return true;
    }
    return false;
  };
  document.querySelectorAll(`[${attr}]`).forEach((e) => e.removeAttribute(attr));
  const out = [];
  let i = 0;
  for (const el of root.querySelectorAll('button, a[href], [role="button"], [role="menuitem"], [role="tab"]')) {
    if (!vis(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    if (!dialogs.length && !chrome && isChrome(el)) continue;
    const t = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    el.setAttribute(attr, String(i));
    out.push({ i, t: t.slice(0, 60), submit: el.getAttribute('type') === 'submit', tag: el.tagName.toLowerCase(), href: el.getAttribute('href') || '' });
    i++;
  }
  return { inDialog: dialogs.length > 0, controls: out };
}

async function writeWalk(pw, device, session, outDir, real) {
  const started = Date.now();
  const fixtures = path.join(ROOT, 'tools/fixtures');
  const files = { image: path.join(fixtures, 'ZZ AUDIT phone photo.jpg'), video: path.join(fixtures, 'ZZ AUDIT clip.mp4'), doc: writeWalkPdf(outDir) };
  const browser = await pw.webkit.launch();
  // A phone in Phoenix with location allowed, so the time clock's GPS check can pass.
  const ctx = await browser.newContext({ ...device, storageState: session, acceptDownloads: true, geolocation: { latitude: 33.4484, longitude: -112.074, accuracy: 20 }, permissions: ['geolocation'] })
    .catch(() => browser.newContext({ ...device, storageState: session, acceptDownloads: true }));
  let page = null;
  const stamp = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '');
  const net = { writes: [], errs: [], popups: [], downloads: 0, chooser: 0 };
  const isWrite = (r) => r.method() !== 'GET' && r.method() !== 'HEAD' && r.method() !== 'OPTIONS' && (r.url().startsWith(SITE + '/api/') || /supabase\.co\/(rest|storage)\//.test(r.url()));
  const short = (u) => u.replace(SITE, '').replace(/https:\/\/[a-z0-9]+\.supabase\.co/, 'supabase').replace(/[0-9a-f-]{36}/gi, ':id').replace(/\?.*$/, '');
  async function newPage() {
    if (page) await page.close().catch(() => {});
    page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'ZZ AUDIT' : undefined).catch(() => {}));
    page.on('response', (r) => { const q = r.request(); if (isWrite(q)) net.writes.push({ m: q.method(), u: short(r.url()), s: r.status() }); });
    page.on('requestfailed', (q) => { if (isWrite(q)) net.writes.push({ m: q.method(), u: short(q.url()), s: 0 }); });
    page.on('pageerror', (e) => net.errs.push(String(e.message || e).slice(0, 160)));
    page.on('popup', (p) => { net.popups.push(p.url()); p.close().catch(() => {}); });
    page.on('download', () => { net.downloads++; });
    page.on('filechooser', async (fc) => {
      net.chooser++;
      const accept = ((await fc.element().getAttribute('accept').catch(() => '')) || '').toLowerCase();
      const f = /video/.test(accept) && !/image/.test(accept) ? files.video : /image/.test(accept) && !/pdf|application/.test(accept) ? files.image : /pdf|application|\.doc/.test(accept) ? files.doc : files.image;
      await fc.setFiles(fc.isMultiple() ? [f] : f).catch(() => {});
    });
    return page;
  }
  await newPage();
  const settle = async (ms = 1200) => { await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(ms); };
  const go = async (u) => { await page.goto(u.startsWith('http') ? u : SITE + u, { waitUntil: 'domcontentloaded', timeout: 45000 }); await settle(); };
  const bodyHas = (t) => page.evaluate(looseHasInPage, { x: t, inputsOnly: false }).catch(() => false);
  const formHas = (t) => page.evaluate(looseHasInPage, { x: t, inputsOnly: true }).catch(() => false);
  const inputCount = () => page.locator('input:visible, textarea:visible, select:visible').count().catch(() => 0);
  const dialogCount = () => page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible, [aria-modal="true"]:visible').count().catch(() => 0);
  const writeSummary = (w) => w.slice(0, 8).map((x) => `${x.m} ${x.u} → ${x.s || 'failed'}`);
  const badWrite = (w) => w.find((x) => x.s === 0 || x.s >= 400);
  const goodWrite = (w) => w.find((x) => x.s >= 200 && x.s < 400);

  async function pickCombos() {
    // Our own pickers (role=combobox / listbox buttons): open, choose ZZ AUDIT or the first option.
    const scopeSel = (await dialogCount()) ? '[role="dialog"]:visible, [aria-modal="true"]:visible' : 'main, body';
    const scope = page.locator(scopeSel).last();
    const combos = scope.locator('[role="combobox"]:visible, button[aria-haspopup="listbox"]:visible');
    const n = Math.min(await combos.count().catch(() => 0), 8);
    let picked = 0;
    for (let k = 0; k < n; k++) {
      const c = combos.nth(k);
      const cur = ((await c.inputValue().catch(() => null)) ?? (await c.innerText().catch(() => ''))).trim();
      if (cur && !/select|choose|pick|^—|^-+$|none/i.test(cur)) continue;
      await c.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(400);
      const opts = page.locator('[role="option"]:visible');
      if (!(await opts.count().catch(() => 0))) continue;
      const zz = opts.filter({ hasText: /ZZ AUDIT/i });
      await ((await zz.count()) ? zz.first() : opts.first()).click({ timeout: 3000 }).catch(() => {});
      picked++;
      await page.waitForTimeout(250);
    }
    return picked;
  }

  // Fill and submit the open form, through up to 4 steps (Next → Next → Save).
  async function fillAndSave(marker) {
    const typed = [];
    let clicked = [];
    net.writes.length = 0; net.errs.length = 0;
    for (let step = 0; step < 4; step++) {
      typed.push(...await page.evaluate(fillFormInPage, { marker, email: TEST_EMAIL }).catch(() => []));
      await pickCombos();
      // Native file inputs in the form get a test file too.
      const fileInputs = page.locator('input[type="file"]');
      for (let k = 0; k < Math.min(await fileInputs.count().catch(() => 0), 3); k++) {
        const fi = fileInputs.nth(k);
        if (!(await fi.evaluate((e) => { const d = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].pop(); return !d || d.contains(e); }).catch(() => false))) continue;
        const accept = ((await fi.getAttribute('accept').catch(() => '')) || '').toLowerCase();
        const f = /video/.test(accept) && !/image/.test(accept) ? files.video : /pdf|application/.test(accept) ? files.doc : files.image;
        await fi.setInputFiles(f).catch(() => {});
      }
      const { controls } = await page.evaluate(tagControlsInPage, { attr: 'data-ws', chrome: false });
      const save = controls.find((b) => b.submit && SAVE_RE.test(b.t) && !CANCEL_RE.test(b.t))
        || [...controls].reverse().find((b) => SAVE_RE.test(b.t) && !CANCEL_RE.test(b.t) && !ADD_RE.test(b.t))
        || [...controls].reverse().find((b) => SAVE_RE.test(b.t) && !CANCEL_RE.test(b.t));
      if (!save) break;
      const before = net.writes.length;
      await page.locator(`[data-ws="${save.i}"]`).first().click({ timeout: 5000 }).catch(() => {});
      clicked.push(save.t);
      await settle(2000);
      if (net.writes.length > before) break; // it sent something
      // Still on a form with a different next button? go round again.
      const errs = await page.evaluate(() => [...document.querySelectorAll('[role="alert"], [aria-invalid="true"], .error, [data-error]')].map((e) => (e.innerText || e.getAttribute('aria-label') || e.getAttribute('name') || '').trim()).filter(Boolean).slice(0, 4)).catch(() => []);
      if (errs.length) { clicked.push(`(form says: ${errs.join(' / ').slice(0, 160)})`); }
    }
    return { typed, clicked, writes: [...net.writes], errors: [...net.errs] };
  }

  // Find the record on the list screen and open it.
  async function openRecord(listUrl, marker) {
    await go(listUrl);
    for (let tries = 0; tries < 2; tries++) {
      const found = await page.evaluate((m) => {
        const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
        let best = null;
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          if (n.nodeValue.includes(m) && n.parentElement && vis(n.parentElement) && !n.parentElement.closest('[aria-hidden="true"]')) { best = n.parentElement; break; }
        }
        if (!best) return false;
        document.querySelectorAll('[data-wopen]').forEach((e) => e.removeAttribute('data-wopen'));
        (best.closest('a[href], button, [role="button"], tr, li, [role="row"]') || best).setAttribute('data-wopen', '1');
        best.setAttribute('data-wopen', '2');
        return true;
      }, marker).catch(() => false);
      if (found) {
        const url0 = page.url(); const d0 = await dialogCount();
        await page.locator('[data-wopen="2"]').first().scrollIntoViewIfNeeded().catch(() => {});
        await page.locator('[data-wopen="2"]').first().click({ timeout: 4000 }).catch(() => {});
        await settle(1200);
        if (page.url() !== url0 || (await dialogCount()) > d0) return true;
        await page.locator('[data-wopen="1"]').first().click({ timeout: 4000 }).catch(() => {});
        await settle(1200);
        return page.url() !== url0 || (await dialogCount()) > d0 ? true : 'in place';
      }
      // Lists that hide closed items: try an "All" filter once.
      const all = page.locator('button:visible, [role="tab"]:visible').filter({ hasText: /^\s*All\b/ });
      if (tries === 0 && (await all.count())) { await all.first().click().catch(() => {}); await settle(800); } else break;
    }
    return false;
  }

  const out = [];
  const leftovers = [];
  const writeReport = () => {
    fs.writeFileSync(path.join(outDir, 'write-report.json'), JSON.stringify({ results: out, leftovers }, null, 1));
    const L = [`# Action walk — every Add/New, save, reload, reopen, edit, every record button, delete (${real ? 'real account' : 'demo account'}, iPhone WebKit)`, '',
      'Test records only (ZZ AUDIT). Mail goes to delivered@resend.dev, phones to 602-555-0100.', '',
      '| Screen | Add/New | Create | Back after reload | Fields back | Edit pre-filled | Edit saved | Record buttons | Delete |', '|---|---|---|---|---|---|---|---|---|'];
    for (const r of out) {
      const acts = (r.actions || []);
      const bad = acts.filter((a) => /FAILED|nothing happened|error/i.test(a.result)).length;
      L.push(`| ${r.screen} | ${r.add || ''} | ${r.create || ''} | ${r.persisted || ''} | ${r.fieldsBack || ''} | ${r.prefilled || ''} | ${r.edit || ''} | ${acts.length ? `${acts.length} tapped${bad ? `, **${bad} bad**` : ''}` : ''} | ${r.del || ''} |`);
    }
    L.push('', '## Details', '');
    for (const r of out) {
      const lines = [];
      if (r.saveClicked?.length) lines.push(`  - save: ${r.saveClicked.join(' → ')}`);
      if (r.writes?.length) lines.push(`  - sent: ${r.writes.join(' · ')}`);
      if (r.missing?.length) lines.push(`  - NOT BACK after reload: ${r.missing.join(', ')}`);
      if (r.notPrefilled?.length) lines.push(`  - edit form EMPTY for: ${r.notPrefilled.join(', ')}`);
      for (const a of r.actions || []) lines.push(`  - "${a.label}": ${a.result}${a.writes?.length ? ' — ' + a.writes.join(' · ') : ''}`);
      for (const e of r.errors || []) lines.push(`  - ERROR: ${e}`);
      if (lines.length) L.push(`- **${r.screen}**`, ...lines);
    }
    if (leftovers.length) L.push('', '## Test records left behind', '', ...leftovers.map((x) => `- ${x}`));
    fs.writeFileSync(path.join(outDir, 'write-report.md'), L.join('\n') + '\n');
  };

  // One full cycle on one screen. deferDelete keeps people records for pickers.
  async function cycle(screen, listUrl, deferred) {
    const label = screen.replace(/^\/app\/?/, '') || 'home';
    const tag = label.replace(/^projects\/:id\//, '').replace(/[^a-z0-9]+/gi, ' ').trim();
    const results = [];
    await go(listUrl);
    const { controls } = await page.evaluate(tagControlsInPage, { attr: 'data-wa', chrome: false });
    const adds = [];
    for (const c of controls) if (ADD_RE.test(c.t) && c.t.length < 44 && !adds.some((a) => a.t === c.t)) adds.push(c);
    if (!adds.length) { out.push({ screen: label, add: 'no Add/New on this screen' }); return; }
    for (const [n, add] of adds.slice(0, 4).entries()) {
      const marker = `ZZ AUDIT ${tag} ${n ? n + 1 + ' ' : ''}${stamp}`;
      const r = { screen: label, add: add.t, errors: [], actions: [] };
      results.push(r); out.push(r);
      try {
        if (n) { await go(listUrl); await page.evaluate(tagControlsInPage, { attr: 'data-wa', chrome: false }); }
        const target = page.locator(`[data-wa]`).filter({ hasText: add.t }).first();
        const url0 = page.url(); const chooser0 = net.chooser; const in0 = await inputCount();
        net.writes.length = 0;
        await target.scrollIntoViewIfNeeded().catch(() => {});
        await target.click({ timeout: 5000 });
        await settle(1500);
        if (net.chooser > chooser0) { await settle(4000); }
        const opened = page.url() !== url0 || (await dialogCount()) > 0 || net.chooser > chooser0 || (await inputCount()) > in0;
        if (!opened && !net.writes.length) { r.create = 'DEAD — tapping it did nothing'; continue; }
        if (net.chooser > chooser0 && !(await dialogCount())) {
          r.create = goodWrite(net.writes) && !badWrite(net.writes) ? 'uploaded' : badWrite(net.writes) ? `FAILED (${writeSummary([badWrite(net.writes)])})` : 'picked a file but nothing was sent';
          r.writes = writeSummary(net.writes);
          leftovers.push(`${label}: uploaded test file "ZZ AUDIT …" (left on the test job, archived with it)`);
          continue;
        }
        const f = await fillAndSave(marker);
        r.filled = f.typed.length; r.saveClicked = f.clicked; r.writes = writeSummary(f.writes);
        if (f.errors.length) r.errors.push(...f.errors.slice(0, 3));
        const bad = badWrite(f.writes);
        r.create = bad ? `FAILED (${bad.m} ${bad.u} → ${bad.s || 'network'})` : goodWrite(f.writes) ? 'saved' : f.clicked.length ? 'NOTHING SENT on save' : `form opened (${f.typed.length} fields) but no Save button`;
        if (!goodWrite(f.writes)) continue;
        // Reload → back? → reopen → every field back?
        await go(listUrl);
        r.persisted = (await bodyHas(marker)) ? 'yes' : 'NOT ON LIST after reload';
        const open = await openRecord(listUrl, marker);
        if (!open) { if (r.persisted === 'yes') r.persisted = 'listed, but tapping it opened nothing'; leftovers.push(`${label}: "${marker}"`); continue; }
        const expect = [...new Set(f.typed.filter((t) => ['text', 'textarea', 'email', 'tel', 'url', 'input'].includes(t.kind) || /zz audit/i.test(t.value)).map((t) => t.value))];
        const missing = [];
        for (const v of expect) if (!(await bodyHas(v))) missing.push(v.replace(marker, '‹marker›'));
        r.fieldsBack = `${expect.length - missing.length}/${expect.length}`;
        if (missing.length) r.missing = missing;
        // Edit: pre-filled? save → reload → edited?
        const { controls: rc } = await page.evaluate(tagControlsInPage, { attr: 'data-wr', chrome: false });
        const edit = rc.find((b) => /^\s*edit\b/i.test(b.t));
        if (edit) {
          await page.locator(`[data-wr="${edit.i}"]`).first().click({ timeout: 4000 }).catch(() => {});
          await settle(1000);
          const notPre = [];
          for (const v of expect) if (!(await formHas(v))) notPre.push(v.replace(marker, '‹marker›'));
          r.prefilled = `${expect.length - notPre.length}/${expect.length}`;
          if (notPre.length) r.notPrefilled = notPre;
          const changed = await page.evaluate(({ m }) => {
            for (const el of document.querySelectorAll('input, textarea')) {
              if (el.value === m) {
                const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, m + ' edited');
                el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
            }
            return false;
          }, { m: marker });
          if (changed) {
            net.writes.length = 0;
            const { controls: ec } = await page.evaluate(tagControlsInPage, { attr: 'data-we', chrome: false });
            const sv = ec.find((b) => b.submit && !CANCEL_RE.test(b.t)) || [...ec].reverse().find((b) => /^\s*(save|update|done)\b/i.test(b.t));
            if (sv) await page.locator(`[data-we="${sv.i}"]`).first().click({ timeout: 4000 }).catch(() => {});
            await settle(2000);
            const be = badWrite(net.writes);
            await go(listUrl);
            r.edit = !sv ? 'edit form has no Save' : be ? `FAILED (${be.m} ${be.u} → ${be.s || 'network'})` : !goodWrite(net.writes) ? 'NOTHING SENT on save' : (await bodyHas(marker + ' edited')) ? 'yes' : 'saved, but the change is NOT on screen after reload';
          } else r.edit = 'edit form did not show the saved title';
        } else r.edit = 'no Edit button on the record';
        // Every other button on the record, one at a time, terminal ones last.
        if (!(await openRecord(listUrl, marker))) { r.errors.push('could not reopen the record after editing'); leftovers.push(`${label}: "${marker}"`); continue; }
        const { controls: ac } = await page.evaluate(tagControlsInPage, { attr: 'data-wr', chrome: false });
        const labels = [...new Set(ac.map((b) => b.t).filter((t) => !NOT_ACTION_RE.test(t) && !t.includes(marker)))].slice(0, 16);
        labels.sort((a, b) => Number(LAST_RE.test(a)) - Number(LAST_RE.test(b)));
        for (const al of labels) {
          if (Date.now() - started > WRITE_BUDGET_MS) break;
          const a = { label: al, result: '' };
          r.actions.push(a);
          try {
            if (!(await openRecord(listUrl, marker))) { a.result = 'record no longer on the list (an earlier button closed/moved it)'; break; }
            await page.evaluate(tagControlsInPage, { attr: 'data-wr', chrome: false });
            const btn = page.locator('[data-wr]').filter({ hasText: al }).first();
            const exists = await btn.count();
            const b2 = exists ? btn : page.locator(`[data-wr][aria-label="${al.replace(/"/g, '\\"')}"]`).first();
            if (!(await b2.count())) { a.result = 'gone after reopening (state changed)'; continue; }
            const u0 = page.url(); const d0 = await dialogCount(); const dl0 = net.downloads; const pp0 = net.popups.length; const fc0 = net.chooser;
            net.writes.length = 0; net.errs.length = 0;
            await b2.click({ timeout: 4000 });
            await settle(1500);
            if ((await dialogCount()) > d0) {
              // It opened a form or a confirm: fill it and go ahead.
              const f2 = await fillAndSave(`${marker} ${al}`.slice(0, 80));
              a.writes = writeSummary(f2.writes);
              const b = badWrite(f2.writes);
              a.result = b ? `FAILED (${b.m} ${b.u} → ${b.s || 'network'})` : goodWrite(f2.writes) ? 'opened a form → saved' : f2.clicked.length ? `opened a form → "${f2.clicked.join(' → ')}" sent NOTHING` : 'opened a panel (no form to save)';
            } else {
              a.writes = writeSummary(net.writes);
              const b = badWrite(net.writes);
              a.result = b ? `FAILED (${b.m} ${b.u} → ${b.s || 'network'})`
                : goodWrite(net.writes) ? 'saved'
                : net.downloads > dl0 ? 'downloaded a file'
                : net.popups.length > pp0 ? `opened ${net.popups[net.popups.length - 1].slice(0, 80)}`
                : net.chooser > fc0 ? 'opened the file picker'
                : page.url() !== u0 ? `went to ${short(page.url())}`
                : 'nothing happened (dead button?)';
            }
            if (net.errs.length) a.result += ` · page error: ${net.errs[0]}`;
          } catch (e) { a.result = `error: ${String(e.message || e).split('\n')[0].slice(0, 120)}`; }
        }
        if (deferred) { deferred.push({ label, listUrl, marker, r }); r.del = '(at the end — used by the pickers)'; continue; }
        await deleteRecord(label, listUrl, marker, r);
      } catch (e) {
        r.errors.push(String(e.message || e).split('\n')[0].slice(0, 160));
        if (r.create === 'saved') leftovers.push(`${label}: "${marker}"`);
        await newPage();
      }
      writeReport();
    }
  }

  // Every other button on the screen that writes (Clock In → Clock Out, Sync,
  // Generate, Mark all read…), re-scanning after each tap so what appears next
  // gets tapped too. On the test job everything is ours; on company-wide
  // screens row buttons (a real record's Approve/Pay) are left to the record
  // pass, and with the real account nothing that mails or pays real people.
  async function pageActions(screen, listUrl, onTestJob) {
    const label = screen.replace(/^\/app\/?/, '') || 'home';
    const r = { screen: `${label} — page buttons`, add: '', errors: [], actions: [] };
    const tried = new Set();
    try {
      for (let round = 0; round < 10; round++) {
        await go(listUrl);
        const { controls } = await page.evaluate(tagControlsInPage, { attr: 'data-wx', chrome: false });
        const inRow = await page.evaluate(() => [...document.querySelectorAll('[data-wx]')].filter((e) => e.closest('tr, li, [role="row"], [role="listitem"], article')).map((e) => e.getAttribute('data-wx'))).catch(() => []);
        const next = controls.find((b) => !tried.has(b.t) && WALK_DENY.test(b.t) && !ADD_RE.test(b.t) && !DELETE_RE.test(b.t) && !/(sign|log) ?out/i.test(b.t)
          && !CANCEL_RE.test(b.t) && b.t.length < 50 && (onTestJob || !inRow.includes(String(b.i)))
          && !(real && !onTestJob && /send|e-?mail|text|sms|notify|remind|invite|publish|\bpay\b|charge/i.test(b.t)));
        if (!next) break;
        tried.add(next.t);
        const a = { label: next.t, result: '' };
        r.actions.push(a);
        const u0 = page.url(); const d0 = await dialogCount(); const dl0 = net.downloads; const pp0 = net.popups.length; const fc0 = net.chooser;
        net.writes.length = 0; net.errs.length = 0;
        await page.locator(`[data-wx="${next.i}"]`).first().click({ timeout: 4000 }).catch((e) => { a.result = 'could not tap: ' + e.message.split('\n')[0].slice(0, 80); });
        if (a.result) continue;
        await settle(2000);
        if ((await dialogCount()) > d0) {
          const f = await fillAndSave(`ZZ AUDIT ${label} ${next.t} ${stamp}`.slice(0, 80));
          a.writes = writeSummary(f.writes);
          const b = badWrite(f.writes);
          a.result = b ? `FAILED (${b.m} ${b.u} → ${b.s || 'network'})` : goodWrite(f.writes) ? 'opened a form → saved' : f.clicked.length ? `opened a form → "${f.clicked.join(' → ')}" sent NOTHING` : 'opened a panel (nothing to save)';
        } else {
          a.writes = writeSummary(net.writes);
          const b = badWrite(net.writes);
          a.result = b ? `FAILED (${b.m} ${b.u} → ${b.s || 'network'})` : goodWrite(net.writes) ? 'saved'
            : net.downloads > dl0 ? 'downloaded a file' : net.popups.length > pp0 ? `opened ${net.popups[net.popups.length - 1].slice(0, 80)}`
            : net.chooser > fc0 ? 'opened the file picker' : page.url() !== u0 ? `went to ${short(page.url())}` : 'nothing happened (dead button?)';
        }
        if (net.errs.length) a.result += ` · page error: ${net.errs[0]}`;
        if (/^(saved|opened a form → saved)/.test(a.result) && !onTestJob) leftovers.push(`${label}: "${next.t}" changed company data (test values only)`);
      }
    } catch (e) { r.errors.push(String(e.message || e).split('\n')[0].slice(0, 160)); await newPage(); }
    if (r.actions.length || r.errors.length) { r.add = `${r.actions.length} write buttons`; out.push(r); }
  }

  async function deleteRecord(label, listUrl, marker, r) {
    if (!(await openRecord(listUrl, marker))) { r.del = (await bodyHas(marker)) ? 'listed but would not open' : 'not on the list any more (closed/moved by a button)'; if (r.del.startsWith('listed')) leftovers.push(`${label}: "${marker}"`); return; }
    const { controls } = await page.evaluate(tagControlsInPage, { attr: 'data-wd', chrome: false });
    let del = controls.find((b) => DELETE_RE.test(b.t));
    if (!del) {
      // Often behind a ⋯ / More menu.
      const more = controls.find((b) => /^(more|⋯|…|\.\.\.|options|actions|menu)$/i.test(b.t) || /more|options|actions/i.test(b.t));
      if (more) { await page.locator(`[data-wd="${more.i}"]`).first().click().catch(() => {}); await settle(500); const again = await page.evaluate(tagControlsInPage, { attr: 'data-wd', chrome: true }); del = again.controls.find((b) => DELETE_RE.test(b.t)); }
    }
    if (!del) { r.del = 'NO DELETE on the record'; leftovers.push(`${label}: "${marker}"`); return; }
    net.writes.length = 0;
    await page.locator(`[data-wd="${del.i}"]`).first().click({ timeout: 4000 }).catch(() => {});
    await settle(800);
    const confirm = page.locator('[role="alertdialog"]:visible button, [role="dialog"]:visible button').filter({ hasText: /^\s*(delete|remove|archive|yes|confirm|ok)\b/i }).last();
    if (await confirm.count()) { await confirm.click({ timeout: 4000 }).catch(() => {}); await settle(1500); }
    const bd = badWrite(net.writes);
    await go(listUrl);
    r.del = bd ? `FAILED (${bd.m} ${bd.u} → ${bd.s || 'network'})` : (await bodyHas(marker)) ? 'STILL THERE after delete' : 'yes';
    if (r.del !== 'yes') leftovers.push(`${label}: "${marker}"`);
  }

  // 1) The test job, through the real New Project form.
  const jobName = `ZZ AUDIT Walk Job ${stamp}`;
  const jr = { screen: 'projects/new (New Job form)', errors: [], actions: [] };
  out.push(jr);
  await go('/app/projects/new');
  await page.fill('[data-tour="project-name"]', jobName).catch((e) => jr.errors.push('name: ' + e.message.split('\n')[0]));
  await page.fill('[data-tour="project-address"]', '100 Test Way, Phoenix, AZ 85001').catch((e) => jr.errors.push('address: ' + e.message.split('\n')[0]));
  const jf = await page.evaluate(fillFormInPage, { marker: jobName, email: TEST_EMAIL }).catch(() => []);
  net.writes.length = 0;
  const submits = page.locator('button[type="submit"]:visible');
  await submits.last().click({ timeout: 5000 }).catch((e) => jr.errors.push('submit: ' + e.message.split('\n')[0]));
  await settle(3000);
  const jobId = page.url().match(/\/app\/projects\/([0-9a-f-]{36})/i)?.[1] || null;
  jr.add = 'New Job form'; jr.filled = jf.length + 2; jr.writes = writeSummary(net.writes);
  jr.create = jobId ? 'saved' : badWrite(net.writes) ? `FAILED (${writeSummary([badWrite(net.writes)])})` : 'NOTHING SENT on save';
  writeReport();
  if (!jobId) { console.log(`write-walk: the New Job form did not make a job — ${jr.create}`); }
  console.log(`write-walk: test job ${jobId ? jobName : 'NOT CREATED'}`);
  if (jobId) {
    await go(`/app/projects/${jobId}/overview`);
    jr.persisted = (await bodyHas(jobName)) ? 'yes' : 'NOT SHOWN on the job after reload';
  }

  // 2) People first (kept until the end so pickers can choose them), then everything else.
  const deferred = [];
  const jobUrl = (t) => `/app/projects/${jobId}/${t}`;
  const plan = [
    ...PEOPLE_TOP.map((u) => [u, u, true]),
    ...(jobId ? PEOPLE_JOB.map((t) => [`projects/:id/${t}`, jobUrl(t), true]) : []),
    ...WALK_TOP.filter((u) => !PEOPLE_TOP.includes(u)).map((u) => [u, u, false]),
    ...(jobId ? WALK_JOB.filter((t) => !PEOPLE_JOB.includes(t)).map((t) => [`projects/:id/${t}`, jobUrl(t), false]) : []),
  ];
  let done = 0;
  for (const [screen, url, people] of plan) {
    if (Date.now() - started > WRITE_BUDGET_MS) { out.push({ screen: screen.replace(/^\/app\/?/, ''), add: 'NOT REACHED — out of time', errors: [] }); continue; }
    const timer = new Promise((res) => setTimeout(() => res('timeout'), SCREEN_BUDGET_MS));
    const res = await Promise.race([cycle(screen, url, people ? deferred : null).then(() => pageActions(screen, url, url.includes(`/projects/${jobId}/`))).then(() => 'ok', (e) => `error: ${String(e.message || e).split('\n')[0]}`), timer]);
    if (res !== 'ok') { out.push({ screen: screen.replace(/^\/app\/?/, '') || 'home', add: res === 'timeout' ? 'STOPPED — took over 10 minutes' : res, errors: [] }); await newPage(); }
    done++;
    const shown = screen.replace(/^\/app\/?/, '') || 'home';
    console.log(`write-walk ${done}/${plan.length} ${screen}: ${out.filter((r) => r.screen === shown || r.screen === `${shown} — page buttons`).map((r) => `${r.add} → ${r.create || '-'} / reload ${r.persisted || '-'} / edit ${r.edit || '-'} / delete ${r.del || '-'}`).join(' ; ')}`);
    writeReport();
  }
  for (const d of deferred) { try { await deleteRecord(d.label, d.listUrl, d.marker, d.r); } catch (e) { d.r.del = `error: ${String(e.message || e).split('\n')[0]}`; } }
  writeReport();

  // 3) Payments: every upgrade / checkout / billing button (no card is entered).
  const pay = { screen: 'payments (/app/billing, /app/settings)', add: 'plan & billing buttons', errors: [], actions: [] };
  out.push(pay);
  for (const u of ['/app/billing', '/app/settings']) {
    try {
      await go(u);
      const { controls } = await page.evaluate(tagControlsInPage, { attr: 'data-wp', chrome: false });
      const buys = [...new Set(controls.filter((b) => /upgrade|subscribe|checkout|choose|select plan|start (plan|trial|subscription)|buy|pay now|manage (billing|subscription|plan)|billing portal|change plan|add card|payment method/i.test(b.t)).map((b) => b.t))].slice(0, 8);
      for (const t of buys) {
        await go(u);
        await page.evaluate(tagControlsInPage, { attr: 'data-wp', chrome: false });
        const u0 = page.url(); const pp0 = net.popups.length;
        net.writes.length = 0;
        let nav = null;
        page.once('framenavigated', (fr) => { if (fr === page.mainFrame()) nav = fr.url(); });
        await page.locator('[data-wp]').filter({ hasText: t }).first().click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(5000);
        const now = page.url();
        const b = badWrite(net.writes);
        const where = net.popups.length > pp0 ? net.popups[net.popups.length - 1] : now !== u0 ? now : nav;
        const msg = await page.evaluate(() => [...document.querySelectorAll('[role="alert"], [role="status"], [data-sonner-toast], .toast')].map((e) => e.innerText.trim()).filter(Boolean).join(' / ').slice(0, 160)).catch(() => '');
        pay.actions.push({ label: `${u} · ${t}`, result: where && /stripe\.com/.test(where) ? `opened Stripe (${new URL(where).host}${new URL(where).pathname.slice(0, 20)}…)` : b ? `FAILED (${b.m} ${b.u} → ${b.s || 'network'})${msg ? ' — ' + msg : ''}` : where && where !== u0 ? `went to ${short(where)}` : msg ? `showed: ${msg}` : 'nothing happened (dead button?)', writes: writeSummary(net.writes) });
        if (!page.url().startsWith(SITE)) await go(u);
      }
      if (!buys.length) pay.actions.push({ label: u, result: 'no plan / billing buttons on this screen' });
    } catch (e) { pay.errors.push(`${u}: ${String(e.message || e).split('\n')[0]}`); await newPage(); }
  }
  writeReport();

  // 4) Archive the test job (and any left by earlier runs) through the job's own button.
  const arch = { screen: 'archive the test job', add: 'Archive Job', errors: [], actions: [] };
  out.push(arch);
  try {
    const d = await (await page.request.get(`${SITE}/api/projects?limit=200&fields=id,name`)).json();
    const zz = (d.projects || d.data || []).filter((j) => /^ZZ AUDIT Walk Job/i.test(j.name || ''));
    for (const j of zz) {
      await go(`/app/projects/${j.id}/overview`);
      net.writes.length = 0;
      const btn = page.locator('button:visible').filter({ hasText: /archive job/i }).first();
      if (!(await btn.count())) { arch.actions.push({ label: j.name, result: 'NO Archive Job button on the overview' }); continue; }
      await btn.click({ timeout: 4000 });
      await settle(800);
      const ok = page.locator('[role="alertdialog"]:visible button, [role="dialog"]:visible button').filter({ hasText: /archive|confirm|yes/i }).last();
      if (await ok.count()) await ok.click({ timeout: 4000 }).catch(() => {});
      await settle(2000);
      const after = await (await page.request.get(`${SITE}/api/projects?limit=200&fields=id,name`)).json().catch(() => ({}));
      const still = (after.projects || after.data || []).some((x) => x.id === j.id);
      const b = badWrite(net.writes);
      arch.actions.push({ label: j.name, result: b ? `FAILED (${b.m} ${b.u} → ${b.s || 'network'})` : still ? 'STILL in the job list after archiving' : 'archived (gone from the job list)', writes: writeSummary(net.writes) });
    }
    arch.create = arch.actions.every((a) => a.result.startsWith('archived')) ? 'yes' : 'see below';
  } catch (e) { arch.errors.push(String(e.message || e).split('\n')[0]); }
  writeReport();

  // 5) Sign Out, last.
  const so = { screen: 'Sign Out', add: 'Sign Out', errors: [], actions: [] };
  out.push(so);
  try {
    await go('/app');
    let target = page.locator(':is(button, a, [role="menuitem"]):visible').filter({ hasText: /^\s*(sign|log) ?out\s*$/i }).first();
    if (!(await target.count())) {
      // The initials button opens the account menu.
      const initials = page.locator('header button:visible, button:visible').filter({ hasText: /^\s*[A-Z]{1,3}\s*$/ }).first();
      if (await initials.count()) { await initials.click().catch(() => {}); await settle(400); }
      target = page.locator(':is(button, a, [role="menuitem"]):visible').filter({ hasText: /(sign|log) ?out/i }).first();
    }
    if (!(await target.count())) {
      const menu = page.locator('button:visible[aria-label*="menu" i], button:visible[aria-label*="more" i], a:visible[href="/app/more"]').first();
      if (await menu.count()) { await menu.click().catch(() => {}); await settle(600); }
      target = page.locator(':is(button, a, [role="menuitem"]):visible').filter({ hasText: /(sign|log) ?out/i }).first();
    }
    if (!(await target.count())) so.create = 'NO Sign Out reachable on the phone';
    else {
      await target.click({ timeout: 4000 });
      await page.waitForURL((u) => /\/(login|$)/.test(u.pathname) || u.pathname === '/', { timeout: 15000 }).catch(() => {});
      const at = short(page.url());
      await go('/app');
      const back = short(page.url());
      so.create = /login|^\/$/.test(at) ? `signed out → ${at}` : `tapped, but stayed on ${at}`;
      so.persisted = /login/.test(back) ? 'yes — /app now asks for sign-in' : `NO — /app still opens (${back})`;
    }
  } catch (e) { so.errors.push(String(e.message || e).split('\n')[0]); }
  writeReport();
  console.log(`write-walk: done in ${Math.round((Date.now() - started) / 60000)} min — tools/walk/write-report.md`);
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 15000))]);
}

// Run last: every const above is initialised before a mode starts.
if (MODE === 'capture') await capture();
else if (MODE === 'upload') await upload();
else if (MODE === 'proof') await proof();
else if (MODE === 'walk') await walk();
else { console.error('use: node tools/asc-screens.mjs capture|upload|proof|walk'); process.exit(1); }
