/**
 * tools/qa-crawl.mjs — in-sandbox automated screen crawl.
 *
 * Runs against a LOCAL dev server (http://localhost:3000) started with
 * NEXT_PUBLIC_DEMO_MODE=true so the auth wall is down and every /app screen is
 * reachable. Supabase is unreachable from the sandbox, so data/login calls
 * fail — this crawl therefore catches the DB-independent defects:
 *   • pages that crash / show the Next error overlay (render bugs)
 *   • console errors on load
 *   • DEAD BUTTONS: a <button> whose click changes nothing (no URL change, no
 *     DOM mutation, no network request) — the "buttons don't work" complaint
 *   • navigation that 404s
 *
 * Output: a Markdown findings block on stdout (paste/append into
 * docs/IOS-FLOW-AUDIT.md). Not a pass/fail gate — a finder.
 *
 * Run:  node tools/qa-crawl.mjs   (after: npm i -D playwright; dev server up)
 */
import { chromium } from 'playwright';

const BASE = process.env.QA_BASE || 'http://localhost:3000';
const ROUTES = [
  '/app', '/app/sales', '/app/leads', '/app/customers', '/app/bids',
  '/app/projects', '/app/documents', '/app/reviews', '/app/people',
  '/app/time', '/app/daily-logs', '/app/invoicing', '/app/billing',
  '/app/subs', '/app/compliance', '/app/schedule', '/app/takeoff',
];

const findings = [];
const add = (screen, kind, detail) => findings.push({ screen, kind, detail });

const run = async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // iPhone-ish
  const page = await ctx.newPage();

  // QA_STUB=1: answer every /api/** with a clean empty 200 so there is no
  // failed-fetch retry storm. Without this, a DB-less run (sandbox/CI) drowns
  // in 500s and spurious "Maximum update depth" warnings that are retry
  // artifacts, not real bugs. With it, render + dead-button signal is clean
  // even when no database is reachable. (Use a real DB for data/flow truth.)
  if (process.env.QA_STUB === '1') {
    await page.route('**/api/**', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: '{"ok":true,"data":[],"leads":[],"reviews":[],"projects":[],"documents":[],"media":[],"activities":[],"avgRating":null}',
    }));
  }

  for (const route of ROUTES) {
    const url = BASE + route;
    const consoleErrors = [];
    page.removeAllListeners('console');
    // Ignore the sandbox's blocked-DB noise; keep real code bugs (React
    // warnings, uncaught exceptions, hydration errors).
    const NOISE = /failed to load resource|status of 50[0-9]|supabase|websocket|establishing a tunnel|net::ERR|ERR_|realtime/i;
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (NOISE.test(t)) return;
      consoleErrors.push(t.slice(0, 220));
    });
    page.on('pageerror', (e) => consoleErrors.push('UNCAUGHT: ' + String(e).slice(0, 220)));

    let status = 0;
    try {
      // domcontentloaded, NOT networkidle: pages retry the (sandbox-blocked)
      // Supabase calls forever, so networkidle never fires. We care about render
      // + client wiring, which is ready after DOM + a short settle.
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      status = resp ? resp.status() : 0;
      await page.waitForTimeout(1800);
    } catch (e) {
      add(route, 'load-failed', String(e).slice(0, 160));
      continue;
    }
    if (status >= 400) add(route, 'http-' + status, `page returned ${status}`);

    // Next.js error overlay = a render crash.
    const crashed = await page.locator('nextjs-portal, #__next-error, [data-nextjs-dialog]').count().catch(() => 0);
    if (crashed) add(route, 'render-crash', 'Next error overlay present');

    for (const e of consoleErrors.slice(0, 5)) add(route, 'console-error', e);

    // Horizontal overflow at phone width = a responsive break (the page does
    // not auto-fit). Report the widest offending element so it is fixable.
    const overflow = await page.evaluate(() => {
      const de = document.documentElement;
      const w = window.innerWidth;
      if (de.scrollWidth <= w + 2) return null;
      let worst = null, worstW = 0;
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const r = el.getBoundingClientRect();
        if (r.right > w + 2 && r.width > worstW && r.width <= de.scrollWidth + 1) {
          worstW = Math.round(r.width);
          const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
          worst = (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls).slice(0, 90);
        }
      }
      return { scrollWidth: de.scrollWidth, innerWidth: w, worst };
    }).catch(() => null);
    if (overflow) add(route, 'mobile-overflow', `${overflow.scrollWidth}px wide at ${overflow.innerWidth}px — widest offender: ${overflow.worst || 'unknown'}`);

    // Dead-button check: click each visible, enabled button; flag no-ops.
    const buttons = await page.locator('button:visible:not([disabled])').all().catch(() => []);
    let idx = 0;
    for (const b of buttons.slice(0, 25)) {
      idx++;
      let label = (await b.innerText().catch(() => ''))?.trim().slice(0, 40) || `button#${idx}`;
      const beforeUrl = page.url();
      const beforeDom = await page.evaluate(() => document.body.innerHTML.length).catch(() => 0);
      let fired = false;
      const onReq = () => { fired = true; };
      page.on('request', onReq);
      try {
        await b.click({ timeout: 1500, trial: false });
        await page.waitForTimeout(350);
      } catch { /* not clickable / overlapped */ }
      page.off('request', onReq);
      const afterUrl = page.url();
      const afterDom = await page.evaluate(() => document.body.innerHTML.length).catch(() => 0);
      const changed = fired || afterUrl !== beforeUrl || Math.abs(afterDom - beforeDom) > 40;
      if (!changed) add(route, 'dead-button', `"${label}" — click did nothing (no nav / DOM / request)`);
      if (afterUrl !== beforeUrl) { await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {}); }
    }
  }

  await browser.close();

  // Report
  const byScreen = {};
  for (const f of findings) (byScreen[f.screen] ||= []).push(f);
  let out = `\n## Automated crawl findings (${new Date().toISOString().slice(0, 10)})\n`;
  out += `_In-sandbox crawl, DB offline (Supabase unreachable) — DB-independent defects only._\n\n`;
  if (findings.length === 0) out += 'No DB-independent defects found on the crawled routes.\n';
  for (const [screen, fs] of Object.entries(byScreen)) {
    out += `### ${screen}\n`;
    for (const f of fs) out += `- **${f.kind}**: ${f.detail}\n`;
    out += '\n';
  }
  console.log(out);
};

run().catch((e) => { console.error('crawl failed:', e); process.exit(1); });
