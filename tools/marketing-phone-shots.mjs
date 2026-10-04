/**
 * marketing-phone-shots.mjs — crisp 3x iPhone captures of the REAL phone app
 * for /get-the-app. Demo projects only (ZZ AUDIT …): no client names, no real
 * addresses, no real dollar amounts leave this script.
 *
 *   E2E_EMAIL=… E2E_PASSWORD=… node tools/marketing-phone-shots.mjs [baseUrl]
 *
 * Reads the two creds from the environment or from .env.local (never hardcode
 * them, never commit them). Signs in through the real /login form, then walks
 * SHOTS in an iPhone 15 Pro context (393 × 852 CSS px, DPR 3 → 1179 × 2556)
 * and writes public/marketing/phone-<key>.png. Run `node tools/webp.mjs` (or
 * `cwebp`) afterwards if you want .webp; PhoneFrame accepts either.
 *
 * Requires: npm i -D playwright && npx playwright install chromium
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.argv[2] || process.env.SHOT_BASE || 'https://www.saguarocontrol.net').replace(/\/$/, '');
const OUT = path.resolve('public/marketing');

function loadEnvLocal() {
  const p = path.resolve('.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnvLocal();
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Set E2E_EMAIL and E2E_PASSWORD in the environment or .env.local (never in the repo).');
  process.exit(2);
}

// Demo project only. Set DEMO_PROJECT_ID to another ZZ AUDIT job to switch.
const PROJECT = process.env.DEMO_PROJECT_ID || 'c64f209e-3bc5-4892-b058-89860a392cee'; // ZZ AUDIT 2 Fix Check
const SHOTS = [
  { key: 'project',       url: `/app/projects/${PROJECT}/overview`,      wait: 2500 },
  { key: 'daily-log',     url: `/app/projects/${PROJECT}/daily-logs`,    wait: 2500, open: 'Blank Log' },
  { key: 'change-orders', url: `/app/projects/${PROJECT}/change-orders`, wait: 2500 },
  { key: 'time-clock',    url: `/app/time`,                               wait: 2500 },
  { key: 'punch-list',    url: `/app/projects/${PROJECT}/punch-list`,    wait: 2500 },
  { key: 'takeoff',       url: `/app/projects/${PROJECT}/takeoff`,       wait: 3500 },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], colorScheme: 'dark', locale: 'en-US', timezoneId: 'America/Phoenix' });
const page = await ctx.newPage();

// Sign in through the real form — the same thing a person does.
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"], input[name="email"]', EMAIL);
await page.fill('input[type="password"], input[name="password"]', PASSWORD);
await Promise.all([
  page.waitForURL(/\/app/, { timeout: 30000 }),
  page.click('button[type="submit"], button:has-text("Sign in"), button:has-text("Sign In")'),
]);

fs.mkdirSync(OUT, { recursive: true });
for (const s of SHOTS) {
  await page.goto(`${BASE}${s.url}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(s.wait);
  // Nothing from the preview toolbar, and no scrollbars.
  await page.addStyleTag({ content: 'vercel-live-feedback, [data-vercel-toolbar] { display: none !important; } html { scrollbar-width: none; }' });
  if (s.open) {
    const btn = page.getByRole('button', { name: s.open }).first();
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(900); }
  }
  const file = path.join(OUT, `phone-${s.key}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('wrote', path.relative(process.cwd(), file));
}
await browser.close();
