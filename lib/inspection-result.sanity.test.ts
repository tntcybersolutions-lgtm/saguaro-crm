/**
 * Reading an inspection's outcome.
 * Run: npx -y tsx lib/inspection-result.sanity.test.ts   (exit 0 = every assertion held)
 */
import { canonInspectionResult, inspectionOutcome, isUnheldDefault } from './inspection-result';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// Every spelling the app writes
check("'Passed' (web form) → passed", canonInspectionResult('Passed') === 'passed');
check("'passed' (wizard) → passed", canonInspectionResult('passed') === 'passed');
check("'Failed' → failed", canonInspectionResult('Failed') === 'failed');
check("'fail' → failed", canonInspectionResult('fail') === 'failed');
check("'Conditional Pass' → conditional", canonInspectionResult('Conditional Pass') === 'conditional');
check("'conditional_pass' → conditional", canonInspectionResult('conditional_pass') === 'conditional');
check("'approved' → passed", canonInspectionResult('approved') === 'passed');
check("'Pending' → pending", canonInspectionResult('Pending') === 'pending');
check('blank → pending', canonInspectionResult('') === 'pending' && canonInspectionResult(null) === 'pending');

// The column's old 'pass' default on a booked row is not a result
check("'pass' + scheduled is the unheld default", isUnheldDefault('pass', 'scheduled'));
check("'pass' + pending is the unheld default", isUnheldDefault('pass', 'pending'));
check("'pass' + no status is the unheld default", isUnheldDefault('pass', null));
check("'pass' + Completed is a real pass", !isUnheldDefault('pass', 'Completed'));
check("'Passed' + scheduled is a real pass (form wrote it)", !isUnheldDefault('Passed', 'scheduled'));
check('booked QC checkpoint reads pending', inspectionOutcome({ result: 'pass', status: 'scheduled' }) === 'pending');
check("'pass' once completed reads passed", inspectionOutcome({ result: 'pass', status: 'Completed' }) === 'passed');

// Status stands in only where no result was written
check('Failed status, pending result → failed', inspectionOutcome({ result: 'pending', status: 'Failed' }) === 'failed');
check('Completed status, blank result → passed', inspectionOutcome({ result: '', status: 'Completed' }) === 'passed');
check('Completed status, pending result → pending', inspectionOutcome({ result: 'pending', status: 'completed' }) === 'pending');
check('Scheduled, pending → pending', inspectionOutcome({ result: 'pending', status: 'Scheduled' }) === 'pending');
check('result wins over status', inspectionOutcome({ result: 'Failed', status: 'Completed' }) === 'failed');

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall inspection-result checks passed');
