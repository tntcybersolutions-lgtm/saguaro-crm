#!/usr/bin/env node
/**
 * test-brand-contrast — can any tenant colour make the words disappear?
 *
 * The promise made to a GC is that they can brand the whole platform and it
 * will still be readable. That promise is only worth anything if it holds for
 * the colours people actually pick — including the pale yellow, the neon, the
 * near-white and the near-black — rather than the tasteful navy used to demo
 * it.
 *
 * So this runs every pair the theme produces through the WCAG formula for a
 * long list of deliberately awkward inputs and fails if any pair lands under
 * its threshold. It mirrors lib/brand-theme; change one, change both.
 */

const path = require('path');
const { execFileSync } = require('child_process');

/* The theme lives in TypeScript, so it is compiled to a temp module and run
   rather than reimplemented here — a second copy of the maths would pass its
   own tests while the shipped one failed. */
const fs = require('fs');
const os = require('os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brandtest-'));
const outFile = path.join(tmp, 'brand-theme.js');

try {
  execFileSync('npx', ['tsc', 'lib/brand-theme.ts', '--outDir', tmp, '--module', 'commonjs',
    '--target', 'es2019', '--skipLibCheck', '--moduleResolution', 'node'],
    { stdio: 'pipe', shell: process.platform === 'win32' });
} catch (e) {
  console.log('Could not compile lib/brand-theme.ts:');
  console.log(String(e.stdout || e.message).slice(0, 900));
  process.exit(2);
}

const T = require(outFile);

const AA_TEXT = 4.5;
const AA_LARGE = 3;

/* Colours a real tenant might hand us, chosen to be difficult. */
const INPUTS = [
  ['#F59E0B', null, 'Saguaro gold, default dark ground'],
  ['#FFF200', '#FFFFFF', 'neon yellow on white — the classic invisible case'],
  ['#FFFFFF', '#FFFFFF', 'white on white'],
  ['#000000', '#000000', 'black on black'],
  ['#0d1117', '#0d1117', 'brand identical to the ground'],
  ['#808080', '#808080', 'mid grey both — nothing separates from mid grey'],
  ['#1E3A5F', '#1E3A5F', 'navy brand on navy ground'],
  ['#FF0000', '#00FF00', 'maximum saturation clash'],
  ['#FDFDF5', '#FEFEF8', 'two near-whites'],
  ['#050505', '#0A0A0A', 'two near-blacks'],
  ['#7C3AED', null, 'purple brand, platform ground'],
  ['#059669', '#F8FAFC', 'green brand, near-white ground'],
  ['#EC4899', '#111827', 'pink on charcoal'],
  ['#A16207', '#FEF3C7', 'amber on cream — a real letterhead pairing'],
  [null, null, 'nothing supplied at all'],
  ['not-a-colour', 'also-not', 'garbage input'],
  ['#abc', '#123', 'three-digit hex'],
];

let checks = 0;
const failures = [];

for (const [primary, surface, label] of INPUTS) {
  const t = T.deriveTheme({ primary, surface });

  const pairs = [
    ['body text on cards', t.text, t.surface2, AA_TEXT],
    ['secondary text', t.textMuted, t.surface2, AA_TEXT],
    ['captions', t.textFaint, t.surface2, AA_LARGE],
    ['body text on the page', t.text, t.base, AA_TEXT],
    ['body text on raised surfaces', t.text, t.elevated, AA_TEXT],
    ['brand colour against the page', t.primary, t.surface, AA_LARGE],
    ['button text on the brand colour', t.onPrimary, t.primary, AA_TEXT],
  ];

  for (const [what, fg, bg, min] of pairs) {
    checks++;
    const a = T.parseHex(fg);
    const b = T.parseHex(bg);
    if (!a || !b) { failures.push(`${label}\n      ${what}: produced a non-colour (${fg} on ${bg})`); continue; }
    const ratio = T.contrast(a, b);
    if (ratio < min) {
      failures.push(`${label}\n      ${what}: ${ratio.toFixed(2)}:1 — needs ${min}:1  (${fg} on ${bg})`);
    }
  }
}

console.log('='.repeat(74));
console.log('TENANT BRANDING — can any colour make the words disappear?');
console.log('='.repeat(74));
console.log(`  themes built    ${INPUTS.length}`);
console.log(`  pairs checked   ${checks}`);
console.log(`  FAILURES        ${failures.length}`);
if (failures.length) {
  console.log('');
  failures.forEach((f) => console.log(`  ${f}`));
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp dir */ }

process.exitCode = failures.length ? 1 : 0;
