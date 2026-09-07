/**
 * One-off codemod: collapse every spelling of the platform's name onto one.
 *
 * The name lived in ~300 files in four variants, plus a social-metadata tagline
 * that contradicted the browser title on the same page. This rewrites the
 * user-facing occurrences to the single canonical name.
 *
 * Deliberately skips:
 *   - code comments. A file-header comment reading "Saguaro Control Systems —
 *     Daily Log" names the FILE, not the product, and rewriting hundreds of them
 *     buries the real diff in noise.
 *   - lib/brand.ts, which defines the name.
 *   - generated files (database.types.ts) and anything under node_modules/.next.
 *
 * Run:  node scripts/codemod-platform-name.mjs [--write]
 * Without --write it only reports what it would change.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const WRITE = process.argv.includes('--write');
const NAME = 'Saguaro Control Systems — Construction Management & Project Controls';

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'out', 'dist', 'coverage', '.vercel']);
const SKIP_FILES = new Set(['lib/brand.ts', 'lib/database.types.ts', 'scripts/codemod-platform-name.mjs']);
const EXT = /\.(tsx?|jsx?)$/;

/** Is this line a code comment? Those are skipped — see the note above. */
function isComment(line) {
  const t = line.trim();
  return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*') || t.startsWith('/**');
}

/* Order matters: the longest, most specific spellings first, so a shorter rule
   cannot bite off part of a longer name and leave a fragment behind. */
const RULES = [
  // The competing tagline in the social metadata.
  [/Saguaro Control Systems\s+—\s+AI-Powered Construction Management/g, NAME],
  [/Saguaro Construction Software/g, NAME],
  [/Saguaro Construction Management/g, NAME],
  [/Saguaro CRM/g, NAME],
  // "Powered by Saguaro" where Saguaro stands alone as the product name.
  [/Powered by Saguaro(?!\s+Control)/g, `Powered by ${NAME}`],
  // The dominant spelling — but never one that already carries the full name.
  [/Saguaro Control Systems(?!\s+—\s+Construction Management & Project Controls)/g, NAME],
];

let filesChanged = 0, edits = 0;
const touched = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(ROOT, full).split(sep).join('/');
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full);
      continue;
    }
    if (!EXT.test(entry) || SKIP_FILES.has(rel)) continue;

    const src = readFileSync(full, 'utf8');
    if (!src.includes('Saguaro')) continue;

    let fileEdits = 0;
    const out = src.split('\n').map((line) => {
      if (isComment(line)) return line;
      let next = line;
      for (const [re, to] of RULES) {
        next = next.replace(re, () => { fileEdits++; return to; });
      }
      return next;
    }).join('\n');

    if (fileEdits > 0) {
      filesChanged++; edits += fileEdits;
      touched.push(`${rel}  (${fileEdits})`);
      if (WRITE) writeFileSync(full, out, 'utf8');
    }
  }
}

walk(ROOT);

for (const t of touched.sort()) console.log('  ' + t);
console.log(`\n${WRITE ? 'REWROTE' : 'WOULD REWRITE'} ${edits} occurrence(s) across ${filesChanged} file(s)`);
if (!WRITE) console.log('re-run with --write to apply');
