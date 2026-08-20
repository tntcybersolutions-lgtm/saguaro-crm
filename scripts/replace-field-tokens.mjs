/**
 * Token replacement script for Saguaro Field App.
 * Replaces local color constant declarations with centralized import.
 *
 * Run: node scripts/replace-field-tokens.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const FIELD_DIR = join(ROOT, 'app', 'field');
const COMP_DIR = join(ROOT, 'components', 'field');
const IMPORT_LINE = `import { F } from '@/lib/field-tokens';`;

// Token mapping: OLD_NAME → F.property
const TOKEN_MAP = {
  GOLD:   'F.gold',
  RAISED: 'F.raised',
  BORDER: 'F.border',
  TEXT:   'F.text',
  DIM:    'F.dim',
  GREEN:  'F.green',
  RED:    'F.red',
  BLUE:   'F.blue',
  AMBER:  'F.amber',
  PURPLE: 'F.purple',
  ORANGE: 'F.orange',
  CYAN:   'F.cyan',
  DARK:   'F.dark',
  TEAL:   'F.cyan',
};

// Collect all .tsx files recursively
function walk(dir) {
  let results = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) results = results.concat(walk(full));
      else if (entry.endsWith('.tsx')) results.push(full);
    }
  } catch { /* dir doesn't exist */ }
  return results;
}

const files = [...walk(FIELD_DIR), ...walk(COMP_DIR)];
let changed = 0, skipped = 0;

for (const filePath of files) {
  let content = readFileSync(filePath, 'utf8');
  const original = content;
  const rel = relative(ROOT, filePath);

  // Skip if already imported
  if (content.includes("import { F } from '@/lib/field-tokens'")) {
    skipped++;
    continue;
  }

  // Check if file has any color constants we care about
  const hasTokens = Object.keys(TOKEN_MAP).some(key =>
    new RegExp(`(?:^|\\n)const\\s+${key}\\s*=`, 'm').test(content) ||
    new RegExp(`(?:^|[,\\s])${key}\\s*=\\s*['"\`#]`, 'm').test(content)
  );

  if (!hasTokens) {
    skipped++;
    continue;
  }

  // --- Step 1: Remove multi-line const declarations ---
  // e.g., const GOLD = '#C8960F';
  // e.g., const GOLD   = '#C8960F';
  // e.g., const RAISED = '#0D1D2E';       // comment
  for (const key of Object.keys(TOKEN_MAP)) {
    content = content.replace(
      new RegExp(`^const\\s+${key}\\s*=\\s*[^;\\n]+;[^\\n]*\\n?`, 'gm'),
      ''
    );
  }

  // Also remove BG, BASE, CARD, CARD_GLASS
  for (const extra of ['BG', 'BASE', 'CARD_GLASS']) {
    content = content.replace(
      new RegExp(`^const\\s+${extra}\\s*=\\s*[^;\\n]+;[^\\n]*\\n?`, 'gm'),
      ''
    );
  }

  // --- Step 2: Remove single-line comma-separated const declarations ---
  // e.g., const GOLD = '#C8960F', RAISED = '#0D1D2E', BORDER = '#1E3A5F', TEXT = '#F0F4FF', DIM = '#8BAAC8';
  // Match lines starting with `const` followed by NAME = 'value', NAME = 'value', ...;
  content = content.replace(
    /^const\s+(?:GOLD|RAISED|BORDER|TEXT|DIM|GREEN|RED|BLUE|AMBER|PURPLE|ORANGE|CYAN|DARK|TEAL|BG|BASE|CARD|CARD_GLASS)\s*=\s*['"`][^'"`;]*['"`](?:\s*,\s*(?:GOLD|RAISED|BORDER|TEXT|DIM|GREEN|RED|BLUE|AMBER|PURPLE|ORANGE|CYAN|DARK|TEAL|BG|BASE|CARD|CARD_GLASS)\s*=\s*['"`][^'"`;]*['"`])*\s*;[^\n]*\n?/gm,
    ''
  );

  // --- Step 3: Clean up excessive blank lines ---
  content = content.replace(/\n{3,}/g, '\n\n');

  // --- Step 4: Add import statement ---
  // Insert after the last existing import statement
  const importMatch = content.match(/^import\s+.+$/gm);
  if (importMatch) {
    const lastImport = importMatch[importMatch.length - 1];
    const lastImportIdx = content.lastIndexOf(lastImport);
    const insertPos = lastImportIdx + lastImport.length;
    content = content.slice(0, insertPos) + '\n' + IMPORT_LINE + content.slice(insertPos);
  } else {
    // No imports — insert after 'use client'; if present
    const ucMatch = content.match(/^'use client';\s*\n/);
    if (ucMatch) {
      const insertPos = ucMatch[0].length;
      content = content.slice(0, insertPos) + IMPORT_LINE + '\n' + content.slice(insertPos);
    } else {
      content = IMPORT_LINE + '\n' + content;
    }
  }

  // --- Step 5: Replace all token references ---
  for (const [key, replacement] of Object.entries(TOKEN_MAP)) {
    // Word-boundary replacement: match KEY but not inside strings, not as part of longer identifiers
    // Negative lookbehind for letters, underscore, dot, quote, hash, slash
    // Negative lookahead for letters, underscore
    content = content.replace(
      new RegExp(`(?<![a-zA-Z_.'"#/])${key}(?![a-zA-Z_])`, 'g'),
      replacement
    );
  }

  // Also replace standalone BG -> F.dark, BASE -> F.dark, CARD -> F.raised, CARD_GLASS -> F.card
  content = content.replace(/(?<![a-zA-Z_.'"#/])BG(?![a-zA-Z_])/g, 'F.dark');
  content = content.replace(/(?<![a-zA-Z_.'"#/])BASE(?![a-zA-Z_])/g, 'F.dark');
  content = content.replace(/(?<![a-zA-Z_.'"#/])CARD_GLASS(?![a-zA-Z_])/g, 'F.card');
  // CARD (not CARD_GLASS) — only if standalone
  content = content.replace(/(?<![a-zA-Z_.'"#/])CARD(?![_a-zA-Z])/g, 'F.raised');

  if (content !== original) {
    writeFileSync(filePath, content, 'utf8');
    changed++;
    console.log(`  updated: ${rel}`);
  } else {
    skipped++;
  }
}

console.log('');
console.log('=== TOKEN REPLACEMENT SUMMARY ===');
console.log(`Files updated: ${changed}`);
console.log(`Files skipped: ${skipped}`);
console.log(`Total scanned: ${files.length}`);
