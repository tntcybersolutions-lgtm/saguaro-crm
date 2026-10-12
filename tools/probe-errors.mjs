/**
 * tools/probe-errors.mjs — proves the "fix all errors" change (#134) on the
 * live site as the real company, read-only except the ZZ AUDIT job (its CO and
 * daily-log rows are seeded and removed by SQL around the run).
 *
 *   portal      390: no "NaN", no floating Dashboard/Messages/Approvals bar
 *   co          the ZZ CO stored only in `amount` shows its dollars, not $0
 *   dailylog    ZZ job closed 2 Oct, last log 30 Sep → "1 workday unlogged"
 *   time        no React #425/#422 on load (390 + 1440); Delete asks first
 *   leads       390 opens on List; no sideways scroll
 *   taps        390: visible shell buttons/selects under 44px, per screen
 *   placeholder ::placeholder fill differs from typed text
 *   flow        390: FlowStrip arrows hidden
 *   people      390: people table stacks (display:block)
 *   pin         1440: first DataTable column is sticky
 *
 * And the walk fixes (#135):
 *   radio       no channel for a job that no longer exists; filing a message
 *               from such a channel answers 409 in words (no write happens)
 *   billing     390 + 1440: no Stripe portal buttons while checkout is off
 *
 * #136 field loop: Photo sheet shortcuts; ?new=1 opens the punch form.
 * #137: Get Paid Online / Import / Calendar Sync screens (390 + 1440), the
 *   calendar feed is a real iCalendar, portal financials say payOnline.
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
// A message on an "All Hands" channel whose job was deleted (radio_channels has
// no FK to projects). Filing it must answer 409 — before #135 it was a 500.
const DELETED_JOB_MESSAGE = 'b213b6df-8f5c-4e96-a682-c1b87444e150';
const result = { site: SITE, steps: [] };
const step = (k, v) => { result[k] = v; result.steps.push(k); console.log(k, JSON.stringify(v)); };
const shot = (page, name, fullPage = false) => page.screenshot({ path: path.join(OUT, name), fullPage }).catch(() => {});
const noSideScroll = (page) => page.evaluate(() => ({ scrollW: document.scrollingElement.scrollWidth, vw: innerWidth, ok: document.scrollingElement.scrollWidth <= innerWidth + 1 }));
const go = async (page, url) => { await page.goto(`${SITE}${url}`, { waitUntil: 'networkidle', timeout: 60000 }); await page.waitForTimeout(1200); };

async function login(page) {
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
  const d = await (await page.request.get(`${SITE}/api/projects?limit=200&fields=id,name`)).json();
  return d.projects || [];
}

/** Visible buttons / role=button / selects in the page body under 44px tall (or icon-only under 44 wide). */
const smallTargets = (page) => page.evaluate(() => {
  const root = document.querySelector('.main-content-area') || document.body;
  const out = [];
  for (const el of root.querySelectorAll('button, [role="button"], select')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (r.bottom < 0 || r.top > innerHeight * 3) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const iconOnly = el.children.length === 1 && el.firstElementChild?.tagName.toLowerCase() === 'svg' && !(el.textContent || '').trim();
    if (r.height < 43.5 || (iconOnly && r.width < 43.5)) out.push(`${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return { count: out.length, samples: out.slice(0, 8) };
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

  // ── Client portal (390) ──
  const pr = await gc.request.post(`${SITE}/api/portal/client/create`, { data: { projectId: job.id, clientName: 'ZZ AUDIT Client', clientEmail: 'delivered@resend.dev' } });
  const token = (await pr.json().catch(() => ({}))).session?.token;
  const client = await phoneCtx.newPage();
  await client.goto(`${SITE}/portals/client/${token}`, { waitUntil: 'networkidle', timeout: 60000 });
  await client.waitForTimeout(1500);
  await client.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await client.waitForTimeout(500);
  step('portal', await client.evaluate(() => ({
    nan: /NaN/.test(document.body.innerText),
    daysRemaining: (document.body.innerText.match(/(No end date yet|\d+ days remaining)/) || [null])[0],
    floatingBar: [...document.querySelectorAll('div')].some((d) => getComputedStyle(d).position === 'fixed' && d.querySelector('button[title="Approvals"]')),
  })));
  await shot(client, '390-portal.png', true);

  // ── Change order stored only in `amount` ──
  await go(gc, `/app/projects/${job.id}/change-orders`);
  step('co', await gc.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find((r) => /ZZ AUDIT amount-only/.test(r.textContent || ''));
    return { row: row ? row.textContent.replace(/\s+/g, ' ').slice(0, 160) : null, shows4321: !!row && /4,321/.test(row.textContent || '') };
  }));
  await shot(gc, '1440-change-orders.png');

  // ── Daily-log gap on a closed job ──
  await go(gc, `/app/projects/${job.id}/daily-logs`);
  step('dailylog', await gc.evaluate(() => (document.body.innerText.match(/Last Log[\s\S]{0,80}?(\d+ workdays? unlogged|Record is current)/) || [null, null])[1]));
  await shot(gc, '1440-daily-logs.png');

  // ── /app/time: hydration errors ──
  for (const [w, page] of [['390', phone], ['1440', gc]]) {
    const errs = [];
    const onErr = (e) => { const m = String(e.message || e); if (/#425|#422|did not match|Hydration/i.test(m)) errs.push(m.slice(0, 120)); };
    const onCon = (msg) => { if (msg.type() === 'error' && /#425|#422|did not match|Hydration/i.test(msg.text())) errs.push(msg.text().slice(0, 120)); };
    page.on('pageerror', onErr); page.on('console', onCon);
    await go(page, '/app/time');
    await page.waitForTimeout(1500);
    page.off('pageerror', onErr); page.off('console', onCon);
    step(`time${w}`, { hydrationErrors: errs.length, sample: errs[0] || null, weekLabel: await page.evaluate(() => (document.body.innerText.match(/Week of [A-Za-z]{3}, [A-Za-z]{3} \d+|This week/) || [null])[0]) });
  }
  await shot(phone, '390-time.png');

  // ── Leads on a phone ──
  await go(phone, '/app/leads');
  step('leads', { activeTab: await phone.evaluate(() => (document.querySelector('[role="tab"][aria-selected="true"]')?.textContent || '').trim()), ...(await noSideScroll(phone)) });
  await shot(phone, '390-leads.png');

  // ── Tap targets at 390 ──
  const taps = {};
  for (const [name, url] of [['time', '/app/time'], ['radio', '/app/radio'], ['settings', '/app/settings'], ['documents', '/app/documents'], ['budget', `/app/projects/${job.id}/budget`], ['people', '/app/people']]) {
    await go(phone, url);
    taps[name] = await smallTargets(phone);
    if (name === 'settings') await shot(phone, '390-settings.png');
    if (name === 'people') {
      step('people', await phone.evaluate(() => { const t = document.querySelector('table.k-stack'); return t ? { display: getComputedStyle(t).display, rows: t.querySelectorAll('tbody tr').length } : null; }));
      await shot(phone, '390-people.png');
    }
  }
  step('taps', taps);

  // ── Placeholder vs typed text ──
  await go(gc, '/app/leads');
  step('placeholder', await gc.evaluate(() => {
    const el = document.querySelector('input[placeholder]');
    if (!el) return null;
    const ph = getComputedStyle(el, '::placeholder');
    return { placeholderFill: ph.webkitTextFillColor || ph.color, typedFill: getComputedStyle(el).webkitTextFillColor };
  }));

  // ── FlowStrip at 390 ──
  await go(phone, `/app/projects/${job.id}/selections`);
  step('flow', await phone.evaluate(() => {
    const s = document.querySelector('.pmFlowStrip');
    if (!s) return null;
    return { direction: getComputedStyle(s).flexDirection, arrowsShown: [...s.querySelectorAll('.pmFlowArrow')].filter((a) => getComputedStyle(a).display !== 'none').length };
  }));
  await shot(phone, '390-selections.png', true);

  // ── DataTable first column pinned at 1440 ──
  await go(gc, `/app/projects/${job.id}/change-orders`);
  step('pin', await gc.evaluate(() => { const td = document.querySelector('.k-table-wrap > .k-table td:first-child'); return td ? getComputedStyle(td).position : null; }));
  await go(gc, '/app/takeoff');
  step('pinTakeoff', await gc.evaluate(() => { const td = document.querySelector('.k-table-wrap > .k-table td:first-child'); return td ? getComputedStyle(td).position : null; }));

  // ── #135 Radio: channels of deleted jobs are gone; their messages say why they can't be filed ──
  const chans = ((await (await gc.request.get(`${SITE}/api/radio/channels`)).json().catch(() => ({}))).channels || []);
  step('radioChannels', { total: chans.length, jobChannelsWithNoJob: chans.filter((c) => c.project_id && !c.project_name).length });
  const ftl = await gc.request.post(`${SITE}/api/radio/file-to-log`, { data: { messageId: DELETED_JOB_MESSAGE } });
  step('radioFileToLog', { status: ftl.status(), says: (await ftl.json().catch(() => ({}))).error || null });
  await go(phone, '/app/radio');
  await shot(phone, '390-radio.png');
  await go(gc, '/app/radio');
  await shot(gc, '1440-radio.png');

  // ── #135 Billing: no Stripe portal buttons while online checkout is off ──
  for (const [w, page] of [['390', phone], ['1440', gc]]) {
    await go(page, '/app/billing');
    step(`billing${w}`, await page.evaluate(() => ({
      checkoutOff: /Online checkout isn.t switched on yet/.test(document.body.innerText),
      portalButtons: [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim())
        .filter((t) => /^(Manage Payment & Invoices|Update Payment Method|Change Plan|Open Billing Portal)$/.test(t)),
      requestPlanNote: /tap Request Plan/.test(document.body.innerText),
      ...{ scrollW: document.scrollingElement.scrollWidth, vw: innerWidth },
    })));
    await shot(page, `${w}-billing.png`, true);
  }

  // ── #136 Field loop: the Photo sheet carries Daily Log / Punch Item / RFI / Clock for the picked job ──
  await go(phone, `/app?media=1`);
  await phone.waitForTimeout(1500);
  step('fieldSheet', await phone.evaluate(() => {
    const nav = document.querySelector('nav.qmDo');
    return nav ? [...nav.querySelectorAll('a')].map((a) => ({ text: (a.textContent || '').trim(), href: a.getAttribute('href') })) : null;
  }));
  await shot(phone, '390-photo-sheet.png');
  await go(phone, `/app/projects/${job.id}/punch-list?new=1`);
  await phone.waitForTimeout(1500);
  step('punchNewOpens', await phone.evaluate(() => ({ formOpen: /New Punch Item/.test(document.body.innerText), flagCleared: !location.search.includes('new=1') })));
  await shot(phone, '390-punch-new.png');

  // ── #137 Payments / Import / Calendar screens + the calendar feed ──
  for (const [name, url] of [['payments', '/app/settings/payments'], ['import', '/app/settings/import'], ['calendar', '/app/settings/calendar']]) {
    for (const [w, page] of [['390', phone], ['1440', gc]]) {
      await go(page, url);
      await page.waitForTimeout(1200);
      step(`${name}${w}`, await page.evaluate(() => ({
        title: document.querySelector('h1')?.textContent?.trim() || null,
        sideScroll: document.scrollingElement.scrollWidth > innerWidth + 1,
        says: document.body.innerText.slice(0, 400).replace(/\s+/g, ' '),
      })));
      await shot(page, `${w}-${name}.png`, true);
    }
  }
  const link = await (await gc.request.get(`${SITE}/api/calendar/link`)).json().catch(() => ({}));
  const feed = link.url ? await gc.request.get(link.url.replace(/^https?:\/\/[^/]+/, SITE)) : null;
  const ics = feed ? await feed.text() : '';
  step('calendarFeed', { linkOk: !!link.url, status: feed ? feed.status() : null, contentType: feed ? feed.headers()['content-type'] : null, isCalendar: ics.startsWith('BEGIN:VCALENDAR'), events: (ics.match(/BEGIN:VEVENT/g) || []).length });
  const fin = await (await gc.request.get(`${SITE}/api/portal/client/financials?token=${token}`, { headers: { 'x-portal-token': token } })).json().catch(() => ({}));
  step('portalFinancials', { invoices: (fin.invoices || []).length, payOnline: fin.payOnline ?? null, anyPayable: (fin.invoices || []).some((i) => i.payable) });
} catch (e) {
  result.error = String(e.message || e).split('\n')[0];
}
await desktop.close();
await phoneBrowser.close();
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
