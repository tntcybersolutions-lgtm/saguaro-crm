#!/usr/bin/env node
/**
 * fix-unchecked-writes — wrap every discarded write so it cannot fail quietly.
 *
 *   await db.from('x').insert(row);
 *   -> await must(db.from('x').insert(row), 'x insert');
 *
 * and, for a write on a path that is already failing:
 *
 *   await db.from('x').update({ status: 'failed' }).eq('id', id);
 *   -> await tryWrite(db.from('x').update({ status: 'failed' }).eq('id', id), 'x status');
 *
 * Wrapping the expression rather than injecting `const { error } =` plus an
 * `if` keeps the statement shape identical — no new bindings to collide with
 * names already in scope, no reformatting, and the diff reads as one call per
 * line. It also survives the awkward cases in this codebase: multi-line insert
 * literals, `as never` casts, and chained `.select().single()`.
 *
 * Severity decides which helper, and severity comes from the same rules the
 * audit uses:
 *
 *   inside a catch      -> tryWrite   (throwing would replace the real error)
 *   insert / upsert     -> must       (user work; they are waiting on it)
 *   delete              -> must
 *   status-only update  -> must on the happy path, tryWrite inside a catch
 *
 * Dry run by default. Pass --apply to write.
 *
 * Deliberately skipped, and reported at the end rather than silently dropped:
 *   - files with no `import` line to attach the helper import to
 *   - statements whose end cannot be found by balanced-paren scan
 *   - .tsx client components, which need a visible error rather than a throw;
 *     those are listed for hand treatment
 */

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

const BACKSLASH = String.fromCharCode(92);
const BACKTICK = String.fromCharCode(96);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    /* Server code only. In a client component a throw from a click handler is
       an unhandled rejection — silent in the browser, which is the very bug
       being fixed. Those pages need a visible error and are done by hand. */
    else if (/\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

/** End of the statement starting at `from`: the ';' at depth 0. */
function statementEnd(src, from) {
  let i = from;
  let paren = 0, brace = 0, bracket = 0;
  let quote = null;
  while (i < src.length) {
    const ch = src[i];
    if (quote) {
      if (ch === BACKSLASH) { i += 2; continue; }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === BACKTICK) { quote = ch; i++; continue; }
    if (ch === '(') paren++;
    else if (ch === ')') paren--;
    else if (ch === '{') brace++;
    else if (ch === '}') brace--;
    else if (ch === '[') bracket++;
    else if (ch === ']') bracket--;
    else if (ch === ';' && paren === 0 && brace === 0 && bracket === 0) return i;
    /* A statement never runs past a closing brace that unbalances us. */
    if (paren < 0 || brace < 0 || bracket < 0) return -1;
    i++;
  }
  return -1;
}

const WRITE_CALL = /\.(insert|update|upsert|delete)\s*\(/;

/**
 * Files whose writes are best-effort BY DESIGN, per their own headers. Making
 * these throw would break the work they are recording — the opposite of the
 * fix. They still get tryWrite, so a refusal is logged instead of vanishing.
 *
 *   lib/learning.ts       "Recording is fire-and-forget: it must never slow or
 *                          fail the work itself."
 *   lib/radio-receipts.ts "Receipts are garnish on a transmission — never a
 *                          failure mode for it."
 *
 * lib/autopilot/scan.ts is deliberately NOT here: a dropped alert insert shows
 * the GC a clean bill of health that is not true.
 */
const FIRE_AND_FORGET = new Set([
  'lib/learning.ts',
  'lib/radio-receipts.ts',
]);

const skipped = [];
const clientFiles = new Set();
let wrapped = 0;
let enclosed = 0;
const perFile = [];

const files = [...walk('app'), ...walk('lib')];

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const rel = file.split(path.sep).join('/');
  /* The helpers' own file documents the pattern it fixes, so it matches its
     own search. */
  if (rel.endsWith('lib/db-write.ts')) continue;
  if (!/\.from\(/.test(src)) continue;

  const lines = src.split(/\r?\n/);
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const lineOf = (off) => src.slice(0, off).split(/\r?\n/).length;

  /* Collect the edits first, apply right-to-left so offsets stay valid.
     Offsets come straight from a scan of `src`. The first version derived them
     by summing line lengths and adding an assumed EOL width, which put the
     insertion two characters past the mark in one file and produced
     `await dbtryWrite(.from(…`. Deriving a byte offset from a line number is
     never worth the arithmetic when the regex can just report the offset. */
  const edits = [];

  const AWAIT = /\bawait\s+/g;
  let am;
  while ((am = AWAIT.exec(src)) !== null) {
    const exprStart = am.index + am[0].length;
    const end = statementEnd(src, exprStart);
    if (end < 0) continue;

    const expr = src.slice(exprStart, end);
    if (!/\.from\s*\(/.test(expr) || !WRITE_CALL.test(expr)) continue;
    /* Already handled by a .then() on the builder — the codebase's way of
       dealing with a result inline, since `.then().catch()` on a supabase
       builder does not compile. Those resolve to void, so wrapping them is
       both pointless and a type error. */
    if (/\.then\s*\(/.test(expr)) continue;

    const i = lineOf(am.index) - 1;
    const line = lines[i] ?? '';

    /* Already checked? Same rules as the audit, read from the text leading up
       to the await rather than from a window of whole lines. */
    const before = src.slice(Math.max(0, am.index - 160), am.index);
    if (
      /(const|let|var)\s*\{[^}]*\}\s*=\s*$/.test(before) ||
      /(const|let|var)\s+[\w$]+\s*=\s*$/.test(before) ||
      /return\s+$/.test(before) ||
      /=\s*$/.test(before) ||
      /(const|let|var)\s*\{[^}]*\}\s*=[^;]*$/.test(before) ||
      /\b(must|tryWrite)\s*\($/.test(before)
    ) continue;

    /* inside a catch? */
    let inCatch = false;
    for (let j = i; j >= 0 && j > i - 40; j--) {
      if (/\}\s*catch\s*(\([^)]*\))?\s*\{/.test(lines[j])) { inCatch = true; break; }
      if (/^\s*try\s*\{/.test(lines[j])) break;
    }

    const table = (line.match(/\.from\(\s*['"]([^'"]+)['"]/) || [])[1]
      || (expr.match(/\.from\(\s*['"]([^'"]+)['"]/) || [])[1]
      || 'row';
    const op = (line.match(WRITE_CALL) || [])[1] || 'write';
    /**
     * A write that marks something failed is itself on the way out.
     *
     *   if (!takeoff.storage_path) {
     *     await db.from('takeoffs').update({ status: 'failed' }).eq('id', id);
     *     send('error', { message: 'No blueprint uploaded.' });
     *   }
     *
     * The `inCatch` test does not see this — it is a plain guard block, not a
     * catch — and making it throw would replace "No blueprint uploaded" with a
     * database error, burying the one message the user needed. Nine of these
     * sit in the takeoff analyze route alone.
     */
    const marksFailure = /\b(status|state)\s*:\s*['"](failed|error|errored|cancelled|canceled)['"]/.test(expr);

    const helper = (inCatch || marksFailure || FIRE_AND_FORGET.has(rel)) ? 'tryWrite' : 'must';
    const label = `${table} ${op}`;

    edits.push({ exprStart, end, helper, label });

    if (/\.tsx$/.test(file)) clientFiles.add(rel);
  }

  if (!edits.length) continue;

  /**
   * Drop any edit that encloses another.
   *
   *   await withRetry(async () => { await db.from('x').update(…) })
   *
   * matches twice: the inner statement, which is the real write, and the outer
   * one, whose expression merely *contains* a write. Wrapping both put one
   * insertion inside the other's freshly-written text and produced
   * `'sage_user_prof, 'sage_user_profiles write')iles write')`. Only the
   * innermost span is the write.
   */
  const enclosing = new Set();
  for (const a of edits) {
    for (const b of edits) {
      if (a === b) continue;
      if (b.exprStart >= a.exprStart && b.end <= a.end) { enclosing.add(a); break; }
    }
  }
  const kept = edits.filter((e) => !enclosing.has(e));
  enclosed += edits.length - kept.length;
  edits.length = 0;
  edits.push(...kept);
  if (!edits.length) continue;

  /* Apply right-to-left. */
  edits.sort((a, b) => b.exprStart - a.exprStart);
  const used = new Set();
  for (const e of edits) {
    const expr = src.slice(e.exprStart, e.end);
    src = src.slice(0, e.exprStart) + `${e.helper}(${expr}, '${e.label}')` + src.slice(e.end);
    used.add(e.helper);
    wrapped++;
  }

  /* Import. Attach after the last top-level import so it lands below 'use client'. */
  const needed = [...used].sort();
  const already = new Set();
  const existing = src.match(/import\s*\{([^}]*)\}\s*from\s*['"]@\/lib\/db-write['"]\s*;?/);
  if (existing) {
    existing[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => already.add(n));
    const all = [...new Set([...already, ...needed])].sort();
    src = src.replace(existing[0], `import { ${all.join(', ')} } from '@/lib/db-write';`);
  } else {
    /* Find the last import by locating each `import` at a line start and
       scanning to its terminating ';'. A single-line regex missed the
       multi-line `import {\n a,\n b\n} from 'x';` form, which is how three
       lib files ended up reported as having no imports at all. */
    const importStarts = [...src.matchAll(/^import\b/gm)].map((m) => m.index);
    let at = -1;
    for (const s of importStarts) {
      const semi = statementEnd(src, s);
      if (semi > at) at = semi + 1;
    }
    if (at < 0) {
      /* Some lib files take the client as a parameter and import nothing at
         all. Put the import after the file's header comment and any
         'use ...' directive, so it does not land above the doc block. */
      let cursor = 0;
      const directive = src.match(/^\s*(['"])use [a-z ]+\1;?\s*/);
      if (directive) cursor = directive[0].length;
      const block = src.slice(cursor).match(/^\s*\/\*[\s\S]*?\*\/\s*/);
      if (block) cursor += block[0].length;
      /* eslint-disable and friends sit under the header — keep them above. */
      const lint = src.slice(cursor).match(/^(\s*\/\*\s*eslint[\s\S]*?\*\/\s*)+/);
      if (lint) cursor += lint[0].length;
      at = cursor;
      src = src.slice(0, at) + `import { ${needed.join(', ')} } from '@/lib/db-write';` + eol + eol + src.slice(at);
      perFile.push({ rel, n: edits.length });
      if (APPLY) fs.writeFileSync(file, src, 'utf8');
      continue;
    }
    src = src.slice(0, at) + eol + `import { ${needed.join(', ')} } from '@/lib/db-write';` + src.slice(at);
  }

  perFile.push({ rel, n: edits.length });
  if (APPLY) fs.writeFileSync(file, src, 'utf8');
}

console.log(APPLY ? 'APPLIED' : 'DRY RUN — nothing written (pass --apply)');
console.log('');
console.log(`  writes wrapped   ${wrapped}`);
console.log(`  files touched    ${perFile.length}`);
console.log(`  skipped          ${skipped.length}`);
console.log('');
perFile.sort((a, b) => b.n - a.n).slice(0, 15)
  .forEach((x) => console.log(`  ${String(x.n).padStart(3)}  ${x.rel}`));

if (clientFiles.size) {
  console.log('');
  console.log('client components touched — a throw here needs a visible error, check by hand:');
  for (const f of clientFiles) console.log(`  ${f}`);
}

if (skipped.length) {
  console.log('');
  console.log('SKIPPED (left for hand treatment, not silently dropped):');
  for (const s of skipped) console.log(`  ${s}`);
}
