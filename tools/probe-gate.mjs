/**
 * tools/probe-gate.mjs — drives Back and the unsaved-changes gate on the live
 * site as the real company, at iPhone (WebKit, 390) and desktop (Chromium, 1440).
 *
 *   Back       Home → Jobs → a job → Financials; Back must name the prior
 *              screen and land on it.
 *   Job menu   on the phone, the job's phase pills must show as a swipe row.
 *   Gate       on a ZZ AUDIT job's Directory: type a name, tap Home →
 *              "Unsaved changes" must ask; Keep editing keeps the text;
 *              Discard leaves and saves nothing; Save and exit saves the
 *              contact and leaves. The saved ZZ AUDIT contact is deleted after.
 *   No nag     typing in a search box and leaving must NOT ask.
 *
 * Writes only to a ZZ AUDIT job's directory, and removes what it wrote.
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

const result = { site: SITE };
const DIALOG = '[role="alertdialog"][aria-label="Unsaved changes"]';

async function run(name, browserType, ctxOpts) {
  const browser = await browserType.launch();
  const ctx = await browser.newContext({ ...ctxOpts, colorScheme: 'dark' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).split('\n')[0]));
  const r = { errors, steps: [] };
  const step = (k, v) => { r[k] = v; r.steps.push(k); };
  const path_ = () => new URL(page.url()).pathname;
  const backText = async () => (await page.locator('.sag-tb-back').first().textContent().catch(() => null))?.trim() || null;
  const visibleLink = (href) => page.locator(`a[href="${href}"]:visible`).first();
  const dialogUp = () => page.waitForSelector(DIALOG, { state: 'visible', timeout: 4000 }).then(() => true, () => false);
  try {
    await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
    await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });

    const d = await (await page.request.get(`${SITE}/api/projects?limit=100&fields=id,name`)).json();
    const jobs = d.projects || d.data || (Array.isArray(d) ? d : []);
    const real = jobs.find((j) => /Pima County Adult/i.test(j.name || '')) || jobs.find((j) => !/ZZ AUDIT/i.test(j.name || ''));
    const zz = jobs.find((j) => /ZZ AUDIT/i.test(j.name || ''));
    step('jobs', { real: real?.name || null, zz: zz?.name || null });

    /* ── Back ─────────────────────────────────────────────────────────── */
    await page.goto(`${SITE}/app`, { waitUntil: 'networkidle' });
    await visibleLink('/app/projects').click();
    await page.waitForURL((u) => u.pathname === '/app/projects', { timeout: 20000 });
    await page.waitForTimeout(800);
    step('backOnJobs', await backText());
    await page.goto(`${SITE}/app/projects/${real.id}/overview`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    step('backOnJob', await backText());

    // The job's phase menu: visible, all seven, current one in view, no page sideways scroll.
    step('jobMenu', await page.evaluate(() => {
      const row = document.querySelector('.pjx-tabs');
      const tabs = [...document.querySelectorAll('.pjx-tab')].filter((t) => t.getBoundingClientRect().width > 0);
      const on = document.querySelector('.pjx-tab[data-active]');
      const rr = row?.getBoundingClientRect();
      const ar = on?.getBoundingClientRect();
      return {
        shown: !!row && getComputedStyle(row).display !== 'none' && (rr?.height || 0) > 0,
        tabs: tabs.map((t) => t.textContent.trim()),
        active: on?.textContent.trim() || null,
        activeInView: !!(rr && ar && ar.left >= rr.left - 1 && ar.right <= rr.right + 1),
        activeBg: on ? getComputedStyle(on).backgroundColor : null,
        pageSideways: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    }));
    await page.screenshot({ path: path.join(OUT, `${name}-job-menu.png`) });

    await page.locator('.pjx-tab', { hasText: 'Financials' }).first().click();
    await page.waitForURL((u) => !u.pathname.endsWith('/overview'), { timeout: 20000 });
    await page.waitForTimeout(1200);
    step('financialsPath', path_());
    step('backOnFinancials', await backText());
    await page.screenshot({ path: path.join(OUT, `${name}-back.png`) });
    await page.locator('.sag-tb-back').first().click();
    await page.waitForURL((u) => u.pathname.endsWith('/overview'), { timeout: 20000 }).catch(() => {});
    step('backLandedOn', path_());

    /* ── No nag: a search box is not work ─────────────────────────────── */
    await page.goto(`${SITE}/app/projects`, { waitUntil: 'networkidle' });
    const search = page.locator('input[type="search"]:visible, input[placeholder*="Search" i]:visible').first();
    if (await search.count()) {
      await search.fill('pima');
      await visibleLink('/app').click();
      step('searchAsked', await dialogUp());
      if (r.searchAsked) await page.locator(`${DIALOG} button`, { hasText: 'Discard' }).click();
      await page.waitForURL((u) => u.pathname === '/app', { timeout: 15000 }).catch(() => {});
      step('searchLeftTo', path_());
    } else step('searchAsked', 'no search box on Jobs');

    /* ── Gate on a ZZ AUDIT job's Directory ───────────────────────────── */
    if (!zz) throw new Error('no ZZ AUDIT job to write to');
    const dir = `${SITE}/app/projects/${zz.id}/directory`;
    const openForm = async (who) => {
      await page.goto(dir, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /Add Someone/i }).click();
      const nameBox = page.locator('form input[required]').first();
      await nameBox.click();
      await nameBox.type(who, { delay: 10 });
      return nameBox;
    };
    const listed = async (who) => {
      const j = await (await page.request.get(`${SITE}/api/projects/${zz.id}/directory`)).json().catch(() => ({}));
      const rows = j.contacts || j.data || j.directory || (Array.isArray(j) ? j : []);
      return rows.find((c) => c.name === who) || null;
    };

    // Leave the form: the phone taps the Home tab (a link); the desktop presses
    // the top bar's Back pill (a router move) — the two ways out the gate covers.
    const leave = () => (name === '390' ? visibleLink('/app') : page.locator('.sag-tb-back').first()).click();
    const stamp = `${name}-${Date.now().toString(36)}`;
    const discardName = `ZZ AUDIT Gate Discard ${stamp}`;
    let box = await openForm(discardName);
    await leave();
    step('gateAsked', await dialogUp());
    step('gateButtons', await page.locator(`${DIALOG} button`).allTextContents().catch(() => []));
    await page.screenshot({ path: path.join(OUT, `${name}-gate-dialog.png`) });
    await page.locator(`${DIALOG} button`, { hasText: 'Keep editing' }).click();
    await page.waitForTimeout(400);
    step('afterKeepEditing', { path: path_(), text: await box.inputValue().catch(() => null), dialog: await page.locator(DIALOG).count() });
    await leave();
    await dialogUp();
    await page.locator(`${DIALOG} button`, { hasText: 'Discard' }).click();
    await page.waitForURL((u) => u.pathname === '/app', { timeout: 15000 }).catch(() => {});
    step('afterDiscard', { path: path_(), savedAnyway: !!(await listed(discardName)) });

    const saveName = `ZZ AUDIT Gate Save ${stamp}`;
    box = await openForm(saveName);
    await leave();
    await dialogUp();
    await page.locator(`${DIALOG} button`, { hasText: 'Save and exit' }).click();
    await page.waitForURL((u) => u.pathname === '/app', { timeout: 25000 }).catch(() => {});
    const saved = await listed(saveName);
    step('afterSaveAndExit', { path: path_(), saved: !!saved });
    if (saved) {
      const del = await page.request.delete(`${SITE}/api/projects/${zz.id}/directory/${saved.id}`);
      step('cleanup', { status: del.status(), gone: !(await listed(saveName)) });
    }
  } catch (e) {
    r.error = String(e.message || e).split('\n')[0];
    await page.screenshot({ path: path.join(OUT, `${name}-error.png`) }).catch(() => {});
  }
  await browser.close();
  return r;
}
result.phone = await run('390', pw.webkit, { ...pw.devices['iPhone 15'] });
result.desktop = await run('1440', pw.chromium, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
fs.writeFileSync(path.join(OUT, 'gate.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
