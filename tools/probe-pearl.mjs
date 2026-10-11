/**
 * tools/probe-pearl.mjs — is the text on live readable? For each key screen at
 * iPhone 390 (WebKit) and desktop 1440 (Chromium), counts visible text whose
 * colour is a dim grey (low saturation and darker than the pearl tertiary
 * #D2CDBF) and lists samples, and screenshots the screen. Read-only.
 * PEARL_LABEL (env or tools/probe-label.txt) tags the run ("before" / "after").
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
let LABEL = process.env.PEARL_LABEL || '';
try { LABEL = LABEL || fs.readFileSync(path.join(ROOT, 'tools/probe-label.txt'), 'utf8').trim(); } catch { /* none */ }
const JOB = 'ZZ AUDIT Walk Job 10101543';
const result = { site: SITE, label: LABEL || 'run', screens: {} };

async function login(page) {
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', process.env.E2E_EMAIL.trim());
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
  const d = await (await page.request.get(`${SITE}/api/projects?limit=200&fields=id,name`)).json();
  return d.projects || [];
}

/** Dim text on the page: visible text nodes whose colour is a grey darker than #D2CDBF. */
const measure = (page) => page.evaluate(() => {
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const PEARL3 = lum([0xd2, 0xcd, 0xbf]);
  const seen = new Set();
  let total = 0, dim = 0;
  const samples = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode;
    const text = (t.textContent || '').trim();
    if (text.length < 2) continue;
    const el = t.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.visibility === 'hidden' || cs.display === 'none' || r.width === 0 || r.height === 0 || Number(cs.opacity) === 0) continue;
    if (el.closest('[aria-hidden="true"], svg, input, textarea, select, option, button[disabled]')) continue;
    const m = cs.color.match(/\d+(\.\d+)?/g);
    if (!m) continue;
    const [R, G, B, A = 1] = m.map(Number);
    total++;
    const grey = Math.max(R, G, B) - Math.min(R, G, B) < 40;
    const effective = lum([R, G, B]) * A + 0.002 * (1 - A); // faded white over black reads darker
    if (grey && effective < PEARL3 * 0.85) {
      dim++;
      if (samples.length < 8) samples.push(`${text.slice(0, 40)} → ${cs.color}`);
    }
  }
  return { textNodes: total, dimText: dim, samples };
});

const screensFor = (jobId, portal) => [
  ['home', '/app'],
  ['job-overview', `/app/projects/${jobId}/overview`],
  ['bills', `/app/projects/${jobId}/bills`],
  ['selections', `/app/projects/${jobId}/selections`],
  ['schedule', `/app/projects/${jobId}/schedule`],
  ['leads', '/app/leads'],
  ...(portal ? [['client-portal', portal]] : []),
];

const desktop = await pw.chromium.launch();
const phoneBrowser = await pw.webkit.launch();
try {
  const gc = await (await desktop.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' })).newPage();
  const jobs = await login(gc);
  const job = jobs.find((j) => j.name === JOB) || jobs[0];
  // A client portal link for the ZZ AUDIT job (test inbox).
  const pr = await gc.request.post(`${SITE}/api/portal/client/create`, { data: { projectId: job.id, clientName: 'ZZ AUDIT Client', clientEmail: 'delivered@resend.dev' } });
  const token = (await pr.json().catch(() => ({}))).session?.token;
  const portal = token ? `/portals/client/${token}` : null;
  const phone = await (await phoneBrowser.newContext({ ...pw.devices['iPhone 15'], colorScheme: 'dark' })).newPage();
  await login(phone);
  for (const [name, url] of screensFor(job.id, portal)) {
    const row = {};
    for (const [w, page] of [['390', phone], ['1440', gc]]) {
      try {
        await page.goto(`${SITE}${url}`, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(1200);
        row[w] = await measure(page);
        await page.screenshot({ path: path.join(OUT, `${LABEL || 'run'}-${w}-${name}.png`), fullPage: w === '390' });
      } catch (e) { row[w] = { error: String(e.message || e).split('\n')[0] }; }
    }
    result.screens[name] = row;
    console.log(name, JSON.stringify(row));
  }
} catch (e) {
  result.error = String(e.message || e).split('\n')[0];
}
await desktop.close();
await phoneBrowser.close();
fs.writeFileSync(path.join(OUT, `pearl-${LABEL || 'run'}.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
