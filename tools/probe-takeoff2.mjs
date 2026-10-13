/**
 * tools/probe-takeoff2.mjs — Takeoff Studio after #163, on production.
 * Writes nothing and spends no AI: the analysis stream and the empty /
 * no-drawing lists are answered by the browser (Playwright route fixtures).
 *
 *   mobile 390 (WebKit, iPhone 15 metrics — mobile web, not iOS): Upload
 *   Blueprint and the Tools & help menu, the first record's action on screen
 *   · a completed record (real) opens its real estimate · a not-analyzed
 *   record with a stored drawing: Continue calls the analyze route for that
 *   record (fixture stream) and never shows a $0 estimate · a record with no
 *   stored drawing (fixture): "Not analyzed" + Re-upload opens the file
 *   chooser · an empty account (fixture): the drop zone is the main state
 *   with one Upload Blueprint.
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
const LIST = /\/api\/takeoff\?limit=30/;
const mainText = (page) => page.evaluate(() => document.querySelector('.main-content-area')?.innerText || '');

const desktop = await pw.chromium.launch();
const phoneBrowser = await pw.webkit.launch();
try {
  const desk = await desktop.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const phoneCtx = await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], deviceScaleFactor: 2, colorScheme: 'dark' });
  const gc = await desk.newPage(); const ph = await phoneCtx.newPage();
  await login(gc); await login(ph);
  // Wait (≤ 5 min) until production serves #163 (the phone Tools & help menu).
  let live = false;
  for (let i = 0; i < 15 && !live; i++) {
    await open(ph, '/app/takeoff');
    live = await ph.getByRole('button', { name: 'Tools & help' }).isVisible().catch(() => false);
    if (!live) await ph.waitForTimeout(20000);
  }
  check('production serves #163 (Tools & help on the phone)', live);

  // 1. Mobile layout, once.
  await open(ph, '/app/takeoff');
  const m = await ph.evaluate(() => {
    const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.top >= 0 && r.bottom <= innerHeight; };
    const bar = document.querySelector('.sag-tabbar')?.getBoundingClientRect();
    const upload = [...document.querySelectorAll('.main-content-area .k-btn-primary')].find((b) => /Upload Blueprint/.test(b.textContent));
    const menu = [...document.querySelectorAll('.main-content-area button')].find((b) => /Tools & help/.test(b.textContent));
    const tools = [...document.querySelectorAll('.main-content-area a')].filter((a) => /Measured Takeoff|Assembly Library|Cost Rates/.test(a.textContent) && a.getBoundingClientRect().height > 2);
    const firstAct = document.querySelector('.main-content-area .k-table tbody tr .k-td-actions .k-btn');
    const fa = firstAct?.getBoundingClientRect();
    return { upload: vis(upload), menu: vis(menu), menuH: menu ? Math.round(menu.getBoundingClientRect().height) : null, visibleToolLinks: tools.length, firstAct: firstAct?.textContent.trim(), firstActBottom: fa ? Math.round(fa.bottom) : null, firstActH: fa ? Math.round(fa.height) : null, barTop: bar ? Math.round(bar.top) : null, sideScroll: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  R.screens['mobile-390'] = m;
  await shot(ph, 'takeoff2-mobile-390');
  check('390: Upload Blueprint visible on the first screen', m.upload);
  check('390: Tools & help is one menu (no tool links in the page)', m.menu && m.visibleToolLinks === 0 && m.menuH >= 44, `menu ${m.menuH}px, loose tool links ${m.visibleToolLinks}`);
  check("390: the first record's action is on the first screen, above the tab bar", m.firstActBottom != null && m.barTop != null && m.firstActBottom <= m.barTop && m.firstActH >= 44, `${m.firstAct} bottom ${m.firstActBottom}, bar ${m.barTop}, ${m.firstActH}px`);
  check('390: no sideways scroll', !m.sideScroll);
  await ph.getByRole('button', { name: 'Tools & help' }).click();
  await ph.waitForTimeout(500);
  const items = await ph.evaluate(() => [...document.querySelectorAll('.k-menu-list .k-menu-item')].map((e) => ({ t: e.textContent.trim(), h: Math.round(e.getBoundingClientRect().height) })));
  await shot(ph, 'takeoff2-mobile-menu-390');
  check('390: the menu holds the five tools and help, each ≥ 44px', items.length === 5 && items.every((i) => i.h >= 44), JSON.stringify(items));
  await ph.keyboard.press('Escape').catch(() => {});

  // 2. A completed record (real) opens its real estimate.
  await open(gc, '/app/takeoff');
  const completeRow = gc.locator('.main-content-area .k-table tbody tr', { hasText: 'Complete' }).first();
  await completeRow.getByRole('button', { name: 'Open' }).click();
  await gc.getByRole('button', { name: 'All takeoffs' }).waitFor({ timeout: 15000 }).catch(() => {});
  await gc.waitForTimeout(1000);
  const c = await gc.evaluate(() => ({ total: document.querySelector('.tkTotal')?.textContent.trim() || null, lineItems: /Line Items/.test(document.querySelector('.main-content-area').innerText) }));
  await shot(gc, 'takeoff2-complete-opened-1440');
  check('completed record opens its real estimate (a non-zero total, line items)', !!c.total && c.total !== '$0.00' && c.lineItems, JSON.stringify(c));

  // 3. Not analyzed, drawing stored (real record): Continue runs the analyze
  //    route for THAT record. The stream is a fixture — the request never
  //    reaches the server, nothing is written and no AI runs.
  await open(gc, '/app/takeoff');
  const row = gc.locator('.main-content-area .k-table tbody tr', { hasText: 'Not analyzed' }).first();
  const rowText = await row.innerText().catch(() => '');
  const cont = row.getByRole('button', { name: 'Continue' });
  let analyzeUrl = null;
  await gc.route(/\/api\/takeoff\/[^/]+\/analyze/, (route) => {
    analyzeUrl = route.request().url();
    route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: 'data: {"event":"progress","step":3,"message":"Reading the drawing (test fixture)","pct":30}\n\ndata: {"event":"error","message":"Test fixture: the analysis was stopped before it reached the server."}\n\n' });
  });
  const hasContinue = await cont.count();
  check('not-analyzed record shows "Not analyzed" with Continue', /Not analyzed/.test(rowText) && hasContinue > 0, rowText.replace(/\s+/g, ' ').slice(0, 120));
  if (hasContinue) {
    await cont.click();
    await gc.waitForTimeout(1500);
    const u = await gc.evaluate(() => ({ zero: !!document.querySelector('.tkTotal'), text: document.querySelector('.main-content-area').innerText }));
    await shot(gc, 'takeoff2-continue-1440');
    check('Continue calls the analyze route for that record', !!analyzeUrl, analyzeUrl);
    check('Continue never shows a $0 estimate (the analysis panel instead)', !u.zero && /Test fixture: the analysis was stopped/.test(u.text), u.zero ? 'estimate shown' : 'analysis panel shown');
  }
  await gc.unroute(/\/api\/takeoff\/[^/]+\/analyze/);

  // 4. No stored drawing (fixture list): Not analyzed + Re-upload → file chooser.
  const fixtureRow = { id: 'fixture-no-drawing', name: 'Fixture — no drawing stored', project_id: 'fixture-project', project_name: 'Fixture — no drawing stored', status: 'pending', file_name: 'never-finished.pdf', created_at: new Date().toISOString(), analyzed_at: null, storage_path: null, file_url: null, total_cost: 0, material_cost: 0, labor_cost: 0, confidence: 0 };
  await gc.route(LIST, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [fixtureRow] }) }));
  await open(gc, '/app/takeoff');
  const fr = gc.locator('.main-content-area .k-table tbody tr').first();
  const frText = await fr.innerText().catch(() => '');
  const chooser = gc.waitForEvent('filechooser', { timeout: 5000 }).then(() => true).catch(() => false);
  await fr.getByRole('button', { name: 'Re-upload' }).click().catch(() => {});
  const opened = await chooser;
  await shot(gc, 'takeoff2-reupload-fixture-1440');
  check('no stored drawing: "Not analyzed" with Re-upload, which opens the file chooser', /Not analyzed/.test(frText) && opened, frText.replace(/\s+/g, ' ').slice(0, 120));
  await gc.unroute(LIST);

  // 5. Empty account (fixture list): the drop zone is the main state, one Upload Blueprint.
  await gc.route(LIST, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await open(gc, '/app/takeoff');
  const e = await gc.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
    const main = document.querySelector('.main-content-area');
    const uploads = [...main.querySelectorAll('button, a')].filter((b) => vis(b) && /Upload Blueprint/.test(b.textContent));
    return { drop: !!document.querySelector('[data-tour="takeoff-dropzone"]'), uploads: uploads.length, inDrop: uploads.every((b) => !!b.closest('[data-tour="takeoff-dropzone"]')), list: /Your takeoffs/.test(main.innerText), first: /Start your first takeoff/.test(main.innerText) };
  });
  await shot(gc, 'takeoff2-empty-1440');
  check('empty account: the drop zone is the main state with exactly one Upload Blueprint', e.drop && e.uploads === 1 && e.inDrop && !e.list && e.first, JSON.stringify(e));
  await gc.unroute(LIST);
} catch (err) {
  R.error = String(err.message || err).split('\n')[0].slice(0, 300);
  console.log('fatal', R.error);
}
await desktop.close();
await phoneBrowser.close();
R.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify({ error: R.error, checks: R.checks.length, failed: R.checks.filter((c) => !c.ok).length }));
