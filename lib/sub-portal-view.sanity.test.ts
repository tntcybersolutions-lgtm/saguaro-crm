/**
 * Sub portal display mapping — the page reads the columns that exist.
 * Run: npx -y tsx lib/sub-portal-view.sanity.test.ts   (exit 0 = every assertion held)
 */
import {
  fmtDay, sequenceLabels, invoiceView, fmtPercent, dailyLogView, rfiQuestionWithRefs,
  fileNameFromUrl, complianceDocFor, expiryLevel, isUnreadForSub, SCORE_CATEGORIES, overallRating,
} from './sub-portal-view';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// fmtDay — a date column stays on its calendar day
check('date column renders its own day', fmtDay('2026-10-10') === 'Oct 10, 2026', fmtDay('2026-10-10'));
check('Jan 1 does not slip to Dec 31', fmtDay('2026-01-01') === 'Jan 1, 2026', fmtDay('2026-01-01'));
check('timestamp still renders', /2026/.test(fmtDay('2026-10-10T18:30:00Z')));
check('null → --', fmtDay(null) === '--' && fmtDay('') === '--');
check('garbage → --', fmtDay('not a date') === '--');

// sequenceLabels — numbered in filing order, oldest = 1
const rfis = [
  { id: 'c', created_at: '2026-10-03T00:00:00Z' },
  { id: 'a', created_at: '2026-10-01T00:00:00Z' },
  { id: 'b', created_at: '2026-10-02T00:00:00Z' },
];
const n = sequenceLabels(rfis, 'RFI-SUB-');
check('oldest RFI is 001', n.a === 'RFI-SUB-001');
check('newest RFI is 003', n.c === 'RFI-SUB-003' && n.b === 'RFI-SUB-002');
check('invoice numbering without padding', sequenceLabels([{ id: 'x', created_at: '2026-01-01' }], '#', 1).x === '#1');
check('submitted_at used when created_at missing', sequenceLabels([{ id: 'p', submitted_at: '2026-02-01' }, { id: 'q', submitted_at: '2026-01-01' }], '#', 1).q === '#1');

// invoiceView — period_from / period_to / amount / retainage / net_amount and real line columns
const iv = invoiceView({
  period_from: '2026-09-01', period_to: '2026-09-30', amount: '12500.00', retainage: 1250, net_amount: '11250',
  line_items: [{ id: 'l1', description: 'Rough-in', scheduled_value: 50000, prev_completed: 10000, this_period: 12500, total_completed: 22500, percent_complete: 45, balance: 27500 }],
});
check('period from', iv.periodFrom === '2026-09-01' && iv.periodTo === '2026-09-30');
check('requested from amount (numeric string)', iv.requested === 12500);
check('retainage from retainage', iv.retainage === 1250);
check('net from net_amount', iv.net === 11250);
check('line previous from prev_completed', iv.lines[0].previous === 10000);
check('line completed from total_completed', iv.lines[0].completedToDate === 22500);
check('line percent + balance', iv.lines[0].percent === 45 && iv.lines[0].balance === 27500);
check('no line items → empty', invoiceView({}).lines.length === 0 && invoiceView({}).requested === 0);
check('fmtPercent 45 → 45%', fmtPercent(45) === '45%');
check('fmtPercent 33.33 → 33.3%', fmtPercent(33.33) === '33.3%');
check('fmtPercent 0.5 stays 0.5% (stored 0-100)', fmtPercent(0.5) === '0.5%');

// dailyLogView — hours / work_performed / notes
const dl = dailyLogView({ crew_count: 4, hours: '32', work_performed: ' Framed level 2 ', notes: 'Weather: Clear\nSafety: none', delays: '' });
check('hours from hours', dl.hours === 32);
check('crew', dl.crew === 4);
check('work from work_performed (trimmed)', dl.workPerformed === 'Framed level 2');
check('notes carry weather / safety', dl.notes.includes('Weather: Clear'));
check('empty delays stay empty', dl.delays === '');

// rfiQuestionWithRefs — typed references are kept
check('normal priority adds nothing', rfiQuestionWithRefs({ question: 'Q?', priority: 'normal' }) === 'Q?');
check('high priority + refs kept', rfiQuestionWithRefs({ question: 'Which anchor?', priority: 'high', reference_drawing: 'S-201', reference_spec: '05 12 00' })
  === 'Which anchor?\n\nPriority: High\nDrawing: S-201\nSpec section: 05 12 00');
check('blank refs ignored', rfiQuestionWithRefs({ question: ' Q ', reference_drawing: '  ', reference_spec: null }) === 'Q');

// fileNameFromUrl — the doc's own name
check('upload-time prefix stripped', fileNameFromUrl('https://x.supabase.co/storage/v1/object/public/project-files/t/projects/p/sub-portal/s/1760000000000-COI_2026.pdf') === 'COI_2026.pdf');
check('query dropped + decoded', fileNameFromUrl('https://x/sign/b/a/1760000000000-W9%20form.pdf?token=abc') === 'W9 form.pdf');
check('a name that merely starts with digits is kept', fileNameFromUrl('/x/2026-report.pdf') === '2026-report.pdf');
check('no url → empty', fileNameFromUrl(null) === '');

// complianceDocFor — Documents-tab categories fill the grid slots
const docs = [{ doc_type: 'license', id: 1 }, { doc_type: 'safety_cert', id: 2 }, { doc_type: 'insurance', id: 3 }, { doc_type: 'insurance', id: 4 }];
check('license fills Business License', complianceDocFor(docs, 'business_license')?.id === 1);
check('safety_cert fills Safety Certification', complianceDocFor(docs, 'safety_certification')?.id === 2);
check('newest (first) insurance wins', complianceDocFor(docs, 'insurance')?.id === 3);
check('missing slot → undefined', complianceDocFor(docs, 'bond') === undefined);

// expiryLevel — 30/60/90
check('expired → critical', expiryLevel(-3) === 'critical');
check('0 days → critical', expiryLevel(0) === 'critical');
check('30 → critical', expiryLevel(30) === 'critical');
check('31 → warning', expiryLevel(31) === 'warning');
check('90 → notice', expiryLevel(90) === 'notice');
check('91 → none', expiryLevel(91) === null);
check('no expiry → none', expiryLevel(null) === null);

// isUnreadForSub — read_at, not read
check('GC message with no read_at is unread', isUnreadForSub({ sender_type: 'gc', read_at: null }));
check('GC message read', !isUnreadForSub({ sender_type: 'gc', read_at: '2026-10-10T00:00:00Z' }));
check('own message never unread', !isUnreadForSub({ sender_type: 'sub', read_at: null }));

// Scorecard
check('no cleanup category', !SCORE_CATEGORIES.some((c) => (c.key as string) === 'cleanup_score') && SCORE_CATEGORIES.length === 4);
check('GC rating wins', overallRating({ overall_rating: 4.5, averages: { overall: 3 } }) === 4.5);
check('falls back to scorecard average', overallRating({ overall_rating: null, averages: { overall: 3.2 } }) === 3.2);
check('nothing → 0', overallRating(null) === 0);

if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
console.log('\nall sub portal view assertions held');
