/**
 * A won job's budget starts from its takeoff, rolled up by CSI division.
 * Run: npx -y tsx lib/budget-seed.sanity.test.ts   (exit 0 = every assertion held)
 */
import { divisionOf, rollUpByDivision, type CostLine } from './budget-seed';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const line = (o: Partial<CostLine>): CostLine => ({ csi_division: null, csi_code: null, cost: 0, excluded: false, ...o });

// ── Which division ──
check('division column wins', divisionOf({ csi_division: '03', csi_code: '09 21 16' }) === '03');
check('falls back to the code', divisionOf({ csi_division: null, csi_code: '26 05 19' }) === '26');
check('blank division (AI takeoff rows) → the code', divisionOf({ csi_division: '', csi_code: '09 21 00' }) === '09');
check('"Div 9" is not a division', divisionOf({ csi_division: 'Div 9', csi_code: null }) === null);
check('nothing → null', divisionOf({ csi_division: null, csi_code: null }) === null);

// ── Rolling up ──
const rolled = rollUpByDivision([
  line({ csi_division: '03', cost: 1500.30 }),
  line({ csi_division: '', csi_code: '03 30 00', cost: '250.05' }), // numerics arrive as strings
  line({ csi_division: '26', cost: 99.99 }),
  line({ csi_division: '09', cost: 400, excluded: true }),         // excluded → left out
  line({ csi_division: '31', cost: 0 }),                           // zero → no line
  line({ cost: 75 }),                                              // no division → left out
]);
check('one line per division with cost', rolled.length === 2, JSON.stringify(rolled));
check('sorted by division', rolled.map(r => r.division).join(',') === '03,26');
check('03 sums both lines in cents', rolled[0]?.cents === 175035, String(rolled[0]?.cents));
check('26 alone', rolled[1]?.cents === 9999, String(rolled[1]?.cents));
check('excluded division absent', !rolled.some(r => r.division === '09'));
check('empty takeoff → empty budget', rollUpByDivision([]).length === 0);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall ok');
