/**
 * tools/probe-home.mjs — screenshots of Home (the landing page) as the real
 * company, at iPhone (WebKit, 390) and desktop (Chromium, 1440), full page,
 * plus what rendered: finance cards, charts, the stop-light ticker, page errors.
 * SITE env picks the deployment (default: production). Read-only.
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
async function run(name, browserType, ctxOpts) {
  const browser = await browserType.launch();
  const ctx = await browser.newContext({ ...ctxOpts, colorScheme: 'dark' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`); });
  const r = { errors };
  try {
    await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
    r.loginUrl = new URL(page.url()).host;
    await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
    await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
    await page.goto(`${SITE}/app`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.hf-kpi, .fl-strip', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    Object.assign(r, await page.evaluate(() => ({
      kpis: [...document.querySelectorAll('.hf-kpi')].map((k) => (k.innerText || '').replace(/\s+/g, ' ').trim()),
      panels: [...document.querySelectorAll('.hf-panel h3')].map((h) => h.textContent),
      chartSvgs: document.querySelectorAll('.hf .recharts-surface').length,
      ticker: (document.querySelector('.atk .atkSum')?.innerText || '').replace(/\s+/g, ' ').trim() || null,
      tickerItems: document.querySelectorAll('.atk .atkSet:not(.atkDup) .atkItem').length,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      homeWidth: Math.round(document.querySelector('.fh-in')?.getBoundingClientRect().width || 0),
      mainWidth: Math.round(document.querySelector('.fh')?.getBoundingClientRect().width || 0),
      width: window.innerWidth,
    })));
    // Every ticker alert is a link to a page that answers; every count with alerts is a button.
    const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll('.atk .atkSet:not(.atkDup) a.atkItem')].map((a) => a.getAttribute('href')))]);
    r.tickerLinks = [];
    for (const h of hrefs) {
      const res = await page.request.get(new URL(h, SITE).toString()).catch((e) => ({ status: () => `failed: ${e.message}` }));
      r.tickerLinks.push(`${h.replace(/[0-9a-f-]{36}/gi, ':id')} → ${res.status()}`);
    }
    r.tickerCounts = await page.evaluate(() => [...document.querySelectorAll('.atk button.atkN')].map((b) => `${b.dataset.tone}:${b.disabled ? 'disabled' : 'button'}`));
    const firstCount = page.locator('.atk button.atkN:not([disabled])').first();
    if (await firstCount.count()) {
      await firstCount.click();
      await page.waitForTimeout(400);
      r.afterCountTap = await page.evaluate(() => ({ pressed: document.querySelector('.atk button.atkN[aria-pressed="true"]')?.dataset.tone || null, shown: [...document.querySelectorAll('.atk .atkSet:not(.atkDup) a.atkItem')].map((a) => a.dataset.tone) }));
      await page.screenshot({ path: path.join(OUT, `${name}-ticker-filtered.png`) });
      const state = () => page.evaluate(() => ({ pressed: document.querySelector('.atk button.atkN[aria-pressed="true"]')?.dataset.tone || null, shown: [...document.querySelectorAll('.atk .atkSet:not(.atkDup) a.atkItem')].map((a) => a.dataset.tone) }));
      // Tap the same count again: every alert comes back.
      await firstCount.click();
      await page.waitForTimeout(500);
      r.afterSecondTap = await state();
      // And the Show all alerts button does the same.
      await firstCount.click();
      await page.waitForTimeout(400);
      const showAll = page.locator('.atk .atkShowAll');
      r.showAllButton = await showAll.count();
      if (r.showAllButton) { await showAll.click(); await page.waitForTimeout(500); r.afterShowAll = await state(); }
    }
    // Lit headings: the day/date above the greeting, Home's section headings, the left rail's group names.
    r.heads = await page.evaluate(() => {
      const look = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { text: el.textContent.trim().slice(0, 40), color: cs.color, size: cs.fontSize, weight: cs.fontWeight, caps: cs.textTransform }; };
      const vis = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0);
      return { date: look(document.querySelector('.fh-date')), sections: vis('.fl-sec').slice(0, 4).map(look), rail: vis('.sg-nav-head').slice(0, 3).map(look) };
    });
    await page.screenshot({ path: path.join(OUT, `${name}-top.png`) });
    await page.screenshot({ path: path.join(OUT, `${name}-full.png`), fullPage: true });
    // A job page: the lit section menu across the top (desktop only).
    try {
      const d = await (await page.request.get(`${SITE}/api/projects?limit=50&fields=id,name`)).json();
      const jobs = d.projects || d.data || (Array.isArray(d) ? d : []);
      const job = jobs.find((j) => /Pima County Adult/i.test(j.name || '')) || jobs.find((j) => !/ZZ AUDIT/i.test(j.name || '')) || jobs[0];
      if (job) {
        await page.goto(`${SITE}/app/projects/${job.id}/budget`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
        r.jobNav = await page.evaluate(() => {
          const tabs = [...document.querySelectorAll('.pjx-tab')].filter((t) => t.getBoundingClientRect().width > 0);
          const act = document.querySelector('.pjx-tab[data-active]');
          return { tabs: tabs.map((t) => t.textContent.trim()), active: act?.textContent.trim() || null, activeBg: act ? getComputedStyle(act).backgroundColor : null, icons: document.querySelectorAll('.pjx-tab svg').length };
        });
        r.jobNav.cut = await page.evaluate(() => [...document.querySelectorAll('.pjx-tab')].filter((t) => { const b = t.getBoundingClientRect(); return b.width > 0 && (b.right > window.innerWidth + 0.5 || b.left < -0.5); }).map((t) => t.textContent.trim()));
        r.jobNav.backRows = await page.evaluate(() => ({ topBar: !!document.querySelector('.sag-tb-back'), jobBar: [...document.querySelectorAll('.pjx-back')].filter((e) => e.getBoundingClientRect().width > 0).length, jobBarShown: (() => { const b = document.querySelector('.pjx-bar'); return b ? getComputedStyle(b).display !== 'none' : false; })() }));
        await page.screenshot({ path: path.join(OUT, `${name}-job.png`) });
        // The job page's own section headings (Preconstruction, Coming up, …) and a SectionCard page.
        for (const [tag, sub] of [['overview', '/overview'], ['closeout', '/closeout']]) {
          await page.goto(`${SITE}/app/projects/${job.id}${sub}`, { waitUntil: 'networkidle' });
          await page.waitForTimeout(1500);
          r[`${tag}Heads`] = await page.evaluate(() => [...document.querySelectorAll('.fl-sec, .pmSecTitle, .k-card-title')].filter((e) => e.getBoundingClientRect().width > 0).slice(0, 8).map((e) => { const cs = getComputedStyle(e); return { text: e.textContent.trim().slice(0, 40), color: cs.color, size: cs.fontSize }; }));
          r[`${tag}OverflowX`] = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
          await page.screenshot({ path: path.join(OUT, `${name}-${tag}.png`) });
        }
      }
    } catch (e) { r.jobNavError = String(e.message || e).split('\n')[0]; }
  } catch (e) { r.error = String(e.message || e).split('\n')[0]; await page.screenshot({ path: path.join(OUT, `${name}-error.png`) }).catch(() => {}); }
  await browser.close();
  return r;
}
result.phone = await run('390', pw.webkit, { ...pw.devices['iPhone 15'] });
result.desktop = await run('1440', pw.chromium, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
// Chad's own desktop is about 1920 wide: Home should fill it.
result.wide = await run('1920', pw.chromium, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
fs.writeFileSync(path.join(OUT, 'home.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
