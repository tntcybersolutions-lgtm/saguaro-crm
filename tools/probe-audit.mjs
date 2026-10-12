/**
 * tools/probe-audit.mjs — platform-wide visual audit. Visits every route in a
 * group (tools/probe-group.txt: company | project | public) signed in as the
 * real company, read-only, at 390 (iPhone 15, WebKit) and 1440 (Chromium).
 * Per screen: a screenshot plus measured defects — title size, yellow used on
 * non-actions, small / low-contrast text, text cut off with no full value,
 * pill and box counts, nested cards, giant empty blocks, error text, sideways
 * scroll and (390) controls under 44px. Dynamic ids are taken from the list
 * page's own links, preferring ZZ AUDIT records.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const SITE = (process.env.SITE || 'https://www.saguarocontrol.net').replace(/\/$/, '');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'tools/probe');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR, 'noop.js'));
const pw = require('playwright');
if (!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD) throw new Error('no real-company login');
const GROUP = (fs.readFileSync(path.join(ROOT, 'tools/probe-group.txt'), 'utf8').trim() || 'company');
const ROUTES = fs.readFileSync(path.join(ROOT, 'tools/probe-routes.txt'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const JOB = 'ZZ AUDIT Walk Job 10101543';
const result = { site: SITE, group: GROUP, ids: {}, screens: {} };

async function login(page) {
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
}

async function open(page, url) {
  try { await page.goto(`${SITE}${url}`, { waitUntil: 'networkidle', timeout: 30000 }); }
  catch { await page.waitForTimeout(2500); }
  await page.waitForTimeout(1200);
}

/** First link on a list page whose path starts with `prefix`, ZZ AUDIT rows first. */
async function firstLink(page, listUrl, prefix) {
  await open(page, listUrl);
  return page.evaluate((prefix) => {
    const as = [...document.querySelectorAll('a[href]')]
      .map((a) => ({ h: new URL(a.href).pathname, t: (a.textContent || '') + ' ' + (a.closest('tr,li,[role=row]')?.textContent || '') }))
      .filter((a) => a.h.startsWith(prefix) && a.h.length > prefix.length && !a.h.slice(prefix.length).includes('/new'));
    const zz = as.find((a) => /zz audit|audit/i.test(a.t));
    const pick = (zz || as[0])?.h;
    return pick ? pick.slice(prefix.length).split('/')[0] : null;
  }, prefix);
}

const measure = (page, phone) => page.evaluate((phone) => {
  const Y = [255, 224, 0];
  const main = document.querySelector('.main-content-area') || document.querySelector('main') || document.body;
  const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const isY = (s) => { const c = rgb(s); return c.length >= 3 && Math.abs(c[0] - Y[0]) < 12 && Math.abs(c[1] - Y[1]) < 22 && c[2] < 60 && (c[3] === undefined || c[3] > 0.5); };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] > 0.6)) return c; } return [16, 23, 34]; };
  const actionish = (el) => !!el.closest('button.k-btn-primary, a.k-btn-primary, .pmGold, [aria-current="page"], [aria-current="true"], [aria-pressed="true"], [aria-selected="true"], [data-active], [data-selected="true"], [data-primary], .sag-tabbar, aside, nav, input[type=checkbox], [role=switch]');
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const out = { yText: [], yBorder: 0, yFill: [], small: [], lowC: [], cut: [], pills: 0, boxes: 0, nest: 0, bigEmpty: [], err: [], targets: 0 };
  const all = [...main.querySelectorAll('*')].filter(vis);
  for (const el of all) {
    const cs = getComputedStyle(el);
    const t = ownText(el);
    if (t) {
      const fs = parseFloat(cs.fontSize);
      if (isY(cs.color) && !actionish(el)) out.yText.push(t.slice(0, 40));
      if (fs < 12) out.small.push(t.slice(0, 30) + ' @' + fs);
      const c = rgb(cs.color); const b = bgOf(el);
      if (c.length >= 3) { const L1 = lum(c), L2 = lum(b); const r = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); if (r < 4.5 && fs < 18) out.lowC.push(t.slice(0, 30) + ' ' + r.toFixed(1)); }
      if (el.scrollWidth > el.clientWidth + 1 && /hidden|clip/.test(cs.overflow + cs.overflowX) && !el.title && !el.closest('[title]')) out.cut.push(t.slice(0, 30));
      if (/no .{0,30}(yet|found)|empty|drop .{0,20}here|nothing/i.test(t)) { const box = el.closest('div,section'); if (box && box.getBoundingClientRect().height > 260) out.bigEmpty.push(t.slice(0, 40) + ' h' + Math.round(box.getBoundingClientRect().height)); }
      if (/something went wrong|couldn.t load|failed to|unauthori[sz]ed|forbidden|page not found|404/i.test(t)) out.err.push(t.slice(0, 60));
    }
    const bw = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderLeftWidth);
    if (!actionish(el)) {
      if (bw > 0 && (isY(cs.borderTopColor) || isY(cs.borderLeftColor))) out.yBorder++;
      if (isY(cs.backgroundColor)) out.yFill.push((el.textContent || '').trim().slice(0, 30));
    }
    const r = el.getBoundingClientRect(); const rad = parseFloat(cs.borderTopLeftRadius);
    const filled = rgb(cs.backgroundColor)[3] !== 0 && cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
    if (rad >= Math.min(999, r.height / 2 - 1) && r.height < 48 && (bw > 0 || filled) && r.width > 24) out.pills++;
    if (bw >= 2 && rad >= 6 && r.height > 60 && r.width > 120 && cs.borderStyle !== 'none') {
      out.boxes++;
      let d = 0; for (let e = el.parentElement; e && e !== main; e = e.parentElement) { const s = getComputedStyle(e); if (parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderLeftWidth) > 0 && parseFloat(s.borderTopLeftRadius) >= 6) d++; }
      out.nest = Math.max(out.nest, d);
    }
    if (phone && el.matches('button, [role="button"], select, input:not([type=hidden]), a.k-btn') && r.height < 43.5 && r.top < innerHeight * 3) out.targets++;
  }
  const h1 = document.querySelector('.main-content-area h1, main h1, h1');
  const h1s = h1 ? getComputedStyle(h1) : null;
  return {
    title: (h1?.textContent || document.title || '').trim().slice(0, 60),
    h1: h1s ? `${parseFloat(h1s.fontSize)}/${h1s.fontWeight}` : null,
    url: location.pathname,
    sideScroll: document.scrollingElement.scrollWidth > innerWidth + 1,
    bg: getComputedStyle(document.body).backgroundColor,
    yText: out.yText.length, yTextS: out.yText.slice(0, 6),
    yBorder: out.yBorder, yFill: out.yFill.length, yFillS: out.yFill.slice(0, 4),
    small: out.small.length, smallS: out.small.slice(0, 5),
    lowC: out.lowC.length, lowCS: out.lowC.slice(0, 5),
    cut: out.cut.length, cutS: out.cut.slice(0, 5),
    pills: out.pills, boxes: out.boxes, nest: out.nest,
    bigEmpty: out.bigEmpty.slice(0, 3), err: out.err.slice(0, 3),
    targets: out.targets,
    height: document.scrollingElement.scrollHeight,
  };
}, phone);

const desktop = await pw.chromium.launch();
let phoneBrowser = await pw.webkit.launch();
async function freshPhone() {
  try { await phoneBrowser.close(); } catch { /* already gone */ }
  phoneBrowser = await pw.webkit.launch();
  const ctx = await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], deviceScaleFactor: 1, colorScheme: 'dark' });
  const p = await ctx.newPage();
  if (GROUP !== 'public') await login(p);
  return p;
}
try {
  const desk = await desktop.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const phoneCtx = await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], deviceScaleFactor: 1, colorScheme: 'dark' });
  const gc = await desk.newPage();
  let ph = await phoneCtx.newPage();
  if (GROUP !== 'public') { await login(gc); await login(ph); }

  // Ids for dynamic segments.
  const ids = result.ids;
  if (GROUP !== 'public') {
    const jobs = (await (await gc.request.get(`${SITE}/api/projects?limit=1000&fields=id,name`)).json()).projects || [];
    ids.projectId = jobs.find((j) => j.name === JOB)?.id || null;
    const P = `/app/projects/${ids.projectId}`;
    const need = (k, list, prefix) => async () => { if (ROUTES.some((r) => r.includes(k))) ids[k] = await firstLink(gc, list, prefix).catch(() => null); };
    const plan = GROUP === 'company'
      ? [need('[leadId]', '/app/leads', '/app/leads/'), need('[invoiceId]', '/app/invoicing', '/app/invoicing/'),
         need('[dailyLogId]', '/app/daily-logs', '/app/daily-logs/'), need('[scheduleId]', '/app/schedule', '/app/schedule/')]
      : [need('[bidPackageId]', `${P}/bid-packages`, `${P}/bid-packages/`), need('[payAppId]', `${P}/pay-apps`, `${P}/pay-apps/`)];
    for (const f of plan) await f();
    if (GROUP === 'project' && !ids['[bidPackageId]'] && ROUTES.some((r) => r.includes('[bidPackageId]'))) {
      const bp = (await (await gc.request.get(`${SITE}/api/bid-packages/list?projectId=${ids.projectId}`)).json().catch(() => ({}))).bidPackages || [];
      ids['[bidPackageId]'] = bp[0]?.id || null;
    }
    if (ROUTES.some((r) => r.includes('[clientToken]'))) {
      const pr = await gc.request.post(`${SITE}/api/portal/client/create`, { data: { projectId: ids.projectId, clientName: 'ZZ AUDIT Client', clientEmail: 'delivered@resend.dev' } });
      ids['[clientToken]'] = (await pr.json().catch(() => ({}))).session?.token || null;
    }
  }
  console.log('ids', JSON.stringify(Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, v ? 'ok' : null]))));

  for (const route of ROUTES) {
    let url = route.replace('[projectId]', ids.projectId || 'missing');
    const missing = (url.match(/\[[A-Za-z]+\]/g) || []).filter((k) => !ids[k]);
    if (missing.length) { result.screens[route] = { blocked: `no record for ${missing.join(', ')}` }; continue; }
    for (const [k, v] of Object.entries(ids)) if (k.startsWith('[')) url = url.replace(k, v);
    const name = route.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'root';
    result.screens[route] = {};
    for (const w of ['390', '1440']) {
      for (let attempt = 0; attempt < 2; attempt++) {
      const page = w === '390' ? ph : gc;
      try {
        await open(page, url);
        result.screens[route][w] = await measure(page, w === '390');
        const H = await page.evaluate(() => document.scrollingElement.scrollHeight);
        await page.screenshot({
          path: path.join(OUT, 'shots', `${name}-${w}.jpg`), type: 'jpeg', quality: 55,
          ...(w === '390' ? { fullPage: true, clip: { x: 0, y: 0, width: 390, height: Math.min(H, 2532) } } : {}),
        }).catch(() => {});
        break;
      } catch (e) {
        const msg = String(e.message || e).split('\n')[0].slice(0, 120);
        result.screens[route][w] = { error: msg };
        if (w === '390' && attempt === 0 && /closed|crash|Target/i.test(msg)) { ph = await freshPhone(); continue; }
        break;
      }
      }
    }
    console.log(route, JSON.stringify(Object.fromEntries(Object.entries(result.screens[route]).map(([w, m]) => [w, m.error || `${m.title}|y${m.yText}/${m.yBorder}/${m.yFill} s${m.small} c${m.lowC} cut${m.cut} p${m.pills} b${m.boxes}/${m.nest} t${m.targets}${m.err?.length ? ' ERR' : ''}`]))));
  }
} catch (e) {
  result.error = String(e.message || e).split('\n')[0];
}
await desktop.close();
await phoneBrowser.close();
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify({ error: result.error || null, screens: Object.keys(result.screens).length }));
