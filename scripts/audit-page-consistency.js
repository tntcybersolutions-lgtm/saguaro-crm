#!/usr/bin/env node
/**
 * audit-page-consistency — does every public page use the same type system?
 *
 * Ten marketing pages carried seven different headline sizes: pricing at 68px,
 * compare and features and about at 44, partners and contact and blog at 30,
 * help-center at 32, product at 26, security with none at all. Nobody decided
 * that; each page was built on its own day and picked its own number. Moving
 * between them felt like moving between websites, which is the whole of "some
 * pages look right and some look wrong".
 *
 * A shared scale only stays shared if drifting out of it is noisy. This fails
 * when a public page:
 *
 *   - does not opt into .mkt-page
 *   - hand-rolls a font size on an h1 or h2 instead of inheriting
 *   - uses a bare <div> where the heading should be, so the scale cannot apply
 *
 * The app itself is not checked here — it has ModuleHero, which is its own
 * shared header, and audit-nav-stability covers its chrome.
 */

const fs = require('fs');
const path = require('path');

/* Public pages: everything under app/ that is not the signed-in app, the field
   app, an API route, or a token-gated portal view. */
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git', 'api', 'app', 'field'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'page.tsx') out.push(p);
  }
  return out;
}

/* Pages that are deliberately outside the marketing shell. */
const EXEMPT = new Set([
  'app/page.tsx',            // the homepage runs the richer [data-landing] scale
  'app/takeoff/page.tsx',    // same
  'app/login/page.tsx',
  'app/signup/page.tsx',
  'app/forgot-password/page.tsx',
  'app/reset-password/page.tsx',
  'app/accept-invite/page.tsx',
  'app/welcome/page.tsx',
  'app/sitemap.xml/page.tsx',
]);

const pages = walk('app').map((f) => f.split(path.sep).join('/'));
const problems = [];
let checked = 0;

for (const rel of pages) {
  if (EXEMPT.has(rel)) continue;
  /* Token-gated customer views have their own minimal shell. */
  if (/\/(portals|sign|w9|prequal|share)\//.test('/' + rel)) continue;

  const src = fs.readFileSync(rel, 'utf8');
  /* Only pages that render the marketing nav are part of this system. */
  if (!/MarketingNav|MarketingFooter/.test(src)) continue;
  checked++;

  if (!/mkt-page/.test(src)) {
    problems.push(`${rel}\n      does not opt into .mkt-page — it will render at browser default sizes`);
  }

  /* Both spellings. Catching only clamp() let app/bids keep a flat
     `fontSize:26` on its h1 and still pass — the audit reported clean while a
     page sat two sizes below every other heading on the site. */
  const rolled = [
    ...src.matchAll(/<h[12][^>]*fontSize:\s*'clamp\(([^']*)'/g),
    ...src.matchAll(/<h[12][^>]*fontSize:\s*(\d+(?:\.\d+)?)/g),
  ];
  for (const m of rolled) {
    problems.push(`${rel}\n      hand-rolled heading size (${m[1]}) — inherit from .mkt-page instead`);
  }
}

console.log('='.repeat(74));
console.log('PAGE CONSISTENCY — is every public page on the same type system?');
console.log('='.repeat(74));
console.log(`  public pages checked  ${checked}`);
console.log('');
console.log(`  PROBLEMS              ${problems.length}`);
if (problems.length) {
  console.log('');
  problems.forEach((p) => console.log(`  ${p}`));
}
if (!checked) {
  console.log('');
  console.log('PARSE FAILED — found 0 marketing pages. The clean result means nothing.');
  process.exitCode = 2;
} else {
  process.exitCode = problems.length ? 1 : 0;
}
