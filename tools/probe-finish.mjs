/**
 * tools/probe-finish.mjs — the few screens the finishing pass touched, on
 * production, nothing else:
 *
 *   Settings (form page) at 1440 and 390 — every summary figure shown in full
 *   (no clipped text), the field column a deliberate 760px against the left
 *   edge · the invoice Edit dialog at 1440 and 390 — title in the heading
 *   system, the new subtitle · phone navigation at 390 (WebKit, iPhone 15
 *   metrics) — normal viewport screenshots of Jobs and My Work at the top and
 *   scrolled to the last row, and the More sheet scrolled to its last item;
 *   the last row and its action must be the element under a tap (not the tab
 *   bar), with room above the bar · the sidebar icon hues read from the SVG
 *   fill attribute the icons are drawn with.
 *
 * Read-only: the dialog is opened and cancelled; nothing is saved or sent.
 * WebKit emulation has no home indicator, so env(safe-area-inset-bottom) is 0
 * here: the safe-area padding is read from the CSS, not seen on a device.
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
const R = { site: SITE, tag: TAG || null, startedAt: new Date().toISOString(), screens: {}, checks: [], error: null };
const check = (name, ok, detail, kind) => { R.checks.push({ name, ok: !!ok, kind: kind || 'check', detail: detail == null ? undefined : String(detail).slice(0, 240) }); console.log(`${ok ? 'PASS' : 'FAIL'}${kind === 'intentional' ? ' (intentional)' : ''} ${name}${detail != null ? ' — ' + String(detail).slice(0, 160) : ''}`); };
const shot = (page, name) => page.screenshot({ path: path.join(OUT, 'shots', `${name}.jpg`), type: 'jpeg', quality: 72 }).catch(() => {});
async function open(page, url) { try { await page.goto(`${SITE}${url}`, { waitUntil: 'networkidle', timeout: 35000 }); } catch { await page.waitForTimeout(2500); } await page.waitForTimeout(1200); }
async function login(page) {
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
}
const rgbHex = (s) => { const m = (s || '').match(/\d+/g); return m ? '#' + m.slice(0, 3).map((v) => (+v).toString(16).padStart(2, '0')).join('').toUpperCase() : null; };

/* Settings: the form column and whether any summary figure is clipped. */
const settingsMeasure = (page) => page.evaluate(() => {
  const main = document.querySelector('.main-content-area'); const m = main.getBoundingClientRect();
  const frame = main.querySelector('.k-page, .k-frame'); const fs = getComputedStyle(frame);
  const card = main.querySelector('.k-stats, .k-card');
  const c = card.getBoundingClientRect();
  const vals = [...main.querySelectorAll('.k-stats .k-stat-value')].map((v) => ({ text: v.textContent.trim(), clipped: v.scrollWidth > v.clientWidth + 1 || v.scrollHeight > v.clientHeight + 1, lines: Math.round(v.getBoundingClientRect().height / parseFloat(getComputedStyle(v).lineHeight)) }));
  return { gutter: Math.round(parseFloat(fs.paddingLeft)), cardLeft: Math.round(c.left - m.left), cardWidth: Math.round(c.width), formMax: getComputedStyle(document.documentElement).getPropertyValue('--form-max').trim(), vals, sideScroll: document.documentElement.scrollWidth > innerWidth + 1 };
});

/* Phone: scroll to the end and test that the last row and its action are the
   element a tap would hit, above the tab bar. */
const reachMeasure = (page, rowSel) => page.evaluate((rowSel) => {
  const bar = document.querySelector('.sag-tabbar'); const b = bar.getBoundingClientRect();
  const rows = [...document.querySelectorAll(rowSel)].filter((e) => e.getBoundingClientRect().height > 0);
  const last = rows[rows.length - 1];
  const r = last.getBoundingClientRect();
  const hit = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (last === e || last.contains(e)); };
  const act = [...last.querySelectorAll('a, button')].filter((e) => e.getBoundingClientRect().height > 0).pop();
  const a = act ? act.getBoundingClientRect() : null;
  const actHit = act ? (() => { const e = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2); return !!e && (act === e || act.contains(e)); })() : null;
  const main = getComputedStyle(document.querySelector('.main-content-area'));
  return {
    rows: rows.length, lastText: last.textContent.trim().slice(0, 50),
    lastBottom: Math.round(r.bottom), barTop: Math.round(b.top), gap: Math.round(b.top - r.bottom),
    lastHit: hit(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20)), actHit,
    mainPadBottom: main.paddingBottom, barH: Math.round(b.height),
    barPadBottomCss: getComputedStyle(bar).paddingBottom,
    tabbarVar: getComputedStyle(document.documentElement).getPropertyValue('--sag-tabbar-h').trim(),
  };
}, rowSel);

const desktop = await pw.chromium.launch();
const phoneBrowser = await pw.webkit.launch();
try {
  const desk = await desktop.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const phoneCtx = await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], deviceScaleFactor: 2, colorScheme: 'dark' });
  const gc = await desk.newPage(); const ph = await phoneCtx.newPage();
  await login(gc); await login(ph);
  // The run starts right after the merge: wait (≤ 5 min) until production
  // serves the build with the dialog-title token, so nothing older is judged.
  let live = false;
  for (let i = 0; i < 15 && !live; i++) {
    await open(gc, '/app/settings');
    live = !!(await gc.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fs-dialog').trim()));
    if (!live) await gc.waitForTimeout(20000);
  }
  check('production serves the finishing build (--fs-dialog present)', live);
  if (live) await ph.reload({ waitUntil: 'networkidle' }).catch(() => {});

  // 1. Settings, desktop and phone.
  for (const [w, page] of [['1440', gc], ['390', ph]]) {
    await open(page, '/app/settings');
    const s = await settingsMeasure(page);
    R.screens[`settings-${w}`] = s;
    await shot(page, `settings-${w}`);
    const g = w === '1440' ? 24 : 16;
    check(`settings ${w}: every summary figure shown in full`, s.vals.length > 0 && s.vals.every((v) => !v.clipped), JSON.stringify(s.vals));
    if (w === '1440') check('settings 1440: field column 760px against the left edge (deliberate form width, not full width)', Math.abs(s.cardLeft - g) <= 2 && s.cardWidth <= 762, `left ${s.cardLeft}, width ${s.cardWidth}, --form-max ${s.formMax}`, 'intentional');
    else check('settings 390: fills the phone width', Math.abs(s.cardLeft - g) <= 2, `left ${s.cardLeft}, width ${s.cardWidth}`);
    check(`settings ${w}: no sideways scroll`, !s.sideScroll);
  }
  // Sidebar hues, read from the fill attribute Phosphor draws them with.
  const fills = await gc.evaluate(() => [...new Set([...document.querySelectorAll('.sg-nav-item:not([data-active]) svg')].map((e) => e.getAttribute('fill')).filter(Boolean))]);
  check('sidebar: module icons carry several hues (SVG fill)', fills.length >= 3, fills.join(' '));

  // 2. Invoice Edit dialog, desktop and phone.
  const api = gc.request;
  const jobs = (await (await api.get(`${SITE}/api/projects?limit=1000&fields=id,name`)).json()).projects || [];
  const zid = new Set(jobs.filter((j) => /^zz audit/i.test(j.name || '')).map((j) => j.id));
  const inv = ((await (await api.get(`${SITE}/api/invoices/list`)).json().catch(() => ({}))).invoices || []).find((i) => /^zz audit/i.test(i.vendor_name || '') || zid.has(i.project_id));
  for (const [w, page] of [['1440', gc], ['390', ph]]) {
    if (!inv) { check('invoice: test record found', false); break; }
    await open(page, `/app/invoicing/${inv.id}`);
    await page.getByRole('button', { name: /^Edit$/ }).first().click().catch(() => {});
    const dlg = page.locator('[role=dialog]').last();
    if (!(await dlg.waitFor({ timeout: 8000 }).then(() => true).catch(() => false))) { check(`invoice dialog ${w}: opened`, false); continue; }
    await page.waitForTimeout(500);
    const d = await page.evaluate(() => { const t = document.querySelector('[role=dialog] .k-modal-title'); const sub = t?.parentElement?.querySelector('.k-card-sub'); return { title: t?.textContent.trim(), color: t ? getComputedStyle(t).color : null, size: t ? getComputedStyle(t).fontSize : null, sub: sub?.textContent.trim() }; });
    R.screens[`invoice-dialog-${w}`] = d;
    await shot(page, `invoice-dialog-${w}`);
    check(`invoice dialog ${w}: title in the heading system (#38BDF8, 18px)`, rgbHex(d.color) === '#38BDF8' && d.size === '18px', `${d.title} ${d.color} ${d.size}`);
    check(`invoice dialog ${w}: new subtitle`, d.sub === 'Total updates automatically when you save.', d.sub);
    await dlg.getByRole('button', { name: /^Cancel$/ }).click().catch(async () => { await page.keyboard.press('Escape'); });
    await page.waitForTimeout(400);
  }

  // 3. Phone navigation: top of the list, then scrolled to the last row.
  for (const [key, url, rowSel] of [['jobs', '/app/projects', '.fl-list > li'], ['mywork', '/app/my-work', '.fl-list > li']]) {
    await open(ph, url);
    await shot(ph, `nav-${key}-390-top`);
    await ph.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await ph.waitForTimeout(900);
    const m = await reachMeasure(ph, rowSel);
    R.screens[`nav-${key}-390-end`] = m;
    await shot(ph, `nav-${key}-390-end`);
    check(`${key} 390: last row sits above the tab bar`, m.gap >= 8, `row bottom ${m.lastBottom}, bar top ${m.barTop}, gap ${m.gap}px`);
    check(`${key} 390: last row is what a tap hits (not the bar)`, m.lastHit, m.lastText);
    if (m.actHit !== null) check(`${key} 390: last row's action is tappable`, m.actHit);
    check(`${key} 390: page bottom padding reserves the bar (+24px)`, /px$/.test(m.mainPadBottom) && parseFloat(m.mainPadBottom) >= m.barH + 24 - 1, `padding-bottom ${m.mainPadBottom}, bar ${m.barH}px, --sag-tabbar-h ${m.tabbarVar}, bar padding-bottom ${m.barPadBottomCss}`);
  }
  // The More sheet, scrolled to its last item.
  await open(ph, '/app/projects');
  await ph.locator('.sag-tabbar').getByRole('button', { name: 'More' }).click().catch(() => {});
  await ph.waitForTimeout(900);
  await shot(ph, 'nav-more-390-top');
  const more = await ph.evaluate(async () => {
    const items = [...document.querySelectorAll('.sg-nav-item')].filter((e) => e.getBoundingClientRect().height > 0);
    const last = items[items.length - 1]; if (!last) return null;
    last.scrollIntoView({ block: 'end' }); await new Promise((r) => setTimeout(r, 600));
    const r = last.getBoundingClientRect(); const bar = document.querySelector('.sag-tabbar').getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { count: items.length, last: last.textContent.trim().slice(0, 40), bottom: Math.round(r.bottom), barTop: Math.round(bar.top), vh: innerHeight, hit: !!e && (e === last || last.contains(e)) };
  });
  R.screens['nav-more-390-end'] = more;
  await shot(ph, 'nav-more-390-end');
  check('More 390: last menu item reachable (what a tap hits)', !!more && more.hit, JSON.stringify(more));
} catch (e) {
  R.error = String(e.message || e).split('\n')[0].slice(0, 300);
  console.log('fatal', R.error);
}
await desktop.close();
await phoneBrowser.close();
R.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify({ error: R.error, checks: R.checks.length, failed: R.checks.filter((c) => !c.ok).length }));
