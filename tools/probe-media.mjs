/**
 * tools/probe-media.mjs — drives "photos & video one tap away" on the live
 * site as the real company, at iPhone (WebKit, 390) and desktop (Chromium, 1440).
 *
 *   Phone    the camera in the bottom tabs opens the sheet; Send to = a ZZ
 *            AUDIT job; a photo picked from the phone uploads and says
 *            "Sent to …"; on that job's Photos page the full-screen viewer's
 *            Send button moves it to a second ZZ AUDIT job.
 *   Desktop  the top bar's Photos button opens the sheet; Search "photo"
 *            lists Take Photo or Video first and Enter opens the sheet; a
 *            photo dropped on a job page waits in the sheet for that job.
 *
 * Writes only to ZZ AUDIT jobs; the uploaded photo is deleted at the end.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const SITE = (process.env.SITE || 'https://www.saguarocontrol.net').replace(/\/$/, '');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'tools/probe');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR, 'noop.js'));
const pw = require('playwright');
if (!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD) throw new Error('no real-company login');

// A small real photo (64×48 yellow PNG) built here, so nothing private is uploaded.
function png() {
  const zlib = require('node:zlib');
  const w = 64, h = 48;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 255; raw[o + 1] = 230; raw[o + 2] = 0; } }
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = png();
const result = { site: SITE };
const SHEET = '.mu [role="dialog"][aria-label="Photos & video"]';

async function login(page) {
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
  const d = await (await page.request.get(`${SITE}/api/projects?limit=200&fields=id,name`)).json();
  return d.projects || [];
}
const listPhotos = async (page, projectId) => {
  const j = await (await page.request.get(`${SITE}/api/photos/list?projectId=${projectId}`)).json().catch(() => ({}));
  return j.photos || [];
};

async function phone() {
  const browser = await pw.webkit.launch();
  const ctx = await browser.newContext({ ...pw.devices['iPhone 15'], colorScheme: 'dark' });
  const page = await ctx.newPage();
  const r = { steps: [] };
  const step = (k, v) => { r[k] = v; r.steps.push(k); };
  let photoId = null;
  try {
    const jobs = await login(page);
    const zz = jobs.filter((j) => /^ZZ AUDIT/i.test(j.name || ''));
    if (zz.length < 2) throw new Error('need two ZZ AUDIT jobs');
    const [A, B] = zz;
    step('jobs', { A: A.name, B: B.name });

    await page.goto(`${SITE}/app`, { waitUntil: 'networkidle' });
    const cam = page.locator('.sag-tab-cam');
    step('cameraTab', await cam.evaluate((el) => { const b = el.getBoundingClientRect(); const ic = el.querySelector('.sag-tab-ic'); return { shown: b.width > 0, label: el.textContent.trim(), bg: ic ? getComputedStyle(ic).backgroundColor : null, x: Math.round(b.left + b.width / 2), vw: innerWidth }; }));
    await page.screenshot({ path: path.join(OUT, '390-camera-tab.png') });
    await cam.click();
    await page.waitForSelector(SHEET, { timeout: 10000 });
    await page.waitForFunction(() => { const s = document.querySelector('#qm-job'); return s && !s.disabled && s.options.length > 0; }, null, { timeout: 15000 });
    step('sheet', await page.evaluate(() => ({ buttons: [...document.querySelectorAll('.mu .muBig')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.textContent.trim()), jobs: document.querySelector('#qm-job').options.length, sendTo: document.querySelector('#qm-job').selectedOptions[0]?.text })));
    await page.selectOption('#qm-job', A.id);
    await page.screenshot({ path: path.join(OUT, '390-sheet.png') });

    const name = `zz-audit-quick-${Date.now().toString(36)}.png`;
    const before = new Set((await listPhotos(page, A.id)).map((p) => p.id));
    await page.setInputFiles('.mu input[type="file"][accept="image/*,video/*"]', { name, mimeType: 'image/png', buffer: PNG });
    await page.waitForFunction(() => /Sent to/.test(document.querySelector('.mu .muList')?.textContent || ''), null, { timeout: 90000 }).catch(() => {});
    step('uploadRow', (await page.locator('.mu .muList').textContent().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 160));
    await page.screenshot({ path: path.join(OUT, '390-sent.png') });
    // The new photo on job A: the one that was not there before the upload.
    const onA = (await listPhotos(page, A.id)).find((p) => !before.has(p.id) && p.source !== 'files');
    photoId = onA?.id || null;
    step('landedOnA', { found: !!onA, title: onA?.title || null });

    if (onA) {
      await page.goto(`${SITE}/app/projects/${A.id}/photos`, { waitUntil: 'networkidle' });
      await page.locator(`[aria-label="Open ${onA.title}"]`).first().click();
      await page.waitForSelector('[aria-label="Send to another job"]', { timeout: 15000 });
      await page.screenshot({ path: path.join(OUT, '390-viewer-send.png') });
      await page.locator('[aria-label="Send to another job"]').first().click();
      await page.waitForSelector('#stj-job', { timeout: 10000 });
      await page.waitForFunction(() => { const s = document.querySelector('#stj-job'); return s && !s.disabled && s.options.length > 0; }, null, { timeout: 15000 });
      await page.selectOption('#stj-job', B.id);
      await page.screenshot({ path: path.join(OUT, '390-send-dialog.png') });
      await page.locator('.stjBtn[data-primary]').click();
      await page.waitForSelector('#stj-job', { state: 'detached', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      step('movedToB', { onB: !!(await listPhotos(page, B.id)).find((p) => p.id === photoId), stillOnA: !!(await listPhotos(page, A.id)).find((p) => p.id === photoId) });
    }
  } catch (e) {
    r.error = String(e.message || e).split('\n')[0];
    await page.screenshot({ path: path.join(OUT, '390-error.png') }).catch(() => {});
  }
  if (photoId) {
    const del = await page.request.delete(`${SITE}/api/photos/${photoId}`).catch(() => null);
    r.cleanup = del ? del.status() : 'failed';
  }
  await browser.close();
  return r;
}

async function desktop() {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await ctx.newPage();
  const r = { steps: [] };
  const step = (k, v) => { r[k] = v; r.steps.push(k); };
  try {
    const jobs = await login(page);
    const real = jobs.find((j) => /Pima County Adult/i.test(j.name || '')) || jobs.find((j) => !/ZZ AUDIT/i.test(j.name || ''));

    await page.goto(`${SITE}/app`, { waitUntil: 'networkidle' });
    const btn = page.locator('.sag-tb-photo');
    step('topBarButton', { shown: await btn.isVisible(), text: (await btn.textContent())?.trim() });
    await btn.click();
    step('sheetFromButton', await page.waitForSelector(SHEET, { timeout: 10000 }).then(() => true, () => false));
    await page.screenshot({ path: path.join(OUT, '1440-sheet.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // Search
    await page.evaluate(() => window.dispatchEvent(new Event('open-command-palette')));
    const box = page.locator('input[placeholder="Search actions, navigate, create…"]');
    await box.waitFor({ timeout: 10000 });
    await box.fill('photo');
    await page.waitForTimeout(1500);
    step('searchPhoto', await page.evaluate(() => {
      const input = document.querySelector('input[placeholder="Search actions, navigate, create…"]');
      let root = input;
      while (root && root.parentElement && getComputedStyle(root).position !== 'fixed') root = root.parentElement;
      return (root?.innerText || '').split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 10);
    }));
    await page.screenshot({ path: path.join(OUT, '1440-search.png') });
    await box.press('Enter');
    step('sheetFromSearch', await page.waitForSelector(SHEET, { timeout: 10000 }).then(() => true, () => false));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // Drop a photo on a job page with no drop zone of its own.
    await page.goto(`${SITE}/app/projects/${real.id}/overview`, { waitUntil: 'networkidle' });
    await page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'zz-audit-drop.png', { type: 'image/png' }));
      for (const type of ['dragenter', 'dragover', 'drop']) document.body.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, PNG.toString('base64'));
    await page.waitForSelector('.qmStaged', { timeout: 10000 }).catch(() => {});
    step('dropStaged', await page.evaluate(() => ({ staged: document.querySelector('.qmStaged')?.textContent?.replace(/\s+/g, ' ').trim() || null, sendTo: document.querySelector('#qm-job')?.selectedOptions[0]?.text || null })));
    await page.screenshot({ path: path.join(OUT, '1440-drop.png') });
    // Clear — nothing is uploaded from the drop test.
    await page.locator('.qmStaged .qmBtn', { hasText: 'Clear' }).click().catch(() => {});
    step('afterClear', await page.locator('.qmStaged').count());
  } catch (e) {
    r.error = String(e.message || e).split('\n')[0];
    await page.screenshot({ path: path.join(OUT, '1440-error.png') }).catch(() => {});
  }
  await browser.close();
  return r;
}

result.phone = await phone();
result.desktop = await desktop();
fs.writeFileSync(path.join(OUT, 'media.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
