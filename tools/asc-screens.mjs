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
    let n = 0;
    for (const [name, route, action, full] of PROOF) {
      if (route.includes('{project}') && !project) { console.log(`  skip ${name} (no project)`); continue; }
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
        const file = path.join(dir, `${String(++n).padStart(2, '0')}-${name}.png`);
        await page.screenshot({ path: file, fullPage: !!full });
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        console.log(`  ${path.basename(file)}  ${page.url().replace(SITE, '').replace(/[0-9a-f-]{36}/gi, ':id')}  overflow:${m.sw > m.cw ? m.sw - m.cw + 'px' : 'none'}`);
      } catch (e) {
        console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`);
      }
    }
    if (errors.length) console.log(`  page errors: ${[...new Set(errors)].join(' | ')}`);
    await ctx.close();
  }
  await browser.close();
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

if (MODE === 'capture') await capture();
else if (MODE === 'upload') await upload();
else if (MODE === 'proof') await proof();
else { console.error('use: node tools/asc-screens.mjs capture|upload|proof'); process.exit(1); }
