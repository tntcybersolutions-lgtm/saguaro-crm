#!/usr/bin/env node
/**
 * audit-swapped-ids — id arguments passed in the wrong order.
 *
 * WHY THIS EXISTS
 *
 * /api/notifications/count called
 *
 *   getUnreadCount(user.id, user.id)
 *
 * against a function declared
 *
 *   getUnreadCount(tenantId: string, userId: string)
 *
 * so the query filtered tenant_id by a USER id. Both parameters are strings
 * holding UUIDs, so TypeScript had nothing to say. The unread badge showed
 * zero for every user who was not their company's founding account — which in
 * this database is everyone invited to a team, because a tenant's id IS the
 * founder's auth id and only for them do the two arguments coincide.
 *
 * Measured on production: five real accounts each had an unread notification
 * and a badge showing none. It survived because the person most likely to
 * check was the owner, and for the owner it worked.
 *
 * WHAT IT LOOKS FOR
 *
 * Functions whose parameter list contains two or more id-ish strings, and call
 * sites where the argument expressions do not line up with those names — a
 * userId in the tenantId position, the same expression handed to both, a
 * projectId where a tenantId belongs.
 *
 * It is name-based, so it cannot see through a local variable that was named
 * badly upstream. It is a shortlist, not a verdict.
 *
 * Usage: node tools/audit-swapped-ids.mjs [dir ...]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = process.argv.slice(2).length ? process.argv.slice(2) : ['app', 'lib', 'components'];

/**
 * Comments are blanked to spaces, offsets preserved so line numbers stay true.
 *
 * Written after this tool flagged two of its own findings a second time — the
 * doc comments explaining the fix quote the broken call, and a scanner that
 * reads comments cannot tell an example from the real thing. The same
 * correction was needed in audit-discarded-guards; a comment is never code.
 */
function blankComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

const files = [];
for (const root of ROOTS) {
  (function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (/node_modules|\.next|database\.types/.test(p)) continue;
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  })(root);
}

/** What kind of id a name refers to, or null if it is not an id at all. */
function idKind(name) {
  const n = name.toLowerCase();
  if (!/id$/.test(n)) return null;
  if (/tenant/.test(n)) return 'tenant';
  if (/user|actor|author|assignee|recipient|member/.test(n)) return 'user';
  if (/project|job/.test(n)) return 'project';
  if (/company|org/.test(n)) return 'org';
  return 'other';
}

/* Declarations: exported functions with an id-ish parameter list. */
const decls = new Map(); // name -> [{param, kind}]
for (const file of files) {
  const src = blankComments(fs.readFileSync(file, 'utf8'));
  const re = /export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]{0,400})\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const params = m[2]
      .split(',')
      .map((p) => p.trim().split(/[:=]/)[0].trim())
      .filter(Boolean);
    const kinds = params.map((p) => ({ param: p, kind: idKind(p) }));
    if (kinds.filter((k) => k.kind).length >= 2) decls.set(m[1], kinds);
  }
}

const findings = [];
for (const file of files) {
  const src = blankComments(fs.readFileSync(file, 'utf8'));
  const rel = file.split(path.sep).join('/');
  for (const [fn, params] of decls) {
    const re = new RegExp(`\\b${fn}\\s*\\(([^)]{0,300})\\)`, 'g');
    let m;
    while ((m = re.exec(src)) !== null) {
      // skip the declaration itself
      if (/function\s+$/.test(src.slice(Math.max(0, m.index - 20), m.index))) continue;
      const args = m[1].split(',').map((a) => a.trim()).filter(Boolean);
      if (args.length < 2) continue;

      const problems = [];
      args.forEach((arg, i) => {
        const want = params[i];
        if (!want || !want.kind) return;
        const got = idKind(arg.split('.').pop() || arg) || idKind(arg.replace(/[^\w]/g, ''));
        if (!got) return;
        if (got !== want.kind && want.kind !== 'other' && got !== 'other') {
          problems.push(`position ${i + 1} wants ${want.param} (${want.kind}), got ${arg} (${got})`);
        }
      });

      /* The same expression in two id positions that mean different things is
         the notifications/count shape exactly. */
      const idArgs = args.filter((a, i) => params[i]?.kind);
      const dupes = idArgs.filter((a, i) => idArgs.indexOf(a) !== i);
      const distinctKinds = new Set(args.map((a, i) => params[i]?.kind).filter(Boolean));
      if (dupes.length && distinctKinds.size > 1) {
        problems.push(`the same expression "${dupes[0]}" fills two different id positions`);
      }

      if (problems.length) {
        findings.push({
          file: rel,
          line: src.slice(0, m.index).split(/\r?\n/).length,
          call: `${fn}(${args.join(', ')})`.slice(0, 110),
          signature: `${fn}(${params.map((p) => p.param).join(', ')})`,
          problems,
        });
      }
    }
  }
}

if (!findings.length) {
  console.log(`CLEAN — no id argument found out of position across ${ROOTS.join(', ')}.`);
} else {
  console.log(`${findings.length} call site(s) where an id looks out of position:\n`);
  for (const f of findings) {
    console.log(`  ${f.file}:${f.line}`);
    console.log(`     calls   ${f.call}`);
    console.log(`     declared ${f.signature}`);
    for (const p of f.problems) console.log(`     -> ${p}`);
    console.log('');
  }
  console.log('Name-based, so read it as a shortlist to check by hand.');
}
process.exit(findings.length ? 1 : 0);
