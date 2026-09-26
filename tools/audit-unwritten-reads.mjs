#!/usr/bin/env node
/**
 * audit-unwritten-reads — columns the product READS but never WRITES.
 *
 * WHY THIS EXISTS
 *
 * This shape of bug has now cost real money twice in this codebase:
 *
 *   projects.open_punch_count — read by the closeout gate, written by nothing.
 *   Closeout told a GC "punch list is clear, schedule the final inspection"
 *   on a job with three open items.
 *
 *   pay_applications.retainage_held — summed by the cash-flow forecast,
 *   written by nothing. pay-apps/create stores retainage as total_retainage.
 *   A GC with $373K held back saw $0 in their forecast.
 *
 * Both were silent. A column that is always NULL reads as 0, and 0 is a
 * perfectly plausible number, so nothing errors and nobody notices until the
 * wrong number is in front of a customer.
 *
 * HOW IT DECIDES
 *
 * Three signals, and it only reports when all three agree, because any one
 * alone is noisy:
 *
 *   1. some .select() in app/api names the column
 *   2. no .insert()/.update() object literal in app/api sets it
 *   3. the column is entirely NULL (or entirely 0) in the live database
 *
 * Signal 3 is what makes this usable. Plenty of columns are written by
 * triggers, defaults, migrations or raw SQL rather than by a route, and
 * without checking the data every one of those is a false positive. A column
 * that no route writes AND that has never held a value in production is dead.
 *
 * It emits SQL rather than connecting itself, so the database check runs
 * through whatever client is at hand and the output can be read before
 * anything is believed.
 *
 * Usage:
 *   node tools/audit-unwritten-reads.mjs            # print candidates + the SQL
 *   node tools/audit-unwritten-reads.mjs --sql-only # just the SQL
 */
import fs from 'node:fs';
import path from 'node:path';

const API_ROOT = 'app/api';
const SKIP = /node_modules|\.next|dist/;

/** Columns every table has, or that the platform manages. Never interesting. */
const BORING = new Set([
  'id', 'tenant_id', 'created_at', 'updated_at', 'created_by', 'updated_by',
  'deleted_at', 'deleted_by', 'archived_at', 'archived_by', 'is_deleted',
  'is_archived', 'metadata', 'custom_fields',
]);

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

/** table -> Set(column), for both directions. */
const read = new Map();
const written = new Map();
const readSites = new Map(); // "table.column" -> [file:line]

const add = (map, table, col) => {
  if (BORING.has(col)) return;
  if (!map.has(table)) map.set(table, new Set());
  map.get(table).add(col);
};

/**
 * `.from('x')` binds the table for the calls that follow it in the same chain.
 * Splitting on `.from(` keeps each chain with its own table without needing a
 * parser — a chain cannot name two tables.
 */
for (const file of walk(API_ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  const lineOf = (i) => src.slice(0, i).split(/\r?\n/).length;

  const fromRe = /\.from\(\s*['"`]([a-z0-9_]+)['"`]\s*\)/g;
  let m;
  const chains = [];
  while ((m = fromRe.exec(src)) !== null) chains.push({ table: m[1], start: m.index });
  for (let i = 0; i < chains.length; i++) {
    chains[i].end = i + 1 < chains.length ? chains[i + 1].start : src.length;
  }

  for (const { table, start, end } of chains) {
    const chunk = src.slice(start, end);

    // reads: .select('a, b, c') — template literals and spread selects skipped
    const selRe = /\.select\(\s*['"]([^'"]*)['"]/g;
    let s;
    while ((s = selRe.exec(chunk)) !== null) {
      for (const raw of s[1].split(',')) {
        const col = raw.trim().split(/[\s(:]/)[0];
        if (!/^[a-z][a-z0-9_]*$/.test(col) || col === '*') continue;
        add(read, table, col);
        const key = `${table}.${col}`;
        if (!readSites.has(key)) readSites.set(key, []);
        if (readSites.get(key).length < 4) {
          readSites.get(key).push(`${file}:${lineOf(start + s.index)}`);
        }
      }
    }

    // writes: .insert({ a: 1, b: x }) / .update({ ... }) — object-literal keys
    const wrRe = /\.(insert|update|upsert)\(\s*(\{[\s\S]{0,3000}?\})\s*(?:as\s|\)|,)/g;
    let w;
    while ((w = wrRe.exec(chunk)) !== null) {
      for (const k of w[2].matchAll(/(?:^|[{,\s])([a-z][a-z0-9_]*)\s*:/g)) add(written, table, k[1]);
      // a spread of a prepared object means we cannot see the keys — treat the
      // whole table as opaque for writes rather than reporting false positives
      if (/\.\.\./.test(w[2])) add(written, table, '__SPREAD__');
    }
    // .insert(rowVariable) — same problem, same treatment
    if (/\.(insert|update|upsert)\(\s*[A-Za-z_]/.test(chunk)) add(written, table, '__SPREAD__');
  }
}

const candidates = [];
for (const [table, cols] of read) {
  const w = written.get(table) ?? new Set();
  const opaque = w.has('__SPREAD__');
  for (const col of cols) {
    if (w.has(col)) continue;
    candidates.push({ table, col, opaque, sites: readSites.get(`${table}.${col}`) ?? [] });
  }
}
candidates.sort((a, b) => a.table.localeCompare(b.table) || a.col.localeCompare(b.col));

const sqlOnly = process.argv.includes('--sql-only');

if (!sqlOnly) {
  const strong = candidates.filter((c) => !c.opaque);
  console.log(`${candidates.length} column(s) read by app/api but never written there.`);
  console.log(`${strong.length} of those are in tables where every write is a visible object literal,`);
  console.log(`so the absence is meaningful rather than hidden behind a spread.\n`);
  for (const c of strong.slice(0, 60)) {
    console.log(`  ${c.table}.${c.col}`);
    for (const s of c.sites) console.log(`      read at ${s}`);
  }
  console.log('\n--- run this against the database; anything with 0 non-null rows is dead ---\n');
}

/* One UNION ALL so the whole thing is a single round trip. Columns that do not
   exist in the schema are filtered out by joining information_schema, which
   also drops anything this script mis-parsed out of a select string. */
const pairs = candidates
  .filter((c) => !c.opaque)
  .map((c) => `('${c.table}','${c.col}')`);

console.log(`WITH candidate(tbl, col) AS (VALUES\n  ${pairs.join(',\n  ')}\n)
SELECT c.tbl, c.col,
       format('SELECT %L::text AS tbl, %L::text AS col, count(*) AS rows, count(%I) AS non_null, count(*) FILTER (WHERE %I::text NOT IN (''0'',''false'','''')) AS meaningful FROM %I',
              c.tbl, c.col, c.col, c.col, c.tbl) AS probe
FROM candidate c
JOIN information_schema.columns ic
  ON ic.table_schema = 'public' AND ic.table_name = c.tbl AND ic.column_name = c.col
ORDER BY 1, 2;`);
