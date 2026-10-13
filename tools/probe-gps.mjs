/**
 * tools/probe-gps.mjs — GPS-stamped jobsite photos (#165), on production.
 * Writes nothing: every upload request is answered by a browser fixture, and
 * isolation is proven before anything is clicked (service workers blocked, a
 * fixture answers, an unmocked upload/ingest is denied) — or the run stops.
 *
 *   phone (Chromium, iPhone 15 metrics, touch, location allowed at a fixed
 *   point): a photo added through Add Photos & Video sends that location with
 *   the upload · desktop (1440, no touch): the same upload sends no location ·
 *   desktop viewer: a stamped photo (fixture list) shows "GPS Location" with
 *   the coordinates and a maps link · the in-app price rule (app user agent →
 *   /app; a browser still gets /pricing), which also waits for the deploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const TAG = (() => { try { return fs.readFileSync(new URL('./probe-label.txt', import.meta.url), 'utf8').trim(); } catch { return ''; } })();
const SITE = (process.env.SITE || 'https://www.saguarocontrol.net').replace(/\/$/, '');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'tools/probe');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR, 'noop.js'));
const pw = require('playwright');
const R = { site: SITE, tag: TAG || null, startedAt: new Date().toISOString(), checks: [], error: null };
const check = (name, ok, detail) => { R.checks.push({ name, ok: !!ok, detail: detail == null ? undefined : String(detail).slice(0, 240) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail != null ? ' — ' + String(detail).slice(0, 160) : ''}`); };
const shot = (page, name) => page.screenshot({ path: path.join(OUT, 'shots', `${name}.jpg`), type: 'jpeg', quality: 72 }).catch(() => {});
async function open(page, url) { try { await page.goto(`${SITE}${url}`, { waitUntil: 'networkidle', timeout: 35000 }); } catch { await page.waitForTimeout(2500); } await page.waitForTimeout(1500); }
async function login(page) {
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
}
const AT = { latitude: 33.4484, longitude: -112.074 };
const WRITES = /\/api\/photos\/(upload-url|ingest|upload|create)\b|\/api\/files\/(upload-url|record)\b|\/storage\/v1\/object\//;

async function isolated(ctx) {
  await ctx.route(WRITES, (route) => {
    const r = route.request();
    if (r.method() === 'GET' && /\/storage\/v1\/object\//.test(r.url())) return route.continue(); // reading a stored file is free
    return route.abort('blockedbyclient');
  });
}
async function proveIsolation(page, label) {
  await page.route(/\/__probe_mock_check$/, (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: 'mocked' }));
  const sw = await page.evaluate(() => !!navigator.serviceWorker?.controller).catch(() => true);
  const iso = await page.evaluate(async () => ({
    mocked: (await fetch('/__probe_mock_check').then((r) => r.text()).catch(() => null)) === 'mocked',
    denied: await fetch('/api/photos/ingest', { method: 'POST', body: '{}' }).then(() => false, () => true),
  })).catch(() => ({ mocked: false, denied: false }));
  check(`${label}: isolation (no service worker, fixtures answer, unmocked ingest denied)`, !sw && iso.mocked && iso.denied, `sw ${sw ? 'controlled' : 'none'} · fixture ${iso.mocked} · deny ${iso.denied}`);
  if (sw || !iso.mocked || !iso.denied) throw new Error(`${label}: isolation not confirmed — aborted before any action`);
}
// Upload fixtures: the signed URL and the PUT stay in the browser; ingest's body is captured.
async function uploadFixtures(page, sink) {
  await page.route(/\/api\/photos\/upload-url\b/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bucket: 'fixture', path: 'fixture/probe.jpg', token: 'fixture', signedUrl: `${SITE}/__probe_put` }) }));
  await page.route(/\/__probe_put\b/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"fixture/probe.jpg"}' }));
  await page.route(/\/api\/photos\/ingest\b/, (route) => {
    try { sink.push(JSON.parse(route.request().postData() || '{}')); } catch { sink.push({}); }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, photo: { id: 'fixture-photo', url: '', thumbnail_url: '' } }) });
  });
}
// A real JPEG drawn in the page (so the photo path decodes and shrinks it as it would a camera file).
async function jpeg(page) {
  const b64 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 48; const x = c.getContext('2d'); x.fillStyle = '#7a8a99'; x.fillRect(0, 0, 64, 48); x.fillStyle = '#ffe000'; x.fillRect(8, 8, 24, 16); return c.toDataURL('image/jpeg', 0.9).split(',')[1]; });
  return Buffer.from(b64, 'base64');
}
async function addOnePhoto(page, projectId) {
  await open(page, `/app/projects/${projectId}/photos`);
  const buffer = await jpeg(page);
  await page.getByRole('button', { name: /Add Photos & Video/ }).first().click();
  await page.waitForTimeout(800);
  const lib = page.locator('input[type="file"][multiple]:not([capture])').first();
  await lib.setInputFiles({ name: 'probe-gps.jpg', mimeType: 'image/jpeg', buffer });
}

const browser = await pw.chromium.launch();
try {
  // 0. Production serves #165, and the in-app price rule holds: the app's
  //    WebView (user agent SaguaroField/) is sent from /pricing and / to /app;
  //    a browser still gets the pricing page. Waits up to 8 min for the deploy.
  const api = await pw.request.newContext();
  const UA_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 SaguaroField/1.0';
  const UA_WEB = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const hop = async (p, ua) => { const r = await api.get(`${SITE}${p}`, { headers: { 'user-agent': ua }, maxRedirects: 0 }).catch(() => null); return r ? { status: r.status(), to: (r.headers().location || '').replace(SITE, '') } : { status: 0, to: '' }; };
  let live = null;
  for (let i = 0; i < 24; i++) { live = await hop('/pricing', UA_APP); if (live.status >= 300 && live.status < 400) break; await new Promise((r) => setTimeout(r, 20000)); }
  const root = await hop('/', UA_APP);
  const web = await hop('/pricing', UA_WEB);
  check('in the app, /pricing and / go to /app (no plan prices); a browser still gets /pricing', live.status >= 300 && live.status < 400 && /^\/app/.test(live.to) && root.status >= 300 && /^\/app/.test(root.to) && web.status === 200, `app /pricing ${live.status}→${live.to} · app / ${root.status}→${root.to} · browser /pricing ${web.status}`);
  await api.dispose();

  const { defaultBrowserType: _d, ...iphone } = pw.devices['iPhone 15'];
  const phoneCtx = await browser.newContext({ ...iphone, colorScheme: 'dark', serviceWorkers: 'block', permissions: ['geolocation'], geolocation: AT });
  const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', serviceWorkers: 'block', permissions: ['geolocation'], geolocation: AT });
  await isolated(phoneCtx);
  await isolated(deskCtx);
  const ph = await phoneCtx.newPage();
  const gc = await deskCtx.newPage();
  await login(ph); await login(gc);
  await open(ph, '/app/projects');
  await proveIsolation(ph, 'phone');
  await open(gc, '/app/projects');
  await proveIsolation(gc, 'desktop');

  // A real-company ZZ AUDIT job, found read-only.
  const projectId = await gc.evaluate(async () => {
    const j = await fetch('/api/projects?limit=1000&fields=id,name', { credentials: 'include' }).then((r) => r.json()).catch(() => ({}));
    const p = (j.projects || []).find((x) => /^zz audit walk job/i.test(x.name || '')) || (j.projects || []).find((x) => /^zz audit/i.test(x.name || ''));
    return p ? p.id : null;
  });
  if (!projectId) throw new Error('no ZZ AUDIT job to open');

  // 1. Phone: the upload carries the phone's location.
  const phoneSink = [];
  await uploadFixtures(ph, phoneSink);
  const coarse = await ph.evaluate(() => matchMedia('(pointer: coarse)').matches);
  await addOnePhoto(ph, projectId);
  for (let i = 0; i < 40 && !phoneSink.length; i++) await ph.waitForTimeout(500);
  await ph.waitForTimeout(1200);
  await shot(ph, 'gps-phone-upload-390');
  const loc = phoneSink[0]?.location;
  const near = loc && Math.abs(loc.lat - AT.latitude) < 1e-4 && Math.abs(loc.lng - AT.longitude) < 1e-4;
  check('phone: a photo added on the phone is sent with its GPS location', phoneSink.length === 1 && near, `coarse ${coarse} · ingest ${phoneSink.length} · location ${JSON.stringify(loc ?? null)}`);

  // 2. Desktop: an office upload is not stamped.
  const deskSink = [];
  await uploadFixtures(gc, deskSink);
  await addOnePhoto(gc, projectId);
  for (let i = 0; i < 40 && !deskSink.length; i++) await gc.waitForTimeout(500);
  check('desktop: an upload from a desktop carries no location', deskSink.length === 1 && !('location' in (deskSink[0] || {})), `ingest ${deskSink.length} · keys ${Object.keys(deskSink[0] || {}).join(',')}`);

  // 3. Desktop viewer: a stamped photo (fixture list) shows GPS Location + a maps link.
  await gc.route(/\/api\/photos\/list\b/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ photos: [{
    id: 'fixture-gps', project_id: projectId, title: 'Fixture — GPS photo', caption: 'Fixture — GPS photo', album: 'General', category: 'General',
    url: `${SITE}/logo-badge.png`, thumbnail_url: `${SITE}/logo-badge.png`, taken_at: new Date().toISOString(), taken_by: 'Probe',
    location_lat: AT.latitude, location_lng: AT.longitude,
  }] }) }));
  await open(gc, `/app/projects/${projectId}/photos`);
  await gc.getByText('Fixture — GPS photo').first().click().catch(() => {});
  await gc.waitForTimeout(1500);
  const v = await gc.evaluate(() => {
    const rows = [...document.querySelectorAll('.k-dl-row')];
    const row = rows.find((r) => /GPS Location/.test(r.textContent || ''));
    const a = row?.querySelector('a');
    return { row: row ? row.textContent.replace(/\s+/g, ' ').trim() : null, href: a?.getAttribute('href') || null };
  });
  await shot(gc, 'gps-viewer-1440');
  check('viewer: a stamped photo shows "GPS Location" with the coordinates and a maps link', !!v.row && /33\.44840, -112\.07400/.test(v.row) && /^https:\/\/maps\.apple\.com\/\?ll=33\.4484,-112\.074/.test(v.href || ''), JSON.stringify(v));
} catch (err) {
  R.error = String(err.message || err).split('\n')[0].slice(0, 300);
  console.log('fatal', R.error);
}
await browser.close();
R.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify({ error: R.error, checks: R.checks.length, failed: R.checks.filter((c) => !c.ok).length }));
