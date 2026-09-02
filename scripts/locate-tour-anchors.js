#!/usr/bin/env node
/**
 * locate-tour-anchors — where is the control each tour step points at?
 *
 * Text matching is a fallback, not a plan: the Takeoff Studio drop zone is a
 * <div>, so "Drop blueprints here" matched nothing while sitting in plain view.
 * Every step the reader must act on needs a data-tour attribute on the real
 * element. This finds the elements so they can be given one.
 *
 * For each anchorText in lib/help-tours.ts, prints the file, the line, and the
 * tag the text sits on — so it is obvious whether the existing button-scoped
 * search would ever have found it.
 */

const fs = require('fs');
const path = require('path');

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
const toursSrc = fs.readFileSync('lib/help-tours.ts', 'utf8');

/** Every anchorText string in the tour file, with its step title. */
const wanted = [];
{
  const stepRe = /title: '((?:[^'\\]|\\.)*)'[\s\S]*?(?=\n\s*(?:title:|\},?\s*\n\s*\]|\]))/g;
  let m;
  while ((m = stepRe.exec(toursSrc)) !== null) {
    const block = m[0];
    const title = m[1];
    const at = block.match(/anchorText: \[([^\]]*(?:\][^\]]*)*?)\]\s*,/);
    if (!at) continue;
    const texts = [...at[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'"));
    const hasTourAttr = /\[data-tour/.test(block);
    if (texts.length) wanted.push({ title, texts, hasTourAttr });
  }
}

/** Which tag does this text sit on? Walk back to the nearest '<'. */
function tagAt(src, idx) {
  for (let i = idx; i >= 0 && i > idx - 2000; i--) {
    if (src[i] === '<' && /[A-Za-z]/.test(src[i + 1] || '')) {
      const m = src.slice(i).match(/^<([A-Za-z][\w.]*)/);
      if (m) return m[1];
    }
  }
  return '?';
}

console.log('='.repeat(78));
console.log('WHERE EACH TOUR STEP POINTS');
console.log('='.repeat(78));

for (const w of wanted) {
  if (w.hasTourAttr) continue;
  console.log('');
  console.log(`${w.title}   [${w.texts.join(' | ')}]`);
  let found = 0;
  for (const text of w.texts) {
    const core = text.replace(/[→←·]/g, '').trim();
    if (!core) continue;
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      let i = src.indexOf(core);
      while (i >= 0 && found < 4) {
        const line = src.slice(0, i).split('\n').length;
        const tag = tagAt(src, i);
        const rel = f.split(path.sep).join('/');
        console.log(`    ${tag.padEnd(10)} ${rel}:${line}`);
        found++;
        i = src.indexOf(core, i + 1);
      }
      if (found >= 4) break;
    }
    if (found) break;
  }
  if (!found) console.log('    NOT FOUND ANYWHERE');
}
