#!/usr/bin/env node
/**
 * fix-error-leaks — route raw error text through apiError instead of the client.
 *
 * audit-error-leaks found 165 responses carrying a caught exception's text to the
 * browser. A Postgres message names the table, the column and the constraint, so
 * each one is a small schema disclosure. lib/api-error.ts already exists to do
 * this properly: it logs the real error with a correlation id and returns wording
 * a general contractor can read.
 *
 * Three shapes are rewritten, and only when the WHOLE return statement can be
 * matched — a partial rewrite of an error path is worse than none:
 *
 *   return NextResponse.json({ error: 'MSG', details: e.message }, { status: 500 });
 *   return NextResponse.json({ error: 'MSG', detail }, { status: 500 });   // taint
 *   return NextResponse.json({ error: e instanceof Error ? e.message : 'MSG' }, …);
 *
 * all become:
 *
 *   return apiError('scope/from/path', e, 'MSG', 500);
 *
 * Anything it cannot match confidently is REPORTED, not guessed at. Run without
 * --write for a dry run.
 */

const fs = require('fs');
const path = require('path');

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

/** app/api/ai/cost-warning/route.ts -> 'ai/cost-warning' */
const scopeOf = (rel) =>
  rel.replace(/^app\/api\//, '').replace(/\/route\.ts$/, '').replace(/\[|\]/g, '') || 'api';

/** Balanced-brace/paren span of the `.json(` argument list starting at `openParen`. */
function callSpan(src, openParen) {
  let depth = 0;
  for (let i = openParen; i < src.length && i < openParen + 6000; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const OWN_ERRORS = /\b(UnsupportedImageError|ReportRunError|ValidationError|ApiError)\b/;
const dry = !process.argv.includes('--write');

let rewritten = 0;
const touched = new Set();
const unhandled = [];

for (const f of walk('app/api')) {
  const rel = f.split(path.sep).join('/');
  let src = fs.readFileSync(rel, 'utf8');
  const crlf = src.indexOf('\r\n') >= 0;
  const NL = crlf ? '\r\n' : '\n';
  const scope = scopeOf(rel);
  let fileChanged = false;

  /* Identifiers holding error text, for the indirect form. */
  const tainted = new Map(); // name -> the error expression it came from
  for (const m of src.matchAll(/\b(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*([^;\n]*\.message[^;\n]*)/g)) {
    if (OWN_ERRORS.test(m[2])) continue;
    /* Recover the caught binding: `e instanceof Error ? e.message : String(e)` -> e */
    const who = /(\w+)\s+instanceof\s+Error/.exec(m[2]) || /(\w+)\??\.message/.exec(m[2]);
    tainted.set(m[1], who ? who[1] : 'e');
  }

  /* Work backwards so earlier offsets stay valid as we splice. */
  const calls = [...src.matchAll(/return\s+(?:NextResponse|Response)\s*\.\s*json\s*\(/g)].reverse();

  for (const call of calls) {
    const open = call.index + call[0].length - 1;
    const close = callSpan(src, open);
    if (close < 0) continue;

    /* Include the trailing semicolon so the replacement is a whole statement. */
    let end = close + 1;
    if (src[end] === ';') end++;
    const stmt = src.slice(call.index, end);
    if (/\bapiError\s*\(/.test(stmt)) continue;
    /* Trigger on BOTH ways a tainted name reaches a payload: the shorthand
       `{ detail }` and the explicit `{ error: msg, talks: [] }`. Testing only the
       shorthand let the entire `error: msg` family — the most common shape in the
       safety, schedule and inspections routes — walk straight past. */
    const namesTainted = [...tainted.keys()].some((t) =>
      new RegExp(`[{,]\\s*${t}\\s*[,}]`).test(stmt) ||
      new RegExp(`\\b(?:error|detail|details|message|msg)\\s*:\\s*${t}\\s*[,}]`).test(stmt));
    if (!/\.message/.test(stmt) && !namesTainted) continue;
    if (OWN_ERRORS.test(stmt)) continue;

    const status = (/\{\s*status\s*:\s*(\d{3})/.exec(stmt) || [])[1] || '500';

    /* The human-readable half, and the error value to log. */
    let client = null;
    let errVar = null;

    // shape 1/2: error: 'MSG' alongside detail(s): X.message  — or a tainted name
    const msgLit = /\berror\s*:\s*(['"`])((?:(?!\1).)*)\1/.exec(stmt);
    if (msgLit) {
      client = msgLit[2];
      const direct = /\b(?:details?|msg|message)\s*:\s*([\w.?]+)\.message/.exec(stmt);
      if (direct) {
        errVar = direct[1].replace(/\?$/, '');
      } else {
        for (const [name, from] of tainted) {
          if (new RegExp(`[{,]\\s*${name}\\s*[,}]`).test(stmt) || new RegExp(`\\b(?:details?|msg|message)\\s*:\\s*${name}\\b`).test(stmt)) {
            errVar = from;
            break;
          }
        }
      }
    }

    // shape 3: error: e instanceof Error ? e.message : 'MSG'
    if (!client) {
      const tern = /\berror\s*:\s*(\w+)\s+instanceof\s+Error\s*\?\s*\1\??\.message\s*:\s*(['"`])((?:(?!\2).)*)\2/.exec(stmt);
      if (tern) {
        errVar = tern[1];
        client = tern[3];
      }
    }

    // shape 4: error: uploadErr?.message || 'Upload failed'
    // The author already wrote the human half; the leak is that the raw message
    // wins whenever it exists, which is exactly when it is a Postgres error.
    if (!client) {
      const orElse = /\berror\s*:\s*([\w.]+?)\??\.message\s*\|\|\s*(['"`])((?:(?!\2).)*)\2/.exec(stmt);
      if (orElse) {
        errVar = orElse[1];
        client = orElse[3];
      }
    }

    /* shape 5/6: the error text IS the whole message — `error: msg` where msg
       holds e.message, or a bare `error: err.message`. There is no human wording
       to preserve, so fall through to apiError's own default, which already reads
       "Something went wrong on our end. Please try again." Inventing a
       route-specific sentence here would be guessing at what the route does. */
    if (!client) {
      const bareTaint = /\berror\s*:\s*(\w+)\s*[,}]/.exec(stmt);
      if (bareTaint && tainted.has(bareTaint[1])) {
        errVar = tainted.get(bareTaint[1]);
        client = '';
      } else {
        const bareMsg = /\berror\s*:\s*([\w.]+?)\??\.message\s*[,}]/.exec(stmt);
        if (bareMsg) {
          errVar = bareMsg[1];
          client = '';
        }
      }
    }

    if (client === null || !errVar) {
      unhandled.push(`${rel}  ${stmt.slice(0, 110).replace(/\s+/g, ' ')}`);
      continue;
    }

    /* Keep the caller's own wording; it is already written for a person. An
       empty client means there was none to keep — let apiError's default stand. */
    const safe = client.replace(/'/g, "\\'");
    const args = !client
      ? (status === '500' ? `'${scope}', ${errVar}` : `'${scope}', ${errVar}, undefined, ${status}`)
      : (status === '500' ? `'${scope}', ${errVar}, '${safe}'` : `'${scope}', ${errVar}, '${safe}', ${status}`);
    src = src.slice(0, call.index) + `return apiError(${args});` + src.slice(end);
    rewritten++;
    fileChanged = true;
  }

  if (!fileChanged) continue;

  if (!/from\s+'@\/lib\/api-error'/.test(src)) {
    /* Insert after the last line that ENDS an import, not the last line that
       STARTS one. A multi-line `import {\n  a,\n  b,\n} from 'x';` only matches
       /^import/ on its first line, so splicing there drops the new statement
       between the braces and breaks the file — which is exactly what happened to
       both photo upload routes. */
    const lines = src.split(NL);
    let last = -1;
    let open = false;
    for (let i = 0; i < Math.min(lines.length, 80); i++) {
      const L = lines[i];
      if (/^import\b/.test(L)) open = true;
      if (open && /;\s*$/.test(L)) { last = i; open = false; }
    }
    if (last < 0) {
      unhandled.push(`${rel}  NO IMPORT BLOCK — import not added, file skipped`);
      continue;
    }
    lines.splice(last + 1, 0, "import { apiError } from '@/lib/api-error';");
    src = lines.join(NL);
  }

  touched.add(rel);
  if (!dry) fs.writeFileSync(rel, src);
}

console.log('='.repeat(74));
console.log(dry ? 'FIX ERROR LEAKS — dry run (pass --write to apply)' : 'FIX ERROR LEAKS — applied');
console.log('='.repeat(74));
console.log(`  responses rewritten  ${rewritten}`);
console.log(`  files touched        ${touched.size}`);
console.log(`  NOT handled          ${unhandled.length}`);
if (unhandled.length) {
  console.log('');
  console.log('  These need a human. Nothing was changed in them:');
  for (const u of unhandled) console.log(`    ${u}`);
}
