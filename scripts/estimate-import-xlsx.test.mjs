/**
 * Estimate import — real .xlsx and .csv round-trip through SheetJS.
 * Run: npx -y tsx scripts/estimate-import-xlsx.test.mjs
 *
 * lib/estimate-import.sanity.test.ts feeds the mapper hand-built arrays, which
 * proves the mapping rules and nothing about the shape SheetJS actually hands
 * back. This writes a workbook, reads it the way the dialog does, and checks the
 * whole path — including that a Total column never becomes a unit cost, which
 * would price every line twice.
 */
/* Round-trip a REAL .xlsx through SheetJS into the mapper — the unit tests fed
   the mapper hand-built arrays and never proved sheet_to_json's actual shape. */
import * as XLSX from 'xlsx';
import { buildPreview, applyMapping } from '../lib/estimate-import.ts';

let fails = 0;
const check = (n, c, d) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${n} — ${d}`); if (!c) fails++; };

// A workbook shaped like a real estimator's: header, mixed types, blank spacer,
// a total column, and a row with a number stored as a number not a string.
const aoa = [
  ['Cost Code', 'Description', 'Qty', 'Unit', 'Unit Cost', 'Labor Rate', 'Total'],
  ['03-300', 'Slab on grade', 1200, 'SF', 4.25, 2.1, 5100],
  ['03-350', 'Curing compound', 1200, 'SF', 0.15, 0, 180],
  ['', '', '', '', '', '', ''],
  ['26-100', 'Feeder conduit', 340, 'LF', 12.5, 6.75, 4250],
];
const ws = XLSX.utils.aoa_to_sheet(aoa);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Estimate');
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

// Read it back exactly as the dialog does.
const wb2 = XLSX.read(buf, { type: 'buffer' });
const rows = XLSX.utils.sheet_to_json(wb2.Sheets['Estimate'], { header: 1, defval: '', blankrows: false, raw: true });

check('SheetJS returns arrays of arrays', Array.isArray(rows) && Array.isArray(rows[0]), `${rows.length} rows`);
check('numbers come back as numbers, not strings',
  typeof rows[1][2] === 'number' && rows[1][2] === 1200, `typeof qty = ${typeof rows[1][2]}`);

const p = buildPreview(rows);
check('the header row is detected from a real sheet', p.skippedHeader === true, `skippedHeader=${p.skippedHeader}`);
check('columns map from real headers',
  p.mapping[0] === 'csi_code' && p.mapping[1] === 'description' && p.mapping[2] === 'quantity' &&
  p.mapping[3] === 'unit' && p.mapping[4] === 'unit_material_cost' && p.mapping[5] === 'unit_labor_cost',
  p.mapping.join(','));
check('the Total column is skipped', p.mapping[6] === 'ignore', `col 7 → ${p.mapping[6]}`);
check('3 data rows survive', p.totalRows === 3, `${p.totalRows} rows`);
check('the blank spacer row is counted as skipped', p.emptyRows >= 1, `emptyRows=${p.emptyRows}`);
check('values land on the right fields',
  p.rows[0].csi_code === '03-300' && p.rows[0].description === 'Slab on grade' &&
  p.rows[0].quantity === 1200 && p.rows[0].unit === 'SF' &&
  p.rows[0].unit_material_cost === 4.25 && p.rows[0].unit_labor_cost === 2.1,
  JSON.stringify(p.rows[0]));
check('no field received the Total value',
  !Object.values(p.rows[0]).includes(5100), 'the 5100 total did not become a cost');

// CSV path
const csv = XLSX.utils.sheet_to_csv(ws);
const wbCsv = XLSX.read(csv, { type: 'string' });
const csvRows = XLSX.utils.sheet_to_json(wbCsv.Sheets[wbCsv.SheetNames[0]], { header: 1, defval: '', blankrows: false, raw: true });
const pc = buildPreview(csvRows);
check('a CSV of the same data maps identically',
  pc.mapping.slice(0, 6).join(',') === p.mapping.slice(0, 6).join(',') && pc.totalRows === 3,
  `${pc.totalRows} rows, ${pc.mapping.slice(0,6).join(',')}`);

// Re-mapping after a user correction
const corrected = [...p.mapping];
corrected[4] = 'unit_sub_cost';
const re = applyMapping(rows.filter(r => r.some(c => String(c ?? '').trim() !== '')), corrected, { hasHeader: true });
check('changing a dropdown moves the money',
  re.rows[0].unit_sub_cost === 4.25 && re.rows[0].unit_material_cost === undefined,
  `sub=${re.rows[0].unit_sub_cost}, material=${re.rows[0].unit_material_cost}`);

console.log(fails === 0 ? '\nALL XLSX ROUND-TRIP CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
