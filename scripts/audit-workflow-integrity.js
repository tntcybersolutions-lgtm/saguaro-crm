#!/usr/bin/env node
/**
 * audit-workflow-integrity — every way a screen can lie to a GC, found at once.
 *
 * Written because the alternative was finding these one screenshot at a time:
 * a duplicate button here, a dead handler there, two numbers disagreeing on the
 * same page. Each was real, and each was discovered by a person using the
 * product rather than by anything that ran. This runs.
 *
 * Six checks, each anchored to a defect that actually shipped:
 *
 *   1. DEAD HANDLERS      onClick handlers that can `return` before doing any
 *                         work and without telling anyone. "Build it all"
 *                         returned on a null takeoffId: no request, no error,
 *                         no toast — indistinguishable from broken.
 *   2. RIVAL TRACKERS     more than one progress/step component on one screen.
 *                         The project overview carried two roadmaps that
 *                         disagreed about what to do next.
 *   3. AMBIGUOUS NUMBERS  two different figures both labelled "complete" on the
 *                         same page — billing percent beside a step count.
 *   4. UNBOUNDED CALLS    awaits on a page-load path with no timeout. An
 *                         unbounded createSignedUrl left the takeoff screen
 *                         loading forever.
 *   5. UNCHECKED WRITES   supabase-js returns { error }; it does not throw.
 *                         (Detail lives in audit-unchecked-writes.js.)
 *   6. DEAD LINKS         hrefs into /app that have no page.tsx behind them.
 */

const fs = require('fs');
const path = require('path');

const APP = 'app';
const COMPONENTS = 'components';

function walk(dir, out = [], ext = /\.(tsx|ts)$/) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, ext);
    else if (ext.test(e.name)) out.push(p);
  }
  return out;
}

const rel = (f) => f.split(path.sep).join('/');
const pages = walk(APP).filter((f) => /page\.tsx$/.test(f));
const all = [...walk(APP), ...walk(COMPONENTS)];
const findings = { dead: [], rivals: [], numbers: [], unbounded: [], links: [] };

/* ── 1. Handlers that can return without doing anything or saying anything ── */
for (const f of all) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /const\s+(handle[A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{([\s\S]{0,400})/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, name, body] = m;
    const firstLines = body.split('\n').slice(0, 4).join('\n');
    const bareReturn = /^\s*if\s*\([^)]*\)\s*return\s*;/m.test(firstLines);
    if (!bareReturn) continue;
    const tellsSomeone = /(showToast|setError|toast\(|alert\(|console\.(warn|error))/.test(firstLines);
    if (tellsSomeone) continue;
    /* Guarding on something the user just did — cancelled the file dialog, left
       a field empty, tapped outside a canvas — is correct and silent by design.
       What matters is a guard on hidden state the user cannot see or fix, which
       is exactly what made "Build it all" a dead button. */
    const guardText = (firstLines.match(/if\s*\(([^)]*)\)\s*return\s*;/) || ['', ''])[1];
    const userSupplied = /\b(file|files|e\.target|value|input|selected|editing|editLead|query|text|photo|zip|room|style|manual|event|Ref\.current|markup|compareSelections|installEvent)/i.test(guardText);
    if (userSupplied) continue;
    findings.dead.push({
      file: rel(f),
      line: src.slice(0, m.index).split('\n').length,
      name,
      guard: (firstLines.match(/if\s*\([^)]*\)\s*return\s*;/) || [''])[0].trim(),
    });
  }
}

/* ── 2. More than one progress tracker rendered on a screen ── */
const TRACKERS = ['GettingStartedRail', 'PreConFlow', 'SetupChecklist', 'ProjectJourney', 'OnboardingRail'];
for (const f of pages) {
  const src = fs.readFileSync(f, 'utf8');
  const present = TRACKERS.filter((t) => new RegExp(`<${t}[\\s/>]`).test(src));
  if (present.length > 1) findings.rivals.push({ file: rel(f), trackers: present });
}

/* ── 3. Two different figures both called "complete" on one screen ── */
for (const f of pages) {
  const src = fs.readFileSync(f, 'utf8');
  /* Only things that actually render as a number beside the word. The first
     version matched bare identifiers — "class", "td", "to" — and reported them
     as completion figures, which made 57 findings that meant nothing. */
  const hits = [
    ...src.matchAll(/\{([A-Za-z0-9_.?[\]]{2,40})\}\s*%\s*complete/gi),
    ...src.matchAll(/\{([A-Za-z0-9_.?[\]]{2,40})\}\s*\/\s*\{?[A-Za-z0-9_.?[\]]{1,40}\}?\s*complete/gi),
  ].map((x) => x[1].trim());
  const distinct = [...new Set(hits)];
  if (distinct.length > 1) findings.numbers.push({ file: rel(f), sources: distinct.slice(0, 4) });
}

/* ── 4. Awaited network calls with no timeout, in modules a page load hits ── */
/* Storage reads only. A slow fetch in a cron job or a webhook dispatcher is a
   background problem; a slow storage call in a route a page is waiting on is a
   screen that never loads. Counting both made the number meaningless. */
const NETWORKY = /(createSignedUrl|\.download\()/;
for (const f of walk('lib')) {
  const src = fs.readFileSync(f, 'utf8');
  if (!NETWORKY.test(src)) continue;
  /* withTimeout() is the shared bound exported from storage-signing; a file
     that imports it is bounded even though it defines no timer of its own.
     Missing that reported two already-fixed calls as outstanding. */
  const bounded = /(Promise\.race|AbortSignal|AbortController|setTimeout|withTimeout\()/.test(src);
  if (bounded) continue;
  const lines = src.split(/\r?\n/);
  lines.forEach((l, i) => {
    if (/await\s/.test(l) && NETWORKY.test(l)) {
      findings.unbounded.push({ file: rel(f), line: i + 1, text: l.trim().slice(0, 84) });
    }
  });
}

/* ── 5. hrefs into /app with nothing behind them ── */
const routeExists = (href) => {
  const clean = href.split('?')[0].split('#')[0].replace(/\/$/, '');
  if (!clean.startsWith('/app')) return true;
  const segs = clean.split('/').filter(Boolean);
  let dir = APP;
  for (const seg of segs) {
    if (!fs.existsSync(dir)) return false;
    const kids = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());
    const exact = kids.find((d) => d.name === seg);
    const dyn = kids.find((d) => /^\[.*\]$/.test(d.name));
    const next = exact || dyn;
    if (!next) return false;
    dir = path.join(dir, next.name);
  }
  return fs.existsSync(path.join(dir, 'page.tsx'));
};

const seen = new Set();
for (const f of all) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/href=["'](\/app\/[A-Za-z0-9\-_/]*)["']/g)) {
    const href = m[1];
    const key = href;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!routeExists(href)) findings.links.push({ file: rel(f), href });
  }
}

/* ── report ── */
const H = (t) => '\n' + t + '\n' + '-'.repeat(t.length);
console.log('='.repeat(74));
console.log('WORKFLOW INTEGRITY');
console.log('='.repeat(74));
console.log(`pages scanned            ${pages.length}`);
console.log(`files scanned            ${all.length}`);
console.log('');
console.log(`dead handlers            ${findings.dead.length}`);
console.log(`screens with 2+ trackers ${findings.rivals.length}`);
console.log(`ambiguous "complete"     ${findings.numbers.length}`);
console.log(`unbounded network calls  ${findings.unbounded.length}`);
console.log(`dead /app links          ${findings.links.length}`);

if (findings.dead.length) {
  console.log(H('HANDLERS THAT CAN DO NOTHING SILENTLY'));
  for (const d of findings.dead.slice(0, 25)) console.log(`  ${d.file}:${d.line}  ${d.name}  ${d.guard}`);
  if (findings.dead.length > 25) console.log(`  … ${findings.dead.length - 25} more`);
}
if (findings.rivals.length) {
  console.log(H('SCREENS WITH COMPETING PROGRESS TRACKERS'));
  for (const r of findings.rivals) console.log(`  ${r.file}  ->  ${r.trackers.join(' + ')}`);
}
if (findings.numbers.length) {
  console.log(H('TWO THINGS CALLED "COMPLETE" ON ONE SCREEN'));
  for (const n of findings.numbers) console.log(`  ${n.file}  ->  ${n.sources.join(' | ')}`);
}
if (findings.unbounded.length) {
  console.log(H('NETWORK CALLS WITH NO TIMEOUT'));
  for (const u of findings.unbounded.slice(0, 20)) console.log(`  ${u.file}:${u.line}  ${u.text}`);
  if (findings.unbounded.length > 20) console.log(`  … ${findings.unbounded.length - 20} more`);
}
if (findings.links.length) {
  console.log(H('LINKS TO PAGES THAT DO NOT EXIST'));
  for (const l of findings.links) console.log(`  ${l.href}   (from ${l.file})`);
}

process.exitCode =
  findings.rivals.length + findings.numbers.length + findings.links.length > 0 ? 1 : 0;
