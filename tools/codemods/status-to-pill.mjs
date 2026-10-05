#!/usr/bin/env node
/**
 * CODEMOD — status words drawn as styled text → <StatusPill>.
 *
 *   node tools/codemods/status-to-pill.mjs [--dry] [paths…]
 *
 * Finds `<span style={{…}}>Missing</span>`-shaped elements whose only child is
 * a literal status word (Missing, Not on File, Overdue, Approved, Paid,
 * Pending, Expired, …) and rewrites them as `<StatusPill module="generic"
 * status="missing" size="sm" />`, adding the import when the file lacks it.
 * The `generic` module in lib/status-system carries every word in the list,
 * so the pill always resolves to the right tone.
 *
 * Only literal, single-word-ish children are touched. A span whose text is an
 * expression (`{status}`) is left for a hand conversion — the gate reports it.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const targets = args.filter((a) => !a.startsWith('--'));
const ROOT = process.cwd();
const WORDS = ['Missing', 'Not on File', 'On File', 'Overdue', 'Approved', 'Paid', 'Pending', 'Rejected', 'Expired', 'Expiring', 'Draft', 'Submitted', 'Sent', 'Open', 'Closed', 'Active', 'Inactive', 'Complete', 'Completed', 'In Progress', 'Under Review', 'Signed', 'Unsigned', 'Certified', 'Declined', 'Cancelled', 'Canceled', 'Awarded', 'Won', 'Lost', 'Verified', 'Unverified', 'Late', 'On Time', 'Due Today', 'Not Started', 'Scheduled', 'Done'];
const WORD_RE = new RegExp('^(' + WORDS.map((w) => w.replace(/ /g, '\\s+')).join('|') + ')$', 'i');
const SPAN_RE = /<span([^>]*?)style=\{\{[^}]*\}\}([^>]*)>\s*([A-Za-z ]{2,16})\s*<\/span>/g;
const ALLOW_DIRS = ['app/portals/', 'app/sign/', 'app/w9/', 'app/print/', 'app/api/', 'app/get-the-app/'];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.next') walk(p, out); }
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const files = (targets.length ? targets.map((t) => path.resolve(ROOT, t)) : [path.join(ROOT, 'app', 'app'), path.join(ROOT, 'app', 'field'), path.join(ROOT, 'components')])
  .filter((t) => fs.existsSync(t))
  .flatMap((t) => (fs.statSync(t).isDirectory() ? walk(t) : [t]))
  .map(rel)
  .filter((r) => !ALLOW_DIRS.some((d) => r.startsWith(d)));

const slug = (w) => w.trim().toLowerCase().replace(/\s+/g, '_');
let replaced = 0, changedFiles = 0;
for (const r of files) {
  const abs = path.join(ROOT, r);
  const src = fs.readFileSync(abs, 'utf8');
  let n = 0;
  let out = src.replace(SPAN_RE, (whole, pre, post, text) => {
    const t = text.trim();
    if (!WORD_RE.test(t)) return whole;
    if (/\{/.test(pre + post)) return whole; // dynamic attributes — leave for a hand pass
    n++;
    return `<StatusPill module="generic" status="${slug(t)}" size="sm" />`;
  });
  if (n && !/from '@\/components\/ui\/Status'/.test(out)) {
    const m = out.match(/^import [^\n]*\n/m);
    const line = "import { StatusPill } from '@/components/ui/Status';\n";
    out = m ? out.replace(m[0], m[0] + line) : (out.startsWith("'use client';\n") ? out.replace("'use client';\n", "'use client';\n" + line) : line + out);
  }
  if (n) { replaced += n; changedFiles++; console.log(`${String(n).padStart(4)}  ${r}`); if (!DRY) fs.writeFileSync(abs, out); }
}
console.log(`${DRY ? '[dry] ' : ''}converted ${replaced} status spans in ${changedFiles} files`);
