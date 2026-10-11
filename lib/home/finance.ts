/**
 * Home finance — the money picture an owner or the C-suite opens the app for:
 * the big figures, cash billed vs collected by month, what owners owe and how
 * old it is, the biggest jobs and how far each is billed, and the jobs by stage.
 *
 * Built from the SAME rows /api/home already loads for the strip and the lists
 * (pay apps in BILLED_STATUSES, the Jobs rows, the open bid packages), so a
 * figure here never disagrees with the one beside it. Pure — no I/O.
 */
import { BILLED_STATUSES, type JobRow, type PayAppIn, type BidRow } from './flat';
import { addDays, daysBetween } from './rank';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const ymdOf = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const billed = (p: PayAppIn) => BILLED_STATUSES.includes(String(p.status || '').toLowerCase());
const isPaid = (p: PayAppIn) => String(p.status || '').toLowerCase() === 'paid' || !!p.payment_received_at;
const sentDay = (p: PayAppIn) => ymdOf(p.submitted_at) || ymdOf(p.application_date);
/** What the owner was asked to pay on this app (G702 line 8). */
const askedFor = (p: PayAppIn) => num(p.current_payment_due);
/** What came in: the recorded payment, else the amount asked for. */
const received = (p: PayAppIn) => num(p.payment_amount) || num(p.current_payment_due);

export interface FinanceMonth {
  /** 'YYYY-MM' */
  month: string;
  /** 'Oct' — with the year when it is January or the first point ('Jan 27'). */
  label: string;
  billed: number;
  collected: number;
}

export interface AgingBucket {
  key: 'current' | '31-60' | '61-90' | '90+';
  label: string;
  amount: number;
  count: number;
}

export interface FinanceJob {
  id: string;
  name: string;
  stage: JobRow['stage'];
  contract: number;
  billed: number;
  /** Billed of contract, 0–100. */
  pct: number;
  href: string;
}

export interface FinanceStage {
  stage: JobRow['stage'];
  count: number;
  contract: number;
}

export interface FinanceHome {
  /** null = the user can't see that figure (permissions) or it could not load. */
  kpis: {
    contract: number | null;
    wonJobs: number;
    billed: number | null;
    billedPct: number | null;
    collected: number | null;
    collectedPct: number | null;
    outstanding: number | null;
    outstandingCount: number;
    retainage: number | null;
    /** Average days from sending a pay app to being paid (needs 2 paid apps). */
    daysToPay: number | null;
    bidding: number | null;
    biddingJobs: number;
    openPackages: number | null;
    /** Billed and collected in the last 30 days. */
    billed30: number | null;
    collected30: number | null;
  };
  /** Last 12 months, oldest first; empty when pay apps are hidden. */
  monthly: FinanceMonth[];
  aging: AgingBucket[];
  topJobs: FinanceJob[];
  stages: FinanceStage[];
  canMoney: boolean;
  canBilling: boolean;
}

/** The last `n` months ending with today's, as 'YYYY-MM'. */
export function lastMonths(today: string, n = 12): string[] {
  const [y, m] = today.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

const monthLabel = (ym: string, first: boolean) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 || first ? `${MONTHS[m - 1]} ${String(y).slice(2)}` : MONTHS[m - 1];
};

export function financeHome(input: {
  apps: PayAppIn[] | null;
  jobs: JobRow[] | null;
  bids: BidRow[] | null;
  today: string;
  canBudget: boolean;
  canPayApps: boolean;
}): FinanceHome {
  const { today } = input;
  const canMoney = input.canBudget && !!input.jobs;
  const canBilling = input.canPayApps && !!input.apps;
  const apps = (input.apps || []).filter(billed);
  const jobs = input.jobs || [];

  /* Contract: jobs that are won (not still being bid) and carry a contract — as on the strip. */
  const won = jobs.filter(j => j.stage !== 'Bidding' && j.contract);
  const contract = won.reduce((s, j) => s + (j.contract || 0), 0);
  const jobBilled = won.reduce((s, j) => s + (j.billed || 0), 0);
  const bidJobs = jobs.filter(j => j.stage === 'Bidding');
  const bidding = bidJobs.reduce((s, j) => s + (j.contract || 0), 0);

  /* Pay apps: collected, outstanding, retainage, days to pay, the last 30 days. */
  let collected = 0, outstanding = 0, outstandingCount = 0, billed30 = 0, collected30 = 0;
  const spans: number[] = [];
  const retainByJob = new Map<string, { sent: string; ret: number }>();
  const since30 = addDays(today, -30);
  for (const p of apps) {
    const sent = sentDay(p);
    const paidOn = ymdOf(p.payment_received_at);
    if (sent && sent >= since30 && sent <= today) billed30 += askedFor(p);
    if (isPaid(p)) {
      collected += received(p);
      if (paidOn && paidOn >= since30 && paidOn <= today) collected30 += received(p);
      if (sent && paidOn) spans.push(Math.max(0, daysBetween(sent, paidOn)));
    } else {
      outstanding += askedFor(p);
      outstandingCount++;
    }
    // Retainage held on a job = the retainage on its latest app.
    if (p.project_id && sent) {
      const prev = retainByJob.get(p.project_id);
      if (!prev || sent >= prev.sent) retainByJob.set(p.project_id, { sent, ret: num(p.total_retainage) });
    }
  }
  const retainage = [...retainByJob.values()].reduce((s, r) => s + r.ret, 0);
  const daysToPay = spans.length >= 2 ? Math.round(spans.reduce((s, v) => s + v, 0) / spans.length) : null;

  /* Billed vs collected by month, last 12 months. */
  const months = lastMonths(today, 12);
  const byMonth = new Map(months.map(m => [m, { billed: 0, collected: 0 }]));
  for (const p of apps) {
    const sent = sentDay(p);
    if (sent) { const b = byMonth.get(sent.slice(0, 7)); if (b) b.billed += askedFor(p); }
    const paidOn = ymdOf(p.payment_received_at);
    if (paidOn && isPaid(p)) { const b = byMonth.get(paidOn.slice(0, 7)); if (b) b.collected += received(p); }
  }
  const monthly: FinanceMonth[] = canBilling
    ? months.map((m, i) => ({ month: m, label: monthLabel(m, i === 0), billed: Math.round(byMonth.get(m)!.billed), collected: Math.round(byMonth.get(m)!.collected) }))
    : [];

  /* What owners owe, by age since the app went out. */
  const aging: AgingBucket[] = [
    { key: 'current', label: '0–30 days', amount: 0, count: 0 },
    { key: '31-60', label: '31–60', amount: 0, count: 0 },
    { key: '61-90', label: '61–90', amount: 0, count: 0 },
    { key: '90+', label: '90+', amount: 0, count: 0 },
  ];
  if (canBilling) {
    for (const p of apps) {
      if (isPaid(p)) continue;
      const sent = sentDay(p);
      const age = sent ? Math.max(0, daysBetween(sent, today)) : 0;
      const b = aging[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3];
      b.amount += askedFor(p);
      b.count++;
    }
  }

  /* Biggest jobs by contract, with how far each is billed. */
  const topJobs: FinanceJob[] = canMoney
    ? [...jobs].filter(j => j.contract).sort((a, b) => (b.contract || 0) - (a.contract || 0)).slice(0, 6).map(j => ({
        id: j.id, name: j.title, stage: j.stage, contract: j.contract || 0, billed: j.billed || 0,
        pct: j.contract ? Math.min(100, Math.round(((j.billed || 0) / j.contract) * 100)) : 0, href: j.href,
      }))
    : [];

  /* Jobs by stage. */
  const order: JobRow['stage'][] = ['Bidding', 'Building', 'Closeout', 'Complete'];
  const stages: FinanceStage[] = order.map(stage => {
    const js = jobs.filter(j => j.stage === stage);
    return { stage, count: js.length, contract: js.reduce((s, j) => s + (j.contract || 0), 0) };
  }).filter(s => s.count > 0);

  return {
    kpis: {
      contract: canMoney ? contract : null,
      wonJobs: won.length,
      billed: canMoney && canBilling ? jobBilled : null,
      billedPct: canMoney && canBilling && contract ? Math.round((jobBilled / contract) * 100) : null,
      collected: canBilling ? collected : null,
      collectedPct: canBilling && jobBilled ? Math.min(100, Math.round((collected / jobBilled) * 100)) : null,
      outstanding: canBilling ? outstanding : null,
      outstandingCount,
      retainage: canBilling ? retainage : null,
      daysToPay: canBilling ? daysToPay : null,
      bidding: canMoney ? bidding : null,
      biddingJobs: bidJobs.length,
      openPackages: input.bids ? input.bids.length : null,
      billed30: canBilling ? billed30 : null,
      collected30: canBilling ? collected30 : null,
    },
    monthly,
    aging,
    topJobs,
    stages,
    canMoney,
    canBilling,
  };
}
