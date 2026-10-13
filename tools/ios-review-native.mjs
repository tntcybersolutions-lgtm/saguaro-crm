/**
 * tools/ios-review-native.mjs — what App Review sees, driven natively.
 *
 * Launches the real Saguaro Field app (net.saguarocontrol.field, the native
 * shell of the build in review, server mode on the live site) in the iPhone
 * simulator and drives it with Appium XCUITest: real taps on the accessibility
 * elements and the software keyboard, no WebView automation. Signs in with the
 * App Store review demo login (REVIEW_EMAIL / REVIEW_PASSWORD, read from App
 * Store Connect by tools/asc-review-login.mjs).
 *
 * Read-only: it opens screens and never saves, clocks in, uploads, sends or
 * deletes. The Delete account page is opened, its button is never pressed.
 *
 *   SIM_UDID, REVIEW_EMAIL, REVIEW_PASSWORD, OUT  (env)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const UDID = process.env.SIM_UDID;
const OUT = process.env.OUT || path.join(process.cwd(), 'tools/ios-review');
const AP = 'http://127.0.0.1:4723';
const BUNDLE = 'net.saguarocontrol.field';
const JOB = 'Desert Vista Medical Plaza'; // a demo-company job (Sonoran Ridge Builders)
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const R = { device: null, checks: [], screens: {}, alerts: [], steps: [], error: null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => { R.steps.push(`${new Date().toISOString().slice(11, 19)} ${m}`); console.log(m); };
const check = (name, ok, detail) => { R.checks.push({ name, ok: !!ok, detail: detail == null ? undefined : String(detail).slice(0, 300) }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail != null ? ' — ' + String(detail).slice(0, 200) : ''}`); };
const shot = (name) => { try { execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', '--type=jpeg', path.join(OUT, 'shots', `${name}.jpg`)], { stdio: 'ignore' }); } catch { /* screenshot is evidence only */ } };

function wd(method, p, body, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(`${AP}${p}`, { method, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(buf); } catch { /* non-JSON body: reported below */ }
        if (res.statusCode >= 400) reject(new Error(`${method} ${p.replace(/session\/[^/]+/, 'session/…')} ${res.statusCode} ${JSON.stringify(json.value?.message || json.value?.error || buf).slice(0, 200)}`));
        else resolve(json.value);
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`${method} ${p} timed out`)));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
let S = '';
const EID = (e) => e && (e['element-6066-11e4-a52e-4f735466cecf'] || e.ELEMENT);
const q = (s) => s.replace(/'/g, "\\'");
async function findAll(pred) { return (await wd('POST', `/session/${S}/elements`, { using: '-ios predicate string', value: pred }).catch(() => [])) || []; }
async function find(pred) { return EID((await findAll(pred))[0]); }
async function waitFor(pred, ms = 30000) { for (let t = 0; t < ms; t += 1500) { const id = await find(pred); if (id) return id; await alerts(); await sleep(1500); } return null; }
const tap = (id) => wd('POST', `/session/${S}/element/${id}/click`, {});
// Web content in the WKWebView reports visible="false" to XCUITest, so never filter on it.
const byLabel = (label, types = ['Link', 'Button', 'StaticText', 'Other']) => `(${types.map((t) => `type == 'XCUIElementType${t}'`).join(' OR ')}) AND (label == '${q(label)}' OR label BEGINSWITH '${q(label)} ')`;
// A nav link by its exact name — never a New / Add / Create button (read-only run).
const navLink = (label) => `(type == 'XCUIElementTypeLink' OR type == 'XCUIElementTypeButton') AND (label ==[c] '${q(label)}' OR label BEGINSWITH[c] '${q(label)} ') AND NOT (label BEGINSWITH[c] 'New' OR label BEGINSWITH[c] 'Add' OR label BEGINSWITH[c] 'Create' OR label BEGINSWITH '+')`;
fs.mkdirSync(path.join(OUT, 'source'), { recursive: true });
async function source() { return String(await wd('GET', `/session/${S}/source`).catch(() => '')); }
const texts = (xml) => [...xml.matchAll(/(?:label|value)="([^"]{1,200})"/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"'));
const ERR = /something went wrong|application error|could not be found|page not found|\b404\b|\b500\b|unauthorized|failed to load|unexpected error/i;
async function alerts() {
  const text = await wd('GET', `/session/${S}/alert/text`).catch(() => null);
  if (!text) return;
  R.alerts.push(String(text).slice(0, 200));
  shot(`alert-${R.alerts.length}`);
  log(`system alert: ${String(text).slice(0, 120)}`);
  await wd('POST', `/session/${S}/alert/dismiss`, {}).catch(() => wd('POST', `/session/${S}/alert/accept`, {}).catch(() => {}));
  await sleep(800);
}
async function screen(key, name) {
  await sleep(5500);
  await alerts();
  const xml = await source();
  fs.writeFileSync(path.join(OUT, 'source', `${key}.xml`), xml.slice(0, 400000));
  const t = texts(xml);
  const errs = [...new Set(t.filter((s) => ERR.test(s)))].slice(0, 4);
  const tabbar = ['Home', 'My Work', 'Jobs', 'Time', 'More'].filter((l) => t.some((x) => x === l || x.startsWith(`${l} `) || x.startsWith(`${l},`)));
  R.screens[key] = { errors: errs, tabbar, sample: t.filter((s) => s.length > 3).slice(0, 12) };
  shot(name);
  return R.screens[key];
}

try {
  log('creating Appium session');
  const s = await wd('POST', '/session', { capabilities: { alwaysMatch: {
    platformName: 'iOS', 'appium:automationName': 'XCUITest', 'appium:udid': UDID, 'appium:bundleId': BUNDLE,
    'appium:noReset': true, 'appium:wdaLaunchTimeout': 300000, 'appium:wdaConnectionTimeout': 300000, 'appium:newCommandTimeout': 900,
  } } }, 1200000);
  S = s.sessionId;
  R.device = { platform: s.capabilities?.platformName, version: s.capabilities?.platformVersion, device: s.capabilities?.deviceName };
  log(`session ok ${JSON.stringify(R.device)}`);

  // 1. Launch → the sign-in screen.
  const signIn = await waitFor(`type == 'XCUIElementTypeButton' AND label BEGINSWITH 'Sign In'`, 60000);
  shot('r1-login');
  const loginTexts = texts(await source());
  check('launch opens the sign-in screen', !!signIn, loginTexts.filter((x) => /Welcome|Sign in|Sign In/.test(x)).slice(0, 3).join(' | '));

  // 2. Signed out, the logo on the sign-in screen: does the app show plan prices?
  const logo = await find(`type == 'XCUIElementTypeLink' AND label CONTAINS[c] 'home'`);
  if (logo) {
    await tap(logo);
    await sleep(8000);
    const t = texts(await source());
    const prices = t.filter((x) => /\$\s?\d[\d,]*(\.\d+)?\s*(\/|per\s)\s*(mo|month|user)/i.test(x) || /^\/mo$/.test(x) || /^Pricing$/i.test(x));
    shot('r2-logo-tap');
    check('signed out, the sign-in logo shows no plan prices in the app', prices.length === 0, prices.length ? `shows: ${[...new Set(prices)].slice(0, 5).join(' | ')}` : `lands on: ${t.filter((x) => x.length > 3).slice(0, 3).join(' | ')}`);
    await wd('POST', `/session/${S}/appium/device/terminate_app`, { bundleId: BUNDLE }).catch(() => {});
    await sleep(1500);
    await wd('POST', `/session/${S}/appium/device/activate_app`, { bundleId: BUNDLE }).catch(() => {});
  } else {
    check('signed out, the sign-in logo shows no plan prices in the app', true, 'the phone sign-in screen has no logo link (and the server sends the app from priced pages to /app)');
  }

  // 3. Sign in with the review login: real taps and the software keyboard.
  const email = await waitFor("type == 'XCUIElementTypeTextField' AND visible == 1", 45000);
  const pass = await find("type == 'XCUIElementTypeSecureTextField' AND visible == 1");
  if (email && pass) {
    await tap(email); await wd('POST', `/session/${S}/element/${email}/value`, { text: process.env.REVIEW_EMAIL.trim() });
    await tap(pass); await wd('POST', `/session/${S}/element/${pass}/value`, { text: process.env.REVIEW_PASSWORD });
    shot('r3-login-filled');
    const btn = await find(`type == 'XCUIElementTypeButton' AND label BEGINSWITH 'Sign In'`);
    if (btn) await tap(btn);
  }
  const home = await waitFor(navLink('My Work'), 60000);
  const h = await screen('home', 'r4-home');
  check('review login signs in and opens the app (Home, tab bar)', !!home && h.tabbar.length >= 4 && !h.errors.length, `tab bar: ${h.tabbar.join(', ')}${h.errors.length ? ` · errors: ${h.errors.join(' | ')}` : ''}`);

  if (home) {
    // 4. Tab bar.
    for (const [label, key] of [['My Work', 'my-work'], ['Jobs', 'jobs'], ['Time', 'time']]) {
      const el = await find(navLink(label));
      if (el) await tap(el);
      const m = await screen(key, `r5-tab-${key}`);
      if (key === 'time') {
        // Clock In sits in the shift card below the week summary: show it, never tap it.
        const ci = await find(`type == 'XCUIElementTypeButton' AND label CONTAINS 'Clock In'`);
        if (ci) { await wd('POST', `/session/${S}/execute/sync`, { script: 'mobile: scroll', args: [{ elementId: ci, toVisible: true }] }).catch(() => {}); await sleep(1200); shot('r5-tab-time-clock-in'); }
        check('Time shows the Clock In button (not pressed)', !!ci, ci ? 'found' : 'not found');
      }
      check(`tab "${label}" opens without an error`, !!el && !m.errors.length, el ? (m.errors.join(' | ') || m.sample.slice(0, 3).join(' | ')) : 'tab not found');
    }

    // 5. Core workflow, read-only: a job, then its field screens.
    const jobsTab = await find(navLink('Jobs'));
    if (jobsTab) { await tap(jobsTab); await sleep(5000); }
    const job = await waitFor(`(type == 'XCUIElementTypeLink' OR type == 'XCUIElementTypeStaticText' OR type == 'XCUIElementTypeButton') AND label CONTAINS '${q(JOB)}'`, 20000);
    if (job) await tap(job);
    const j = await screen('job', 'r6-job-overview');
    check(`a job opens (${JOB})`, !!job && !j.errors.length, job ? (j.errors.join(' | ') || j.sample.slice(0, 4).join(' | ')) : 'job not found in Jobs');
    // The job's field screens, through the job's own navigation (exact names, read-only).
    for (const [group, label, key] of [['Field', 'Daily Logs', 'daily-logs'], ['Field', 'Photos', 'photos'], ['Field', 'Punch List', 'punch'], ['Execution', 'RFIs', 'rfis'], ['Execution', 'Change Orders', 'change-orders']]) {
      let el = await find(navLink(label));
      if (!el) { const g = await find(navLink(group)); if (g) { await tap(g); await sleep(2500); el = await find(navLink(label)); } }
      if (!el) { R.screens[key] = { notFound: true }; log(`${label}: no link in the job's ${group} navigation`); continue; }
      await tap(el);
      const m = await screen(key, `r7-job-${key}`);
      check(`job screen "${label}" opens without an error`, !m.errors.length, m.errors.join(' | ') || m.sample.slice(0, 3).join(' | '));
    }

    // 6. More → Settings → Delete account (opened, never pressed); More → Takeoff.
    const more = await find(navLink('More'));
    if (more) await tap(more);
    const mo = await screen('more', 'r8-more');
    check('tab "More" opens', !!more && !mo.errors.length, mo.errors.join(' | ') || mo.sample.slice(0, 4).join(' | '));
    const settings = await waitFor(navLink('Settings'), 10000);
    if (settings) await tap(settings);
    await screen('settings', 'r9-settings');
    let del = null;
    for (let i = 0; i < 6 && !del; i++) {
      del = await find(`type == 'XCUIElementTypeLink' AND label == 'Delete account'`);
      if (!del) await wd('POST', `/session/${S}/execute/sync`, { script: 'mobile: swipe', args: [{ direction: 'up' }] }).catch(() => {});
    }
    if (del) { await wd('POST', `/session/${S}/execute/sync`, { script: 'mobile: scroll', args: [{ elementId: del, toVisible: true }] }).catch(() => {}); await tap(del); }
    const d = await screen('delete-account', 'r10-delete-account');
    check('Settings has "Delete account", and its page opens (not pressed)', !!del && !d.errors.length && d.sample.some((x) => /Delete/i.test(x)), del ? (d.errors.join(' | ') || d.sample.slice(0, 3).join(' | ')) : 'link not found in Settings');

    const more2 = await find(navLink('More'));
    if (more2) { await tap(more2); await sleep(3000); }
    const tk = await waitFor(`(type == 'XCUIElementTypeLink' OR type == 'XCUIElementTypeButton') AND label CONTAINS[c] 'Takeoff' AND NOT (label BEGINSWITH[c] 'New' OR label BEGINSWITH[c] 'Upload')`, 10000);
    if (tk) await tap(tk);
    const tko = await screen('takeoff', 'r11-takeoff');
    check('Takeoff opens from More (read-only)', !!tk && !tko.errors.length, tk ? (tko.errors.join(' | ') || tko.sample.slice(0, 3).join(' | ')) : 'no Takeoff link in More');
  }
} catch (e) {
  R.error = String(e.message || e).split('\n')[0].slice(0, 400);
  log(`fatal ${R.error}`);
}
if (S) await wd('DELETE', `/session/${S}`).catch(() => {});
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify({ error: R.error, checks: R.checks.length, failed: R.checks.filter((c) => !c.ok).length }));
