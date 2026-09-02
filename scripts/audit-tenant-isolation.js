#!/usr/bin/env node
/**
 * audit-tenant-isolation — does every API route prove who is asking, and does
 * every query it runs stay inside that tenant?
 *
 * This matters more than RLS here. Almost every route uses createServerClient(),
 * which is the SERVICE ROLE key: it bypasses row-level security entirely. RLS
 * being on across all 456 tables protects the anon key, not these routes. The
 * only thing standing between one tenant and another's data is the code writing
 * .eq('tenant_id', …) on every single query. So that is what gets counted.
 *
 * Two checks per route file:
 *   1. AUTH  — does it call getUser() or requirePermission() before touching
 *              the database?
 *   2. SCOPE — does every .from(table) that can carry a tenant also filter on
 *              one, or on a column the route has already proven belongs to the
 *              caller?
 *
 * Findings are ranked. A route that reads with no tenant filter leaks; a route
 * that WRITES with no tenant filter lets one tenant modify another's rows,
 * which is worse. Public-by-design routes (token portals, webhooks, cron) are
 * recognised and listed separately rather than counted as failures — they are
 * reviewed by hand.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || 'app/api';

/* Routes that are public on purpose. Each is listed in the report so the set
   stays visible and small, rather than quietly growing. */
const PUBLIC_BY_DESIGN = [
  /\/api\/health/, /\/api\/cron\//, /\/api\/webhooks?\//, /\/api\/stripe\//,
  /\/api\/portals?\//, /\/api\/public\//, /\/api\/auth\//, /\/api\/waitlist/,
  /\/api\/contact/, /\/api\/demo-request/, /\/api\/sign\//, /\/api\/share\//,
  /\/api\/shared\//, /\/api\/network\/connect\//, /\/api\/documents\/sign\//,
  /\/api\/w9\//, /\/api\/prequal\//, /\/api\/og\//, /\/api\/sitemap/,
];

/* Sites reviewed by hand and found safe, where the proof is in a shape the
   rules below cannot see. Each entry says why. Kept as an explicit list rather
   than by loosening a rule, because every loosening also hides real holes — the
   handler-boundary fix below was added after a widened window let a GET's
   tenant check vouch for an unguarded POST in the same file.
   Recheck an entry whenever its route changes. */
const REVIEWED_SAFE = new Map([
  ['app/api/catalog/image/route.ts',
   'catalog_items is a shared global reference set (tenant_id IS NULL by design); gated by requirePermission(Projects, Full)'],
  ['app/api/platform/integrations/[app]/route.ts',
   'platform_integrations has no tenant_id column — platform-level config, not tenant data'],
  ['app/api/signatures/route.ts',
   'PATCH is the public e-sign endpoint: requestId is the bearer token from the emailed link, tenant_id is taken from the stored record, replay blocked by the signed check. External signers have no account'],
  ['app/api/projects/[projectId]/photos/link/route.ts',
   'ownsPhoto() checks .eq(tenant_id) and the handler 404s on failure — proof lives in a closure'],
  ['app/api/projects/[projectId]/photos/route.ts',
   'tags and entity links hang off a photo inserted with tenant_id in the same handler'],
  ['app/api/projects/[projectId]/correspondence/[id]/route.ts',
   'parent correspondence fetched with .eq(tenant_id) before the receipt write'],
  ['app/api/takeoff/[id]/analyze/route.ts',
   'takeoffId proved against tenant_id at the top of the handler; material rows carry tenant_id. payload <- batch <- items is more hops than the resolver follows'],
]);

/* Tables with no tenant column — global reference data, or scoped some other
   way. A missing tenant filter on these is not a finding. */
const GLOBAL_TABLES = new Set([
  'tenants', 'users', 'plans', 'features', 'feature_flags', 'csi_codes',
  'cost_index', 'zip_codes', 'states', 'counties', 'trades', 'uom',
  'wage_determinations', 'union_rate_classes', 'system_settings',
  'email_templates', 'countries', 'currencies', 'timezones',
]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'route.ts' || e.name === 'route.tsx') out.push(p);
  }
  return out;
}

const files = walk(ROOT).sort();

/* Inserts very often build their rows first and pass the variable:
 *
 *   const vlanRows = parsed.vlans.map(v => ({ tenant_id: _tenantId, ... }));
 *   await supabase.from('network_vlans').insert(vlanRows);
 *
 * The tenant column is set at the build site, which is BEHIND the .from(), so
 * looking only forward through the chain reports a correctly-scoped insert as
 * unscoped. That single blind spot accounted for most of what this audit
 * called a finding, and a security report that is mostly false alarms gets
 * skimmed and then ignored — which is how a real one survives.
 *
 * So when the argument is a bare identifier, resolve it: find where it is
 * declared or assigned and look for the tenant column there. Only an
 * identifier is resolved; an inline object literal is already covered by the
 * chain test above.
 */
/* Start of the exported route handler containing `index`. Evidence of a tenant
   check only counts inside the handler that performs the write. */
function handlerStart(src, index) {
  const re = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g;
  let at = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m.index >= index) break;
    at = m.index;
  }
  return at;
}

/* Where an identifier last came into being before `beforeIndex`, and the text
   of that statement. */
function declarationOf(src, name, beforeIndex) {
  /* Plain `const x =`, a reassignment, a push — and destructuring, which is how
     nearly every supabase result is actually bound:
       const { data: bLine } = await db.from(...).eq('tenant_id', ...);
     Missing that form meant the tenant proof for an update-by-id was invisible
     and correctly-scoped routes were reported as holes. */
  const decl = new RegExp(
    `(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=` +
    `|(?:const|let|var)\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*=` +
    `|\\b${name}\\s*=(?!=)` +
    `|\\b${name}\\.push\\(`,
    'g',
  );
  const before = src.slice(0, beforeIndex);
  let last = -1;
  let d;
  while ((d = decl.exec(before)) !== null) last = d.index;
  if (last < 0) return null;
  return { at: last, text: src.slice(last, Math.min(beforeIndex, last + 700)) };
}

/* Does `name` carry, or derive from something that carries, a tenant filter?
   Follows assignment one variable at a time — `batch = rows.slice(...)` has to
   be chased back to `rows` or a correctly-scoped batched insert reads as
   unscoped. Depth-limited; a cycle or a long chain simply gives up. */
function identifierIsTenantBound(src, name, beforeIndex, depth = 0) {
  if (depth > 3) return false;
  const d = declarationOf(src, name, beforeIndex);
  if (!d) return false;
  /* Either the column itself, or the tenant handed to a builder:
       const row = toDb(body, user.tenantId);
     The mapper writes the column; the route's evidence is the argument. */
  if (/tenant_id/.test(d.text) || /user\.tenantId|\btenantId\b/.test(d.text)) return true;
  /* Derived from another local? Chase that one. */
  const via = /=\s*([A-Za-z_$][\w$]*)\s*(?:\.|\[)/.exec(d.text);
  if (via && via[1] !== name) return identifierIsTenantBound(src, via[1], d.at, depth + 1);
  return false;
}

function payloadCarriesTenant(src, chain, fromIndex) {
  /* Rows built before the call and passed by name:
       const vlanRows = parsed.vlans.map(v => ({ tenant_id: _tenantId, ... }));
       await supabase.from('network_vlans').insert(vlanRows);
     The tenant column is set BEHIND the .from(), so looking only forward
     through the chain reports a correctly-scoped insert as unscoped. That one
     blind spot produced most of this audit's findings, and a security report
     that is mostly false alarms gets skimmed and then ignored — which is how a
     real one survives. */
  /* `.insert(row as any)` is the house idiom — the generated Supabase types are
     stricter than the hand-built row objects, so nearly every insert carries a
     cast. Not allowing for it here meant the argument never matched and every
     one of those inserts was reported unscoped, whatever the row contained. */
  const call = /\.(insert|upsert|update)\(\s*([A-Za-z_$][\w$]*)\s*(?:as\s+[^,)]+?\s*)?[,)]/.exec(chain);
  if (call && identifierIsTenantBound(src, call[2], fromIndex)) return true;

  /* Scoped to one user rather than one tenant. A user belongs to exactly one
     tenant, so `.eq('user_id', user.id)` is a strictly narrower filter than
     `.eq('tenant_id', …)` — not a gap. */
  if (/\.eq\(\s*['"`](?:user_id|created_by|owner_id)['"`]\s*,\s*user\.id\s*\)/.test(chain)) return true;

  /* profiles and other user-keyed tables use `id` AS the auth user id, so
     `.eq('id', user.id)` is the same narrowing by another column name. */
  if (/\.eq\(\s*['"`]id['"`]\s*,\s*(?:user|g\.user)\.id\s*\)/.test(chain)) return true;

  /* `.match(t)` filters exactly like chained .eq()s, and the franchise routes
     build `const t = { tenant_id: user.tenantId, project_id }` once and reuse
     it across seven parallel queries. Resolve the object. */
  const match = /\.match\(\s*([A-Za-z_$][\w$]*)\s*\)/.exec(chain);
  if (match && identifierIsTenantBound(src, match[1], fromIndex)) return true;

  /* Updating or deleting a row by an id that an earlier query already proved
     belongs to this tenant:
       const { data: bLine } = await db.from('budget_lines')
         .select('id').eq('tenant_id', user.tenantId)...;
       await db.from('budget_lines').update({...}).eq('id', bLine.id);
     The proof is behind the query, which the forward-only window cannot see. */
  const byId = /\.eq\(\s*['"`]id['"`]\s*,\s*\(?\s*([A-Za-z_$][\w$]*)/.exec(chain);
  if (byId && identifierIsTenantBound(src, byId[1], fromIndex)) return true;

  /* Spread of a base row that carries the tenant:
       const base = { tenant_id: user.tenantId, ... };
       .insert({ ...base, claim_number })
     An object literal, so the bare-identifier test above does not see it. */
  for (const sp of chain.matchAll(/\.(?:insert|upsert|update)\(\s*\{\s*\.\.\.\s*([A-Za-z_$][\w$]*)/g)) {
    if (identifierIsTenantBound(src, sp[1], fromIndex)) return true;
  }

  /* Guard-then-act. A child row is written keyed to a parent the route has just
     proved the caller owns:
       const { data: owned } = await db.from('rfis')
         .select('id').eq('id', id).eq('tenant_id', user.tenantId).single();
       if (!owned) return 404;
       await db.from('rfi_responses').delete().eq('rfi_id', id);
     rfi_responses has no tenant column; the parent check IS the isolation.
     Accepted only when the same identifier the write filters on appears in a
     tenant-scoped query just above, so an unrelated check cannot vouch for it. */
  /* Only evidence from INSIDE the same handler counts. A fixed-size backwards
     window runs straight past the function boundary, so the tenant check in
     GET vouches for an unguarded insert in POST further down the file — which
     is exactly the shape of a real hole (form_submissions inserts against
     params.projectId with no ownership check, while the GET above it is
     properly scoped). Bound the search at the enclosing route handler. */
  const back = src.slice(handlerStart(src, fromIndex), fromIndex);
  const proven = (val) => {
    if (!val || ['user', 'params', 'body', 'req', 'db', 'supabase'].includes(val)) return false;
    for (const q of back.matchAll(/\.from\([^)]*\)[\s\S]{0,400}?;/g)) {
      if (/tenant_id/.test(q[0]) && new RegExp(`\\b${val}\\b`).test(q[0])) return true;
    }
    return false;
  };

  for (const f of chain.matchAll(/\.eq\(\s*['"`](\w+)['"`]\s*,\s*\(?\s*([A-Za-z_$][\w$]*)/g)) {
    if (proven(f[2])) return true;
  }

  /* The same guard, for an INSERT — which has no .eq() to inspect. The parent
     is verified and then a child row referencing it is written:
       const { data: markup } = await db.from('drawing_markups')
         .select('id').eq('id', markupId).eq('tenant_id', user.tenantId)...;
       if (!markup) return 404;
       await db.from('drawing_markup_comments').insert({ markup_id: markupId, ... });
     drawing_markup_comments has no tenant column; the parent check IS the
     isolation. Requiring the identifier to appear in a tenant-scoped query just
     above keeps an unrelated check from vouching for it. */
  const payload = /\.(?:insert|upsert)\(\s*(\{[\s\S]{0,600}?\}|[A-Za-z_$][\w$]*)/.exec(chain);
  if (payload) {
    const body = /^\{/.test(payload[1])
      ? payload[1]
      : (declarationOf(src, payload[1], fromIndex) || { text: '' }).text;
    for (const idm of body.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
      if (proven(idm[1])) return true;
    }
  }

  return false;
}

const results = { ok: [], noAuth: [], unscopedRead: [], unscopedWrite: [], publicByDesign: [], reviewed: [] };

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = file.replace(/\\/g, '/');

  if (PUBLIC_BY_DESIGN.some((re) => re.test('/' + rel))) {
    results.publicByDesign.push(rel);
    continue;
  }

  /* Every auth mechanism the codebase actually uses. Missing one here turns a
     correct route into a false alarm, and a security report full of false
     alarms is worse than no report — people stop reading it. */
  const hasAuth = /\b(getUser|requirePermission|requireApiKey|authenticateApiKey|getPortalSession|getTenantId)\s*\(/.test(src);
  if (!hasAuth) {
    results.noAuth.push(rel);
    continue;
  }

  /* Walk each .from('table') and look ahead through the chained calls for a
     tenant filter. The chain ends at a semicolon that is not inside it, so the
     window is the text up to the next `;` at chain depth zero — in practice a
     generous slice is enough and far more robust than parsing. */
  const findings = [];
  const fromRe = /\.from\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g;
  let m;
  while ((m = fromRe.exec(src)) !== null) {
    const table = m[1];
    if (GLOBAL_TABLES.has(table)) continue;

    /* The chain still ends at the first statement break, so a wider slice
       cannot let a neighbouring query vouch for this one — it only stops long
       statements being truncated. An .update() writing twenty columns runs well
       past 900 characters, which cut the trailing .eq('id', …) out of the chain
       and made a properly-filtered write look unfiltered. */
    const window = src.slice(m.index, m.index + 2500);
    const chain = window.split(/;\s*\n/)[0];

    /* .match({ tenant_id, project_id }) filters exactly like chained .eq()s and
       is used across the franchise routes. Without this the whole family reads
       as unscoped. */
    const scoped =
      /tenant_id/.test(chain) ||
      /\.eq\(\s*['"`]id['"`]\s*,/.test(chain) && /tenant_id/.test(window) ||
      /storage\s*$/.test(src.slice(Math.max(0, m.index - 30), m.index)) ||
      payloadCarriesTenant(src, chain, m.index);

    if (scoped) continue;

    const isWrite = /\.(insert|update|upsert|delete)\s*\(/.test(chain);
    findings.push({ table, isWrite, line: src.slice(0, m.index).split('\n').length });
  }

  if (!findings.length) { results.ok.push(rel); continue; }
  if (REVIEWED_SAFE.has(rel)) { results.reviewed.push(rel); continue; }
  const bucket = findings.some((f) => f.isWrite) ? 'unscopedWrite' : 'unscopedRead';
  results[bucket].push({ file: rel, findings });
}

const total = files.length;
const clean = results.ok.length;

console.log('='.repeat(72));
console.log('TENANT ISOLATION AUDIT');
console.log('='.repeat(72));
console.log(`route files scanned          ${total}`);
console.log(`clean (auth + every query scoped)  ${clean}`);
console.log(`public by design (reviewed by hand) ${results.publicByDesign.length}`);
console.log(`NO AUTH GUARD                ${results.noAuth.length}`);
console.log(`unscoped READ                ${results.unscopedRead.length}`);
console.log(`unscoped WRITE               ${results.unscopedWrite.length}   <-- worst`);
console.log(`reviewed safe by hand        ${results.reviewed.length}`);
for (const rel of results.reviewed) {
  console.log(`    ${rel}\n      ${REVIEWED_SAFE.get(rel)}`);
}
console.log('');

if (results.noAuth.length) {
  console.log('--- NO AUTH GUARD ------------------------------------------------------');
  results.noAuth.forEach((f) => console.log('  ' + f));
  console.log('');
}
for (const [label, key] of [['UNSCOPED WRITE', 'unscopedWrite'], ['UNSCOPED READ', 'unscopedRead']]) {
  if (!results[key].length) continue;
  console.log(`--- ${label} ${'-'.repeat(70 - label.length)}`);
  for (const r of results[key]) {
    console.log('  ' + r.file);
    for (const f of r.findings) {
      console.log(`      line ${f.line}  ${f.isWrite ? 'WRITE' : 'read '}  ${f.table}`);
    }
  }
  console.log('');
}

fs.writeFileSync(
  process.env.AUDIT_JSON || 'audit-tenant-isolation.json',
  JSON.stringify(results, null, 2),
);
console.log('full results -> ' + (process.env.AUDIT_JSON || 'audit-tenant-isolation.json'));

process.exitCode = results.noAuth.length + results.unscopedWrite.length > 0 ? 1 : 0;
