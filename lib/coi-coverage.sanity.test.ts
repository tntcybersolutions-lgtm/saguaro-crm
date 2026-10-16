/**
 * "Is this sub insured today?" — lib/coi-coverage, shared by the compliance
 * scorecard and the bid award gate.
 * Run: npx -y tsx lib/coi-coverage.sanity.test.ts   (exit 0 = every assertion held)
 */
import { coiStatus } from './coi-coverage';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const today = '2026-10-16';

// The production shape (16 Oct 2026): one ACORD row, headline policy_type GL,
// every coverage in its own column. WC used to read as missing.
const acord = coiStatus([{ policy_type: 'General Liability', expiry_date: '2027-01-15', gl_expiry: '2027-01-15', wc_expiry: '2027-01-15', auto_expiry: '2027-01-15', status: 'active' }], today);
check('ACORD row → GL current', acord.hasGL);
check('ACORD row → WC current (wc_expiry column)', acord.hasWC);
check('ACORD row → one active cert', acord.activeCerts === 1);

// What compliance-autofile writes: a request, pending, no dates.
const request = coiStatus([{ policy_type: 'General Liability', status: 'pending', expiry_date: null }], today);
check('undated COI request is not insurance', !request.hasGL && request.activeCerts === 0);

check('no certificates → not insured', !coiStatus([], today).hasGL);
check('null certificates → not insured', !coiStatus(null, today).hasGL);

check('expired yesterday → not current', !coiStatus([{ policy_type: 'GL', expiry_date: '2026-10-15' }], today).hasGL);
const lastDay = coiStatus([{ policy_type: 'General Liability', expiry_date: '2026-10-16' }], today);
check('expires today → still good through the end of the day', lastDay.hasGL);
check('expires today → counted as expiring', lastDay.expiringCerts === 1);

check('void row with a future date counts for nothing', !coiStatus([{ policy_type: 'General Liability', expiry_date: '2027-05-01', status: 'void' }], today).hasGL);
check('policy_type WC alone → WC, not GL', (() => { const s = coiStatus([{ policy_type: "Workers' Compensation", expiry_date: '2027-05-01' }], today); return s.hasWC && !s.hasGL; })());
check('"Employers Liability" is not General Liability', !coiStatus([{ policy_type: 'Employers Liability', expiry_date: '2027-05-01' }], today).hasGL);

check('directory COI date stands in for GL', coiStatus([], today, '2027-02-01').hasGL);
check('expired directory date does not', !coiStatus([], today, '2026-01-01').hasGL);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall held');
