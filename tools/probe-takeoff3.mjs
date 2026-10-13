/**
 * tools/probe-takeoff3.mjs — rerun of the four probe-takeoff2 checks that
 * failed, after fixing their cause, plus one read-only check.
 *
 * Cause of the failures: the app's service worker (public/push-sw.js) handled
 * /api/* requests, so Playwright route fixtures never saw them — the list
 * fixtures did not apply, and Continue reached the real analyze route. This
 * run blocks service workers and refuses to click Continue if one is in
 * control, so the analysis stream and the lists are browser fixtures: nothing
 * is written and no AI runs. Mobile and the completed-record check passed in
 * probe-takeoff2 and are not rerun.
 *
 *   resumed record (real, read-only): ZZ AUDIT 913731 — analyzed for real by
 *   the probe-takeoff2 Continue — shows Complete + Open and opens its real
 *   estimate · Continue on a not-analyzed record calls the analyze route for
 *   THAT record (fixture stream) and shows the analysis panel, never a $0
 *   estimate · no stored drawing (fixture list): "Not analyzed" + Re-upload
 *   opens the file chooser · empty account (fixture list): the drop zone is the
 *   main state with one Upload Blueprint.
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
const ANALYZE = /\/api\/takeoff\/[^/]+\/analyze/;
const swControlled = (page) => page.evaluate(() => !!navigator.serviceWorker?.controller).catch(() => true);

const desktop = await pw.chromium.launch();
try {
  const desk = await desktop.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark', serviceWorkers: 'block' });
  const gc = await desk.newPage();
  await login(gc);

  // 0. The cause is fixed: no service worker controls the page.
  await open(gc, '/app/takeoff');
  const sw = await swControlled(gc);
  check('no service worker controls the page (route fixtures apply)', !sw, sw ? 'controlled' : 'not controlled');

  // 1. Read-only: the record probe-takeoff2 really analyzed now opens its real estimate.
  const resumed = gc.locator('.main-content-area .k-table tbody tr', { hasText: 'ZZ AUDIT 913731' }).first();
  const resumedText = (await resumed.innerText().catch(() => '')).replace(/\s+/g, ' ');
  await resumed.getByRole('button', { name: 'Open' }).click().catch(() => {});
  await gc.getByRole('button', { name: 'All takeoffs' }).waitFor({ timeout: 15000 }).catch(() => {});
  await gc.waitForTimeout(1000);
  const rs = await gc.evaluate(() => ({ total: document.querySelector('.tkTotal')?.textContent.trim() || null, lineItems: /Line Items/.test(document.querySelector('.main-content-area').innerText) }));
  await shot(gc, 'takeoff3-resumed-opened-1440');
  check('resumed record (ZZ AUDIT 913731) shows Complete + Open and opens its real estimate', /Complete/.test(resumedText) && /Open/.test(resumedText) && !!rs.total && rs.total !== '$0.00' && rs.lineItems, `${resumedText.slice(0, 90)} → ${JSON.stringify(rs)}`);

  // 2. Continue on a not-analyzed record: the analyze route for THAT record, fixture stream.
  const listResp = gc.waitForResponse((r) => LIST.test(r.url()), { timeout: 30000 }).catch(() => null);
  await open(gc, '/app/takeoff');
  const rows = await (await listResp)?.json().then((j) => j.data || []).catch(() => []) || [];
  const row = gc.locator('.main-content-area .k-table tbody tr', { hasText: 'Not analyzed' }).first();
  const rowText = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
  const rec = rows.find((t) => t.file_name && rowText.includes(t.file_name));
  const cont = row.getByRole('button', { name: 'Continue' });
  let analyzeUrl = null;
  await gc.route(ANALYZE, (route) => {
    analyzeUrl = route.request().url();
    route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: 'data: {"event":"progress","step":3,"message":"Reading the drawing (test fixture)","pct":30}\n\ndata: {"event":"error","message":"Test fixture: the analysis was stopped before it reached the server."}\n\n' });
  });
  const hasContinue = await cont.count();
  const safe = !(await swControlled(gc));
  if (hasContinue && rec && safe) {
    await cont.click();
    await gc.waitForTimeout(1500);
    const u = await gc.evaluate(() => ({ estimate: !!document.querySelector('.tkTotal'), text: document.querySelector('.main-content-area').innerText }));
    await shot(gc, 'takeoff3-continue-1440');
    check('Continue calls the analyze route for that record', !!analyzeUrl && analyzeUrl.includes(`/api/takeoff/${rec.id}/analyze`), `${rec.file_name} → ${analyzeUrl}`);
    check('Continue never shows a $0 estimate (the analysis panel instead)', !u.estimate && /Test fixture: the analysis was stopped/.test(u.text), u.estimate ? 'estimate shown' : 'analysis panel with the fixture error');
  } else {
    check('Continue calls the analyze route for that record', false, `not clicked — continue ${hasContinue}, record ${!!rec}, sw-free ${safe}`);
  }
  await gc.unroute(ANALYZE);

  // 3. No stored drawing (fixture list): Not analyzed + Re-upload → file chooser.
  const fixtureRow = { id: 'fixture-no-drawing', name: 'Fixture — no drawing stored', project_id: 'fixture-project', project_name: 'Fixture — no drawing stored', status: 'pending', file_name: 'never-finished.pdf', created_at: new Date().toISOString(), analyzed_at: null, storage_path: null, file_url: null, total_cost: 0, material_cost: 0, labor_cost: 0, confidence: 0 };
  await gc.route(LIST, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [fixtureRow] }) }));
  await open(gc, '/app/takeoff');
  const fr = gc.locator('.main-content-area .k-table tbody tr').first();
  const frText = (await fr.innerText().catch(() => '')).replace(/\s+/g, ' ');
  const chooser = gc.waitForEvent('filechooser', { timeout: 5000 }).then(() => true).catch(() => false);
  await fr.getByRole('button', { name: 'Re-upload' }).click().catch(() => {});
  const opened = await chooser;
  await shot(gc, 'takeoff3-reupload-fixture-1440');
  check('no stored drawing: "Not analyzed" with Re-upload, which opens the file chooser', /Not analyzed/.test(frText) && /never-finished\.pdf/.test(frText) && opened, `${frText.slice(0, 100)} · chooser ${opened}`);
  await gc.unroute(LIST);

  // 4. Empty account (fixture list): the drop zone is the main state, one Upload Blueprint.
  await gc.route(LIST, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await open(gc, '/app/takeoff');
  const e = await gc.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
    const main = document.querySelector('.main-content-area');
    const uploads = [...main.querySelectorAll('button, a')].filter((b) => vis(b) && /Upload Blueprint/.test(b.textContent));
    return { drop: !!document.querySelector('[data-tour="takeoff-dropzone"]'), uploads: uploads.length, inDrop: uploads.every((b) => !!b.closest('[data-tour="takeoff-dropzone"]')), list: /Your takeoffs/.test(main.innerText), first: /Start your first takeoff/.test(main.innerText) };
  });
  await shot(gc, 'takeoff3-empty-1440');
  check('empty account: the drop zone is the main state with exactly one Upload Blueprint', e.drop && e.uploads === 1 && e.inDrop && !e.list && e.first, JSON.stringify(e));
  await gc.unroute(LIST);
} catch (err) {
  R.error = String(err.message || err).split('\n')[0].slice(0, 300);
  console.log('fatal', R.error);
}
await desktop.close();
R.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify({ error: R.error, checks: R.checks.length, failed: R.checks.filter((c) => !c.ok).length }));
