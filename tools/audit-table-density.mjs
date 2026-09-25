#!/usr/bin/env node
/**
 * TABLE DENSITY AUDIT — finds the catalog problem everywhere else.
 *
 * The Materials Catalog rendered a sixteen-column vendor matrix to carry
 * three numbers a row: 2,860px wide, 81% em-dashes, twelve columns off the
 * right edge. This finds the same shape elsewhere, statically, across every
 * page.tsx, so the live sweep only has to visit pages worth visiting.
 *
 * WHAT IT FLAGS, and why each one matters:
 *
 *   DYNAMIC_COLUMNS  a <thead> whose columns come from `.map()` over data.
 *                    This is the catalog's exact sin: column count scales
 *                    with the dataset, so the table gets wider the more data
 *                    you have, and sparse data turns it into a dash field.
 *
 *   WIDE_TABLE       a static header with many columns. Counted per table,
 *                    not per file, so a page with three small tables is not
 *                    reported as one big one.
 *
 *   MIN_WIDTH        an explicit minWidth on the table that exceeds what a
 *                    1600px window can show (~1550px of content area once
 *                    the 240px sidebar and page padding are taken).
 *
 *   MIXED_VALIGN     verticalAlign 'top' set on some cells of a table whose
 *                    others inherit 'middle'. That is the bug that had the
 *                    catalog's $9.25 floating a line above its own row.
 *
 *   FAT_STATSTRIP    a StatStrip carrying 5+ cards. Six was the catalog's
 *                    count, and four of the six repeated a fact already on
 *                    screen.
 *
 * Counting is done on a comment-stripped copy. NOTE: the repo is CRLF, so
 * every line split here is /\r?\n/ — a bare '\n' silently matches nothing
 * and the audit reports a clean bill of health on a dirty codebase. That is
 * not hypothetical; it is how an earlier version of this repo's API audit
 * managed to strip no comments at all for its entire life.
 *
 * Usage:
 *   node tools/audit-table-density.mjs            # ranked report
 *   node tools/audit-table-density.mjs --json     # machine-readable
 *   node tools/audit-table-density.mjs --selftest # fixtures
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/** Content area a 1600px-wide window actually gives a table. */
const USABLE_WIDTH = 1550;
/** A static table wider than this is worth a look. */
const WIDE_COLS = 9;
/** A stat strip this long is chrome, not information. */
const FAT_STATS = 5;

/** Blank out comments and string/template bodies so their contents never
 *  count as code. Mode stack, not a regex — a `//` inside a string literal
 *  is not a comment, and a `'` inside a comment does not open a string. */
export function blankNonCode(src) {
  const out = [];
  let mode = 'code';
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && n === '/') { mode = 'line'; out.push('  '); i++; continue; }
      if (c === '/' && n === '*') { mode = 'block'; out.push('  '); i++; continue; }
      if (c === '"' || c === "'" || c === '`') { mode = c; out.push(c); continue; }
      out.push(c); continue;
    }
    if (mode === 'line') {
      if (c === '\n') { mode = 'code'; out.push(c); continue; }
      out.push(' '); continue;
    }
    if (mode === 'block') {
      if (c === '*' && n === '/') { mode = 'code'; out.push('  '); i++; continue; }
      out.push(c === '\n' ? c : ' '); continue;
    }
    // inside a string/template
    if (c === '\\') { out.push('  '); i++; continue; }
    if (c === mode) { mode = 'code'; out.push(c); continue; }
    out.push(c === '\n' ? c : ' ');
  }
  return out.join('');
}

/** Line number of a character offset, CRLF-safe. */
const lineAt = (src, idx) => src.slice(0, idx).split(/\r?\n/).length;

/**
 * Count the top-level elements of an inline array literal body (no brackets),
 * so `['A','B',['C',x]]` is 3, not 4.
 */
export function countLiteralElements(body) {
  let depth = 0, n = 0, seen = false, mode = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (mode) { if (c === '\\') { i++; continue; } if (c === mode) mode = null; continue; }
    if (c === '"' || c === "'" || c === '`') { mode = c; seen = true; continue; }
    if ('[{('.includes(c)) { depth++; seen = true; continue; }
    if (']})'.includes(c)) { depth--; continue; }
    if (c === ',' && depth === 0) { n++; seen = false; continue; }
    if (!/\s/.test(c)) seen = true;
  }
  return n + (seen ? 1 : 0);
}

/**
 * Walk backwards from a `.map(` to find what it iterates, and decide whether
 * that thing has a FIXED length.
 *
 * This distinction is the whole point of the audit and the first version got
 * it wrong, flagging 77 files. `['Project','Dates','Rate'].map(h => <th/>)`
 * is a six-column header written compactly — the column count is baked into
 * the source. `vendorCols.map(...)` is the catalog's sixteen-wide matrix,
 * where the column count is however many vendors happen to be in the data.
 * Only the second one can grow until it falls off the screen.
 *
 * Returns { kind: 'literal', cols } | { kind: 'const', name, cols }
 *       | { kind: 'dynamic', name }
 */
export function resolveMapSource(code, mapIdx, fileConsts, depthGuard = 0) {
  // Character just before `.map(`
  let i = mapIdx - 1;
  while (i >= 0 && /\s/.test(code[i])) i--;
  if (i < 0) return { kind: 'dynamic', name: '?' };

  // A parenthesised expression, which in this codebase is almost always a
  // type assertion wrapping a literal: `([['A','a'],['B','b']] as X[]).map`.
  // Step inside, drop a trailing `as <type>`, and resolve what is left —
  // otherwise every asserted literal header reads as data-derived, which is
  // how this audit first claimed the Documents page had three sparse
  // matrices when it has three fixed five-column tables.
  if (code[i] === ')' && depthGuard < 4) {
    let d = 0, j = i;
    for (; j >= 0; j--) {
      if (code[j] === ')') d++;
      else if (code[j] === '(') { d--; if (d === 0) break; }
    }
    if (j < 0) return { kind: 'dynamic', name: '?' };
    let inner = code.slice(j + 1, i);
    const asAt = inner.lastIndexOf(' as ');
    if (asAt > 0) inner = inner.slice(0, asAt);
    // mapIdx points AT the '.' of '.map(', so the walk-back starts on the
    // last character of `inner` — not one past it.
    return resolveMapSource(inner + '.map(', inner.length, fileConsts, depthGuard + 1);
  }

  if (code[i] === ']') {
    // Inline array literal — scan back to its opening bracket.
    let depth = 0, j = i;
    for (; j >= 0; j--) {
      if (code[j] === ']') depth++;
      else if (code[j] === '[') { depth--; if (depth === 0) break; }
    }
    if (j < 0) return { kind: 'dynamic', name: '?' };
    return { kind: 'literal', cols: countLiteralElements(code.slice(j + 1, i)) };
  }

  // Identifier (possibly dotted, e.g. `data.cols`) — take the last segment.
  let end = i + 1;
  while (i >= 0 && /[A-Za-z0-9_$.]/.test(code[i])) i--;
  const name = code.slice(i + 1, end);
  if (!name) return { kind: 'dynamic', name: '?' };
  const bare = name.split('.').pop();
  if (!name.includes('.') && fileConsts.has(bare)) {
    return { kind: 'const', name: bare, cols: fileConsts.get(bare) };
  }
  return { kind: 'dynamic', name };
}

/**
 * Module-scope `const NAME = [ ... ]` whose body contains no call and no
 * spread — i.e. a hardcoded list whose length is fixed at author time.
 * Anything computed (`.filter()`, `...x`, a function call) is excluded, so a
 * const holding a derived list is correctly treated as dynamic.
 */
export function literalConsts(code) {
  const out = new Map();
  const re = /(?:^|\n)\s*const\s+([A-Za-z0-9_$]+)\s*(?::[^=]+)?=\s*\[/g;
  let m;
  while ((m = re.exec(code))) {
    const open = code.indexOf('[', m.index + m[0].length - 1);
    let depth = 0, j = open;
    for (; j < code.length; j++) {
      if (code[j] === '[') depth++;
      else if (code[j] === ']') { depth--; if (depth === 0) break; }
    }
    if (j >= code.length) continue;
    const body = code.slice(open + 1, j);
    if (/[A-Za-z0-9_$]\s*\(|\.\.\./.test(body)) continue; // computed, not literal
    out.set(m[1], countLiteralElements(body));
  }
  return out;
}

/**
 * Split a file into <thead>…</thead> regions and count the columns in each.
 * Returns one entry per thead so a page with several tables reports several.
 */
export function analyzeTables(code) {
  const fileConsts = literalConsts(code);
  const tables = [];
  const re = /<thead[\s>]/g;
  let m;
  while ((m = re.exec(code))) {
    const start = m.index;
    const end = code.indexOf('</thead>', start);
    if (end < 0) continue;
    const head = code.slice(start, end);
    // A header cell is <th, <SortableTh, or <Th — count opening tags only.
    let cols = (head.match(/<(?:th|SortableTh|Th)[\s/>]/g) || []).length;
    let dynamic = false;
    const dynSources = [];
    const mre = /\.map\s*\(/g;
    let mm;
    while ((mm = mre.exec(head))) {
      const src = resolveMapSource(head, start + mm.index - start, fileConsts);
      if (src.kind === 'dynamic') { dynamic = true; dynSources.push(src.name); }
      else {
        // The loop writes `cols` headers per iteration; the tag inside it was
        // already counted once, so add the remaining iterations.
        cols += Math.max(0, (src.cols || 0) - 1);
      }
    }
    tables.push({ line: lineAt(code, start), staticCols: cols, dynamic, dynSources });
  }
  return tables;
}

/** Explicit minWidth values written on a <table>. */
export function tableMinWidths(code) {
  const out = [];
  const re = /<table[^>]*?minWidth:\s*([^,}]+)/gs;
  let m;
  while ((m = re.exec(code))) {
    const raw = m[1].trim();
    // Literal number, or an expression like `780 + cols.length * 130` whose
    // growth is the point — report the expression, flag it as unbounded.
    const n = Number(raw);
    out.push({ line: lineAt(code, m.index), raw, px: Number.isFinite(n) ? n : null });
  }
  return out;
}

/** StatStrip item counts — one entry per StatStrip. */
export function statStripSizes(code) {
  const out = [];
  const re = /<StatStrip\s+items=\{\[/g;
  let m;
  while ((m = re.exec(code))) {
    // Walk to the matching ]} counting bracket depth, then count top-level
    // `{` objects inside — one per card.
    let depth = 0, i = m.index + m[0].length - 2, endIdx = -1;
    for (; i < code.length; i++) {
      const c = code[i];
      if (c === '[') depth++;
      else if (c === ']') { depth--; if (depth === 0) { endIdx = i; break; } }
    }
    if (endIdx < 0) continue;
    const body = code.slice(m.index + m[0].length, endIdx);
    let d = 0, cards = 0;
    for (const c of body) {
      if (c === '{') { if (d === 0) cards++; d++; }
      else if (c === '}') d--;
    }
    out.push({ line: lineAt(code, m.index), cards });
  }
  return out;
}

/** verticalAlign: 'top' occurrences — the floating-cell bug's fingerprint. */
export function topAligns(code) {
  const out = [];
  const re = /verticalAlign:\s*['"]top['"]/g;
  let m;
  while ((m = re.exec(code))) out.push(lineAt(code, m.index));
  return out;
}

export function auditFile(file) {
  const raw = readFileSync(file, 'utf8');
  const code = blankNonCode(raw);
  const findings = [];

  for (const t of analyzeTables(code)) {
    if (t.dynamic) {
      findings.push({
        kind: 'DYNAMIC_COLUMNS', line: t.line, weight: 100,
        detail: `<thead> columns come from ${t.dynSources.join(', ')} — count scales with the data (${t.staticCols} written out)`,
      });
    } else if (t.staticCols >= WIDE_COLS) {
      findings.push({
        kind: 'WIDE_TABLE', line: t.line, weight: 20 + t.staticCols,
        detail: `${t.staticCols} columns`,
      });
    }
  }

  for (const w of tableMinWidths(code)) {
    if (w.px === null) {
      findings.push({
        kind: 'MIN_WIDTH', line: w.line, weight: 90,
        detail: `table minWidth is an expression that grows with the data: ${w.raw}`,
      });
    } else if (w.px > USABLE_WIDTH) {
      findings.push({
        kind: 'MIN_WIDTH', line: w.line, weight: 30,
        detail: `table minWidth ${w.px}px > ${USABLE_WIDTH}px usable — forces horizontal scroll`,
      });
    }
  }

  for (const s of statStripSizes(code)) {
    if (s.cards >= FAT_STATS) {
      findings.push({
        kind: 'FAT_STATSTRIP', line: s.line, weight: 10 + s.cards,
        detail: `${s.cards} stat cards`,
      });
    }
  }

  const tops = topAligns(code);
  // Only interesting when the file has a table: a lone verticalAlign on a
  // flex layout is not the mixed-cell bug.
  if (tops.length && /<t(?:head|body|able)[\s>]/.test(code)) {
    findings.push({
      kind: 'MIXED_VALIGN', line: tops[0], weight: 15,
      detail: `${tops.length} cell(s) pinned verticalAlign:'top' in a table — check the others are not 'middle'`,
    });
  }

  return findings;
}

function listPages() {
  const out = execSync('git ls-files "app/**/*.tsx"', { encoding: 'utf8' });
  return out.split(/\r?\n/).filter(Boolean);
}

/* ────────────────────────────── self-test ────────────────────────────── */
function selftest() {
  const cases = [
    ['blankNonCode kills line comments',
      () => !blankNonCode('const a=1; // <thead> <th/>').includes('thead')],
    ['blankNonCode kills block comments',
      () => !blankNonCode('/* <thead><th/><th/> */ const a=1;').includes('thead')],
    ['blankNonCode keeps code outside comments',
      () => blankNonCode('/* x */ const thead=1;').includes('thead')],
    ['blankNonCode does not treat // inside a string as a comment',
      () => blankNonCode('const u = "http://x"; const k = 1;').includes('const k')],
    ['blankNonCode survives escaped quote in a string',
      () => blankNonCode("const s = 'it\\'s'; const k = 1;").includes('const k')],
    ['analyzeTables counts static columns',
      () => analyzeTables('<thead><tr><th/><th/><th/></tr></thead>')[0].staticCols === 3],
    ['analyzeTables counts SortableTh',
      () => analyzeTables('<thead><tr><SortableTh label="a" /><SortableTh label="b" /></tr></thead>')[0].staticCols === 2],
    ['analyzeTables flags .map columns',
      () => analyzeTables('<thead><tr><th/>{cols.map((c)=><th key={c}/>)}</tr></thead>')[0].dynamic === true],
    ['analyzeTables does not flag a static head as dynamic',
      () => analyzeTables('<thead><tr><th/><th/></tr></thead>')[0].dynamic === false],
    ['analyzeTables reports each thead separately',
      () => analyzeTables('<thead><tr><th/></tr></thead>x<thead><tr><th/><th/></tr></thead>').length === 2],
    ['tableMinWidths reads a literal',
      () => tableMinWidths('<table style={{ minWidth: 1800 }}>')[0].px === 1800],
    ['tableMinWidths marks an expression as unbounded',
      () => tableMinWidths('<table style={{ minWidth: 780 + cols.length * 130 }}>')[0].px === null],
    ['statStripSizes counts cards',
      () => statStripSizes('<StatStrip items={[{a:1},{b:{x:2}},{c:3}]} />')[0].cards === 3],
    ['statStripSizes ignores nested objects',
      () => statStripSizes('<StatStrip items={[{a:{deep:{er:1}}}]} />')[0].cards === 1],
    ['topAligns finds pinned top alignment',
      () => topAligns("<td style={{ verticalAlign: 'top' }}>").length === 1],
    ['literal .map header is NOT dynamic',
      () => analyzeTables("<thead><tr>{['A','B','C'].map(h=><th key={h}/>)}</tr></thead>")[0].dynamic === false],
    ['literal .map header counts its elements',
      () => analyzeTables("<thead><tr>{['A','B','C'].map(h=><th key={h}/>)}</tr></thead>")[0].staticCols === 3],
    ['nested literal rows count once each',
      () => countLiteralElements("['A','a'],['B','b'],['C','c']") === 3],
    ['data-derived .map header IS dynamic',
      () => analyzeTables('<thead><tr>{vendorCols.map((v)=><th key={v}/>)}</tr></thead>')[0].dynamic === true],
    ['module const literal resolves as static',
      () => { const c = "const COLS = ['a','b','c','d'];\n<thead><tr>{COLS.map(h=><th key={h}/>)}</tr></thead>"; const t = analyzeTables(c)[0]; return t.dynamic === false && t.staticCols === 4; }],
    ['computed const is treated as dynamic',
      () => analyzeTables("const COLS = [...base, x];\n<thead><tr>{COLS.map(h=><th key={h}/>)}</tr></thead>")[0].dynamic === true],
    ['dotted data source is dynamic',
      () => analyzeTables('<thead><tr>{data.cols.map((v)=><th key={v}/>)}</tr></thead>')[0].dynamic === true],
    ['type-asserted literal is NOT dynamic',
      () => analyzeTables(String.raw`<thead><tr>{([['A','a'],['B','b'],['C','c']] as [string,string][]).map(([h,k])=><th key={h}/>)}</tr></thead>`)[0].dynamic === false],
    ['type-asserted literal counts its rows',
      () => analyzeTables(String.raw`<thead><tr>{([['A','a'],['B','b'],['C','c']] as [string,string][]).map(([h,k])=><th key={h}/>)}</tr></thead>`)[0].staticCols === 3],
    ['parenthesised data source is still dynamic',
      () => analyzeTables('<thead><tr>{(cols as string[]).map((v)=><th key={v}/>)}</tr></thead>')[0].dynamic === true],
    ['lineAt is CRLF-safe',
      () => lineAt('a\r\nb\r\nc', 6) === 3],
  ];
  let pass = 0;
  for (const [name, fn] of cases) {
    let ok = false;
    try { ok = !!fn(); } catch (e) { ok = false; }
    if (ok) pass++; else console.log('  FAIL ' + name);
  }
  console.log(`selftest ${pass}/${cases.length}`);
  return pass === cases.length;
}

/* ─────────────────────────────── main ─────────────────────────────── */
const args = process.argv.slice(2);
if (args.includes('--selftest')) {
  process.exit(selftest() ? 0 : 1);
}

const rows = [];
for (const f of listPages()) {
  const findings = auditFile(f);
  if (findings.length) {
    rows.push({ file: f, findings, score: findings.reduce((s, x) => s + x.weight, 0) });
  }
}
rows.sort((a, b) => b.score - a.score);

if (args.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const tally = {};
  for (const r of rows) for (const f of r.findings) tally[f.kind] = (tally[f.kind] || 0) + 1;
  console.log('TABLE DENSITY AUDIT');
  console.log('===================');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(16)} ${v}`);
  }
  console.log(`\n${rows.length} file(s) with findings, worst first:\n`);
  for (const r of rows) {
    console.log(`${r.file}  [${r.score}]`);
    for (const f of r.findings) console.log(`    ${String(f.line).padStart(5)}  ${f.kind.padEnd(16)} ${f.detail}`);
  }
}
