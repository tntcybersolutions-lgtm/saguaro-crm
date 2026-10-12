/**
 * Online payments — what the owner may pay, and how much.
 * Run: npx -y tsx lib/online-payments.sanity.test.ts   (exit 0 = every assertion held)
 */
import { invoiceBalanceCents, invoiceIsPayable } from './online-payments';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const open = { direction: 'receivable', status: 'sent', amount: '1000', tax: '82.50', total: '1082.50', paid_amount: null };

check('balance = total − paid, in cents', invoiceBalanceCents(open) === 108250);
check('stale 0 total falls back to amount + tax', invoiceBalanceCents({ ...open, total: '0' }) === 108250);
check('partly paid', invoiceBalanceCents({ ...open, paid_amount: '500' }) === 58250);
check('overpaid never goes negative', invoiceBalanceCents({ ...open, paid_amount: '5000' }) === 0);
check('open owner invoice is payable', invoiceIsPayable(open));
check('a vendor / sub bill is NEVER payable by the owner', !invoiceIsPayable({ ...open, direction: 'payable' }));
check('missing direction is not payable', !invoiceIsPayable({ ...open, direction: null }));
check('draft is not payable', !invoiceIsPayable({ ...open, status: 'draft' }));
check('paid is not payable', !invoiceIsPayable({ ...open, status: 'Paid' }));
check('void is not payable', !invoiceIsPayable({ ...open, status: 'void' }));
check('nothing owed is not payable', !invoiceIsPayable({ ...open, paid_amount: '1082.50' }));
check('under Stripe\'s 50¢ minimum is not payable', !invoiceIsPayable({ ...open, total: '0.40', amount: '0.40', tax: '0' }));
check('partially paid stays payable', invoiceIsPayable({ ...open, status: 'partially_paid', paid_amount: '82.50' }));

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
