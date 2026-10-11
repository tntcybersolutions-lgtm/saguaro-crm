#!/usr/bin/env node
/**
 * RETIRED 11 Oct 2026 — no longer in `prebuild`. Saguaro-Field (the mobile repo)
 * is retired (CLAUDE.md: ONE APP — iOS IS THE WEB APP), so THIS repo's
 * lib/takeoff is the canonical engine and there is no peer to drift from. A
 * local `npm run build` used to fail on drift against the dead copy on disk.
 * Kept for history; do not wire it back in.
 *
 * Takeoff engine sync — the ONE canonical engine lives in Saguaro-Field/lib/takeoff
 * (the mobile repo — same doctrine as scripts/sync-heatmap-engine.mjs). The web repo
 * (saguaro-crm / saguaro-web checkout) carries a byte-exact mirror of the shared
 * engine files. This script is committed to BOTH repos and enforces that:
 *
 *   node scripts/sync-takeoff-engine.mjs --check   fail loudly (exit 1) on ANY drift
 *   node scripts/sync-takeoff-engine.mjs --sync    copy canonical → web mirror
 *
 * Wire-ins: web `npm run build` runs --check (prebuild, right after the heatmap
 * check). When the peer repo is not on disk (CI/Vercel), the check SKIPS with a
 * notice instead of failing — drift is caught on dev machines, where both repos
 * live side by side. The money proof rides shotgun: scripts/takeoff-golden.test.mjs
 * runs the same fixtures through BOTH engines and asserts cent-identical bids.
 *
 * WEB-ONLY modules are exempt: they are the web app's own takeoff I/O and
 * import/export layer (autocount, confidence, csi-costkey, dxf, estimate-report,
 * excel-export, import-quantities, revision-diff, share, templates) — never engine
 * math. Everything else under lib/takeoff must match byte-for-byte.
 *
 * index.ts is exempt on BOTH sides (surface-local barrel, the takeoff analogue of
 * heatmap's web-only exemption): each repo's index.ts re-exports its own module set —
 * web's additionally re-exports the web-only modules above — so byte-parity is
 * impossible by design. Both barrels MUST still re-export every shared engine module
 * (types, geometry, cost, rates, assemblies, sanity, engine, divisions); the golden
 * harness therefore imports engine.ts / geometry.ts directly, never the barrel.
 */
import { readdirSync, readFileSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(dirname(fileURLToPath(import.meta.url))); // repo root (script sits in scripts/)
const WEB_ONLY = new Set([
  'autocount.ts', 'confidence.ts', 'csi-costkey.ts', 'dxf.ts', 'estimate-report.ts',
  'excel-export.ts', 'import-quantities.ts', 'revision-diff.ts', 'share.ts', 'templates.ts',
]);
/** Exempt on BOTH sides — each surface owns its barrel (see header). */
const SURFACE_LOCAL = new Set(['index.ts']);
const SKIP = (f) => !f.endsWith('.ts') || f.includes('.bak') || f.endsWith('.d.ts');

// ── which side is this checkout? ──
const isMobile = existsSync(join(HERE, 'app.config.ts'));
const isWeb = ['next.config.js', 'next.config.mjs', 'next.config.ts'].some((f) => existsSync(join(HERE, f)));
if (!isMobile && !isWeb) { console.error('sync-takeoff-engine: cannot tell which repo this is (no app.config.ts, no next.config.*)'); process.exit(1); }

// ── find the peer checkout: $SAGUARO_PEER_DIR, then the standard local layout ──
const peerCandidates = process.env.SAGUARO_PEER_DIR
  ? [process.env.SAGUARO_PEER_DIR]
  : isMobile
    ? ['D:/saguaro-web', join(HERE, '..', 'saguaro-web'), 'D:/Live-Code-Saguaro']
    : ['D:/Saguaro-Field', join(HERE, '..', 'Saguaro-Field')];
const peer = peerCandidates.map((p) => resolve(p)).find((p) => existsSync(join(p, 'lib', 'takeoff')));
if (!peer) {
  console.log('sync-takeoff-engine: peer repo not found on this machine — skipping (drift is enforced on dev machines; set SAGUARO_PEER_DIR to point at it).');
  process.exit(0);
}

const canonicalDir = isMobile ? join(HERE, 'lib', 'takeoff') : join(peer, 'lib', 'takeoff');
const mirrorDir = isMobile ? join(peer, 'lib', 'takeoff') : join(HERE, 'lib', 'takeoff');

const list = (dir) => readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile() && !SKIP(f));
const norm = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const canonical = list(canonicalDir).filter((f) => !SURFACE_LOCAL.has(f));
const mirror = list(mirrorDir);
const drifted = [];
for (const f of canonical) {
  const m = join(mirrorDir, f);
  if (!existsSync(m)) drifted.push(`${f}  (missing from web mirror)`);
  else if (norm(join(canonicalDir, f)) !== norm(m)) drifted.push(`${f}  (content differs)`);
}
for (const f of mirror) {
  if (!WEB_ONLY.has(f) && !SURFACE_LOCAL.has(f) && !canonical.includes(f)) drifted.push(`${f}  (exists only in web mirror — engine files are born canonical)`);
}

const mode = process.argv.includes('--sync') ? 'sync' : 'check';
if (!drifted.length) { console.log(`takeoff engine in sync — ${canonical.length} canonical files match (${WEB_ONLY.size} web-only + index.ts exempt).`); process.exit(0); }

if (mode === 'check') {
  console.error('\n══ TAKEOFF ENGINE DRIFT — the web mirror does not match the canonical engine ══');
  drifted.forEach((d) => console.error('  • ' + d));
  console.error(`\nCanonical: ${canonicalDir}\nMirror:    ${mirrorDir}`);
  console.error('Fix: edit ONLY the canonical side (Saguaro-Field), then run  node scripts/sync-takeoff-engine.mjs --sync\n');
  process.exit(1);
}

for (const f of canonical) copyFileSync(join(canonicalDir, f), join(mirrorDir, f));
console.log(`synced ${canonical.length} files canonical → web mirror:`);
drifted.forEach((d) => console.log('  ✓ ' + d.split('  ')[0]));
console.log('web-only kept: ' + [...WEB_ONLY].join(', ') + '; surface-local kept: ' + [...SURFACE_LOCAL].join(', '));
