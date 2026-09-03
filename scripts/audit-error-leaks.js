#!/usr/bin/env node
/**
 * audit-error-leaks — does any API response carry raw error text to the client?
 *
 * A Postgres error is not a message, it is a schema disclosure:
 *
 *   column "w9_status" of relation "subcontractors" does not exist
 *   new row violates check constraint "pay_applications_status_check"
 *   insert or update on table "bids" violates foreign key constraint "bids_project_id_fkey"
 *
 * Table names, column names, constraint names, and the shape of the data model,
 * handed to anyone poking the API. lib/api-error.ts exists for this: it logs the
 * real error server-side with a short correlation id and returns wording written
 * for a general contractor, with the id as `ref` so support can find the failure.
 *
 * CLAUDE.md already bans this and gives a grep for it:
 *
 *   grep -rnE "error:\s*(e|err|error)\??\.message" app/api --include=route.ts
 *
 * That grep matches ONE spelling. It misses `details: err.message`, which is the
 * most common form in this codebase, and it misses the indirect form entirely:
 *
 *   const detail = e instanceof Error ? e.message : String(e);
 *   return NextResponse.json({ error: 'Failed to load todos', detail }, { status: 500 });
 *
 * Nothing on that second line looks like `.message`, so the rule read as clean
 * across dozens of routes that were leaking. This checks the thing the rule
 * actually means: does an error's text reach the response body, by any route.
 *
 * Method: taint. Any identifier assigned from an expression containing `.message`
 * is tainted; so is any direct `.message`. A `.json({...})` payload naming a
 * tainted value is a finding. Server-side console.* logging is untouched — that
 * is where the real error is SUPPOSED to go.
 */

const fs = require('fs');
const path = require('path');

/* Our own error classes say what we chose to say, not what Postgres said.
   CLAUDE.md permits returning their message. */
const OWN_ERRORS = /\b(UnsupportedImageError|ReportRunError|ValidationError|ApiError)\b/;

/**
 * `.message` is not proof of an error. A signature request has a message, so does
 * a generated report and a radio broadcast — flagging `report.message` taught the
 * reader that this audit does not know what an error is, which is how a real
 * finding two lines down gets skipped.
 *
 * An error-shaped source is either an `instanceof Error` test, or a `.message`
 * read off something named like a caught exception: e, err, error, ex, or any
 * identifier ending Err/Error (upErr, insertError, phasesRes.error).
 */
const ERRORISH = /instanceof\s+Error|\b(?:e|err|error|ex|[A-Za-z_$][\w$]*(?:Err|Error))\s*\??\.\s*message\b/;
/* Written out rather than spliced from OWN_ERRORS.source: dropping that pattern's
   own parentheses left the alternation ungrouped, so `instanceof\s+A|B|C` meant
   "instanceof A" OR the bare word "B" — a silent mis-scope in a security check. */
const OWN_ERROR_GUARD = /instanceof\s+(?:UnsupportedImageError|ReportRunError|ValidationError|ApiError)\b/;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'route.ts') out.push(p);
  }
  return out;
}

const lineAt = (src, i) => src.slice(0, i).split(/\r?\n/).length;

/**
 * The balanced object literal that IS this call's argument.
 *
 * It must be the very next thing after the `(`. Scanning forward for any `{`
 * walks straight past `NextResponse.json(result)` and grabs the brace of the
 * following catch block, swallowing unrelated code as a "payload" — which
 * invented a leak in app/api/reports/run/route.ts out of the guarded branch
 * below it. A payload that is not a literal cannot be checked here, so it is
 * skipped rather than approximated.
 */
function objectAt(src, from) {
  let i = from;
  if (src[i] === '(') i++;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] !== '{') return null;
  const open = i;
  let depth = 0;
  for (let i = open; i < src.length && i < open + 4000; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return { start: open, end: i, text: src.slice(open, i + 1) };
    }
  }
  return null;
}

const problems = [];
let checked = 0;

for (const f of walk('app/api')) {
  const rel = f.split(path.sep).join('/');
  const src = fs.readFileSync(rel, 'utf8');
  checked++;

  /* 1. Identifiers that hold error text.
        const detail = e instanceof Error ? e.message : String(e);
        const msg = error.message;
        const { message: detail } = err;                                  */
  const tainted = new Set();
  for (const m of src.matchAll(/\b(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*([^;\n]*\.message[^;\n]*)/g)) {
    if (OWN_ERRORS.test(m[2])) continue;
    if (!ERRORISH.test(m[2])) continue;
    tainted.add(m[1]);
  }

  /* 2. Every response payload. Both NextResponse.json({…}) and Response.json({…}). */
  for (const call of src.matchAll(/\b(?:NextResponse|Response)\s*\.\s*json\s*\(/g)) {
    const obj = objectAt(src, call.index + call[0].length - 1);
    if (!obj) continue;
    /* A payload that only forwards a sanitized helper is fine. */
    if (/\bapiError\s*\(/.test(obj.text)) continue;

    /* CLAUDE.md permits returning OUR OWN error classes' messages — those are
       words we wrote, not the database's. The class name is on the enclosing
       guard, not on the response line:

         if (e instanceof UnsupportedImageError) {
           return NextResponse.json({ error: e.message, code: e.code }, { status: 415 });

       so look back a few lines for it. Flagging these taught readers that the
       audit does not understand the rule it is enforcing. */
    const preceding = src.slice(Math.max(0, obj.start - 400), obj.start);
    if (OWN_ERROR_GUARD.test(preceding)) continue;

    /* Direct: `detail: err.message`, `error: e.message`, `details: x.message`. */
    for (const p of obj.text.matchAll(/\b(detail|details|error|message|msg)\s*:\s*([^,{}]*\.message[^,{}]*)/g)) {
      if (OWN_ERRORS.test(p[2])) continue;
      if (!ERRORISH.test(p[2])) continue;
      problems.push({
        rel,
        line: lineAt(src, obj.start + p.index),
        how: `${p[1]}: ${p[2].trim()}`,
        why: 'the error text goes straight into the response body',
      });
    }

    /* Indirect: the payload names an identifier that holds error text, either
       shorthand `{ detail }` or explicit `{ detail: detail }`. This is the form
       the CLAUDE.md grep cannot see. */
    for (const t of tainted) {
      const shorthand = new RegExp(`[{,]\\s*${t}\\s*[,}]`);
      const explicit = new RegExp(`\\b(detail|details|error|message|msg)\\s*:\\s*${t}\\b`);
      if (shorthand.test(obj.text) || explicit.test(obj.text)) {
        problems.push({
          rel,
          line: lineAt(src, obj.start),
          how: `{ … ${t} … }  where ${t} holds an error's .message`,
          why: 'indirect: assigned from .message earlier, then returned',
        });
      }
    }
  }
}

/* One finding per file+line; the two rules can both fire on the same payload. */
const seen = new Set();
const unique = problems.filter((p) => {
  const k = `${p.rel}:${p.line}:${p.how}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

const byFile = new Map();
for (const p of unique) {
  if (!byFile.has(p.rel)) byFile.set(p.rel, []);
  byFile.get(p.rel).push(p);
}

console.log('='.repeat(74));
console.log('ERROR LEAKS — does raw error text reach the client?');
console.log('='.repeat(74));
console.log(`  route files checked  ${checked}`);
console.log(`  files leaking        ${byFile.size}`);
console.log(`  PROBLEMS             ${unique.length}`);
if (unique.length) {
  console.log('');
  for (const [rel, list] of [...byFile].sort()) {
    console.log(`  ${rel}`);
    for (const p of list) console.log(`      line ${p.line}  ${p.how}\n        ${p.why}`);
  }
  console.log('');
  console.log('  Fix: return apiError(scope, e, "message a GC can read") from lib/api-error.ts.');
  console.log('  It logs the real error with a correlation id and returns that id as `ref`.');
}

if (!checked) {
  console.log('');
  console.log('PARSE FAILED — no route files found. Clean means nothing.');
  process.exitCode = 2;
} else {
  process.exitCode = unique.length ? 1 : 0;
}
