/**
 * tools/probe-ai.mjs — drives the two AI flows of #130 on the live site as the
 * real company.
 *
 *   Receipt (iPhone, 390)  Bills → Scan Receipt with a printed-style receipt →
 *                          the form fills itself → Save Bill → the bill has a
 *                          Receipt link that opens.
 *   Update (desktop, 1440) Daily Logs → Homeowner Update → Write Draft → edit
 *                          the subject → Approve & Send. Client (iPhone, no
 *                          login) → portal → Updates shows it.
 *
 * Writes only to one ZZ AUDIT job; mail goes to delivered@resend.dev. Rows are
 * removed from the database afterwards (ids in ai.json).
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
const result = { site: SITE, job: JOB, steps: [] };
const step = (k, v) => { result[k] = v; result.steps.push(k); console.log(k, JSON.stringify(v)); };
const shot = (page, name, fullPage = true) => page.screenshot({ path: path.join(OUT, name), fullPage }).catch(() => {});
const noSideScroll = (page) => page.evaluate(() => ({ scrollW: document.scrollingElement.scrollWidth, vw: innerWidth, ok: document.scrollingElement.scrollWidth <= innerWidth + 1 }));

const RECEIPT = `<!doctype html><html><body style="margin:0;background:#fff;font-family:'Courier New',monospace;color:#111">
<div style="width:420px;padding:28px 30px;font-size:18px;line-height:1.5">
<div style="text-align:center;font-weight:bold;font-size:24px">ZZ AUDIT LUMBER SUPPLY</div>
<div style="text-align:center">1200 W Grant Rd, Tucson AZ 85745</div>
<div style="text-align:center">billing@zzauditlumber.example</div><br>
<div>INVOICE #: ZZA-${TAG.toUpperCase()}</div><div>DATE: 2026-10-10</div><br>
<div style="display:flex;justify-content:space-between"><span>2x4x8 STUD x40 @4.25</span><span>170.00</span></div>
<div style="display:flex;justify-content:space-between"><span>3/4 PLYWOOD x10 @38.50</span><span>385.00</span></div>
<hr>
<div style="display:flex;justify-content:space-between"><span>SUBTOTAL</span><span>555.00</span></div>
<div style="display:flex;justify-content:space-between"><span>TAX 8.6%</span><span>47.73</span></div>
<div style="display:flex;justify-content:space-between;font-weight:bold"><span>TOTAL</span><span>602.73</span></div>
<br><div style="text-align:center">PAID - VISA ****4242</div></div></body></html>`;

async function login(page) {
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
  const d = await (await page.request.get(`${SITE}/api/projects?limit=200&fields=id,name`)).json();
  return d.projects || [];
}

const desktop = await pw.chromium.launch();
const gc = await (await desktop.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' })).newPage();
const phoneBrowser = await pw.webkit.launch();
const phone = await (await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], colorScheme: 'dark' })).newPage();
const ids = {};
try {
  // A receipt as a real photo would show it: rendered, then captured as a PNG.
  const r = await gc.context().newPage();
  await r.setViewportSize({ width: 480, height: 640 });
  await r.setContent(RECEIPT);
  const receiptPng = await r.screenshot({ fullPage: true });
  await r.close();

  const jobs = await login(gc);
  const job = jobs.find((j) => j.name === JOB);
  if (!job) throw new Error(`${JOB} not in this company`);
  ids.job = job.id;

  // ── Receipt on an iPhone ──
  await login(phone);
  await phone.goto(`${SITE}/app/projects/${job.id}/bills`, { waitUntil: 'networkidle' });
  const scanned = phone.waitForResponse((res) => res.url().includes('/api/bills/scan-receipt'), { timeout: 120000 });
  await phone.setInputFiles('input[aria-label="Receipt photo or PDF"]', { name: 'zz-audit-receipt.png', mimeType: 'image/png', buffer: receiptPng });
  const scanRes = await scanned;
  const scanJson = await scanRes.json().catch(() => ({}));
  step('scan', { status: scanRes.status(), receipt: scanJson.receipt || null, error: scanJson.error || null });
  await phone.waitForTimeout(800);
  step('formAfterScan', await phone.evaluate(() => {
    const grid = document.querySelector('.billGrid');
    const vals = [...(grid?.querySelectorAll('input, select') || [])].map((el) => el.value);
    const banner = [...document.querySelectorAll('div')].find((d) => /Read from the receipt|could not be read/.test(d.textContent || '') && d.children.length < 6)?.textContent?.replace(/\s+/g, ' ').trim();
    return { vals, banner: banner?.slice(0, 200) || null };
  }));
  step('phoneFormOverflow', await noSideScroll(phone));
  await shot(phone, '390-receipt-form.png');
  const saved = phone.waitForResponse((res) => res.url().includes('/api/bills/create'), { timeout: 30000 });
  await phone.getByRole('button', { name: 'Save Bill' }).click();
  const billJson = await (await saved).json().catch(() => ({}));
  ids.bill = billJson.bill?.id || null;
  step('billSaved', billJson.bill ? { vendor: billJson.bill.vendor_name, number: billJson.bill.bill_number, total: billJson.bill.total, tax: billJson.bill.tax, receipt: !!billJson.bill.pdf_url } : billJson);
  await phone.waitForTimeout(1200);
  await shot(phone, '390-bills-after.png');

  // The receipt link on the bill opens (desktop list, fresh load).
  await gc.goto(`${SITE}/app/projects/${job.id}/bills`, { waitUntil: 'networkidle' });
  const row = gc.locator('tr', { hasText: `ZZA-${TAG.toUpperCase()}` }).first();
  step('rowOnDesktop', (await row.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200));
  const [popup] = await Promise.all([gc.waitForEvent('popup', { timeout: 15000 }).catch(() => null), row.getByRole('button', { name: 'Receipt' }).click()]);
  if (popup) {
    const resp = await popup.waitForLoadState('load').then(() => popup.evaluate(() => ({ url: location.href.split('?')[0].slice(-40), img: !!document.querySelector('img') })));
    step('receiptOpens', resp);
    await popup.close();
  } else step('receiptOpens', null);
  await shot(gc, '1440-bills.png');

  // ── Homeowner update ──
  await gc.goto(`${SITE}/app/projects/${job.id}/daily-logs`, { waitUntil: 'networkidle' });
  await gc.getByRole('button', { name: 'Homeowner Update' }).click();
  await gc.waitForSelector('text=Homeowner Update', { timeout: 10000 });
  const drafted = gc.waitForResponse((res) => /\/owner-updates$/.test(new URL(res.url()).pathname) && res.request().method() === 'POST', { timeout: 120000 });
  await gc.getByRole('button', { name: 'Write Draft' }).click();
  const draftRes = await drafted;
  const draftJson = await draftRes.json().catch(() => ({}));
  ids.update = draftJson.update?.id || null;
  step('draft', { status: draftRes.status(), title: draftJson.update?.title, body: draftJson.update?.body, logDays: draftJson.logDays, error: draftJson.error });
  await gc.waitForTimeout(600);
  await shot(gc, '1440-update-draft.png', false);
  const subject = gc.locator('.k-modal input').first();
  await subject.fill(`${await subject.inputValue()} (ZZ AUDIT)`);
  const sentP = gc.waitForResponse((res) => /\/owner-updates\/[^/]+$/.test(new URL(res.url()).pathname) && res.request().method() === 'PATCH', { timeout: 60000 });
  await gc.getByRole('button', { name: 'Approve & Send' }).click();
  const sentJson = await (await sentP).json().catch(() => ({}));
  step('sent', { emailed: sentJson.emailed, failed: sentJson.failed, portalClients: sentJson.portalClients, status: sentJson.update?.status, error: sentJson.error });
  await gc.waitForTimeout(800);
  step('toast', await gc.locator('.k-toast').innerText().catch(() => null));

  // Client sees it in the portal (fresh link for the test inbox).
  const pr = await gc.request.post(`${SITE}/api/portal/client/create`, { data: { projectId: job.id, clientName: 'ZZ AUDIT Client', clientEmail: 'delivered@resend.dev' } });
  const pj = await pr.json();
  ids.portalSession = pj.session?.id || null;
  const client = await (await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], colorScheme: 'dark' })).newPage();
  await client.goto(`${SITE}/portals/client/${pj.session.token}`, { waitUntil: 'networkidle' });
  await client.getByRole('button', { name: /Updates/ }).first().click();
  await client.waitForSelector('text=(ZZ AUDIT)', { timeout: 20000 });
  step('portalUpdate', await client.evaluate(() => (document.querySelector('article')?.innerText || '').replace(/\s+/g, ' ').slice(0, 400)));
  step('portalOverflow', await noSideScroll(client));
  await shot(client, '390-portal-update.png');

  // The PM side on a phone.
  await phone.goto(`${SITE}/app/projects/${job.id}/daily-logs`, { waitUntil: 'networkidle' });
  await phone.getByRole('button', { name: 'Homeowner Update' }).click();
  await phone.waitForSelector('text=Sent before', { timeout: 15000 }).catch(() => {});
  step('phoneModalOverflow', await noSideScroll(phone));
  await phone.screenshot({ path: path.join(OUT, '390-update-modal.png') });
} catch (e) {
  result.error = String(e.message || e).split('\n')[0];
  await shot(gc, '1440-error.png');
  await shot(phone, '390-error.png');
}
result.ids = ids;
await desktop.close();
await phoneBrowser.close();
fs.writeFileSync(path.join(OUT, 'ai.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
