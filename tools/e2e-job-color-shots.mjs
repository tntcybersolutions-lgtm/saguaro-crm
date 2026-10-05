#!/usr/bin/env node
/**
 * Job-colour evidence: the five places a job colour appears, at 390 and 1440,
 * with every job visible — the "Choose a Job" picker open, the dashboard, the
 * Projects list (cards + table), a project Overview (initials tile + sidebar
 * dot) and its Schedule (Gantt bars).
 *
 *   node tools/e2e-job-color-shots.mjs --base=http://localhost:3100 [--label=after]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const argv = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const BASE = String(argv.base || 'http://localhost:3100').replace(/\/$/, '');
const LABEL = String(argv.label || 'after');
const PROJECT_ID = String(argv.project || 'c64f209e-3bc5-4892-b058-89860a392cee');
const OUT = path.join(process.cwd(), 'docs', 'design', 'screenshots', 'job-colors', LABEL);
fs.mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: auth, error } = await sb.auth.signInWithPassword({ email: env.SAGUARO_QA_EMAIL, password: env.SAGUARO_QA_PASS });
if (error || !auth?.session) { console.error('SIGN-IN FAILED', error?.message); process.exit(1); }
const u = new URL(BASE); const secure = u.protocol === 'https:';
const cookies = [
  { name: 'sb-access-token', value: auth.session.access_token, domain: u.hostname, path: '/', httpOnly: true, secure, sameSite: 'Lax' },
  { name: 'sb-refresh-token', value: auth.session.refresh_token, domain: u.hostname, path: '/', httpOnly: true, secure, sameSite: 'Lax' },
];
const SHOTS = [
  { name: 'dashboard', url: '/app' },
  { name: 'projects-cards', url: '/app/projects' },
  { name: 'projects-table', url: '/app/projects?view=table', after: async (p) => { const b = p.getByRole('button', { name: 'Table' }); if (await b.count()) await b.first().click(); } },
  { name: 'project-overview', url: `/app/projects/${PROJECT_ID}/overview` },
  { name: 'project-schedule', url: `/app/projects/${PROJECT_ID}/schedule`, after: async (p) => { const g = p.getByRole('button', { name: 'Gantt' }); if (await g.count()) await g.first().click(); } },
  { name: 'job-picker-open', url: '/app/projects', after: async (p) => { const b = p.locator('[data-tour="project-picker"]'); if (await b.count()) await b.first().click(); await p.waitForTimeout(400); } },
  { name: 'my-work', url: '/app/my-work' },
  { name: 'company-schedule', url: '/app/schedule' },
];
const browser = await chromium.launch();
for (const vp of [{ name: '390', width: 390, height: 844, mobile: true }, { name: '1440', width: 1440, height: 900, mobile: false }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  for (const s of SHOTS) {
    try {
      await page.goto(BASE + s.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(800);
      if (s.after) await s.after(page).catch(() => {});
      await page.waitForTimeout(400);
      const file = path.join(OUT, `${vp.name}-${s.name}.png`);
      await page.screenshot({ path: file, fullPage: !s.name.includes('picker') });
      console.log(vp.name, s.name, 'ok', location(page));
    } catch (e) { console.log(vp.name, s.name, 'FAILED', String(e.message).slice(0, 80)); }
  }
  await ctx.close();
}
await browser.close();
function location(p) { try { return new URL(p.url()).pathname; } catch { return ''; } }
console.log('→', path.relative(process.cwd(), OUT));
