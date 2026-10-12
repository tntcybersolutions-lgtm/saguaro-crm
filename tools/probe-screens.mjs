/**
 * tools/probe-screens.mjs — before/after screenshots for the navy/slate
 * redesign: representative screens across every module at 390 (iPhone 15,
 * WebKit), 820 (iPad, Chromium) and 1440 (desktop, Chromium), signed in as the
 * real company, read-only (the ZZ AUDIT job; one owner-portal session is
 * created on it and removed by SQL after). Per screen: page title, sideways
 * overflow, and at 390 the count of visible controls under 44px.
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
const result = { site: SITE, steps: [], screens: {} };
const step = (k, v) => { result[k] = v; result.steps.push(k); console.log(k, JSON.stringify(v)); };

async function login(page) {
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
}

const facts = (page, phone) => page.evaluate((phone) => {
  const root = document.querySelector('.main-content-area') || document.body;
  let small = 0;
  if (phone) {
    for (const el of root.querySelectorAll('button, [role="button"], select, input:not([type=hidden]), a.k-btn')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[aria-hidden="true"]')) continue;
      if (r.bottom < 0 || r.top > innerHeight * 3) continue;
      if (r.height < 43.5) small++;
    }
  }
  return {
    title: (document.querySelector('h1')?.textContent || document.title || '').trim().slice(0, 60),
    sideScroll: document.scrollingElement.scrollWidth > innerWidth + 1,
    small,
    bg: getComputedStyle(document.body).backgroundColor,
  };
}, phone);

const desktop = await pw.chromium.launch();
const phoneBrowser = await pw.webkit.launch();
try {
  const desk = await desktop.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const tab = await desktop.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, colorScheme: 'dark', isMobile: true, hasTouch: true });
  const phoneCtx = await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], deviceScaleFactor: 2, colorScheme: 'dark' });
  const gc = await desk.newPage();
  await login(gc);
  const jobs = (await (await gc.request.get(`${SITE}/api/projects?limit=1000&fields=id,name`)).json()).projects || [];
  const job = jobs.find((j) => j.name === JOB);
  if (!job) throw new Error(`${JOB} not in this company`);
  const tp = await tab.newPage(); await login(tp);
  const ph = await phoneCtx.newPage(); await login(ph);
  const pr = await gc.request.post(`${SITE}/api/portal/client/create`, { data: { projectId: job.id, clientName: 'ZZ AUDIT Client', clientEmail: 'delivered@resend.dev' } });
  const token = (await pr.json().catch(() => ({}))).session?.token;

  const P = `/app/projects/${job.id}`;
  const screens = [
    ['home', '/app'], ['my-work', '/app/my-work'], ['projects', '/app/projects'], ['new-job-form', '/app/projects/new'],
    ['job-overview', `${P}/overview`], ['job-change-orders', `${P}/change-orders`], ['job-budget', `${P}/budget`],
    ['job-daily-logs', `${P}/daily-logs`], ['job-schedule', `${P}/schedule`], ['job-rfis', `${P}/rfis`],
    ['job-punch', `${P}/punch-list`], ['job-photos', `${P}/photos`], ['job-files', `${P}/files`],
    ['leads', '/app/leads'], ['customers', '/app/customers'], ['subs', '/app/subs'], ['invoicing', '/app/invoicing'],
    ['billing', '/app/billing'], ['documents', '/app/documents'], ['time', '/app/time'], ['people', '/app/people'],
    ['radio', '/app/radio'], ['takeoff', '/app/takeoff'], ['settings', '/app/settings'],
    ['settings-payments', '/app/settings/payments'], ['settings-calendar', '/app/settings/calendar'], ['settings-import', '/app/settings/import'],
    ['photo-sheet', '/app?media=1'], ['not-found-job', '/app/projects/00000000-0000-4000-8000-000000000000/overview'],
    ['portal-home', `/portals/client/${token}`], ['portal-financials', `/portals/client/${token}?tab=financials`],
  ];
  for (const [name, url] of screens) {
    result.screens[name] = {};
    for (const [w, page] of [['390', ph], ['820', tp], ['1440', gc]]) {
      try {
        await page.goto(`${SITE}${url}`, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1500);
        result.screens[name][w] = await facts(page, w === '390');
        await page.screenshot({ path: path.join(OUT, `${name}-${w}.jpg`), type: 'jpeg', quality: 72, fullPage: w !== '1440' && name !== 'photo-sheet' }).catch(() => {});
      } catch (e) {
        result.screens[name][w] = { error: String(e.message || e).split('\n')[0].slice(0, 120) };
      }
    }
    console.log(name, JSON.stringify(result.screens[name]));
  }
  // Logged-out sign-in screen.
  const anon = await desktop.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const lp = await anon.newPage();
  await lp.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
  await lp.screenshot({ path: path.join(OUT, 'login-1440.jpg'), type: 'jpeg', quality: 72 }).catch(() => {});
  const anonPhone = await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], colorScheme: 'dark' });
  const lpp = await anonPhone.newPage();
  await lpp.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
  await lpp.screenshot({ path: path.join(OUT, 'login-390.jpg'), type: 'jpeg', quality: 72 }).catch(() => {});
  step('done', { screens: screens.length });
} catch (e) {
  result.error = String(e.message || e).split('\n')[0];
}
await desktop.close();
await phoneBrowser.close();
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ error: result.error || null, screens: Object.keys(result.screens).length }));
