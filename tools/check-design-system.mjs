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
const PALETTE = new Set(['#000000', '#0E0F12', '#15171C', '#FFFFFF', '#D4D4D8', '#A9B4C4', '#7A8597', '#FFE600', '#FFF04A', '#E6CF00', '#0A0A00', '#FF8A00', '#2CFF7A', '#FF3B30', '#A3ACBB', '#FFF', '#000']);
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
console.log(`DESIGN-SYSTEM GATE — ${files.length} files scanned: ${totals.hex} hex literals, ${totals.table} raw tables, ${totals.status} plain status spans (baseline-tracked)`);
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
