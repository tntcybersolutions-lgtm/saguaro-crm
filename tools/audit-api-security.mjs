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
/* --chains prints the offending query for every UNSCOPED finding, so a route
   can be judged without opening it. */
const SHOW_CHAINS = process.argv.includes('--chains');

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

/* NOT public, but legitimately NOT tenant-scoped. These sit behind a session
   AND a stronger gate than tenancy, over a table that has no tenant to scope
   to. Listed here with the evidence instead of left in the failing count,
   because a permanent "known 3" trains everyone to ignore the number.

   platform/integrations, platform/integrations/[app]
     Platform-owner screens for the OAuth app registrations Saguaro itself
     holds (Microsoft, Dropbox, Google) — one row per provider for the whole
     product, not per customer. Gated by isPlatformAdmin(user.email) against
     PLATFORM_ADMIN_EMAILS, which is a narrower gate than any tenant check.
     VERIFIED on production 24 Sep 2026: platform_integrations has columns
     app, client_id, secret_enc, enabled, updated_by, updated_at, created_at —
     there is no tenant_id column to filter on. */
const TENANT_EXEMPT = [
  /^platform\/integrations(\/|$)/,
];

/* ── THE SCHEMA, NOT A GUESS ────────────────────────────────────────────────
   Every public BASE TABLE that has NO tenant_id column, queried from the
   production database on 24 Sep 2026:

     SELECT t.table_name FROM information_schema.tables t
     WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
                       WHERE c.table_schema='public'
                         AND c.table_name=t.table_name
                         AND c.column_name='tenant_id')
     ORDER BY 1;

   This is the difference between an audit and a vibe. "PARTIAL TENANT (3/4)"
   counted the string tenant_id against the number of .from() calls, so a route
   that correctly joined pay_application_lines — a table with no tenant_id to
   filter on — was graded as if it had forgotten one. 105 routes carried that
   grade and most of them were right.

   Re-run the query above when the schema changes. A table missing from this
   list is treated as tenant-scoped, which fails toward flagging, not toward
   silence — the safe direction for an instrument that has been wrong ten
   times already. */
const NO_TENANT_COLUMN = new Set([
  'admin_access_log', 'ai_pricing', 'climate_recommendations', 'daily_log_crew',
  'daily_log_photos', 'daily_log_weather', 'design_comparison_variants',
  'design_contractor_leads', 'design_room_package_items', 'design_saved_gallery',
  'design_style_presets', 'design_style_swipes', 'documents', 'email_verifications',
  'network_site_templates', 'password_resets', 'pay_application_lines', 'plans',
  'platform_admins', 'platform_integrations', 'portal_sub_bid_line_items',
  'portal_sub_bid_responses', 'portal_sub_pay_app_line_items',
  'prevailing_wage_rates', 'proposal_lines', 'referrals', 'roi_configs',
  'selection_options', 'storage_pricing', 'subscription_plans', 'support_plans',
  'support_ticket_messages', 'takeoff_blueprints', 'takeoff_cost_items',
  'takeoff_trials', 'tenants', 'user_pricing_tiers', 'webhook_deliveries',
]);

/* `tenants` is keyed by `id`, so scoping it reads .eq('id', user.tenantId) and
   the literal column name never appears. It is in the set above for that
   reason — the per-chain check below still recognizes the id form. */

/**
 * Walk forward from a `.from(` to the end of ITS query chain.
 *
 * Counting occurrences file-wide cannot tell which .from() the tenant filter
 * belongs to: a route with four queries and four tenant_id mentions scores 4/4
 * even if all four sit on one query and the other three are wide open. The
 * chain is what has to be scoped, so the chain is what gets read.
 *
 * Stops at the first `;` or `,` outside any bracket, or when the enclosing
 * call closes — the three ways a Supabase chain ends in this codebase
 * (statement, Promise.all element, helper argument).
 */
function chainAfter(src, startIndex) {
  let depth = 0;
  for (let i = startIndex; i < src.length && i < startIndex + 1500; i++) {
    const ch = src[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth < 0) return src.slice(startIndex, i);
    } else if (depth === 0 && (ch === ';' || ch === ',')) {
      return src.slice(startIndex, i);
    }
  }
  return src.slice(startIndex, startIndex + 1500);
}

/** Is THIS chain scoped to the caller's tenant (or narrower)? */
function chainIsScoped(chain) {
  return (
    /tenant_id/.test(chain) ||                                            // .eq/.or/.in/.match/.insert
    /\.eq\s*\(\s*['"]id['"]\s*,\s*((user|auth|g\.user)\.)?tenantId/.test(chain) ||  // the tenants table
    /\.eq\s*\(\s*['"]user_id['"]\s*,\s*(user|auth|g\.user)\.id/.test(chain) ||     // narrower than tenant
    /* profiles.id IS the auth user id, so `.eq('id', user.id)` is the single
       tightest scope there is — one row, the caller's own. audit-trail/log was
       flagged for reading its own user's display name. */
    /\.eq\s*\(\s*['"]id['"]\s*,\s*(user|auth|g\.user)\.id\b/.test(chain)
  );
}

/**
 * Which tables did this route prove it owns?
 *
 *     .from('takeoffs').select('id').eq('id', takeoffId).eq('tenant_id', user.tenantId)
 *     ...
 *     .from('takeoff_materials').select('*').eq('takeoff_id', takeoffId)   // no tenant filter
 *
 * The materials query has no tenant filter and does not need one to be correct
 * TODAY: the takeoff was already proven to be the caller's, and a material
 * hangs off the takeoff. Calling that a live cross-tenant hole would be false,
 * and a report that cries wolf on correct routes buries the ones that are not.
 *
 * It is still worth fixing — the child query is one refactor away from being
 * wrong, and nothing in it says it depends on a check twenty lines up — so
 * these are reported as PARENT-GATED: real work, different urgency.
 *
 * Originally this only knew about `projects`, which meant the entire takeoff
 * module — where the parent is `takeoffs` and the check lives in a
 * getScopedTakeoff() helper — was reported as live holes. Parentage is not a
 * projects-only idea, so it is no longer hardcoded to one table.
 */
function verifiedParents(src) {
  const owned = new Set();
  for (const m of src.matchAll(/\.from\s*\(\s*['"`]([A-Za-z0-9_]+)['"`]\s*\)/g)) {
    const chain = chainAfter(src, m.index);
    if (/tenant_id/.test(chain)) owned.add(m[1]);
  }
  /* requirePermission(..., { projectId }) has verified project ownership
     centrally since the fix in lib/permissions.ts. */
  if (/requirePermission\s*\([^;]{0,200}?projectId/.test(src)) owned.add('projects');
  return owned;
}

/**
 * Is this chain narrowed to one row of a parent whose ownership was proven?
 * `.eq('takeoff_id', …)` points at `takeoffs`; `.eq('project_id', …)` at
 * `projects`. Both the plural and singular spellings are accepted because this
 * codebase uses both (`punch_list`, `projects`).
 */
function parentGatedBy(chain, owned) {
  for (const m of chain.matchAll(/\.eq\s*\(\s*['"]([a-z0-9_]+)_id['"]/g)) {
    const base = m[1];
    if (owned.has(`${base}s`)) return `${base}s`;
    if (owned.has(base)) return base;
  }
  return null;
}

/**
 * SELECT-THEN-WRITE: an id that came from a tenant-scoped read.
 *
 *     const { data: existing } = await db.from('integrations')
 *       .select('id').eq('provider','quickbooks').eq('tenant_id', user.tenantId).maybeSingle();
 *     if (existing) await db.from('integrations').update(row).eq('id', existing.id);
 *
 * The update names no tenant, and does not have to: the id it writes to was
 * just proven to be the caller's. This is how this codebase does a tenant-safe
 * upsert, deliberately, instead of a global onConflict — the comment on the
 * quickbooks route says so out loud. Flagging it would condemn the correct
 * pattern and push people toward the wrong one.
 *
 * Proof is required, never assumed: the binding read must ITSELF be
 * tenant-scoped. An id from an unscoped read buys nothing and is still
 * reported.
 */
function idFromScopedRead(src, chainStart, chain) {
  const m = chain.match(/\.eq\s*\(\s*['"]id['"]\s*,\s*\(?\s*([A-Za-z_$][\w$]*)\s*(?:as\b|\)|\.)/);
  if (!m) return false;
  const v = m[1];
  /* Straight off the request is exactly what this rule must never excuse. */
  if (/^(user|auth|params|body|req|input|searchParams)$/.test(v)) return false;

  const before = src.slice(Math.max(0, chainStart - 4000), chainStart);
  /* Plain string search, deliberately. Building this pattern dynamically meant
     writing a regex inside a JS string, and every escape in it was eaten by
     the string layer before RegExp saw it — the check matched nothing, silently,
     and passed zero routes for two runs while reporting a healthy-looking
     number. These are the only four spellings this codebase uses to bind a row. */
  const last = Math.max(
    before.lastIndexOf('data: ' + v),
    before.lastIndexOf('data:' + v),
    before.lastIndexOf('const ' + v),
    before.lastIndexOf('let ' + v),
  );
  if (last < 0) return false;
  return /tenant_id/.test(before.slice(last, last + 500));
}

/**
 * An insert whose payload is a variable.
 *
 *     const vlanRows = plan.vlans.map(v => ({ tenant_id: user.tenantId, … }));
 *     await db.from('network_vlans').insert(vlanRows);
 *
 * The chain shows `.insert(vlanRows)` and nothing else — the tenant_id is in
 * the row builder above it. Reading only the chain would accuse every bulk
 * insert in the codebase, so the nearest place the variable was built gets
 * read too. Returns null when the payload is an inline object (the chain
 * already told us), true/false otherwise.
 */
function insertPayloadHasTenant(src, chainStart, chain) {
  const m = chain.match(/\.(?:insert|upsert)\s*\(\s*([A-Za-z_$][\w$]*)/);
  if (!m) return null;
  const v = m[1].replace(/[$]/g, '\\$');
  const before = src.slice(Math.max(0, chainStart - 4000), chainStart);
  const re = new RegExp(`(?:const|let|var)\\s+${v}\\b|\\b${v}\\s*=[^=]|\\b${v}\\.push\\s*\\(`, 'g');
  let last = -1, hit;
  while ((hit = re.exec(before)) !== null) last = hit.index;
  if (last < 0) return false;                    // built somewhere we cannot see
  return /tenant_id/.test(before.slice(last, last + 1400));
}

/* A STORAGE BUCKET IS NOT A TABLE. `.from(BUCKET).upload(...)` reads as a
   .from() call with a variable name, and a bucket has no tenant_id to filter
   on — the tenant lives in the object PATH, which is a different rule. The
   `(?<!storage)` lookbehind below only catches the literal `storage.from(`
   spelling; routes that hold the client in a local miss it. The methods are
   unambiguous, so the chain says what it is. */
const STORAGE_METHOD = /\.(upload|download|createSignedUrls?|getPublicUrl|remove|move|copy|createBucket)\s*\(/;

/**
 * Follow a query builder that is scoped on a LATER line.
 *
 *     let q = db.from('catalog_items').update({...}).eq('id', item.id);
 *     q = item.tenant_id == null ? q.is('tenant_id', null) : q.eq('tenant_id', …);
 *
 * The chain ends at the semicolon, so the tenant filter is out of reach of the
 * chain reader and the query gets called unscoped when it is not. Conditional
 * filters are how half this codebase builds a query, so a rule that cannot see
 * them is a rule that flags correct code — the failure this instrument keeps
 * repeating. Given the assigned variable, the rest of the function is checked
 * for a tenant scope applied to it.
 */
function builderIsScopedLater(src, chainEndIndex, varName) {
  if (!varName) return false;
  const rest = src.slice(chainEndIndex, chainEndIndex + 3000);
  const v = varName.replace(/[$]/g, '\\$');
  return new RegExp(
    `\\b${v}\\s*(?:=[^;\\n]*)?\\.(?:eq|or|in|is|match|filter|not)\\s*\\([^)]*tenant_id`
  ).test(rest) || new RegExp(`\\b${v}\\b[^;\\n]{0,200}tenant_id`).test(rest);
}

/** The `const`/`let` name a .from() chain is being assigned to, if any. */
function assignedVarBefore(src, fromIndex) {
  const before = src.slice(Math.max(0, fromIndex - 120), fromIndex);
  const m = before.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^=;]{0,60}$/);
  return m ? m[1] : null;
}

/** Block and line comments out, so prose about a rule is never counted as the
 *  rule being followed — or broken. String contents are left alone: a table
 *  name or an .eq('tenant_id', …) literal is code and must still count. */
function stripComments(s) {
  const noBlock = s.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock
    /* SPLIT ON CRLF TOO. Every file in this repo has Windows line endings, so
       splitting on '\n' alone left a '\r' at the end of every line — and `$`
       without the m flag will not match before a carriage return. The replace
       matched nothing. This function has been returning its input unchanged
       since the day it was written, which means the "count code, not prose"
       fix it exists to provide was never actually in effect: a comment
       mentioning tenant_id has been scoring as a tenant filter this whole
       time, and a comment sitting mid-chain has been truncating the chain.
       It got the number wrong in BOTH directions. */
    .split(/\r?\n/)
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
  /* Table name captured, and the match index kept, so each chain can be read
     on its own rather than the file being scored in aggregate. An unquoted
     .from(table) — export-pdf resolves its table from a whitelist — has no
     name to look up, so it is never exempted; the chain must scope itself. */
  const DB_FROM = /(?<!Buffer|Array|Object)(?<!storage)\.from\s*\(\s*(?:['"`]([A-Za-z0-9_]+)['"`]|([A-Za-z_$][\w$]*))\s*\)/g;
  const chains = [];
  for (const m of src.matchAll(DB_FROM)) {
    const chain = chainAfter(src, m.index);
    if (STORAGE_METHOD.test(chain)) continue;   // a bucket, not a table
    chains.push({
      table: m[1] ?? null,
      chain,
      varName: assignedVarBefore(src, m.index),
      startIndex: m.index,
      endIndex: m.index + chain.length,
    });
  }
  const touchesDb = chains.length > 0;
  const fromCount = chains.length;

  /* A table with no tenant_id column cannot carry a tenant filter. Those are
     scoped by a parent id (pay_application_lines by pay_application_id) or are
     global reference data (subscription_plans) — a different rule, not this
     one, and a rule no regex settles. They are reported separately so they
     stay visible instead of being silently forgiven. */
  const unscoped = [];
  const noColumn = [];
  const evidence = [];
  const projectGated = [];
  const owned = verifiedParents(src);
  for (const { table, chain, varName, startIndex, endIndex } of chains) {
    if (chainIsScoped(chain)) continue;
    if (builderIsScopedLater(src, endIndex, varName)) continue;
    const payload = insertPayloadHasTenant(src, startIndex, chain);
    if (payload === true) continue;
    if (idFromScopedRead(src, startIndex, chain)) continue;
    if (table && NO_TENANT_COLUMN.has(table)) noColumn.push(table);
    else if (parentGatedBy(chain, owned)) projectGated.push(table || '(dynamic)');
    else {
      unscoped.push(table || '(dynamic)');
      /* The chain itself, collapsed to one line. A finding you have to go
         hunting for is a finding that gets skipped. */
      evidence.push(chain.replace(/\s+/g, ' ').trim().slice(0, 190));
    }
  }
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
  /* A ROUTE MAY HOLD THE TENANT ID IN A LOCAL. onboarding/company does
     `const tenantId = user.tenantId` and then `.eq('id', tenantId)` — correctly
     scoped, and graded NO TENANT FILTER because the pattern insisted on the
     `user.` prefix at the call site. Tenth false alarm from this instrument;
     like the other nine, it accused code that was already right. */
  const tenantCount =
    (src.match(/tenant_id/g) || []).length +
    (src.match(/\.eq\s*\(\s*['"]id['"]\s*,\s*((user|auth)\.)?tenantId/g) || []).length +
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

  const tenantExempt = TENANT_EXEMPT.some((re) => re.test(rel));

  const problems = [];
  if (!isPublic && !hasAuth && touchesDb) problems.push('NO AUTH');
  if (!isPublic && !tenantExempt && unscoped.length) {
    /* Named, not counted. "PARTIAL TENANT (3/4)" told you a number and left you
       to find which query it meant; the table name is the whole job. */
    const names = Array.from(new Set(unscoped)).sort();
    problems.push(`UNSCOPED: ${names.join(', ')}`);
  }
  if (emptyCatch) problems.push('EMPTY CATCH');
  if (catchReturnsOk) problems.push('CATCH RETURNS OK');
  if (bodyTenant) problems.push('TENANT FROM BODY');
  if (!isPublic && !tenantExempt && projectGated.length) {
    const names = Array.from(new Set(projectGated)).sort();
    problems.push(`PARENT-GATED: ${names.join(', ')}`);
  }

  rows.push({ rel, isPublic, problems, fromCount, evidence, noColumn: Array.from(new Set(noColumn)).sort() });
}

const fails = rows.filter((r) => r.problems.length);
const pub = rows.filter((r) => r.isPublic);
const clean = rows.filter((r) => !r.problems.length && !r.isPublic);

console.log(`\nSAGUARO API SECURITY AUDIT — ${rows.length} routes under app/api\n`);

const byProblem = {};
for (const r of fails) for (const p of r.problems) {
  const key = p.startsWith('UNSCOPED') ? 'UNSCOPED TABLE'
    : p.startsWith('PARENT-GATED') ? 'PARENT-GATED' : p.split(' (')[0];
  byProblem[key] = (byProblem[key] || 0) + 1;
}

/* Routes reading a table that HAS no tenant_id. Not a failure of this rule —
   they are scoped by a parent id or are global reference data — but listed so
   the second rule (is the parent itself tenant-checked?) has a work list
   instead of being forgotten because the first rule went quiet. */
const parentScoped = rows.filter((r) => !r.isPublic && r.noColumn.length);

if (fails.length) {
  console.log('  FAILING ROUTES\n');
  for (const r of fails.sort((a, b) => a.rel.localeCompare(b.rel))) {
    console.log(`    ${r.rel.padEnd(52)} ${r.problems.join(' · ')}`);
    if (SHOW_CHAINS) for (const e of r.evidence) console.log(`        ↳ ${e}`);
  }
}

if (SHOW_ALL) {
  console.log('\n  PUBLIC BY DESIGN (token/secret validated, no session expected)\n');
  for (const r of pub.sort((a, b) => a.rel.localeCompare(b.rel))) console.log(`    ${r.rel}`);
  console.log('\n  CLEAN\n');
  for (const r of clean.sort((a, b) => a.rel.localeCompare(b.rel))) console.log(`    ${r.rel}`);
}

if (SHOW_ALL && parentScoped.length) {
  console.log('\n  PARENT-SCOPED / GLOBAL (table has no tenant_id column — verify the parent)\n');
  for (const r of parentScoped.sort((a, b) => a.rel.localeCompare(b.rel))) {
    console.log(`    ${r.rel.padEnd(52)} ${r.noColumn.join(', ')}`);
  }
}

console.log('\n  ── totals ─────────────────────────────');
console.log(`  clean               ${clean.length}`);
console.log(`  public by design    ${pub.length}`);
console.log(`  parent-scoped       ${parentScoped.length}  (no tenant_id column; --all to list)`);
console.log(`  FAILING             ${fails.length}`);
for (const [k, v] of Object.entries(byProblem).sort((a, b) => b[1] - a[1])) {
  console.log(`      ${k.padEnd(18)} ${v}`);
}
console.log('');

process.exitCode = fails.length ? 1 : 0;
