/**
 * tools/probe-selections.mjs — drives "selections & allowances in the client
 * portal" on the live site as the real company.
 *
 *   GC (desktop, 1440)  Selections → Add Selection (allowance $450) → open it →
 *                       Add Option ×2 (one with a photo, one recommended).
 *   Client (iPhone, 390, no login)  portal link → Selections tab → balance and
 *                       options → choose the $899.99 option → the sheet says
 *                       $449.99 over and that a change order is added → confirm.
 *                       A second item with no options is approved as specified,
 *                       within its allowance (no change order).
 *   Back on the GC side: the change order exists, approved, for $449.99; the
 *                       selection panel on a phone is a full-screen sheet.
 *
 * Writes only to one ZZ AUDIT job; mail goes to delivered@resend.dev. The
 * uploaded photo is deleted here; the rest is removed from the database after.
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

const JOB = 'ZZ AUDIT Walk Job 10101543';
const TAG = Date.now().toString(36);
const ITEM = `ZZ AUDIT Kitchen faucet ${TAG}`;
const ITEM2 = `ZZ AUDIT Vanity light ${TAG}`;
const result = { site: SITE, job: JOB, item: ITEM, steps: [] };
const step = (k, v) => { result[k] = v; result.steps.push(k); console.log(k, JSON.stringify(v)); };
const shot = (page, name, fullPage = true) => page.screenshot({ path: path.join(OUT, name), fullPage }).catch(() => {});
const noSideScroll = (page) => page.evaluate(() => ({ scrollW: document.scrollingElement.scrollWidth, vw: innerWidth, ok: document.scrollingElement.scrollWidth <= innerWidth + 1 }));

// A small real photo (64×48 gold PNG) built here, so nothing private is uploaded.
function png() {
  const zlib = require('node:zlib');
  const w = 64, h = 48;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 200; raw[o + 1] = 150; raw[o + 2] = 15; } }
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function login(page) {
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
  const d = await (await page.request.get(`${SITE}/api/projects?limit=200&fields=id,name`)).json();
  return d.projects || [];
}

async function addOption(gc, name, price, { photo = false, recommended = false } = {}) {
  await gc.getByRole('button', { name: 'Add Option' }).click();
  await gc.fill('input[aria-label="Option name"]', name);
  await gc.fill('input[aria-label="Price to the client"]', String(price));
  if (photo) await gc.setInputFiles('.selPanel input[type="file"]', { name: 'zz-audit-option.png', mimeType: 'image/png', buffer: png() });
  if (recommended) await gc.getByLabel('Mark as recommended').check();
  const saved = gc.waitForResponse((r) => /\/api\/selections\/[^/]+\/options$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST', { timeout: 90000 });
  await gc.getByRole('button', { name: 'Save Option' }).click();
  const res = await saved;
  await gc.waitForSelector(`.selPanel >> text=${name}`, { timeout: 20000 });
  return res.status();
}

const gcBrowser = await pw.chromium.launch();
const gc = await (await gcBrowser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' })).newPage();
const phoneBrowser = await pw.webkit.launch();
const client = await (await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], colorScheme: 'dark' })).newPage();
const ids = {};
try {
  const jobs = await login(gc);
  const job = jobs.find((j) => j.name === JOB);
  if (!job) throw new Error(`${JOB} not in this company`);
  ids.job = job.id;

  // ── GC: a selection with an allowance, then two options ──
  await gc.goto(`${SITE}/app/projects/${job.id}/selections`, { waitUntil: 'networkidle' });
  if (!(await gc.locator('.selPanel').count())) await gc.getByRole('button', { name: 'Add Selection' }).first().click();
  await gc.fill('.selPanel input[placeholder^="Kitchen faucet"]', ITEM);
  await gc.locator('.selPanel label:text-is("Allowance ($)") + input').fill('450');
  const created = gc.waitForResponse((r) => r.url().includes('/api/selections/create'), { timeout: 30000 });
  await gc.locator('.selPanel').getByRole('button', { name: 'Add Selection' }).click();
  ids.selection = (await (await created).json()).selection?.id || null;
  await gc.getByText(ITEM, { exact: true }).first().click();
  await gc.waitForSelector('.selPanel >> text=Options for Your Client', { timeout: 20000 });
  step('optionStandard', await addOption(gc, 'ZZ AUDIT Faucet Standard', 300, { photo: true }));
  step('optionPremium', await addOption(gc, 'ZZ AUDIT Faucet Premium', 899.99, { recommended: true }));
  await shot(gc, '1440-gc-options.png');

  // A second item, no options, specified within its allowance (API — same route the panel uses).
  const r2 = await gc.request.post(`${SITE}/api/selections/create`, { data: { projectId: job.id, item: ITEM2, category: 'Lighting', allowance: 200, cost: 150, manufacturer: 'ZZ AUDIT Lighting Co', status: 'pending' } });
  ids.selection2 = (await r2.json()).selection?.id || null;

  // Portal access for the client (the test inbox).
  const pr = await gc.request.post(`${SITE}/api/portal/client/create`, { data: { projectId: job.id, clientName: 'ZZ AUDIT Client', clientEmail: 'delivered@resend.dev' } });
  const pj = await pr.json();
  ids.portalSession = pj.session?.id || null;
  const token = pj.session?.token;
  step('portalLink', { status: pr.status(), token: !!token });

  // ── Client on an iPhone ──
  await client.goto(`${SITE}/portals/client/${token}`, { waitUntil: 'networkidle' });
  await client.getByRole('button', { name: /Selections/ }).first().click();
  await client.waitForSelector(`text=${ITEM}`, { timeout: 30000 });
  step('portalBefore', await client.evaluate(() => (document.querySelector('.csSum')?.innerText || '').replace(/\s+/g, ' ')));
  step('portalOverflow', await noSideScroll(client));
  await shot(client, '390-portal-selections.png');
  const card = client.locator('div', { has: client.locator(`text=${ITEM}`) }).filter({ has: client.getByRole('button', { name: 'Choose this' }) }).last();
  await card.locator('div', { hasText: 'ZZ AUDIT Faucet Premium' }).getByRole('button', { name: 'Choose this' }).last().click();
  await client.waitForSelector('[role="dialog"][aria-label="Confirm your choice"]', { timeout: 10000 });
  step('confirmSheet', await client.locator('[role="dialog"][aria-label="Confirm your choice"]').innerText().then((t) => t.replace(/\s+/g, ' ')));
  await client.fill('#cs-note', 'ZZ AUDIT test pick');
  await shot(client, '390-confirm-over.png', false);
  const picked = client.waitForResponse((r) => r.url().includes('/api/portal/client/selections') && r.request().method() === 'POST', { timeout: 60000 });
  await client.locator('[role="dialog"] button', { hasText: 'Choose — add' }).click();
  const pickRes = await picked;
  const pickJson = await pickRes.json();
  ids.changeOrder = pickJson.changeOrder?.id || null;
  step('pick', { status: pickRes.status(), price: pickJson.price, overage: pickJson.overage, changeOrder: pickJson.changeOrder });
  await client.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 15000 }).catch(() => {});
  await client.waitForTimeout(1200);

  // Approve the second item as specified — within the allowance, no change order.
  const card2 = client.locator('div', { has: client.locator(`text=${ITEM2}`) }).filter({ has: client.getByRole('button', { name: 'Approve' }) }).last();
  await card2.getByRole('button', { name: 'Approve' }).click();
  step('confirmSheet2', await client.locator('[role="dialog"][aria-label="Confirm your choice"]').innerText().then((t) => t.replace(/\s+/g, ' ')));
  const picked2 = client.waitForResponse((r) => r.url().includes('/api/portal/client/selections') && r.request().method() === 'POST', { timeout: 60000 });
  await client.locator('[role="dialog"] button', { hasText: 'Approve' }).click();
  const p2 = await (await picked2).json();
  step('pick2', { price: p2.price, overage: p2.overage, changeOrder: p2.changeOrder });
  await client.waitForTimeout(1500);
  step('portalAfter', await client.evaluate(() => (document.querySelector('.csSum')?.innerText || '').replace(/\s+/g, ' ')));
  await shot(client, '390-portal-after.png');

  // ── GC: the change order, and the panel on a phone ──
  const cos = await (await gc.request.get(`${SITE}/api/projects/${job.id}/change-orders`)).json().catch(() => ({}));
  const co = (cos.changeOrders || cos.change_orders || cos.data || []).find((c) => c.id === ids.changeOrder);
  step('gcChangeOrder', co ? { number: co.co_number, title: co.title, status: co.status, amount: co.amount, approved_by: co.approved_by } : null);
  const gcPhone = await (await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], colorScheme: 'dark' })).newPage();
  await login(gcPhone);
  await gcPhone.goto(`${SITE}/app/projects/${job.id}/selections`, { waitUntil: 'networkidle' });
  await gcPhone.getByText(ITEM, { exact: true }).first().click();
  await gcPhone.waitForSelector('.selPanel >> text=Options for Your Client', { timeout: 20000 });
  await gcPhone.waitForTimeout(1500);
  step('gcPhonePanel', await gcPhone.evaluate(() => { const p = document.querySelector('.selPanel'); const b = p.getBoundingClientRect(); return { width: Math.round(b.width), vw: innerWidth, position: getComputedStyle(p).position, text: p.innerText.replace(/\s+/g, ' ').slice(0, 300) }; }));
  step('gcPhoneOverflow', await noSideScroll(gcPhone));
  await gcPhone.screenshot({ path: path.join(OUT, '390-gc-panel.png') });

  // The option photo went into the job's photos — remove it.
  const photos = (await (await gc.request.get(`${SITE}/api/photos/list?projectId=${job.id}`)).json().catch(() => ({}))).photos || [];
  const optPhoto = photos.find((p) => /Selection option — ZZ AUDIT Faucet Standard/.test(p.title || ''));
  if (optPhoto) step('photoCleanup', (await gc.request.delete(`${SITE}/api/photos/${optPhoto.id}`)).status());
} catch (e) {
  result.error = String(e.message || e).split('\n')[0];
  await shot(gc, '1440-error.png');
  await shot(client, '390-error.png');
}
result.ids = ids;
await gcBrowser.close();
await phoneBrowser.close();
fs.writeFileSync(path.join(OUT, 'selections.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
