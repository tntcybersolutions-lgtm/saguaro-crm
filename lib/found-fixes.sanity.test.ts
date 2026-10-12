/**
 * The shared rules behind the FOUND.md fixes of 11 Oct 2026.
 * Run: npx -y tsx lib/found-fixes.sanity.test.ts   (exit 0 = every assertion held)
 */
import { coAmount, coTotal } from './change-order-amount';
import { missedWorkdays, unloggedWorkdays } from './daily-log-gap';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// ── Change-order money: cost_impact (TEXT) first, amount second ──
check('cost_impact as text', coAmount({ cost_impact: '500' }) === 500);
check('cost_impact "0" falls back to amount', coAmount({ cost_impact: '0', amount: 1200 }) === 1200, String(coAmount({ cost_impact: '0', amount: 1200 })));
check('null cost_impact falls back to amount', coAmount({ cost_impact: null, amount: '127650' }) === 127650);
check('formatted money parses', coAmount({ cost_impact: '$1,234.50' }) === 1234.5);
check('negative CO (credit)', coAmount({ cost_impact: '-250' }) === -250);
check('garbage reads 0', coAmount({ cost_impact: 'abc', amount: undefined }) === 0);
check('null CO reads 0', coAmount(null) === 0);
check('total never string-concatenates', coTotal([{ cost_impact: '500' }, { cost_impact: '250' }, { amount: 100 }]) === 850);
check('empty total', coTotal([]) === 0 && coTotal(null) === 0);

// ── Daily-log gap: workdays only, and a closed job stops at closeout ──
check('weekend is not a gap', missedWorkdays('2026-10-09', '2026-10-12') === 0); // Fri → Mon
check('one missed workday', missedWorkdays('2026-10-12', '2026-10-14') === 1);   // Mon → Wed
check('no last log → 0', unloggedWorkdays(null, '2026-10-14') === 0);
check('active job counts to today', unloggedWorkdays('2026-10-01', '2026-10-14', { status: 'active' }) === 8);
check('closed job stops at closeout', unloggedWorkdays('2026-10-01', '2026-10-14', { status: 'closed', closeout_date: '2026-10-06' }) === 2,
  String(unloggedWorkdays('2026-10-01', '2026-10-14', { status: 'closed', closeout_date: '2026-10-06' })));
check('closed job stops at closeout (project-context shape)', unloggedWorkdays('2026-09-30', '2026-10-12', { status: 'closed', closeoutDate: '2026-10-02' }) === 1,
  String(unloggedWorkdays('2026-09-30', '2026-10-12', { status: 'closed', closeoutDate: '2026-10-02' })));
check('closed job with no closeout date → 0', unloggedWorkdays('2026-10-01', '2026-10-14', { status: 'closed' }) === 0);
check('closeout after today still counts to today', unloggedWorkdays('2026-10-01', '2026-10-14', { status: 'closed', closeout_date: '2026-12-01' }) === 8);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
