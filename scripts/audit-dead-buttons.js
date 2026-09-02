#!/usr/bin/env node
/**
 * audit-dead-buttons — controls that look clickable and do nothing.
 *
 * The Invite button on the Team page rendered, hovered, took a click and had no
 * handler behind it. Nothing threw, nothing logged, the GC clicked it twice and
 * decided the product was broken — which it was. TypeScript cannot see this: a
 * <button> with no onClick is valid JSX.
 *
 * Six ways a control ends up dead, all of them found in this codebase:
 *
 *   no-handler      <button> with no onClick, not a submit, not disabled
 *   empty-handler   onClick={() => {}} — wired to nothing
 *   placeholder     handler whose whole body is a console.log / alert / TODO
 *   dead-href       <Link href="/x"> where no route file serves /x
 *   hash-href       href="#" or href="" with no onClick to intercept it
 *   disabled-forever  disabled={true} literal — never becomes enabled
 *
 * Run:  node scripts/audit-dead-buttons.js [--json]
 */

const fs = require('fs');
const path = require('path');

const JSON_OUT = process.argv.includes('--json');

/* ── files ──────────────────────────────────────────────────────────────── */

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

const files = [...walk('app'), ...walk('components')];

/* ── every route the app actually serves ────────────────────────────────── */

/* Built from the filesystem, because a href is only dead relative to what
   exists. Dynamic segments become a wildcard so /projects/[projectId]/budget
   matches /projects/<uuid>/budget. */
/* walk() only returns .tsx, and API handlers are route.ts — so the route table
   is built from its own walk over every extension. */
function walkAll(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkAll(p, out);
    else out.push(p);
  }
  return out;
}

const routeSet = new Set();
for (const f of walkAll('app')) {
  if (!/^(page|route)\.(tsx|ts|jsx|js)$/.test(path.basename(f))) continue;
  let url = f
    .split(path.sep).join('/')
    .replace(/^app/, '')
    .replace(/\/(page|route)\.(tsx|ts|jsx|js)$/, '');
  /* Route groups (auth) are organisational, not part of the URL. */
  url = url.replace(/\/\([^/]+\)/g, '');
  routeSet.add(url === '' ? '/' : url);
}
const routes = [...routeSet];

const routeMatchers = routes.map((r) => ({
  url: r,
  re: new RegExp('^' + r.replace(/\[\.\.\.[^\]]+\]/g, '.+').replace(/\[[^\]]+\]/g, '[^/]+') + '$'),
}));

function routeExists(href) {
  const clean = href.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
  return routeMatchers.some((m) => m.re.test(clean));
}

/* ── scanning ───────────────────────────────────────────────────────────── */

const BACKSLASH = String.fromCharCode(92);
const BACKTICK = String.fromCharCode(96);

/** End of a JSX opening tag, tracking brace depth and quotes. */
function openTagEnd(src, open) {
  let i = open;
  let depth = 0;
  let quote = null;
  while (i < src.length) {
    const ch = src[i];
    if (quote) {
      if (ch === BACKSLASH) { i += 2; continue; }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === BACKTICK) { quote = ch; i++; continue; }
    if (ch === '{') { depth++; i++; continue; }
    if (ch === '}') { depth--; i++; continue; }
    if (ch === '>' && depth === 0) return { end: i + 1, selfClosing: src[i - 1] === '/' };
    i++;
  }
  return { end: -1, selfClosing: false };
}

/** The balanced {...} value of an attribute, or null. */
function attrValue(attrs, name) {
  const m = attrs.match(new RegExp('\\b' + name + '=\\{'));
  if (!m) return null;
  let i = m.index + m[0].length - 1;
  let depth = 0;
  const start = i;
  let quote = null;
  while (i < attrs.length) {
    const ch = attrs[i];
    if (quote) {
      if (ch === BACKSLASH) { i += 2; continue; }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === BACKTICK) { quote = ch; i++; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return attrs.slice(start + 1, i); }
    i++;
  }
  return null;
}

/**
 * Blank out comments, keeping every offset and line number intact.
 *
 * GradientButton's header says "otherwise a <button>" and premium's says
 * "Renders as a <button> unless the caller wraps it" — prose about the
 * component, reported as two dead buttons. Documentation is not UI.
 */
function stripComments(src) {
  const out = src.split('');
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      if (ch === BACKSLASH) { i += 2; continue; }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === BACKTICK) { quote = ch; i++; continue; }
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') { out[i] = ' '; i++; }
      continue;
    }
    if (ch === '/' && next === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] !== '\n') out[i] = ' ';
        i++;
      }
      out[i] = ' '; out[i + 1] = ' ';
      i += 2;
      continue;
    }
    /* JSX comments: {/* … *​/} — the braces are already blanked by the block
       branch above once it reaches them. */
    i++;
  }
  return out.join('');
}

/**
 * Is this offset inside a <Link href> / <a href> that carries the click?
 *
 *   <Link href="/design/discover"><button style={goldBtn}>Get a Free Quote</button></Link>
 *
 * is the app's normal way to make a styled CTA navigate, and the button
 * genuinely has no onClick — the anchor around it does the work. Reporting the
 * three CTAs at the bottom of the design page as dead would have sent me
 * rewriting working navigation.
 */
function insideNavigator(src, idx) {
  const OPEN = /<(Link|a)(?![A-Za-z0-9_])/g;
  let m;
  while ((m = OPEN.exec(src)) !== null) {
    if (m.index > idx) break;
    const tag = m[1];
    const { end: tagEnd, selfClosing } = openTagEnd(src, m.index);
    if (tagEnd < 0 || selfClosing) continue;
    const attrs = src.slice(m.index, tagEnd);
    if (!/\bhref=/.test(attrs) && !/\bonClick=/.test(attrs)) continue;
    /* Where does it close? Count nested same-tag opens. */
    let depth = 1;
    const TAG = new RegExp('<(/?)' + tag + '(?![A-Za-z0-9_])', 'g');
    TAG.lastIndex = tagEnd;
    let t;
    let close = -1;
    while ((t = TAG.exec(src)) !== null) {
      if (t[1] === '/') { depth--; if (depth === 0) { close = t.index; break; } }
      else if (!openTagEnd(src, t.index).selfClosing) depth++;
    }
    if (close > idx) return attrs;
  }
  return null;
}

const findings = [];
const add = (file, line, kind, detail, snippet) =>
  findings.push({ file, line, kind, detail, snippet: snippet.replace(/\s+/g, ' ').slice(0, 110) });

for (const f of files) {
  const src = stripComments(fs.readFileSync(f, 'utf8'));
  const rel = f.split(path.sep).join('/');

  /* Does the file define a form submit? Buttons inside one may legitimately
     carry no onClick. */
  const hasFormSubmit = /onSubmit=/.test(src);

  /* ── <button> ─────────────────────────────────────────────────────────── */
  for (const m of src.matchAll(/<button(?![A-Za-z0-9_])/g)) {
    const open = m.index;
    const { end } = openTagEnd(src, open);
    if (end < 0) continue;
    const attrs = src.slice(open, end);
    const line = src.slice(0, open).split('\n').length;

    const isSubmit = /type=["']submit["']/.test(attrs);
    const isReset = /type=["']reset["']/.test(attrs);
    const handler = attrValue(attrs, 'onClick');
    /* onClick is the usual way, not the only one. The radio page's push-to-talk
       is onPointerDown/onPointerUp — held, not clicked — and reporting it as
       dead would be the audit inventing work. Any React event handler counts. */
    const hasHandlerAttr = /\bon[A-Z][A-Za-z]*=/.test(attrs);
    const spread = /\{\.\.\./.test(attrs);

    if (!hasHandlerAttr && !isSubmit && !isReset && !spread) {
      const nav = insideNavigator(src, open);
      if (nav) continue; // the anchor around it navigates
      /* A form in the file makes an unhandled button plausible-but-unproven,
         so it is reported at lower confidence rather than dropped. */
      add(rel, line, hasFormSubmit ? 'no-handler-maybe-submit' : 'no-handler',
        hasFormSubmit ? 'no onClick; file has a form, may be an implicit submit' : 'no onClick and not type="submit"',
        attrs);
      continue;
    }

    if (handler !== null) {
      const body = handler.trim();
      if (/^\(\s*\)\s*=>\s*\{\s*\}$/.test(body) || /^\(\s*\)\s*=>\s*(undefined|null|void 0)$/.test(body)) {
        add(rel, line, 'empty-handler', 'onClick does nothing', body);
      } else if (/^\(?[^)]*\)?\s*=>\s*(console\.(log|warn|info)|alert)\(/.test(body)) {
        add(rel, line, 'placeholder', 'onClick only logs or alerts', body);
      /* Case-sensitive and word-bounded: the first pass matched "todo" inside
         toggleComplete(todo.id) and called a working checkbox a stub. */
      } else if (/\b(TODO|FIXME|XXX|HACK)\b/.test(body) || /not implemented|coming soon/i.test(body)) {
        add(rel, line, 'placeholder', 'onClick is a stub', body);
      }
    }

    const disabled = attrValue(attrs, 'disabled');
    if (disabled !== null && /^true$/.test(disabled.trim())) {
      add(rel, line, 'disabled-forever', 'disabled={true} — never enabled', attrs);
    }
  }

  /* ── <Link href> and <a href> ─────────────────────────────────────────── */
  for (const m of src.matchAll(/<(Link|a)(?![A-Za-z0-9_])/g)) {
    const open = m.index;
    const { end } = openTagEnd(src, open);
    if (end < 0) continue;
    const attrs = src.slice(open, end);
    const line = src.slice(0, open).split('\n').length;

    const lit = attrs.match(/href=["']([^"']*)["']/);
    if (!lit) continue; // computed href — cannot resolve statically
    const href = lit[1];

    if (href === '#' || href === '') {
      if (!/\bonClick=/.test(attrs)) {
        add(rel, line, 'hash-href', `href="${href}" with no onClick`, attrs);
      }
      continue;
    }
    if (/^(https?:|mailto:|tel:|sms:|data:|blob:|intent:|App-prefs:)/.test(href)) continue;
    if (!href.startsWith('/')) continue; // relative — skip
    if (!routeExists(href)) {
      add(rel, line, 'dead-href', `no route serves ${href}`, attrs);
    }
  }
}

/* ── report ─────────────────────────────────────────────────────────────── */

if (JSON_OUT) {
  console.log(JSON.stringify(findings, null, 2));
  process.exitCode = findings.length ? 1 : 0;
} else {
  const byKind = {};
  for (const x of findings) (byKind[x.kind] = byKind[x.kind] || []).push(x);

  console.log('='.repeat(74));
  console.log('DEAD CONTROLS — things that look clickable and are not');
  console.log('='.repeat(74));
  console.log(`files scanned   ${files.length}`);
  console.log(`routes known    ${routes.length}`);
  console.log(`FINDINGS        ${findings.length}`);
  console.log('');
  for (const k of Object.keys(byKind).sort((a, b) => byKind[b].length - byKind[a].length)) {
    console.log(`  ${String(byKind[k].length).padStart(4)}  ${k}`);
  }

  for (const k of Object.keys(byKind).sort((a, b) => byKind[b].length - byKind[a].length)) {
    console.log('');
    console.log('-'.repeat(74));
    console.log(`${k}  (${byKind[k].length})`);
    console.log('-'.repeat(74));
    for (const x of byKind[k]) {
      console.log(`  ${x.file}:${x.line}`);
      console.log(`      ${x.detail}`);
      console.log(`      ${x.snippet}`);
    }
  }
  process.exitCode = findings.length ? 1 : 0;
}
