#!/usr/bin/env node
/**
 * audit-column-refs — does every query name a column that exists?
 *
 * This is the bug that keeps happening, and nothing catches it:
 *
 *   .select('bid_package:bid_package_id(id, title, …)')  bid_packages has `name`
 *   s.bid_amount                                          bid_submissions has base_amount
 *   .eq('project_id', params.projectId)                   photo_entity_links has no project_id
 *
 * The first meant a subcontractor's bid list 500'd before it could return
 * anything. The second reported every incoming bid to the GC as $0. The third
 * broke filtering photos by entity or tag, in four places. All three shipped,
 * all three sat there, and all three were invisible to TypeScript — the
 * Supabase client takes a string, and a string is a string. `npm run build`
 * cannot see it either. It only shows up as a 500 in front of a customer.
 *
 * lib/database.types.ts is generated from the live schema, so it is the truth
 * this checks against. Every .eq/.neq/.in/.order/.is with a literal column, and
 * every simple .select() column list, is looked up in the table named by the
 * nearest preceding .from().
 *
 * Deliberately conservative — a security-shaped audit that cries wolf gets
 * ignored, and this one is easy to make noisy. It skips embedded selects,
 * anything with parentheses or a star, computed aliases, and any table it
 * cannot find in the generated types.
 */

const fs = require('fs');
const path = require('path');

const TYPES = 'lib/database.types.ts';

/* ── The schema, from the generated types ─────────────────────────────────── */
function loadSchema() {
  const src = fs.readFileSync(TYPES, 'utf8');
  const tables = new Map();

  /* Each table appears as `name: { Row: { col: type; ... } ... }`. Take the Row
     block: it lists every column exactly once. */
  const re = /^\s{6}(\w+):\s*\{\s*$/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const table = m[1];
    const rowIdx = src.indexOf('Row: {', m.index);
    if (rowIdx < 0) continue;
    /* Only accept a Row that belongs to THIS table — i.e. appears before the
       next table declaration. */
    const nextTable = re.lastIndex;
    const lookahead = src.slice(nextTable, nextTable + 4000);
    const nextDecl = lookahead.search(/^\s{6}\w+:\s*\{\s*$/m);
    const bound = nextDecl < 0 ? src.length : nextTable + nextDecl;
    if (rowIdx > bound) continue;

    const end = src.indexOf('\n        }', rowIdx);
    if (end < 0) continue;
    const body = src.slice(rowIdx + 6, end);
    const cols = new Set();
    for (const c of body.matchAll(/^\s+(\w+)\??:/gm)) cols.add(c[1]);
    if (cols.size) tables.set(table, cols);
  }
  return tables;
}

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

const lineAt = (src, i) => src.slice(0, i).split(/\r?\n/).length;

const schema = loadSchema();
const problems = [];
let checked = 0;
let queries = 0;

for (const f of walk('app/api').concat(walk('lib'))) {
  const rel = f.split(path.sep).join('/');
  if (rel === TYPES) continue;
  const src = fs.readFileSync(rel, 'utf8');
  if (!/\.from\(/.test(src)) continue;
  checked++;

  /* Each .from('table') owns the chained calls up to the next .from( or the end
     of the statement. A generous window is fine — the next .from() bounds it. */
  const froms = [...src.matchAll(/\.from\(\s*['"`](\w+)['"`]\s*\)/g)];
  for (let i = 0; i < froms.length; i++) {
    const table = froms[i][1];
    const cols = schema.get(table);
    if (!cols) continue; // unknown table — storage buckets, or types not regenerated
    queries++;

    const start = froms[i].index + froms[i][0].length;
    const stop = i + 1 < froms.length ? froms[i + 1].index : Math.min(src.length, start + 1200);
    const chain = src.slice(start, stop);

    /* Filters naming a literal column. */
    for (const c of chain.matchAll(/\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|order)\(\s*['"`]([\w.]+)['"`]/g)) {
      const col = c[2];
      /* A dotted reference is a filter on an embedded table — out of scope. */
      if (col.includes('.')) continue;
      if (!cols.has(col)) {
        problems.push(
          `${rel}:${lineAt(src, start + c.index)}\n      .${c[1]}('${col}') — ${table} has no column "${col}"\n      the client takes a string, so nothing here fails until it runs`,
        );
      }
    }

    /* Simple select lists only. Anything with a paren is an embed, anything
       with a star is a wildcard, and neither can be checked this way. */
    const sel = /\.select\(\s*['"`]([^'"`]+)['"`]/.exec(chain);
    if (sel && !sel[1].includes('(') && !sel[1].includes('*')) {
      for (const raw of sel[1].split(',')) {
        const col = raw.trim().split(':').pop().trim();
        if (!col || col.includes('.')) continue;
        if (!cols.has(col)) {
          problems.push(
            `${rel}:${lineAt(src, start + sel.index)}\n      .select() names "${col}" — ${table} has no such column`,
          );
        }
      }
    }
  }
}

console.log('='.repeat(74));
console.log('COLUMN REFERENCES — does every query name a column that exists?');
console.log('='.repeat(74));
console.log(`  tables in schema   ${schema.size}`);
console.log(`  files with queries ${checked}`);
console.log(`  queries checked    ${queries}`);
console.log('');
console.log(`  PROBLEMS           ${problems.length}`);
if (problems.length) {
  console.log('');
  problems.forEach((p) => console.log(`  ${p}`));
}
if (!schema.size || !queries) {
  console.log('');
  console.log('PARSE FAILED — no schema or no queries found. Clean means nothing.');
  process.exitCode = 2;
} else {
  process.exitCode = problems.length ? 1 : 0;
}
