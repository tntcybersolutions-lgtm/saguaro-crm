/**
 * NO CSS IN A <style> TEXT CHILD.
 *
 *   <style>{CSS}</style>            ✗  React HTML-escapes it
 *   <style dangerouslySetInnerHTML={{ __html: CSS }} />   ✓
 *
 * A text child is escaped on the way out of the server renderer, so
 *
 *     .pmSortTh[aria-sort="ascending"]{color:var(--brand-primary-strong)}
 *
 * shipped to production as
 *
 *     .pmSortTh[aria-sort=&quot;ascending&quot;]{color:var(--brand-primary-strong)}
 *
 * A browser does NOT decode entities inside <style> — the element's content is
 * raw text — so that selector is invalid and the browser drops the rule.
 *
 * The client then renders the UNESCAPED text, the two text nodes differ, and
 * React throws #425 (text content did not match) followed by #422 (Suspense
 * boundary hydration failed) and discards the server HTML for that subtree.
 * components/ui/premium.tsx mounts on every page under /app, so every one of
 * them paid for that on every load.
 *
 * Measured on production before the fix, so the cost is stated accurately:
 * the sorted-column rules ARE present in the live stylesheet (2 of 382),
 * because the client re-render that the mismatch forces is also what repairs
 * the CSS. So the rule is dead only in the server HTML and up to hydration —
 * a flash and a discarded server render, not a permanently broken style. It
 * is still a bug worth blocking: it throws away SSR on every page load, and
 * anything that stopped that re-render would leave the CSS broken for good.
 *
 * Neither symptom shows up in tsc or next build. The CSS is a valid string and
 * the JSX is valid JSX; it is only wrong once it has been serialized. That is
 * why this check exists.
 *
 *   node tools/check-style-escapes.mjs             check the repo
 *   node tools/check-style-escapes.mjs --selftest  prove the rule still fires
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

/* Every character React escapes in a text child. A quote or an apostrophe is
   enough — those turn up in attribute selectors and font stacks constantly. */
const ESCAPED = /[<>&"']/;

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.next' || e === '.git' || e === 'ios' || e === 'android') continue;
    const p = join(dir, e);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') || p.endsWith('.jsx')) out.push(p);
  }
  return out;
}

/**
 * Blank out comments, keeping every byte offset so line numbers stay true.
 *
 * Needed because this file's own fix carries a comment that SHOWS the broken
 * spelling — and the first version of this check duly reported the fix as the
 * bug. Stripping with a regex is not an option either: CSS comments live INSIDE
 * the template literals we are trying to read, and `/*` in CSS must survive.
 * So this walks the source tracking whether it is in code, a string, a template
 * or a comment, and only blanks the comments.
 */
function blankComments(src) {
  const out = src.split('');
  const N = src.length;
  /* A mode stack, because a template can contain ${ } which contains code which
     can contain another template. The first version of this only stepped INTO
     a ${ } and never came back out, so everything after the first interpolation
     in PREMIUM_FX was scanned as code — where an apostrophe in a CSS comment
     opened a "string" that swallowed the rest of the file. */
  const stack = [];                       // 'T' = template body, 'E' = ${ } expression
  let i = 0;
  while (i < N) {
    const top = stack[stack.length - 1];

    if (top === 'T') {                    // inside a template literal
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') { stack.push('E'); i += 2; continue; }
      if (src[i] === '`') { stack.pop(); i++; continue; }
      i++;
      continue;
    }

    const c = src[i], d = src[i + 1];     // code, or inside a ${ } expression
    if (c === '/' && d === '/') {
      while (i < N && src[i] !== '\n') { out[i] = ' '; i++; }
      continue;
    }
    if (c === '/' && d === '*') {
      while (i < N && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] !== '\n') out[i] = ' '; i++; }
      if (i < N) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
      continue;
    }
    if (c === "'" || c === '"') {
      i++;
      while (i < N && src[i] !== c && src[i] !== '\n') { if (src[i] === '\\') i++; i++; }
      i++;
      continue;
    }
    if (c === '`') { stack.push('T'); i++; continue; }
    if (c === '}' && top === 'E') { stack.pop(); i++; continue; }
    i++;
  }
  return out.join('');
}

/** Read a template literal starting just after its opening backtick. */
function readTemplate(src, start) {
  let i = start, depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '$' && src[i + 1] === '{') { depth++; i += 2; continue; }
    if (c === '}' && depth > 0) { depth--; i++; continue; }
    if (c === '`' && depth === 0) return { css: src.slice(start, i), end: i };
    i++;
  }
  return { css: src.slice(start), end: src.length };
}

/** The CSS a `<style>` renders, for both spellings of the mistake. */
function styleChildren(src) {
  const out = [];
  /* Positions are found in comment-blanked source so prose about the bug is
     never mistaken for the bug; the CSS itself is then read from the ORIGINAL,
     because escapable characters inside a CSS comment still break hydration. */
  const code = blankComments(src);
  const OPEN = /<style\s*>\s*\{/g;
  let m;
  while ((m = OPEN.exec(code)) !== null) {
    const at = m.index + m[0].length;
    const line = src.slice(0, m.index).split(/\r?\n/).length;

    // <style>{`…`}</style>
    const tick = code.slice(at).match(/^\s*`/);
    if (tick) {
      const { css, end } = readTemplate(src, at + tick[0].length);
      out.push({ line, css, form: 'template literal' });
      OPEN.lastIndex = end;
      continue;
    }

    /* <style>{'…'}</style> and <style>{String.raw`…`}</style>. Both are real
       spellings in this repo and both are perfectly safe when the CSS has no
       escapable character, so resolve them rather than reporting a shrug. */
    const lit = code.slice(at).match(/^\s*(['"])/);
    if (lit) {
      const q = lit[1];
      const s = at + lit[0].length;
      let j = s;
      while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; }
      out.push({ line, css: src.slice(s, j), form: 'string literal' });
      OPEN.lastIndex = j;
      continue;
    }
    const raw = code.slice(at).match(/^\s*String\.raw\s*`/);
    if (raw) {
      const { css, end } = readTemplate(src, at + raw[0].length);
      out.push({ line, css, form: 'String.raw' });
      OPEN.lastIndex = end;
      continue;
    }

    /* <style>{CONSTANT}</style> — the spelling that hid components/ui/premium.tsx
       from the first version of this check. Resolve the constant in this file. */
    const ident = code.slice(at).match(/^\s*([A-Za-z_$][\w$]*)\s*\}/);
    if (ident) {
      const name = ident[1];
      const declAt = code.indexOf(`const ${name} = \``);
      if (declAt >= 0) {
        const { css } = readTemplate(src, declAt + `const ${name} = \``.length);
        out.push({ line, css, form: `constant ${name}` });
      } else {
        // Cannot see the value — report it so a human looks rather than assume.
        out.push({ line, css: null, form: `constant ${name} (declared elsewhere)` });
      }
      continue;
    }

    out.push({ line, css: null, form: 'expression' });
  }
  return out;
}

function offendersIn(src) {
  return styleChildren(src)
    .map((b) => {
      if (b.css === null) return { ...b, chars: null, sample: '' };
      const chars = [...new Set(b.css.match(ESCAPED) ? b.css.match(/[<>&"']/g) : [])].sort();
      if (!chars.length) return null;
      const sample = (b.css.match(/^.*[<>&"'].*$/m) || [''])[0].trim().slice(0, 96);
      return { ...b, chars, sample };
    })
    .filter(Boolean);
}

/* ── self-test: this check must be able to fail ───────────────────────────── */
const FIXTURES = [
  ['quote in an attribute selector', 'const A = () => <style>{`.x[aria-sort="asc"]{color:red}`}</style>;', true],
  ['child combinator', 'const A = () => <style>{`.a > .b{color:red}`}</style>;', true],
  ['ampersand', 'const A = () => <style>{`.a{content:"&"}`}</style>;', true],
  ['apostrophe in a comment', "const A = () => <style>{`/* pmRise's value */ .a{color:red}`}</style>;", true],
  ['constant child', 'const CSS = `.x[aria-sort="asc"]{color:red}`;\nconst A = () => <style>{CSS}</style>;', true],
  ['clean css is not flagged', 'const A = () => <style>{`.a{color:red;transform:translateY(-4px)}`}</style>;', false],
  ['clean constant is not flagged', 'const CSS = `.a{color:red}`;\nconst A = () => <style>{CSS}</style>;', false],
  ['dangerouslySetInnerHTML is the fix', 'const A = () => <style dangerouslySetInnerHTML={{ __html: `.a[x="1"] > .b{color:red}` }} />;', false],
];

if (process.argv.includes('--selftest')) {
  console.log('\nSTYLE-ESCAPE CHECK — self-test\n');
  let failed = 0;
  for (const [name, src, shouldFlag] of FIXTURES) {
    const flagged = offendersIn(src).length > 0;
    if (flagged !== shouldFlag) {
      failed++;
      console.log(`  FAIL  ${name} — expected ${shouldFlag ? 'a finding' : 'no finding'}, got ${flagged ? 'a finding' : 'none'}`);
    } else {
      console.log(`  ok    ${name}`);
    }
  }
  console.log(`\n  ${FIXTURES.length - failed}/${FIXTURES.length} checks passed\n`);
  process.exit(failed ? 1 : 0);
}

const files = walk(join(ROOT, 'app')).concat(walk(join(ROOT, 'components')));
let bad = 0;
console.log('\nSTYLE-ESCAPE CHECK — <style> text children that React will escape\n');
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  if (!src.includes('<style')) continue;
  for (const o of offendersIn(src)) {
    bad++;
    const rel = relative(ROOT, f).replace(/\\/g, '/');
    console.log(`  ${rel}:${o.line}  [${(o.chars || ['?']).join(' ')}]  (${o.form})`);
    if (o.sample) console.log(`      ${o.sample}`);
    console.log('      fix: <style dangerouslySetInnerHTML={{ __html: … }} />');
  }
}
console.log(bad ? `\n  ${bad} to fix\n` : '  clean — every <style> either has no escapable character or uses __html\n');
process.exitCode = bad ? 1 : 0;
