/**
 * tools/probe-menus.mjs — iPhone (WebKit, iPhone 15) probe of the two drop-down
 * reports from Chad, on the LIVE site as the real company (read-only: nothing is
 * saved, sent or created; the bid-package wizard is opened and closed).
 *   1. Home → tap the "All jobs" job chip → how many job menus are on screen?
 *   2. More menu → tap the job picker → how many job menus?
 *   3. A job → Bid Packages → Create Bid Package → tap the Trade drop-down →
 *      is the option sheet on top (what a finger at its centre would touch)?
 * Writes tools/probe/result.json and screenshots to tools/probe/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const SITE = 'https://www.saguarocontrol.net';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'tools/probe');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR, 'noop.js'));
const pw = require('playwright');
if (!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD) throw new Error('no real-company login (tools/e2e-login.mjs)');

const result = {};
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => {});

/** Every job/option menu visible right now, and what sits on top at its centre. */
async function menus(page) {
  return page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const out = [];
    const probes = [
      ['option sheet (.ms-root)', '.ms-root'],
      ['job picker sheet (.jp-sheet-root)', '.jp-sheet-root'],
      ['job picker dropdown (.jp-panel)', '.jp-panel:not(.jp-sheet)'],
      ['quick switcher (ProjectSwitcher)', '[data-project-switcher], [aria-label="Switch project"]'],
      ['modal (.k-overlay)', '.k-overlay'],
      ['menu drawer', '[role="dialog"][aria-label="Menu"]'],
    ];
    for (const [label, sel] of probes) {
      for (const el of document.querySelectorAll(sel)) {
        if (!vis(el)) continue;
        const panel = el.querySelector('[role="dialog"], [role="listbox"], .jp-sheet, .ms-sheet') || el;
        const r = panel.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 120));
        out.push({ label, z: getComputedStyle(el).zIndex, onTop: !!top && (el === top || el.contains(top)), topIs: top ? (top.className && typeof top.className === 'string' ? top.className.slice(0, 60) : top.tagName) : null });
      }
    }
    const listboxes = [...document.querySelectorAll('[role="listbox"]')].filter(vis).length;
    return { menus: out, visibleListboxes: listboxes };
  });
}

const browser = await pw.webkit.launch();
const device = { ...pw.devices['iPhone 15'], colorScheme: 'dark' };
const ctx = await browser.newContext(device);
const page = await ctx.newPage();
await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });

// 1. Home job chip
try {
  await page.goto(`${SITE}/app`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '1a-home');
  const chip = page.locator('.fh-chip select[aria-label="Job"]').first();
  result.homeChipFound = await chip.count();
  if (result.homeChipFound) {
    await chip.tap();
    await page.waitForTimeout(1200);
    result.homeChip = await menus(page);
    await shot(page, '1b-home-chip-tapped');
  }
} catch (e) { result.homeChipError = String(e.message || e).split('\n')[0]; }

// 2. More menu → job picker
try {
  await page.goto(`${SITE}/app`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const more = page.locator('button.sag-tab[aria-label="More"]').first();
  result.moreFound = await more.count();
  if (result.moreFound) {
    await more.tap();
    await page.waitForTimeout(800);
    await shot(page, '2a-more-open');
    const trig = page.locator('[role="dialog"][aria-label="Menu"] .jp-trigger').first();
    result.drawerPickerFound = await trig.count();
    if (result.drawerPickerFound) {
      await trig.tap();
      await page.waitForTimeout(1200);
      result.drawerPicker = await menus(page);
      await shot(page, '2b-drawer-picker-tapped');
    }
  }
} catch (e) { result.drawerError = String(e.message || e).split('\n')[0]; }

// 3. Create Bid Package → Trade drop-down
try {
  const d = await (await page.request.get(`${SITE}/api/projects?limit=50&fields=id,name`)).json();
  const jobs = d.projects || d.data || (Array.isArray(d) ? d : []);
  const job = jobs.find((j) => !/ZZ AUDIT/i.test(j.name || '')) || jobs[0];
  result.job = job ? 'found' : 'none';
  if (job) {
    await page.goto(`${SITE}/app/projects/${job.id}/bid-packages?new=1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot(page, '3a-wizard');
    const trade = page.locator('.k-overlay select#bp-trade').first();
    result.tradeFound = await trade.count();
    if (result.tradeFound) {
      await trade.tap();
      await page.waitForTimeout(1200);
      result.trade = await menus(page);
      await shot(page, '3b-trade-tapped');
    }
  }
} catch (e) { result.tradeError = String(e.message || e).split('\n')[0]; }

fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
