#!/usr/bin/env node
/**
 * audit-portal-token-checks — portal session lookups that skip a guard the
 * canonical validator applies.
 *
 * WHY THIS EXISTS
 *
 * lib/portal-auth exports getPortalSession, and it checks three things: the
 * token matches, the session status is 'active', and the session has not
 * expired. Thirty routes query portal_client_sessions / portal_sub_sessions
 * directly instead of calling it.
 *
 * One of those local copies already bit. app/api/portal/client/auth/route.ts
 * carries the scar in a comment: "The canonical lib/portal-auth validator does
 * this; this local copy previously skipped it, so expired portal tokens still
 * worked." Somebody found it, fixed that one copy, and the other twenty-nine
 * were never swept — which is the same shape as the cumulative-money bug that
 * lived in four files, and the budget table that was fixed on the read side
 * and not the write side.
 *
 * These tokens are what a GC's CLIENT and a GC's SUBCONTRACTORS hold. A missed
 * expiry check means a link handed out for one job keeps working after it was
 * meant to stop.
 *
 * WHAT IT CHECKS, per direct query:
 *   status   — is the lookup filtered to active sessions?
 *   expiry   — is expires_at compared against now, anywhere nearby?
 *   revoked  — is a revoked/withdrawn status excluded?
 *
 * A route that calls getPortalSession from lib/portal-auth is not a local copy
 * and is not reported.
 *
 * Usage: node tools/audit-portal-token-checks.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'app/api';
const SESSION_TABLES = /portal_client_sessions|portal_sub_sessions/;

const files = [];
(function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (/node_modules|\.next/.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (e.name === 'route.ts') files.push(p);
  }
})(ROOT);

const blank = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
   .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const findings = [];

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const src = blank(raw);
  if (!SESSION_TABLES.test(src)) continue;

  const rel = file.split(path.sep).join('/');
  const usesCanonical = /from\s+['"]@\/lib\/portal-auth['"]/.test(src);

  const re = /\.from\(\s*['"](portal_client_sessions|portal_sub_sessions)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const line = src.slice(0, m.index).split(/\r?\n/).length;
    /* The chain, plus enough of what follows to catch a separate expiry test
       written as its own statement rather than a filter. */
    const window = src.slice(m.index, m.index + 1400).replace(/\s+/g, ' ');

    /* A write to the session table is not a token check — creating or
       revoking a session legitimately touches rows without validating one. */
    if (/^\s*\.from\([^)]*\)\s*\.(insert|update|upsert|delete)/.test(src.slice(m.index, m.index + 120).replace(/\s+/g, ' '))) continue;
    if (/\.(insert|update|upsert|delete)\s*\(/.test(window.slice(0, 80))) continue;

    const byToken = /\.eq\(\s*['"]token['"]/.test(window);
    if (!byToken) continue; // not a token lookup

    const checksStatus = /\.eq\(\s*['"]status['"]\s*,\s*['"]active['"]/.test(window)
      || /status\s*!==?\s*['"]active['"]/.test(window);
    const checksExpiry = /expires_at/.test(window) && /new Date\(|Date\.now\(/.test(window);

    const missing = [];
    if (!checksStatus) missing.push('status');
    /* THE TWO SESSION TABLES ARE NOT THE SAME SHAPE. portal_client_sessions
       has expires_at; portal_sub_sessions does not — a subcontractor's portal
       token has no expiry at all and is ended only by flipping its status.
       The first run of this tool reported fifteen sub-portal routes for
       failing to check a column that does not exist, which would have buried
       the one real finding in the client portal.
       Checked against information_schema before this line was written, not
       assumed. That sub tokens never expire is a design question worth
       raising with the owner, but it is not these routes' bug. */
    /* 2026-10-16: portal_sub_sessions now has expires_at too (90 days from
       the last send — lib/sub-portal-expiry), so both tables are checked. */
    if (!checksExpiry) missing.push('expiry');

    if (missing.length) {
      findings.push({ file: rel, line, table: m[1], missing, usesCanonical });
    }
  }
}

if (!findings.length) {
  console.log('CLEAN — every direct portal-session lookup checks status and expiry.');
} else {
  console.log(`${findings.length} portal-session lookup(s) missing a guard the canonical validator applies:\n`);
  for (const f of findings) {
    console.log(`  ${f.file}:${f.line}  (${f.table})`);
    console.log(`     no ${f.missing.join(' check, no ')} check`);
  }
  console.log('\nlib/portal-auth.getPortalSession checks token + status + expiry in one place.');
}
process.exit(findings.length ? 1 : 0);
