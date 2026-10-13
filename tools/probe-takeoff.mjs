/**
 * tools/probe-takeoff.mjs — the simplified Takeoff Studio (#162) on production,
 * at 1440 (Chromium) and 390 (WebKit, iPhone 15 metrics — mobile web, not iOS):
 *
 *   the default view (one primary action, the takeoffs list, no promo panel,
 *   no stats, no nested scroller) · the upload entry (Upload Blueprint →
 *   drop zone → a file staged → the project step, then Cancel: nothing is
 *   uploaded or created) · opening an existing analysis and coming back.
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
// A 1×1 PNG — staged in the file input only; the flow is cancelled before any upload.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const view = (page) => page.evaluate(() => {
  const main = document.querySelector('.main-content-area');
  const txt = main ? main.innerText : '';
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  const primaries = [...document.querySelectorAll('.main-content-area .k-btn-primary')].filter(vis).map((b) => b.textContent.trim());
  const nested = [...document.querySelectorAll('.main-content-area *')].filter((el) => { const cs = getComputedStyle(el); return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 80 && !el.matches('.k-modal, .k-overlay, [role=dialog] *'); }).map((el) => (el.className || el.tagName).toString().slice(0, 40));
  const rows = document.querySelectorAll('.main-content-area .k-table tbody tr, .main-content-area .k-table [role=row]').length;
  return {
    primaries, nested, rows,
    hasList: /Your takeoffs/.test(txt), hasPromo: /Turn a blueprint into a priced estimate|1,284,500/.test(txt),
    statsVisible: /Avg Confidence|Total Bid Value|Avg Processing/.test(txt),
    dropVisible: !!document.querySelector('[data-tour="takeoff-dropzone"]'),
    tools: ['Measured Takeoff', 'Assembly Library', 'Cost Rates'].filter((t) => txt.includes(t)),
    sideScroll: document.documentElement.scrollWidth > innerWidth + 1,
  };
});

const desktop = await pw.chromium.launch();
const phoneBrowser = await pw.webkit.launch();
try {
  const desk = await desktop.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const phoneCtx = await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], deviceScaleFactor: 2, colorScheme: 'dark' });
  const gc = await desk.newPage(); const ph = await phoneCtx.newPage();
  await login(gc); await login(ph);
  // Wait (≤ 5 min) until production serves #162 (the toolbar's How it works).
  let live = false;
  for (let i = 0; i < 15 && !live; i++) {
    await open(gc, '/app/takeoff');
    live = await gc.getByRole('button', { name: 'How it works' }).count() > 0;
    if (!live) await gc.waitForTimeout(20000);
  }
  check('production serves #162 (How it works toggle present)', live);

  for (const [w, page] of [['1440', gc], ['390', ph]]) {
    await open(page, '/app/takeoff');
    const v = await view(page);
    R.screens[`default-${w}`] = v;
    await shot(page, `takeoff-${w}`);
    check(`${w}: one primary action, Upload Blueprint`, v.primaries.length === 1 && /Upload Blueprint/.test(v.primaries[0]), JSON.stringify(v.primaries));
    check(`${w}: takeoffs list is the main content`, v.hasList && v.rows > 0, `rows ${v.rows}`);
    check(`${w}: tools in the toolbar`, v.tools.length === 3, v.tools.join(', '));
    check(`${w}: no promo panel or sample estimate by default`, !v.hasPromo);
    check(`${w}: aggregate statistics not in the default view`, !v.statsVisible);
    check(`${w}: drop zone hidden until Upload Blueprint`, !v.dropVisible);
    check(`${w}: no nested scroller`, v.nested.length === 0, v.nested.join(' | '));
    check(`${w}: no sideways scroll`, !v.sideScroll);
  }

  // Upload entry (desktop): Upload Blueprint → drop zone → staged file → project step → Cancel.
  await open(gc, '/app/takeoff');
  await gc.getByRole('button', { name: 'Upload Blueprint' }).first().click();
  await gc.waitForTimeout(700);
  const dz = await gc.locator('[data-tour="takeoff-dropzone"]').count();
  await shot(gc, 'takeoff-upload-1440');
  check('upload: Upload Blueprint reveals the drop zone', dz === 1);
  await gc.setInputFiles('input[type=file][accept*=".pdf"]', { name: 'probe-blueprint.png', mimeType: 'image/png', buffer: PNG });
  await gc.waitForTimeout(700);
  const step = await gc.evaluate(() => { const t = document.querySelector('.main-content-area').innerText; return { project: /Project|New Project Name/.test(t), file: /probe-blueprint\.png/.test(t), start: /Start Analysis|Create Project & Analyze/.test(t) }; });
  await shot(gc, 'takeoff-upload-project-1440');
  check('upload: a staged file moves to the project step (nothing uploaded)', step.project && step.file && step.start, JSON.stringify(step));
  await gc.getByRole('button', { name: 'Cancel' }).first().click().catch(() => {});

  // Open an existing analysis and come back (desktop + phone).
  for (const [w, page] of [['1440', gc], ['390', ph]]) {
    await open(page, '/app/takeoff');
    const act = page.locator('.main-content-area').getByRole('button', { name: /^(Open|Continue)$/ }).first();
    if (!(await act.count())) { check(`${w}: an Open/Continue action is present`, false); continue; }
    await act.click();
    const opened = await page.getByRole('button', { name: 'All takeoffs' }).waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => { const t = document.querySelector('.main-content-area').innerText; return { estimate: /AI Blueprint Estimate|Line Items|No line items|Analysis in progress/.test(t), listHidden: !/Your takeoffs/.test(t) }; });
    await shot(page, `takeoff-opened-${w}`);
    check(`${w}: Open shows the estimate full width`, opened && r.estimate && r.listHidden, JSON.stringify(r));
    await page.getByRole('button', { name: 'All takeoffs' }).click().catch(() => {});
    await page.waitForTimeout(800);
    const back = await page.evaluate(() => /Your takeoffs/.test(document.querySelector('.main-content-area').innerText));
    check(`${w}: All takeoffs returns to the list`, back);
  }
} catch (e) {
  R.error = String(e.message || e).split('\n')[0].slice(0, 300);
  console.log('fatal', R.error);
}
await desktop.close();
await phoneBrowser.close();
R.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify({ error: R.error, checks: R.checks.length, failed: R.checks.filter((c) => !c.ok).length }));
