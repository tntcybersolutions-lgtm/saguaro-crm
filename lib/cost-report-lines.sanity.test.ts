/**
 * Cost report lines carried forward from the last saved report.
 * Run: npx -y tsx lib/cost-report-lines.sanity.test.ts   (exit 0 = every assertion held)
 */
import { manualLinesFromReport, savedLineCode, savedOverrides, isManual } from './cost-report-lines';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// savedLineCode
check('cost code wins', savedLineCode({ costCode: '03-300', description: 'Concrete' }) === '03-300');
check('legacy hand-added line keys by its text', savedLineCode({ costCode: '', description: ' ZZ AUDIT line ' }) === 'ZZ AUDIT line');
check('nothing at all → Unassigned', savedLineCode({ costCode: '', description: '' }) === 'Unassigned');

// isManual
check('flagged manual', isManual({ costCode: '01-000', manual: true }));
check('legacy: empty code means hand-added', isManual({ costCode: '', description: 'x' }));
check('live row (has a code, no flag) is not manual', !isManual({ costCode: '03-300' }));

// The exact row the walk saved: { costCode: '', description: '100', all cents 0 }
const walk = [{ costCode: '', actualCents: 0, description: '100', varianceCents: 0, committedCents: 0, actualOverrideCents: null, originalBudgetCents: 0, projectedFinalCents: 0, approvedChangesCents: 0, committedOverrideCents: null }];
const m1 = manualLinesFromReport(walk, new Set(['03-300']));
check('walk row comes back after reload', m1.length === 1 && m1[0].code === '100' && m1[0].description === '100');

// Figures survive.
const m2 = manualLinesFromReport([
  { costCode: '', description: 'Dumpsters', originalBudgetCents: 125000, approvedChangesCents: 5000, committedCents: 40000, actualCents: 12000 },
], new Set());
check('budget / changes / committed / actual carried', m2.length === 1 && m2[0].origCents === 125000 && m2[0].changeCents === 5000 && m2[0].committedCents === 40000 && m2[0].actualCents === 12000);

// A live code is never duplicated by the saved copy.
const m3 = manualLinesFromReport([{ costCode: '03-300', description: 'Concrete', manual: true }], new Set(['03-300']));
check('code already live → not added again', m3.length === 0);

// A live row whose source went away is NOT resurrected.
const m4 = manualLinesFromReport([{ costCode: '09-900', description: 'Paint', originalBudgetCents: 500 }], new Set());
check('stale live row stays gone', m4.length === 0);

// New-style save with a flagged manual row.
const m5 = manualLinesFromReport([{ costCode: '01-500', description: 'Temp power', manual: true, originalBudgetCents: 900 }], new Set());
check('flagged manual row carried with its code', m5.length === 1 && m5[0].code === '01-500' && m5[0].origCents === 900);

// Blank rows and duplicates.
const m6 = manualLinesFromReport([
  { costCode: '', description: '' },
  { costCode: '', description: 'Fence' },
  { costCode: '', description: 'Fence', originalBudgetCents: 1 },
], new Set());
check('blank row skipped, first duplicate wins', m6.length === 1 && m6[0].code === 'Fence' && m6[0].origCents === 0);

// Junk in, nothing out.
check('non-array → []', manualLinesFromReport(null, new Set()).length === 0 && manualLinesFromReport({}, new Set()).length === 0);
check('junk cents → 0', manualLinesFromReport([{ costCode: '', description: 'x', originalBudgetCents: 'abc' }], new Set())[0].origCents === 0);

// Overrides key the same way the lines do.
const ov = savedOverrides([
  { costCode: '03-300', committedOverrideCents: 5000 },
  { costCode: '', description: 'Dumpsters', actualOverrideCents: 700 },
  { costCode: '05-100' },
]);
check('override on a live code', ov['03-300']?.committedCents === 5000);
check('override on a hand-added line keys by its text', ov['Dumpsters']?.actualCents === 700);
check('no override → no entry', !('05-100' in ov));

if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
console.log('\nall cost report line assertions held');
