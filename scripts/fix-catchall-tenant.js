/* Fixes tenant resolution in the catch-all dispatcher.
 *
 *   node scripts/fix-catchall-tenant.js
 *
 * Three defects, all in app/api/[...path]/route.ts:
 *
 * 1. `tenantId = user?.id` — the auth user id is NOT the tenant id. They
 *    coincide only for tenant founders: 8 of 12 profiles today, so every
 *    non-owner team member resolved to a tenant that does not exist and saw
 *    nothing. Verified against profiles(id, tenant_id) on 2026-09-05.
 *
 * 2. `tenantId = user?.user_metadata?.tenant_id ?? user?.id` — same problem
 *    with a JWT-metadata fallback that can go stale.
 *
 * 3. `let tenantId = String(body.tenantId ?? '')` — the caller supplied their
 *    own tenant id and the token was consulted only when the body omitted it,
 *    so any caller could write into any tenant. CLAUDE.md section 3: tenant_id
 *    is never taken from the request body.
 *
 * All six sites now resolve through one helper that reads profiles.tenant_id.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'app/api/[...path]/route.ts');
let src = fs.readFileSync(FILE, 'utf8');
const before = src;
const eol = src.includes('\r\n') ? '\r\n' : '\n';
let changed = 0;

const HELPER = [
  '',
  '// ─── Tenant resolution ────────────────────────────────────────────────────────',
  '',
  '/**',
  ' * Resolves the caller\'s real tenant_id from a bearer token.',
  ' *',
  ' * user.id is NOT the tenant id. They match only for the account that created',
  ' * the tenant, so reading user.id gave every other team member a tenant that',
  ' * does not exist. Always go through profiles.',
  ' */',
  'async function tenantFromToken(token: string | undefined | null): Promise<string | null> {',
  '  if (!token) return null;',
  '  const { data: { user } } = await supabaseAdmin.auth.getUser(token);',
  '  if (!user) return null;',
  '  const { data: profile } = await supabaseAdmin',
  '    .from(\'profiles\')',
  '    .select(\'tenant_id\')',
  '    .eq(\'id\', user.id)',
  '    .single();',
  '  return profile?.tenant_id ?? null;',
  '}',
  '',
].join(eol);

// Insert the helper after the CORS block so it sits above every handler.
const anchor = '// ─── Types ─';
if (!src.includes('async function tenantFromToken')) {
  const at = src.indexOf(anchor);
  if (at < 0) { console.error('anchor not found — aborting'); process.exit(1); }
  src = src.slice(0, at) + HELPER + eol + src.slice(at);
  changed++;
  console.log('inserted tenantFromToken() helper');
}

// 1. the four one-liners
const oneLiner = /if \(token\) \{ const \{ data: \{ user \} \} = await supabase\.auth\.getUser\(token\); tenantId = user\?\.id \?\? null; \}/g;
const n1 = (src.match(oneLiner) || []).length;
src = src.replace(oneLiner, 'tenantId = await tenantFromToken(token);');
changed += n1;
console.log(`replaced ${n1} inline "tenantId = user?.id" sites`);

// 2. the multi-line variant around line 273
const multi = /const \{ data: \{ user \} \} = await supabase\.auth\.getUser\(token\);(\s*)tenantId = user\?\.id \?\? null;/g;
const n2 = (src.match(multi) || []).length;
src = src.replace(multi, 'tenantId = await tenantFromToken(token);');
changed += n2;
console.log(`replaced ${n2} multi-line site(s)`);

// 3. body-supplied tenantId on project creation
const bodyPattern = /let tenantId = String\(body\.tenantId \?\? ''\);(\s*)const bearer = req\.headers\.get\('authorization'\);(\s*)if \(bearer\?\.startsWith\('Bearer '\) && !tenantId\) \{(\s*)const token = bearer\.slice\(7\);(\s*)const \{ data: \{ user \} \} = await supabaseAdmin\.auth\.getUser\(token\);(\s*)tenantId = user\?\.user_metadata\?\.tenant_id \?\? user\?\.id \?\? tenantId;(\s*)\}/;
if (bodyPattern.test(src)) {
  src = src.replace(bodyPattern, [
    '// tenant_id comes from the token only — never from the request body.',
    'const bearer = req.headers.get(\'authorization\');',
    'const tenantId = await tenantFromToken(',
    '  bearer?.startsWith(\'Bearer \') ? bearer.slice(7) : null,',
    ');',
  ].join(eol + '    '));
  changed++;
  console.log('project creation now derives tenant_id from the token, not the body');
} else {
  console.log('WARN: body-supplied tenantId pattern not found — check manually');
}

if (src === before) { console.log('\nno changes'); process.exit(0); }
fs.writeFileSync(FILE, src);
console.log(`\n${changed} change(s) written to app/api/[...path]/route.ts`);
