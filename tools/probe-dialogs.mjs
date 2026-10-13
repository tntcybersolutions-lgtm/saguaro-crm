/**
 * tools/probe-dialogs.mjs — one representative of each dialog type after the
 * title migration (#160), on production, read-only (each is opened and closed;
 * nothing is saved or sent):
 *
 *   an inline page dialog whose title is an <h2> (Prequalification → Send
 *   Prequal Form, 1440) · the select sheet (Jobs sort, 390) · the job picker
 *   sheet (More → All jobs, 390) · the Photos & video panel and its in-sheet
 *   section heading (tab bar → Photo, 390).
 *
 * Each title must read in the shared dialog style: #38BDF8 at 18px.
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
async function open(page, url) { try { await page.goto(`${SITE}${url}`, { waitUntil: 'networkidle', timeout: 35000 }); } catch { await page.waitForTimeout(2500); } await page.waitForTimeout(1200); }
async function login(page) {
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
}
const rgbHex = (s) => { const m = (s || '').match(/\d+/g); return m ? '#' + m.slice(0, 3).map((v) => (+v).toString(16).padStart(2, '0')).join('').toUpperCase() : null; };
const read = (page, sel) => page.evaluate((sel) => {
  const el = [...document.querySelectorAll(sel)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; });
  if (!el) return null; const cs = getComputedStyle(el);
  return { tag: el.tagName.toLowerCase(), text: el.textContent.trim().slice(0, 50), color: cs.color, size: cs.fontSize, weight: cs.fontWeight };
}, sel);
const titleOk = (t) => !!t && rgbHex(t.color) === '#38BDF8' && t.size === '18px';
const fmt = (t) => t ? `${t.tag} "${t.text}" ${t.color} ${t.size}/${t.weight}` : 'not found';

const desktop = await pw.chromium.launch();
const phoneBrowser = await pw.webkit.launch();
try {
  const desk = await desktop.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const phoneCtx = await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], deviceScaleFactor: 2, colorScheme: 'dark' });
  const gc = await desk.newPage(); const ph = await phoneCtx.newPage();
  await login(gc); await login(ph);
  // Wait (≤ 5 min) until production serves #160: an <h2 class=k-dialog-title>
  // inside the app shell reads the title cyan (the old build gave it the
  // section cyan through the global h2 rule).
  let live = false;
  for (let i = 0; i < 15 && !live; i++) {
    await open(gc, '/app/prequalification');
    live = await gc.evaluate(() => { const h = document.createElement('h2'); h.className = 'k-dialog-title'; (document.querySelector('.sag-app') || document.body).appendChild(h); const c = getComputedStyle(h).color; h.remove(); return c === 'rgb(56, 189, 248)'; });
    if (!live) await gc.waitForTimeout(20000);
  }
  check('production serves #160 (h2.k-dialog-title reads #38BDF8)', live);
  if (live) await ph.reload({ waitUntil: 'networkidle' }).catch(() => {});

  // 1. Inline page dialog, <h2> title.
  await open(gc, '/app/prequalification');
  await gc.getByRole('button', { name: /Send Prequal Form/ }).first().click().catch(() => {});
  await gc.waitForTimeout(900);
  const t1 = await read(gc, '[role=dialog] .k-dialog-title');
  R.screens['prequal-send-1440'] = t1; await shot(gc, 'dialog-prequal-send-1440');
  check('page dialog (h2) — Send Prequal Form title in the shared style', titleOk(t1), fmt(t1));
  await gc.keyboard.press('Escape').catch(() => {});

  // 2. Select sheet (phone).
  await open(ph, '/app/projects');
  await ph.locator('.jl-sort').first().click().catch(() => {});
  await ph.waitForTimeout(900);
  const t2 = await read(ph, '.ms-title');
  R.screens['select-sheet-390'] = t2; await shot(ph, 'dialog-select-sheet-390');
  check('select sheet — title in the shared style', titleOk(t2), fmt(t2));
  await ph.keyboard.press('Escape').catch(() => {}); await ph.waitForTimeout(400);

  // 3. Job picker sheet (phone): More → All jobs.
  await open(ph, '/app/projects');
  await ph.locator('.sag-tabbar').getByRole('button', { name: 'More' }).click().catch(() => {});
  await ph.waitForTimeout(800);
  await ph.getByRole('button', { name: /All jobs/ }).first().click().catch(() => {});
  await ph.waitForTimeout(1000);
  const t3 = await read(ph, '.jp-sheet-title');
  R.screens['job-picker-390'] = t3; await shot(ph, 'dialog-job-picker-390');
  check('job picker sheet — title in the shared style', titleOk(t3), fmt(t3));
  await ph.keyboard.press('Escape').catch(() => {}); await ph.waitForTimeout(400);

  // 4. Photos & video panel (phone): title + in-sheet section heading.
  await open(ph, '/app/projects');
  await ph.locator('.sag-tabbar .sag-tab-cam').click().catch(() => {});
  await ph.waitForTimeout(1200);
  const t4 = await read(ph, '.muHead .k-dialog-title, .k-dialog-title');
  const s4 = await read(ph, '.qmDoHead');
  R.screens['photos-panel-390'] = { title: t4, section: s4 }; await shot(ph, 'dialog-photos-panel-390');
  check('Photos & video panel — title in the shared style', titleOk(t4), fmt(t4));
  if (s4) check('Photos & video panel — in-sheet heading uses the section style (#7DD3FC, 16px)', rgbHex(s4.color) === '#7DD3FC' && s4.size === '16px', fmt(s4));
} catch (e) {
  R.error = String(e.message || e).split('\n')[0].slice(0, 300);
  console.log('fatal', R.error);
}
await desktop.close();
await phoneBrowser.close();
R.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify({ error: R.error, checks: R.checks.length, failed: R.checks.filter((c) => !c.ok).length }));
