#!/usr/bin/env node
/**
 * audit-cumulative-money — find code that ADDS UP a column which is already a
 * running total.
 *
 * WHY THIS EXISTS
 *
 * An App Store screenshot showed the field app's front screen reading
 * "$13.8M earned to date · of $8.5M contract · 100% earned" on a job billed to
 * $3.73M. total_completed_stored is AIA G702 line 4, "Total Completed and
 * Stored to Date": already cumulative on every pay application. Summing six
 * applications counted the first one's work six times.
 *
 * It was in three places. A fourth — app/financials.tsx in the field app — had
 * the correct rule written down along with a record of the same bug biting
 * before. The fix never travelled. That is exactly the shape of defect a tool
 * should catch instead of a person noticing it in a screenshot.
 *
 * WHICH COLUMNS
 *
 * Taken from app/api/pay-apps/create/route.ts, which is the authority: it rolls
 * app N-1's total_completed_stored forward as app N's "previous completed", and
 * its total_earned_less_retainage forward as "previous payments". A value that
 * rolls forward is cumulative by construction.
 *
 * Deliberately NOT flagged: current_payment_due, this_period, work_completed
 * and the SOV line columns are PERIODIC — one period's draw each — so summing
 * them is correct and common.
 *
 * Usage: node tools/audit-cumulative-money.mjs [rootA rootB ...]
 */
import fs from 'node:fs';
import path from 'node:path';

/** Columns whose value already includes every prior period. */
const CUMULATIVE = [
  'total_completed_stored', 'totalCompletedStored',
  'total_earned_less_retainage', 'totalEarnedLessRetainage',
  'contract_sum_to_date', 'contractSumToDate',
  'total_retainage', 'totalRetainage',
  'balance_to_finish', 'balanceToFinish',
];

/** Percentages are never additive, whatever they are attached to. */
const PERCENT = ['percent_complete', 'percentComplete', 'pct_complete', 'pctComplete'];

const ROOTS = process.argv.slice(2).length ? process.argv.slice(2) : ['app', 'lib', 'components'];
const SKIP = /node_modules|\.next|dist|database\.types|\btools\b/;

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * An aggregation is a reduce/sum/`+=` over a collection. We look at the
 * EXPRESSION being accumulated, not the whole file, so a file that merely
 * mentions the column elsewhere is not flagged.
 */
const PATTERNS = [
  // .reduce((acc, x) => acc + x.total_completed_stored, 0)
  { name: 'reduce',   re: /\.reduce\s*(?:<[^>]*>)?\s*\(\s*\([^)]*\)\s*=>\s*([^;]{0,200}?)\)\s*,/g },
  // sumCents(rows.map(r => toCents(r.total_retainage)))
  { name: 'sumCents', re: /\bsum(?:Cents)?\s*\(([^;]{0,240})\)/g },
  // running += p.total_completed_stored
  { name: '+=',       re: /(\w+)\s*\+=\s*([^;\n]{0,160})/g },

  /* THE COLUMN AS A STRING ARGUMENT. This one was missed on the first pass
     and cost a real bug: financial/project-report sums through a generic
     helper —

       const sumOrNull = (rows, key) => sumCents(rows.map(r => toCents(num(r[key]))));
       const retainageFromChildren = sumOrNull(payApps, 'total_retainage');

     — so the column name never appears inside an aggregation expression, only
     at the call site. The tool reported the whole web app clean while that
     route was quoting $1,383,100 of retainage against a true $373,000.
     Any helper whose name says it adds things up, handed a cumulative column
     by name, is the same mistake wearing a different shape. */
  { name: 'sum-helper',
    re: /\b(?:sum|total|add|accumulate|rollup|roll_?up)\w*\s*\(\s*[^)]{0,80}?,\s*['"]([a-z_]+)['"]\s*\)/gi },
];

const findings = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = fs.readFileSync(file, 'utf8');
    const lines = src.split(/\r?\n/);

    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        const expr = (m[2] ?? m[1] ?? '');
        const hitCum = CUMULATIVE.find((c) => expr.includes(c));
        const hitPct = PERCENT.find((c) => expr.includes(c));
        if (!hitCum && !hitPct) continue;

        const line = src.slice(0, m.index).split(/\r?\n/).length;
        const tail = src.slice(m.index, m.index + 400);

        /* AN AVERAGE IS NOT A DOUBLE-COUNT. The first run flagged seven
           things and five were this: a reduce divided by .length, or a sum
           paired with a count. Adding percentages up on the way to a mean is
           the only way to compute a mean. */
        if (/\)\s*\/\s*\w*\.?length/.test(tail) || /\.length\s*\)?\s*:/.test(tail)) continue;

        /* A reduce that PICKS rather than accumulates — max, min, latest — is
           the correct handling of a cumulative column, not a violation of it.
           The field app's financials screen does exactly this and got flagged
           for it on the first run. */
        if (/>\s*best\s*\?|<\s*best\s*\?|Math\.(max|min)\s*\(/.test(tail)) continue;
        const nextLines = lines.slice(line - 1, line + 2).join(' ');
        if (/\b\w+N\+\+|count\+\+|\bn\s*\+=\s*1/.test(nextLines)) continue;

        /* CUMULATIVE MEANS "ACROSS PERIODS", NOT "ACROSS ROWS". A pay
           application's total is cumulative over TIME, so summing several
           applications double-counts. The same column on schedule-of-values
           LINE ITEMS is per-line, and summing the lines is how you get the
           project total — which is what the two pay-app pages were doing.
           Only flag when the thing being iterated is pay applications. */
        const collection = (tail.match(/^\s*([\w.]+)\s*\.reduce/) || [])[1]
          || (tail.match(/\(\s*([\w.]+)\s*\.map/) || [])[1]
          /* sum-helper: sumOrNull(payApps, 'total_retainage') — the rows are the
             first argument, so that is where the collection name lives. */
          || (name === 'sum-helper' ? (tail.match(/\(\s*([\w.]+)\s*,/) || [])[1] : undefined)
          || '';
        const isPayApps = /payapp|pay_app|applications|\bapps\b/i.test(collection)
          || /payapp|pay_app/i.test(expr);
        const isLineItems = /\blines?\b|\bsov\b|\brows\b|lineItems|schedule_of_values/i.test(collection);
        if (hitCum && (isLineItems || !isPayApps)) continue;

        /* A comment within three lines that already explains the column is
           cumulative means somebody thought about it. */
        const near = lines.slice(Math.max(0, line - 4), line + 1).join(' ').toLowerCase();
        const acknowledged = /cumulative|not a sum|already (a )?running|latest app|per project|across projects/.test(near);

        findings.push({
          file, line, kind: name,
          column: hitCum || hitPct,
          why: hitPct ? 'percentage — never additive' : 'already cumulative — summing double-counts prior periods',
          acknowledged,
          snippet: (lines[line - 1] || '').trim().slice(0, 120),
        });
      }
    }
  }
}

const real = findings.filter((f) => !f.acknowledged);
const noted = findings.filter((f) => f.acknowledged);

if (!real.length) {
  console.log(`CLEAN — no unacknowledged aggregation of a cumulative column (${noted.length} acknowledged).`);
} else {
  console.log(`${real.length} suspected double-count${real.length === 1 ? '' : 's'}:\n`);
  for (const f of real) {
    console.log(`  ${f.file}:${f.line}  [${f.kind}]  ${f.column}`);
    console.log(`     ${f.why}`);
    console.log(`     ${f.snippet}\n`);
  }
}
if (noted.length) {
  console.log(`\n${noted.length} acknowledged in a nearby comment (not flagged):`);
  for (const f of noted) console.log(`  ${f.file}:${f.line}  ${f.column}`);
}
process.exit(real.length ? 1 : 0);
