/* Adds an auth guard to the white-label and insurance handler modules.
 *
 *   node scripts/fix-module-auth.js
 *
 * Both are mounted behind catch-all routes (app/api/white-label/[...path],
 * app/api/insurance/[...path]) that do no authentication of their own, and both
 * read tenantId straight from the request body or query string. So any caller
 * could read or rewrite another tenant's reseller branding, DNS setup, client
 * list and certificate-of-insurance records.
 *
 * Same shape as scripts/fix-billing-auth.js: one requireTenant() helper per
 * module, and every handler takes the tenant from the session instead.
 *
 * Both files are CRLF — patterns are normalised, because a bare \n matches
 * nothing and does it silently.
 */

const fs = require('fs');

const GUARD_DOC = [
  '/**',
  " * Resolves the caller's tenant from their session.",
  ' *',
  ' * These handlers previously read tenantId out of the request body or query',
  ' * string with no authentication, behind a catch-all route that adds none.',
  ' */',
].join('\n');

const TARGETS = [
  {
    file: 'white-label-provisioning.ts',
    // this module already has ok()/err() helpers
    anchor: "function err(m: string, s = 400) { return NextResponse.json({ error: m }, { status: s }); }",
    helper:
      "function err(m: string, s = 400) { return NextResponse.json({ error: m }, { status: s }); }\n" +
      '\n' + GUARD_DOC + '\n' +
      'async function requireTenant(request: NextRequest): Promise<string | NextResponse> {\n' +
      '  const user = await getUser(request);\n' +
      "  if (!user) return err('Unauthorized', 401);\n" +
      '  return user.tenantId;\n' +
      '}',
    importAfter: "import { supabaseAdmin } from './supabase/admin';",
    swaps: [
      ["  const tenantId    = String(body?.tenantId    ?? '');\n", '  const tenantId    = tenant;\n'],
      ["  const tenantId = String(body.tenantId);\n", '  const tenantId = tenant;\n'],
      ["  const tenantId = request.nextUrl.searchParams.get('tenantId');\n", '  const tenantId = tenant;\n'],
      ["  const tenantId = String(body?.tenantId ?? '');\n", '  const tenantId = tenant;\n'],
    ],
  },
  {
    file: 'insurance-tracker.ts',
    // no err() helper here — define the guard with an inline response
    anchor: "import { getProjectContext } from './project-context';",
    helper:
      "import { getProjectContext } from './project-context';\n" +
      '\n' + GUARD_DOC + '\n' +
      'async function requireTenant(request: NextRequest): Promise<string | NextResponse> {\n' +
      '  const user = await getUser(request);\n' +
      "  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });\n" +
      '  return user.tenantId;\n' +
      '}',
    importAfter: "import { supabaseAdmin } from './supabase/admin';",
    swaps: [
      ["  const tenantId    = String(body['tenantId']    ?? '');\n", '  const tenantId    = tenant;\n'],
      ["  const tenantId = req.nextUrl.searchParams.get('tenantId');\n", '  const tenantId = tenant;\n'],
    ],
  },
];

let failures = 0;

for (const t of TARGETS) {
  let s = fs.readFileSync(t.file, 'utf8');
  const EOL = s.includes('\r\n') ? '\r\n' : '\n';
  const nl = (x) => x.split('\n').join(EOL);
  const before = s;
  const log = [];

  if (!s.includes("from './lib/supabase-server'")) {
    const find = nl(t.importAfter);
    if (!s.includes(find)) { console.log(`  MISS  ${t.file}: import anchor`); failures++; continue; }
    s = s.replace(find, nl(t.importAfter + "\nimport { getUser } from './lib/supabase-server';"));
    log.push('import getUser');
  }

  if (!s.includes('async function requireTenant')) {
    const find = nl(t.anchor);
    if (!s.includes(find)) { console.log(`  MISS  ${t.file}: helper anchor`); failures++; continue; }
    s = s.replace(find, nl(t.helper));
    log.push('requireTenant()');
  }

  // The guard must run before the tenantId assignment it replaces, and each
  // handler names its request param differently (request vs req).
  for (const [rawFind, rawRepl] of t.swaps) {
    const find = nl(rawFind);
    const n = s.split(find).length - 1;
    if (n === 0) { console.log(`  MISS  ${t.file}: ${JSON.stringify(rawFind.trim().slice(0, 48))}`); failures++; continue; }
    const param = rawFind.includes('req.nextUrl') ? 'req' : 'request';
    const guard =
      `  const tenant = await requireTenant(${param});\n` +
      "  if (typeof tenant !== 'string') return tenant;\n";
    s = s.split(find).join(nl(guard + rawRepl));
    log.push(`${n}x ${rawFind.trim().slice(0, 40)}`);
  }

  if (s === before) { console.log(`  ${t.file}: no changes`); continue; }
  fs.writeFileSync(t.file, s);
  console.log(`${t.file}:`);
  log.forEach((l) => console.log(`    ${l}`));
}

if (failures) {
  console.error(`\n${failures} pattern(s) did not match — review those by hand.`);
  process.exit(1);
}
console.log('\ndone');
