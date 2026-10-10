/**
 * Flat Home mapping sanity — Bidding, Jobs, Money rows, COIs and the strip.
 * Run: bundle with esbuild (--bundle --platform=node --format=cjs) and run with node; exit 0 = every assertion held.
 *
 * The fixture is Saguaro Control Systems' live book on 10 Oct 2026 (read from
 * the database, SELECT only): Copper Ridge Phase II ($4.75M, starts Nov 2,
 * nothing billed), Pima County ADC (complete, $2.54M, 5 pay apps paid), and
 * three open bid packages — two on Copper Ridge with their portal switched off.
 */
import {
  bidRows, coiSummary, jobRows, moneyRows, ownerStrip, stripFromMetrics, stripMoney, shortJobName, jobTitle, fmtDowMonDay, fmtMonDay,
  type BidPackageIn, type InviteIn, type SubmissionIn, type PayAppIn, type JobIn, type TextPart,
} from './flat';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const text = (p: TextPart[]) => p.map(x => x.t).join(' · ');

const today = '2026-10-10';
const CR = 'd40179a1-126f-45b3-9992-f430a7a60546';
const PIMA = '759aa973-4c36-4f04-8f70-48d53d8af0b9';
const PIMA2 = '25b4f926-57b1-403a-967b-4e2bb9e6693d';
const jobNames = new Map([
  [CR, 'Copper Ridge Data Center Phase II — Critical Environment Controls'],
  [PIMA, 'Pima County Adult Detention Center — BAS Modernization'],
  [PIMA2, 'Pima County Project'],
]);

// ── names & dates
check('job title drops the scope suffix', jobTitle(jobNames.get(CR)) === 'Copper Ridge Data Center Phase II');
check('short name: first two words', shortJobName(jobNames.get(CR)) === 'Copper Ridge', shortJobName(jobNames.get(CR)));
check('short name: building-type tail becomes an acronym', shortJobName(jobNames.get(PIMA)) === 'Pima County ADC', shortJobName(jobNames.get(PIMA)));
check('short name: short names stay whole', shortJobName('Pima County Project') === 'Pima County Project');
check('short name: never ends on "of"', shortJobName('City of Phoenix Water Treatment Plant') === 'City of Phoenix WTP', shortJobName('City of Phoenix Water Treatment Plant'));
check('short name: empty name is honest', shortJobName('') === 'Untitled job');
check('dates: Oct 20', fmtMonDay('2026-10-20') === 'Oct 20');
check('dates: Tue Oct 20 (weekday from the calendar day, not a zone)', fmtDowMonDay('2026-10-20') === 'Tue Oct 20', fmtDowMonDay('2026-10-20'));

// ── bidding
const packages: BidPackageIn[] = [
  { id: 'crac', project_id: CR, name: 'CRAC Controls & Sequencing', status: 'open', due_date: '2026-10-20', sub_portal_enabled: false, budget_estimate: '2850000' },
  { id: 'cont', project_id: CR, name: 'Containment Instrumentation', status: 'open', due_date: '2026-10-20', sub_portal_enabled: false, budget_estimate: '1180000' },
  { id: 'hsgc', project_id: PIMA, name: 'Housing Unit C — Low Voltage', status: 'open', due_date: null, sub_portal_enabled: false, budget_estimate: '20404' },
  { id: 'duct', project_id: PIMA, name: 'Ductwork & Terminal Units', status: 'awarded', due_date: '2026-03-20', sub_portal_enabled: false },
  { id: 'drft', project_id: PIMA2, name: 'Draft package', status: 'draft', due_date: '2026-10-12' },
];
const inv = (pkg: string, n: number, extra: Partial<InviteIn> = {}): InviteIn[] => Array.from({ length: n }, () => ({ bid_package_id: pkg, status: 'invited', ...extra }));
const invites: InviteIn[] = [...inv('crac', 5), ...inv('cont', 4), ...inv('cont', 1, { status: 'revoked' })];
const submissions: SubmissionIn[] = [
  { id: 's1', bid_package_id: 'crac', sub_id: 'a', amount: 2788000 },
  { id: 's2', bid_package_id: 'crac', sub_id: 'b', base_amount: 2910000 },
  { id: 's3', bid_package_id: 'crac', sub_id: 'c', amount: 3010000 },
  { id: 's3b', bid_package_id: 'crac', sub_id: 'c', amount: 2995000 }, // resubmitted: same bidder
  { id: 's4', bid_package_id: 'cont', sub_id: 'd', amount: 1164500 },
  { id: 's5', bid_package_id: 'cont', sub_id: 'e', amount: 1201000 },
  { id: 's6', bid_package_id: 'cont', sub_id: 'f', amount: 990000, status: 'withdrawn' },
];
const bids = bidRows({ packages, invites, submissions, jobNames, today, showMoney: true });
const crac = bids.find(b => b.id === 'crac')!;
const cont = bids.find(b => b.id === 'cont')!;
const hsgc = bids.find(b => b.id === 'hsgc')!;
check('only open/sent/leveling packages', bids.length === 3 && !bids.some(b => b.id === 'duct' || b.id === 'drft'), bids.map(b => b.id).join(','));
check('soonest due first, bigger package first on the same day, no due date last', bids.map(b => b.id).join(',') === 'crac,cont,hsgc', bids.map(b => b.id).join(','));
check('CRAC: 3 of 5 bids (resubmission is one bidder)', crac.bids === 3 && crac.invited === 5, `${crac.bids}/${crac.invited}`);
check('CRAC: low $2.79M, 2% under budget', text(crac.meta).includes('low $2.79M, 2% under budget'), text(crac.meta));
check('Containment: revoked invite and withdrawn bid not counted', cont.invited === 4 && cont.bids === 2 && cont.low === 1164500, `${cont.bids}/${cont.invited} ${cont.low}`);
check('Containment: 1% under budget', text(cont.meta).includes('low $1.16M, 1% under budget'), text(cont.meta));
check('meta leads with the job, then link off, then the count', text(crac.meta).startsWith('Copper Ridge · link off · 3 of 5 bids'), text(crac.meta));
check('portal off with invites → red dot', crac.portalOff && crac.dot === 'red' && cont.dot === 'red');
check('10 days left, Oct 20', crac.right === '10d' && crac.rightSub === 'Oct 20' && crac.daysLeft === 10);
check('jacket link for turning the bid link on', crac.jacketHref === `/app/projects/${CR}/bid-packages/crac/jacket`);
check('no invites → red dot + Invite action, no right column', hsgc.dot === 'red' && hsgc.action?.label === 'Invite' && hsgc.right === null);
check('no invites, no due date said in words', text(hsgc.meta) === 'Pima County ADC · no bidders invited · no due date', text(hsgc.meta));
const quiet = bidRows({ packages: [{ ...packages[0], sub_portal_enabled: true, due_date: '2026-11-30' }], invites: inv('crac', 5), submissions: [], jobNames, today, showMoney: true })[0];
check('portal on, due later, nobody bid yet → grey, "no bids yet"', quiet.dot === 'grey' && text(quiet.meta).includes('no bids yet'), `${quiet.dot} ${text(quiet.meta)}`);
const soonOk = bidRows({ packages: [{ ...packages[0], sub_portal_enabled: true }], invites: inv('crac', 5), submissions, jobNames, today, showMoney: true })[0];
check('portal on, closing in 10 days with bids missing → amber', soonOk.dot === 'amber' && !soonOk.portalOff);
const allIn = bidRows({ packages: [{ ...packages[0], sub_portal_enabled: null }], invites: inv('crac', 3), submissions, jobNames, today, showMoney: true })[0];
check('null portal flag is ON (the portal only refuses false); all bid → green', !allIn.portalOff && allIn.dot === 'green', `${allIn.portalOff} ${allIn.dot}`);
const noMoney = bidRows({ packages, invites, submissions, jobNames, today, showMoney: false });
check('no Budget access → no low bid or budget in the row', noMoney.every(b => b.low === null && b.budget === null && !text(b.meta).includes('$')));
const past = bidRows({ packages: [{ ...packages[0], due_date: '2026-10-07' }], invites, submissions, jobNames, today, showMoney: true })[0];
check('past due date reads "3d ago"', past.right === '3d ago' && past.daysLeft === -3, String(past.right));

// ── pay apps & money
const pa = (n: number, sent: string, paid: string | null, stored: number, amt: number, status = 'paid', pid = PIMA): PayAppIn => ({
  id: `pa${pid.slice(0, 2)}${n}`, project_id: pid, app_number: n, status, total_completed_stored: stored, current_payment_due: amt, payment_amount: paid ? amt : null,
  submitted_at: `${sent}T09:00:00+00`, payment_received_at: paid ? `${paid}T10:00:00+00` : null,
});
const pimaApps = [
  pa(1, '2026-06-05', '2026-06-26', 180000, 171000),
  pa(2, '2026-07-06', '2026-07-28', 600000, 399000),
  pa(3, '2026-08-05', '2026-08-26', 1280000, 646000),
  pa(4, '2026-09-04', '2026-09-25', 2170000, 845500),
  pa(5, '2026-09-19', '2026-09-26', 2539650, 478150),
];
const m1 = moneyRows({ apps: pimaApps, jobNames, today });
check('usual days to pay = 18 (21,22,21,21,7)', m1.usualDays === 18 && m1.paidCount === 5, `${m1.usualDays} ${m1.paidCount}`);
check('only pay apps paid in the last 30 days are rows', m1.rows.length === 2 && m1.rows[0].label === 'Pay app #5', m1.rows.map(r => r.label).join(','));
check('paid row: amount paid, days it took', m1.rows[0].right === '$478K' && text(m1.rows[0].meta) === 'paid Sep 26 · 7 days after sending', `${m1.rows[0].right} ${text(m1.rows[0].meta)}`);
const waiting = [...pimaApps,
  pa(1, '2026-09-01', null, 300000, 285000, 'submitted', CR),
  pa(2, '2026-10-01', null, 500000, 190000, 'approved', CR),
];
const m2 = moneyRows({ apps: waiting, jobNames, today });
const late = m2.rows.find(r => r.id === `pa${CR.slice(0, 2)}1`)!;
const fresh = m2.rows.find(r => r.id === `pa${CR.slice(0, 2)}2`)!;
check('39 days waiting > usual 18 → late, red, first', late.late && late.dot === 'red' && m2.rows[0] === late, `${late.late} ${late.days}`);
check('9 days waiting is not late → amber', !fresh.late && fresh.dot === 'amber' && fresh.days === 9);
check('waiting meta says sent, how long, and the usual', text(late.meta) === 'sent Sep 1 · waiting 39 days · usually paid in 18', text(late.meta));
check('waiting row money is the payment due', late.right === '$285K' && late.rightSub === 'due');
const m3 = moneyRows({ apps: [pa(1, '2026-09-01', '2026-09-20', 1, 1), pa(2, '2026-09-01', null, 1, 1, 'submitted')], jobNames, today });
check('one paid app is not a habit: no usual, nothing late', m3.usualDays === null && m3.rows.every(r => !r.late));

// ── jobs
const jobsIn: JobIn[] = [
  { id: PIMA, name: jobNames.get(PIMA)!, status: 'completed', phase: 'building', city: 'Tucson', start: '2026-04-20', finish: '2026-09-18', actualFinish: null, contract: 2539650, archived: false },
  { id: CR, name: jobNames.get(CR)!, status: 'active', phase: 'building', city: 'Chandler', start: '2026-11-02', finish: '2027-06-30', actualFinish: null, contract: 4750000, archived: false },
  { id: PIMA2, name: 'Pima County Project', status: 'active', phase: 'bidding', city: null, start: null, finish: null, actualFinish: null, contract: 0, archived: false },
  { id: 'old', name: 'Old Job', status: 'completed', phase: 'building', city: 'Mesa', start: '2025-01-01', finish: '2025-06-01', actualFinish: null, contract: 900000, archived: false },
  { id: 'lost', name: 'Lost Job', status: 'lost', phase: 'bidding', city: null, start: null, finish: null, actualFinish: null, contract: 0, archived: false },
  { id: 'arch', name: 'ZZ TAP TEST Job', status: 'active', phase: 'bidding', city: null, start: null, finish: null, actualFinish: null, contract: 0, archived: true },
];
const jobs = jobRows({ jobs: jobsIn, apps: pimaApps, bids, today, showMoney: true, showBilling: true });
check('building, then recently complete, then bidding; old, lost and archived left out', jobs.map(j => j.id).join(',') === [CR, PIMA, PIMA2].join(','), jobs.map(j => j.title).join(' | '));
const cr = jobs[0], pima = jobs.find(j => j.id === PIMA)!, p2 = jobs.find(j => j.id === PIMA2)!;
check('Copper Ridge: Building · starts Nov 2 · 0% billed', text(cr.meta) === 'Building · starts Nov 2 · 0% billed' && cr.billedPct === 0, text(cr.meta));
check('Copper Ridge: $4.75M, Chandler', cr.right === '$4.75M' && cr.rightSub === 'Chandler' && cr.title === 'Copper Ridge Data Center Phase II');
check('Pima: Complete · 5 of 5 pay apps paid · avg 18 days', text(pima.meta) === 'Complete · 5 of 5 pay apps paid · avg 18 days', text(pima.meta));
check('Pima: fully billed bar', pima.billedPct === 100 && pima.billed === 2539650);
check('bidding job: no billing bar, no money', p2.billedPct === null && p2.right === null && text(p2.meta) === 'Bidding · no bids due', text(p2.meta));
check('job row opens the job', cr.href === `/app/projects/${CR}/overview`);
const risky = jobRows({ jobs: jobsIn, apps: pimaApps, bids, today, showMoney: true, showBilling: true, risk: new Map([[CR, ['2 RFIs past response date']], [PIMA, ['Failed inspection']]]) });
check('job at risk: red dot, reason right after the stage', risky[0].dot === 'red' && text(risky[0].meta) === 'Building · 2 RFIs past response date · starts Nov 2 · 0% billed', text(risky[0].meta));
check('a complete job carries no risk line', risky.find(j => j.id === PIMA)!.risk === null && jobs[0].dot === null);
const noBudget = jobRows({ jobs: jobsIn, apps: pimaApps, bids, today, showMoney: false, showBilling: false });
check('no Budget / Pay Apps access → no contract, no billed', noBudget.every(j => j.right === null && j.billedPct === null && j.contract === null));

// ── COIs & strip
const certs = [
  { id: 'c1', sub_name: 'Valley Sheet Metal Co.', status: 'active', expiry_date: '2027-01-15' },
  { id: 'c2', sub_name: 'Sonoran Electric LLC', status: 'active', expiry_date: '2027-02-28' },
  { id: 'c3', sub_name: 'Desert Test & Balance', status: 'active', expiry_date: '2027-04-10' },
  { id: 'c4', sub_name: 'Grand Canyon Fire Protection', status: 'active', expiry_date: '2026-11-30' },
  { id: 'p1', sub_name: '[Award pending] HVAC subcontractor', status: 'pending', expiry_date: null },
];
const coi = coiSummary(certs, today);
check('COIs: 4 of 4 current, placeholders are not certificates', coi.total === 4 && coi.current === 4 && !coi.expired.length && !coi.expiring.length, JSON.stringify(coi));
const coi2 = coiSummary([...certs, { id: 'c5', sub_name: 'Apex Building Systems', status: 'active', expiry_date: '2026-10-02' }, { id: 'c6', sub_name: 'Vertex Controls', status: 'active', expiry_date: '2026-10-30' }, { id: 'c7', sub_name: 'Old Cert', status: 'replaced', expiry_date: '2025-01-01' }], today);
check('expired and expiring-in-30 split; replaced ignored', coi2.total === 6 && coi2.current === 5 && coi2.expired[0].name === 'Apex Building Systems' && coi2.expiring.map(x => x.name).join() === 'Vertex Controls', JSON.stringify(coi2));

const strip = ownerStrip({ jobs, openBids: bids.length, coi, canBudget: true, canPayApps: true });
check('owner strip: $7.29M under contract (won jobs only)', strip[0].value === '$7.29M' && strip[0].label === 'Under contract', JSON.stringify(strip[0]));
check('owner strip: $2.54M billed · 35%', strip[1].value === '$2.54M' && strip[1].label === 'Billed · 35%', JSON.stringify(strip[1]));
check('owner strip: 3 open bids', strip[2].value === '3');
check('owner strip: COIs 4/4', strip[3].value === '4/4' && !strip[3].tone);
const strip2 = ownerStrip({ jobs, openBids: null, coi: coi2, canBudget: false, canPayApps: true });
check('owner strip: no Budget → contract and billed not shown, said why', strip2[0].value === null && /Budget/.test(strip2[0].note || '') && strip2[1].value === null);
check('owner strip: failed bids load is not zero', strip2[2].value === null);
check('owner strip: an expired COI turns the figure red', strip2[3].value === '5/6' && strip2[3].tone === 'bad');
const empty = ownerStrip({ jobs: [], openBids: 0, coi: coiSummary([], today), canBudget: true, canPayApps: true });
check('empty company: $0 · 0% · 0 · "0 COIs on file"', empty[0].value === '$0' && empty[1].label === 'Billed · 0%' && empty[2].value === '0' && empty[3].label === 'COIs on file', JSON.stringify(empty));

const ops = stripFromMetrics([
  { key: 'overdue', label: 'Overdue Work', value: '7', basis: 'Team', href: null, state: 'ok' },
  { key: 'risk', label: 'Jobs at Risk', value: '0', basis: '', href: null, state: 'empty' },
  { key: 'approvals', label: 'Approvals Waiting', value: null, basis: '', href: null, state: 'restricted', note: 'Needs Change Order access' },
  { key: 'billed', label: 'Billed, Not Paid', value: '$1,351,800', basis: '', href: null, state: 'ok' },
], 'operations');
check('ops strip: overdue > 0 is red', ops[0].value === '7' && ops[0].tone === 'bad' && ops[0].label === 'Overdue');
check('ops strip: zero at risk is calm', ops[1].value === '0' && !ops[1].tone);
check('ops strip: restricted figure is null with the reason', ops[2].value === null && ops[2].note === 'Needs Change Order access');
check('ops strip: money is short on a phone, label fits', ops[3].value === '$1.35M' && ops[3].label === 'Unpaid bills', String(ops[3].value));

check('strip money: one decimal from $10M so it fits a phone', stripMoney(10_489_650) === '$10.5M' && stripMoney(7_289_650) === '$7.29M' && stripMoney(12_000_000) === '$12M' && stripMoney(150_000_000) === '$150M', stripMoney(10_489_650));

if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
console.log('\nall flat home assertions held');
