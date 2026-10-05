#!/usr/bin/env node
/**
 * CODEMOD — hard-coded hex colours → design tokens.
 *
 *   node tools/codemods/hex-to-token.mjs [--dry] [--batch=N] [paths…]
 *
 * Replaces every hex literal in app/ and components/ with the CSS variable that
 * means the same thing (palette values exactly; near-misses to the closest
 * palette colour; every blue to yellow/gray per the design rule). Skips the
 * documented exceptions (print/PDF, QR, signature canvas, portals, charts,
 * 3-D) and any identifier that is concatenated with an alpha suffix
 * (`GOLD + '33'`, `${c}1F`) because `var(--x)33` is not a colour.
 *
 * Regex-based on purpose: the literals live inside `style={{ }}` objects,
 * `const X = '#…'` declarations and template strings, which an AST walk would
 * have to stringify anyway. Idempotent — run it as often as you like.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const BATCH = Number((args.find((a) => a.startsWith('--batch=')) || '').split('=')[1] || 0);
const targets = args.filter((a) => !a.startsWith('--'));
const ROOT = process.cwd();

const TOKEN = {
  // exact palette
  '#000000': 'var(--bg-base)', '#000': 'var(--bg-base)',
  '#0E0F12': 'var(--surface-card)', '#15171C': 'var(--surface-raised)',
  '#FFFFFF': 'var(--text-primary)', '#FFF': 'var(--text-primary)',
  '#D4D4D8': 'var(--text-secondary)', '#A9B4C4': 'var(--text-tertiary)', '#7A8597': 'var(--text-disabled)',
  '#FFE600': 'var(--brand-primary)', '#FFF04A': 'var(--brand-primary-hi)', '#E6CF00': 'var(--brand-primary-strong)',
  '#0A0A00': 'var(--on-brand)', '#FF8A00': 'var(--warning)', '#2CFF7A': 'var(--success)', '#FF3B30': 'var(--danger)',
  '#A3ACBB': 'var(--status-closed)',
  // near misses → closest palette colour
  '#0A0A0A': 'var(--bg-base)', '#0B0E13': 'var(--surface-card)', '#1C1C1E': 'var(--surface-raised)', '#2A2A2E': 'var(--surface-raised)', '#141416': 'var(--surface-card)',
  '#F8FAFC': 'var(--text-primary)', '#E6EDF3': 'var(--text-secondary)', '#E5E5E5': 'var(--text-secondary)', '#F0F4FF': 'var(--text-primary)', '#F7F8FA': 'var(--text-primary)', '#F6F6F4': 'var(--text-primary)', '#F4F4F6': 'var(--text-primary)',
  '#A1A1AA': 'var(--text-tertiary)', '#8B949E': 'var(--text-tertiary)', '#8094B0': 'var(--text-tertiary)', '#9CA3AF': 'var(--status-closed)', '#94A3B8': 'var(--status-closed)', '#6B7280': 'var(--status-closed)', '#64748B': 'var(--status-closed)', '#475569': 'var(--text-disabled)', '#334155': 'var(--surface-raised)',
  '#FCA5A5': 'var(--danger)', '#E06C75': 'var(--danger)', '#FF6B6B': 'var(--danger)', '#FFB3BB': 'var(--danger)', '#FB7185': 'var(--danger)', '#C0392B': 'var(--danger)', '#B42318': 'var(--danger)', '#EF4444': 'var(--danger)', '#E0644E': 'var(--danger)',
  '#B8860B': 'var(--brand-primary-strong)', '#FFCC00': 'var(--brand-primary)', '#FFD700': 'var(--brand-primary)', '#F5C518': 'var(--brand-primary)', '#C8960F': 'var(--brand-primary-strong)',
  '#FF8C00': 'var(--warning)', '#FF9D70': 'var(--warning)', '#FCD9A0': 'var(--warning)', '#FFF4E5': 'var(--warning)', '#F0A63C': 'var(--warning)', '#F59E0B': 'var(--warning)', '#D97706': 'var(--warning)', '#B45309': 'var(--warning)', '#CA8A04': 'var(--warning)',
  '#0A7D3C': 'var(--success)', '#F0FAF4': 'var(--success)', '#22C55E': 'var(--success)', '#10B981': 'var(--success)',
  // every blue → yellow or gray
  '#3B82F6': 'var(--brand-primary)', '#60A5FA': 'var(--brand-primary)', '#2563EB': 'var(--brand-primary)', '#1D4ED8': 'var(--brand-primary)', '#1A5FA8': 'var(--warning)', '#06B6D4': 'var(--brand-primary)', '#0EA5E9': 'var(--brand-primary)', '#38BDF8': 'var(--brand-primary)', '#8B5CF6': 'var(--status-closed)', '#A78BFA': 'var(--status-closed)', '#7C3AED': 'var(--status-closed)', '#6366F1': 'var(--status-closed)',
};
const ALLOW_DIRS = ['app/portals/', 'app/sign/', 'app/w9/', 'app/print/', 'app/api/', 'app/get-the-app/', 'components/charts/', 'components/heatmap/', 'components/signal-studio/', 'components/franchise/', 'lib/'];
const ALLOW_FILE_RE = /(pdf|print|qr|signature|canvas|chart|email|letterhead|globals\.css)/i;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.next') walk(p, out); }
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
let files = (targets.length ? targets.map((t) => path.resolve(ROOT, t)) : [path.join(ROOT, 'app', 'app'), path.join(ROOT, 'app', 'field'), path.join(ROOT, 'components')])
  .filter((t) => fs.existsSync(t))
  .flatMap((t) => (fs.statSync(t).isDirectory() ? walk(t) : [t]))
  .map(rel)
  .filter((r) => !ALLOW_DIRS.some((d) => r.startsWith(d)) && !ALLOW_FILE_RE.test(path.basename(r)));

const HEX_RE = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
let changedFiles = 0, replaced = 0, skippedAlpha = 0;
const perFile = [];
for (const r of files) {
  const abs = path.join(ROOT, r);
  let src = fs.readFileSync(abs, 'utf8');
  // identifiers whose value is concatenated with an alpha suffix: keep their hex
  const alphaIdents = new Set();
  for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\s*\+\s*['"`][0-9a-fA-F]{2}['"`]/g)) alphaIdents.add(m[1]);
  for (const m of src.matchAll(/\$\{\s*([A-Za-z_$][\w$.]*)\s*\}[0-9a-fA-F]{2}\b/g)) alphaIdents.add(m[1].split('.')[0]);
  let n = 0;
  const out = src.replace(/(\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*)?(['"`])(#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3}))\3/g, (whole, decl, ident, q, hex) => {
    const key = hex.toUpperCase();
    const tok = TOKEN[key];
    if (!tok) return whole;
    if (ident && alphaIdents.has(ident)) { skippedAlpha++; return whole; }
    n++;
    return `${decl || ''}${q}${tok}${q}`;
  });
  if (n) { replaced += n; changedFiles++; perFile.push([n, r]); if (!DRY) fs.writeFileSync(abs, out); }
}
perFile.sort((a, b) => b[0] - a[0]);
for (const [n, r] of perFile.slice(0, BATCH || perFile.length)) console.log(`${String(n).padStart(4)}  ${r}`);
console.log(`${DRY ? '[dry] ' : ''}replaced ${replaced} hex literals in ${changedFiles} files; kept ${skippedAlpha} alpha-concatenated identifiers`);
