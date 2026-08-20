/**
 * Add field-page-enter animation class to every field page root div.
 * Looks for patterns like: return (\n    <div style={{ or return(<div style={{
 * and adds className="field-page-enter" to the first div.
 *
 * Run: node scripts/add-page-enter-animation.mjs
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
      else if (entry.endsWith('.tsx') && entry === 'page.tsx') results.push(full);
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

  // Skip layout.tsx, loading.tsx — only page.tsx files
  if (rel.includes('layout.tsx') || rel.includes('loading.tsx')) continue;

  // Skip if already has field-page-enter
  if (content.includes('field-page-enter')) continue;

  // Find the first return ( ... <div and add className
  // Pattern 1: return (\n    <div style={{
  // Pattern 2: return(\n    <div style={{
  // Pattern 3: return (\n<div style={{
  const replaced = content.replace(
    /return\s*\(\s*\n(\s*)<div\s+style=\{\{/,
    (match, indent) => {
      return match.replace(
        `<div style={{`,
        `<div className="field-page-enter" style={{`
      );
    }
  );

  if (replaced !== content) {
    writeFileSync(filePath, replaced, 'utf8');
    changed++;
    console.log(`  animated: ${rel}`);
  }
}

console.log('');
console.log(`=== ANIMATION CLASS SUMMARY ===`);
console.log(`Pages animated: ${changed}`);
console.log(`Total scanned: ${files.length}`);
