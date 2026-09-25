#!/usr/bin/env node
/**
 * BUTTON ORDER AUDIT — one convention, every screen.
 *
 * Procore, Autodesk Build and every other tool a GC already has open put the
 * primary action LAST in a toolbar: secondary actions to the left, the thing
 * you came to do on the right, nearest the thumb and nearest the eye's
 * resting point after it scans the row. When half the screens in an app do
 * it the other way round, people stop reading button rows and start hunting,
 * and the hunt costs a second on every screen, every time.
 *
 * In this codebase the convention is expressed in the styles themselves:
 *   goldButtonStyle   the primary action  (there should be at most one)
 *   ghostButtonStyle  everything else
 *
 * So the rule is checkable: inside a `actions={...}` block, the LAST styled
 * button should be the gold one, and there should not be two gold ones.
 *
 * WHAT IT REPORTS
 *   PRIMARY_NOT_LAST   a gold button with ghost buttons after it
 *   TWO_PRIMARIES      more than one gold button in the same toolbar
 *   NO_PRIMARY         a multi-button toolbar where nothing is primary,
 *                      so the eye has nothing to land on (info only)
 *
 * Deliberately NOT reported: a single-button toolbar (order is meaningless),
 * and buttons outside an `actions=` block, where there is no row to order.
 *
 * Usage:
 *   node tools/audit-button-order.mjs
 *   node tools/audit-button-order.mjs --json
 *   node tools/audit-button-order.mjs --selftest
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/** Line number of a character offset. CRLF-safe — see the note in
 *  audit-table-density.mjs about what a bare '\n' costs you here. */
const lineAt = (src, idx) => src.slice(0, idx).split(/\r?\n/).length;

/**
 * Extract each `actions={ ... }` block with balanced-brace scanning.
 * A regex cannot do this: the block is full of nested objects and JSX.
 */
export function actionBlocks(code) {
  const out = [];
  const re = /\bactions=\{/g;
  let m;
  while ((m = re.exec(code))) {
    const open = m.index + m[0].length - 1;
    let depth = 0, i = open, mode = null;
    for (; i < code.length; i++) {
      const c = code[i];
      if (mode) {
        if (c === '\\') { i++; continue; }
        if (c === mode) mode = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { mode = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) break; }
    }
    if (i >= code.length) continue;
    out.push({ line: lineAt(code, m.index), body: code.slice(open + 1, i) });
  }
  return out;
}

/**
 * The ordered sequence of button kinds in a toolbar body.
 *
 * Reads style references in source order. A button is 'primary' if its style
 * spreads goldButtonStyle, 'secondary' if it spreads ghostButtonStyle. Other
 * buttons are not classified — an icon-only close button has neither style
 * and is not part of the primary/secondary ordering question.
 */
export function buttonSequence(body) {
  const seq = [];
  const re = /\b(goldButtonStyle|ghostButtonStyle)\b/g;
  let m;
  while ((m = re.exec(body))) {
    seq.push({
      kind: m[1] === 'goldButtonStyle' ? 'primary' : 'secondary',
      at: m.index,
      conditional: insideConditional(body, m.index),
      destructive: looksDestructive(body, m.index),
    });
  }
  return seq;
}

/**
 * Is this style reference inside a JSX conditional — `{cond && (…)}` or a
 * `? … : …` — rather than rendered unconditionally?
 *
 * This exists because the first run of this audit accused three correct
 * files. The QuickBooks toolbar is `connected ? <gold Sync> : <gold Connect>`
 * — two gold buttons in the source, exactly one on the screen, ever. The Pay
 * App toolbar is the same shape with sibling guards: the Save button renders
 * only in edit mode, the workflow button only out of it.
 *
 * Approximated by brace depth: anything nested deeper than the top level of
 * the actions body is treated as conditional. That is deliberately
 * conservative — it will miss a genuine double-primary that happens to sit
 * inside a conditional, and that is the right way to be wrong. An audit that
 * cries wolf gets ignored, and then it catches nothing at all.
 */
export function insideConditional(body, idx) {
  let depth = 0, mode = null;
  for (let i = 0; i < idx; i++) {
    const c = body[i];
    if (mode) { if (c === '\\') { i++; continue; } if (c === mode) mode = null; continue; }
    if (c === '"' || c === "'" || c === '`') { mode = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return depth > 0;
}

/**
 * A button styled red is a destructive action, and destructive actions
 * belong AFTER the primary — separated from it, last, where a misclick is
 * least likely. Delete sitting to the right of Send on the invoice screen is
 * the convention working, not breaking.
 */
export function looksDestructive(body, idx) {
  const win = body.slice(idx, idx + 260);
  return /colors?\.red|#ef4444|#EF4444|239,\s*68,\s*68|rgba\(239/.test(win);
}

export function auditFile(file) {
  const raw = readFileSync(file, 'utf8');
  const findings = [];
  for (const block of actionBlocks(raw)) {
    const seq = buttonSequence(block.body);
    if (seq.length < 2) continue; // one button has no order to get wrong

    const primaries = seq.filter(s => s.kind === 'primary');
    // Only unconditional primaries can be proven to coexist on screen.
    const alwaysPrimaries = primaries.filter(s => !s.conditional);
    const lastPrimaryIdx = seq.map(s => s.kind).lastIndexOf('primary');
    // Buttons after the primary that are NOT destructive. A red Delete to the
    // right of the primary is the convention, not a violation of it.
    const strandedAfter = seq.slice(lastPrimaryIdx + 1).filter(s => !s.destructive);

    if (alwaysPrimaries.length > 1) {
      findings.push({
        kind: 'TWO_PRIMARIES', line: block.line, weight: 30,
        detail: `${alwaysPrimaries.length} unconditional gold buttons in one toolbar — nothing reads as the main action`,
      });
    } else if (primaries.length === 0) {
      findings.push({
        kind: 'NO_PRIMARY', line: block.line, weight: 5,
        detail: `${seq.length} buttons, none primary — the eye has nothing to land on`,
      });
    } else if (strandedAfter.length > 0) {
      findings.push({
        kind: 'PRIMARY_NOT_LAST', line: block.line, weight: 20,
        detail: `primary button is #${lastPrimaryIdx + 1} of ${seq.length} — ${strandedAfter.length} non-destructive button(s) sit after it`,
      });
    }
  }
  return findings;
}

function listPages() {
  return execSync('git ls-files "app/**/*.tsx"', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
}

/* ────────────────────────────── self-test ────────────────────────────── */
function selftest() {
  const cases = [
    ['actionBlocks finds one block',
      () => actionBlocks('<X actions={<><button/></>} />').length === 1],
    ['actionBlocks balances nested braces',
      () => actionBlocks('<X actions={<b style={{a:{b:1}}}/>} /> after').length === 1],
    ['actionBlocks ignores a brace inside a string',
      () => actionBlocks('<X actions={<b t="}" />} /> z')[0].body.includes('t="}"')],
    ['actionBlocks finds several',
      () => actionBlocks('actions={<a/>} actions={<b/>}').length === 2],
    ['buttonSequence reads order',
      () => JSON.stringify(buttonSequence('...ghostButtonStyle... ...goldButtonStyle...').map(s => s.kind))
            === JSON.stringify(['secondary', 'primary'])],
    ['primary last is clean',
      () => { const f = buttonSequence('ghostButtonStyle goldButtonStyle');
              return f.map(s => s.kind).lastIndexOf('primary') === f.length - 1; }],
    ['primary first is flagged',
      () => { const f = buttonSequence('goldButtonStyle ghostButtonStyle');
              return f.map(s => s.kind).lastIndexOf('primary') !== f.length - 1; }],
    ['single button is not judged',
      () => buttonSequence('goldButtonStyle').length < 2],
    ['ternary branches are conditional, not two primaries',
      () => { const b = 'c ? {goldButtonStyle} : {goldButtonStyle}';
              return buttonSequence(b).filter(x => !x.conditional).length <= 1; }],
    ['a top-level gold button is not marked conditional',
      () => buttonSequence('goldButtonStyle')[0].conditional === false],
    ['a gold button inside a guard is marked conditional',
      () => buttonSequence('{cond && ( goldButtonStyle )}')[0].conditional === true],
    ['a red button is read as destructive',
      () => buttonSequence("ghostButtonStyle, color: colors.red, x")[0].destructive === true],
    ['a plain ghost button is not destructive',
      () => buttonSequence('ghostButtonStyle, color: DIM')[0].destructive === false],
    ['lineAt is CRLF-safe',
      () => lineAt('a\r\nb\r\nc', 6) === 3],
  ];
  let pass = 0;
  for (const [name, fn] of cases) {
    let ok = false;
    try { ok = !!fn(); } catch { ok = false; }
    if (ok) pass++; else console.log('  FAIL ' + name);
  }
  console.log(`selftest ${pass}/${cases.length}`);
  return pass === cases.length;
}

/* ─────────────────────────────── main ─────────────────────────────── */
const args = process.argv.slice(2);
if (args.includes('--selftest')) process.exit(selftest() ? 0 : 1);

const rows = [];
for (const f of listPages()) {
  const findings = auditFile(f);
  if (findings.length) rows.push({ file: f, findings, score: findings.reduce((s, x) => s + x.weight, 0) });
}
rows.sort((a, b) => b.score - a.score);

if (args.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const tally = {};
  for (const r of rows) for (const f of r.findings) tally[f.kind] = (tally[f.kind] || 0) + 1;
  console.log('BUTTON ORDER AUDIT');
  console.log('==================');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(18)} ${v}`);
  console.log(`\n${rows.length} file(s):\n`);
  for (const r of rows) {
    console.log(`${r.file}  [${r.score}]`);
    for (const f of r.findings) console.log(`    ${String(f.line).padStart(5)}  ${f.kind.padEnd(18)} ${f.detail}`);
  }
}
