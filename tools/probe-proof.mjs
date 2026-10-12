/**
 * tools/probe-proof.mjs — the live checks probe-errors could not show without
 * data, on the ZZ AUDIT job only. Its rows are seeded and removed by SQL
 * around the run (a CO stored only in `amount`, a 30 Sep daily log with the
 * job closed 2 Oct, one owner invoice and one sub bill).
 *
 *   co          #134 the amount-only CO shows $4,321, not $0; first column pinned at 1440
 *   dailylog    #134 closed 2 Oct, last log 30 Sep → "1 workday unlogged"
 *   portal      #137 the owner's portal lists the owner invoice and never the sub bill
 *   invoice     #137 the emailed invoice page opens; no Pay button while payments are off
 *   import      #137 a Buildertrend-style CSV → mapped, 2 jobs created with their fields,
 *               the same file again → 0 created / 2 already in Saguaro; then both archived
 */
import fs from 'node:fs';
import os from 'node:os';
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
// The seeded owner invoice's emailed link token (row removed after the run).
const OWNER_INVOICE_TOKEN = '4a0d50d2-c641-4191-af06-a0e4e5403b90';
const result = { site: SITE, steps: [] };
const step = (k, v) => { result[k] = v; result.steps.push(k); console.log(k, JSON.stringify(v)); };
const shot = (page, name, fullPage = false) => page.screenshot({ path: path.join(OUT, name), fullPage }).catch(() => {});
const sideScroll = (page) => page.evaluate(() => document.scrollingElement.scrollWidth > innerWidth + 1);
const go = async (page, url) => { await page.goto(`${SITE}${url}`, { waitUntil: 'networkidle', timeout: 60000 }); await page.waitForTimeout(1200); };

async function login(page) {
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
  const d = await (await page.request.get(`${SITE}/api/projects?limit=1000&fields=id,name`)).json();
  return d.projects || [];
}

const desktop = await pw.chromium.launch();
const phoneBrowser = await pw.webkit.launch();
try {
  const gc = await (await desktop.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' })).newPage();
  const jobs = await login(gc);
  const job = jobs.find((j) => j.name === JOB);
  if (!job) throw new Error(`${JOB} not in this company`);
  const phoneCtx = await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], colorScheme: 'dark' });
  const phone = await phoneCtx.newPage();
  await login(phone);

  // ── #134 Change order stored only in `amount`; first column pinned ──
  const coRow = (page) => page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find((r) => /ZZ AUDIT amount-only/.test(r.textContent || ''));
    const td = document.querySelector('.k-table-wrap > .k-table td:first-child');
    return { row: row ? row.textContent.replace(/\s+/g, ' ').slice(0, 160) : null, shows4321: !!row && /4,321/.test(row.textContent || ''), firstColumn: td ? getComputedStyle(td).position : null };
  });
  await go(gc, `/app/projects/${job.id}/change-orders`);
  step('co1440', await coRow(gc));
  await shot(gc, '1440-change-orders.png');
  await go(phone, `/app/projects/${job.id}/change-orders`);
  step('co390', { ...(await phone.evaluate(() => ({ shows4321: /4,321/.test(document.body.innerText) }))), sideScroll: await sideScroll(phone) });
  await shot(phone, '390-change-orders.png', true);

  // ── #134 Daily-log gap stops at the closeout date ──
  await go(gc, `/app/projects/${job.id}/daily-logs`);
  step('dailylog', await gc.evaluate(() => (document.body.innerText.match(/Last Log[\s\S]{0,80}?(\d+ workdays? unlogged|Record is current)/) || [null, null])[1]));
  await shot(gc, '1440-daily-logs.png');
  await go(phone, `/app/projects/${job.id}/daily-logs`);
  step('dailylog390', await phone.evaluate(() => (document.body.innerText.match(/(\d+ workdays? unlogged|Record is current)/) || [null])[0]));
  await shot(phone, '390-daily-logs.png');

  // ── #137 Owner portal: the owner invoice, never the sub bill ──
  const pr = await gc.request.post(`${SITE}/api/portal/client/create`, { data: { projectId: job.id, clientName: 'ZZ AUDIT Client', clientEmail: 'delivered@resend.dev' } });
  const token = (await pr.json().catch(() => ({}))).session?.token;
  const fin = await (await gc.request.get(`${SITE}/api/portal/client/financials?token=${token}`, { headers: { 'x-portal-token': token } })).json().catch(() => ({}));
  step('portalApi', { numbers: (fin.invoices || []).map((i) => i.number), balances: (fin.invoices || []).map((i) => i.balance), payOnline: fin.payOnline ?? null, anyPayable: (fin.invoices || []).some((i) => i.payable) });
  const client = await phoneCtx.newPage();
  await client.goto(`${SITE}/portals/client/${token}?tab=financials`, { waitUntil: 'networkidle', timeout: 60000 });
  await client.waitForTimeout(2000);
  step('portal390', await client.evaluate(() => ({
    ownerInvoiceShown: /ZZ-RCV-1543/.test(document.body.innerText),
    subBillShown: /ZZ-SUB-1543|ZZ AUDIT Sub Bill/.test(document.body.innerText),
    payButtons: [...document.querySelectorAll('button')].filter((b) => /^Pay \$/.test((b.textContent || '').trim())).length,
    nan: /NaN/.test(document.body.innerText),
    sideScroll: document.scrollingElement.scrollWidth > innerWidth + 1,
  })));
  await shot(client, '390-portal-financials.png', true);

  // ── #137 The emailed invoice link ──
  await client.goto(`${SITE}/portals/invoice/${OWNER_INVOICE_TOKEN}`, { waitUntil: 'networkidle', timeout: 60000 });
  await client.waitForTimeout(1500);
  step('invoice390', await client.evaluate(() => ({
    opens: /ZZ-RCV-1543/.test(document.body.innerText),
    amount: (document.body.innerText.match(/\$1,500(\.00)?/) || [null])[0],
    payButton: [...document.querySelectorAll('button, a')].some((b) => /^Pay\b/.test((b.textContent || '').trim())),
    sideScroll: document.scrollingElement.scrollWidth > innerWidth + 1,
  })));
  await shot(client, '390-invoice-link.png', true);

  // ── #137 Import from another app (phone) ──
  const stamp = String(Date.now()).slice(-6);
  const names = [`ZZ AUDIT Import ${stamp} A`, `ZZ AUDIT Import ${stamp} B`];
  const csv = path.join(os.tmpdir(), `zz-import-${stamp}.csv`);
  fs.writeFileSync(csv, [
    'Job Name,Job Number,Street Address,City,State,Zip,Status,Contract Price,Projected Start,Customer Name,Customer Email',
    `"${names[0]}",ZZ-${stamp}-A,"100 N Test St",Phoenix,AZ,85004,Open,"$12,500.00",10/15/2026,ZZ AUDIT Owner,delivered@resend.dev`,
    `"${names[1]}",ZZ-${stamp}-B,"200 N Test St",Mesa,AZ,85201,Closed,"$7,250",11/2/2026,ZZ AUDIT Owner,delivered@resend.dev`,
  ].join('\r\n'));
  await go(phone, '/app/settings/import');
  await phone.setInputFiles('input[type="file"]', csv);
  await phone.getByText('3. Check the columns').waitFor({ timeout: 20000 });
  step('importMapped', await phone.evaluate(() => [...document.querySelectorAll('label select')].map((s) => `${(s.closest('label')?.querySelector('span')?.textContent || '').trim()} ← ${s.selectedOptions[0]?.textContent?.trim()}`)));
  step('importSideScroll', await sideScroll(phone));
  await shot(phone, '390-import-mapped.png', true);
  const importBtn = phone.getByRole('button', { name: /^Import \d+ jobs$/ });
  step('importButton', await importBtn.textContent());
  await importBtn.click();
  await phone.getByRole('status').waitFor({ timeout: 60000 });
  step('importFirst', await phone.getByRole('status').innerText());
  await shot(phone, '390-import-done.png', true);
  await phone.getByRole('button', { name: /^Import \d+ jobs$/ }).click();
  await phone.waitForFunction(() => /already in Saguaro/.test(document.querySelector('[role="status"]')?.textContent || '') && !/Importing/.test(document.body.innerText), null, { timeout: 60000 });
  await phone.waitForTimeout(800);
  step('importAgain', await phone.getByRole('status').innerText());
  await shot(phone, '390-import-again.png', true);

  // What landed: every field, read back from the server.
  const all = (await (await gc.request.get(`${SITE}/api/projects?limit=1000`)).json()).projects || [];
  const made = all.filter((p) => names.includes(p.name));
  step('importLanded', made.map((p) => ({ name: p.name, number: p.project_number, address: p.address, status: p.status, contract: p.contract_value, start: p.start_date })));
  if (made[0]) {
    await go(gc, `/app/projects/${made.find((p) => p.name === names[0])?.id || made[0].id}`);
    await shot(gc, '1440-imported-job.png');
  }
  // 1440 view of the mapped import screen (file chosen, nothing sent).
  await go(gc, '/app/settings/import');
  await gc.setInputFiles('input[type="file"]', csv);
  await gc.getByText('3. Check the columns').waitFor({ timeout: 20000 });
  await shot(gc, '1440-import-mapped.png', true);

  // Archive the two test jobs the way the app does.
  const archived = [];
  for (const p of made) archived.push((await gc.request.delete(`${SITE}/api/projects/${p.id}`)).status());
  const left = ((await (await gc.request.get(`${SITE}/api/projects?limit=1000&fields=id,name`)).json()).projects || []).filter((p) => names.includes(p.name)).length;
  step('importCleanup', { archived, stillListed: left, ids: made.map((p) => p.id) });
} catch (e) {
  result.error = String(e.message || e).split('\n')[0];
}
await desktop.close();
await phoneBrowser.close();
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
