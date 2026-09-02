#!/usr/bin/env node
/**
 * audit-fixed-anchoring — does the app shell break position:fixed?
 *
 * `position: fixed` means "relative to the viewport" only while no ancestor has
 * a transform, filter, perspective, backdrop-filter, will-change on one of
 * those, or paint containment. Any one of them turns that ancestor into the
 * containing block, and every fixed descendant silently re-anchors to it.
 *
 * PageTransition did exactly that. Its 150ms fade animated translateY with
 * fill-mode `forwards`, so the final keyframe stuck and left a permanent
 * identity transform — visually nothing, structurally a containing block for
 * all 223 pages under /app. Modals stopped being positioned against the screen
 * and started being positioned against the page box. On the measured takeoff
 * page, 2806px tall, the first-run wizard put its 82%-opaque scrim over the
 * whole view and its dialog at y=1238 in a 720px window: a black screen with
 * nothing on it to dismiss. It was reported as a freeze.
 *
 * The first version of this audit grepped whole shell files for `transform:`.
 * That flagged every drawer and every translateX(-50%) on a button, flagged the
 * prose in this very comment, and — the disqualifying part — scored the broken
 * PageTransition as CLEANER than the fixed one, because the fix is longer and
 * mentions the property it removed. A detector that ranks the bug above the fix
 * is worse than no detector.
 *
 * So the rule is applied where it is actually true: only to the element that
 * wraps {children}. A transform on a button is fine. A transform on the wrapper
 * every page renders inside is the bug. Finding that element means matching JSX
 * structurally, because a tag cannot be delimited by scanning for the next `>`
 * — an attribute like onChange={e => f(e)} contains one.
 */

const fs = require('fs');

/* The wrappers every page renders inside. */
const SHELL = [
  'app/layout.tsx',
  'app/app/layout.tsx',
  'app/field/layout.tsx',
  'components/PageTransition.tsx',
  'components/SubscriptionWall.tsx',
  'components/ErrorBoundary.tsx',
];

/* Properties that create a containing block for position:fixed descendants. */
const CONTAINING_BLOCK = [
  { key: 'transform', re: /(?:^|[,{\s])transform\s*:\s*(?!['"`]?none)/ },
  { key: 'filter', re: /(?:^|[,{\s])filter\s*:\s*(?!['"`]?none)/ },
  { key: 'backdrop-filter', re: /(?:^|[,{\s])(?:Webkit)?[bB]ackdropFilter\s*:\s*(?!['"`]?none)/ },
  { key: 'perspective', re: /(?:^|[,{\s])perspective\s*:\s*(?!['"`]?none)/ },
  { key: 'will-change', re: /willChange\s*:\s*['"`][^'"`]*(?:transform|filter|perspective)/ },
  { key: 'contain', re: /(?:^|[,{\s])contain\s*:\s*['"`][^'"`]*(?:paint|strict|content)/ },
];

/* Comments are prose. They must never be matched as code. */
function stripComments(src) {
  let out = '';
  let i = 0;
  let q = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (q) {
      if (c === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
      if (c === q) q = null;
      out += c; i++; continue;
    }
    if (c === "'" || c === '"' || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); const cut = e < 0 ? src.length : e + 2; out += src.slice(i, cut).replace(/[^\n]/g, ' '); i = cut; continue; }
    if (c === '/' && n === '/') { const e = src.indexOf('\n', i); const cut = e < 0 ? src.length : e; out += ' '.repeat(cut - i); i = cut; continue; }
    out += c; i++;
  }
  return out;
}

/* End of a JSX opening tag, brace- and quote-aware. Scanning for the next '>'
   stops inside onChange={e => f(e)}; this does not. */
function openTagEnd(src, start) {
  let i = start;
  let depth = 0;
  let q = null;
  while (i < src.length) {
    const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; }
    else if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return i;
    i++;
  }
  return -1;
}

/* The opening tag of the element that directly contains `offset`, by keeping a
   stack of unclosed tags. The top of the stack at that point is the parent. */
function parentTagAt(src, offset) {
  const stack = [];
  let i = 0;
  while (i < offset && i < src.length) {
    if (src[i] === '<') {
      const closing = src[i + 1] === '/';
      const m = /^<\/?([A-Za-z][\w.]*)/.exec(src.slice(i, i + 60));
      if (!m) { i++; continue; }
      const end = openTagEnd(src, i);
      if (end < 0) break;
      if (end >= offset) break;
      const selfClosing = src[end - 1] === '/';
      if (closing) stack.pop();
      else if (!selfClosing) stack.push({ name: m[1], start: i, end });
      i = end + 1;
      continue;
    }
    i++;
  }
  return stack.length ? stack[stack.length - 1] : null;
}

const lineAt = (src, i) => src.slice(0, i).split(/\r?\n/).length;

const problems = [];
let checked = 0;
let wrappers = 0;

for (const rel of SHELL) {
  if (!fs.existsSync(rel)) continue;
  checked++;
  const raw = fs.readFileSync(rel, 'utf8');
  const src = stripComments(raw);

  for (const m of src.matchAll(/\{\s*children\s*\}/g)) {
    const tag = parentTagAt(src, m.index);
    if (!tag) continue;
    wrappers++;
    const attrs = src.slice(tag.start, tag.end + 1);
    if (/allow-fixed-anchoring/.test(raw.slice(tag.start, tag.end + 1))) continue;

    for (const p of CONTAINING_BLOCK) {
      if (p.re.test(attrs)) {
        problems.push(
          `${rel}:${lineAt(src, tag.start)}  <${tag.name}> wraps {children}\n      ${p.key} here makes this the containing block for every\n      position:fixed descendant — modals stop being anchored to\n      the viewport and land wherever the page box puts them`,
        );
      }
    }

    /* The exact regression: fill-mode forwards over a transform keyframe leaves
       the transform behind for good. Clearing it when the animation ends is the
       fix, so an onAnimationEnd on the same element counts as handled.
       The keyframe name cannot be read positionally — the real code writes
       `animation: mounted ? 'saguaroPageIn …' : 'none'`, where the token after
       the colon is the ternary test, not the animation. Reading it that way is
       why the first version of this check missed the very bug it was written
       for. So instead: collect the keyframe names that actually exist, and see
       which of them this element names. */
    if (/\bforwards\b/.test(attrs) && !/onAnimationEnd/.test(attrs)) {
      const css = fs.existsSync('app/globals.css') ? fs.readFileSync('app/globals.css', 'utf8') : '';
      const defined = new Map();
      for (const body of [css, src]) {
        for (const k of body.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]{0,600}?)\n\s*\}/g)) {
          defined.set(k[1], /transform/.test(k[2]));
        }
        for (const k of body.matchAll(/@keyframes\s+([\w-]+)\s*\{[^@]{0,400}/g)) {
          if (!defined.has(k[1])) defined.set(k[1], /transform/.test(k[0]));
        }
      }
      for (const [name, movesTransform] of defined) {
        if (!movesTransform) continue;
        if (!new RegExp(`\\b${name}\\b`).test(attrs)) continue;
        problems.push(
          `${rel}:${lineAt(src, tag.start)}  <${tag.name}> wraps {children}\n      animation "${name}" uses fill-mode forwards over a transform\n      keyframe and nothing clears it — the final transform sticks\n      permanently and becomes a containing block`,
        );
        break;
      }
    }
  }
}

console.log('='.repeat(74));
console.log('FIXED ANCHORING — does the app shell break position:fixed?');
console.log('='.repeat(74));
console.log(`  shell files checked   ${checked}`);
console.log(`  {children} wrappers   ${wrappers}`);
console.log('');
console.log(`  PROBLEMS              ${problems.length}`);
if (problems.length) {
  console.log('');
  problems.forEach((p) => console.log(`  ${p}`));
}
if (!checked || !wrappers) {
  console.log('');
  console.log('PARSE FAILED — found no {children} wrappers. Clean means nothing.');
  process.exitCode = 2;
} else {
  process.exitCode = problems.length ? 1 : 0;
}
