/**
 * Home finance sanity — figures, months, aging, top jobs, stages.
 * Run: bundle with esbuild (--bundle --platform=node --format=cjs) and run with node; exit 0 = every assertion held.
 *
 * The pay apps are Saguaro Control Systems' Pima County ADC book (read from the
 * database 11 Oct 2026, SELECT only): five apps Jun–Sep 2026, all paid in the
 * month sent, $2,539,650 billed and collected. Copper Ridge Phase II ($4.75M,
 * Building, nothing billed) and one Bidding job complete the jobs.
 */
import { financeHome, lastMonths } from './finance';
import type { JobRow, PayAppIn } from './flat';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const PIMA = 'pima';
const app = (n: number, sent: string, paid: string | null, due: number, cum: number, ret: number, status = 'paid'): PayAppIn => ({
  id: `pa${n}`, project_id: PIMA, app_number: n, status, current_payment_due: String(due), payment_amount: paid ? String(due) : null,
  total_completed_stored: String(cum), submitted_at: `${sent}T15:00:00+00:00`, application_date: sent,
  payment_received_at: paid ? `${paid}T18:00:00+00:00` : null, total_retainage: String(ret),
});
const apps: PayAppIn[] = [
  app(1, '2026-06-05', '2026-06-25', 171000, 180000, 9000),
  app(2, '2026-07-03', '2026-07-24', 399000, 600000, 30000),
  app(3, '2026-08-04', '2026-08-26', 646000, 1280000, 64000),
  app(4, '2026-09-02', '2026-09-25', 845500, 2170000, 108500),
  app(5, '2026-09-19', '2026-09-26', 478150, 2539650, 0),
];
const job = (id: string, title: string, stage: JobRow['stage'], contract: number | null, billed: number | null): JobRow => ({
  id, title, stage, risk: null, dot: null, meta: [], billedPct: null, billed, contract, right: null, rightSub: null, href: `/app/projects/${id}`,
});
const jobs: JobRow[] = [
  job('cr', 'Copper Ridge Data Center Phase II', 'Building', 4750000, 0),
  job(PIMA, 'Pima County Adult Detention Center', 'Complete', 2539650, 2539650),
  job('bid', 'Pima County Project', 'Bidding', 900000, null),
];
const today = '2026-10-11';

const f = financeHome({ apps, jobs, bids: [], today, canBudget: true, canPayApps: true });
check('contract = won jobs only (no Bidding)', f.kpis.contract === 4750000 + 2539650, String(f.kpis.contract));
check('billed = latest cumulative per job', f.kpis.billed === 2539650, String(f.kpis.billed));
check('billed % of contract', f.kpis.billedPct === Math.round((2539650 / 7289650) * 100), String(f.kpis.billedPct));
check('collected = every payment', f.kpis.collected === 2539650, String(f.kpis.collected));
check('collected % of billed = 100', f.kpis.collectedPct === 100, String(f.kpis.collectedPct));
check('nothing outstanding', f.kpis.outstanding === 0 && f.kpis.outstandingCount === 0);
check('retainage = latest app per job (released to 0)', f.kpis.retainage === 0, String(f.kpis.retainage));
check('days to pay averages the five', f.kpis.daysToPay === Math.round((20 + 21 + 22 + 23 + 7) / 5), String(f.kpis.daysToPay));
check('bidding pipeline = Bidding jobs', f.kpis.bidding === 900000 && f.kpis.biddingJobs === 1);
check('last 30 days: billed app 5 (Sep 19), collected apps 4 + 5 (Sep 25, 26)', f.kpis.billed30 === 478150 && f.kpis.collected30 === 845500 + 478150, `${f.kpis.billed30}/${f.kpis.collected30}`);

check('12 months ending this month', f.monthly.length === 12 && f.monthly[11].month === '2026-10' && f.monthly[0].month === '2025-11');
check('first month labelled with its year', f.monthly[0].label === 'Nov 25', f.monthly[0].label);
check('January labelled with its year', f.monthly.find(m => m.month === '2026-01')?.label === 'Jan 26');
const sep = f.monthly.find(m => m.month === '2026-09')!;
check('September billed = apps 4 + 5', sep.billed === 845500 + 478150, String(sep.billed));
check('September collected = apps 4 + 5', sep.collected === 845500 + 478150, String(sep.collected));
check('months sum to the totals', f.monthly.reduce((s, m) => s + m.billed, 0) === 2539650 && f.monthly.reduce((s, m) => s + m.collected, 0) === 2539650);

check('aging empty when all paid', f.aging.every(b => b.amount === 0 && b.count === 0));
check('top jobs by contract', f.topJobs[0].id === 'cr' && f.topJobs[1].id === PIMA && f.topJobs[1].pct === 100);
check('stages in order, empty ones dropped', f.stages.map(s => s.stage).join(',') === 'Bidding,Building,Complete');

/* Waiting apps land in the right age bucket and count as outstanding. */
const waiting = financeHome({
  apps: [...apps, app(6, '2026-09-30', null, 120000, 2659650, 0, 'submitted'), app(7, '2026-07-01', null, 50000, 2709650, 5000, 'certified')],
  jobs, bids: null, today, canBudget: true, canPayApps: true,
});
check('outstanding sums the waiting apps', waiting.kpis.outstanding === 170000 && waiting.kpis.outstandingCount === 2, String(waiting.kpis.outstanding));
check('11 days old → 0–30', waiting.aging[0].amount === 120000 && waiting.aging[0].count === 1);
check('102 days old → 90+', waiting.aging[3].amount === 50000);
check('retainage from the latest app', waiting.kpis.retainage === 0, String(waiting.kpis.retainage));
check('open packages unknown when bids failed', waiting.kpis.openPackages === null);
check('billed in the last 30 days adds the Sep 30 app', waiting.kpis.billed30 === 478150 + 120000, String(waiting.kpis.billed30));

/* Permissions: no Pay Apps → no billing figures or months; no Budget → no contract figures. */
const noPay = financeHome({ apps, jobs, bids: [], today, canBudget: true, canPayApps: false });
check('no Pay Apps: billing hidden', noPay.kpis.billed === null && noPay.kpis.collected === null && noPay.monthly.length === 0 && !noPay.canBilling);
check('no Pay Apps: contract still shown', noPay.kpis.contract === 7289650);
const noBudget = financeHome({ apps, jobs, bids: [], today, canBudget: false, canPayApps: true });
check('no Budget: contract and top jobs hidden', noBudget.kpis.contract === null && noBudget.topJobs.length === 0 && noBudget.kpis.billed === null);
check('no Budget: collections still shown', noBudget.kpis.collected === 2539650);

check('lastMonths across a year end', lastMonths('2026-02-14', 3).join(',') === '2025-12,2026-01,2026-02');

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall finance checks passed');
