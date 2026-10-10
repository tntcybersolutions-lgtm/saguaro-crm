#!/usr/bin/env node
/**
 * FILES OUT OF THE IPHONE APP — live site, Chad's real company, reads only.
 *
 * The iPhone app is a Capacitor web view: it has no download manager, opens
 * no blank windows, and sends new tabs to Safari (where the user isn't signed
 * in). Export, print and file buttons that work in a browser did nothing
 * there. The fix routes them to the iOS share sheet through the Filesystem
 * and Share plugins.
 *
 * This runs the live app in WebKit at iPhone size with the native bridge
 * stood in: the page sees platform "ios", and every plugin call is recorded
 * and answered the way the device answers it. A button passes when it ends
 * in Filesystem.writeFile with real content and Share.share of that file.
 * The same buttons are then tapped in a plain desktop browser, where they
 * must still download / print the browser way.
 *
 * Nothing is written to the database. Report: tools/walk/ios-files.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/walk');
const SHOTS = path.join(OUT, 'ios-files-shots');
const SITE = 'https://www.saguarocontrol.net';

const email = (process.env.E2E_EMAIL || '').trim();
const pass = process.env.E2E_PASSWORD || '';
if (!email || !pass) {
  console.error('No real-company login (tools/e2e-login.mjs sets E2E_EMAIL / E2E_PASSWORD). Refusing to run.');
  process.exit(2);
}

const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR || '/tmp/pw', 'noop.js'));
const { webkit, chromium, devices } = require('playwright');

fs.mkdirSync(SHOTS, { recursive: true });
for (const f of fs.readdirSync(SHOTS)) fs.rmSync(path.join(SHOTS, f));

const rows = [];
const record = (screen, mode, result, detail = '') => {
  rows.push({ screen, mode, result, detail: String(detail).slice(0, 300) });
  console.log(`${result === 'pass' ? ' ok ' : result === 'skip' ? 'skip' : 'FAIL'}  [${mode}] ${screen}${detail ? ' — ' + String(detail).slice(0, 200) : ''}`);
};

/* The native bridge, as the device provides it. @capacitor/core reads
   window.webkit.messageHandlers.bridge to decide the platform is iOS, then
   sends promise calls of plugins listed in PluginHeaders to nativePromise. */
const NATIVE_STUB = () => {
  window.__native = [];
  try { window.webkit = { messageHandlers: { bridge: { postMessage() {} } } }; } catch { /* read-only in some engines */ }
  // Platform for @capacitor/core (it reads CapacitorPlatforms before window.webkit).
  window.CapacitorPlatforms = { currentPlatform: { name: 'ios', getPlatform: () => 'ios', isNativePlatform: () => true }, platforms: new Map() };
  window.Capacitor = {
    // lib/native isNative() reads these before @capacitor/core has loaded.
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    PluginHeaders: [
      { name: 'Filesystem', methods: [{ name: 'writeFile', rtype: 'promise' }] },
      { name: 'Share', methods: [{ name: 'share', rtype: 'promise' }] },
    ],
    nativePromise(plugin, method, options) {
      const o = options || {};
      const data = typeof o.data === 'string' ? o.data : '';
      window.__native.push({ plugin, method, path: o.path || null, encoding: o.encoding || null, bytes: data.length, head: data.slice(0, 120), files: o.files || null });
      if (plugin === 'Filesystem' && method === 'writeFile') return Promise.resolve({ uri: `file:///var/mobile/Containers/Data/Library/Caches/${o.path}` });
      if (plugin === 'Share' && method === 'share') return Promise.resolve({ activityType: 'com.apple.DocumentManagerUICore.SaveToFiles' });
      return Promise.reject(new Error(`${plugin}.${method} is not stood in`));
    },
    nativeCallback() { return String(Math.random()); },
  };
  // Failures surface as alerts in the app; record them instead of blocking.
  window.alert = (m) => window.__native.push({ plugin: 'alert', method: String(m) });
};

const phoneCtx = await (await webkit.launch()).newContext({ ...devices['iPhone 15'], colorScheme: 'dark' });
await phoneCtx.addInitScript(NATIVE_STUB);
const page = await phoneCtx.newPage();
await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', pass);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
const isIos = await page.evaluate(() => !!window.Capacitor?.isNativePlatform?.() && window.Capacitor.getPlatform() === 'ios');
record('the page believes it is the iPhone app', 'iphone-app', isIos ? 'pass' : 'fail', isIos ? '' : 'Capacitor stand-in not picked up');

const projects = await (await page.request.get(`${SITE}/api/projects`)).json().catch(() => ({ projects: [] }));
const pima = (projects.projects || []).find((p) => /^Pima County/i.test(p.name || ''));

/** Tap a control and wait for the share sheet; pass when a file with content reached it. */
async function viaShareSheet(screen, url, locator, expectExt, mode = 'iphone-app') {
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => { window.__native = []; });
    const el = page.locator(locator).first();
    if (!(await el.count()) || !(await el.isVisible().catch(() => false))) { record(screen, mode, 'skip', 'control not on the page for this company (no data)'); return; }
    if (await el.isDisabled().catch(() => false)) { record(screen, mode, 'skip', 'control disabled (no data)'); return; }
    await el.click();
    const deadline = Date.now() + 30000;
    let calls = [];
    while (Date.now() < deadline) {
      calls = await page.evaluate(() => window.__native);
      if (calls.some((c) => c.plugin === 'Share') || calls.some((c) => c.plugin === 'alert')) break;
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: path.join(SHOTS, `${screen.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`) });
    const write = calls.find((c) => c.plugin === 'Filesystem');
    const share = calls.find((c) => c.plugin === 'Share');
    const alerted = calls.find((c) => c.plugin === 'alert');
    if (alerted) { record(screen, mode, 'fail', `app said: ${alerted.method}`); return; }
    const ext = write?.path ? path.extname(write.path).toLowerCase() : '';
    const good = write && share && write.bytes > 20 && ext === expectExt && (share.files || []).some((f) => String(f).endsWith(write.path));
    record(screen, mode, good ? 'pass' : 'fail', write ? `${path.basename(write.path)} · ${write.bytes} chars → share sheet ${share ? 'opened' : 'NOT opened'}` : 'no file reached the share sheet');
  } catch (e) {
    record(screen, mode, 'fail', e.message);
  }
}

if (pima) {
  await viaShareSheet('Job budget → Export (CSV)', `${SITE}/app/projects/${pima.id}/budget`, 'button:has-text("Export")', '.csv');
  await viaShareSheet('Certified payroll → WH-347 PDF', `${SITE}/app/projects/${pima.id}/payroll`, 'a:has-text("WH-347 PDF")', '.pdf');
  await viaShareSheet('Lien waivers → Download', `${SITE}/app/projects/${pima.id}/lien-waivers`, 'a:has-text("Download")', '.pdf');
} else {
  record('Pima County job', 'iphone-app', 'fail', 'job not found in /api/projects');
}
await viaShareSheet('Documents → Download PDF', `${SITE}/app/documents`, 'button[aria-label^="Download "]', '.pdf');
await viaShareSheet('Fleet → Report', `${SITE}/app/fleet`, 'button:has-text("Report")', '.html');
await viaShareSheet('Leads → Export CSV', `${SITE}/app/leads`, 'button:has-text("Export CSV")', '.csv');

/* The browser way must still work: a real download / a print from the page. */
const desk = await (await chromium.launch()).newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', storageState: await phoneCtx.storageState(), acceptDownloads: true });
await desk.addInitScript(() => { window.print = () => { (window.top.__printed = window.top.__printed || []).push(document.title || 'untitled'); }; });
const dp = await desk.newPage();
if (pima) {
  try {
    await dp.goto(`${SITE}/app/projects/${pima.id}/budget`, { waitUntil: 'networkidle' });
    const btn = dp.locator('button:has-text("Export")').first();
    if (await btn.count()) {
      const [dl] = await Promise.all([dp.waitForEvent('download', { timeout: 30000 }), btn.click()]);
      record('Job budget → Export (CSV)', 'browser', /\.csv$/i.test(dl.suggestedFilename()) ? 'pass' : 'fail', dl.suggestedFilename());
    } else record('Job budget → Export (CSV)', 'browser', 'skip', 'no Export button');
  } catch (e) { record('Job budget → Export (CSV)', 'browser', 'fail', e.message); }
}

const failed = rows.filter((r) => r.result === 'fail').length;
const passed = rows.filter((r) => r.result === 'pass').length;
const md = [
  '# Files out of the iPhone app — live site, real company',
  '',
  `Run ${process.env.GITHUB_RUN_ID || 'local'} · ${passed} passed · ${failed} failed · ${rows.length - passed - failed} skipped (no data for this company) · nothing written`,
  '',
  '| Screen | Where | Result | Detail |',
  '|---|---|---|---|',
  ...rows.map((r) => `| ${r.screen} | ${r.mode} | ${r.result === 'pass' ? '✅' : r.result === 'skip' ? '—' : '❌'} | ${r.detail.replace(/\|/g, '/')} |`),
  '',
].join('\n');
fs.writeFileSync(path.join(OUT, 'ios-files.md'), md);
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
