#!/usr/bin/env node
/**
 * VISUAL SWEEP — every app/app route, signed in, at 390 and 1440.
 *
 *   node tools/e2e-visual-sweep.mjs --base=https://<preview-host> --label=after [--only=subs,customers] [--max=N]
 *
 * Signs in with the QA user (SAGUARO_QA_EMAIL / SAGUARO_QA_PASS in .env.local,
 * same as tools/e2e-app-sweep.mjs), carries the session as the app's own
 * cookies, visits each page.tsx route under app/app at a phone viewport
 * (390×844) and a desktop viewport (1440×900), saves a screenshot per
 * route+viewport, and measures what the design rules demand:
 *
 *   sideways scroll     documentElement.scrollWidth > clientWidth
 *   clipped content     an element whose box runs past the right edge
 *   small tap targets   (phone) visible buttons / links / inputs under 44px tall
 *   small inputs        (phone) text inputs with font-size under 16px
 *   console errors      uncaught errors and failed requests
 *
 * Output: docs/design/sweep/<label>/{390,1440}/<route>.png, report.json and
 * an HTML contact sheet per viewport (index.html) that lays every screenshot
 * out as a grid with its measurements — the artefact that goes on the PR.
 *
 * Dynamic segments: [projectId] → the ZZ AUDIT 2 Fix Check job; other dynamic
 * routes are skipped and listed in the report.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const argv = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const BASE = String(argv.base || process.env.SWEEP_BASE || 'https://saguarocontrol.net').replace(/\/$/, '');
const LABEL = String(argv.label || 'after');
const ONLY = argv.only ? String(argv.only).split(',') : null;
const MAX = Number(argv.max || 0);
const PROJECT_ID = String(argv.project || 'c64f209e-3bc5-4892-b058-89860a392cee');
const OUT = path.join(process.cwd(), 'docs', 'design', 'sweep', LABEL);
// Vercel preview hosts sit behind SSO deployment protection; an automation
// bypass secret (Vercel → Settings → Deployment Protection) lets the sweep in.
let BYPASS = String(argv.bypass || process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '');
const VIEWPORTS = [{ name: '390', width: 390, height: 844, mobile: true }, { name: '1440', width: 1440, height: 900, mobile: false }];

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
if (!BYPASS && env.VERCEL_AUTOMATION_BYPASS_SECRET) BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET;
if (!env.SAGUARO_QA_EMAIL || !env.SAGUARO_QA_PASS) { console.error('SAGUARO_QA_EMAIL / SAGUARO_QA_PASS missing in .env.local'); process.exit(2); }

// ── routes ──
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name === 'page.tsx') out.push(p);
  }
  return out;
}
const appDir = path.join(process.cwd(), 'app', 'app');
let routes = walk(appDir).map((p) => '/app' + path.relative(appDir, path.dirname(p)).replace(/\\/g, '/').replace(/^(.)/, '/$1')).map((r) => r.replace(/\/\/+/g, '/')).sort();
const skipped = [];
routes = routes.map((r) => r.replace('[projectId]', PROJECT_ID)).filter((r) => { if (/\[[^\]]+\]/.test(r)) { skipped.push(r); return false; } return true; });
if (ONLY) routes = routes.filter((r) => ONLY.some((o) => r.includes(o)));
if (MAX) routes = routes.slice(0, MAX);
console.log(`${routes.length} routes · ${skipped.length} dynamic routes skipped · base ${BASE} · label ${LABEL}`);

// ── session ──
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: env.SAGUARO_QA_EMAIL, password: env.SAGUARO_QA_PASS });
if (authErr || !auth?.session) { console.error('SIGN-IN FAILED:', authErr?.message || 'no session'); process.exit(1); }
const host = new URL(BASE).hostname;
const secure = new URL(BASE).protocol === 'https:'; // a local `next start` on http needs non-secure cookies
const cookies = [
  { name: 'sb-access-token', value: auth.session.access_token, domain: host, path: '/', httpOnly: true, secure, sameSite: 'Lax' },
  { name: 'sb-refresh-token', value: auth.session.refresh_token, domain: host, path: '/', httpOnly: true, secure, sameSite: 'Lax' },
];

// ── measure in page ──
const MEASURE = `(() => {
  const de = document.documentElement; const vw = de.clientWidth;
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const clipped = [...document.querySelectorAll('body *')].filter((el) => { if (!vis(el)) return false; const r = el.getBoundingClientRect(); return r.right > vw + 2 && r.width > 40 && getComputedStyle(el).position !== 'fixed'; }).slice(0, 5).map((el) => (el.className || el.tagName).toString().slice(0, 50));
  const smallTaps = [...document.querySelectorAll('button, a[href], input, select, textarea, [role=button]')].filter((el) => vis(el) && el.getBoundingClientRect().height < 44 && el.closest('table') === null).length;
  const smallInputs = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea')].filter((el) => vis(el) && parseFloat(getComputedStyle(el).fontSize) < 16).length;
  return { vw, sw: de.scrollWidth, hscroll: de.scrollWidth > vw + 1, clipped, smallTaps, smallInputs, title: (document.querySelector('h1')?.textContent || document.title || '').trim().slice(0, 60), login: location.pathname.startsWith('/login') };
})()`;

const browser = await chromium.launch();
const report = { base: BASE, label: LABEL, startedAt: new Date().toISOString(), routes: {}, skipped };
for (const vp of VIEWPORTS) {
  const dir = path.join(OUT, vp.name); fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ extraHTTPHeaders: BYPASS ? { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } : undefined, viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.mobile, hasTouch: vp.mobile, userAgent: vp.mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120))); page.on('response', (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  for (const route of routes) {
    errors.length = 0;
    const file = route.replace(/^\/app\/?/, '').replace(/\//g, '__').replace(PROJECT_ID, 'job') || 'dashboard';
    const png = path.join(dir, file + '.png');
    let m = null, status = 0;
    try {
      const resp = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      status = resp?.status() || 0;
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(600);
      m = await page.evaluate(MEASURE);
      await page.screenshot({ path: png, fullPage: false });
    } catch (e) { errors.push('nav: ' + String(e.message).slice(0, 100)); }
    const key = `${vp.name} ${route}`;
    report.routes[key] = { route, viewport: vp.name, status, file: path.relative(process.cwd(), png).replace(/\\/g, '/'), ...(m || {}), errors: [...errors] };
    const flags = [m?.login ? 'LOGIN' : '', m?.hscroll ? `HSCROLL(${m.sw}>${m.vw})` : '', m?.clipped?.length ? `CLIP ${m.clipped[0]}` : '', vp.mobile && m?.smallInputs ? `inputs<16:${m.smallInputs}` : '', vp.mobile && m?.smallTaps ? `taps<44:${m.smallTaps}` : '', errors.length ? `ERR ${errors[0]}` : ''].filter(Boolean).join(' · ');
    console.log(`${vp.name.padStart(4)} ${String(status).padStart(3)} ${route.replace(PROJECT_ID, '[job]').padEnd(64)} ${flags || 'ok'}`);
  }
  // contact sheet
  const rows = Object.values(report.routes).filter((r) => r.viewport === vp.name);
  const html = `<!doctype html><meta charset="utf-8"><title>Saguaro sweep ${LABEL} ${vp.name}</title>
<style>body{margin:0;background:#000;color:#fff;font:13px/1.4 system-ui}h1{font-size:18px;margin:16px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(${vp.mobile ? 210 : 360}px,1fr));gap:14px;padding:0 16px 24px}.c{background:#0E0F12;border:1px solid rgba(255,255,255,.12);border-radius:10px;overflow:hidden}.c img{width:100%;display:block;border-bottom:1px solid rgba(255,255,255,.1)}.m{padding:8px 10px}.r{color:#FFE600;font-weight:700;font-size:12px;word-break:break-all}.f{color:#A9B4C4;font-size:11px}.bad{color:#FF3B30}</style>
<h1>Saguaro — ${LABEL} · ${vp.name}px · ${rows.length} routes · ${BASE}</h1><div class="g">${rows.map((r) => `<div class="c"><a href="${path.basename(r.file)}"><img loading="lazy" src="${path.basename(r.file)}"></a><div class="m"><div class="r">${r.route.replace(PROJECT_ID, '[job]')}</div><div class="f">${r.status} · ${r.title || ''}</div><div class="f ${(r.hscroll || r.login || (r.errors || []).length) ? 'bad' : ''}">${[r.login ? 'LOGIN' : '', r.hscroll ? `sideways ${r.sw}>${r.vw}` : '', r.clipped?.length ? 'clip ' + r.clipped[0] : '', vp.mobile ? `taps<44: ${r.smallTaps ?? '?'} · inputs<16: ${r.smallInputs ?? '?'}` : '', ...(r.errors || [])].filter(Boolean).join(' · ') || 'clean'}</div></div></div>`).join('')}</div>`;
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  await ctx.close();
}
await browser.close();
report.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
const all = Object.values(report.routes);
const sum = (k) => all.filter((r) => r[k]).length;
console.log(`\n${LABEL}: ${all.length} shots · login redirects ${sum('login')} · sideways scroll ${sum('hscroll')} · with console/5xx errors ${all.filter((r) => r.errors.length).length}`);
console.log(`contact sheets: docs/design/sweep/${LABEL}/390/index.html · docs/design/sweep/${LABEL}/1440/index.html`);
