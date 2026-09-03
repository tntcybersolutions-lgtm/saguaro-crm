#!/usr/bin/env node
/**
 * audit-unscoped-routes — the narrow, high-signal half of the isolation audit.
 *
 * The broad version tries to parse each query chain and produces too many false
 * alarms to be trusted. This one asks a question that cannot be answered wrong:
 * does this route file query a tenant-owned table while the string "tenant"
 * never appears anywhere in it?
 *
 * If the word is absent from the whole file, no query in it can be scoped by
 * tenant. There is no clever chain, no helper, no indirection that gets around
 * that. Every hit here is real.
 */

const fs = require('fs');
const path = require('path');

/* Tables with no tenant column, or scoped some other way. Each of the last two
   was confirmed against the live schema — information_schema.columns has no
   tenant_id row for either — not assumed from the name. */
const GLOBAL = new Set([
  'tenants', 'users', 'plans', 'features', 'feature_flags', 'csi_codes',
  'wage_determinations', 'union_rate_classes', 'system_settings',
  'email_templates', 'roi_configs', 'cost_index', 'waitlist', 'leads',
  'contact_submissions', 'demo_requests', 'referrals', 'api_keys', 'sessions',
  'zip_codes', 'states', 'counties', 'trades', 'uom', 'countries',
  'platform_integrations', 'design_style_presets',
]);

/* A tenant filter is not the only correct scope. A route that pins every query
   to the SIGNED-IN USER's own id is strictly narrower — a user belongs to one
   tenant, so rows reachable by user.id are a subset of that tenant's rows.
   presence/leave, sage/activity and the project notifications route all do
   exactly this, and reporting them made the file's promise — "every hit here is
   real" — untrue, which is the one thing this audit cannot afford.

   Deliberately narrow: the id must come from the session binding, so
   .eq('user_id', user.id). A caller-supplied .eq('user_id', body.userId) still
   counts as unscoped, because it is. */
const USER_SCOPED = /\.eq\(\s*['"`]user_id['"`]\s*,\s*(?:\w+\.)?user\.id\s*\)/;

/* Public by design — reviewed separately, not by this rule. */
const PUBLIC = /\/(cron|webhooks?|stripe|portals?|public|auth|health|share|shared|sign)\//;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'route.ts') out.push(p);
  }
  return out;
}

const hits = [];
for (const file of walk(process.argv[2] || 'app/api')) {
  const rel = file.split(path.sep).join('/');
  if (PUBLIC.test('/' + rel)) continue;

  const src = fs.readFileSync(file, 'utf8');
  if (/tenant/i.test(src)) continue;
  /* Only when the session is actually proved. Without a guard, `user` could be
     anything, and pinning to an unauthenticated id scopes nothing. */
  if (USER_SCOPED.test(src) && /\b(getUser|requirePermission)\s*\(/.test(src)) continue;

  const tables = [...src.matchAll(/\.from\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g)]
    .map((m) => m[1])
    .filter((t) => !GLOBAL.has(t));
  if (!tables.length) continue;

  hits.push({
    rel,
    tables: [...new Set(tables)],
    writes: /\.(insert|update|upsert|delete)\s*\(/.test(src),
  });
}

hits.sort((a, b) => Number(b.writes) - Number(a.writes) || a.rel.localeCompare(b.rel));

console.log(`Route files querying a tenant table with NO mention of "tenant": ${hits.length}`);
console.log('');
for (const h of hits) {
  console.log(`  ${h.writes ? 'WRITE' : 'read '}  ${h.rel}`);
  console.log(`           ${h.tables.join(', ')}`);
}

process.exitCode = hits.length ? 1 : 0;
