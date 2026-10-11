/**
 * Selection prices against allowances — what the portal shows and what a
 * change order is written for.
 * Run: npx -y tsx lib/selection-math.sanity.test.ts   (exit 0 = every assertion held)
 */
import { allowanceBalance, optionPrice, overAllowance } from './selection-math';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// ── Option price ──
check('total wins', optionPrice({ total_cost: '1250.50', unit_cost: 10, quantity: 3 }) === 1250.5);
check('unit × quantity when no total', optionPrice({ total_cost: 0, unit_cost: '12.5', quantity: '4' }) === 50);
check('unit alone when no quantity', optionPrice({ total_cost: null, unit_cost: 800, quantity: null }) === 800);
check('nothing priced → 0', optionPrice({}) === 0);

// ── Against the allowance ──
check('over by the difference', overAllowance(450, 899.99) === 449.99);
check('under is negative', overAllowance('450', 300) === -150);
check('on the allowance → 0', overAllowance(450, 450) === 0);
check('no allowance → the whole price is over', overAllowance(null, 120) === 120);
check('cents, not float noise', overAllowance(0.1, 0.3) === 0.2);

// ── Running balance ──
const b = allowanceBalance([
  { allowance: 450, selected_amount: 899.99, status: 'selected' },  // 449.99 over
  { allowance: '2000', selected_amount: '1500', status: 'Ordered' }, // 500 under
  { allowance: 3000, selected_amount: 9999, status: 'pending' },   // undecided: not counted as chosen
  { allowance: null, selected_amount: null, status: null },        // pending, no allowance
]);
check('allowances sum every item', b.allowances === 5450, JSON.stringify(b));
check('chosen counts decided items only', b.chosen === 2399.99, JSON.stringify(b));
check('balance = decided allowances − chosen', b.balance === 50.01, JSON.stringify(b));
check('nothing yet → zeros', JSON.stringify(allowanceBalance([])) === JSON.stringify({ allowances: 0, chosen: 0, balance: 0 }));

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall ok');
