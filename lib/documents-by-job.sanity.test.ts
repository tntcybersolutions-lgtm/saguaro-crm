/**
 * Documents by job.
 * Run: npx -y tsx lib/documents-by-job.sanity.test.ts   (exit 0 = every assertion held)
 */
import { buildJobDocs } from './documents-by-job';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const r = buildJobDocs({
  jobs: [
    { id: 'A', name: 'Desert Vista Medical Plaza', project_number: '2026-014', phase: 'building', contract_amount: 1_000_000, revised_contract_value: 1_200_000 },
    { id: 'B', name: 'Camelback Fire Station 34', phase: 'building', contract_amount: 500_000 },
    { id: 'C', name: 'Quiet Job' },
  ],
  payApps: [
    { id: 'pa1', project_id: 'A', status: 'paid', total_completed_stored: 200_000 },
    { id: 'pa2', project_id: 'A', status: 'paid', total_completed_stored: 450_000, unconditional_waiver_signed: true },
    { id: 'pa3', project_id: 'A', status: 'submitted', total_completed_stored: 600_000, current_payment_due: 140_000 },
    { id: 'pb1', project_id: 'B', status: 'paid', total_completed_stored: '100000' },
    { id: 'pb2', project_id: 'B', status: 'approved', net_payment_due: 50_000 },
  ],
  waivers: [
    { id: 'w1', project_id: 'B', pay_application_id: 'pb1', status: 'signed' },
    { id: 'w2', project_id: 'B', pay_application_id: 'pb2', status: 'pending' },
    { id: 'w3', project_id: 'A', pay_application_id: null, status: 'pending' },
  ],
  payroll: [{ project_id: 'A', week_ending: '2026-09-27' }, { project_id: 'A', week_ending: '2026-10-04' }],
  closeout: [{ project_id: 'B', status: 'accepted' }, { project_id: 'B', status: 'pending' }, { project_id: 'B', status: 'na' }],
});
const A = r.jobs.find((j) => j.id === 'A')!;
const B = r.jobs.find((j) => j.id === 'B')!;
const C = r.jobs.find((j) => j.id === 'C')!;

check('paid pay app with no waiver → missing', r.payAppWaiver.pa1 === 'missing');
check('pay app flag counts as a waiver on file', r.payAppWaiver.pa2 === 'signed');
check('unpaid pay app with no waiver is not flagged', r.payAppWaiver.pa3 === 'not-needed');
check('linked signed waiver → signed', r.payAppWaiver.pb1 === 'signed');
check('linked pending waiver → waiting', r.payAppWaiver.pb2 === 'waiting');
check('job with a paid-no-waiver pay app is red, with the reason', A.tone === 'red' && A.paidNoWaiver === 1 && A.why === '1 paid pay app with no lien waiver on file', A.why);
check('job with only waiting items is yellow', B.tone === 'yellow' && B.why === '1 waiver waiting · 1 pay app not paid yet', B.why);
check('job with nothing is green "No paperwork yet"', C.tone === 'green' && C.why === 'No paperwork yet');
check('billed = highest completed-to-date, not a sum', A.billed === 600_000 && B.billed === 100_000);
check('contract prefers the revised value', A.contract === 1_200_000 && C.contract === null);
check('pay app counts', A.payApps.total === 3 && A.payApps.paid === 2 && A.payApps.awaiting === 1 && A.payApps.awaitingAmount === 140_000);
check('awaiting amount falls back to net due', B.payApps.awaitingAmount === 50_000);
check('waiver counts per job', A.waivers.signed === 0 && A.waivers.waiting === 1 && B.waivers.signed === 1 && B.waivers.waiting === 1);
check('payroll weeks + latest', A.payroll.weeks === 2 && A.payroll.latest === '2026-10-04');
check('closeout: accepted and N/A count as done', B.closeout.done === 2 && B.closeout.total === 3);
check('worst first: red, yellow, then green', r.jobs.map((j) => j.id).join('') === 'ABC', r.jobs.map((j) => j.id).join(''));

if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
console.log('\nall documents-by-job assertions held');
