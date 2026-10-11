#!/usr/bin/env node
/**
 * RETIRED 11 Oct 2026 — no longer in `prebuild`. Saguaro-Field (the mobile repo)
 * is retired (CLAUDE.md: ONE APP — iOS IS THE WEB APP), so THIS repo's
 * lib/heatmap is the canonical engine and there is no peer to drift from. A
 * local `npm run build` used to fail on drift against the dead copy on disk.
 * Kept for history; do not wire it back in.
 *
 * Heatmap engine sync — the ONE canonical engine lives in Saguaro-Field/lib/heatmap
 * (the mobile repo). The web repo (saguaro-crm / saguaro-web checkout) carries a
 * byte-exact mirror. This script is committed to BOTH repos and enforces that:
 *
 *   node scripts/sync-heatmap-engine.mjs --check   fail loudly (exit 1) on ANY drift
 *   node scripts/sync-heatmap-engine.mjs --sync    copy canonical → web mirror
 *
 * Wire-ins: web `npm run build` runs --check first (prebuild). When the peer repo
 * is not on disk (CI/Vercel), the check SKIPS with a notice instead of failing —
 * drift is caught on dev machines, where both repos live side by side.
 *
 * Web-only modules (share.ts, vector-pdf.ts) are exempt: they are the web app's
 * own I/O layer, not engine. Everything else under lib/heatmap must match.
 */
import { readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(dirname(fileURLToPath(import.meta.url))); // repo root (script sits in scripts/)
const WEB_ONLY = new Set(['share.ts', 'vector-pdf.ts']);
const SKIP = (f) => !f.endsWith('.ts') || f.includes('.bak') || f.endsWith('.d.ts');

// ── which side is this checkout? ──
const isMobile = existsSync(join(HERE, 'app.config.ts'));
const isWeb = ['next.config.js', 'next.config.mjs', 'next.config.ts'].some((f) => existsSync(join(HERE, f)));
if (!isMobile && !isWeb) { console.error('sync-heatmap-engine: cannot tell which repo this is (no app.config.ts, no next.config.*)'); process.exit(1); }

// ── find the peer checkout: $SAGUARO_PEER_DIR, then the standard local layout ──
const peerCandidates = process.env.SAGUARO_PEER_DIR
  ? [process.env.SAGUARO_PEER_DIR]
  : isMobile
    ? ['D:/saguaro-web', join(HERE, '..', 'saguaro-web'), 'D:/Live-Code-Saguaro']
    : ['D:/Saguaro-Field', join(HERE, '..', 'Saguaro-Field')];
const peer = peerCandidates.map((p) => resolve(p)).find((p) => existsSync(join(p, 'lib', 'heatmap')));
if (!peer) {
  console.log('sync-heatmap-engine: peer repo not found on this machine — skipping (drift is enforced on dev machines; set SAGUARO_PEER_DIR to point at it).');
  process.exit(0);
}

const canonicalDir = isMobile ? join(HERE, 'lib', 'heatmap') : join(peer, 'lib', 'heatmap');
const mirrorDir = isMobile ? join(peer, 'lib', 'heatmap') : join(HERE, 'lib', 'heatmap');

const list = (dir) => readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile() && !SKIP(f));
const norm = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const canonical = list(canonicalDir);
const mirror = list(mirrorDir);
const drifted = [];
for (const f of canonical) {
  const m = join(mirrorDir, f);
  if (!existsSync(m)) drifted.push(`${f}  (missing from web mirror)`);
  else if (norm(join(canonicalDir, f)) !== norm(m)) drifted.push(`${f}  (content differs)`);
}
for (const f of mirror) {
  if (!WEB_ONLY.has(f) && !canonical.includes(f)) drifted.push(`${f}  (exists only in web mirror — engine files are born canonical)`);
}

const mode = process.argv.includes('--sync') ? 'sync' : 'check';
if (!drifted.length) { console.log(`engine in sync — ${canonical.length} canonical files match (${WEB_ONLY.size} web-only exempt).`); process.exit(0); }

if (mode === 'check') {
  console.error('\n══ HEATMAP ENGINE DRIFT — the web mirror does not match the canonical engine ══');
  drifted.forEach((d) => console.error('  • ' + d));
  console.error(`\nCanonical: ${canonicalDir}\nMirror:    ${mirrorDir}`);
  console.error('Fix: edit ONLY the canonical side (Saguaro-Field), then run  npm run engine:sync\n');
  process.exit(1);
}

for (const f of canonical) copyFileSync(join(canonicalDir, f), join(mirrorDir, f));
console.log(`synced ${canonical.length} files canonical → web mirror:`);
drifted.forEach((d) => console.log('  ✓ ' + d.split('  ')[0]));
console.log('web-only kept: ' + [...WEB_ONLY].join(', '));
