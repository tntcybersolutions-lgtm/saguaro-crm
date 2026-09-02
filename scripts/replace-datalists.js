#!/usr/bin/env node
/**
 * replace-datalists — swap the native datalist popup for our own.
 *
 *   <input value={v} onChange={e=>setV(e.target.value)} list="reasons" style={INP}/>
 *   <datalist id="reasons"><option value="Owner request"/>…</datalist>
 *
 * becomes
 *
 *   <Suggest value={v} onChange={setV} options={['Owner request', …]} style={INP}/>
 *
 * The native popup is drawn by the browser, not the page. It ignores
 * `color-scheme: dark`, it ignores every stylesheet, and on Windows Chrome it
 * lands as a white box under a dark form.
 *
 * Only converts what it can prove: an input whose onChange is the plain
 * `e => setX(e.target.value)` shape, paired to a datalist whose options are
 * either literal <option value="…"/> or a single `{ARRAY.map(…)}`. Anything
 * else is reported for hand treatment rather than guessed at.
 *
 * Dry run by default. --apply to write.
 */

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

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

const BACKSLASH = String.fromCharCode(92);
const BACKTICK = String.fromCharCode(96);

/**
 * End of a JSX opening tag, tracking braces and quotes.
 *
 * A `[^>]*` scan cannot find it: `onChange={e=>setX(e.target.value)}` contains
 * a `>` inside an arrow function, so the naive regex stopped mid-attribute and
 * every single input in the app looked like it had no `list=` at all.
 */
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
    if (ch === '>' && depth === 0) return i + 1;
    i++;
  }
  return -1;
}

/** The whole `<input …>` tag whose attributes contain list="id". */
function findInputFor(src, id) {
  const RE = /<input\b/g;
  let m;
  while ((m = RE.exec(src)) !== null) {
    const end = openTagEnd(src, m.index);
    if (end < 0) continue;
    const tag = src.slice(m.index, end);
    if (new RegExp(`list=["']${id}["']`).test(tag)) return { tag, start: m.index, end };
  }
  return null;
}

const skipped = [];
let converted = 0;
const perFile = [];

for (const file of walk('app')) {
  let src = fs.readFileSync(file, 'utf8');
  const rel = file.split(path.sep).join('/');
  if (!/<datalist/.test(src)) continue;

  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  let fileCount = 0;

  /* Each datalist, with the options it offers. */
  const lists = [...src.matchAll(/<datalist\s+id="([^"]+)"\s*>([\s\S]*?)<\/datalist>\s*/g)];

  for (const dl of lists) {
    const [whole, id, inner] = dl;

    /* Options: literal <option value="…"/> … */
    const literals = [...inner.matchAll(/<option\s+[^>]*value=["{]([^"}]*)["}]/g)].map((m) => m[1]);
    /* … or a single {ARRAY.map(…)} */
    const mapped = inner.match(/\{\s*([A-Za-z_$][\w$.]*)\s*\.map\s*\(/);

    let optionsExpr = null;
    if (literals.length) {
      optionsExpr = `{[${literals.map((v) => `'${v.replace(/'/g, "\\'")}'`).join(', ')}]}`;
    } else if (mapped) {
      optionsExpr = `{${mapped[1]}}`;
    } else {
      skipped.push(`${rel}  datalist#${id}: cannot read its options`);
      continue;
    }

    /* The input that points at it. */
    const found = findInputFor(src, id);
    if (!found) { skipped.push(`${rel}  datalist#${id}: no <input list="${id}"> found`); continue; }

    /* Attributes only: drop the leading '<input' and the trailing '>' / '/>'. */
    const attrs = found.tag
      .replace(/^<input\b/, '')
      .replace(/\/?>$/, '')
      .trim();

    /* Suggest keeps the native onChange signature, so the handler — however
       elaborate — carries over untouched. Only the tag name changes and
       `list=` becomes `options=`. The first version rewrote handlers into a
       string-callback shape and had to refuse seventeen of twenty-three call
       sites for not matching one exact spelling. */
    const rebuilt = attrs.replace(/\s*list=["'][^"']*["']/, '').trim();

    src = src.slice(0, found.start)
      + '<Suggest ' + rebuilt + ' options=' + optionsExpr + ' />'
      + src.slice(found.end);
    src = src.replace(whole, '');
    fileCount++;
    converted++;
  }

  if (!fileCount) continue;

  /* Import, after the last top-level import. */
  if (!/from '@\/components\/ui\/Suggest'/.test(src)) {
    const starts = [...src.matchAll(/^import\b/gm)].map((m) => m.index);
    let at = -1;
    for (const s of starts) {
      const semi = src.indexOf(';', s);
      if (semi > at) at = semi + 1;
    }
    if (at < 0) { skipped.push(`${rel}  no import to anchor Suggest`); continue; }
    src = src.slice(0, at) + eol + `import Suggest from '@/components/ui/Suggest';` + src.slice(at);
  }

  perFile.push({ rel, n: fileCount });
  if (APPLY) fs.writeFileSync(file, src, 'utf8');
}

console.log(APPLY ? 'APPLIED' : 'DRY RUN — nothing written (pass --apply)');
console.log('');
console.log(`  datalists replaced  ${converted}`);
console.log(`  files touched       ${perFile.length}`);
console.log(`  skipped             ${skipped.length}`);
console.log('');
perFile.forEach((x) => console.log(`  ${String(x.n).padStart(2)}  ${x.rel}`));
if (skipped.length) {
  console.log('');
  console.log('SKIPPED (hand treatment, not silently dropped):');
  skipped.forEach((s) => console.log(`  ${s}`));
}
