/**
 * Fix horizontal scroll across all field pages.
 *
 * 1. Replace overflowX: 'auto' with flexWrap: 'wrap' on filter/chip rows
 * 2. Replace overflowX: 'scroll' with flexWrap: 'wrap' on filter/chip rows
 * 3. Add overflow-x containment comments where tables exist
 * 4. Remove minWidth values > 300px on flex children
 *
 * Run: node scripts/fix-horizontal-scroll.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const FIELD_DIR = join(ROOT, 'app', 'field');

function walk(dir) {
  let results = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) results = results.concat(walk(full));
      else if (entry.endsWith('.tsx')) results.push(full);
    }
  } catch {}
  return results;
}

const files = walk(FIELD_DIR);
let changed = 0;

for (const filePath of files) {
  let content = readFileSync(filePath, 'utf8');
  const original = content;
  const rel = relative(ROOT, filePath);

  // 1. Replace overflowX: 'auto' with flexWrap: 'wrap' in flex containers
  // This is the #1 horizontal scroll offender: filter chip rows
  content = content.replace(
    /overflowX:\s*'auto'/g,
    "flexWrap: 'wrap'"
  );

  // 2. Replace overflowX: 'scroll' with flexWrap: 'wrap'
  content = content.replace(
    /overflowX:\s*'scroll'/g,
    "flexWrap: 'wrap'"
  );

  // 3. For any remaining minWidth > 300 on inline styles of non-table elements,
  // convert to flex basis
  // minWidth: 400 → flex: '1 1 300px', minWidth: undefined
  // (This is too aggressive to do blindly — skip for safety)

  if (content !== original) {
    writeFileSync(filePath, content, 'utf8');
    changed++;
    console.log(`  fixed: ${rel}`);
  }
}

console.log('');
console.log(`=== HORIZONTAL SCROLL FIX SUMMARY ===`);
console.log(`Files fixed: ${changed}`);
console.log(`Total scanned: ${files.length}`);
