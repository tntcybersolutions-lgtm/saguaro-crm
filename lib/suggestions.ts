/**
 * lib/suggestions.ts — Real-time suggestion engine (rule-based, REAL data only).
 *
 * Every suggestion is computed live from the tenant's own tables and carries:
 *   id        — stable per underlying row (rule + row id), so the UI can sync
 *               a ticker item to the NudgeRing highlighting that section.
 *   rule      — machine key of the rule that fired.
 *   module    — which module owns the learning moment.
 *   severity  — red / amber / info (ranked in that order).
 *   finding   — one plain-English sentence a GC can act on.
 *   why       — the actual data behind the sentence (dates, statuses, rows).
 *   dollars   — dollar impact ONLY when honestly computable from real numbers
 *               (an overdue invoice's outstanding balance, a draft proposal's
 *               total). NEVER an invented ROI figure — null when the data
 *               can't honestly price it.
 *   href      — deep link into the module; when the target page mounts a
 *               NudgeRing with the matching anchorId, the hash scrolls to and
 *               pulses that exact section.
 *
 * Rules implemented (each verified against lib/database.types.ts):
 *   invoice-overdue    invoices: due_date past, not paid/draft — $ = total − paid
 *   estimate-unsent    proposals: draft, sent_at null, ≥7 days old — $ = total_amount
 *   bid-decision       bid_packages: past bid_due_date, bids in, no award — $ none (not honestly computable)
 *   daily-log-gap      active projects with no daily_log in 3+ workdays — $ none
 *   takeoff-stalled    takeoffs: complete ≥7 days, never exported to an estimate — $ = priced value
 *   payapp-uncollected pay_applications: approved/certified ≥14 days, payment_received_at null — $ = current_payment_due
 *   retainage-held     completed projects whose latest live pay app still holds retainage — $ = retainage_held
 *   insurance-expiring insurance_certificates: active, expiry within 30 days or past — $ none
 *
 * House rules honored: NUMERIC arrives as TEXT → Number() always; date-only
 * columns parsed with local/UTC-index math (never new Date('YYYY-MM-DD'));
 * one bad table degrades to [] and lands in degradedSources — it never
 * zeroes the feed.
 *
 * Dismissals survive recompute: ids are deterministic (rule + entity id), so a
 * 'suggestion_dismissed' learning_event from the last 30 days suppresses that
 * exact suggestion here — the ticker and every NudgeRing inherit it from this
 * one server-side feed.
 */
import { liveJobs } from '@/lib/live-jobs';
import { receivableOnly } from '@/lib/invoice-direction';

import { isTakeoffComplete } from './takeoff-status';

export type SuggestionSeverity = 'red' | 'amber' | 'info';

export interface Suggestion {
  id: string;
  rule: string;
  module: string;
  moduleLabel: string;
  severity: SuggestionSeverity;
  finding: string;
  why: string;
  /** Honest dollar impact from real rows, or null when not computable. */
  dollars: number | null;
  href: string;
  /** DOM anchor a NudgeRing listens for (null when no ring is mounted yet). */
  anchorId: string | null;
  projectId: string | null;
  projectName: string | null;
}

export interface SuggestionFeed {
  suggestions: Suggestion[];
  degradedSources: string[];
  generatedAt: string;
}

/* ── shared anchor contract (ticker href ↔ NudgeRing anchorId) ── */
export const ANCHOR_INVOICES_OVERDUE = 'sg-nudge-invoices-overdue';
export const ANCHOR_TAKEOFF_ESTIMATE = 'sg-nudge-takeoff-estimate';
export const ANCHOR_PAY_APPS_DUE = 'sg-nudge-pay-apps-due';           // project pay-apps list (uncollected + retainage)
export const ANCHOR_BID_DECISION = 'sg-nudge-bid-decision';           // project bid-packages list
export const ANCHOR_DAILY_LOG_GAP = 'sg-nudge-daily-log-gap';         // global daily-logs list
export const ANCHOR_INSURANCE_EXPIRING = 'sg-nudge-insurance-expiring'; // compliance scorecard

const SEV_RANK: Record<SuggestionSeverity, number> = { red: 0, amber: 1, info: 2 };
const PER_RULE_CAP = 6;
const TOTAL_CAP = 24;
const PROJECT_CAP = 100;
const LOG_GAP_PROJECT_CAP = 25;

/* status vocabularies (mirror intelligence/summary + invoicing page) */
const CLOSED_PROJECT = new Set(['completed', 'complete', 'closed', 'cancelled', 'canceled', 'archived', 'lost']);
const DONE_PROJECT = new Set(['completed', 'complete', 'closed']);
const INV_NOT_OWED = new Set(['paid', 'draft', 'cancelled', 'canceled', 'void', 'voided']);
const PKG_DECIDED = new Set(['awarded', 'closed', 'cancelled', 'canceled', 'archived']);
const DEAD_PAY_APP = new Set(['rejected', 'void', 'voided', 'cancelled', 'canceled', 'draft']);
const PAY_APP_OWED = new Set(['approved', 'certified']);

const num = (v: unknown): number => Number(v) || 0; // NUMERIC arrives as TEXT — Number() ALWAYS
const round2 = (v: number): number => Math.round(v * 100) / 100;
const usd = (n: number): string => '$' + Math.round(n).toLocaleString('en-US');
const plural = (n: number, s: string): string => `${n} ${s}${n === 1 ? '' : 's'}`;

/* ── local date-only math (never new Date('YYYY-MM-DD')) ── */
type Ymd = { y: number; m: number; d: number };
const parseDateOnly = (s: unknown): Ymd | null => {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
};
const dayIndex = (p: Ymd): number => Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86400000);
const todayYmd = (): Ymd => {
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() };
};
const ymdKey = (p: Ymd): string =>
  `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
const ymdDaysAhead = (base: Ymd, days: number): Ymd => {
  const t = new Date(Date.UTC(base.y, base.m - 1, base.d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};
/** Weekday of a calendar-day index (0 = Sunday … 6 = Saturday). */
const weekdayOfIndex = (idx: number): number => new Date(idx * 86400000).getUTCDay();
/** Count Mon–Fri days in the open interval (fromIdx, toIdx). */
const workdaysBetween = (fromIdx: number, toIdx: number): number => {
  let n = 0;
  for (let i = fromIdx + 1; i < toIdx; i++) {
    const w = weekdayOfIndex(i);
    if (w >= 1 && w <= 5) n++;
  }
  return n;
};
/** Whole days since a full timestamp (created_at etc.). null if unparsable. */
const daysSinceTs = (ts: unknown): number | null => {
  if (typeof ts !== 'string' || !ts) return null;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
};

/** Canonical money figure for an invoice — a stale 0 total defers to amount+tax. */
const effectiveTotal = (r: { total?: unknown; amount?: unknown; tax?: unknown }): number => {
  const t = num(r.total);
  return t !== 0 ? t : num(r.amount) + num(r.tax);
};

/** One bad table never zeroes the feed — swallow to [] and record the source. */
async function safeRows(
  label: string,
  q: PromiseLike<{ data: unknown; error: unknown }>,
  degraded: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  try {
    const { data, error } = await q;
    if (error) {
      degraded.push(label);
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]) ?? [];
  } catch {
    degraded.push(label);
    return [];
  }
}

/** Minimal query surface — matches the Supabase client requirePermission hands out. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any };

export async function computeSuggestions(db: Db, tenantId: string): Promise<SuggestionFeed> {
  const degraded: string[] = [];
  const today = todayYmd();
  const todayIdx = dayIndex(today);
  const todayKey = ymdKey(today);
  const in30Key = ymdKey(ymdDaysAhead(today, 30));
  const logWindowKey = ymdKey(ymdDaysAhead(today, -30));

  /* ── projects first: names + active/completed sets scope every other rule ── */
  const projRows = await safeRows(
    'projects',
    liveJobs(db
      .from('projects')
      .select('id, name, status, created_at, last_activity_at')
      .eq('tenant_id', tenantId))
      .order('last_activity_at', { ascending: false, nullsFirst: false })
      .limit(PROJECT_CAP),
    degraded,
  );
  const nameOf = new Map<string, string>();
  const statusOf = new Map<string, string>();
  const createdOf = new Map<string, string>();
  const activeIds: string[] = [];
  const doneIds: string[] = [];
  for (const p of projRows) {
    const pid = String(p.id);
    nameOf.set(pid, String(p.name ?? 'Untitled'));
    const st = String(p.status ?? '').toLowerCase();
    statusOf.set(pid, st);
    if (typeof p.created_at === 'string') createdOf.set(pid, p.created_at);
    if (!CLOSED_PROJECT.has(st)) activeIds.push(pid);
    if (DONE_PROJECT.has(st)) doneIds.push(pid);
  }
  const pname = (pid: unknown): string | null =>
    pid ? nameOf.get(String(pid)) ?? null : null;

  /* ── every source in parallel, each in its own try ── */
  const [invoices, proposals, bidPackages, bids, bidSubs, dailyLogs, takeoffs, payApps, insurance, dismissEvents] =
    await Promise.all([
      safeRows(
        'invoices',
        // Owner billing only — a sub's bill is never chased as money owed to us.
        receivableOnly(db
          .from('invoices')
          .select('id, project_id, vendor_name, invoice_number, amount, tax, total, paid_amount, due_date, status')
          .eq('tenant_id', tenantId))
          .not('due_date', 'is', null)
          .lt('due_date', todayKey),
        degraded,
      ),
      safeRows(
        'proposals',
        db
          .from('proposals')
          .select('id, project_id, title, proposal_number, client_name, amount, total_amount, status, sent_at, accepted_at, declined_at, created_at')
          .eq('tenant_id', tenantId)
          .is('sent_at', null),
        degraded,
      ),
      safeRows(
        'bid_packages',
        db
          .from('bid_packages')
          .select('id, project_id, name, status, bid_due_date, due_date, awarded_at, awarded_to, bid_count, num_responded, low_bid_amount')
          .eq('tenant_id', tenantId),
        degraded,
      ),
      safeRows(
        'bids',
        db.from('bids').select('bid_package_id, amount').eq('tenant_id', tenantId),
        degraded,
      ),
      safeRows(
        'bid_submissions',
        db.from('bid_submissions').select('bid_package_id, amount, base_amount').eq('tenant_id', tenantId),
        degraded,
      ),
      activeIds.length > 0
        ? safeRows(
            'daily_logs',
            db
              .from('daily_logs')
              .select('project_id, log_date')
              .eq('tenant_id', tenantId)
              .in('project_id', activeIds.slice(0, LOG_GAP_PROJECT_CAP))
              .gte('log_date', logWindowKey),
            degraded,
          )
        : Promise.resolve([]),
      safeRows(
        'takeoffs',
        db
          .from('takeoffs')
          .select('id, project_id, name, status, created_at, exported_at, sell_price, grand_total, total_cost')
          .eq('tenant_id', tenantId)
          .eq('status', 'complete')
          .is('exported_at', null),
        degraded,
      ),
      safeRows(
        'pay_applications',
        db
          .from('pay_applications')
          .select('id, project_id, app_number, status, current_payment_due, net_payment_due, approved_at, application_date, created_at, payment_received_at, retainage_held, retainage_amount')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null),
        degraded,
      ),
      safeRows(
        'insurance_certificates',
        db
          .from('insurance_certificates')
          .select('id, project_id, sub_name, policy_type, carrier, expiry_date, status')
          .eq('tenant_id', tenantId)
          .eq('status', 'active')
          .not('expiry_date', 'is', null)
          .lte('expiry_date', in30Key),
        degraded,
      ),
      /* Dismissals survive recompute: a suggestion whose STABLE id (rule + row
       * id) was dismissed in the last 30 days is excluded server-side, so the
       * ticker and every NudgeRing inherit the suppression from this one feed. */
      safeRows(
        'learning_events',
        db
          .from('learning_events')
          .select('meta')
          .eq('tenant_id', tenantId)
          .eq('kind', 'suggestion_dismissed')
          .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
          .limit(1000),
        degraded,
      ),
    ]);

  /* A takeoff marked complete with nothing measured is not complete
     (lib/takeoff-status) — nothing to export, so no nudge to export it. */
  const takeoffCounts = takeoffs.length
    ? await safeRows('takeoff_item_counts', db.from('takeoff_item_counts').select('takeoff_id, items').eq('tenant_id', tenantId).in('takeoff_id', takeoffs.map((t) => t.id)), degraded)
    : [];
  const measured = new Map(takeoffCounts.map((c) => [String(c.takeoff_id), Number(c.items) || 0]));
  const completeTakeoffs = takeoffs.filter((t) => isTakeoffComplete(t.status, measured.get(String(t.id)) ?? 0));

  const dismissed = new Set<string>();
  for (const e of dismissEvents) {
    const sid = e?.meta?.suggestionId;
    if (typeof sid === 'string' && sid) dismissed.add(sid);
  }

  const out: Suggestion[] = [];
  const push = (s: Suggestion) => out.push(s);
  /** Rank a rule's hits into the feed — dismissed ids never eat a cap slot. */
  const commit = (hits: Suggestion[]) =>
    hits.filter((s) => !dismissed.has(s.id)).slice(0, PER_RULE_CAP).forEach(push);

  /* ── R1: overdue invoices — $ = effectiveTotal − paid_amount (real rows) ── */
  {
    const hits: Suggestion[] = [];
    for (const inv of invoices) {
      const st = String(inv.status ?? 'draft').toLowerCase();
      if (INV_NOT_OWED.has(st)) continue; // same contract as the invoicing page: overdue excludes drafts + paid
      const due = parseDateOnly(inv.due_date);
      if (!due) continue;
      const daysOver = todayIdx - dayIndex(due);
      if (daysOver <= 0) continue;
      const outstanding = round2(Math.max(0, effectiveTotal(inv) - num(inv.paid_amount)));
      if (outstanding <= 0) continue;
      const label = inv.invoice_number
        ? `Invoice ${inv.invoice_number}`
        : `Invoice from ${String(inv.vendor_name ?? 'vendor')}`;
      const proj = pname(inv.project_id);
      hits.push({
        id: `invoice-overdue:${inv.id}`,
        rule: 'invoice-overdue',
        module: 'invoicing',
        moduleLabel: 'Invoices',
        severity: daysOver >= 14 ? 'red' : 'amber',
        finding: `${label} is ${plural(daysOver, 'day')} overdue — ${usd(outstanding)} outstanding.`,
        why: `Due ${String(inv.due_date).slice(0, 10)}, status "${st}"${proj ? `, project ${proj}` : ''}. Billed ${usd(effectiveTotal(inv))}, paid ${usd(num(inv.paid_amount))}. Chasing it now protects the cash the job already earned.`,
        dollars: outstanding,
        href: `/app/invoicing#${ANCHOR_INVOICES_OVERDUE}`,
        anchorId: ANCHOR_INVOICES_OVERDUE,
        projectId: inv.project_id ? String(inv.project_id) : null,
        projectName: proj,
      });
    }
    hits.sort((a, b) => (b.dollars ?? 0) - (a.dollars ?? 0));
    commit(hits);
  }

  /* ── R2: proposals drafted but never sent ≥7 days — $ = proposal total ── */
  {
    const hits: Suggestion[] = [];
    for (const pr of proposals) {
      const st = String(pr.status ?? 'draft').toLowerCase();
      if (pr.accepted_at || pr.declined_at) continue;
      if (st && st !== 'draft' && st !== 'unsent' && st !== 'new') continue;
      const age = daysSinceTs(pr.created_at);
      if (age === null || age < 7) continue;
      const value = round2(num(pr.total_amount) || num(pr.amount));
      const label = pr.proposal_number ? `Proposal ${pr.proposal_number}` : `"${String(pr.title ?? 'Untitled proposal')}"`;
      const proj = pname(pr.project_id);
      hits.push({
        id: `estimate-unsent:${pr.id}`,
        rule: 'estimate-unsent',
        module: 'estimates',
        moduleLabel: 'Estimates',
        severity: age >= 21 && value > 0 ? 'red' : 'amber',
        finding: value > 0
          ? `${label} has sat unsent for ${plural(age, 'day')} — ${usd(value)} of work not yet in front of the client.`
          : `${label} has sat unsent for ${plural(age, 'day')}.`,
        why: `Drafted ${String(pr.created_at).slice(0, 10)}, still status "${st || 'draft'}", never sent${pr.client_name ? ` to ${pr.client_name}` : ''}${proj ? ` (project ${proj})` : ''}. Estimates that go out faster win more — this one is aging in drafts.`,
        dollars: value > 0 ? value : null,
        // The estimate builder was never reachable from navigation and is gone; a
        // proposal with no project belongs in the projects list, where one can be
        // attached to it.
        href: pr.project_id ? `/app/projects/${pr.project_id}/proposal` : '/app/projects',
        anchorId: null,
        projectId: pr.project_id ? String(pr.project_id) : null,
        projectName: proj,
      });
    }
    hits.sort((a, b) => (b.dollars ?? 0) - (a.dollars ?? 0));
    commit(hits);
  }

  /* ── R3: bid packages past bid date with bids in and no decision — $ none
   *       (the cost of a slow award isn't honestly computable; the low bid is
   *       shown as data in the WHY instead). ── */
  {
    const countByPkg = new Map<string, number>();
    const lowByPkg = new Map<string, number>();
    const tally = (pkgId: unknown, amount: number) => {
      if (!pkgId) return;
      const k = String(pkgId);
      countByPkg.set(k, (countByPkg.get(k) ?? 0) + 1);
      if (amount > 0) {
        const prev = lowByPkg.get(k);
        if (prev === undefined || amount < prev) lowByPkg.set(k, amount);
      }
    };
    for (const b of bids) tally(b.bid_package_id, num(b.amount));
    for (const s of bidSubs) tally(s.bid_package_id, num(s.amount) || num(s.base_amount));

    const hits: Suggestion[] = [];
    for (const pkg of bidPackages) {
      const st = String(pkg.status ?? '').toLowerCase();
      if (PKG_DECIDED.has(st) || pkg.awarded_at || pkg.awarded_to) continue;
      const due = parseDateOnly(pkg.bid_due_date ?? pkg.due_date);
      if (!due) continue;
      const daysPast = todayIdx - dayIndex(due);
      if (daysPast <= 0) continue;
      const k = String(pkg.id);
      const nBids = Math.max(countByPkg.get(k) ?? 0, num(pkg.bid_count), num(pkg.num_responded));
      if (nBids < 1) continue; // no bids in — nothing awaiting a decision
      const low = lowByPkg.get(k) ?? num(pkg.low_bid_amount);
      const proj = pname(pkg.project_id);
      hits.push({
        id: `bid-decision:${pkg.id}`,
        rule: 'bid-decision',
        module: 'bids',
        moduleLabel: 'Bid Packages',
        severity: daysPast >= 14 ? 'red' : 'amber',
        finding: `"${String(pkg.name ?? 'Bid package')}" closed ${plural(daysPast, 'day')} ago with ${plural(nBids, 'bid')} in — no award decision yet.`,
        why: `Bid date ${ymdKey(due)} has passed, status "${st || 'open'}", no award recorded${low > 0 ? `; low bid on the table is ${usd(low)}` : ''}${proj ? ` (project ${proj})` : ''}. Subs re-price or walk when awards drag — deciding locks today's number.`,
        dollars: null,
        href: pkg.project_id
          ? `/app/projects/${pkg.project_id}/bid-packages#${ANCHOR_BID_DECISION}`
          : '/app/bids',
        anchorId: ANCHOR_BID_DECISION,
        projectId: pkg.project_id ? String(pkg.project_id) : null,
        projectName: proj,
      });
    }
    hits.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
    commit(hits);
  }

  /* ── R4: active projects quiet for 3+ workdays (no daily log) — $ none ── */
  if (!degraded.includes('daily_logs') && !degraded.includes('projects')) {
    const lastLogIdx = new Map<string, number>();
    for (const l of dailyLogs) {
      const d = parseDateOnly(l.log_date);
      if (!d || !l.project_id) continue;
      const idx = dayIndex(d);
      const k = String(l.project_id);
      const prev = lastLogIdx.get(k);
      if (prev === undefined || idx > prev) lastLogIdx.set(k, idx);
    }
    const hits: Suggestion[] = [];
    for (const pid of activeIds.slice(0, LOG_GAP_PROJECT_CAP)) {
      const last = lastLogIdx.get(pid);
      let gapWorkdays: number;
      let whyTail: string;
      if (last === undefined) {
        // No log in the whole 30-day window. Only flag projects old enough to
        // have expected one.
        const age = daysSinceTs(createdOf.get(pid));
        if (age === null || age < 7) continue;
        gapWorkdays = workdaysBetween(todayIdx - 31, todayIdx);
        whyTail = 'No daily log exists in the last 30 days.';
      } else {
        gapWorkdays = workdaysBetween(last, todayIdx);
        whyTail = `Last log was filed ${plural(todayIdx - last, 'day')} ago.`;
      }
      if (gapWorkdays < 3) continue;
      const nm = nameOf.get(pid) ?? 'Untitled';
      hits.push({
        id: `daily-log-gap:${pid}`,
        rule: 'daily-log-gap',
        module: 'daily-logs',
        moduleLabel: 'Daily Logs',
        severity: gapWorkdays >= 5 ? 'amber' : 'info',
        finding: `${nm} has gone ${plural(gapWorkdays, 'workday')} without a daily log.`,
        why: `${whyTail} Daily logs are the record that wins delay and change-order disputes — a gap here is documentation you can't get back.`,
        dollars: null,
        href: `/app/projects/${pid}/daily-logs`,
        anchorId: ANCHOR_DAILY_LOG_GAP,
        projectId: pid,
        projectName: nm,
      });
    }
    hits.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
    commit(hits);
  }

  /* ── R5: completed takeoffs never exported to an estimate — $ = priced value ── */
  {
    const hits: Suggestion[] = [];
    for (const t of completeTakeoffs) {
      const age = daysSinceTs(t.created_at);
      if (age === null || age < 7) continue;
      const value = round2(num(t.sell_price) || num(t.grand_total) || num(t.total_cost));
      if (value <= 0) continue; // no honest dollar figure — skip rather than invent
      const proj = pname(t.project_id);
      hits.push({
        id: `takeoff-stalled:${t.id}`,
        rule: 'takeoff-stalled',
        module: 'takeoff',
        moduleLabel: 'Takeoff',
        severity: 'amber',
        finding: `Takeoff "${String(t.name ?? 'Untitled')}" priced ${usd(value)} of work ${plural(age, 'day')} ago and never became an estimate.`,
        why: `Analysis completed ${String(t.created_at).slice(0, 10)} with a priced total of ${usd(value)}, but it was never exported${proj ? ` (project ${proj})` : ''}. Open the takeoff and press Build it all to turn the priced quantities into bid packages.`,
        dollars: value,
        // Straight to the takeoff that stalled — the priced rows are already there,
        // which is a shorter path than re-importing them somewhere else.
        href: t.project_id ? `/app/projects/${t.project_id}/takeoff` : '/app/takeoff',
        // The ring this pointed at lived on the estimate builder, which is gone.
        // The takeoff page has no equivalent target, so the nudge just links.
        anchorId: null,
        projectId: t.project_id ? String(t.project_id) : null,
        projectName: proj,
      });
    }
    hits.sort((a, b) => (b.dollars ?? 0) - (a.dollars ?? 0));
    commit(hits);
  }

  /* ── R6: approved pay apps uncollected ≥14 days — $ = current_payment_due ── */
  {
    const hits: Suggestion[] = [];
    for (const a of payApps) {
      const st = String(a.status ?? '').toLowerCase();
      if (!PAY_APP_OWED.has(st)) continue;
      if (a.payment_received_at) continue;
      const due = round2(num(a.current_payment_due) || num(a.net_payment_due));
      if (due <= 0) continue;
      const age = daysSinceTs(a.approved_at) ?? daysSinceTs(a.application_date) ?? daysSinceTs(a.created_at);
      if (age === null || age < 14) continue;
      const proj = pname(a.project_id);
      hits.push({
        id: `payapp-uncollected:${a.id}`,
        rule: 'payapp-uncollected',
        module: 'pay-apps',
        moduleLabel: 'Pay Apps',
        severity: age >= 30 ? 'red' : 'amber',
        finding: `Pay App #${num(a.app_number) || '?'}${proj ? ` on ${proj}` : ''} was approved ${plural(age, 'day')} ago — ${usd(due)} still uncollected.`,
        why: `Status "${st}", approved ${a.approved_at ? String(a.approved_at).slice(0, 10) : 'date on record'}, no payment received. That's certified money the owner already signed off on.`,
        dollars: due,
        href: a.project_id
          ? `/app/projects/${a.project_id}/pay-apps#${ANCHOR_PAY_APPS_DUE}`
          : '/app/reports',
        anchorId: ANCHOR_PAY_APPS_DUE,
        projectId: a.project_id ? String(a.project_id) : null,
        projectName: proj,
      });
    }
    hits.sort((a, b) => (b.dollars ?? 0) - (a.dollars ?? 0));
    commit(hits);
  }

  /* ── R6b: retainage still held on COMPLETED projects — $ = retainage_held ── */
  if (doneIds.length > 0 && !degraded.includes('pay_applications')) {
    const doneSet = new Set(doneIds);
    // Latest live app per completed project carries the cumulative retainage.
    const latestByProj = new Map<string, { appNo: number; retainage: number }>();
    for (const a of payApps) {
      const pid = a.project_id ? String(a.project_id) : '';
      if (!pid || !doneSet.has(pid)) continue;
      if (DEAD_PAY_APP.has(String(a.status ?? '').toLowerCase())) continue;
      const n = num(a.app_number);
      const prev = latestByProj.get(pid);
      if (!prev || n > prev.appNo) {
        latestByProj.set(pid, {
          appNo: n,
          retainage: round2(num(a.retainage_held) || num(a.retainage_amount)),
        });
      }
    }
    const hits: Suggestion[] = [];
    for (const [pid, info] of latestByProj) {
      if (info.retainage <= 0) continue;
      const nm = nameOf.get(pid) ?? 'Untitled';
      hits.push({
        id: `retainage-held:${pid}`,
        rule: 'retainage-held',
        module: 'pay-apps',
        moduleLabel: 'Retainage',
        severity: 'amber',
        finding: `${nm} is complete but ${usd(info.retainage)} of retainage is still held.`,
        why: `Project status "${statusOf.get(pid)}", latest pay app (#${info.appNo}) shows ${usd(info.retainage)} retainage held to date. A final retainage billing turns it into cash.`,
        dollars: info.retainage,
        href: `/app/projects/${pid}/pay-apps#${ANCHOR_PAY_APPS_DUE}`,
        anchorId: ANCHOR_PAY_APPS_DUE,
        projectId: pid,
        projectName: nm,
      });
    }
    hits.sort((a, b) => (b.dollars ?? 0) - (a.dollars ?? 0));
    commit(hits);
  }

  /* ── R7: insurance certificates expired / expiring ≤30 days — $ none ── */
  {
    const hits: Suggestion[] = [];
    for (const c of insurance) {
      const exp = parseDateOnly(c.expiry_date);
      if (!exp) continue;
      const delta = dayIndex(exp) - todayIdx; // negative = already expired
      const who = String(c.sub_name ?? 'Subcontractor');
      const pol = c.policy_type ? String(c.policy_type) : 'insurance';
      const proj = pname(c.project_id);
      hits.push({
        id: `insurance-expiring:${c.id}`,
        rule: 'insurance-expiring',
        module: 'insurance',
        moduleLabel: 'Insurance',
        severity: delta < 0 ? 'red' : 'amber',
        finding: delta < 0
          ? `${who}'s ${pol} certificate expired ${plural(-delta, 'day')} ago.`
          : `${who}'s ${pol} certificate expires in ${plural(delta, 'day')}.`,
        why: `Expiry ${ymdKey(exp)}${c.carrier ? `, carrier ${c.carrier}` : ''}${proj ? `, project ${proj}` : ''}. A sub working past coverage puts the exposure on you — request the renewed cert now.`,
        dollars: null,
        href: c.project_id
          ? `/app/projects/${c.project_id}/insurance`
          : `/app/compliance#${ANCHOR_INSURANCE_EXPIRING}`,
        anchorId: ANCHOR_INSURANCE_EXPIRING,
        projectId: c.project_id ? String(c.project_id) : null,
        projectName: proj,
      });
    }
    hits.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
    commit(hits);
  }

  /* ── rank: severity first, then honest dollars descending, nulls after ── */
  out.sort((a, b) => {
    const sev = SEV_RANK[a.severity] - SEV_RANK[b.severity];
    if (sev !== 0) return sev;
    return (b.dollars ?? -1) - (a.dollars ?? -1);
  });

  return {
    suggestions: out.slice(0, TOTAL_CAP),
    degradedSources: degraded,
    generatedAt: new Date().toISOString(),
  };
}
