#!/usr/bin/env node
/**
 * audit-nav-stability — does the menu stay where you left it?
 *
 * The sidebar used to render `showAll || item.core || isActive(item.href)`, so
 * a non-core item appeared only while you were standing on it. The rail
 * changed shape as you navigated: an item sat in a different place depending
 * on where you came from, and muscle memory cannot form against a menu that
 * moves. Every competitor's menu holds still.
 *
 * Three things are checked, and all three are static properties of the source:
 *
 *   1. What the rail renders does not depend on the current route.
 *   2. The item order is a fixed constant, not sorted or filtered at runtime.
 *   3. Every href in the rail resolves to a page that exists — a nav item
 *      that 404s is worse than one that moves.
 *
 * Entitlement filtering is allowed and expected: a plan without Fleet does not
 * show Fleet. That is a stable difference between tenants, not a moving target
 * inside one session.
 */

const fs = require('fs');
const path = require('path');

const SIDEBAR = 'components/AppSidebar.tsx';
const src = fs.readFileSync(SIDEBAR, 'utf8');

const problems = [];

/* ── 1. route-independent rendering ─────────────────────────────────────── */

const visLine = src.match(/const visibleItems = ([^;]+);/);
if (!visLine) {
  problems.push('cannot find the visibleItems filter — the check cannot run');
} else {
  const expr = visLine[1];
  for (const banned of ['isActive', 'showAll', 'pathname']) {
    if (expr.includes(banned)) {
      problems.push(`visibleItems depends on "${banned}" — the rail reshapes as you navigate`);
    }
  }
}

/* The reveal toggle should be gone with the filtering it revealed. */
if (/Show everything|toggleShowAll|SHOW_ALL_KEY/.test(src)) {
  problems.push('the "Show everything" toggle is still present — it only existed to undo the filtering');
}

/* ── 2. fixed order ─────────────────────────────────────────────────────── */

if (/NAV_SECTIONS[\s\S]{0,400}?\.sort\(/.test(src)) {
  problems.push('nav sections are sorted at runtime — order must be fixed');
}

/* ── 3. every nav href resolves ─────────────────────────────────────────── */

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const routes = new Set();
for (const f of walk('app')) {
  if (!/^page\.(tsx|ts|jsx|js)$/.test(path.basename(f))) continue;
  let url = f.split(path.sep).join('/').replace(/^app/, '')
    .replace(/\/page\.(tsx|ts|jsx|js)$/, '')
    .replace(/\/\([^/]+\)/g, '');
  routes.add(url === '' ? '/' : url);
}
const matchers = [...routes].map((r) => new RegExp(
  '^' + r.replace(/\[\.\.\.[^\]]+\]/g, '.+').replace(/\[[^\]]+\]/g, '[^/]+') + '$',
));
const resolves = (href) => matchers.some((m) => m.test(href.replace(/\/$/, '') || '/'));

const hrefs = [...src.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
const dead = hrefs.filter((h) => h.startsWith('/') && !resolves(h));
for (const h of dead) problems.push(`nav item points at ${h}, which serves no page`);

/* ── report ─────────────────────────────────────────────────────────────── */

console.log('='.repeat(70));
console.log('NAVIGATION — does the menu stay where you left it?');
console.log('='.repeat(70));
console.log(`  nav items        ${hrefs.length}`);
console.log(`  routes known     ${routes.size}`);
console.log('');
console.log(`  PROBLEMS         ${problems.length}`);
if (problems.length) {
  console.log('');
  problems.forEach((p) => console.log(`  ${p}`));
}
if (!hrefs.length) {
  console.log('');
  console.log('PARSE FAILED — read 0 nav items. The clean result above means nothing.');
  process.exitCode = 2;
} else {
  process.exitCode = problems.length ? 1 : 0;
}
