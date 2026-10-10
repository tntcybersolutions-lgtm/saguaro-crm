/**
 * GC sub inbox: invoice status rules, message threads, invoice draft math.
 * Run: npx -y tsx lib/sub-inbox.sanity.test.ts   (exit 0 = every assertion held)
 */
import { groupThreads, usd, sumUsd, type InboxMessage } from './sub-inbox';
import { invoiceActions, invoiceStatus, invoiceTransition, isSubInvoiceAction } from './sub-invoice-status';
import { draftTotals, invoiceBody, linesFromLast, blankLine } from './sub-invoice-draft';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// ── invoice status ──
check('blank status reads as submitted', invoiceStatus(null) === 'submitted' && invoiceStatus('') === 'submitted');
check('"Under Review" normalised', invoiceStatus('Under Review') === 'under_review');
check('submitted → approve ok', invoiceTransition('submitted', 'approve').ok);
check('under_review → approve ok', invoiceTransition('under_review', 'approve').ok);
check('approved → paid ok', (invoiceTransition('approved', 'paid') as { to?: string }).to === 'paid');
check('submitted → paid refused (approve first)', !invoiceTransition('submitted', 'paid').ok);
check('paid is final', !invoiceTransition('paid', 'reject').ok && !invoiceTransition('paid', 'approve').ok);
check('rejected is final', !invoiceTransition('rejected', 'approve').ok);
const refusal = invoiceTransition('paid', 'approve');
check('refusal says why in plain words', !refusal.ok && /already paid/.test(refusal.message), JSON.stringify(refusal));
check('buttons for a new invoice', invoiceActions('submitted').join() === 'review,approve,reject');
check('buttons once approved', invoiceActions('approved').join() === 'paid,reject');
check('no buttons once paid', invoiceActions('paid').length === 0);
check('action guard', isSubInvoiceAction('approve') && !isSubInvoiceAction('delete') && !isSubInvoiceAction(undefined));

// ── threads ──
const m = (id: string, sub: string, job: string, who: 'sub' | 'gc', at: string, read: string | null = null): InboxMessage =>
  ({ id, sub_id: sub, project_id: job, sender_type: who, sender_name: who, content: id, read_at: read, created_at: at, sub_name: `Sub ${sub}`, project_name: `Job ${job}` });
const threads = groupThreads([
  m('a1', 'A', 'J1', 'sub', '2026-10-09T10:00:00Z'),
  m('b1', 'B', 'J1', 'sub', '2026-10-10T09:00:00Z'),
  m('a2', 'A', 'J1', 'gc', '2026-10-09T11:00:00Z'),
  m('a3', 'A', 'J2', 'sub', '2026-10-08T08:00:00Z', '2026-10-08T09:00:00Z'),
]);
check('one thread per sub per job', threads.length === 3, String(threads.length));
check('newest conversation first', threads[0].subName === 'Sub B');
check('messages oldest → newest inside', threads.find((t) => t.key === 'J1|A')!.messages.map((x) => x.id).join() === 'a1,a2');
check('unread counts only the sub\'s unread', threads.find((t) => t.key === 'J1|A')!.unread === 1 && threads.find((t) => t.key === 'J2|A')!.unread === 0);

// ── money ──
check('usd formats', usd(11250) === '$11,250.00' && usd('x') === '$0.00' && usd(null) === '$0.00');
check('sum in cents (no float drift)', sumUsd([{ n: 0.1 }, { n: 0.2 }], 'n') === 0.3);

// ── invoice draft ──
const carried = linesFromLast([{ description: 'Drywall L2', scheduled_value: 50000, total_completed: 22500 }, { description: '', scheduled_value: 1 }]);
check('lines carry over from the last invoice', carried.length === 1 && carried[0].description === 'Drywall L2' && carried[0].previous === '22500' && carried[0].thisPeriod === '');
check('no last invoice → one blank line', linesFromLast(null).length === 1);
const line = { ...carried[0], thisPeriod: '12500' };
const t = draftTotals([line], '10');
check('this period = 12,500', t.requested === 12500, JSON.stringify(t));
check('retainage on billed to date (35,000 × 10%)', t.retainage === 3500);
check('net due = this period less its retainage', t.net === 11250);
check('clean draft has no problems', t.problems.length === 0, t.problems.join());
check('billing past scheduled value flagged', draftTotals([{ ...line, thisPeriod: '30000' }], '10').problems.some((p) => /past its scheduled/.test(p)));
check('nothing billed flagged', draftTotals([{ ...line, thisPeriod: '' }], '10').problems.some((p) => /this period/.test(p)));
check('missing description flagged', draftTotals([{ ...blankLine(), thisPeriod: '100' }], '10').problems.some((p) => /description/.test(p)));
check('bad retainage flagged', draftTotals([line], '120').problems.some((p) => /Retainage/.test(p)));
check('"$1,250.50" typed with symbols is read', draftTotals([{ ...line, previous: '0', thisPeriod: '$1,250.50' }], '0').requested === 1250.5);
const body = invoiceBody([line, { ...blankLine() }], '2026-09-01', '2026-09-30', '10');
check('body drops empty lines', body.line_items.length === 1);
check('body sends prior billing less retainage (22,500 → 20,250)', body.previous_payments_less_retainage === 20250, String(body.previous_payments_less_retainage));
check('body field names match the route', body.period_start === '2026-09-01' && body.period_end === '2026-09-30' && body.line_items[0].previous_completed === 22500 && body.line_items[0].this_period === 12500);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
