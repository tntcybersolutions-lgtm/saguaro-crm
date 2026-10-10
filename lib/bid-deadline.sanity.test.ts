/**
 * Bid deadlines close at the END of the due day in the GC company's own zone.
 * Run: npx -y tsx lib/bid-deadline.sanity.test.ts   (exit 0 = every assertion held)
 * Also run it with TZ=America/Phoenix and TZ=Pacific/Kiritimati: nothing here
 * may depend on the server's zone.
 */
import { bidDueDay, bidDeadline, biddingClosed, daysUntilBidDue, bidRefusal, isBiddingStatus, deadlineZone } from './bid-deadline';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const at = (iso: string) => new Date(iso);
const PHX = 'America/Phoenix', CHI = 'America/Chicago';
const due = { due_date: '2026-10-20' };

// ── Which day ──
check('due_date read as a day', bidDueDay(due) === '2026-10-20');
check('bid_due_date wins over due_date', bidDueDay({ bid_due_date: '2026-10-25T00:00:00+00:00', due_date: '2026-10-20' }) === '2026-10-25');
check('a junk bid_due_date falls back to due_date', bidDueDay({ bid_due_date: 'soon', due_date: '2026-10-20' }) === '2026-10-20');
check('no due day → null', bidDueDay({}) === null && bidDueDay(null) === null);

// ── The deadline instant ──
check('Phoenix: last instant is 06:59:59.999Z the next day', bidDeadline(due, PHX)?.toISOString() === '2026-10-21T06:59:59.999Z', bidDeadline(due, PHX)?.toISOString());
check('Iowa (Chicago): 04:59:59.999Z the next day', bidDeadline(due, CHI)?.toISOString() === '2026-10-21T04:59:59.999Z');

// ── The three times Chad named, Phoenix company ──
const oldClosed = (iso: string) => new Date('2026-10-20').getTime() < at(iso).getTime();
check('4:59 PM Phoenix on the due day: OPEN (the old check had it closed)', !biddingClosed(due, PHX, at('2026-10-20T23:59:00Z')) && oldClosed('2026-10-20T23:59:00Z'));
check('11:59 PM Phoenix on the due day: OPEN', !biddingClosed(due, PHX, at('2026-10-21T06:59:00Z')));
check('12:00:01 AM Phoenix the next day: CLOSED', biddingClosed(due, PHX, at('2026-10-21T07:00:01Z')));
check('the day before at 5:01 PM Phoenix: OPEN (old check: closed a full day early)', !biddingClosed(due, PHX, at('2026-10-20T00:01:00Z')) && oldClosed('2026-10-20T00:01:00Z'));

// ── Each company its own zone ──
check('Iowa GC at 11:30 PM Central on the due day: OPEN', !biddingClosed(due, CHI, at('2026-10-21T04:30:00Z')));
check('Iowa GC at 12:30 AM Central the next day: CLOSED — while it is still 10:30 PM in Phoenix', biddingClosed(due, CHI, at('2026-10-21T05:30:00Z')) && !biddingClosed(due, PHX, at('2026-10-21T05:30:00Z')));
check('no due day never closes on the calendar', !biddingClosed({}, PHX, at('2030-01-01T00:00:00Z')));

// ── Days left (reminder cron) ──
check('due today in Phoenix at 11:30 PM → 0 (UTC has already moved on)', daysUntilBidDue({ due_date: '2026-10-10' }, PHX, at('2026-10-11T06:30:00Z')) === 0);
check('3 days out', daysUntilBidDue({ due_date: '2026-10-13' }, PHX, at('2026-10-10T17:00:00Z')) === 3);
check('yesterday → -1', daysUntilBidDue({ due_date: '2026-10-09' }, PHX, at('2026-10-10T17:00:00Z')) === -1);
check('no due day → null', daysUntilBidDue({}, PHX) === null);

// ── Who takes bids ──
check("'open' and 'sent' take bids", isBiddingStatus('open') && isBiddingStatus('sent') && isBiddingStatus(' Sent '));
check("draft / closed / awarded do not", !isBiddingStatus('draft') && !isBiddingStatus('closed') && !isBiddingStatus('awarded') && !isBiddingStatus(null));
const live = { status: 'sent', sub_portal_enabled: true, due_date: '2026-10-20' };
const noon = at('2026-10-15T19:00:00Z');
check('issued, portal on, before the day: accepted', bidRefusal(live, PHX, noon) === null);
check('draft → not issued', bidRefusal({ ...live, status: 'draft' }, PHX, noon)?.reason === 'not_issued');
check('pending → not issued', bidRefusal({ ...live, status: 'pending' }, PHX, noon)?.reason === 'not_issued');
check('no status at all → not issued', bidRefusal({ sub_portal_enabled: true }, PHX, noon)?.reason === 'not_issued');
check('closed → over', bidRefusal({ ...live, status: 'closed' }, PHX, noon)?.reason === 'over');
check('awarded → over', bidRefusal({ ...live, status: 'awarded' }, PHX, noon)?.reason === 'over');
check('portal switched off → refused', bidRefusal({ ...live, sub_portal_enabled: false }, PHX, noon)?.reason === 'portal_off');
check('portal never switched on (null) → refused', bidRefusal({ ...live, sub_portal_enabled: null }, PHX, noon)?.reason === 'portal_off');
check('past the due day → past_due', bidRefusal(live, PHX, at('2026-10-21T07:00:01Z'))?.reason === 'past_due');
check('every refusal is a 409 with words for the bidder', ['draft', 'closed'].every((s) => { const r = bidRefusal({ ...live, status: s }, PHX, noon); return r?.status === 409 && r.error.length > 10; }));

(async () => {
  // ── Whose zone ──
  const db = (tz: string | null, err: unknown = null) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { time_zone: tz }, error: err }) }) }) }) });
  const hdr = (v: string | null) => ({ get: (n: string) => (n === 'x-time-zone' ? v : null) });
  check('the company zone decides', (await deadlineZone(db(CHI), 't1')) === CHI);
  check("a bidder's device never moves the GC's deadline (company wins over header)", (await deadlineZone(db(CHI), 't1', hdr(PHX))) === CHI);
  check("no company zone: the GC's own device stands in", (await deadlineZone(db(null), 't1', hdr('America/Denver'))) === 'America/Denver');
  const errs: string[] = []; const ce = console.error; console.error = (...a: unknown[]) => { errs.push(a.join(' ')); };
  const z = await deadlineZone(db(null), 't1');
  console.error = ce;
  check('neither: UTC, and it is logged — never Phoenix', z === 'UTC' && errs.some((e) => /UTC/.test(e)), z);
  let threw = false; try { await deadlineZone(db(null, new Error('boom')), 't1'); } catch { threw = true; }
  check('a failed company read throws rather than guess', threw);

  if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
  console.log('\nall passed');
})();
