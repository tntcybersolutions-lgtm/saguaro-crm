/**
 * EVERY API ROUTE, GRADED AGAINST THE STANDING ORDERS IN CLAUDE.md §3.
 *
 * The page audit only sees routes that a page happens to link to. An unguarded
 * endpoint nobody links to is still on the public internet, so this walks every
 * route.ts under app/api and checks the two rules that matter in a multi-tenant
 * app:
 *
 *   AUTH    getUser(req) / requireAuth() called before any db work
 *   TENANT  every .from(...) chain filtered by tenant_id
 *
 * Plus the forbidden patterns from §3:
 *   EMPTY CATCH    catch {} / catch { } — swallows failures as success
 *   CATCH RETURNS OK  returning 200/[] from inside a catch — masks errors
 *   BODY TENANT    tenant_id read from the request body instead of the session
 *
 * PUBLIC BY DESIGN: token-validated endpoints (portals, webhooks, cron, public
 * sign pages) legitimately have no session. They are listed separately rather
 * than counted as failures, so the number that matters stays honest.
 *
 *   node tools/audit-api-security.mjs            summary + failures
 *   node tools/audit-api-security.mjs --all      include passing routes
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const API = join(ROOT, 'app/api');
const SHOW_ALL = process.argv.includes('--all');

/* Deliberately public: validated by a token in the URL or a shared secret, not
   by a user session. Matched on the route path. Keep this list SHORT and
   justified — every entry is a route nobody has to log in to reach. */
const PUBLIC_BY_DESIGN = [
  /^portals?\//, /^bid-portal\//, /^sub-portal\//, /^owner-portal\//, /^design-portal\//,
  /^client-portal\/(session|login)/, /^webhooks?\//, /^stripe\/webhook/, /^cron\//,
  /^auth\//, /^unsubscribe$/, /^validate\//, /^network\/connect(\/|$)/, /^ics\//,
  /^signatures?\/(sign|verify)/, /^prequal\//, /^uploads\/public/,

  /* ── Each verified by reading the route on 24 Sep 2026, not assumed ──────
     bid-packages/portal        token in the URL identifies the invited bidder
     documents/sign/(complete|verify)
                                .eq('token', token) — the signing link IS the
                                credential; there is no session to have
     integrations/quickbooks/callback
                                OAuth redirect target; Intuit calls it, not a
                                logged-in user
     onboarding/trial-emails    protected by CRON_SECRET as a bearer token, and
                                fails CLOSED when the secret is unset. Flagged
                                only because this audit looks for getUser().
     roi/calculate              marketing calculator over the global roi_configs
     discovery/questions        global onboarding question catalog
     smart-packages             global design-package catalog — all 4 rows have
                                tenant_id IS NULL, and the query is now pinned
                                to that so a future private row cannot leak
     sandbox/[...path]          throwaway sandbox tenant, no real data      */
  /^bid-packages\/portal/, /^documents\/sign\//, /^integrations\/quickbooks\/callback/,
  /^onboarding\/trial-emails$/, /^roi\/calculate$/, /^discovery\/questions$/,
  /^smart-packages$/, /^sandbox\//,

  /* ── Verified on origin/main, 24 Sep 2026, by reading each route ────────
     fleet/ingest            per-tenant opaque ingest_token in body/header/query,
                             looked up in fleet_integrations; every write pinned
                             to THAT token's tenant_id. Unknown token -> 401.
     heatmap/approve         validates the same share token the read route uses,
                             then writes with .eq('tenant_id', row.tenant_id) —
                             tenant from the validated row, never the body.
     heatmap/share/[id],
     takeoff/share/[id],
     files/shared/[token],
     franchise/portal/[token],
     prequalification/portal/[token]
                             share/portal links where the token IS the credential
     storage/oauth/[provider]/callback
                             OAuth redirect target; the provider calls it
     customers/geo,
     design/styles,
     design/reimagine,
     smart-packages/customize-public
                             marketing surfaces over global catalogs
                             (roi_configs, design styles) — no tenant rows   */
  /^fleet\/ingest$/, /^heatmap\/(approve|share)\//, /^heatmap\/approve$/,
  /^takeoff\/share\//, /^files\/shared\//, /^franchise\/portal\//,
  /^prequalification\/portal\//, /^storage\/oauth\//,
  /^customers\/geo$/, /^design\/(styles|reimagine)$/,
  /^smart-packages\/customize-public$/,
];

/** Block and line comments out, so prose about a rule is never counted as the
 *  rule being followed — or broken. String contents are left alone: a table
 *  name or an .eq('tenant_id', …) literal is code and must still count. */
function stripComments(s) {
  const noBlock = s.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock
    .split('\n')
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, '$1'))
    .join('\n');
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e === 'route.ts' || e === 'route.tsx') out.push(p);
  }
  return out;
}

const files = walk(API);
const rows = [];

for (const f of files) {
  const rel = relative(API, f).replace(/\\/g, '/').replace(/\/route\.tsx?$/, '');
  const raw = readFileSync(f, 'utf8');

  /* COUNT CODE, NOT PROSE. The first version counted the literal string
     "tenant_id" anywhere in the file — including the doc comment explaining the
     tenant rule — so a route was graded PARTIAL TENANT (3/4) immediately after
     being correctly fixed, purely because its own comment named the column. An
     audit that flags a file for documenting itself is worse than no audit, so
     comments are stripped before anything is measured. */
  const src = stripComments(raw);

  const isPublic = PUBLIC_BY_DESIGN.some((re) => re.test(rel));

  /* CRON_SECRET / bearer-token guards count as auth. onboarding/trial-emails is
     protected by a bearer secret and fails closed when it is unset, but was
     graded NO AUTH because this only looked for getUser(). */
  /* EVERY GUARD THIS CODEBASE ACTUALLY USES.
     requirePermission(req, 'Projects', 'Edit') returns { ok, res, user } and is
     STRONGER than getUser — it checks identity AND permission. Omitting it
     graded 171 routes NO AUTH on origin/main when they were guarded better than
     the ones this tool was passing. Sixth false alarm from this instrument, and
     every one of them accused clean code. */
  const hasAuth = /getUser\s*\(|requireAuth\s*\(|requirePermission\s*\(|requireApiKey\s*\(|authenticateApiKey\s*\(|CRON_SECRET|authHeader/.test(src);
  // Does it touch the database at all? A route that only proxies has nothing to scope.
  /* DATABASE .from() ONLY.
     A bare /\.from\s*\(/ also matches Buffer.from(bytes), Array.from(x) and
     supabase.storage.from('bucket') — none of which are tenant-scoped tables.
     It graded photos, photos/upload, files/upload and reports/export as
     unscoped when every one of them was a storage bucket or a buffer, which
     inflated the failing count with routes that had nothing wrong.

     Storage paths DO still need a tenant prefix, but that is a different rule
     with a different fix, so it is not counted here as a missing SQL filter. */
  const DB_FROM = /(?<!Buffer|Array|Object)(?<!storage)\.from\s*\(\s*['"`]/g;
  const fromMatches = src.match(DB_FROM) || [];
  const touchesDb = fromMatches.length > 0;
  const fromCount = fromMatches.length;
  /* THE `tenants` TABLE IS KEYED BY `id`, NOT `tenant_id`.
     branding, branding/tenant and onboarding/complete all do
     `.from('tenants').eq('id', user.tenantId)` — correctly scoped — and were
     graded NO TENANT FILTER because the literal string never appears. Scoping
     by the tenant id counts however the column is spelled. */
  /* SCOPING BY THE SESSION'S user_id IS NARROWER THAN tenant_id, NOT WEAKER.
     A user belongs to exactly one tenant, so `.eq('user_id', user.id)` cannot
     return another tenant's rows — it returns a subset of one tenant's. It is
     the right scope for per-user data: dashboard layouts, a person's own
     notifications, presence. Counting it as unscoped flagged correct routes. */
  const tenantCount =
    (src.match(/tenant_id/g) || []).length +
    (src.match(/\.eq\s*\(\s*['"]id['"]\s*,\s*(user|auth)\.tenantId/g) || []).length +
    (src.match(/\.eq\s*\(\s*['"]user_id['"]\s*,\s*(user|auth|g\.user)\.id/g) || []).length;

  /* An empty catch is a bug per §3, and `catch {` with nothing but whitespace or
     a comment before `}` is the shape that keeps appearing in this codebase. */
  const emptyCatch = /catch\s*(\([^)]*\))?\s*\{\s*(\/\*[^*]*\*\/|\/\/[^\n]*\n\s*)?\}/.test(src);

  /* Returning a success body from inside a catch turns a 500 into "no records",
     which is how a broken screen looks like an empty one. */
  const catchReturnsOk = /catch[\s\S]{0,200}?NextResponse\.json\(\s*(\[\]|\{\s*(data|success)\s*:)/.test(src);

  /* SAME LINE ONLY. `\s*` spanned line breaks, so a comment ending with the
     words "never from the body." followed by `tenant_id:` on the next line
     matched this pattern — and safety/create was accused of the exact thing
     its own comment says it does not do. */
  const bodyTenant = /body[ 	]*\.[ 	]*tenant_id|body\[['"]tenant_id['"]\]/.test(src);

  const problems = [];
  if (!isPublic && !hasAuth && touchesDb) problems.push('NO AUTH');
  if (!isPublic && touchesDb && tenantCount === 0) problems.push('NO TENANT FILTER');
  if (!isPublic && touchesDb && tenantCount > 0 && tenantCount < fromCount) {
    problems.push(`PARTIAL TENANT (${tenantCount}/${fromCount})`);
  }
  if (emptyCatch) problems.push('EMPTY CATCH');
  if (catchReturnsOk) problems.push('CATCH RETURNS OK');
  if (bodyTenant) problems.push('TENANT FROM BODY');

  rows.push({ rel, isPublic, problems, fromCount, tenantCount });
}

const fails = rows.filter((r) => r.problems.length);
const pub = rows.filter((r) => r.isPublic);
const clean = rows.filter((r) => !r.problems.length && !r.isPublic);

console.log(`\nSAGUARO API SECURITY AUDIT — ${rows.length} routes under app/api\n`);

const byProblem = {};
for (const r of fails) for (const p of r.problems) byProblem[p.split(' (')[0]] = (byProblem[p.split(' (')[0]] || 0) + 1;

if (fails.length) {
  console.log('  FAILING ROUTES\n');
  for (const r of fails.sort((a, b) => a.rel.localeCompare(b.rel))) {
    console.log(`    ${r.rel.padEnd(52)} ${r.problems.join(' · ')}`);
  }
}

if (SHOW_ALL) {
  console.log('\n  PUBLIC BY DESIGN (token/secret validated, no session expected)\n');
  for (const r of pub.sort((a, b) => a.rel.localeCompare(b.rel))) console.log(`    ${r.rel}`);
  console.log('\n  CLEAN\n');
  for (const r of clean.sort((a, b) => a.rel.localeCompare(b.rel))) console.log(`    ${r.rel}`);
}

console.log('\n  ── totals ─────────────────────────────');
console.log(`  clean               ${clean.length}`);
console.log(`  public by design    ${pub.length}`);
console.log(`  FAILING             ${fails.length}`);
for (const [k, v] of Object.entries(byProblem).sort((a, b) => b[1] - a[1])) {
  console.log(`      ${k.padEnd(18)} ${v}`);
}
console.log('');

process.exitCode = fails.length ? 1 : 0;
