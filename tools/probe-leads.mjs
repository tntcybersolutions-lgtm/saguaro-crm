/**
 * tools/probe-leads.mjs — drives #131 on the live site as the real company.
 *
 *   Website form  Leads → Website Form → turn on / read the link. A visitor on
 *                 an iPhone (no login) fills the hosted form → thank-you. The
 *                 paste-in HTML form, posted from a plain page → lands on the
 *                 thank-you page. A bot (honeypot filled) is thanked and not
 *                 saved. Both real requests are New leads, source Website.
 *                 Replace Link → the old link answers "no longer active".
 *   Baselines     Two ZZ AUDIT tasks → Set Baseline (button) → one task slips
 *                 3 days → the Gantt shows +3d and "1 of 2 late · finish +3d".
 *
 * Writes only to ZZ AUDIT records; email delivered@resend.dev, phone
 * 602-555-0100. Rows are removed from the database afterwards (ids in leads.json).
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
const result = { site: SITE, tag: TAG, steps: [] };
const step = (k, v) => { result[k] = v; result.steps.push(k); console.log(k, JSON.stringify(v)); };
const shot = (page, name, fullPage = true) => page.screenshot({ path: path.join(OUT, name), fullPage }).catch(() => {});
const noSideScroll = (page) => page.evaluate(() => ({ scrollW: document.scrollingElement.scrollWidth, vw: innerWidth, ok: document.scrollingElement.scrollWidth <= innerWidth + 1 }));

async function login(page) {
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
  const d = await (await page.request.get(`${SITE}/api/projects?limit=200&fields=id,name`)).json();
  return d.projects || [];
}
const leadsNamed = async (page, re) => ((await (await page.request.get(`${SITE}/api/leads`)).json()).leads || (await (await page.request.get(`${SITE}/api/leads`)).json()).data || [])
  .filter((l) => re.test(`${l.contact_name} ${l.company_name}`));

const desktop = await pw.chromium.launch();
const gc = await (await desktop.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' })).newPage();
const phoneBrowser = await pw.webkit.launch();
const ids = { leads: [], tasks: [] };
try {
  const jobs = await login(gc);
  const job = jobs.find((j) => j.name === JOB);
  if (!job) throw new Error(`${JOB} not in this company`);
  ids.job = job.id;

  // ── Website form: the GC side ──
  await gc.goto(`${SITE}/app/leads`, { waitUntil: 'networkidle' });
  await gc.getByRole('button', { name: 'Website Form' }).click();
  await gc.waitForSelector('text=Website Form', { timeout: 10000 });
  // The modal opens at once and reads the link in the background: wait for
  // either the link (already on) or the Turn On button (first time).
  await gc.waitForSelector('.k-modal code, .k-modal button:has-text("Turn On Website Form")', { timeout: 20000 });
  const turnOn = gc.getByRole('button', { name: 'Turn On Website Form' });
  if (await turnOn.isVisible().catch(() => false)) { step('turnedOn', true); await turnOn.click(); }
  await gc.waitForSelector('.k-modal code', { timeout: 15000 });
  const url = (await gc.locator('.k-modal code').innerText()).trim();
  const embed = await gc.locator('.k-modal textarea').inputValue();
  step('formLink', { url: url.replace(/[a-f0-9]{24,}$/, '<key>'), embedPostsTo: /action="[^"]+\/api\/portal\/lead\/[a-f0-9]+"/.test(embed) });
  await shot(gc, '1440-website-form.png', false);
  await gc.keyboard.press('Escape');

  // ── A visitor on an iPhone ──
  const visitor = await (await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], colorScheme: 'dark' })).newPage();
  await visitor.goto(url, { waitUntil: 'networkidle' });
  await visitor.waitForSelector('text=Request a quote', { timeout: 20000 });
  step('formOverflow', await noSideScroll(visitor));
  await visitor.fill('#lf-name', `ZZ AUDIT Lead ${TAG}`);
  await visitor.fill('#lf-email', 'delivered@resend.dev');
  await visitor.fill('#lf-phone', '602-555-0100');
  await visitor.fill('#lf-address', '100 ZZ Audit Way, Tucson AZ');
  await visitor.selectOption('#lf-type', 'Kitchen remodel');
  await visitor.selectOption('#lf-budget', '$25k–$100k');
  await visitor.selectOption('#lf-timeline', '1–3 months');
  await visitor.fill('#lf-message', 'ZZ AUDIT test request — new cabinets and counters.');
  await shot(visitor, '390-lead-form.png');
  await visitor.waitForTimeout(3000); // a person takes longer than the bot floor
  await visitor.getByRole('button', { name: 'Request a quote' }).click();
  await visitor.waitForSelector('text=Thank you', { timeout: 20000 });
  step('visitorThanks', await visitor.locator('h1').innerText());
  await shot(visitor, '390-lead-thanks.png');

  // ── The paste-in form, from a plain page ──
  const site = await (await desktop.newContext()).newPage();
  await site.setContent(`<html><body>${embed.replace('name="name"', `name="name" value="ZZ AUDIT Embed ${TAG}"`).replace('name="phone"', 'name="phone" value="602-555-0100"')}</body></html>`);
  await Promise.all([site.waitForURL(/\/portals\/lead\/.+\?sent=1/, { timeout: 30000 }), site.locator('button[type="submit"]').click()]);
  await site.waitForSelector('text=Thank you', { timeout: 20000 });
  step('embedLandsOnThanks', site.url().replace(/[a-f0-9]{24,}/, '<key>'));

  // ── A bot: thanked, not saved ──
  const key = url.split('/').pop();
  const bot = await gc.request.post(`${SITE}/api/portal/lead/${key}`, { data: { name: `ZZ AUDIT Bot ${TAG}`, email: 'delivered@resend.dev', website: 'http://spam.example' } });
  step('botAnswer', { status: bot.status(), body: await bot.json().catch(() => null) });

  await gc.waitForTimeout(1500);
  const saved = await leadsNamed(gc, new RegExp(`ZZ AUDIT (Lead|Embed|Bot) ${TAG}`));
  ids.leads = saved.map((l) => l.id);
  step('leadsSaved', saved.map((l) => ({ name: l.contact_name, source: l.source, stage: l.stage, value: l.estimated_value, type: l.project_type, notes: String(l.notes || '').slice(0, 120) })));
  await gc.goto(`${SITE}/app/leads`, { waitUntil: 'networkidle' });
  await shot(gc, '1440-leads.png', false);

  // Replace Link → the old one stops working.
  await gc.getByRole('button', { name: 'Website Form' }).click();
  await gc.waitForSelector('.k-modal code', { timeout: 15000 });
  await gc.getByRole('button', { name: 'Replace Link' }).click();
  await gc.getByRole('button', { name: /^(Confirm|Replace|OK|Yes|Continue)/ }).last().click().catch(() => {});
  await gc.waitForFunction((old) => (document.querySelector('.k-modal code')?.textContent || '').trim() !== old, url, { timeout: 15000 }).catch(() => {});
  const newUrl = (await gc.locator('.k-modal code').innerText()).trim();
  const oldGet = await gc.request.get(`${SITE}/api/portal/lead/${key}`);
  step('replaceLink', { changed: newUrl !== url, oldLinkStatus: oldGet.status() });
  await gc.keyboard.press('Escape');

  // ── Schedule baselines ──
  const mk = async (name, start, end) => (await (await gc.request.post(`${SITE}/api/schedule/create`, { data: { projectId: job.id, name, start_date: start, end_date: end, phase: 'Framing' } })).json()).task;
  const t1 = await mk(`ZZ AUDIT Frame garage ${TAG}`, '2026-10-12', '2026-10-16');
  const t2 = await mk(`ZZ AUDIT Roof trusses ${TAG}`, '2026-10-19', '2026-10-23');
  ids.tasks = [t1?.id, t2?.id].filter(Boolean);
  await gc.goto(`${SITE}/app/projects/${job.id}/schedule`, { waitUntil: 'networkidle' });
  const based = gc.waitForResponse((r) => r.url().includes('/schedule/baseline'), { timeout: 30000 });
  await gc.getByRole('button', { name: /Set Baseline|Reset Baseline/ }).click();
  await gc.getByRole('button', { name: /^(Confirm|Replace|OK|Yes|Continue)/ }).last().click({ timeout: 3000 }).catch(() => {});
  const bj = await (await based).json();
  step('setBaseline', { baselined: bj.baselined, error: bj.error });
  // The roof trusses slip three days.
  await gc.request.put(`${SITE}/api/schedule/${t2.id}`, { data: { end_date: '2026-10-26' } });
  await gc.reload({ waitUntil: 'networkidle' });
  await gc.waitForTimeout(800);
  step('gantt', await gc.evaluate((tag) => {
    const card = [...document.querySelectorAll('div')].find((d) => /^Timeline/.test(d.textContent || '') && /baseline/.test(d.textContent || ''));
    const sub = card ? (card.textContent || '').replace(/\s+/g, ' ').slice(0, 220) : null;
    const rows = [...document.querySelectorAll('div')].filter((d) => d.children.length === 2 && (d.textContent || '').includes(tag)).map((d) => d.textContent.replace(/\s+/g, ' ').trim()).slice(0, 4);
    return { sub, rows, plus3: (document.body.innerText || '').includes('+3d') };
  }, TAG));
  await shot(gc, '1440-schedule-baseline.png');
  const phone = await (await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], colorScheme: 'dark' })).newPage();
  await login(phone);
  await phone.goto(`${SITE}/app/projects/${job.id}/schedule`, { waitUntil: 'networkidle' });
  await phone.waitForTimeout(800);
  step('schedulePhoneOverflow', await noSideScroll(phone));
  await shot(phone, '390-schedule-baseline.png');
} catch (e) {
  result.error = String(e.message || e).split('\n')[0];
  await shot(gc, '1440-error.png');
}
result.ids = ids;
await desktop.close();
await phoneBrowser.close();
fs.writeFileSync(path.join(OUT, 'leads.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
