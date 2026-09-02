#!/usr/bin/env node
/**
 * audit-dead-bindings — UI reading keys the API never sends.
 *
 * A badge bound to a key that does not exist renders nothing. Not an error, not
 * a zero — nothing. The count silently never appears and the screen looks like
 * a considered design decision rather than a broken binding.
 *
 * I shipped exactly this twice in one day: a change-order badge reading
 * ctx.changeOrders.length when the response has no changeOrders, and a contact
 * count reading a table the directory does not show. Both were caught by
 * hand-checking; neither would have been caught by TypeScript, because the
 * context is typed `any` at the hook boundary.
 *
 * So this compares what /api/project-context actually returns against every
 * `ctx?.…` / `c?.…` the UI reads off it.
 */

const fs = require('fs');
const path = require('path');

const API = 'app/api/project-context/route.ts';

/* ── What the API returns ───────────────────────────────────────────────── */

const apiSrc = fs.readFileSync(API, 'utf8');

/* The response object.
   The first version searched for the last `return NextResponse.json({` and
   found the 404 — so it parsed { error: 'Project not found' } and reported
   every real binding as dead. 53 findings, none of them true.

   It also read keys line by line, which cannot see `project: { id, name, … }`
   written on one line. Both are fixed by matching the braces properly and
   pulling keys out with depth tracked. */
const jsonAt = apiSrc.lastIndexOf('NextResponse.json({');
const objStart = apiSrc.indexOf('{', jsonAt + 'NextResponse.json('.length - 1);

let objEnd = objStart;
{
  let depth = 0;
  for (let i = objStart; i < apiSrc.length; i++) {
    const ch = apiSrc[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { objEnd = i; break; } }
  }
}
const body = apiSrc.slice(objStart, objEnd + 1);

const topKeys = new Set();
const nestedKeys = new Set(); // "parent.child"
{
  let depth = 0;
  const stack = [];
  /* `key:` and shorthand `key,` / `key }`. Missing shorthand reported
     money.originalContract and money.approvedCoTotal as dead when the object
     literally opens with both of them written that way. */
  const keyRe = /([A-Za-z_][A-Za-z0-9_]*)\s*(:|,|(?=\s*\}))/g;
  let i = 0;
  let pendingKey = null;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '{' || ch === '[' || ch === '(') {
      if (ch === '{' && pendingKey !== null) stack.push(pendingKey);
      else if (ch === '{') stack.push(null);
      depth++;
      pendingKey = null;
      i++;
      continue;
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      if (ch === '}') stack.pop();
      depth--;
      pendingKey = null;
      i++;
      continue;
    }
    keyRe.lastIndex = i;
    const m = keyRe.exec(body);
    if (m && m.index === i) {
      const key = m[1];
      const parent = stack.length > 1 ? stack[stack.length - 1] : null;
      if (stack.length === 1) topKeys.add(key);
      else if (parent) nestedKeys.add(parent + '.' + key);
      pendingKey = key;
      i = m.index + m[0].length;
      continue;
    }
    i++;
  }
}

/* Keys produced by an IIFE or spread that the line scan cannot see are declared
   here so the audit does not invent findings. Each is verified by hand. */
const KNOWN_EXTRA = new Set([
  'takeoff.count', 'takeoff.completed', 'takeoff.latestId', 'takeoff.pricedTotal', 'takeoff.sheets',
]);

/* ── What the UI reads ──────────────────────────────────────────────────── */

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = [...walk('app'), ...walk('components')];
const findings = [];

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  if (!/useProjectContext|project-context/.test(src)) continue;
  const rel = f.split(path.sep).join('/');

  /* ctx?.a?.b  /  c?.a?.b  — the shape every badge binding uses. */
  for (const m of src.matchAll(/\b(?:ctx|c)\?\.([A-Za-z_][A-Za-z0-9_]*)(?:\?\.([A-Za-z_][A-Za-z0-9_]*))?/g)) {
    const [, top, child] = m;
    const line = src.slice(0, m.index).split('\n').length;

    if (!topKeys.has(top)) {
      findings.push({ rel, line, expr: `${top}${child ? '.' + child : ''}`, why: `no "${top}" in the response` });
      continue;
    }
    if (!child) continue;
    if (child === 'length') continue; // array key already confirmed above
    const dotted = `${top}.${child}`;
    if (nestedKeys.has(dotted) || KNOWN_EXTRA.has(dotted)) continue;
    findings.push({ rel, line, expr: dotted, why: `"${top}" exists but has no "${child}"` });
  }
}

/* ── report ─────────────────────────────────────────────────────────────── */

console.log('='.repeat(72));
console.log('DEAD BINDINGS — UI reading keys /api/project-context does not send');
console.log('='.repeat(72));
console.log(`response top-level keys   ${topKeys.size}`);
console.log(`response nested keys      ${nestedKeys.size}`);
console.log(`files reading the context ${files.filter((f) => /useProjectContext|project-context/.test(fs.readFileSync(f, 'utf8'))).length}`);
console.log('');
console.log(`DEAD BINDINGS             ${findings.length}`);

if (findings.length) {
  console.log('');
  for (const x of findings) console.log(`  ${x.rel}:${x.line}\n      ${x.expr}  —  ${x.why}`);
}

process.exitCode = findings.length ? 1 : 0;
