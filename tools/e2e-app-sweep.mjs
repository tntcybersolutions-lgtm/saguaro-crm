/**
 * EVERY /app PAGE, DRIVEN AGAINST PRODUCTION AS A REAL SIGNED-IN USER.
 *
 * Written because I reported "pages render clean" after checking ten of them.
 * Ten is a sample, not a sweep, and the page the user opened next — /app/portals
 * — was not among them. This walks app/app for every page.tsx, requests each
 * route with a real session, and reports what actually came back.
 *
 * What it catches:
 *   5xx            a server crash, usually empty-data code doing rows[0].x
 *   404            a nav entry or link pointing at a route that does not exist
 *   RSC error      Next.js rendered its error boundary into the HTML
 *   empty shell    200 with no recognisable content, i.e. a blank screen
 *
 * What it cannot catch: layout, spacing, icon quality. Those need eyes.
 *
 *   node tools/e2e-app-sweep.mjs              report
 *   node tools/e2e-app-sweep.mjs --json out.json
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const BASE = process.env.SWEEP_BASE || 'https://saguarocontrol.net';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);

/* Every page.tsx under app/app, as a URL. Dynamic segments are skipped: with a
   clean tenant there is no id to substitute, and a fabricated one would only
   prove the 404 path works. */
function routes(dir = join(ROOT, 'app/app'), out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) routes(p, out);
    else if (e === 'page.tsx' || e === 'page.jsx') {
      const rel = relative(join(ROOT, 'app'), p).replace(/\\/g, '/').replace(/\/page\.(tsx|jsx)$/, '');
      out.push('/' + rel);
    }
  }
  return out;
}

const all = routes();
const dynamic = all.filter((r) => r.includes('['));
const testable = all.filter((r) => !r.includes('[')).sort();

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
  email: env.SAGUARO_QA_EMAIL,
  password: env.SAGUARO_QA_PASS,
});
if (authErr || !auth?.session) {
  console.log('SIGN-IN FAILED:', authErr?.message || 'no session');
  process.exit(1);
}
const cookie = `sb-access-token=${auth.session.access_token}; sb-refresh-token=${auth.session.refresh_token}`;
console.log(`\nE2E APP SWEEP — ${testable.length} static routes (${dynamic.length} dynamic skipped)`);
console.log(`signed in as ${auth.user.email} against ${BASE}\n`);

/* A crashed or missing page can still answer 200, because Next renders its
   error boundary into the HTML. But it is NOT enough to look for those strings
   anywhere in the document: Next ships the not-found boundary's own text inside
   the flight payload of EVERY page, so a whole-document substring match reports
   all 60 routes as missing — which is exactly what the first version of this
   did, and it was wrong about every single one.
 *
 * The <title> is the honest signal. Next's real 404 sets
 *   <title>404: This page could not be found.</title>
 * and a genuine runtime error boundary sets its own title too. */
function diagnose(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1].trim();
  if (/^404/.test(title) || /could not be found/i.test(title)) return 'not-found';
  if (/^(500|Application error|Internal Server Error)/i.test(title)) return 'error-page';
  return null;
}

const results = [];
const CONCURRENCY = 6;
for (let i = 0; i < testable.length; i += CONCURRENCY) {
  const batch = testable.slice(i, i + CONCURRENCY);
  const done = await Promise.all(batch.map(async (route) => {
    try {
      const r = await fetch(BASE + route, { headers: { cookie }, redirect: 'manual' });
      const html = r.status < 400 ? await r.text() : '';
      const marker = diagnose(html);
      // <main> with almost nothing in it is a blank screen, not a page.
      const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
      const textLen = main ? main[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length : -1;
      return { route, status: r.status, marker, textLen, loc: r.headers.get('location') };
    } catch (e) {
      return { route, status: 'THREW', marker: String(e).slice(0, 120), textLen: -1 };
    }
  }));
  results.push(...done);
  process.stdout.write(`  ${results.length}/${testable.length}\r`);
}

const crashed  = results.filter((r) => r.status === 'THREW' || r.status >= 500);
const notFound = results.filter((r) => r.status === 404);
const errored  = results.filter((r) => r.status < 400 && r.marker);
const blank    = results.filter((r) => r.status < 400 && !r.marker && r.textLen >= 0 && r.textLen < 40);
const redirect = results.filter((r) => r.status >= 300 && r.status < 400);
const good     = results.filter((r) => r.status < 300 && !r.marker && r.textLen >= 40);

const show = (label, rows, fmt) => {
  console.log(`\n${label}  ${rows.length}`);
  for (const r of rows) console.log('    ' + fmt(r));
};

console.log(`\nOK ${good.length} · redirect ${redirect.length} · 404 ${notFound.length} · error-page ${errored.length} · blank ${blank.length} · crashed ${crashed.length}`);
if (crashed.length)  show('CRASHED (5xx / threw)', crashed,  (r) => `${r.route}  ${r.status}  ${r.marker || ''}`);
if (errored.length)  show('RENDERED AN ERROR PAGE', errored, (r) => `${r.route}  → ${r.marker}`);
if (notFound.length) show('404', notFound,                   (r) => r.route);
if (blank.length)    show('BLANK (200 but no content)', blank, (r) => `${r.route}  chars=${r.textLen}`);
if (redirect.length) show('REDIRECTED', redirect,            (r) => `${r.route}  ${r.status} → ${r.loc || '?'}`);

const jsonIdx = process.argv.indexOf('--json');
if (jsonIdx > -1 && process.argv[jsonIdx + 1]) {
  writeFileSync(process.argv[jsonIdx + 1], JSON.stringify({ base: BASE, when: new Date().toISOString(), results }, null, 2));
  console.log(`\nwrote ${process.argv[jsonIdx + 1]}`);
}
console.log('');
process.exitCode = crashed.length || errored.length || notFound.length ? 1 : 0;
