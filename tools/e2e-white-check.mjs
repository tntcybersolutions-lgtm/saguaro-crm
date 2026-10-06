#!/usr/bin/env node
/**
 * WHITE CHECK — signs in at production, screenshots /app, /app/daily-logs and
 * /app/subs at 390 and 1440 (plus the dashboard's "All Jobs" dropdown open),
 * and lists every visible element still painted white / near-white or any
 * white text that should be the palette, so docs/IOS-FLOW-AUDIT.md can carry
 * real findings.
 *
 *   node tools/e2e-white-check.mjs [--base=https://www.saguarocontrol.net] [--label=main]
 *
 * Credentials: E2E_EMAIL / E2E_PASSWORD from .env.local, falling back to
 * SAGUARO_QA_EMAIL / SAGUARO_QA_PASS (the QA user the sweeps use).
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const argv = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const BASE = String(argv.base || 'https://www.saguarocontrol.net').replace(/\/$/, '');
const LABEL = String(argv.label || 'main');
const OUT = path.join(process.cwd(), 'docs', 'design', 'screenshots', 'white-check', LABEL);
fs.mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const email = env.E2E_EMAIL || env.SAGUARO_QA_EMAIL, pass = env.E2E_PASSWORD || env.SAGUARO_QA_PASS;
if (!email || !pass) { console.error('no E2E_EMAIL/E2E_PASSWORD or SAGUARO_QA_EMAIL/SAGUARO_QA_PASS in .env.local'); process.exit(2); }
console.log('signing in as', env.E2E_EMAIL ? 'E2E_EMAIL' : 'SAGUARO_QA_EMAIL');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: auth, error } = await sb.auth.signInWithPassword({ email, password: pass });
if (error || !auth?.session) { console.error('SIGN-IN FAILED', error?.message); process.exit(1); }
const u = new URL(BASE); const secure = u.protocol === 'https:';
const cookies = ['sb-access-token', 'sb-refresh-token'].map((name, i) => ({ name, value: i ? auth.session.refresh_token : auth.session.access_token, domain: u.hostname, path: '/', httpOnly: true, secure, sameSite: 'Lax' }));

const WHITE_PROBE = `(() => {
  const near = (c) => { const m = c && c.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/); if (!m) return false; const a = m[4] === undefined ? 1 : parseFloat(m[4]); return a > 0.5 && +m[1] > 235 && +m[2] > 235 && +m[3] > 235; };
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 24 && r.height > 12 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
  const tag = (el) => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')).slice(0, 70);
  const out = { whiteBg: [], whiteBorder: [], lightInputs: [] };
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    if (el.closest('canvas, svg, [data-qr], .qr, img')) continue;
    const cs = getComputedStyle(el);
    if (near(cs.backgroundColor) && !/^(IMG|SVG|CANVAS)$/.test(el.tagName)) out.whiteBg.push(tag(el) + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height));
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && near(cs.backgroundColor)) out.lightInputs.push(tag(el));
    if (near(cs.borderTopColor) && parseFloat(cs.borderTopWidth) >= 2) out.whiteBorder.push(tag(el));
  }
  const de = document.documentElement;
  return { hscroll: de.scrollWidth > de.clientWidth + 1, sw: de.scrollWidth, vw: de.clientWidth, whiteBg: out.whiteBg.slice(0, 12), whiteBgCount: out.whiteBg.length, lightInputs: out.lightInputs.slice(0, 8), whiteBorder: out.whiteBorder.slice(0, 8), login: location.pathname.startsWith('/login'), title: document.title };
})()`;

const ROUTES = ['/app', '/app/daily-logs', '/app/subs'];
const browser = await chromium.launch();
const findings = [];
for (const vp of [{ name: '390', width: 390, height: 844, mobile: true }, { name: '1440', width: 1440, height: 900, mobile: false }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
  for (const route of ROUTES) {
    errors.length = 0;
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const file = `${vp.name}-${route.replace(/^\/app\/?/, '').replace(/\//g, '__') || 'dashboard'}.png`;
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    const m = await page.evaluate(WHITE_PROBE);
    findings.push({ vp: vp.name, route, file, ...m, errors: [...errors] });
    console.log(vp.name, route, m.login ? 'LOGIN' : '', `whiteBg=${m.whiteBgCount}`, m.hscroll ? `HSCROLL ${m.sw}>${m.vw}` : '', m.whiteBg.slice(0, 3).join(' | '), errors[0] || '');
    if (route === '/app') {
      // the "All Jobs" dropdown — custom listbox or native select
      const sel = page.locator('select[aria-label="Job"], [aria-label="Job"] select, select').first();
      const custom = page.getByRole('button', { name: /All Jobs/i }).first();
      let how = 'none';
      if (await custom.count()) { await custom.click(); how = 'custom button'; }
      else if (await sel.count()) { await sel.focus(); await page.keyboard.press('Alt+ArrowDown').catch(() => {}); how = 'native select (cannot render the open list; focused)'; }
      await page.waitForTimeout(500);
      const dd = `${vp.name}-dashboard-all-jobs-open.png`;
      await page.screenshot({ path: path.join(OUT, dd), fullPage: false });
      const m2 = await page.evaluate(WHITE_PROBE);
      findings.push({ vp: vp.name, route: '/app (All Jobs open: ' + how + ')', file: dd, ...m2, errors: [] });
      console.log(vp.name, '/app All Jobs →', how, `whiteBg=${m2.whiteBgCount}`, m2.whiteBg.slice(0, 3).join(' | '));
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 2));
console.log('→', path.relative(process.cwd(), OUT));
