#!/usr/bin/env node
/**
 * flatten-cards — apply the elevation rule across the app.
 *
 *   raised  you act on it, or it is a distinct object you would point at and
 *           name: a table, a form, a list you click into
 *   flat    you read it
 *
 * 503 SectionCards across 124 files is too many to classify by hand and far too
 * many to flip blind, so the rule is applied mechanically and the split is
 * printed before anything is written. Run with --apply to write.
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
 * Where the opening tag ends, and whether it closes itself.
 *
 * The first version scanned for the next "/>" and hit the one inside
 * icon={<MapPin … />} — an attribute, not the card — so every element came out
 * ~90 characters long, the children were never read, and 477 of 503 cards were
 * classified as having no controls. Attributes carry JSX, braces and strings,
 * so the only way through is to track depth and quote state.
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
    if (ch === '>' && depth === 0) {
      return { end: i + 1, selfClosing: src[i - 1] === '/' };
    }
    i++;
  }
  return { end: -1, selfClosing: false };
}

/** End of the whole element, counting nested SectionCards. */
function elementEnd(src, open) {
  const first = openTagEnd(src, open);
  if (first.end < 0) return -1;
  if (first.selfClosing) return first.end;

  let depth = 1;
  const TAG = /<(\/?)SectionCard\b/g;
  TAG.lastIndex = first.end;
  let m;
  while ((m = TAG.exec(src)) !== null) {
    if (m[1] === '/') {
      depth--;
      if (depth === 0) return m.index + '</SectionCard>'.length;
    } else if (!openTagEnd(src, m.index).selfClosing) {
      depth++;
    }
  }
  return -1;
}

const CONTROL = /<button\b|<Link\b|<input\b|<select\b|<textarea\b|onClick=|<a\s+href|<table\b|<form\b|role="button"/;

const files = walk('app').concat(walk('components'));
let flat = 0, raised = 0, already = 0, skipped = 0;
const perFile = [];

for (const f of files) {
  let src = fs.readFileSync(f, 'utf8');
  if (!/<SectionCard\b/.test(src)) continue;

  const opens = [];
  const re = /<SectionCard\b/g;
  let m;
  while ((m = re.exec(src)) !== null) opens.push(m.index);

  let fileFlat = 0, fileRaised = 0;
  /* Right to left so earlier offsets stay valid as text is inserted. */
  for (let i = opens.length - 1; i >= 0; i--) {
    const open = opens[i];
    const end = elementEnd(src, open);
    if (end < 0) { skipped++; continue; }

    const openEnd = openTagEnd(src, open).end;
    const attrs = src.slice(open, openEnd);
    const children = src.slice(openEnd, end);

    if (/\bflat\b/.test(attrs)) { already++; continue; }
    if (CONTROL.test(children)) { fileRaised++; raised++; continue; }

    fileFlat++; flat++;
    if (APPLY) {
      src = src.slice(0, open) + '<SectionCard flat' + src.slice(open + '<SectionCard'.length);
    }
  }

  if (fileFlat || fileRaised) perFile.push({ f: f.split(path.sep).join('/'), fileFlat, fileRaised });
  if (APPLY && fileFlat) fs.writeFileSync(f, src, 'utf8');
}

console.log(APPLY ? 'APPLIED' : 'DRY RUN — nothing written (pass --apply)');
console.log('');
console.log(`  flat (content, no controls)   ${flat}`);
console.log(`  raised (has controls)         ${raised}`);
console.log(`  already flat                  ${already}`);
console.log(`  unparsed                      ${skipped}`);
console.log('');
console.log('screens with the most flattened:');
perFile.sort((a, b) => b.fileFlat - a.fileFlat).slice(0, 12)
  .forEach((x) => console.log(`  ${String(x.fileFlat).padStart(3)} flat  ${String(x.fileRaised).padStart(3)} raised   ${x.f}`));
