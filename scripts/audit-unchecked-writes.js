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
 * and the error was dropped on the floor. The same shape was live on the
 * payroll screen, printing "Week submitted for approval" over a refused
 * insert.
 *
 * A write counts as checked when its result is captured (`const { error } =`),
 * returned, handled by a `.then()` on the builder, or wrapped in must() /
 * tryWrite() from lib/db-write.
 *
 * Detection is statement-based, not line-based. The first version tested one
 * line at a time and so could not see a statement whose `await` and `.insert(`
 * sit on different lines — which is most multi-line inserts in this codebase.
 * It reported 138 problems where there were 234.
 */

const fs = require('fs');
const path = require('path');

const BACKSLASH = String.fromCharCode(92);
const BACKTICK = String.fromCharCode(96);

const WRITE_CALL = /\.(insert|update|upsert|delete)\s*\(/;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
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
    if (paren < 0 || brace < 0 || bracket < 0) return -1;
    i++;
  }
  return -1;
}

const roots = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const files = (roots.length ? roots : ['app', 'lib']).flatMap((r) => walk(r));

const hits = [];
for (const file of files) {
  const rel = file.split(path.sep).join('/');
  if (rel.endsWith('lib/db-write.ts')) continue; // documents the pattern it fixes
  const src = fs.readFileSync(file, 'utf8');
  if (!/\.from\(/.test(src)) continue;

  const lines = src.split(/\r?\n/);
  const lineOf = (off) => src.slice(0, off).split(/\r?\n/).length;

  /**
   * Spans of statements whose result IS captured.
   *
   *   const { error } = manual.id
   *     ? await sb.from('time_entries').update({ … })
   *     : await sb.from('time_entries').insert({ … });
   *
   * Both awaits sit hundreds of characters after the destructure, so no fixed
   * lookbehind sees it, and walking backwards lands inside the update's own
   * object literal. Recording the whole captured statement and skipping any
   * await inside it is the version that actually holds.
   */
  const capturedSpans = [];
  {
    const CAP = /(const|let|var)\s*(\{[^}]*\}|[\w$]+)\s*=/g;
    let c;
    while ((c = CAP.exec(src)) !== null) {
      const e = statementEnd(src, c.index);
      if (e > c.index) capturedSpans.push([c.index, e]);
    }
  }
  const isCaptured = (off) => capturedSpans.some(([a, b]) => off > a && off < b);

  const spans = [];
  const AWAIT = /\bawait\s+/g;
  let m;
  while ((m = AWAIT.exec(src)) !== null) {
    const exprStart = m.index + m[0].length;
    const end = statementEnd(src, exprStart);
    if (end < 0) continue;
    const expr = src.slice(exprStart, end);
    if (!/\.from\s*\(/.test(expr) || !WRITE_CALL.test(expr)) continue;

    /* Result captured, returned, or handled inline. */
    const before = src.slice(Math.max(0, m.index - 160), m.index);
    const checked =
      isCaptured(m.index) ||
      /(const|let|var)\s*\{[^}]*\}\s*=\s*$/.test(before) ||
      /(const|let|var)\s+[\w$]+\s*=\s*$/.test(before) ||
      /return\s+$/.test(before) ||
      /=\s*$/.test(before) ||
      /(const|let|var)\s*\{[^}]*\}\s*=[^;]*$/.test(before) ||
      /\.then\s*\(/.test(expr) ||
      /^\s*(must|tryWrite)\s*\(/.test(expr);
    if (checked) continue;

    spans.push({ exprStart, end, expr, at: m.index });
  }

  /* Drop spans that merely enclose a real write. */
  for (const a of spans) {
    if (spans.some((b) => b !== a && b.exprStart >= a.exprStart && b.end <= a.end)) continue;

    const i = lineOf(a.at) - 1;
    const line = lines[i] ?? '';
    const isDelete = /\.delete\s*\(/.test(a.expr);
    const isInsert = /\.(insert|upsert)\s*\(/.test(a.expr);

    let inCatch = false;
    for (let j = i; j >= 0 && j > i - 40; j--) {
      if (/\}\s*catch\s*(\([^)]*\))?\s*\{/.test(lines[j])) { inCatch = true; break; }
      if (/^\s*try\s*\{/.test(lines[j])) break;
    }
    const flagOnly = /\.update\s*\(\s*\{\s*(status|is_[a-z_]+|[a-z_]*_at)\s*:/.test(a.expr);
    const severity = inCatch ? 'recovery' : isInsert ? 'data' : isDelete ? 'cleanup' : flagOnly ? 'flag' : 'data';

    hits.push({ rel, line: i + 1, severity, text: line.trim().slice(0, 96) });
  }
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
