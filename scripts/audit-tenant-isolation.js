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

const results = { ok: [], noAuth: [], unscopedRead: [], unscopedWrite: [], publicByDesign: [] };

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

    const window = src.slice(m.index, m.index + 900);
    const chain = window.split(/;\s*\n/)[0];

    const scoped =
      /tenant_id/.test(chain) ||
      /\.eq\(\s*['"`]id['"`]\s*,/.test(chain) && /tenant_id/.test(window) ||
      /storage\s*$/.test(src.slice(Math.max(0, m.index - 30), m.index));

    if (scoped) continue;

    const isWrite = /\.(insert|update|upsert|delete)\s*\(/.test(chain);
    findings.push({ table, isWrite, line: src.slice(0, m.index).split('\n').length });
  }

  if (!findings.length) { results.ok.push(rel); continue; }
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
