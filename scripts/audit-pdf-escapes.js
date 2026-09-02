#!/usr/bin/env node
/**
 * audit-pdf-escapes — does any document still open in a browser tab?
 *
 * The platform has its own PDF reader (components/PdfViewer.tsx): side-by-side
 * compare, page nav, zoom, markup deep-link, and the tenant's own chrome around
 * it. Every document is supposed to open there.
 *
 * It kept getting bypassed one page at a time. `window.open(url)` is the
 * shortest thing to write, and it works — it just dumps the user out of the
 * product into Chrome's PDF plugin, with a browser toolbar, no branding, no
 * compare, and no way back but the back button. On the Documents page every
 * "Open" button did this. In the client portal it threw the customer out of the
 * portal they were invited to.
 *
 * So: opening a document through the browser is a finding.
 *
 * Not everything that opens a tab is a document. OAuth consent has to happen in
 * a real browser window, and a map link belongs in the maps app. Those are
 * listed as allowed, by exact call site, so the exception set stays small and
 * visible instead of quietly absorbing the next PDF.
 */

const fs = require('fs');
const path = require('path');

/* Call sites that legitimately open a browser tab. */
const ALLOWED = [
  { re: /auth_?[uU]rl|authUrl/, why: 'OAuth consent must run in a real browser window' },
  { re: /mapsUrl|google\.com\/maps/, why: 'map links belong in the maps app' },
  { re: /qrUrl/, why: 'QR fallback when the share sheet is unavailable' },
  { re: /mailto:|tel:/, why: 'mail and phone handoff' },
  { re: /\.csv|\.xlsx|export/i, why: 'spreadsheet export is a download, not a document view' },
];

/* Things that name a document rather than some other resource. */
const DOCUMENTISH = /\b(pdf|pdfUrl|pdf_url|doc|docs|document|file_url|fileUrl|drawing|spec|invoice|payapp|waiver|bond|coi|jacket|report|url)\b/i;

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

const problems = [];
let scanned = 0;
let allowed = 0;

for (const f of walk('app').concat(walk('components'))) {
  const rel = f.split(path.sep).join('/');
  const src = fs.readFileSync(rel, 'utf8');
  if (!/window\.open\(/.test(src)) continue;
  scanned++;

  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!/window\.open\(/.test(line)) return;
    /* The reader itself documents the pattern it replaced; that mention is
       prose in a comment, not a call. */
    if (/^\s*(\*|\/\/)/.test(line)) return;

    const ok = ALLOWED.find((a) => a.re.test(line));
    if (ok) { allowed++; return; }
    if (!DOCUMENTISH.test(line)) return;

    problems.push(
      `${rel}:${i + 1}\n      opens a document in a browser tab — use openPdf({ url, title })\n      from @/components/PdfViewer so it stays in the product\n      ${line.trim().slice(0, 96)}`,
    );
  });
}

console.log('='.repeat(74));
console.log('PDF ESCAPES — does any document still open outside the product?');
console.log('='.repeat(74));
console.log(`  files using window.open   ${scanned}`);
console.log(`  allowed call sites        ${allowed}`);
console.log('');
console.log(`  PROBLEMS                  ${problems.length}`);
if (problems.length) {
  console.log('');
  problems.forEach((p) => console.log(`  ${p}`));
}
if (!scanned) {
  console.log('');
  console.log('PARSE FAILED — found no window.open anywhere. Clean means nothing.');
  process.exitCode = 2;
} else {
  process.exitCode = problems.length ? 1 : 0;
}
