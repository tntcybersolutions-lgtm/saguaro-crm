/**
 * tools/probe-theme.mjs — screenshots of the global theme pass on production,
 * one representative screen per pattern, at 1440 (Chromium) and 390 (WebKit,
 * iPhone 15 metrics — mobile web, NOT iOS):
 *
 *   login (signed out) · Home (dense dashboard) · My Work and Jobs (lists,
 *   also composed side by side at the same viewport) · job page (detail) ·
 *   invoice detail + its Edit form · Settings (a form page) · phone
 *   navigation (More) and notifications · the invoice PDF in the viewer.
 *
 * Measures the tokens the theme sets (page-title colour, section-heading
 * colour, card edge, tile accent) and the page layout (frame gutter, the
 * title / first card / header action edges against the content area), so
 * the screenshots are not the only proof. tools/probe-label.txt labels the
 * run (before / after).
 * Read-only except the invoice PDF, regenerated on the existing ZZ AUDIT test
 * invoice (stores its link on that test record). Nothing is sent.
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
const JOB = 'ZZ AUDIT Walk Job 10101543';
const R = { site: SITE, tag: TAG || null, startedAt: new Date().toISOString(), screens: {}, checks: [], error: null };
const check = (name, ok, detail) => { R.checks.push({ name, ok: !!ok, detail: detail == null ? undefined : String(detail).slice(0, 200) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail != null ? ' — ' + String(detail).slice(0, 120) : ''}`); };
const shot = (page, name, full = false) => page.screenshot({ path: path.join(OUT, 'shots', `${name}.jpg`), type: 'jpeg', quality: 70, fullPage: full }).catch(() => {});
async function open(page, url) { try { await page.goto(`${SITE}${url}`, { waitUntil: 'networkidle', timeout: 35000 }); } catch { await page.waitForTimeout(2500); } await page.waitForTimeout(1200); }
async function login(page) {
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
}
/* What the theme sets, read from the rendered page. */
const tokens = (page) => page.evaluate(() => {
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden'; };
  const h1 = [...document.querySelectorAll('.main-content-area h1, .lgHead h1')].find(vis) || null;
  const sec = document.querySelector('.main-content-area :is(.k-card-title, .pmSecTitle, .fl-sec, h2)');
  const card = document.querySelector('.main-content-area :is(.k-card, .pmSec, .fl-list, .k-stats, .pmStrip, .fl-strip)');
  const tile = document.querySelector('.main-content-area :is(.k-tile, .fl-ti, .k-stat-icon)');
  const main = document.querySelector('.main-content-area');
  const de = document.documentElement;
  return {
    title: h1 ? { text: h1.textContent.trim().slice(0, 40), color: cs(h1).color, size: cs(h1).fontSize } : null,
    section: sec ? { text: sec.textContent.trim().slice(0, 30), color: cs(sec).color } : null,
    cardBorder: card ? cs(card).borderTopColor : null,
    tile: tile ? { color: cs(tile).color, bg: cs(tile).backgroundColor } : null,
    acc: main ? cs(main).getPropertyValue('--acc').trim() : null,
    sideScroll: de.scrollWidth > innerWidth + 1,
  };
});
/* The page layout, measured against the content area beside the sidebar:
   the frame's gutter, and where the title, the first card or list and the
   header's action sit (px from the content area's left / right edge). */
const layout = (page) => page.evaluate(() => {
  const main = document.querySelector('.main-content-area');
  if (!main) return null;
  const m = main.getBoundingClientRect();
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden'; };
  const q = (sel) => [...main.querySelectorAll(sel)].find(vis) || null;
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: Math.round(b.left - m.left), right: Math.round(m.right - b.right), width: Math.round(b.width) }; };
  const frame = q('.k-frame, .k-page');
  const fs = frame ? getComputedStyle(frame) : null;
  return {
    mainW: Math.round(m.width),
    frame: r(frame),
    gutter: fs ? [Math.round(parseFloat(fs.paddingLeft)), Math.round(parseFloat(fs.paddingRight))] : null,
    title: r(q('h1')),
    action: r(q('.k-head-actions, .pmHeadActs, .k-head > :last-child:not(:first-child), .fh-ctrls')),
    card: r(q('.fl-list, .fl-strip, .k-card, .k-stats, .pmSec, .pmStrip, .k-table-wrap')),
  };
});
const near = (a, b, tol = 2) => a != null && b != null && Math.abs(a - b) <= tol;
const rgbHex = (s) => { const m = (s || '').match(/\d+/g); return m ? '#' + m.slice(0, 3).map((v) => (+v).toString(16).padStart(2, '0')).join('').toUpperCase() : null; };

const desktop = await pw.chromium.launch();
const phoneBrowser = await pw.webkit.launch();
try {
  const desk = await desktop.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const phoneCtx = await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], deviceScaleFactor: 2, colorScheme: 'dark' });
  const gc = await desk.newPage();
  const ph = await phoneCtx.newPage();

  // Login, signed out.
  for (const [w, page] of [['1440', gc], ['390', ph]]) {
    await open(page, '/login');
    const t = await tokens(page);
    const nav = await page.evaluate(() => { const n = document.querySelector('.lgNav'); const b = document.querySelector('.lgBrandName'); const l = document.querySelector('.lgNavLink'); return { navH: n ? Math.round(n.getBoundingClientRect().height) : null, brandLines: b ? Math.round(b.getBoundingClientRect().height / parseFloat(getComputedStyle(b).lineHeight || '17')) : null, linkH: l ? Math.round(l.getBoundingClientRect().height) : null }; });
    R.screens[`login-${w}`] = { ...t, nav };
    await shot(page, `login-${w}`);
    check(`login ${w}: title is the page-title cyan`, rgbHex(t.title?.color) === '#38BDF8', t.title?.color);
    check(`login ${w}: header on one line (brand ≤ 1 line, link ≤ 44px)`, (nav.brandLines ?? 1) <= 1 && (nav.linkH ?? 0) <= 46, JSON.stringify(nav));
  }
  await login(gc); await login(ph);
  const api = gc.request;
  const jobs = (await (await api.get(`${SITE}/api/projects?limit=1000&fields=id,name`)).json()).projects || [];
  const projectId = jobs.find((j) => j.name === JOB)?.id;
  const zz = jobs.filter((j) => /^zz audit/i.test(j.name || ''));
  const zid = new Set(zz.map((j) => j.id));
  const inv = ((await (await api.get(`${SITE}/api/invoices/list`)).json().catch(() => ({}))).invoices || []).find((i) => /^zz audit/i.test(i.vendor_name || '') || zid.has(i.project_id));

  const SCREENS = [['home', '/app'], ['mywork', '/app/my-work'], ['jobs', '/app/projects'], ['job', `/app/projects/${projectId}/overview`], ['invoice', inv ? `/app/invoicing/${inv.id}` : null], ['settings', '/app/settings']];
  for (const [key, url] of SCREENS) {
    if (!url) { check(`${key}: record found`, false); continue; }
    for (const [w, page] of [['1440', gc], ['390', ph]]) {
      await open(page, url);
      await page.mouse.move(0, 0).catch(() => {});
      const t = await tokens(page);
      const L = await layout(page);
      R.screens[`${key}-${w}`] = { ...t, layout: L };
      await shot(page, `${key}-${w}`, w === '390');
      if (w === '1440') await shot(page, `${key}-1440-view`);
      console.log(`${key} ${w} layout`, JSON.stringify(L));
      if (L) {
        const g = w === '1440' ? 24 : 16;
        check(`${key} ${w}: frame fills the content area (no centred column)`, near(L.frame?.left, 0) && near(L.frame?.right, 0), JSON.stringify(L.frame));
        check(`${key} ${w}: gutter ${g}px both sides`, near(L.gutter?.[0], g, 1) && near(L.gutter?.[1], g, 1), JSON.stringify(L.gutter));
        if (L.title) check(`${key} ${w}: title on the left edge`, near(L.title.left, g), JSON.stringify(L.title));
        if (L.card) check(`${key} ${w}: first card/list on the left edge`, near(L.card.left, g), JSON.stringify(L.card));
        // Settings is a form page: its field column is a deliberate 760px
        // (--form-max) against the left edge, so it is checked for that, not
        // for reaching the right edge (DESIGN_SYSTEM.md §2a).
        if (L.card && key === 'settings' && w === '1440') check(`${key} ${w}: field column 760px on the left edge (intentional form width)`, near(L.card.left, g) && L.card.width <= 762, JSON.stringify(L.card));
        else if (L.card && !['home', 'job'].includes(key)) check(`${key} ${w}: first card/list reaches the right edge`, near(L.card.right, g), JSON.stringify(L.card));
        if (L.action && w === '1440') check(`${key} ${w}: header action on the right edge`, near(L.action.right, g), JSON.stringify(L.action));
      }
      console.log(`${key} ${w}`, JSON.stringify({ title: t.title?.color, section: t.section?.color, card: t.cardBorder, tile: t.tile?.color, acc: t.acc, side: t.sideScroll }));
      if (t.title) check(`${key} ${w}: page title cyan-blue #38BDF8`, rgbHex(t.title.color) === '#38BDF8', `${t.title.text} ${t.title.color} ${t.title.size}`);
      if (t.section) check(`${key} ${w}: section heading #7DD3FC`, rgbHex(t.section.color) === '#7DD3FC', `${t.section.text} ${t.section.color}`);
      if (t.cardBorder) check(`${key} ${w}: card edge #3D4F68`, rgbHex(t.cardBorder) === '#3D4F68', t.cardBorder);
      check(`${key} ${w}: no sideways scroll`, !t.sideScroll);
    }
  }
  // My Work and Jobs at the same viewport and zoom: the same edges, and one
  // image with the two side by side.
  for (const w of ['1440', '390']) {
    const a = R.screens[`mywork-${w}`]?.layout, b = R.screens[`jobs-${w}`]?.layout;
    if (a && b) {
      check(`My Work vs Jobs ${w}: same title edge`, near(a.title?.left, b.title?.left, 1), `${a.title?.left} / ${b.title?.left}`);
      check(`My Work vs Jobs ${w}: same list left and right edges`, near(a.card?.left, b.card?.left, 1) && near(a.card?.right, b.card?.right, 1), `${JSON.stringify(a.card)} / ${JSON.stringify(b.card)}`);
    }
    const files = w === '1440' ? ['mywork-1440-view', 'jobs-1440-view'] : ['mywork-390', 'jobs-390'];
    const imgs = files.map((f) => path.join(OUT, 'shots', `${f}.jpg`)).filter((f) => fs.existsSync(f));
    if (imgs.length === 2) {
      const pg = await desk.newPage();
      const src = imgs.map((f) => `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}`);
      const cw = w === '1440' ? 1440 : 780;
      await pg.setViewportSize({ width: cw * 2 + 24, height: 800 });
      await pg.setContent(`<body style="margin:0;background:#000;display:flex;gap:24px;align-items:flex-start;font:600 18px system-ui;color:#fff">${src.map((u, i) => `<figure style="margin:0;width:${cw}px"><figcaption style="padding:8px 0">${['My Work', 'Jobs'][i]} · ${w} · ${TAG}</figcaption><img src="${u}" style="display:block;width:${cw}px"></figure>`).join('')}</body>`);
      await pg.waitForTimeout(400);
      await pg.screenshot({ path: path.join(OUT, 'shots', `side-by-side-mywork-jobs-${w}.jpg`), type: 'jpeg', quality: 72, fullPage: true });
      await pg.close();
    }
  }

  // Module accents on the job page's tools (each tool its domain hue).
  await open(gc, `/app/projects/${projectId}/overview`);
  const toolHues = await gc.evaluate(() => [...new Set([...document.querySelectorAll('.fl-tool .fl-ti')].map((e) => getComputedStyle(e).color))]);
  check('job: tool tiles carry several module hues', toolHues.length >= 3, toolHues.join(' '));
  const navHues = await gc.evaluate(() => [...new Set([...document.querySelectorAll('.sg-nav-item:not([data-active]) svg')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('fill')).filter(Boolean))]); // Phosphor draws the hue as the SVG fill attribute, not CSS color
  check('sidebar: module icons carry several hues (SVG fill)', navHues.length >= 3, navHues.slice(0, 8).join(' '));

  // A form: the invoice Edit dialog (opened, then cancelled — nothing saved).
  if (inv) {
    await open(gc, `/app/invoicing/${inv.id}`);
    await gc.getByRole('button', { name: /^Edit$/ }).first().click().catch(() => {});
    const dlg = gc.locator('[role=dialog]').last();
    if (await dlg.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)) {
      await shot(gc, 'invoice-edit-form-1440');
      await dlg.getByRole('button', { name: /^Cancel$/ }).click().catch(async () => { await gc.keyboard.press('Escape'); });
    }
    // A generated document: the invoice PDF in the viewer.
    const pdfBtn = gc.getByRole('button', { name: /PDF/ }).first();
    if (await pdfBtn.count()) {
      const resp = gc.waitForResponse((r) => r.url().includes(`/api/invoices/${inv.id}/pdf`) || r.url().includes('/api/files/open'), { timeout: 45000 }).catch(() => null);
      await pdfBtn.click();
      const rs = await resp; await gc.waitForTimeout(3500);
      check('invoice PDF produced', !!rs && rs.ok(), rs ? rs.status() : 'no response');
      await shot(gc, 'invoice-pdf-1440');
      await gc.keyboard.press('Escape').catch(() => {});
    }
  }

  // Phone navigation (More) and notifications.
  await open(ph, '/app');
  const more = ph.locator('.sag-tabbar').getByText('More', { exact: true }).first();
  if (await more.count()) { await more.click().catch(() => {}); await ph.waitForTimeout(900); await shot(ph, 'nav-more-390'); await ph.keyboard.press('Escape').catch(() => {}); await ph.waitForTimeout(400); }
  await open(ph, '/app');
  const bell = ph.getByRole('button', { name: 'Notifications' }).first();
  if (await bell.count()) { await bell.click().catch(() => {}); await ph.waitForTimeout(1200); await shot(ph, 'notifications-390'); }
  const topbar = await ph.evaluate(() => { const t = document.querySelector('.topbar-area'); return t ? Math.round(t.getBoundingClientRect().height) : null; });
  check('phone: top bar is one row (≤ 64px plus safe area)', topbar != null && topbar <= 64 + 60, topbar);
} catch (e) {
  R.error = String(e.message || e).split('\n')[0].slice(0, 300);
  console.log('fatal', R.error);
}
await desktop.close();
await phoneBrowser.close();
R.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify({ error: R.error, checks: R.checks.length, failed: R.checks.filter((c) => !c.ok).length }));
