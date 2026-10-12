/**
 * tools/ios-evidence-native.mjs — native iOS evidence through Appium's XCUITest
 * driver, replacing the safaridriver path (which would not create a session on
 * the macOS runner). It launches the real Capacitor app (net.saguarocontrol.field,
 * server mode on the live site) in the simulator, attaches to its WKWebView,
 * signs in as the real company, opens each route in
 * tools/ios-evidence-native-routes.txt read-only, and saves full-device
 * screenshots with `xcrun simctl io` (status bar, notch, home indicator).
 *
 * If the WKWebView context never appears, it records exactly that, signs in
 * with native XCUITest taps instead and captures what the tab bar reaches.
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
const AP = 'http://127.0.0.1:4723';
const JOB = 'ZZ AUDIT Walk Job 10101543';
const ROUTES = fs.readFileSync(path.join(ROOT, 'tools/ios-evidence-native-routes.txt'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const R = { mode: null, site: SITE, device: null, contexts: [], screens: {}, steps: [], error: null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => { R.steps.push(`${new Date().toISOString().slice(11, 19)} ${m}`); console.log(m); };

async function wd(method, p, body, timeoutMs = 600000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${AP}${p}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${p.replace(/session\/[^/]+/, 'session/…')} ${res.status} ${JSON.stringify(json.value?.message || json.value?.error || json).slice(0, 220)}`);
    return json.value;
  } finally { clearTimeout(t); }
}
let S = '';
const run = (script, args = []) => wd('POST', `/session/${S}/execute/sync`, { script, args });
const shot = (name) => execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', '--type=jpeg', path.join(OUT, 'shots', `${name}.jpg`)], { stdio: 'ignore' });

const MEASURE = `
  const de = document.documentElement, b = document.body;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden';
  b.appendChild(probe); const cs = getComputedStyle(probe);
  const safe = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' '); probe.remove();
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  let small = 0; const smallS = [];
  for (const el of document.querySelectorAll('.main-content-area a[href], .main-content-area button, .main-content-area [role=button], .main-content-area input:not([type=hidden]), .main-content-area select, .sag-tabbar a, .sag-tabbar button')) {
    if (!vis(el) || el.closest('[aria-hidden=true]')) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 43.5 && r.width < 43.5) { small++; if (smallS.length < 6) smallS.push(((el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 24)) + ' @' + Math.round(r.width) + 'x' + Math.round(r.height)); }
  }
  let smallText = 0;
  for (const el of document.querySelectorAll('.main-content-area *')) { if (!vis(el)) continue; const t = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); if (t && parseFloat(getComputedStyle(el).fontSize) < 12) smallText++; }
  let smallInputs = 0;
  for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea')) if (vis(el) && parseFloat(getComputedStyle(el).fontSize) < 16) smallInputs++;
  const tab = document.querySelector('.sag-tabbar'); const tr = tab ? tab.getBoundingClientRect() : null;
  const h1 = document.querySelector('.main-content-area h1, h1');
  return { title: (h1 && h1.innerText.trim().slice(0, 50)) || document.title.slice(0, 50), path: location.pathname,
    viewport: innerWidth + 'x' + innerHeight + '@' + devicePixelRatio, safeArea: safe, sideScroll: de.scrollWidth > innerWidth + 1,
    smallTargets: small, smallS, smallText, smallInputs,
    tabbar: tr ? { top: Math.round(tr.top), bottom: Math.round(tr.bottom), clearsHomeIndicator: Math.round(innerHeight - tr.bottom) <= 1 } : null,
    standalone: !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()),
    height: de.scrollHeight };`;

try {
  log('creating Appium session (WebDriverAgent builds on first use)');
  const caps = {
    platformName: 'iOS', 'appium:automationName': 'XCUITest', 'appium:udid': UDID,
    'appium:bundleId': 'net.saguarocontrol.field', 'appium:noReset': true,
    'appium:wdaLaunchTimeout': 300000, 'appium:wdaConnectionTimeout': 300000, 'appium:newCommandTimeout': 900,
    'appium:webviewConnectTimeout': 90000, 'appium:autoWebviewTimeout': 90000,
  };
  const s = await wd('POST', '/session', { capabilities: { alwaysMatch: caps } }, 1200000);
  S = s.sessionId;
  R.device = { platform: s.capabilities?.platformName, version: s.capabilities?.platformVersion, device: s.capabilities?.deviceName };
  log(`session ok ${JSON.stringify(R.device)}`);
  await sleep(12000);
  shot('native-0-launched');

  // Find the app's WKWebView context.
  let web = null;
  for (let i = 0; i < 18 && !web; i++) {
    const ctx = await wd('GET', `/session/${S}/contexts`).catch((e) => { log(`contexts error ${String(e.message).slice(0, 120)}`); return []; });
    R.contexts = ctx;
    web = (ctx || []).find((c) => String(c.id || c).startsWith('WEBVIEW'));
    if (!web) await sleep(5000);
  }
  if (web) {
    R.mode = 'webview';
    await wd('POST', `/session/${S}/context`, { name: web.id || web });
    log('attached to the app WKWebView');
    const at = await run('return location.href').catch(() => '');
    log(`webview at ${String(at).replace(/[?#].*$/, '').replace(SITE, '')}`);
    if (!/\/app/.test(at) || /\/login/.test(at)) {
      await run(`location.href = arguments[0]`, [`${SITE}/login`]).catch(() => {});
      await sleep(6000);
    }
    if (/\/login/.test(await run('return location.pathname').catch(() => '/login'))) {
      shot('native-1-login');
      R.screens['/login'] = await run(MEASURE).catch(() => null);
      await run(`
        const set = (sel, v) => { const el = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
        set('input[name="email"]', arguments[0]); set('input[name="password"]', arguments[1]);
        const btn = document.querySelector('button[type="submit"]'); const f = btn && btn.form;
        if (f && f.requestSubmit) f.requestSubmit(btn); else if (btn) btn.click();`, [process.env.E2E_EMAIL.trim(), process.env.E2E_PASSWORD]);
      for (let i = 0; i < 40; i++) { const p = await run('return location.pathname').catch(() => '/login'); if (!p.startsWith('/login')) break; await sleep(1500); }
    }
    const signedIn = !String(await run('return location.pathname').catch(() => '/login')).startsWith('/login');
    log(`signed in: ${signedIn}`);
    const projectId = signedIn ? await run(`return fetch('/api/projects?limit=1000&fields=id,name').then(r => r.json()).then(d => ((d.projects || []).find(j => j.name === ${JSON.stringify(JOB)}) || {}).id || null)`).catch(() => null) : null;
    for (const route of signedIn ? ROUTES : []) {
      if (route.includes('[projectId]') && !projectId) { R.screens[route] = { blocked: 'no ZZ AUDIT job' }; continue; }
      const url = route.replace('[projectId]', projectId || '');
      const name = 'native-' + (route.replace('[projectId]', 'job').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'root');
      try {
        await run('location.href = arguments[0]', [`${SITE}${url}`]);
        await sleep(6500);
        await run('window.scrollTo(0, 0)').catch(() => {});
        R.screens[route] = await run(MEASURE);
        shot(name);
        const m = R.screens[route];
        log(`${route} vp ${m.viewport} safe ${m.safeArea} side ${m.sideScroll} t${m.smallTargets} txt${m.smallText} in${m.smallInputs} tab ${m.tabbar ? m.tabbar.clearsHomeIndicator : 'none'} native ${m.standalone}`);
      } catch (e) { R.screens[route] = { error: String(e.message || e).split('\n')[0].slice(0, 160) }; log(`${route} ERROR`); }
    }
  } else {
    R.mode = 'native-only';
    log('no WEBVIEW context after 90s — falling back to native XCUITest');
    const src = await wd('GET', `/session/${S}/source`).catch(() => '');
    fs.writeFileSync(path.join(OUT, 'native-source.xml'), String(src).slice(0, 200000));
    shot('native-1-nowebview');
  }
} catch (e) {
  R.error = String(e.message || e).split('\n')[0].slice(0, 400);
  log(`fatal ${R.error}`);
}
if (S) await wd('DELETE', `/session/${S}`).catch(() => {});
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify({ mode: R.mode, error: R.error, screens: Object.keys(R.screens).length }));
