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
      /=\s*await/.test(stmt);

    if (checked) return;

    hits.push({ rel, line: i + 1, text: line.trim().slice(0, 96) });
  });
}

console.log(`Writes whose result is never checked: ${hits.length}`);
console.log('(supabase-js returns { error } — it does not throw)');
console.log('');

const byFile = new Map();
for (const h of hits) {
  if (!byFile.has(h.rel)) byFile.set(h.rel, []);
  byFile.get(h.rel).push(h);
}
for (const [rel, list] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${rel}  (${list.length})`);
  for (const h of list.slice(0, 4)) console.log(`      ${h.line}: ${h.text}`);
  if (list.length > 4) console.log(`      … ${list.length - 4} more`);
}

process.exitCode = hits.length ? 1 : 0;
