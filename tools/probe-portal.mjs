/**
 * tools/probe-portal.mjs — live proof of #139 on the ZZ AUDIT job's owner
 * portal, at 390 (WebKit iPhone 15) and 1440. The ZZ job's change orders and
 * owner invoice are seeded and removed by SQL around the run.
 *
 *   seeded: original contract $12,345 (original_contract_amount), one approved
 *           CO +$2,500, one pending CO $4,321, one owner invoice $1,500
 *   expect: Original $12,345.00 · Current $14,845.00 · if approved $19,166.00
 *           no "Submit Payment", a How to Pay card, no "0°F" / "N/A" weather,
 *           the invoice table stacked on the phone, nothing sideways
 *   import: a jobs CSV with an Open and an Estimating row → building / bidding
 *           (phase read back from /api/projects), then both archived
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
const result = { site: SITE, steps: [] };
const step = (k, v) => { result[k] = v; result.steps.push(k); console.log(k, JSON.stringify(v)); };
const shot = (page, name, fullPage = false) => page.screenshot({ path: path.join(OUT, name), fullPage }).catch(() => {});
const go = async (page, url) => { await page.goto(`${SITE}${url}`, { waitUntil: 'networkidle', timeout: 60000 }); await page.waitForTimeout(1500); };

async function login(page) {
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
  const d = await (await page.request.get(`${SITE}/api/projects?limit=1000&fields=id,name`)).json();
  return d.projects || [];
}

const portalFacts = (page) => page.evaluate(() => {
  const t = document.body.innerText;
  const money = (label) => { const m = t.match(new RegExp(label + '\\s*\\n?\\s*(\\$[\\d,]+\\.\\d{2})')); return m ? m[1] : null; };
  const inv = document.querySelector('table.k-stack');
  return {
    original: money('Original Contract'),
    current: money('Current Contract'),
    ifApproved: money('If Pending Changes Are Approved'),
    approvedLine: (t.match(/[+-]?\$[\d,.]+ in \d+ approved change orders?|No approved change orders/) || [null])[0],
    pendingLine: (t.match(/\d+ change orders? waiting on a decision|Nothing waiting on a decision/) || [null])[0],
    submitPayment: /Submit Payment/.test(t),
    howToPay: /How to Pay/.test(t),
    invoiceTable: inv ? getComputedStyle(inv).display : null,
    sideScroll: document.scrollingElement.scrollWidth > innerWidth + 1,
    nan: /NaN/.test(t),
  };
});

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

  // What the GC's own screens say about the same contract.
  const ctx = await (await gc.request.get(`${SITE}/api/project-context?projectId=${job.id}`)).json().catch(() => ({}));
  step('gcMoney', { original: ctx.money?.originalContract ?? null, revised: ctx.money?.revisedContract ?? null, pendingCos: ctx.money?.pendingCoCount ?? null });

  // ── Owner portal ──
  const pr = await gc.request.post(`${SITE}/api/portal/client/create`, { data: { projectId: job.id, clientName: 'ZZ AUDIT Client', clientEmail: 'delivered@resend.dev' } });
  const token = (await pr.json().catch(() => ({}))).session?.token;
  const dash = await (await gc.request.get(`${SITE}/api/portal/client/dashboard?token=${token}`, { headers: { 'x-portal-token': token } })).json().catch(() => ({}));
  step('dashboardApi', { budget: dash.budget || null, weather: dash.weather ?? null });

  for (const [w, ctxPage] of [['390', phoneCtx], ['1440', gc.context()]]) {
    const owner = await ctxPage.newPage();
    await owner.goto(`${SITE}/portals/client/${token}`, { waitUntil: 'networkidle', timeout: 60000 });
    await owner.waitForTimeout(2500);
    step(`home${w}`, await owner.evaluate(() => {
      const t = document.body.innerText;
      const wx = (t.match(/Job Site Weather\s*\n([\s\S]{0,120})/) || [null, null])[1];
      return {
        weather: wx ? wx.replace(/\s+/g, ' ').trim() : null,
        fakeWeather: /0°F\s*\n?\s*N\/A/.test(t),
        burn: (t.match(/Contract & Billing[\s\S]{0,40}/) || [null])[0]?.replace(/\s+/g, ' ') || null,
        sideScroll: document.scrollingElement.scrollWidth > innerWidth + 1,
      };
    }));
    await shot(owner, `${w}-portal-home.png`, true);
    await owner.goto(`${SITE}/portals/client/${token}?tab=financials`, { waitUntil: 'networkidle', timeout: 60000 });
    await owner.waitForTimeout(2500);
    step(`financials${w}`, await portalFacts(owner));
    await shot(owner, `${w}-portal-financials.png`, true);
    await owner.close();
  }

  // ── Import lands sold jobs in "building" ──
  const stamp = String(Date.now()).slice(-6);
  const names = [`ZZ AUDIT Phase ${stamp} Sold`, `ZZ AUDIT Phase ${stamp} Est`];
  const csv = path.join(os.tmpdir(), `zz-phase-${stamp}.csv`);
  fs.writeFileSync(csv, [
    'Job Name,Street Address,City,State,Zip,Status',
    `"${names[0]}","100 N Test St",Phoenix,AZ,85004,Open`,
    `"${names[1]}","200 N Test St",Phoenix,AZ,85004,Estimating`,
  ].join('\r\n'));
  await go(phone, '/app/settings/import');
  await phone.setInputFiles('input[type="file"]', csv);
  await phone.getByText('3. Check the columns').waitFor({ timeout: 20000 });
  const outcome = phone.locator('[role="status"]', { hasText: 'already in Saguaro' });
  await phone.getByRole('button', { name: /^Import \d+ jobs$/ }).click();
  await outcome.waitFor({ timeout: 90000 });
  step('importResult', (await outcome.innerText()).replace(/\s+/g, ' '));
  const all = (await (await gc.request.get(`${SITE}/api/projects?limit=1000&fields=id,name,phase,status`)).json()).projects || [];
  const made = all.filter((p) => names.includes(p.name));
  step('importPhase', made.map((p) => ({ name: p.name.endsWith('Sold') ? 'Open row' : 'Estimating row', phase: p.phase, status: p.status })));
  const archived = [];
  for (const p of made) archived.push((await gc.request.delete(`${SITE}/api/projects/${p.id}`)).status());
  step('importCleanup', { archived, ids: made.map((p) => p.id) });
} catch (e) {
  result.error = String(e.message || e).split('\n')[0];
}
await desktop.close();
await phoneBrowser.close();
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
