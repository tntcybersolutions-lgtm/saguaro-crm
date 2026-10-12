/**
 * tools/probe-weather.mjs — #139: the owner's portal shows today's real NWS
 * forecast. The ZZ AUDIT job is pinned to downtown Phoenix by SQL for the run
 * (its test street can't be geocoded) and unpinned after. 390 + 1440.
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
const result = { site: SITE, steps: [] };
const step = (k, v) => { result[k] = v; result.steps.push(k); console.log(k, JSON.stringify(v)); };

const desktop = await pw.chromium.launch();
const phoneBrowser = await pw.webkit.launch();
try {
  const gcCtx = await desktop.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const gc = await gcCtx.newPage();
  await gc.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
  await gc.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await gc.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await gc.click('button[type="submit"]');
  await gc.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
  const jobs = (await (await gc.request.get(`${SITE}/api/projects?limit=1000&fields=id,name`)).json()).projects || [];
  const job = jobs.find((j) => j.name === JOB);
  if (!job) throw new Error(`${JOB} not in this company`);

  step('gcWeatherApi', await (await gc.request.get(`${SITE}/api/weather?projectId=${job.id}`)).json().catch(() => null));
  const pr = await gc.request.post(`${SITE}/api/portal/client/create`, { data: { projectId: job.id, clientName: 'ZZ AUDIT Client', clientEmail: 'delivered@resend.dev' } });
  const token = (await pr.json().catch(() => ({}))).session?.token;
  step('portalWeatherApi', (await (await gc.request.get(`${SITE}/api/portal/client/dashboard?token=${token}`, { headers: { 'x-portal-token': token } })).json().catch(() => ({}))).weather ?? null);

  const phoneCtx = await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], colorScheme: 'dark' });
  for (const [w, ctx] of [['390', phoneCtx], ['1440', gcCtx]]) {
    const owner = await ctx.newPage();
    await owner.goto(`${SITE}/portals/client/${token}`, { waitUntil: 'networkidle', timeout: 60000 });
    await owner.waitForTimeout(2500);
    const card = owner.getByText('Job Site Weather').locator('xpath=..');
    await card.scrollIntoViewIfNeeded().catch(() => {});
    step(`weather${w}`, { text: (await card.innerText().catch(() => '')).replace(/\s+/g, ' '), sideScroll: await owner.evaluate(() => document.scrollingElement.scrollWidth > innerWidth + 1) });
    await card.screenshot({ path: path.join(OUT, `${w}-portal-weather.png`) }).catch(() => {});
    await owner.close();
  }
} catch (e) {
  result.error = String(e.message || e).split('\n')[0];
}
await desktop.close();
await phoneBrowser.close();
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
