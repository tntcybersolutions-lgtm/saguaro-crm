/**
 * Job picker filing and figures.
 * Run: npx -y tsx lib/job-picker.sanity.test.ts   (exit 0 = every assertion held)
 */
import { contractOf, pickerSection, progressOf } from './job-picker';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// pickerSection
check('bidding phase → Bidding', pickerSection({ status: 'active', phase: 'bidding' }) === 'bidding');
check('preconstruction → Bidding', pickerSection({ status: 'active', phase: 'preconstruction' }) === 'bidding');
check('no phase → Bidding', pickerSection({ status: 'active', phase: null }) === 'bidding');
check('building → Building', pickerSection({ status: 'active', phase: 'building' }) === 'building');
check('construction (any case) → Building', pickerSection({ status: 'Active', phase: ' Construction ' }) === 'building');
check('closeout → Closeout', pickerSection({ status: 'active', phase: 'closeout' }) === 'closeout');
check('warranty → Closeout', pickerSection({ status: 'active', phase: 'warranty' }) === 'closeout');
check('completed status beats a building phase', pickerSection({ status: 'completed', phase: 'building' }) === 'closed');
check('cancelled → Closed', pickerSection({ status: 'cancelled', phase: 'bidding' }) === 'closed');

// contractOf
check('revised contract wins', contractOf({ revised_contract_value: 1_200_000, contract_amount: 1_000_000 }) === 1_200_000);
check('falls back to contract_amount', contractOf({ revised_contract_value: null, contract_amount: '950000' }) === 950_000);
check('zero / missing → null', contractOf({ contract_amount: 0 }) === null && contractOf({}) === null);
check('garbage → null', contractOf({ contract_value: 'n/a' }) === null);

// progressOf
check('42 → 42', progressOf({ percent_complete: 42 }) === 42);
check('string "61" → 61', progressOf({ percent_complete: '61' }) === 61);
check('rounds', progressOf({ percent_complete: 33.6 }) === 34);
check('caps at 100', progressOf({ percent_complete: 140 }) === 100);
check('0 means nothing recorded', progressOf({ percent_complete: 0 }) === null);
check('blank / null → null', progressOf({ percent_complete: '' }) === null && progressOf({ percent_complete: null }) === null);

if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
console.log('\nall job picker assertions held');
