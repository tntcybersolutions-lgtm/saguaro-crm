#!/usr/bin/env node
/**
 * DESIGN-SYSTEM GATE — fails the build when a page steps outside the shared
 * system. Runs in `prebuild` next to check-style-escapes.
 *
 *   1. No new hard-coded hex colour in app/ (tokens live in app/globals.css
 *      and lib/design-tokens.ts; job colours in lib/project-colors.ts).
 *   2. No raw <table> in app/app — a list is a <DataTable>, or at minimum a
 *      table carrying the `k-table` / `k-table-skin` class.
 *   3. No status word drawn as plain text in a styled <span> — a status is a
 *      <StatusPill>.
 *   4. No dim text, anywhere a person reads the app (portals included): text
 *      is var(--text-primary|secondary|tertiary), pearl white. A grey literal
 *      or a faded rgba(255,255,255,<.6) as a text colour fails — zero allowed,
 *      no baseline. Print / PDF / email / canvas files and pages that paint a
 *      white page keep their greys (grey on white is readable).
 *   5. No hex alpha glued onto a CSS variable. `${DIM}40` with
 *      DIM = 'var(--text-secondary)' is `var(--text-secondary)40` — invalid
 *      CSS, so the browser drops the whole declaration (the background, border
 *      or text colour silently disappears). Fade a variable with
 *      color-mix(in srgb, ${DIM} 25%, transparent). Zero allowed, every file.
 *
 * Allowlisted on purpose (documented exceptions): print / PDF layouts, QR
 * canvases, signature pads, customer-facing portals, email templates, charts
 * and 3-D / canvas renderers that cannot take a CSS variable.
 *
 * The baseline file (tools/design-system-baseline.json) holds the counts the
 * codebase had when the gate was introduced, per file; a file may not grow its
 * count. `--update-baseline` rewrites it after a deliberate clean-up.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const UPDATE = process.argv.includes('--update-baseline');
const BASELINE_PATH = path.join(ROOT, 'tools', 'design-system-baseline.json');

const ALLOW_DIRS = [
  'app/portals/', 'app/sign/', 'app/w9/', 'app/print/', 'app/api/', 'app/(marketing)/', 'app/get-the-app/',
  'components/charts/', 'components/heatmap/', 'components/signal-studio/', 'components/franchise/',
  'lib/email', 'lib/pdf', 'lib/design-tokens.ts', 'lib/project-colors.ts', 'lib/status-colors.ts', 'lib/status-system.ts',
  'app/globals.css',
];
const ALLOW_FILE_RE = /(pdf|print|qr|signature|canvas|chart|email|invoice-template|letterhead|PlanTracer|DrawingViewer|RevisionCompare|PdfViewer|PhotoEditor|SignaturePad|CrewMap|Building3D|Designer)/i;
// A palette value is still a hex literal; pages must use the token for it.
const PALETTE = new Set(['#101722', '#1B2636', '#243247', '#334155', '#475569', '#F8FAFC', '#CBD5E1', '#94A3B8', '#64748B', '#FFE000', '#FFE94D', '#F2D500', '#38BDF8', '#4ADE80', '#FBBF24', '#F87171', '#000000', '#050506', '#0E0F12', '#0E0F13', '#13151A', '#15171C', '#FFFFFF', '#F3EAC9', '#B9AE8C', '#8E866B', '#5E5948', '#FAF8F2', '#E8E4D9', '#D2CDBF', '#8F8A7C', '#D4D4D8', '#A9B4C4', '#7A8597', '#FFE600', '#FFF04A', '#E6CF00', '#0A0A00', '#FF8A00', '#2CFF7A', '#FF3B30', '#A3ACBB', '#FFF', '#000']);
const STATUS_WORDS = /^(Missing|Not on File|On File|Overdue|Approved|Paid|Pending|Rejected|Expired|Expiring|Draft|Submitted|Sent|Open|Closed|Active|Inactive|Complete|Completed|In Progress|Under Review|Signed|Unsigned|Certified|Declined|Cancelled|Canceled|Awarded|Won|Lost)$/i;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.next') walk(p, out); }
    else if (/\.(tsx|ts|css)$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const allowed = (r) => ALLOW_DIRS.some((d) => r.startsWith(d)) || ALLOW_FILE_RE.test(path.basename(r));

const files = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))].map(rel).filter((r) => !allowed(r));

/* 4. Dim text. Wider net than rules 1–3: customer portals are read too. */
const DIM_TEXT = new Set(['#d4d4d8', '#a9b4c4', '#b9ae8c', '#a1a1aa', '#a3acbb', '#9ca3af', '#8baac8', '#94a3b8', '#aaa', '#aaaaaa', '#999', '#999999', '#a3a3a3', '#cbd5e1', '#c9d1d9',
  '#6b7280', '#8b949e', '#64748b', '#6e7681', '#8094b0', '#7a8597', '#8e866b', '#71717a', '#5b677a', '#888', '#888888', '#777', '#777777', '#666', '#666666', '#737373', '#475569', '#52525b', '#5e5948', '#7d8590']);
const DIM_SKIP_FILE = /(pdf|print|qr|signature|canvas|chart|email|invoice-template|letterhead|Building3D|PlanTracer|DrawingViewer|RevisionCompare|PhotoEditor|SignaturePad|CrewMap)/i;
const WHITE_PAGE = /background(Color)?\s*:\s*['"]?(#fff\b|#ffffff|white|#f9fafb|#fafafa)/i;
const dimValue = (v) => {
  const l = v.toLowerCase().replace(/\s+/g, '');
  if (DIM_TEXT.has(l)) return true;
  const a = l.match(/^rgba\(255,255,255,(0?\.\d+)\)$/);
  return !!a && Number(a[1]) < 0.6;
};
const VAL = String.raw`(#[0-9a-fA-F]{3,6}\b|rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.\d+\s*\))`;
const DIM_RES = [
  // `lit ? color : '#…'` is a ternary on a variable named color, not a property.
  new RegExp(String.raw`(?<!\?\s*)\bcolor\s*:\s*(['"])` + VAL + String.raw`\1`, 'gi'),
  new RegExp(String.raw`(?<![-\w])color\s*:\s*` + VAL + String.raw`(?=\s*[;}"'!])`, 'gi'),
  new RegExp(String.raw`\b(?:DIM|MUTED|TEXT_DIM|TEXT_MED|TEXT_MUTED|SUBTLE|FAINT|dim|muted|faint|subtle|textDim|textMuted|text2|text3)\s*[:=]\s*(['"])` + VAL + String.raw`\1`, 'g'),
];
/* 5. Hex alpha on a CSS variable. Per file: names bound to a 'var(--…)' string,
 * then `${NAME}NN` or NAME + 'NN' anywhere in that file. */
const VAR_BIND = /(?<![\w.])([A-Za-z_]\w*)\s*(?::\s*string\s*)?=\s*(['"`])var\(--[^'"`]+\)\2/g;
const VAR_KEY = /(?<![\w.])([A-Za-z_]\w*)\s*:\s*(['"`])var\(--[^'"`]+\)\2/g;
const esc = (s) => s.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');
const varAlphaFindings = [];
for (const r of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components')), ...walk(path.join(ROOT, 'lib'))].map(rel)) {
  if (!/\.(tsx?|jsx?)$/.test(r)) continue;
  const src = fs.readFileSync(path.join(ROOT, r), 'utf8');
  const names = new Set([...src.matchAll(VAR_BIND)].map((m) => m[1]));
  const keys = new Set([...src.matchAll(VAR_KEY)].map((m) => m[1]).filter((k) => !/^(color|background|border|fill|stroke)$/.test(k)));
  if (!names.size && !keys.size) continue;
  const res = [
    ...[...names].map((n) => new RegExp(String.raw`\$\{${esc(n)}\}[0-9a-fA-F]{2}(?![0-9a-zA-Z])|(?<![\w.])${esc(n)}\s*\+\s*['"][0-9a-fA-F]{2}['"]`, 'g')),
    ...[...keys].map((k) => new RegExp(String.raw`\$\{[A-Za-z_]\w*\.${esc(k)}\}[0-9a-fA-F]{2}(?![0-9a-zA-Z])`, 'g')),
  ];
  src.split('\n').forEach((line, i) => {
    for (const re of res) for (const m of line.matchAll(re)) varAlphaFindings.push({ r, line: i + 1, text: m[0] });
  });
}
const dimFindings = [];
for (const r of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))].map(rel)) {
  if (!r.endsWith('.tsx') || r.startsWith('app/api/') || DIM_SKIP_FILE.test(path.basename(r))) continue;
  const src = fs.readFileSync(path.join(ROOT, r), 'utf8');
  if (WHITE_PAGE.test(src)) continue;
  // HTML written into a print / PDF window is a white page: grey on white is
  // readable and CSS variables do not exist there. Skip an inline style="…"
  // attribute and any line inside a <!doctype>/<html> … </html> string.
  let inDoc = false;
  src.split('\n').forEach((line, i) => {
    if (/<!doctype|<html[\s>]/i.test(line)) inDoc = true;
    const skip = inDoc || /style="/.test(line);
    if (/<\/html>/i.test(line)) inDoc = false;
    if (skip) return;
    for (const re of DIM_RES) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) {
        const v = m[m.length - 1];
        if (dimValue(v)) dimFindings.push({ r, line: i + 1, text: m[0] });
      }
    }
  });
}
const counts = {};
const findings = [];
for (const r of files) {
  const src = fs.readFileSync(path.join(ROOT, r), 'utf8');
  const lines = src.split('\n');
  let hex = 0, table = 0, status = 0;
  lines.forEach((line, i) => {
    // 1. hex colours (any — palette or not — outside the token files)
    for (const m of line.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g)) {
      // skip CSS id selectors / anchors / template ids: only count inside quotes or style contexts
      const before = line.slice(0, m.index);
      if (/(href|id|key|htmlFor|aria-[a-z]+|data-[a-z-]+)=\s*["'`]?$/.test(before.trimEnd())) continue;
      if (/#[0-9a-fA-F]{3}\b/.test(m[0]) && m[0].length === 4 && !/['"`]\s*$/.test(before)) continue;
      hex++; findings.push({ r, line: i + 1, kind: 'hex', text: m[0] + (PALETTE.has(m[0].toUpperCase()) ? ' (palette value — use the token)' : ' (off palette)') });
    }
    // 2. raw tables (app/app only)
    // HTML built as a template string for a print / PDF window is not a page table.
    const htmlStringTable = /<table(\s+(style|class)="|>\s*<thead>\s*<tr>\s*<th>)/.test(line);
    if (r.startsWith('app/app/') && /<table\b/.test(line) && !htmlStringTable && !/k-table|DataTable|className=\{?["'`][^"'`]*(Table|grid)/i.test(line)) {
      table++; findings.push({ r, line: i + 1, kind: 'table', text: line.trim().slice(0, 80) });
    }
    // 3. status words as plain styled text
    const sm = line.match(/<span[^>]*style=\{\{[^}]*\}\}[^>]*>\s*([A-Za-z ]{3,16})\s*<\/span>/);
    if (sm && STATUS_WORDS.test(sm[1].trim()) && !/StatusPill/.test(line)) {
      status++; findings.push({ r, line: i + 1, kind: 'status', text: sm[1].trim() });
    }
  });
  if (hex || table || status) counts[r] = { hex, table, status };
}

if (UPDATE) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(counts, null, 2) + '\n');
  console.log(`baseline written: ${Object.keys(counts).length} files`);
  process.exit(0);
}

let baseline = {};
try { baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); } catch { baseline = {}; }
const regressions = [];
for (const [r, c] of Object.entries(counts)) {
  const b = baseline[r] || { hex: 0, table: 0, status: 0 };
  for (const k of ['hex', 'table', 'status']) if (c[k] > b[k]) regressions.push({ r, k, was: b[k], now: c[k] });
}
const totals = Object.values(counts).reduce((a, c) => ({ hex: a.hex + c.hex, table: a.table + c.table, status: a.status + c.status }), { hex: 0, table: 0, status: 0 });
console.log(`DESIGN-SYSTEM GATE — ${files.length} files scanned: ${totals.hex} hex literals, ${totals.table} raw tables, ${totals.status} plain status spans (baseline-tracked), ${dimFindings.length} dim text colours, ${varAlphaFindings.length} hex alphas on a CSS variable (none allowed)`);
if (varAlphaFindings.length) {
  console.error('\nHEX ALPHA ON A CSS VARIABLE (rule 5 — invalid CSS; use color-mix(in srgb, ${X} N%, transparent)):');
  for (const f of varAlphaFindings.slice(0, 40)) console.error(`  ${f.r}:${f.line}  ${f.text}`);
  if (!UPDATE) process.exit(1);
}
if (dimFindings.length) {
  console.error('\nDIM TEXT (rule 4 — text is pearl white: var(--text-primary|secondary|tertiary)):');
  for (const f of dimFindings.slice(0, 40)) console.error(`  ${f.r}:${f.line}  ${f.text}`);
  if (!UPDATE) process.exit(1);
}
if (regressions.length) {
  console.error('\nREGRESSIONS (a file grew past its baseline):');
  for (const x of regressions) {
    console.error(`  ${x.r}: ${x.k} ${x.was} → ${x.now}`);
    for (const f of findings.filter((f) => f.r === x.r && f.kind === x.k).slice(0, 6)) console.error(`      L${f.line}  ${f.text}`);
  }
  console.error('\nUse the token / <DataTable> / <StatusPill>; see components/ui/index.ts. (Deliberate clean-up: --update-baseline)');
  process.exit(1);
}
console.log('  clean — nothing grew past its baseline');
