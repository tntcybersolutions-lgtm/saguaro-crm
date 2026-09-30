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
 * DYNAMIC ROUTES ARE SWEPT TOO. They used to be skipped — "with a clean tenant
 * there is no id to substitute" — which quietly excluded 61 of 140 routes, and
 * 58 of those are /app/projects/[projectId]/*. That is not a corner of the
 * product, that is the product: budget, pay apps, change orders, closeout,
 * takeoff, the whole job. The ids are now resolved from the signed-in tenant
 * through the app's OWN endpoints, so a route is only skipped when the tenant
 * genuinely has no such record, and it says so instead of staying silent.
 *
 * Every project route is swept against one project of EACH phase when the
 * tenant has both. A bidding job and a building job render different rails,
 * different empty states and different money, so one id is not a sweep.
 *
 *   node tools/e2e-app-sweep.mjs              report
 *   node tools/e2e-app-sweep.mjs --static     skip the dynamic routes
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
      out.push({ route: '/' + rel, file: p });
    }
  }
  return out;
}

/* WHY AN EMPTY <main> IS USUALLY NOT A BUG.
 *
 * This run reported 24 blank pages and every one of them was fine. Three
 * structures make a page render nothing on the SERVER while rendering
 * perfectly in a browser, and the sweep only ever sees the server's HTML:
 *
 *   useSearchParams() inside <Suspense>  Next 14 bails out of SSR for that
 *                                        subtree and ships only the fallback,
 *                                        so <main> arrives empty by design.
 *   an entitlement gate                  useFranchiseGate renders GateLoading
 *                                        until it has resolved client-side —
 *                                        the literal string "Loading…", which
 *                                        is the 8 characters all nineteen
 *                                        command-center routes reported.
 *   a redirect stub                      a legacy route that returns null and
 *                                        router.replace()s somewhere else.
 *
 * Reporting those as BLANK every run is worse than not checking: twenty-four
 * known-good rows is exactly the haystack a genuinely blank page hides in. So
 * read the page source and say WHICH of these it is. Anything blank that is
 * none of them stays in BLANK, and still fails the run.
 */
function ssrBlankReason(file) {
  let src = '';
  try { src = readFileSync(file, 'utf8'); } catch { return null; }
  if (/useFranchiseGate|GateLoading/.test(src)) return 'entitlement gate (renders "Loading…" until resolved client-side)';
  if (/useSearchParams/.test(src) && /Suspense/.test(src)) return 'useSearchParams inside Suspense (Next bails out of SSR)';
  if (/router\.(replace|push)\(/.test(src) && /return null/.test(src)) return 'redirect stub (returns null, navigates client-side)';
  return null;
}

const all = routes();
const dynamic = all.filter((r) => r.route.includes('['));
const testable = all.filter((r) => !r.route.includes('[')).sort((a, b) => a.route.localeCompare(b.route));

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
const authHeaders = { cookie, authorization: `Bearer ${auth.session.access_token}` };

/* ── Real ids for the dynamic routes ──────────────────────────────────────
   Resolved through the app's own endpoints rather than the database, so a
   broken list endpoint shows up here as "no records" instead of being papered
   over by a direct table read the product never makes. */
const api = async (path) => {
  try {
    const r = await fetch(BASE + path, { headers: authHeaders });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
};
const firstArray = (j) => {
  if (!j) return [];
  if (Array.isArray(j)) return j;
  const k = Object.keys(j).find((k) => Array.isArray(j[k]));
  return k ? j[k] : [];
};

let projects = [];
if (!process.argv.includes('--static')) {
  projects = firstArray(await api('/api/projects?limit=50'));
}
/* One job of each phase when we can tell them apart — a bidding job and a
   building job render different rails, different empty states and different
   money, so one id is not a sweep.
   /api/projects does not return `phase` (its select list has no such column),
   so grouping on it put every project in one bucket and swept exactly one —
   the bidding job, which is why the pay-app route found no record while a
   finished job with five of them sat right there. When phase is absent, take
   the first two projects instead of silently taking one. */
const seen = new Map();
for (const p of projects) {
  if (!p?.id) continue;
  const key = p.phase || `#${seen.size}`;
  if (!seen.has(key)) seen.set(key, p);
}
const sweepProjects = [...seen.values()].slice(0, 2);

/* [id] means a different record in each family. Each entry says where to get
   one and how to describe it when there are none. */
async function resolveId(route, projectId) {
  if (route.includes('/bid-packages/[id]')) return (firstArray(await api(`/api/bid-packages?projectId=${projectId}`))[0] || {}).id;
  if (route.includes('/pay-apps/[id]'))     return (firstArray(await api(`/api/pay-apps/list?projectId=${projectId}`))[0] || {}).id;
  if (route.startsWith('/app/daily-logs/')) return (firstArray(await api(`/api/daily-logs?projectId=${projectId}`))[0] || {}).id;
  if (route.startsWith('/app/invoicing/'))  return (firstArray(await api('/api/invoices/list')) [0] || {}).id;
  if (route.startsWith('/app/schedule/'))   return (firstArray(await api('/api/schedule/list'))[0] || {}).id;
  return undefined;
}

const expanded = [];      // { route, file, url, label }
const unresolved = [];    // { route, why }
for (const d of dynamic) {
  if (process.argv.includes('--static')) break;
  const needsProject = d.route.includes('[projectId]');
  const targets = needsProject ? sweepProjects : [null];
  if (needsProject && !targets.length) { unresolved.push({ route: d.route, why: 'tenant has no projects' }); continue; }

  for (const p of targets) {
    let url = d.route;
    if (p) url = url.replace('[projectId]', p.id);
    if (url.includes('[kind]')) url = url.replace('[kind]', 'subcontract'); // a real ContractKind
    if (url.includes('[id]')) {
      const id = await resolveId(d.route, p?.id);
      /* Name the project. Collapsed to the route alone this read as "pay-apps
         has no record", while a finished job with five of them had just been
         swept successfully — it was the OTHER project that had none. */
      if (!id) {
        unresolved.push({ route: d.route, why: p ? `no such record on ${p.name || p.id}` : 'no record of that kind in this tenant' });
        continue;
      }
      url = url.replace('[id]', id);
    }
    expanded.push({ route: d.route, file: d.file, url, label: p ? (p.phase || (p.name || p.id).slice(0, 18)) : '' });
  }
}

const targetsList = [
  ...testable.map((t) => ({ ...t, url: t.route, label: '' })),
  ...expanded,
];

console.log(`\nE2E APP SWEEP — ${testable.length} static + ${expanded.length} dynamic = ${targetsList.length} requests`);
console.log(`signed in as ${auth.user.email} against ${BASE}`);
if (sweepProjects.length) {
  console.log(`projects: ${sweepProjects.map((p) => `${p.name || p.id} (${p.phase || '?'})`).join('  ·  ')}`);
}
console.log('');

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
for (let i = 0; i < targetsList.length; i += CONCURRENCY) {
  const batch = targetsList.slice(i, i + CONCURRENCY);
  const done = await Promise.all(batch.map(async ({ route, file, url, label }) => {
    try {
      const r = await fetch(BASE + url, { headers: authHeaders, redirect: 'manual' });
      const html = r.status < 400 ? await r.text() : '';
      const marker = diagnose(html);
      // <main> with almost nothing in it is a blank screen, not a page.
      const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
      const textLen = main ? main[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length : -1;
      // Only ask WHY it is empty when it actually is — the answer is a read of
      // the page source, and it only means anything for an empty <main>.
      const reason = textLen >= 0 && textLen < 40 ? ssrBlankReason(file) : null;
      return { route, url, label, status: r.status, marker, textLen, reason, loc: r.headers.get('location') };
    } catch (e) {
      return { route, url, label, status: 'THREW', marker: String(e).slice(0, 120), textLen: -1, reason: null };
    }
  }));
  results.push(...done);
  process.stdout.write(`  ${results.length}/${targetsList.length}\r`);
}

const crashed  = results.filter((r) => r.status === 'THREW' || r.status >= 500);
const notFound = results.filter((r) => r.status === 404);
const errored  = results.filter((r) => r.status < 400 && r.marker);
const empty    = results.filter((r) => r.status < 400 && !r.marker && r.textLen >= 0 && r.textLen < 40);
const clientOnly = empty.filter((r) => r.reason);
const blank    = empty.filter((r) => !r.reason);
const redirect = results.filter((r) => r.status >= 300 && r.status < 400);
const good     = results.filter((r) => r.status < 300 && !r.marker && r.textLen >= 40);

const show = (label, rows, fmt) => {
  console.log(`\n${label}  ${rows.length}`);
  for (const r of rows) console.log('    ' + fmt(r));
};

/* Which project a dynamic row was driven against — a route that is fine on a
   building job and 500s on a bidding one is a real bug, and the phase is the
   first thing you need to reproduce it. */
const tag = (r) => (r.label ? `  [${r.label}]` : '');

console.log(`\nOK ${good.length} · redirect ${redirect.length} · 404 ${notFound.length} · error-page ${errored.length} · blank ${blank.length} · client-rendered ${clientOnly.length} · crashed ${crashed.length}`);
if (crashed.length)  show('CRASHED (5xx / threw)', crashed,  (r) => `${r.route}${tag(r)}  ${r.status}  ${r.marker || ''}`);
if (errored.length)  show('RENDERED AN ERROR PAGE', errored, (r) => `${r.route}${tag(r)}  → ${r.marker}`);
if (notFound.length) show('404', notFound,                   (r) => `${r.route}${tag(r)}  ${r.url}`);
if (blank.length)    show('BLANK (200, empty <main>, no reason it should be)', blank, (r) => `${r.route}${tag(r)}  chars=${r.textLen}`);
if (clientOnly.length) show('CLIENT-RENDERED (empty on the server BY DESIGN — needs eyes, not this tool)', clientOnly,
                            (r) => `${r.route.padEnd(50)}${tag(r).padEnd(12)} ${r.reason}`);
if (redirect.length) show('REDIRECTED', redirect,            (r) => `${r.route}${tag(r)}  ${r.status} → ${r.loc || '?'}`);
/* Not a failure — the tenant simply has no record of that kind. Said out loud
   so the gap in coverage is visible rather than silent, which is how 61 routes
   went unswept in the first place. */
if (unresolved.length) show('NOT SWEPT (no id to substitute)', unresolved, (r) => `${r.route.padEnd(50)} ${r.why}`);

const jsonIdx = process.argv.indexOf('--json');
if (jsonIdx > -1 && process.argv[jsonIdx + 1]) {
  writeFileSync(process.argv[jsonIdx + 1], JSON.stringify({ base: BASE, when: new Date().toISOString(), results }, null, 2));
  console.log(`\nwrote ${process.argv[jsonIdx + 1]}`);
}
console.log('');
/* A blank page with no structural reason to be blank is a failure now. It was
   not before, because twenty-four false positives meant the count could never
   be trusted enough to gate on. */
process.exitCode = crashed.length || errored.length || notFound.length || blank.length ? 1 : 0;
