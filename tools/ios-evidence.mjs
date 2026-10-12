/**
 * tools/ios-evidence.mjs — real-iOS evidence for the redesign. Drives Mobile
 * Safari on an iOS simulator (safaridriver, WebDriver over plain HTTP — no
 * packages), signed in as the real company, read-only, and saves a full-device
 * screenshot (status bar, notch, home indicator) of every route in
 * tools/ios-evidence-routes.txt via `xcrun simctl io <udid> screenshot`.
 * Mobile Safari is the same WebKit the Capacitor shell's WKWebView runs; the
 * app-shell launch and sign-in screens are captured separately by the workflow.
 *
 * Per screen it also records what a desktop audit cannot: the page's real
 * viewport and safe-area insets, sideways scroll, inputs under 16px (iOS zoom on
 * focus) and tap targets under 44pt.
 *
 *   SIM_UDID, SITE, E2E_EMAIL, E2E_PASSWORD, OUT  (env)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SITE = (process.env.SITE || 'https://www.saguarocontrol.net').replace(/\/$/, '');
const UDID = process.env.SIM_UDID;
const OUT = process.env.OUT || path.join(ROOT, 'tools/ios-evidence');
const WD = 'http://127.0.0.1:4444';
const JOB = 'ZZ AUDIT Walk Job 10101543';
const ROUTES = fs.readFileSync(path.join(ROOT, 'tools/ios-evidence-routes.txt'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const result = { site: SITE, device: null, screens: {}, error: null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wd(method, p, body) {
  const res = await fetch(`${WD}${p}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p.replace(/session\/[^/]+/, 'session/…')} ${res.status} ${JSON.stringify(json.value?.error || json).slice(0, 160)}`);
  return json.value;
}
let S = '';
const go = (url) => wd('POST', `/session/${S}/url`, { url });
const run = (script, args = []) => wd('POST', `/session/${S}/execute/sync`, { script, args });
const find = async (css) => {
  const v = await wd('POST', `/session/${S}/element`, { using: 'css selector', value: css });
  return Object.values(v)[0];
};
async function settle(ms = 2500) {
  for (let i = 0; i < 20; i++) {
    const st = await run('return document.readyState').catch(() => 'loading');
    if (st === 'complete') break;
    await sleep(500);
  }
  await sleep(ms);
}
function shot(name) {
  execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', '--type=jpeg', path.join(OUT, 'shots', `${name}.jpg`)], { stdio: 'ignore' });
}

const MEASURE = `
  const de = document.documentElement, b = document.body;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden';
  b.appendChild(probe); const cs = getComputedStyle(probe);
  const safe = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' '); probe.remove();
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  let smallTargets = 0; const smallS = [];
  for (const el of document.querySelectorAll('a[href],button,[role=button],input:not([type=hidden]),select,textarea')) {
    if (!vis(el) || el.closest('[aria-hidden=true]')) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 44 && r.width < 44) { smallTargets++; if (smallS.length < 6) smallS.push((el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30) + ' @' + Math.round(r.width) + 'x' + Math.round(r.height)); }
  }
  let smallInputs = 0;
  for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea')) {
    if (vis(el) && parseFloat(getComputedStyle(el).fontSize) < 16) smallInputs++;
  }
  const h1 = document.querySelector('h1');
  return {
    title: (h1 && h1.innerText.trim().slice(0, 60)) || document.title.slice(0, 60),
    path: location.pathname,
    viewport: innerWidth + 'x' + innerHeight + '@' + devicePixelRatio,
    safeArea: safe,
    sideScroll: de.scrollWidth > innerWidth + 1,
    smallTargets, smallS, smallInputs,
    height: de.scrollHeight,
  };`;

try {
  const caps = { capabilities: { alwaysMatch: { browserName: 'Safari', platformName: 'iOS', 'safari:useSimulator': true, 'safari:deviceUDID': UDID } } };
  const s = await wd('POST', '/session', caps);
  S = s.sessionId;
  result.device = { platform: s.capabilities?.platformName, version: s.capabilities?.platformVersion, browser: s.capabilities?.browserVersion };
  console.log('session', JSON.stringify(result.device));

  // Signed-out first: the sign-in screen as a new user sees it.
  await go(`${SITE}/login`); await settle(3000);
  result.screens['/login'] = await run(MEASURE); shot('login');

  const email = await find('input[name="email"]');
  await wd('POST', `/session/${S}/element/${email}/value`, { text: process.env.E2E_EMAIL.trim() });
  const pw = await find('input[name="password"]');
  await wd('POST', `/session/${S}/element/${pw}/value`, { text: process.env.E2E_PASSWORD });
  const submit = await find('button[type="submit"]');
  await wd('POST', `/session/${S}/element/${submit}/click`, {});
  for (let i = 0; i < 60; i++) {
    const p = await run('return location.pathname').catch(() => '/login');
    if (!p.startsWith('/login')) break;
    await sleep(1500);
  }
  await settle(2000);

  const projectId = await run(`return fetch('/api/projects?limit=1000&fields=id,name').then(r => r.json()).then(d => ((d.projects || []).find(j => j.name === ${JSON.stringify(JOB)}) || {}).id || null)`).catch(() => null);
  console.log('job', projectId ? 'ok' : 'missing');

  for (const route of ROUTES) {
    if (route.includes('[projectId]') && !projectId) { result.screens[route] = { blocked: 'no ZZ AUDIT job' }; continue; }
    const url = route.replace('[projectId]', projectId || '');
    const name = route.replace(/\[projectId\]/, 'job').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'root';
    try {
      await go(`${SITE}${url}`); await settle();
      await run('window.scrollTo(0, 0)');
      result.screens[route] = await run(MEASURE);
      shot(name);
      // A second frame further down for long screens, so lists and forms show too.
      if ((result.screens[route].height || 0) > 1600) {
        await run('window.scrollTo(0, Math.round(innerHeight * 1.5))'); await sleep(900);
        shot(`${name}-2`);
      }
      const m = result.screens[route];
      console.log(route, `${m.title}|vp ${m.viewport} safe ${m.safeArea} side ${m.sideScroll} t${m.smallTargets} in${m.smallInputs}`);
    } catch (e) {
      result.screens[route] = { error: String(e.message || e).split('\n')[0].slice(0, 160) };
      console.log(route, 'ERROR');
    }
  }
} catch (e) {
  result.error = String(e.message || e).split('\n')[0].slice(0, 300);
  console.log('fatal', result.error);
}
if (S) await wd('DELETE', `/session/${S}`).catch(() => {});
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify({ error: result.error, screens: Object.keys(result.screens).length }));
