/**
 * Sage's brief — the one or two sentences at the top of Home that say what
 * matters most right now, with at most one action.
 *
 * Deterministic, from live records, with no model call in the request path:
 * every candidate below is built from rows the page already shows, ranked by a
 * fixed order, and the top one is said in plain words with its numbers. When
 * nothing is pressing it says so ("Nothing is late. 2 bids close Oct 20.").
 *
 * Rank, most urgent first (ties: earliest date, then most money, then key):
 *   0  critical or blocking-today work (failed inspection, critical issue, SLA breach)
 *   1  bid links switched off on packages closing within 14 days, subs still to bid
 *   2  insurance expired · pay apps past the company's usual days-to-pay ·
 *      RFIs past their response date · bids closing within 7 days, subs still to bid
 *   3  jobs at risk · other overdue work · bids closing within 14 days, subs still to bid
 *   4  insurance expiring within 30 days
 *
 * Pure; pinned by lib/home/brief.sanity.test.ts.
 */
import { daysBetween, fmtMoneyShort, type QueueItem } from './rank';
import {
  fmtDowMonDay, fmtMonDay, shortJobName,
  type BidRow, type CoiSummary, type Link, type MoneySummary, type TextPart,
} from './flat';

export interface Brief {
  /** Which candidate won (stable id for tests and the page). */
  key: string;
  parts: TextPart[];
  action: Link | null;
  /** True when nothing is pressing. */
  calm: boolean;
}

export interface BriefInput {
  today: string;
  /** null = not loaded (no access, or the read failed). */
  bids: BidRow[] | null;
  money: MoneySummary | null;
  coi: CoiSummary | null;
  /** The view's ranked queue. */
  queue: QueueItem[];
  /** Jobs at risk and why (operations / owner). */
  risk: Array<{ projectId: string; name: string; reasons: string[] }>;
  /** For the calm line: what starts soon. */
  jobs: Array<{ id: string; name: string; start: string | null }>;
  /** A section this brief reads from failed to load. */
  incomplete?: boolean;
}

interface Candidate { key: string; tier: number; date: string | null; amount: number; parts: TextPart[]; action: Link | null }

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
/** A count that starts a sentence: words under ten ("Two bid packages"). */
const lead = (n: number) => (n < 10 ? WORDS[n] : String(n));
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const B = (t: string): TextPart => ({ t, b: true });
const T = (t: string): TextPart => ({ t });
const onJob = (name: string | null | undefined): TextPart[] => (name ? [T(' on '), B(shortJobName(name))] : []);
const whenWords = (due: string, left: number) => (left === 0 ? 'today' : left === 1 ? 'tomorrow' : fmtDowMonDay(due));

const DECISIONS = new Set(['change_order', 'pay_app', 'purchase_order', 'invoice']);
const NOUN: Record<string, [string, string]> = {
  rfi: ['RFI', 'RFIs'], punch: ['punch item', 'punch items'], todo: ['to-do', 'to-dos'],
  field_issue: ['field issue', 'field issues'], inspection: ['inspection', 'inspections'],
  change_order: ['change order', 'change orders'], pay_app: ['pay app', 'pay apps'],
  purchase_order: ['purchase order', 'purchase orders'], invoice: ['bill', 'bills'],
  lead: ['lead', 'leads'], follow_up: ['follow-up', 'follow-ups'], proposal: ['proposal', 'proposals'],
  service_ticket: ['service call', 'service calls'], warranty_claim: ['warranty claim', 'warranty claims'],
};
const noun = (type: string, n: number) => (NOUN[type] || ['item', 'items'])[n === 1 ? 0 : 1];

function bidCandidates(bids: BidRow[]): Candidate[] {
  const out: Candidate[] = [];
  const soon = bids.filter(b => b.due && b.daysLeft != null && b.daysLeft >= 0 && b.daysLeft <= 14);

  // Subs still to bid, grouped by job and closing day.
  const groups = new Map<string, BidRow[]>();
  for (const b of soon.filter(r => r.invited > 0 && r.bids < r.invited)) {
    const k = `${b.projectId}|${b.due}`;
    groups.set(k, [...(groups.get(k) || []), b]);
  }
  for (const [k, g] of groups) {
    const first = g[0];
    const n = g.length;
    const off = g.filter(r => r.portalOff);
    const m = off.length;
    const missing = g.reduce((s, r) => s + (r.invited - r.bids), 0);
    const invited = g.reduce((s, r) => s + r.invited, 0);
    const when = whenWords(first.due!, first.daysLeft!);
    const parts: TextPart[] = n === 1
      ? [B(first.title), ...onJob(first.job), T(' closes '), B(when), T('.')]
      : [T(`${lead(n)} bid packages`), ...onJob(first.job), T(' close '), B(when), T('.')];
    let tail = '.';
    if (m > 0) {
      tail = m === n
        ? n === 1 ? ", and the bid link is switched off, so they can't open the jacket."
          : n === 2 ? ", and both bid links are switched off, so they can't open the jacket."
          : `, and all ${n} bid links are switched off, so they can't open the jacket.`
        : `, and ${m} of the ${n} bid links ${m === 1 ? 'is' : 'are'} switched off, so those subs can't open the jacket.`;
    }
    parts.push(T(` ${missing} of ${invited} subs ${missing === 1 ? "hasn't" : "haven't"} bid yet${tail}`));
    const most = [...g].sort((a, b) => (b.invited - b.bids) - (a.invited - a.bids))[0];
    out.push({
      key: `bids:${k}`,
      tier: m > 0 ? 1 : first.daysLeft! <= 7 ? 2 : 3,
      date: first.due, amount: missing,
      parts,
      action: m > 0
        ? { label: m > 1 ? 'Turn links on' : 'Turn the link on', href: off[0].jacketHref }
        : { label: 'Remind bidders', href: most.href },
    });
  }

  // Closing soon with nobody invited.
  for (const b of soon.filter(r => r.invited === 0)) {
    out.push({
      key: `bids-none:${b.id}`,
      tier: b.daysLeft! <= 7 ? 2 : 3,
      date: b.due, amount: 0,
      parts: [B(b.title), ...onJob(b.job), T(' closes '), B(whenWords(b.due!, b.daysLeft!)), T(' and has no bidders invited.')],
      action: { label: 'Invite bidders', href: b.href },
    });
  }
  return out;
}

function moneyCandidates(money: MoneySummary): Candidate[] {
  const late = money.rows.filter(r => r.kind === 'waiting' && r.late).sort((a, b) => (b.days ?? 0) - (a.days ?? 0));
  if (!late.length || money.usualDays == null) return [];
  const oldest = late[0];
  const total = late.reduce((s, r) => s + r.amount, 0);
  const parts: TextPart[] = late.length === 1
    ? [B(oldest.label), ...(oldest.job ? [T(' on '), B(oldest.job)] : []), T(' has waited '), B(days(oldest.days ?? 0)),
       ...(oldest.amount > 0 ? [T(' for '), B(fmtMoneyShort(oldest.amount))] : []),
       T(`. You're usually paid in ${days(money.usualDays)}.`)]
    : [B(`${lead(late.length)} pay apps`), T(` are past your usual ${days(money.usualDays)} to get paid`),
       ...(total > 0 ? [T(': '), B(fmtMoneyShort(total)), T(' waiting')] : []), T('. The oldest'),
       ...(oldest.job ? [T(', on '), B(oldest.job), T(',')] : []), T(` went out ${days(oldest.days ?? 0)} ago.`)];
  return [{
    key: 'pay-late', tier: 2, date: oldest.sent, amount: total, parts,
    action: { label: late.length > 1 ? 'Open pay apps' : 'Open pay app', href: oldest.href },
  }];
}

function coiCandidates(coi: CoiSummary): Candidate[] {
  const out: Candidate[] = [];
  const renew: Link = { label: 'Ask for renewals', href: '/app/compliance' };
  if (coi.expired.length) {
    const o = coi.expired[0];
    out.push({
      key: 'coi-expired', tier: 2, date: o.date, amount: coi.expired.length, action: renew,
      parts: coi.expired.length === 1
        ? [B(o.name), T("'s insurance certificate expired "), B(fmtMonDay(o.date)), T('. Get a current one before they work again.')]
        : [B(`${lead(coi.expired.length)} insurance certificates`), T(' have expired, the oldest '), B(o.name), T(' on '), B(fmtMonDay(o.date)), T('.')],
    });
  }
  if (coi.expiring.length) {
    const f = coi.expiring[0];
    out.push({
      key: 'coi-expiring', tier: 4, date: f.date, amount: coi.expiring.length, action: renew,
      parts: coi.expiring.length === 1
        ? [B(f.name), T("'s insurance expires "), B(fmtDowMonDay(f.date)), T('.')]
        : [B(`${lead(coi.expiring.length)} insurance certificates`), T(' expire in the next 30 days, first '), B(f.name), T(' on '), B(fmtMonDay(f.date)), T('.')],
    });
  }
  return out;
}

function queueCandidates(queue: QueueItem[], today: string): Candidate[] {
  const out: Candidate[] = [];
  const real = queue.filter(i => !i.id.startsWith('group:'));

  // Critical, or blocking today's work.
  const crit = real.filter(i => i.tier <= 1);
  if (crit.length) {
    const top = crit[0];
    const more = crit.length - 1;
    out.push({
      key: `critical:${top.id}`, tier: 0, date: top.dueAt ? top.dueAt.slice(0, 10) : null, amount: crit.length,
      // "Inspection failed: failed — no re-inspection date" says it twice; keep the second half.
      parts: [B(top.title), ...onJob(top.projectName), T(`: ${lowerFirst(top.reason.replace(/^failed\s*[—–-]\s*/i, ''))}.`),
        ...(more ? [T(` ${more} more ${more === 1 ? 'needs' : 'need'} you today.`)] : [])],
      action: { label: top.actionLabel, href: top.href },
    });
  }

  // RFIs past their response date.
  const rfis = real.filter(i => i.sourceType === 'rfi' && i.tier === 2)
    .sort((a, b) => String(a.dueAt || '').localeCompare(String(b.dueAt || '')) || a.id.localeCompare(b.id));
  if (rfis.length) {
    const o = rfis[0];
    const late = o.dueAt ? Math.max(1, daysBetween(o.dueAt.slice(0, 10), today)) : null;
    let parts: TextPart[];
    if (rfis.length === 1) {
      parts = [B(o.title), ...onJob(o.projectName), T(' is '), ...(late ? [B(days(late)), T(' past its response date.')] : [T('past its response date.')])];
    } else {
      const per = new Map<string, number>();
      for (const r of rfis) per.set(r.projectName || '', (per.get(r.projectName || '') || 0) + 1);
      const [topJob, k] = [...per.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      parts = [B(`${lead(rfis.length)} RFIs`), T(' are past their response date'),
        ...(per.size === 1 ? onJob(topJob) : topJob ? [T(`, ${k} on `), B(shortJobName(topJob))] : []),
        ...(late ? [T(', the oldest by '), B(days(late))] : []), T('.')];
    }
    out.push({ key: 'rfis-overdue', tier: 2, date: o.dueAt ? o.dueAt.slice(0, 10) : null, amount: rfis.length, parts, action: { label: rfis.length > 1 ? 'Answer RFIs' : 'Answer it', href: o.href } });
  }

  // Everything else past due, by kind — the biggest pile.
  const overdue = real.filter(i => i.tier === 2 && i.sourceType !== 'rfi');
  if (overdue.length) {
    const kinds = new Map<string, QueueItem[]>();
    for (const i of overdue) kinds.set(i.sourceType, [...(kinds.get(i.sourceType) || []), i]);
    const [type, list] = [...kinds.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
    const o = list[0];
    const jobs = new Set(list.map(i => i.projectName || ''));
    const verb = DECISIONS.has(type) ? 'waiting over 14 days for a decision' : 'overdue';
    const parts: TextPart[] = list.length === 1
      ? [B(o.title), ...onJob(o.projectName), T(`: ${lowerFirst(o.reason)}.`)]
      : [B(`${lead(list.length)} ${noun(type, list.length)}`), T(` are ${verb}`), ...(jobs.size === 1 ? onJob(o.projectName) : []), T(', the oldest '), B(o.title), T('.')];
    out.push({ key: `overdue:${type}`, tier: 3, date: o.dueAt ? o.dueAt.slice(0, 10) : null, amount: list.length, parts, action: { label: o.actionLabel, href: o.href } });
  }
  return out;
}

function riskCandidate(risk: BriefInput['risk']): Candidate[] {
  const l = risk.filter(r => r.reasons.length).sort((a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name));
  if (!l.length) return [];
  const top = l[0];
  const why = lowerFirst(top.reasons.slice(0, 2).join(', '));
  return [{
    key: `risk:${top.projectId}`, tier: 3, date: null, amount: l.length,
    parts: l.length === 1
      ? [B(shortJobName(top.name)), T(` is at risk: ${why}.`)]
      : [B(`${lead(l.length)} jobs`), T(' are at risk, most of all '), B(shortJobName(top.name)), T(`: ${why}.`)],
    action: { label: 'Open job', href: `/app/projects/${top.projectId}/overview` },
  }];
}

/** Every candidate, ranked. Exported for tests. */
export function briefCandidates(input: BriefInput): Candidate[] {
  const c: Candidate[] = [
    ...(input.bids ? bidCandidates(input.bids) : []),
    ...(input.money ? moneyCandidates(input.money) : []),
    ...(input.coi ? coiCandidates(input.coi) : []),
    ...queueCandidates(input.queue, input.today),
    ...riskCandidate(input.risk),
  ];
  return c.sort((a, b) =>
    a.tier - b.tier
    || (a.date || '9999-12-31').localeCompare(b.date || '9999-12-31')
    || b.amount - a.amount
    || a.key.localeCompare(b.key));
}

/** The brief: the top candidate, or a plain "nothing is late" with what's next. */
export function buildBrief(input: BriefInput): Brief {
  const top = briefCandidates(input)[0];
  if (top) return { key: top.key, parts: top.parts, action: top.action, calm: false };

  const parts: TextPart[] = [T(input.incomplete ? 'Nothing is late in what loaded.' : 'Nothing is late.')];
  const due = (input.bids || []).filter(b => b.due && b.daysLeft != null && b.daysLeft >= 0 && b.daysLeft <= 14)
    .sort((a, b) => a.due!.localeCompare(b.due!));
  if (due.length) {
    const d = due[0].due!;
    const k = due.filter(b => b.due === d).length;
    parts.push(T(` ${k} bid${k === 1 ? '' : 's'} close${k === 1 ? 's' : ''} `), B(d === input.today ? 'today' : fmtMonDay(d)), T('.'));
  } else {
    const start = input.jobs
      .filter(j => j.start && j.start > input.today && daysBetween(input.today, j.start) <= 30)
      .sort((a, b) => a.start!.localeCompare(b.start!))[0];
    if (start) parts.push(T(' '), B(shortJobName(start.name)), T(' starts '), B(fmtMonDay(start.start!)), T('.'));
  }
  return { key: 'calm', parts, action: null, calm: true };
}
