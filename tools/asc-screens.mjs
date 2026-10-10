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
// Tap every control on every screen of the iPhone app (WebKit, iPhone profile,
// demo sign-in) and report what does nothing, what errors, and what 404s.
// Never taps anything that writes data or leaves the account.
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

  async function signedInContext() {
    const ctx = await browser.newContext(device);
    const page = await ctx.newPage();
    await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="email"]', review.demoAccountName);
    await page.fill('input[name="password"]', review.demoAccountPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
    await page.close();
    return ctx;
  }

  // The demo job.
  const ctx0 = await signedInContext();
  const p0 = await ctx0.newPage();
  await p0.goto(`${SITE}/app/projects`, { waitUntil: 'networkidle' });
  const links = await p0.$$eval('a[href*="/app/projects/"]', (as) => as.map((a) => [a.getAttribute('href'), a.innerText]));
  const idOf = (h) => h && h.match(/\/app\/projects\/([0-9a-f-]{36})/i)?.[1];
  const project = idOf(links.find(([h, t]) => idOf(h) && /ZZ AUDIT/i.test(t))?.[0])
    || idOf(links.find(([h, t]) => idOf(h) && t.includes(PROJECT_NAME))?.[0]) || links.map(([h]) => idOf(h)).find(Boolean);
  await ctx0.close();
  const routes = [...WALK_TOP, ...(project ? WALK_JOB.map((t) => `/app/projects/${project}/${t}`) : [])];
  const shortUrl = (u) => u.replace(SITE, '').replace(/[0-9a-f-]{36}/gi, ':id');
  const results = [];
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
        try {
          await el.scrollIntoViewIfNeeded({ timeout: 2000 });
          await el.click({ timeout: 3000 });
        } catch (e) {
          const m = String(e.message || e);
          if (/intercepts pointer events|not visible|outside of the viewport/i.test(m)) res.covered.push({ label: c.label, why: m.match(/<[^>]{0,80}>[^\n]{0,40} intercepts pointer events/)?.[0] || m.split('\n')[0].slice(0, 120), html: c.html });
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
  results[first[1]] = await walkRoute(ctxA, first[0], first[1]);
  await ctxA.close();
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    const ctx = await signedInContext();
    while (queue.length) {
      const [r, i] = queue.shift();
      results[i] = await walkRoute(ctx, r, i);
    }
    await ctx.close();
  }));
  await browser.close();

  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 1));
  const lines = ['# App walk — iPhone (WebKit), demo account', '', `${results.length} screens · ${results.reduce((n, r) => n + r.tapped, 0)} controls tapped · ${results.reduce((n, r) => n + r.dead.length, 0)} dead · ${results.reduce((n, r) => n + r.covered.length, 0)} covered · ${results.reduce((n, r) => n + r.erroring.length, 0)} erroring · ${results.reduce((n, r) => n + r.apiErrors.length, 0)} API errors`, ''];
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
  console.log(lines.slice(0, 3).join('\n'));
}

if (MODE === 'capture') await capture();
else if (MODE === 'upload') await upload();
else if (MODE === 'proof') await proof();
else if (MODE === 'walk') await walk();
else { console.error('use: node tools/asc-screens.mjs capture|upload|proof'); process.exit(1); }

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
