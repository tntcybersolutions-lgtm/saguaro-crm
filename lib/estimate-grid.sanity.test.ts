/**
 * Estimate-grid sanity — clipboard parsing and line arithmetic.
 * Run: npx -y tsx lib/estimate-grid.sanity.test.ts   (exit 0 = every assertion held)
 *
 * Paste is where estimating tools quietly corrupt money, so most of this file
 * is about the clipboard. Each assertion exists because the naive version puts
 * a specific wrong number into a bid:
 *
 *   split('\t')          → a quoted description containing a tab shreds the row
 *   Number('$1,234.50')  → NaN, and the line silently prices at zero
 *   Number('(500)')      → NaN, or worse a positive where a credit was meant
 *   header row kept      → "Quantity" becomes a line item on the estimate
 *   excluded lines summed→ scope you explicitly disclaimed lands in the total
 */
import {
  parseNumber, parseClipboard, clipboardToRows, looksLikeHeader,
  lineTotals, groupRows, estimateTotals, divisionOf,
  type GridRow,
} from './estimate-grid';

let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  if (!cond) failures++;
};

/* ── numbers as people type them ─────────────────────────────────────────── */

check('plain number', parseNumber('1234.5') === 1234.5, '1234.5');
check('currency and thousands separators', parseNumber('$1,234.50') === 1234.5, `$1,234.50 → ${parseNumber('$1,234.50')}`);
check('accounting negative in brackets', parseNumber('(500)') === -500, `(500) → ${parseNumber('(500)')}`);
check('leading minus', parseNumber('-42') === -42, '-42');
check('percentage suffix is stripped', parseNumber('12%') === 12, `12% → ${parseNumber('12%')}`);
check('European decimal comma', parseNumber('1.234,50') === 1234.5, `1.234,50 → ${parseNumber('1.234,50')}`);
check('lone comma as decimal', parseNumber('12,5') === 12.5, `12,5 → ${parseNumber('12,5')}`);
check('lone comma as thousands', parseNumber('12,500') === 12500, `12,500 → ${parseNumber('12,500')}`);
check('empty is null, NOT zero', parseNumber('') === null && parseNumber('   ') === null,
  'a blank unit cost and a zero unit cost are different claims');
check('non-numeric is null', parseNumber('each') === null, `"each" → ${parseNumber('each')}`);
check('a real zero survives', parseNumber('0') === 0, '0');

/* ── clipboard ───────────────────────────────────────────────────────────── */

const excel = '03-300\tSlab on grade\t1200\tSF\t4.25\t2.10\t0\t0';
check('tab-separated row splits into cells', parseClipboard(excel)[0].length === 8, `${parseClipboard(excel)[0].length} cells`);

const quoted = '03-300\t"Slab, 6\\" thick"\t1200\tSF';
check('a quoted field containing a comma stays one cell',
  parseClipboard('03-300\t"Slab, 6in"\t1200\tSF')[0][1] === 'Slab, 6in',
  `→ "${parseClipboard('03-300\t"Slab, 6in"\t1200\tSF')[0][1]}"`);
check('a quoted field containing the DELIMITER stays one cell',
  parseClipboard('a\t"has\ttab"\tc')[0].length === 3 && parseClipboard('a\t"has\ttab"\tc')[0][1] === 'has\ttab',
  `cells=${parseClipboard('a\t"has\ttab"\tc')[0].length} — split('\\t') would give 4 and shred the row`);
check('a quoted field containing a NEWLINE does not split the row',
  parseClipboard('a\t"line1\nline2"\tc').length === 1,
  `rows=${parseClipboard('a\t"line1\nline2"\tc').length}`);
check('doubled quotes unescape', parseClipboard('a\t"say ""hi"""')[0][1] === 'say "hi"', 'escaped quotes');
check('CRLF is handled', parseClipboard('a\tb\r\nc\td').length === 2, 'Windows line endings');
check('a trailing newline does not add a phantom row', parseClipboard('a\tb\n').length === 1, 'no empty tail row');
check('comma delimiter is detected when there are no tabs',
  parseClipboard('a,b,c')[0].length === 3, 'CSV paste');
check('tabs win when both are present',
  parseClipboard('a,1\tb,2')[0].length === 2, 'a tab-separated file whose cells contain commas');
check('empty input is empty output', parseClipboard('').length === 0, '');

/* ── header detection ────────────────────────────────────────────────────── */

check('a header row is recognised',
  looksLikeHeader(['Code', 'Description', 'Quantity', 'Unit', 'Unit Cost']), 'named columns, no numbers');
check('a data row is NOT mistaken for a header',
  !looksLikeHeader(['03-300', 'Slab on grade', '1200', 'SF', '4.25']), 'has numbers');
check('a header is skipped on paste',
  clipboardToRows(parseClipboard('Code\tDescription\tQuantity\n03-300\tSlab\t1200')).rows.length === 1,
  'one data row survives, and skippedHeader is reported');
check('the skip is reported so the UI can say so',
  clipboardToRows(parseClipboard('Code\tDescription\tQuantity\n03-300\tSlab\t1200')).skippedHeader === true,
  'skippedHeader=true');

/* ── clipboard → rows ────────────────────────────────────────────────────── */

const pasted = clipboardToRows(parseClipboard(
  '03-300\tSlab on grade\t1,200\tSF\t$4.25\t$2.10\n03-350\tCuring\t1200\tSF\t0.15\t0.40',
));
check('two rows parse', pasted.rows.length === 2, `${pasted.rows.length} rows`);
check('columns map in grid order',
  pasted.rows[0].csi_code === '03-300' && pasted.rows[0].description === 'Slab on grade' &&
  pasted.rows[0].quantity === 1200 && pasted.rows[0].unit === 'SF',
  `code=${pasted.rows[0].csi_code} qty=${pasted.rows[0].quantity} unit=${pasted.rows[0].unit}`);
check('currency-formatted costs survive the trip',
  pasted.rows[0].unit_material_cost === 4.25 && pasted.rows[0].unit_labor_cost === 2.1,
  `material=${pasted.rows[0].unit_material_cost} labor=${pasted.rows[0].unit_labor_cost}`);
check('a paste can start mid-grid',
  clipboardToRows(parseClipboard('1200\tSF'), 2).rows[0].quantity === 1200,
  'offset 2 lands on quantity, as it would in Excel');
check('blank lines are dropped', clipboardToRows(parseClipboard('a\tb\n\n\nc\td')).rows.length === 2, 'no empty rows');

/* ── line arithmetic ─────────────────────────────────────────────────────── */

const row: GridRow = { quantity: 100, waste_factor_pct: 10, unit_material_cost: 4, unit_labor_cost: 2, unit_equipment_cost: 1, unit_sub_cost: 3 };
const t = lineTotals(row);
check('waste factor drives adjusted quantity', t.adjustedQuantity === 110, `100 + 10% → ${t.adjustedQuantity}`);
check('each bucket prices off the ADJUSTED quantity',
  t.material === 440 && t.labor === 220 && t.equipment === 110 && t.sub === 330,
  `material=${t.material} (110 × 4), not 400`);
check('line total sums the four buckets', t.total === 1100, `total=${t.total}`);
check('no waste factor means no adjustment',
  lineTotals({ quantity: 50, unit_material_cost: 2 }).material === 100, '50 × 2');

const excluded = lineTotals({ ...row, is_excluded: true });
check('an EXCLUDED line contributes nothing',
  excluded.total === 0 && excluded.adjustedQuantity === 110,
  'scope you disclaimed must not land in the total, but the quantity still shows');
check('an allowance still counts toward the total',
  lineTotals({ quantity: 1, unit_material_cost: 5000, is_allowance: true }).total === 5000,
  'an allowance is money you expect to spend');

/* ── grouping ────────────────────────────────────────────────────────────── */

const rows: GridRow[] = [
  { csi_code: '03-300', description: 'Slab', quantity: 100, unit_material_cost: 4 },
  { csi_code: '03-350', description: 'Curing', quantity: 100, unit_material_cost: 1 },
  { csi_code: '26-100', description: 'Feeders', quantity: 10, unit_sub_cost: 900 },
  { csi_code: '26-200', description: 'Owner-supplied fixtures', quantity: 1, unit_material_cost: 9999, is_excluded: true },
];
const groups = groupRows(rows);
check('rows group by CSI division', groups.length === 2, `${groups.length} groups`);
check('groups are ordered by division number', groups[0].division === '03', `first=${groups[0].division}`);
check('the group label names the division',
  groups[0].label === '03 · Concrete', `"${groups[0].label}"`);
check('group subtotals add up', groups[0].total === 500, `03 total=${groups[0].total} (400 + 100)`);
check('an excluded line is counted but not charged',
  groups[1].total === 9000 && groups[1].exclusions === 1,
  `26 total=${groups[1].total} (sub only), exclusions=${groups[1].exclusions}`);
check('division falls back to the code when csi_division is unset',
  divisionOf({ csi_code: '07-100' }) === '07', `→ ${divisionOf({ csi_code: '07-100' })}`);
check('an uncoded row lands in its own bucket rather than vanishing',
  groupRows([{ description: 'no code' }])[0].division === '—', 'grouped under —');

const totals = estimateTotals(rows);
check('estimate totals sum the groups', totals.total === 9500, `total=${totals.total}`);
check('estimate totals count exclusions separately',
  totals.exclusions === 1 && totals.lines === 4, `${totals.lines} lines, ${totals.exclusions} excluded`);

console.log(failures === 0 ? '\nALL ESTIMATE-GRID ASSERTIONS HELD' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
