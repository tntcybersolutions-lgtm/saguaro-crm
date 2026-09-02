#!/usr/bin/env node
/**
 * audit-render-cost — effects that are cheap once and ruinous many times.
 *
 * A glass pass put `backdrop-filter: blur(16px)` on the shared card. It looked
 * right in isolation and froze the measured-takeoff page on a black screen,
 * because that page renders 21 cards and backdrop-filter forces a GPU
 * composited layer per element that re-reads the pixels behind it every frame.
 * Across the app there are 509 SectionCards and 295 StatCards, so the ceiling
 * is far worse than 21 — and none of it shows up in a typecheck, a build, or
 * any other audit here. It shows up as a customer staring at a dead tab.
 *
 * The rule is about FREQUENCY, not the property:
 *
 *   fine    chrome that exists once per screen — the top bar, a modal, a toast,
 *           a fixed action bar, the PDF reader, the help overlay
 *   fatal   anything rendered per row, per card or per button
 *
 * The first version of this audit guessed at frequency by measuring how close a
 * blur sat to a `.map(` in the source. That flagged eleven modals and toasts
 * that merely appeared later in the file than an unrelated list. A guess that
 * cries wolf gets ignored, and an ignored audit is worse than none — so
 * containment is now matched exactly, by walking parens from the `.map(`.
 *
 * Three rules, each independently sufficient:
 *
 *   1. blur in a component that is rendered many times per screen
 *   2. blur genuinely inside a .map() callback — one layer per row
 *   3. blur behind an opaque background — pays the full cost of a composited
 *      layer to filter pixels no one can see through. Free to delete.
 */

const fs = require('fs');
const path = require('path');

/* Components rendered many times on one screen. Blur here is a freeze. */
const REPEATED = [
  'components/ui/premium.tsx',
  'components/ui/cinematic.tsx',
  'components/ui/SectionCard.tsx',
  'components/ui/Status.tsx',
  'components/DataTable.tsx',
];

/* Within those files, functions that render once per PAGE, not once per row —
   the aurora backdrop and the surface that wraps it. Blur there is the point. */
const ONCE_PER_PAGE = /^(Aurora|PremiumSurface|CinematicPage|FxKeyframes)$/;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

const lineAt = (src, i) => src.slice(0, i).split(/\r?\n/).length;

/* Name of the exported component an offset sits inside. */
function enclosingComponent(src, offset) {
  let name = null;
  for (const m of src.matchAll(/(?:export\s+)?function\s+([A-Z]\w*)|const\s+([A-Z]\w*)\s*(?::[^=]+)?=\s*(?:\([^)]*\)|[\w]+)\s*(?::[^=]*)?=>/g)) {
    if (m.index > offset) break;
    name = m[1] || m[2];
  }
  return name;
}

/* Ranges of every .map( callback, matched by walking parens — not by distance.
   Strings and template literals are skipped so a paren inside a string cannot
   unbalance the walk. */
function mapRanges(src) {
  const ranges = [];
  for (const m of src.matchAll(/\.map\s*\(/g)) {
    let i = m.index + m[0].length;
    let depth = 1;
    let q = null;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (q) {
        if (c === '\\') i++;
        else if (c === q) q = null;
      } else if (c === "'" || c === '"' || c === '`') q = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    if (depth === 0) ranges.push([m.index, i]);
  }
  return ranges;
}

/* The style object literal a blur sits in, so its siblings can be read. */
function enclosingObject(src, offset) {
  let start = offset;
  let depth = 0;
  while (start > 0) {
    const c = src[start];
    if (c === '}') depth++;
    else if (c === '{') { if (depth === 0) break; depth--; }
    start--;
  }
  let end = offset;
  depth = 0;
  while (end < src.length) {
    const c = src[end];
    if (c === '{') depth++;
    else if (c === '}') { if (depth === 0) break; depth--; }
    end++;
  }
  return src.slice(start, end + 1);
}

/* A background the eye cannot see through — blurring what is behind it is
   wasted work by definition. rgba/hsla with real alpha are see-through; bare
   hex and named colors are not. */
function isOpaqueBackground(obj) {
  const m = obj.match(/background(?:Color)?:\s*(`[^`]*`|'[^']*'|"[^"]*")/);
  if (!m) return false;
  const v = m[1].slice(1, -1);
  if (/\$\{/.test(v)) return false;                  // interpolated — unknowable
  if (/gradient/.test(v)) return !/rgba\([^)]*,\s*0?\.\d+\s*\)/.test(v);
  if (/rgba?\([^)]*,\s*(0?\.\d+|0)\s*\)/.test(v)) return false;
  if (/hsla?\([^)]*,\s*(0?\.\d+|0)\s*\)/.test(v)) return false;
  if (/transparent|none/.test(v)) return false;
  return /^#[0-9a-fA-F]{3,8}$|^[a-z]+$|^rgb\(/.test(v.trim());
}

const problems = [];
let checked = 0;
const BLUR = /backdropFilter|backdrop-filter/g;

for (const f of walk('components').concat(walk('app'))) {
  const rel = f.split(path.sep).join('/');
  const src = fs.readFileSync(rel, 'utf8');
  if (!BLUR.test(src) && !/filter:\s*'blur\(/.test(src)) continue;
  checked++;

  const repeated = REPEATED.includes(rel);
  const maps = mapRanges(src);

  const hits = [
    ...src.matchAll(/backdropFilter|backdrop-filter/g),
    ...(repeated ? [...src.matchAll(/filter:\s*'blur\(/g)] : []),
  ];

  for (const h of hits) {
    const at = h.index;
    const obj = enclosingObject(src, at);

    /* Rule 1 — a shared component rendered many times per screen. */
    if (repeated) {
      const comp = enclosingComponent(src, at);
      if (!comp || !ONCE_PER_PAGE.test(comp)) {
        problems.push(`${rel}:${lineAt(src, at)}  [${comp || '?'}]\n      blur in a component rendered many times per screen — one GPU layer each`);
        continue;
      }
    }

    /* Rule 2 — genuinely inside a .map() callback. A fixed overlay is chrome
       even when it sits inside one, so position:fixed still exempts it. */
    if (maps.some(([a, b]) => at > a && at < b) && !/position:\s*'fixed'/.test(obj)) {
      problems.push(`${rel}:${lineAt(src, at)}\n      blur inside a .map() callback — one blurred layer per row`);
      continue;
    }

    /* Rule 3 — blurring what is behind an opaque surface. Pure waste. */
    if (isOpaqueBackground(obj)) {
      problems.push(`${rel}:${lineAt(src, at)}\n      blur behind an opaque background — costs a GPU layer, shows nothing`);
    }
  }
}

console.log('='.repeat(74));
console.log('RENDER COST — effects that are cheap once and ruinous many times');
console.log('='.repeat(74));
console.log(`  files with blur   ${checked}`);
console.log(`  repeated comps    ${REPEATED.length}`);
console.log('');
console.log(`  PROBLEMS          ${problems.length}`);
if (problems.length) {
  console.log('');
  problems.forEach((p) => console.log(`  ${p}`));
}
if (!checked) {
  console.log('');
  console.log('PARSE FAILED — found 0 files using blur at all. Clean means nothing.');
  process.exitCode = 2;
} else {
  process.exitCode = problems.length ? 1 : 0;
}
