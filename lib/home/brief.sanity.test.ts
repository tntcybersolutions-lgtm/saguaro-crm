/**
 * Sage's brief sanity — the ranking and the words, pinned.
 * Run: bundle with esbuild (--bundle --platform=node --format=cjs) and run with node; exit 0 = every assertion held.
 *
 * Starts from Saguaro Control Systems' live book on 10 Oct 2026 and adds one
 * thing at a time, checking which candidate wins and what it says.
 */
import { buildBrief, briefCandidates, type BriefInput } from './brief';
import { bidRows, coiSummary, moneyRows, type BidPackageIn, type InviteIn, type SubmissionIn, type PayAppIn, type TextPart } from './flat';
import type { QueueItem } from './rank';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const say = (p: TextPart[]) => p.map(x => x.t).join('');
const bold = (p: TextPart[]) => p.filter(x => x.b).map(x => x.t);

const today = '2026-10-10';
const CR = 'cr-job', PIMA = 'pima-job';
const jobNames = new Map([[CR, 'Copper Ridge Data Center Phase II — Critical Environment Controls'], [PIMA, 'Pima County Adult Detention Center — BAS Modernization']]);
const pk = (id: string, pid: string, name: string, due: string | null, portal: boolean | null, budget = 1000000): BidPackageIn => ({ id, project_id: pid, name, status: 'open', due_date: due, sub_portal_enabled: portal, budget_estimate: budget });
const inv = (pkg: string, n: number): InviteIn[] => Array.from({ length: n }, () => ({ bid_package_id: pkg, status: 'invited' }));
const sub = (pkg: string, n: number): SubmissionIn[] => Array.from({ length: n }, (_, i) => ({ id: `${pkg}${i}`, bid_package_id: pkg, sub_id: `${pkg}-s${i}`, amount: 900000 + i }));

const livePk = [pk('crac', CR, 'CRAC Controls & Sequencing', '2026-10-20', false, 2850000), pk('cont', CR, 'Containment Instrumentation', '2026-10-20', false, 1180000), pk('hsgc', PIMA, 'Housing Unit C — Low Voltage', null, false, 20404)];
const liveInv = [...inv('crac', 5), ...inv('cont', 4)];
const liveSub = [...sub('crac', 3), ...sub('cont', 2)];
const bidsOf = (p = livePk, i = liveInv, s = liveSub) => bidRows({ packages: p, invites: i, submissions: s, jobNames, today, showMoney: true });
const pimaPaid: PayAppIn[] = [
  ['2026-06-05', '2026-06-26'], ['2026-07-06', '2026-07-28'], ['2026-08-05', '2026-08-26'], ['2026-09-04', '2026-09-25'], ['2026-09-19', '2026-09-26'],
].map(([s, p], i) => ({ id: `p${i}`, project_id: PIMA, app_number: i + 1, status: 'paid', submitted_at: s, payment_received_at: p, current_payment_due: 100000, payment_amount: 100000, total_completed_stored: 0 }));
const certs = [
  { id: 'c1', sub_name: 'Valley Sheet Metal Co.', expiry_date: '2027-01-15' }, { id: 'c2', sub_name: 'Sonoran Electric LLC', expiry_date: '2027-02-28' },
  { id: 'c3', sub_name: 'Desert Test & Balance', expiry_date: '2027-04-10' }, { id: 'c4', sub_name: 'Grand Canyon Fire Protection', expiry_date: '2026-11-30' },
];
const base = (o: Partial<BriefInput> = {}): BriefInput => ({
  today, bids: bidsOf(), money: moneyRows({ apps: pimaPaid, jobNames, today }), coi: coiSummary(certs, today),
  queue: [], risk: [], jobs: [{ id: CR, name: jobNames.get(CR)!, start: '2026-11-02' }], ...o,
});
const q = (o: Partial<QueueItem> & Pick<QueueItem, 'id' | 'tier' | 'sourceType'>): QueueItem => ({
  sourceId: o.id, title: o.id, projectId: null, projectName: null, owner: null, dueAt: null, reason: '', actionLabel: 'Open', href: '/x', updatedAt: null, ...o,
});

// 1. The live morning: two Copper Ridge packages close Oct 20 with links off.
const live = buildBrief(base());
check('live: bid links off wins', live.key === `bids:${CR}|2026-10-20` && !live.calm, live.key);
check('live: the exact sentence', say(live.parts) === "Two bid packages on Copper Ridge close Tue Oct 20. 4 of 9 subs haven't bid yet, and both bid links are switched off, so they can't open the jacket.", say(live.parts));
check('live: job and date are bold', JSON.stringify(bold(live.parts)) === JSON.stringify(['Copper Ridge', 'Tue Oct 20']), JSON.stringify(bold(live.parts)));
check('live: one action, to the first jacket (Issue turns the link on)', live.action?.label === 'Turn links on' && live.action.href === `/app/projects/${CR}/bid-packages/crac/jacket`, JSON.stringify(live.action));

// 2. One link on, one off.
const half = buildBrief(base({ bids: bidsOf([{ ...livePk[0], sub_portal_enabled: true }, livePk[1], livePk[2]]) }));
check('one of two links off: says which share', say(half.parts).endsWith("4 of 9 subs haven't bid yet, and 1 of the 2 bid links is switched off, so those subs can't open the jacket."), say(half.parts));
check('one link off: singular action, to that jacket', half.action?.label === 'Turn the link on' && half.action.href.includes('/cont/jacket'));

// 3. Links on: missing bids still matter, as a reminder, and rank below a late pay app.
const on = livePk.map(p => ({ ...p, sub_portal_enabled: true }));
const onBrief = buildBrief(base({ bids: bidsOf(on) }));
check('links on, 10 days out: remind bidders', onBrief.action?.label === 'Remind bidders' && say(onBrief.parts) === "Two bid packages on Copper Ridge close Tue Oct 20. 4 of 9 subs haven't bid yet.", say(onBrief.parts));
check('remind goes to the package with the most missing', onBrief.action?.href === `/app/projects/${CR}/bid-packages/crac`);
const lateApp: PayAppIn = { id: 'w1', project_id: CR, app_number: 1, status: 'submitted', submitted_at: '2026-09-01', current_payment_due: 412000, total_completed_stored: 412000 };
const withLate = buildBrief(base({ bids: bidsOf(on), money: moneyRows({ apps: [...pimaPaid, lateApp], jobNames, today }) }));
check('pay app past usual days (tier 2) beats bids 10 days out (tier 3)', withLate.key === 'pay-late', withLate.key);
check('pay app sentence has the numbers', say(withLate.parts) === "Pay app #1 on Copper Ridge has waited 39 days for $412K. You're usually paid in 18 days.", say(withLate.parts));
check('pay app action opens the job’s pay apps', withLate.action?.href === `/app/projects/${CR}/pay-apps`);
check('links off (tier 1) still beats a late pay app', buildBrief(base({ money: moneyRows({ apps: [...pimaPaid, lateApp], jobNames, today }) })).key.startsWith('bids:'));
const two = buildBrief(base({ bids: [], money: moneyRows({ apps: [...pimaPaid, lateApp, { ...lateApp, id: 'w2', app_number: 2, submitted_at: '2026-09-15', current_payment_due: 100000 }], jobNames, today }) }));
check('two late pay apps: total and the oldest', say(two.parts) === 'Two pay apps are past your usual 18 days to get paid: $512K waiting. The oldest, on Copper Ridge, went out 39 days ago.', say(two.parts));

// 4. Critical work beats everything.
const crit = buildBrief(base({ queue: [q({ id: 'insp:1', tier: 0, sourceType: 'inspection', title: 'Framing inspection failed', projectName: 'Desert Vista Medical Plaza', reason: 'Failed — no re-inspection date set', actionLabel: 'Open Inspection', href: '/app/projects/dv/inspections' })] }));
check('failed inspection beats links off', crit.key === 'critical:insp:1', crit.key);
check('critical sentence', say(crit.parts) === 'Framing inspection failed on Desert Vista: failed — no re-inspection date set.', say(crit.parts));
check('critical action is the record', crit.action?.label === 'Open Inspection' && crit.action.href === '/app/projects/dv/inspections');

// 5. RFIs overdue, grouped.
const rfis = [3, 5, 9].map((d, i) => q({ id: `rfi:${i}`, tier: 2, sourceType: 'rfi', title: `RFI #${i + 1}`, projectName: i < 2 ? 'Desert Vista Medical Plaza' : 'Mesa Clinic', dueAt: `2026-10-0${10 - d}`, href: `/rfis/${i}` }));
const rfiBrief = buildBrief(base({ bids: [], queue: rfis }));
check('RFIs: count, where most are, how late the oldest', say(rfiBrief.parts) === 'Three RFIs are past their response date, 2 on Desert Vista, the oldest by 9 days.', say(rfiBrief.parts));
check('RFIs: action opens the oldest', rfiBrief.action?.label === 'Answer RFIs' && rfiBrief.action.href === '/rfis/2', JSON.stringify(rfiBrief.action));
const oneRfi = buildBrief(base({ bids: [], queue: [rfis[0]] }));
check('one RFI: named, days late', say(oneRfi.parts) === 'RFI #1 on Desert Vista is 3 days past its response date.', say(oneRfi.parts));

// 6. Insurance.
const exp = buildBrief(base({ bids: [], coi: coiSummary([...certs, { id: 'x', sub_name: 'Apex Building Systems', expiry_date: '2026-10-02' }], today) }));
check('expired COI', exp.key === 'coi-expired' && say(exp.parts) === "Apex Building Systems's insurance certificate expired Oct 2. Get a current one before they work again.", say(exp.parts));
check('COI action goes to compliance', exp.action?.href === '/app/compliance' && exp.action.label === 'Ask for renewals');
const soon = buildBrief(base({ bids: [], coi: coiSummary([...certs, { id: 'y', sub_name: 'Vertex Controls', expiry_date: '2026-10-30' }], today) }));
check('expiring COI is the lowest tier but still said when nothing else is', soon.key === 'coi-expiring' && say(soon.parts) === "Vertex Controls's insurance expires Fri Oct 30.", say(soon.parts));
const order = briefCandidates(base({ coi: coiSummary([...certs, { id: 'y', sub_name: 'Vertex Controls', expiry_date: '2026-10-30' }], today) })).map(c => c.key);
check('expiring COI ranks below bids', order.indexOf('coi-expiring') > order.findIndex(k => k.startsWith('bids:')), order.join(','));

// 7. Jobs at risk and other overdue work.
const risk = buildBrief(base({ bids: [], risk: [{ projectId: 'dv', name: 'Desert Vista Medical Plaza', reasons: ['2 schedule tasks past finish date'] }] }));
check('job at risk', say(risk.parts) === 'Desert Vista is at risk: 2 schedule tasks past finish date.' && risk.action?.href === '/app/projects/dv/overview', say(risk.parts));
const fu = buildBrief(base({ bids: [], queue: [1, 2].map(i => q({ id: `f${i}`, tier: 2, sourceType: 'follow_up', title: `Call back — Lead ${i}`, dueAt: `2026-10-0${i}`, actionLabel: 'Open Lead', href: `/app/leads/${i}` })) }));
check('sales: overdue follow-ups', say(fu.parts) === 'Two follow-ups are overdue, the oldest Call back — Lead 1.' && fu.action?.href === '/app/leads/1', say(fu.parts));

// 8. Calm.
const calm = buildBrief(base({ bids: bidsOf(on, [...inv('crac', 3), ...inv('cont', 2)]) }));
check('everyone has bid: nothing is late, bids close Oct 20', calm.calm && say(calm.parts) === 'Nothing is late. 2 bids close Oct 20.' && calm.action === null, say(calm.parts));
const quiet = buildBrief(base({ bids: [] }));
check('no bids due: the next job start', say(quiet.parts) === 'Nothing is late. Copper Ridge starts Nov 2.', say(quiet.parts));
const blank = buildBrief({ today, bids: [], money: { rows: [], usualDays: null, paidCount: 0 }, coi: coiSummary([], today), queue: [], risk: [], jobs: [] });
check('empty company: just "Nothing is late."', say(blank.parts) === 'Nothing is late.');
const partial = buildBrief({ ...base({ bids: null }), coi: null, incomplete: true });
check('a section failed: does not claim the whole day is clear', say(partial.parts).startsWith('Nothing is late in what loaded.'), say(partial.parts));

// 9. Deterministic: same input, same answer; at most two sentences.
check('deterministic', JSON.stringify(buildBrief(base())) === JSON.stringify(buildBrief(base())));
for (const b of [live, half, onBrief, withLate, two, crit, rfiBrief, oneRfi, exp, soon, risk, fu, calm, quiet]) {
  const sentences = say(b.parts).split(/(?<=[.!?])\s+(?=[A-Z0-9])/).length;
  check(`two sentences at most: ${b.key}`, sentences <= 2, say(b.parts));
}

// 10. Due within 14 days with nobody invited.
const none = buildBrief(base({ bids: bidsOf([pk('lv', PIMA, 'Housing Unit C — Low Voltage', '2026-10-15', false)], [], []) }));
check('closing in 5 days, nobody invited', say(none.parts) === 'Housing Unit C — Low Voltage on Pima County ADC closes Thu Oct 15 and has no bidders invited.' && none.action?.label === 'Invite bidders', say(none.parts));

if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
console.log('\nall brief assertions held');
