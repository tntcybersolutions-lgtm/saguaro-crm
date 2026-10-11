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
      await firstCount.click();
    }
    await page.screenshot({ path: path.join(OUT, `${name}-top.png`) });
    await page.screenshot({ path: path.join(OUT, `${name}-full.png`), fullPage: true });
  } catch (e) { r.error = String(e.message || e).split('\n')[0]; await page.screenshot({ path: path.join(OUT, `${name}-error.png`) }).catch(() => {}); }
  await browser.close();
  return r;
}
result.phone = await run('390', pw.webkit, { ...pw.devices['iPhone 15'] });
result.desktop = await run('1440', pw.chromium, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
fs.writeFileSync(path.join(OUT, 'home.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
