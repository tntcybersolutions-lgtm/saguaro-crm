#!/usr/bin/env node
/**
 * audit-unchecked-writes — writes whose result nobody looks at.
 *
 * supabase-js does NOT throw when the database rejects a write. It returns
 * `{ data, error }`. So this:
 *
 *     await supabase.from('schedule_of_values').insert(rows);
 *
 * fails completely silently: no exception, no log line, no clue. That exact
 * line is why "Yes, build it all" reported a schedule of values it had not
 * created — four of the column names were wrong, Postgres rejected every row,
 * and the error was dropped on the floor.
 *
 * A write is counted as checked when the call is destructured (`const { error }`),
 * assigned, returned, or explicitly thrown on. Anything else is a place where
 * the database can say no and the product will say yes.
 */

const fs = require('fs');
const path = require('path');

const WRITE = /\.(insert|update|upsert|delete)\s*\(/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const roots = process.argv.slice(2);
const files = (roots.length ? roots : ['app', 'lib']).flatMap((r) => walk(r));

const hits = [];
for (const file of files) {
  const rel = file.split(path.sep).join('/');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

  lines.forEach((line, i) => {
    if (!WRITE.test(line)) return;
    if (!/\bawait\s/.test(line)) return;

    /* Checked: the call's result is captured, returned, or thrown on. Look at
       the statement, which may have started on an earlier line. */
    const start = Math.max(0, i - 3);
    const stmt = lines.slice(start, i + 1).join(' ');

    const checked =
      /(const|let|var)\s*\{[^}]*\}\s*=\s*await/.test(stmt) ||
      /(const|let|var)\s+\w+\s*=\s*await/.test(stmt) ||
      /return\s+await/.test(stmt) ||
      /=\s*await/.test(stmt) ||
      /* One destructure feeding a ternary of two awaits — the update-or-insert
         shape. Both branches are captured by the same `const { error }`, but the
         await sits past a `?` or `:` so the patterns above miss it and the
         time-entry save was reported twice after it had been fixed. */
      /(const|let|var)\s*\{[^}]*\}\s*=[^;]*await/.test(stmt);

    if (checked) return;

    /* Severity, because 138 findings sorted by filename is a list nobody works
       through. What matters is what the user loses when the write is refused.

       data     an insert/upsert of a record the user believes they saved.
                Silent failure means their work is gone and the UI said OK.
       cleanup  a delete. The row survives; usually visible on next load.
       flag     a status/flag-only update on the happy path. Leaves the object
                stuck in the wrong state — a takeoff spinning forever.
       recovery a write inside a catch. Already handling a failure; if this one
                also fails there is nothing to tell the user, but it must be
                logged or the stuck state has no explanation. */
    const isDelete = /\.delete\s*\(/.test(line);
    const isInsert = /\.(insert|upsert)\s*\(/.test(line);
    /* Am I inside a catch block? Scan back for the nearest catch/try boundary. */
    let inCatch = false;
    for (let j = i; j >= 0 && j > i - 40; j--) {
      if (/\}\s*catch\s*(\([^)]*\))?\s*\{/.test(lines[j])) { inCatch = true; break; }
      if (/^\s*try\s*\{/.test(lines[j])) break;
    }
    /* An update whose payload is only a status/flag/timestamp. */
    const flagOnly = /\.update\s*\(\s*\{\s*(status|is_[a-z_]+|[a-z_]*_at)\s*:/.test(line);

    const severity = inCatch ? 'recovery' : isInsert ? 'data' : isDelete ? 'cleanup' : flagOnly ? 'flag' : 'data';

    hits.push({ rel, line: i + 1, severity, text: line.trim().slice(0, 96) });
  });
}

const ORDER = ['data', 'flag', 'cleanup', 'recovery'];
const BLURB = {
  data: 'user work silently lost — the UI reports success',
  flag: 'object left in the wrong state (stuck spinner, wrong badge)',
  cleanup: 'delete that may not have happened',
  recovery: 'failure inside a failure handler — needs a log line, not a throw',
};

console.log(`Writes whose result is never checked: ${hits.length}`);
console.log('(supabase-js returns { error } — it does not throw)');
console.log('');
for (const s of ORDER) {
  const n = hits.filter((h) => h.severity === s).length;
  if (n) console.log(`  ${String(n).padStart(4)}  ${s.padEnd(9)} ${BLURB[s]}`);
}

for (const s of ORDER) {
  const group = hits.filter((h) => h.severity === s);
  if (!group.length) continue;
  console.log('');
  console.log('-'.repeat(74));
  console.log(`${s.toUpperCase()}  (${group.length})  — ${BLURB[s]}`);
  console.log('-'.repeat(74));
  const byFile = new Map();
  for (const h of group) {
    if (!byFile.has(h.rel)) byFile.set(h.rel, []);
    byFile.get(h.rel).push(h);
  }
  for (const [rel, list] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${rel}  (${list.length})`);
    for (const h of list.slice(0, 4)) console.log(`      ${h.line}: ${h.text}`);
    if (list.length > 4) console.log(`      … ${list.length - 4} more`);
  }
}

process.exitCode = hits.length ? 1 : 0;
