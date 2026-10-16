/**
 * The job page, as data — which tools a job lists, what each one says beside
 * its name, and the one-sentence brief at the top. Pure and client-safe: the
 * page (app/app/projects/[projectId]/overview) renders what this returns, and
 * lib/job-page.sanity.test.ts holds it to the wording.
 *
 * Nothing here calls a model. The brief is a handful of ordered rules over the
 * job's live counts; the first rule that has something to say wins, and it
 * always comes with exactly one thing to do about it.
 */
import type { JobTools } from './job-tools';
import { normalisePhase } from './project-phase';
import { isClosedStatus, isDoneStatus } from './project-lifecycle';

/* ── Stage ─────────────────────────────────────────────────────────────── */

/** Where a job is: chasing it, building it, or done with it. */
export type JobStage = 'bidding' | 'building' | 'closed';

export function jobStage(p: { status?: unknown; phase?: unknown } | null | undefined): JobStage {
  if (isClosedStatus(p?.status)) return 'closed';
  return normalisePhase(p?.phase) === 'building' ? 'building' : 'bidding';
}

/** The word for the stage. A cancelled or lost job is closed but not "Complete". */
export function stageLabel(p: { status?: unknown; phase?: unknown } | null | undefined): string {
  const s = jobStage(p);
  if (s === 'closed') {
    if (isDoneStatus(p?.status)) return 'Complete';
    const raw = String(p?.status || 'closed').replace(/_/g, ' ');
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  return s === 'building' ? 'Building' : 'Bidding';
}

/* ── Formatting ────────────────────────────────────────────────────────── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const ymd = (v: unknown): string | null => {
  const s = String(v ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/** Whole days from `from` to `to` (both 'YYYY-MM-DD'). Calendar arithmetic, no zone. */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/** "Oct 20"; the year only when the day is ~10 months or more away. "today"/"tomorrow" when `relative`. */
export function fmtDay(d: string, today: string, relative = false): string {
  if (relative) {
    if (d === today) return 'today';
    if (daysBetween(today, d) === 1) return 'tomorrow';
  }
  const s = `${MONTHS[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;
  return Math.abs(daysBetween(today, d)) >= 300 ? `${s}, ${d.slice(0, 4)}` : s;
}

/** $4.75M · $950K · $0 — the compact money of a list row. */
export function fmtMoneyShort(v: number): string {
  const n = Number(v) || 0;
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
}

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** "4400 W Chandler Blvd, Chandler" — the street and the city, nothing more. */
export function shortAddress(p: { address?: string | null; city?: string | null } | null | undefined): string {
  const line = String(p?.address || '').trim();
  const city = String(p?.city || '').trim();
  if (!line || !city) return line || city;
  /* Already carries the city after the street ("1 Main St, Mesa, AZ")? The
     street itself does not count — "4400 W Chandler Blvd" is in Chandler. */
  const c = city.toLowerCase();
  const has = line.split(',').slice(1).some((part) => { const x = part.trim().toLowerCase(); return x === c || x.startsWith(c + ' '); });
  return has ? line : `${line}, ${city}`;
}

/** "starts Nov 2" / "finishes Jun 30" / "finished Sep 18" — and whether it is late. */
export function dateLine(stage: JobStage, start: string | null, end: string | null, today: string): { text: string; late?: boolean } | null {
  if (stage === 'closed') return end ? { text: `finished ${fmtDay(end, today)}` } : null;
  if (start && start > today) return { text: `starts ${fmtDay(start, today)}` };
  if (end && end >= today) return { text: `finishes ${fmtDay(end, today)}` };
  if (end) return { text: `finish was ${fmtDay(end, today)}`, late: true };
  return null;
}

/** Billed as a whole percent of the contract, or null when there is no contract to measure against. */
export function billedPct(billed: number, contract: number): number | null {
  if (!(contract > 0)) return null;
  return Math.max(0, Math.round((billed / contract) * 100));
}

/* ── The tool catalog ──────────────────────────────────────────────────── */

export type GroupKey = 'precon' | 'docs' | 'field' | 'money' | 'team' | 'closeout' | 'more';

export const GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'precon', label: 'Preconstruction' },
  { key: 'docs', label: 'Documents' },
  { key: 'field', label: 'Field' },
  { key: 'money', label: 'Money' },
  { key: 'team', label: 'Team' },
  { key: 'closeout', label: 'Closeout' },
  { key: 'more', label: 'More tools' },
];

export interface ToolDef {
  /** Stable id; also the icon key the page maps to a glyph. */
  id: string;
  label: string;
  /** Relative to the job ('/rfis'), or absolute when it starts with '/app/' (opened with ?projectId=). */
  href: string;
  group: GroupKey;
  /** Always listed. Anything else is listed once it has work in it, and otherwise waits under "More tools". */
  core?: boolean;
  /** The tool's own create flow, relative to the job. An empty tool row opens
   *  it directly — the list behind it has nothing to show yet. */
  create?: string;
}

/**
 * Every tool a job has — one row per page under app/app/projects/[projectId]
 * (the overview itself excepted) plus Signal Studio, which lives at the app
 * level and opens on this job. Nothing is dropped: a tool that is not core and
 * has nothing in it is one tap away under "More tools".
 */
export const TOOLS: ToolDef[] = [
  { id: 'bid-packages', label: 'Bid Packages', href: '/bid-packages', group: 'precon', core: true, create: '/bid-packages?new=1' },
  { id: 'takeoff', label: 'Takeoff', href: '/takeoff', group: 'precon', core: true },
  { id: 'estimate', label: 'Estimate', href: '/estimate', group: 'precon' },
  { id: 'proposal', label: 'Proposal', href: '/proposal', group: 'precon' },

  { id: 'drawings', label: 'Drawings', href: '/drawings', group: 'docs', core: true, create: '/drawings?new=1' },
  { id: 'models', label: 'Models', href: '/models', group: 'docs' },
  { id: 'specs', label: 'Specifications', href: '/specs', group: 'docs', core: true },
  { id: 'rfis', label: 'RFIs', href: '/rfis', group: 'docs', core: true, create: '/rfis?new=1' },
  { id: 'submittals', label: 'Submittals', href: '/submittals', group: 'docs', core: true, create: '/submittals?new=1' },
  { id: 'files', label: 'Files', href: '/files', group: 'docs', core: true },
  { id: 'permits', label: 'Permits', href: '/permits', group: 'docs', core: true, create: '/permits?new=1' },

  { id: 'daily-logs', label: 'Daily Logs', href: '/daily-logs', group: 'field', core: true, create: '/daily-logs?new=1' },
  { id: 'photos', label: 'Photos', href: '/photos', group: 'field', core: true },
  { id: 'schedule', label: 'Schedule', href: '/schedule', group: 'field', core: true, create: '/schedule?new=1' },
  { id: 'inspections', label: 'Inspections', href: '/inspections', group: 'field', core: true, create: '/inspections?new=1' },
  { id: 'safety', label: 'Safety', href: '/safety', group: 'field', core: true },
  { id: 'punch-list', label: 'Punch List', href: '/punch-list', group: 'field', core: true, create: '/punch-list?new=1' },
  { id: 'todos', label: 'To-Dos', href: '/todos', group: 'field', create: '/todos?new=1' },
  { id: 'tm-tickets', label: 'T&M Tickets', href: '/tm-tickets', group: 'field' },
  { id: 'crews', label: 'Crews', href: '/crews', group: 'field' },
  { id: 'timesheets', label: 'Timesheets', href: '/timesheets', group: 'field' },

  { id: 'budget', label: 'Budget', href: '/budget', group: 'money', core: true },
  { id: 'pay-apps', label: 'Pay Apps', href: '/pay-apps', group: 'money', core: true, create: '/pay-apps/new' },
  { id: 'change-orders', label: 'Change Orders', href: '/change-orders', group: 'money', core: true },
  { id: 'lien-waivers', label: 'Lien Waivers', href: '/lien-waivers', group: 'money', core: true },
  { id: 'contracts', label: 'Contracts', href: '/contracts', group: 'money', create: '/contracts/new' },
  { id: 'purchase-orders', label: 'PO & Subcontracts', href: '/purchase-orders', group: 'money' },
  { id: 'invoices', label: 'Client Invoices', href: '/invoices', group: 'money' },
  { id: 'bills', label: 'Bills', href: '/bills', group: 'money' },
  { id: 'cash-flow', label: 'Cash Flow', href: '/cash-flow', group: 'money' },
  { id: 'payroll', label: 'Certified Payroll', href: '/payroll', group: 'money' },

  { id: 'team', label: 'Team', href: '/team', group: 'team', core: true },
  { id: 'compliance', label: 'Compliance & COIs', href: '/compliance', group: 'team', core: true },
  { id: 'subs', label: 'Subcontractors', href: '/subs', group: 'team' },
  { id: 'directory', label: 'Directory', href: '/directory', group: 'team' },
  { id: 'insurance', label: 'Insurance', href: '/insurance', group: 'team' },
  { id: 'w9', label: 'W-9 Requests', href: '/w9', group: 'team' },
  { id: 'messages', label: 'Messages', href: '/messages', group: 'team' },

  { id: 'closeout', label: 'Closeout', href: '/closeout', group: 'closeout', core: true },

  { id: 'selections', label: 'Selections & Allowances', href: '/selections', group: 'more' },
  { id: 'autopilot', label: 'Autopilot Alerts', href: '/autopilot', group: 'more' },
  { id: 'intelligence', label: 'Bid Intelligence', href: '/intelligence', group: 'more' },
  { id: 'network', label: 'Network', href: '/network', group: 'more' },
  { id: 'network-devices', label: 'Network Devices', href: '/network/devices', group: 'more' },
  { id: 'network-vlans', label: 'VLANs', href: '/network/vlans', group: 'more' },
  { id: 'network-cables', label: 'Cables', href: '/network/cables', group: 'more' },
  { id: 'network-firewall', label: 'Firewall', href: '/network/firewall', group: 'more' },
  { id: 'network-wifi', label: 'WiFi', href: '/network/wifi', group: 'more' },
  { id: 'network-config', label: 'Config Generator', href: '/network/config', group: 'more' },
  { id: 'network-wizard', label: 'Network AI Wizard', href: '/network/wizard', group: 'more' },
  { id: 'network-reports', label: 'Network Reports', href: '/network/reports', group: 'more' },
  { id: 'signal-studio', label: 'Signal Studio', href: '/app/signal-studio', group: 'more' },
];

/** The URL a tool row opens. */
export function toolHref(t: ToolDef, projectId: string): string {
  return t.href.startsWith('/app/') ? `${t.href}?projectId=${projectId}` : `/app/projects/${projectId}${t.href}`;
}

/* ── What each tool says ───────────────────────────────────────────────── */

export interface ToolValue {
  /** The words beside the name; null = say nothing. */
  text: string | null;
  /** Amber: something the job needs is missing or late. */
  warn?: boolean;
  /** Still counting. */
  loading?: boolean;
  /** The count failed — shown as "—". */
  failed?: boolean;
  /** There is work in it, so a non-core tool is listed in its group. */
  hasWork: boolean;
}

export interface JobFacts {
  stage: JobStage;
  today: string;
  start: string | null;
  end: string | null;
  contract: number;
}

const NONE = 'None yet';
const empty = (): ToolValue => ({ text: null, hasWork: false });

/**
 * The value beside one tool. `tools` is the /tools payload, or 'loading' while
 * it is in flight, or 'failed' when the whole request failed.
 */
export function toolValue(id: string, tools: JobTools | 'loading' | 'failed', f: JobFacts): ToolValue {
  const KEYED: Record<string, keyof JobTools> = {
    'bid-packages': 'bidPackages', takeoff: 'takeoffs', estimate: 'takeoffs', drawings: 'drawings', specs: 'specs',
    rfis: 'rfis', submittals: 'submittals', files: 'files', permits: 'permits', 'daily-logs': 'dailyLogs',
    photos: 'photos', schedule: 'schedule', inspections: 'inspections', safety: 'safety', 'punch-list': 'punch',
    todos: 'todos', 'tm-tickets': 'tmTickets', crews: 'crews', budget: 'budget', 'pay-apps': 'payApps',
    'cash-flow': 'payApps', 'change-orders': 'changeOrders', 'lien-waivers': 'lienWaivers', contracts: 'contracts',
    'purchase-orders': 'purchaseOrders', invoices: 'invoices', bills: 'bills', team: 'team', compliance: 'compliance',
    subs: 'compliance', directory: 'directory', proposal: 'proposals', selections: 'selections', autopilot: 'alerts',
  };
  if (id === 'closeout') return f.stage === 'closed' ? { text: 'Done', hasWork: true } : empty();
  const key = KEYED[id];
  if (!key) return empty();
  if (tools === 'loading') return { text: null, loading: true, hasWork: false };
  if (tools === 'failed' || tools[key] == null) return { text: '—', failed: true, hasWork: false };
  const t = tools;
  const building = f.stage === 'building';
  const live = f.stage !== 'closed';
  const count = (v: number, warnIfNone = false): ToolValue =>
    v > 0 ? { text: String(v), hasWork: true } : { text: warnIfNone ? NONE : '0', warn: warnIfNone, hasWork: false };

  switch (id) {
    case 'bid-packages': {
      const b = t.bidPackages!;
      if (b.total === 0) return { text: NONE, warn: f.stage === 'bidding', hasWork: false };
      if (b.nextDue && b.dueNext) {
        const soon = daysBetween(f.today, b.nextDue) <= 14;
        return { text: `${b.total} · ${b.dueNext.count} close ${fmtDay(b.nextDue, f.today, true)}`, warn: soon, hasWork: true };
      }
      if (b.pastDue > 0) return { text: `${b.total} · ${b.pastDue} past due`, warn: true, hasWork: true };
      if (b.open > 0) return { text: `${b.total} · ${b.open} open`, hasWork: true };
      return { text: String(b.total), hasWork: true };
    }
    case 'takeoff':
      return t.takeoffs! > 0 ? { text: String(t.takeoffs), hasWork: true } : { text: NONE, warn: f.stage === 'bidding', hasWork: false };
    case 'estimate':
      /* The estimate is the takeoff priced — it leads while the job is being bid. */
      return { text: null, hasWork: f.stage === 'bidding' && t.takeoffs! > 0 };
    case 'drawings':
    case 'specs': {
      const v = (id === 'drawings' ? t.drawings : t.specs)!;
      return v > 0 ? { text: String(v), hasWork: true } : { text: NONE, warn: live, hasWork: false };
    }
    case 'rfis': {
      const r = t.rfis!;
      if (r.overdue > 0) return { text: `${r.open} open · ${r.overdue} overdue`, warn: true, hasWork: true };
      return { text: `${r.open} open`, hasWork: r.open > 0 };
    }
    case 'submittals': {
      const s = t.submittals!;
      if (s.open > 0) return { text: `${s.open} open`, hasWork: true };
      return count(s.total);
    }
    case 'daily-logs': {
      const d = t.dailyLogs!;
      if (f.stage === 'closed') return count(d.total);
      if (f.start && f.start > f.today) return { text: `Starts ${fmtDay(f.start, f.today)}`, hasWork: d.total > 0 };
      if (building) {
        return d.last === f.today
          ? { text: 'Today ✓', hasWork: true }
          : { text: 'Not filed today', warn: true, hasWork: d.total > 0 };
      }
      return count(d.total);
    }
    case 'schedule': {
      const s = t.schedule!;
      if (s.total === 0) return { text: NONE, warn: building, hasWork: false };
      if (s.late > 0 && live) return { text: `${s.total} · ${s.late} late`, warn: true, hasWork: true };
      return { text: String(s.total), hasWork: true };
    }
    case 'inspections': {
      const i = t.inspections!;
      if (i.upcoming[0]) return { text: `Next ${fmtDay(i.upcoming[0].date, f.today, true)}`, hasWork: true };
      return count(i.total);
    }
    case 'punch-list': {
      const p = t.punch!;
      if (p.open > 0) return { text: `${p.open} open`, hasWork: true };
      return p.total > 0 ? { text: `${p.total} · all closed`, hasWork: true } : count(0);
    }
    case 'budget':
      return t.budget! > 0 ? { text: plural(t.budget!, 'line'), hasWork: true } : { text: NONE, hasWork: false };
    case 'pay-apps': {
      const p = t.payApps!;
      if (p.total === 0) return { text: NONE, hasWork: false };
      const pct = billedPct(p.billed, f.contract);
      if (p.draft > 0 && live) return { text: `${p.total} · ${p.draft} draft`, hasWork: true };
      return { text: pct == null ? String(p.total) : `${p.total} · ${pct}% billed`, hasWork: true };
    }
    case 'cash-flow':
      return { text: null, hasWork: t.payApps!.total > 0 };
    case 'change-orders': {
      const c = t.changeOrders!;
      return c.pending > 0 ? { text: `${c.total} · ${c.pending} pending`, hasWork: true } : count(c.total);
    }
    case 'lien-waivers': {
      const w = t.lienWaivers!;
      return w.pending > 0 ? { text: `${w.total} · ${w.pending} pending`, hasWork: true } : count(w.total);
    }
    case 'compliance': {
      const c = t.compliance!;
      if (c.subs === 0) return { text: 'No subs yet', hasWork: false };
      const subs = plural(c.subs, 'sub');
      if (c.expired > 0) return { text: `${subs} · ${c.expired} expired`, warn: true, hasWork: true };
      if (c.missing > 0) return { text: `${subs} · ${c.missing} no COI`, warn: live, hasWork: true };
      return { text: `${subs} · all current`, hasWork: true };
    }
    case 'subs':
      return { text: null, hasWork: t.compliance!.subs > 0 };
    case 'todos':
      return t.todos! > 0 ? { text: `${t.todos} open`, hasWork: true } : count(0);
    case 'autopilot':
      return t.alerts! > 0 ? { text: `${t.alerts} active`, warn: true, hasWork: true } : count(0);
    default: {
      const v = t[key];
      return typeof v === 'number' ? count(v) : empty();
    }
  }
}

export interface ToolRowModel { tool: ToolDef; value: ToolValue }

/**
 * The tool list: each group's rows (core tools, plus any other tool with work
 * in it), and the tools that wait under "More tools". While the counts load,
 * only core tools are listed — the rest join when their counts arrive, below
 * the core rows of their own group, never above what you are looking at.
 */
export function toolList(tools: JobTools | 'loading' | 'failed', f: JobFacts): { groups: { key: GroupKey; label: string; rows: ToolRowModel[] }[]; more: ToolRowModel[] } {
  const groups = GROUPS.filter((g) => g.key !== 'more').map((g) => ({ ...g, rows: [] as ToolRowModel[] }));
  const more: ToolRowModel[] = [];
  for (const tool of TOOLS) {
    const value = toolValue(tool.id, tools, f);
    const g = groups.find((x) => x.key === tool.group);
    if (g && (tool.core || value.hasWork)) g.rows.push({ tool, value });
    else more.push({ tool, value });
  }
  return { groups: groups.filter((g) => g.rows.length > 0), more };
}

/* ── The brief ─────────────────────────────────────────────────────────── */

/** A sentence in pieces: plain text, or { b } for the words that carry it. */
export type BriefPart = string | { b: string };
export interface JobBrief { parts: BriefPart[]; action: { label: string; href: string } }

/**
 * One rule-based read of the job, with one action (href relative to the job).
 * Rules run in order; the first with something to say wins.
 */
export function jobBrief(tools: JobTools | null, f: JobFacts): JobBrief | null {
  if (!tools) return null;
  const { stage, today } = f;
  const t = tools;

  /* 1. A closed job: what is still hanging off it. */
  if (stage === 'closed') {
    const finished = f.end ? `Finished ${fmtDay(f.end, today)}. ` : 'Closed. ';
    if (t.punch && t.punch.open > 0) return { parts: [finished, { b: plural(t.punch.open, 'punch item') }, ` ${t.punch.open === 1 ? 'is' : 'are'} still open.`], action: { label: 'Punch list', href: '/punch-list' } };
    if (t.lienWaivers && t.lienWaivers.pending > 0) return { parts: [finished, { b: plural(t.lienWaivers.pending, 'lien waiver') }, ' still to collect.'], action: { label: 'Lien waivers', href: '/lien-waivers' } };
    if (t.payApps && t.payApps.total > t.payApps.paid) {
      const unpaid = t.payApps.total - t.payApps.paid;
      return { parts: [finished, { b: `${unpaid} of ${t.payApps.total}` }, ` pay app${t.payApps.total === 1 ? '' : 's'} not paid yet.`], action: { label: 'Pay apps', href: '/pay-apps' } };
    }
    const paid = t.payApps && t.payApps.total > 0
      ? [t.payApps.total === 1 ? 'The pay app is paid' : `All ${t.payApps.total} pay apps are paid`, ' and nothing is open.']
      : ['Nothing is open on it.'];
    return { parts: [finished, ...paid], action: { label: 'Closeout', href: '/closeout' } };
  }

  /** Plans missing from the job. `bidders`: say what that means for the subs pricing it. */
  const docsGap = (bidders: boolean): { parts: BriefPart[]; action: { label: string; href: string } } | null => {
    const noDrawings = t.drawings === 0;
    const noSpecs = t.specs === 0;
    if (!noDrawings && !noSpecs) return null;
    if (noDrawings && noSpecs) {
      const why = !bidders ? '' : (t.takeoffs ?? 0) > 0 ? ', so bidders only see the takeoff' : ', so bidders have nothing to price from';
      return { parts: [` No drawings or specs are on the job yet${why}.`], action: { label: 'Add plans', href: '/drawings' } };
    }
    return noDrawings
      ? { parts: [' No drawings are on the job yet.'], action: { label: 'Add plans', href: '/drawings' } }
      : { parts: [' No specs are on the job yet.'], action: { label: 'Add specs', href: '/specs' } };
  };

  /* 2. Bids closing. */
  const b = t.bidPackages;
  if (b && b.nextDue && b.dueNext) {
    const n = b.dueNext;
    const when: BriefPart[] = ['Bids close ', { b: fmtDay(b.nextDue, today, true) }];
    let body: BriefPart[];
    if (n.invited === 0) {
      body = [', but no one is invited yet.'];
      return { parts: [...when, ...body], action: { label: 'Invite bidders', href: '/bid-packages' } };
    }
    if (n.responded === 0) body = ['. ', { b: `None of ${n.invited}` }, ' invited have bid yet.'];
    else {
      body = ['. ', { b: `${n.responded} of ${n.invited}` }, ' in so far'];
      if (n.lowCount > 0) body.push(n.lowCount === 1 && n.count === 1 ? '; low bid is ' : '; low bids total ', { b: fmtMoneyShort(n.lowTotal) });
      body.push('.');
    }
    const gap = docsGap(true);
    if (gap) return { parts: [...when, ...body, ...gap.parts], action: gap.action };
    return { parts: [...when, ...body], action: { label: 'Open bids', href: '/bid-packages' } };
  }

  /* 3. Bids that passed their date with no award. */
  if (b && b.pastDue > 0) {
    return { parts: [{ b: plural(b.pastDue, 'bid package') }, ` ${b.pastDue === 1 ? 'is' : 'are'} past the due date with no award.`], action: { label: 'Award', href: '/bid-packages' } };
  }

  /* 4. RFIs past due. */
  if (t.rfis && t.rfis.overdue > 0) {
    return { parts: [{ b: plural(t.rfis.overdue, 'RFI') }, ` ${t.rfis.overdue === 1 ? 'is' : 'are'} past due.`], action: { label: 'Answer RFIs', href: '/rfis' } };
  }

  const started = !f.start || f.start <= today;

  /* 5. A running job with no log today. */
  if (stage === 'building' && started && t.dailyLogs && t.dailyLogs.last !== today) {
    const last = t.dailyLogs.last ? ` The last one was ${fmtDay(t.dailyLogs.last, today)}.` : '';
    return { parts: [{ b: 'No daily log' }, ` for today yet.${last}`], action: { label: 'Log today', href: '/daily-logs' } };
  }

  /* 6. Schedule slipping. */
  if (stage === 'building' && t.schedule && t.schedule.late > 0) {
    return { parts: [{ b: plural(t.schedule.late, 'schedule task') }, ` ${t.schedule.late === 1 ? 'is' : 'are'} past the end date.`], action: { label: 'Update schedule', href: '/schedule' } };
  }

  /* 7. Won, not started yet. */
  if (stage === 'building' && f.start && !started) {
    const out = daysBetween(today, f.start);
    const head: BriefPart[] = ['Starts ', { b: fmtDay(f.start, today, true) }, `, ${plural(out, 'day')} out.`];
    if (t.schedule && t.schedule.total === 0) return { parts: [...head, ' No schedule tasks yet.'], action: { label: 'Build the schedule', href: '/schedule' } };
    const gap = docsGap(false);
    if (gap) return { parts: [...head, ...gap.parts], action: gap.action };
    return { parts: head, action: { label: 'Schedule', href: '/schedule' } };
  }

  /* 8. Bidding with nothing out yet. */
  if (stage === 'bidding' && b && b.total === 0) {
    if ((t.takeoffs ?? 0) === 0) return { parts: [{ b: 'No takeoff yet' }, ' — measure the plans to price the job.'], action: { label: 'Start takeoff', href: '/takeoff' } };
    return { parts: ['The takeoff is in. ', { b: 'No bid packages' }, ' have gone to subs yet.'], action: { label: 'New bid package', href: '/bid-packages?new=1' } };
  }

  /* 9. Bidding with packages out but none dated. */
  if (stage === 'bidding' && b && b.noDue > 0) {
    return { parts: [{ b: plural(b.noDue, 'bid package') }, ` ${b.noDue === 1 ? 'has' : 'have'} no due date.`], action: { label: 'Set due dates', href: '/bid-packages' } };
  }

  return stage === 'building'
    ? { parts: ['Nothing on this job needs you right now.'], action: { label: 'Schedule', href: '/schedule' } }
    : { parts: ['Nothing on this job needs you right now.'], action: { label: 'Bid packages', href: '/bid-packages' } };
}
