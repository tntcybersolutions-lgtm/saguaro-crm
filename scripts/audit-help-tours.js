#!/usr/bin/env node
/**
 * audit-help-tours — do the arrows point at anything?
 *
 * A walkthrough that points at a button which does not exist is worse than no
 * walkthrough: the reader concludes the product is broken rather than that the
 * help is. Nothing about that failure is visible at build time — the tour is
 * data, the anchor is a string, and TypeScript is happy either way.
 *
 * So this checks each step against the codebase:
 *
 *   route / nextRoute   a page.tsx actually serves it
 *   [data-tour="x"]     that attribute is placed on some element
 *   a[href="/x"]        that route exists
 *   anchorText          the text appears in at least one .tsx file
 *
 * It cannot prove the control is on screen at that moment — that is a runtime
 * question about data state. It does prove the step is not pointing at a
 * button somebody renamed six months ago.
 */

const fs = require('fs');
const path = require('path');

/* ── the app's real routes and markup ───────────────────────────────────── */

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

const allFiles = [...walk('app'), ...walk('components')];
const tsxFiles = allFiles.filter((f) => /\.tsx$/.test(f));

const routes = new Set();
for (const f of walk('app')) {
  if (!/^(page|route)\.(tsx|ts|jsx|js)$/.test(path.basename(f))) continue;
  let url = f.split(path.sep).join('/').replace(/^app/, '')
    .replace(/\/(page|route)\.(tsx|ts|jsx|js)$/, '')
    .replace(/\/\([^/]+\)/g, '');
  routes.add(url === '' ? '/' : url);
}
const routeRes = [...routes].map((r) => ({
  url: r,
  re: new RegExp('^' + r.replace(/\[\.\.\.[^\]]+\]/g, '.+').replace(/\[[^\]]+\]/g, '[^/]+') + '$'),
}));
const routeExists = (href) => {
  const clean = (href.split('?')[0].split('#')[0].replace(/\/$/, '')) || '/';
  return routeRes.some((m) => m.re.test(clean));
};

/* Every data-tour value placed in the app, static or templated. */
const tourAttrs = new Set();
const tourAttrPatterns = [];
for (const f of tsxFiles) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/data-tour="([^"]+)"/g)) tourAttrs.add(m[1]);
  /* data-tour={`job-type-${t.key}`} → prefix "job-type-" */
  for (const m of src.matchAll(/data-tour=\{`([^`$]*)\$\{/g)) tourAttrPatterns.push(m[1]);
}

/* All visible-ish text, for anchorText checking. Cheap and good enough: the
   question is only "does this string appear anywhere in the UI source".
   lib/*.ts counts — plenty of visible labels are data, not markup, and scanning
   only .tsx reported the job-type cards as missing when their names come out of
   lib/project-templates.ts. help-tours itself is excluded so a step cannot
   satisfy the check by quoting itself. */
const labelFiles = [
  ...tsxFiles,
  ...walk('lib').filter((f) => /\.ts$/.test(f) && !/help-tours\.ts$/.test(f)),
];
const allSource = labelFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

/* ── the tours ──────────────────────────────────────────────────────────── */

const toursSrc = fs.readFileSync('lib/help-tours.ts', 'utf8');

/**
 * The `[ … ]` value of `key:` in a step, by balanced scan.
 *
 * A regex of `\[([^\]]*)\]` stops at the first `]` — which lands inside the
 * very first selector, `[data-tour="job-type-ground-up"]`. Every anchor list
 * was being read truncated to one broken fragment, so the lint validated
 * almost nothing while reporting a clean run.
 */
function arrayAfter(src, key) {
  const m = src.match(new RegExp(key + ':\\s*\\['));
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  let quote = null;
  const start = i;
  while (i < src.length) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; i++; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) return src.slice(start, i); }
    i++;
  }
  return null;
}

/* The file is TypeScript, so it is read rather than imported. Each tour is a
   top-level object in the TOURS array; steps are the objects inside it. */
const findings = [];
const add = (tour, step, kind, detail) => findings.push({ tour, step, kind, detail });

const tourBlocks = [];
{
  // \r? matters: lib/help-tours.ts is CRLF, so `\{\n` matched nothing and the
  // audit read zero tours while reporting a clean run over them.
  const re = /^  \{\r?\n    id: '([^']+)'/gm;
  let m;
  const starts = [];
  while ((m = re.exec(toursSrc)) !== null) starts.push({ id: m[1], at: m.index });
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].at : toursSrc.length;
    tourBlocks.push({ id: starts[i].id, body: toursSrc.slice(starts[i].at, end) });
  }
}

let stepCount = 0;
for (const t of tourBlocks) {
  /* startRoute */
  const sr = t.body.match(/startRoute: '([^']+)'/);
  if (sr && !routeExists(sr[1])) add(t.id, '-', 'dead-route', `startRoute ${sr[1]} serves no page`);

  /* Steps: split on "title:", which every step has. Matching an exact indent
     found zero steps and reported a clean run over nothing — hence the
     parsed-nothing guard at the end of this file. */
  const stepStarts = [...t.body.matchAll(/^\s+title: '/gm)].map((m) => m.index);
  for (let i = 0; i < stepStarts.length; i++) {
    const end = i + 1 < stepStarts.length ? stepStarts[i + 1] : t.body.length;
    const s = t.body.slice(stepStarts[i], end);
    stepCount++;
    const title = (s.match(/title: '([^']*)'/) || [])[1] || `step ${i + 1}`;

    for (const key of ['route', 'nextRoute']) {
      const m = s.match(new RegExp(key + ": '([^']+)'"));
      if (m && !routeExists(m[1])) add(t.id, title, 'dead-route', `${key} ${m[1]} serves no page`);
    }

    /* anchor selectors */
    const anchorBlock = arrayAfter(s, 'anchor');
    if (anchorBlock) {
      for (const sm of anchorBlock.matchAll(/'([^']+)'/g)) {
        const sel = sm[1];
        const dt = sel.match(/^\[data-tour(\^?)="([^"]+)"\]$/);
        if (dt) {
          const [, caret, val] = dt;
          const ok = caret
            ? tourAttrPatterns.some((p) => p.startsWith(val) || val.startsWith(p)) || [...tourAttrs].some((a) => a.startsWith(val))
            : tourAttrs.has(val) || tourAttrPatterns.some((p) => val.startsWith(p));
          if (!ok) add(t.id, title, 'missing-anchor', `no element carries data-tour="${val}"`);
          continue;
        }
        const href = sel.match(/a\[href="([^"]+)"\]/);
        if (href && !routeExists(href[1])) {
          add(t.id, title, 'dead-route', `anchor href ${href[1]} serves no page`);
        }
      }
    }

    /* anchorText */
    const textBlock = arrayAfter(s, 'anchorText');
    if (textBlock) {
      const wants = [...textBlock.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
      const anyFound = wants.some((w) => {
        if (!w) return true;
        /* Match the words rather than the exact run, so "Create & add drawings →"
           still matches JSX that splits the arrow into its own expression. */
        const core = w.replace(/[→←·]/g, '').trim();
        if (!core) return true;
        return allSource.includes(core);
      });
      if (!anyFound) {
        add(t.id, title, 'missing-text', `none of [${wants.join(', ')}] appears in any .tsx`);
      }
    }

    const adv = (s.match(/advance: '([^']+)'/) || [])[1];

    /* A step with no way to find anything. */
    if (!anchorBlock && !textBlock && adv && adv !== 'read') {
      add(t.id, title, 'unanchored', `advance:'${adv}' but no anchor and no anchorText`);
    }

    /**
     * A step the reader must ACT on, resting on text matching alone.
     *
     * "Drop blueprints here" is on the Takeoff Studio screen in plain sight,
     * and the arrow could not find it: the drop zone is a <div>, the text
     * search only looked at buttons, and the lint passed because the string
     * does appear in a .tsx. Text is a fallback. Anything the reader has to
     * click or type into gets a data-tour so the arrow cannot miss it.
     */
    if (adv && adv !== 'read') {
      const selectors = anchorBlock ? [...anchorBlock.matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
      const hasLiveTourAttr = selectors.some((sel) => {
        const dt = sel.match(/^\[data-tour(\^?)="([^"]+)"\]$/);
        if (!dt) return false;
        const val = dt[2];
        return tourAttrs.has(val) || tourAttrPatterns.some((p) => val.startsWith(p));
      });
      const hasHrefAnchor = selectors.some((sel) => /a\[href="/.test(sel));
      if (!hasLiveTourAttr && !hasHrefAnchor) {
        add(t.id, title, 'text-only-anchor',
          `advance:'${adv}' relies on button text alone — add data-tour to the control`);
      }
    }
  }
}

/* ── report ─────────────────────────────────────────────────────────────── */

console.log('='.repeat(74));
console.log('HELP TOURS — do the arrows point at anything?');
console.log('='.repeat(74));
console.log(`tours              ${tourBlocks.length}`);
console.log(`steps              ${stepCount}`);
console.log(`routes known       ${routes.size}`);
console.log(`data-tour anchors  ${tourAttrs.size} fixed + ${tourAttrPatterns.length} templated`);
console.log('');
console.log(`PROBLEMS           ${findings.length}`);

if (findings.length) {
  const byKind = {};
  for (const f of findings) (byKind[f.kind] = byKind[f.kind] || []).push(f);
  for (const k of Object.keys(byKind)) {
    console.log('');
    console.log(`${k}  (${byKind[k].length})`);
    for (const f of byKind[k]) console.log(`  ${f.tour} › ${f.step}\n      ${f.detail}`);
  }
}

/* An audit that parses nothing reports zero problems, which reads exactly like
   a pass. It is not one. */
if (!tourBlocks.length || !stepCount) {
  console.log('');
  console.log('PARSE FAILED — read 0 tours or 0 steps out of lib/help-tours.ts.');
  console.log('The clean result above is meaningless. Fix the parser.');
  process.exitCode = 2;
} else {
  process.exitCode = findings.length ? 1 : 0;
}
