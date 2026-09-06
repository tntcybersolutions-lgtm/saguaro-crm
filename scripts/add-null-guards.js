/* Adds the missing 401 guard after getUser() calls that never checked it.
 *
 *   node scripts/add-null-guards.js [--apply]
 *
 * These routes called getUser(req) and used the result without testing it. That
 * was always a bug — an unauthenticated request produced a TypeError and a 500
 * instead of a 401 — but nothing dereferenced `user` until the tenant codemod
 * added `.eq('tenant_id', user.tenantId)`, at which point tsc surfaced all of
 * them at once.
 *
 * Driven by tsc rather than a grep, so it fixes exactly what the compiler
 * complains about and nothing else.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APPLY = process.argv.includes('--apply');
const ROOT = path.resolve(__dirname, '..');

let out = '';
try {
  out = execSync('npx tsc --noEmit', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  out = (e.stdout || '') + (e.stderr || '');
}

const files = [...new Set(
  out.split(/\r?\n/)
    .filter((l) => /error TS18047: 'user' is possibly 'null'/.test(l))
    .map((l) => l.split('(')[0].trim())
    .filter(Boolean),
)];

if (!files.length) { console.log('no TS18047 user-null errors'); process.exit(0); }
console.log(`${files.length} file(s) with an unchecked getUser():\n`);

const GUARD = "if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });";
let fixed = 0;
const manual = [];

for (const rel of files) {
  const abs = path.join(ROOT, rel);
  let src = fs.readFileSync(abs, 'utf8');
  const EOL = src.includes('\r\n') ? '\r\n' : '\n';

  // Every `const user = await getUser(...)` that is not already followed by a
  // check on `user`.
  const re = /([ \t]*)const user = await getUser\([^)]*\)[^;\n]*;/g;
  let added = 0;
  let result = '';
  let last = 0;

  for (const m of src.matchAll(re)) {
    const after = src.slice(m.index + m[0].length, m.index + m[0].length + 160);
    if (/^\s*if\s*\(\s*!\s*user\s*\)/.test(after)) continue;   // already guarded
    result += src.slice(last, m.index + m[0].length);
    result += EOL + m[1] + GUARD;
    last = m.index + m[0].length;
    added++;
  }
  result += src.slice(last);

  if (!added) { manual.push(rel); continue; }

  // The guard needs NextResponse in scope.
  if (!/\bNextResponse\b/.test(src.split(EOL).slice(0, 20).join(EOL))) {
    if (/import\s*\{\s*NextRequest\s*\}\s*from\s*'next\/server'/.test(result)) {
      result = result.replace(
        /import\s*\{\s*NextRequest\s*\}\s*from\s*'next\/server'/,
        "import { NextRequest, NextResponse } from 'next/server'",
      );
    } else {
      manual.push(`${rel}  (needs a NextResponse import)`);
    }
  }

  console.log(`  ${added}x  ${rel}`);
  fixed += added;
  if (APPLY) fs.writeFileSync(abs, result);
}

if (manual.length) {
  console.log('\nby hand:');
  manual.forEach((m) => console.log('    ' + m));
}
console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'}: ${fixed} guard(s) in ${files.length - manual.length} file(s)`);
if (!APPLY) console.log('re-run with --apply to write');
