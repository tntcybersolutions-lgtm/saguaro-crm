'use client';
/**
 * Project home — "what does this job need from me next."
 * Pass 3 #1 (docs/design/HANDOFF-FULL-local-claude.md §5). Same anatomy as
 * the company home (components/home/HomeV2.tsx):
 *
 *   compact header (job, address, phase, ONE filled primary action)
 *   → the path rail, folded once the job is moving
 *   → four phase-scoped metrics, each naming its basis and opening the records
 *   → Needs Attention (ranked) beside Coming Up (tasks + inspections)
 *   → the phase table (bid packages while bidding, pay apps after)
 *   → ownership, details, contract and budget, subs
 *   → recent activity, last.
 *
 * Data: the project aggregate (/api/projects/[id] — the same SWR key the
 * project rail reads), the project-context snapshot, and the existing
 * inspections list. Nothing here is computed from data the page does not
 * load, and a section whose source failed says so instead of showing zero.
 */
import React, { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  WarningCircle, FolderOpen, ArrowRight, ArrowClockwise, Plus, CheckCircle, XCircle,
} from '@phosphor-icons/react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { toCents, toDollars, sumCents, subCents, summarizeContract } from '@/lib/calc';
import { Badge, EmptyState, type BadgeTone } from '@/components/ui/kit';
import NextAction from '@/components/project/NextAction';
import ProjectHeader from '@/components/project/ProjectHeader';
import JobColorPicker from '@/components/project/JobColorPicker';
import ProjectOwnershipCard from '@/components/projects/ProjectOwnershipCard';
import { normalisePhase } from '@/lib/project-phase';
import { isClosedStatus } from '@/lib/project-lifecycle';

/* ── Fetchers ─────────────────────────────────────────────────────────── */

// Shared-key fetcher for the project aggregate: auth headers + explicit 404
// handling (a {notFound:true} sentinel instead of a thrown error) so the
// error / not-found render states stay distinct.
const overviewFetcher = async (url: string) => {
  const auth = await getAuthHeaders();
  const r = await fetch(url, { headers: auth });
  if (r.status === 404) return { notFound: true };
  if (!r.ok) {
    let msg = '';
    try { const body = await r.json(); msg = body?.error || body?.message || ''; } catch { /* non-JSON body */ }
    console.error('load project overview failed', r.status, msg);
    throw new Error(msg || 'Request failed');
  }
  const d = await r.json();
  if (!d?.project) return { notFound: true };
  return d;
};

// Existing list route (GET /api/projects/[id]/inspections). A failure is
// thrown so the Coming Up panel can say "couldn't load", never "none".
const inspectionsFetcher = async (url: string): Promise<any[]> => {
  const auth = await getAuthHeaders();
  const r = await fetch(url, { headers: auth });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error || `Request failed (${r.status})`);
  return Array.isArray(body?.inspections) ? body.inspections : [];
};

/* ── Formatting ───────────────────────────────────────────────────────── */

const fmt = (n: number | null | undefined) => '$' + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtPct = (a: number | null | undefined, b: number | null | undefined) => (b ?? 0) > 0 ? (((a ?? 0) / (b as number)) * 100).toFixed(1) + '%' : '0%';
const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/* 'T12:00:00' keeps a date-only value on its own day in every US time zone. */
const asDate = (ymd: string) => new Date(String(ymd).slice(0, 10) + 'T12:00:00');
const fmtShort = (ymd?: string | null) => ymd ? asDate(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
const daysFrom = (fromYmd: string, toYmd: string) => Math.round((asDate(toYmd).getTime() - asDate(fromYmd).getTime()) / 86400000);
const titleCase = (x: string) => x.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const sentence = (x: string) => { const t = String(x || '').replace(/_/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : t; };
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/* The status list /api/project-context counts as "open" — matched here so the
   numbers on this page agree with every screen that reads the snapshot. */
const OPEN_STATUSES = ['open', 'pending', 'submitted', 'in_review', 'draft'];

/* ── Types ────────────────────────────────────────────────────────────── */

type MetricState = 'ok' | 'empty' | 'loading' | 'failed';
interface Metric {
  key: string; label: string; value: string; state: MetricState;
  basis: string; href: string; tone?: 'bad' | 'warn';
}

type Tier = 'critical' | 'overdue' | 'decision' | 'open' | 'info';
const TIER: Record<Tier, { label: string; tone: BadgeTone; rank: number }> = {
  critical: { label: 'Critical', tone: 'overdue', rank: 0 },
  overdue:  { label: 'Overdue', tone: 'overdue', rank: 1 },
  decision: { label: 'Decision', tone: 'under_contract', rank: 2 },
  open:     { label: 'Open', tone: 'neutral', rank: 3 },
  info:     { label: 'Heads Up', tone: 'neutral', rank: 4 },
};
interface WorkItem {
  id: string; tier: Tier; title: string; meta: string[];
  href: string; actionLabel: string; sortDate?: string | null;
}

interface UpcomingEntry { id: string; date: string; kind: string; title: string; meta?: string; href: string }

/* ── Pieces ───────────────────────────────────────────────────────────── */

function MetricTile({ m }: { m: Metric }) {
  // Compact kit tile: small label, prominent tabular value, one supporting line.
  // Missing data stays honest: "Not set" / "None yet" render muted, never as a number.
  const tone = m.tone === 'bad' ? 'bad' : m.tone === 'warn' ? 'warn' : 'default';
  const muted = m.state !== 'ok';
  return (
    <Link href={m.href} className="k-stat" data-tone={tone} aria-busy={m.state === 'loading' || undefined}>
      <span className="k-stat-top"><span className="k-stat-label">{m.label}</span></span>
      {m.state === 'loading'
        ? <span className="pov-skel pov-skel-line" style={{ width: '60%', height: 26 }} aria-label="Loading" />
        : <span className="k-stat-value" data-muted={muted ? 'true' : undefined}>{m.state === 'failed' ? 'Couldn\u2019t load' : m.value}</span>}
      <span className="k-stat-sub">{m.basis}</span>
    </Link>
  );
}

function payAppTone(status: string): BadgeTone {
  const s = String(status || '').toLowerCase();
  if (s === 'paid') return 'ongoing';
  if (s === 'rejected' || s === 'void' || s === 'voided') return 'overdue';
  if (s === 'approved' || s === 'certified') return 'under_contract';
  if (s === 'submitted' || s === 'sent' || s === 'in_review') return 'lead';
  return 'neutral';
}

function Section({ id, title, action, children, className }: { id: string; title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`pov-card pov-pad ${className || ''}`} aria-labelledby={id}>
      <div className="pov-sechead">
        <h2 id={id}>{title}</h2>
        {action ? <div className="pov-secactions">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

const SecLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="pov-seclink">{children} <ArrowRight size={13} weight="bold" /></Link>
);

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function OverviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showAllWork, setShowAllWork] = useState(false);

  // One SWR key per resource (W-2): '/api/projects/'+projectId is the same
  // cache entry the project sidebar header reads — opening a project costs a
  // single aggregate request, and a revisit paints instantly from cache.
  const { data: swrData, error: loadError, isLoading, mutate: revalidate } = useSWR<any>(
    projectId ? '/api/projects/' + projectId : null,
    overviewFetcher,
    { revalidateOnFocus: false, keepPreviousData: true }
  );
  const notFound = !!swrData?.notFound;
  const data = notFound ? null : (swrData ?? null);
  const loading = isLoading && !swrData;
  const error = loadError ? humanError(loadError, 'Network error. Check your connection and try again.') : '';
  const load = () => { revalidate(); };

  // Project-context snapshot — counts, schedule pulse, bid/proposal state and
  // recent activity. Its own loading / failed states are shown where used.
  const { ctx, loading: ctxLoading, error: ctxError, revalidate: revalidateCtx } = useProjectContext(projectId);
  const ctxState: 'ok' | 'loading' | 'failed' = ctx ? 'ok' : ctxError ? 'failed' : ctxLoading ? 'loading' : 'failed';

  const { data: inspections, error: inspError, isLoading: inspLoading, mutate: revalidateInsp } = useSWR<any[]>(
    projectId && data?.project ? `/api/projects/${projectId}/inspections` : null,
    inspectionsFetcher,
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  async function runAutopilot() {
    setScanning(true); setScanMsg(null);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch('/api/autopilot/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) throw new Error('Scan failed');
      const json = await res.json();
      setScanMsg({ ok: true, text: json.summary || 'Autopilot scan complete.' });
      // Refresh data to pick up new alerts
      await revalidate();
    } catch (e) {
      console.error('autopilot scan failed', e);
      setScanMsg({ ok: false, text: 'Scan failed. Please try again.' });
    } finally { setScanning(false); }
  }

  const css = <style dangerouslySetInnerHTML={{ __html: CSS }} />;

  // LOADING — skeleton placeholders, never computed zeros or an empty state.
  if (loading) return (
    <div className="pov" aria-busy="true" aria-label="Loading project">
      {css}
      <div className="pov-header">
        <div style={{ minWidth: 0, flex: 1 }}>
          <span className="pov-skel pov-skel-line" style={{ width: 280, maxWidth: '80%', height: 30, marginBottom: 10 }} />
          <span className="pov-skel pov-skel-line" style={{ width: 220, maxWidth: '60%', height: 14 }} />
        </div>
      </div>
      <div className="pov-stack">
        <div className="pj-metrics">{[0, 1, 2, 3].map(i => <div key={i} className="k-stat pov-skel" style={{ height: 96 }} />)}</div>
        <div className="pov-primary"><div className="pov-card pov-skel" style={{ height: 340 }} /><div className="pov-card pov-skel" style={{ height: 340 }} /></div>
      </div>
    </div>
  );

  // ERROR — fetch threw / network failure / non-2xx (not a 404). Clear block + Retry.
  if (error) return (
    <div className="pov">
      {css}
      <div className="pov-card pov-pad pov-state" role="alert">
        <EmptyState
          icon={<WarningCircle size={34} weight="duotone" color="var(--status-overdue, #FF3B30)" />}
          title="Couldn't Load Project"
          text={error}
          action={<button type="button" className="pov-btn pov-btn-ghost" onClick={load}><ArrowClockwise size={14} /> Retry</button>}
        />
      </div>
    </div>
  );

  // NOT FOUND — true 404 (or success with no project). Distinct from a load error.
  if (notFound || !data?.project) return (
    <div className="pov">
      {css}
      <div className="pov-card pov-pad pov-state">
        <EmptyState
          icon={<FolderOpen size={34} weight="duotone" color="var(--brand-primary)" />}
          title="Project Not Found"
          text="This project doesn't exist or you don't have access to it."
          action={<Link href="/app/projects" className="pov-btn pov-btn-ghost">Back to Projects</Link>}
        />
      </div>
    </div>
  );

  /* ── Derived data (same math the page always used) ── */
  const p = data.project;
  const payApps = (data.payApps || []) as any[];
  const changeOrders = (data.changeOrders || []) as any[];
  const rfis = (data.rfis || []) as any[];
  const subs = (data.subs || []) as any[];
  const budgetHealth = data.budgetHealth || { originalBudget: 0, revisedBudget: 0, approvedChanges: 0, committedCost: 0, actualCost: 0, forecastCost: 0, lineCount: 0 };
  const punchSummary = data.punchSummary || { total: 0, open: 0, complete: 0 };
  const schedulePhases = (data.schedulePhases || []) as any[];
  const alerts = (data.alerts || []) as any[];

  const contractSummary = summarizeContract(toCents(p.contract_amount || 0), changeOrders.map((c: any) => ({ id: String(c.id ?? ''), description: String(c.description ?? ''), amount: toCents(c.cost_impact || 0), status: c.status })));
  const approvedCOs = toDollars(contractSummary.approvedChangeOrders);
  const contractToDate = toDollars(contractSummary.revisedContract);
  const billedToDateCents = payApps.length > 0 ? toCents(payApps[0].total_completed_and_stored || 0) : 0;
  const billedToDate = toDollars(billedToDateCents);
  const paidApps = payApps.filter((pa: any) => pa.status === 'paid');
  const paidToDateCents = sumCents(paidApps.map((pa: any) => toCents(pa.current_payment_due || 0)));
  const paidToDate = toDollars(paidToDateCents);
  const retainageHeldCents = sumCents(payApps.map((pa: any) => toCents(pa.retainage_amount || 0)));
  const retainageHeld = toDollars(retainageHeldCents);
  const balanceDueCents = subCents(subCents(billedToDateCents, retainageHeldCents), paidToDateCents);
  const balanceDue = Math.max(0, toDollars(balanceDueCents));
  const today = localIso(new Date());
  const daysRemaining = p.end_date ? daysFrom(today, String(p.end_date)) : null;

  /* Judge spend against the REVISED budget — the original plus every approved
     change order — not against the original alone. Measuring against the
     original made any job carrying an approved CO read as over budget. Falls
     back to the original where the API predates the field. */
  const budgetBasis = Number(budgetHealth.revisedBudget) || Number(budgetHealth.originalBudget) || 0;
  const budgetVariance = toDollars(subCents(toCents(budgetHealth.forecastCost), toCents(budgetBasis)));
  const budgetPct = budgetBasis > 0 ? (budgetHealth.actualCost / budgetBasis * 100).toFixed(1) : '0';

  // Context-snapshot values (DB numerics can round-trip as strings — always Number()||0 before math)
  const cm = ctx?.money;
  const ctxRevised = Number(cm?.revisedContract) || 0;
  const ctxBilled = Number(cm?.billedToDate) || 0;
  const ctxPaid = Number(cm?.paidToDate) || 0;
  const ctxCoTotal = Number(cm?.approvedCoTotal) || 0;
  const ctxLastApp = cm?.lastPayApp || null;
  const heroContract = contractToDate > 0 ? contractToDate : ctxRevised;
  const heroBilled = billedToDate > 0 ? billedToDate : ctxBilled;
  const heroPaid = paidToDate > 0 ? paidToDate : ctxPaid;
  const coShown = approvedCOs > 0 ? approvedCOs : ctxCoTotal;
  const openSubmittalCount = Number(ctx?.counts?.openSubmittals) || 0;
  const openPunchCount = Number(ctx?.counts?.openPunch) || punchSummary.open || 0;
  const criticalTasks = Number(ctx?.schedule?.criticalCount) || 0;
  const invoiceCount = Number(ctx?.counts?.invoices) || 0;
  const billCount = Number(ctx?.counts?.bills) || 0;
  const poCount = Number(ctx?.counts?.purchaseOrders) || 0;
  const moneyDocCount = invoiceCount + billCount + poCount;
  const lastLogDate = ctx?.recent?.lastDailyLogDate ? String(ctx.recent.lastDailyLogDate).slice(0, 10) : null;
  const logAgeDays = lastLogDate ? Math.max(0, daysFrom(lastLogDate, today)) : null;

  const closed = isClosedStatus(p.status);
  const phase = normalisePhase(p.phase);
  const stage: 'bidding' | 'building' | 'closed' = closed ? 'closed' : phase === 'bidding' ? 'bidding' : 'building';
  const base = '/app/projects/' + projectId;

  const openRfis = rfis.filter((r: any) => OPEN_STATUSES.includes(String(r.status || 'open')));
  const isOverdueRfi = (r: any) => !!r.due_date && String(r.due_date).slice(0, 10) < today;
  const overdueRfis = openRfis.filter(isOverdueRfi);
  const rfiOwner = (r: any) => String(r.ball_in_court || r.assigned_to_name || '').trim();
  const rfiTitle = (r: any) => `RFI${r.rfi_number != null ? ' #' + r.rfi_number : ''}: ${r.subject || r.question || 'Untitled'}`;

  /* ── Metrics: four, chosen by where the job is ── */
  const noPayApps = payApps.length === 0 && !ctxLastApp;
  const rfiMetric: Metric = {
    key: 'rfis', label: 'Open RFIs', href: `${base}/rfis`,
    value: String(openRfis.length), state: 'ok',
    tone: overdueRfis.length > 0 ? 'bad' : undefined,
    basis: overdueRfis.length > 0 ? `${overdueRfis.length} past due · respond first` : openRfis.length > 0 ? 'None past due' : 'All RFIs answered or closed',
  };
  const contractMetric: Metric = heroContract > 0
    ? { key: 'contract', label: 'Contract to Date', href: `${base}/contracts`, value: fmt(heroContract), state: 'ok', basis: coShown > 0 ? `Original plus ${fmt(coShown)} in approved COs` : 'Original contract · no approved COs' }
    : { key: 'contract', label: 'Contract to Date', href: `${base}/contracts`, value: 'Not set', state: 'empty', basis: 'No contract sum on this job yet' };
  const billedMetric: Metric = noPayApps
    ? { key: 'billed', label: 'Billed to Date', href: `${base}/pay-apps`, value: 'None yet', state: 'empty', basis: 'No pay applications on this job' }
    : { key: 'billed', label: 'Billed to Date', href: `${base}/pay-apps`, value: fmt(heroBilled), state: 'ok', basis: `${fmtPct(heroBilled, heroContract)} of contract · latest pay app` };
  const balanceMetric: Metric = payApps.length === 0
    ? { key: 'balance', label: 'Balance Due', href: `${base}/pay-apps`, value: 'None yet', state: 'empty', basis: 'Nothing billed yet' }
    : { key: 'balance', label: 'Balance Due', href: `${base}/pay-apps`, value: fmt(balanceDue), state: 'ok', tone: balanceDue > 0 ? 'warn' : undefined, basis: `Billed less retainage and paid · ${fmt(retainageHeld)} retainage held` };
  const ctxMetric = (key: string, label: string, href: string, build: () => Omit<Metric, 'key' | 'label' | 'href'>): Metric =>
    ctxState === 'ok' ? { key, label, href, ...build() }
      : { key, label, href, value: '', state: ctxState === 'loading' ? 'loading' : 'failed', basis: ctxState === 'loading' ? 'Loading…' : 'The job snapshot did not load' };

  let metrics: Metric[];
  if (stage === 'bidding') {
    metrics = [
      ctxMetric('bidprice', 'Bid Price', `${base}/takeoff`, () => {
        const t = ctx?.takeoff;
        const sell = Number(t?.sellTotal) || 0;
        return t?.completed && sell > 0
          ? { value: fmt(sell), state: 'ok', basis: `From the priced takeoff${Number(t?.sheets) ? ` · ${plural(Number(t.sheets), 'sheet')}` : ''}` }
          : { value: 'Not priced', state: 'empty', basis: Number(t?.count) > 0 ? 'Takeoff started, not complete' : 'No takeoff on this job yet' };
      }),
      ctxMetric('proposal', 'Proposal', `${base}/proposal`, () => {
        const pr = ctx?.proposal;
        if (pr?.accepted) return { value: fmt(Number(pr.accepted.amount) || 0), state: 'ok', basis: `Accepted${pr.accepted.version ? ` · ${pr.accepted.version}` : ''}` };
        if (pr?.latest) return { value: fmt(Number(pr.latest.amount) || 0), state: 'ok', basis: `${titleCase(String(pr.latest.status || 'draft'))}${pr.latest.version ? ` · ${pr.latest.version}` : ''} · ${plural(Number(pr.count) || 1, 'version')}` };
        return { value: 'None yet', state: 'empty', basis: 'No proposal sent on this job' };
      }),
      ctxMetric('packages', 'Bid Packages Out', `${base}/bid-packages`, () => {
        const pk = (ctx?.bidPackages || []) as any[];
        const sent = pk.filter(b => Number(b.invitedCount) > 0).length;
        const invites = pk.reduce((s, b) => s + (Number(b.invitedCount) || 0), 0);
        return pk.length === 0
          ? { value: 'None yet', state: 'empty', basis: 'No bid packages on this job' }
          : { value: `${sent} of ${pk.length}`, state: 'ok', tone: sent < pk.length ? 'warn' : undefined, basis: `${plural(invites, 'sub invite')} sent` };
      }),
      rfiMetric,
    ];
  } else if (stage === 'closed') {
    metrics = [
      payApps.length === 0
        ? { key: 'retainage', label: 'Retainage Held', href: `${base}/pay-apps`, value: 'None', state: 'empty', basis: 'No pay applications on this job' }
        : { key: 'retainage', label: 'Retainage Held', href: `${base}/pay-apps`, value: fmt(retainageHeld), state: 'ok', tone: retainageHeld > 0 ? 'warn' : undefined, basis: `${p.retainage_percent || 10}% retained across ${plural(payApps.length, 'pay app')}` },
      balanceMetric,
      { key: 'punch', label: 'Open Punch', href: `${base}/punch-list`, value: String(punchSummary.open), state: 'ok', tone: punchSummary.open > 0 ? 'bad' : undefined, basis: punchSummary.total > 0 ? `${punchSummary.complete} of ${punchSummary.total} closed` : 'No punch items logged' },
      contractMetric,
    ];
  } else {
    metrics = [contractMetric, billedMetric, balanceMetric, rfiMetric];
  }

  /* ── Needs Attention: ranked, every row opens the record that resolves it ── */
  const work: WorkItem[] = [];
  for (const a of alerts) {
    const sev = String(a.severity || '').toLowerCase();
    work.push({
      id: 'alert:' + a.id, tier: sev === 'critical' || sev === 'high' ? 'critical' : 'info',
      title: sentence(String(a.title || a.alert_type || 'Autopilot alert')),
      meta: [a.message ? String(a.message) : '', `Flagged ${fmtShort(a.created_at)}`].filter(Boolean),
      href: `${base}/autopilot`, actionLabel: 'Review', sortDate: String(a.created_at || '').slice(0, 10),
    });
  }
  if (ctxState === 'ok' && criticalTasks > 0) {
    work.push({ id: 'critical', tier: 'critical', title: `${plural(criticalTasks, 'critical-path task')} open`, meta: ['A slip here moves the finish date'], href: `${base}/schedule`, actionLabel: 'Open Schedule' });
  }
  for (const r of overdueRfis) {
    const late = daysFrom(String(r.due_date).slice(0, 10), today);
    work.push({
      id: 'rfi:' + r.id, tier: 'overdue', title: rfiTitle(r),
      meta: [rfiOwner(r) || 'No one assigned', `Due ${fmtShort(r.due_date)}`, `${plural(late, 'day')} late`],
      href: `${base}/rfis`, actionLabel: 'Respond', sortDate: String(r.due_date).slice(0, 10),
    });
  }
  const lateTasks = schedulePhases.filter((t: any) => t.status !== 'complete' && t.planned_end && String(t.planned_end).slice(0, 10) < today);
  if (stage !== 'bidding' && lateTasks.length > 0) {
    work.push({ id: 'late-tasks', tier: 'overdue', title: `${plural(lateTasks.length, 'schedule task')} past the end date`, meta: [lateTasks.slice(0, 2).map((t: any) => t.name).join(', ') + (lateTasks.length > 2 ? ` and ${lateTasks.length - 2} more` : '')], href: `${base}/schedule`, actionLabel: 'Update Schedule' });
  }
  const pendingCos = changeOrders.filter((c: any) => OPEN_STATUSES.includes(String(c.status || '')));
  if (pendingCos.length > 0) {
    const pendingTotal = toDollars(sumCents(pendingCos.map((c: any) => toCents(c.cost_impact || 0))));
    work.push({ id: 'cos', tier: 'decision', title: `${plural(pendingCos.length, 'change order')} pending decision`, meta: [`${pendingTotal < 0 ? '−' : ''}${fmt(Math.abs(pendingTotal))} in play`], href: `${base}/change-orders`, actionLabel: 'Review' });
  }
  if (stage !== 'bidding' && payApps[0] && String(payApps[0].status || '').toLowerCase() === 'draft') {
    const pa = payApps[0];
    work.push({ id: 'payapp:' + pa.id, tier: 'decision', title: `Pay App #${pa.app_number ?? ''} is still a draft`, meta: [pa.period_to ? `Period to ${fmtShort(pa.period_to)}` : 'No period set', 'Not sent to the owner'], href: `${base}/pay-apps/${pa.id}`, actionLabel: 'Open Pay App' });
  }
  for (const r of openRfis.filter((r: any) => !isOverdueRfi(r))) {
    work.push({
      id: 'rfi:' + r.id, tier: 'open', title: rfiTitle(r),
      meta: [rfiOwner(r) || 'No one assigned', r.due_date ? `Due ${fmtShort(r.due_date)}` : 'No due date'],
      href: `${base}/rfis`, actionLabel: 'Open', sortDate: r.due_date ? String(r.due_date).slice(0, 10) : null,
    });
  }
  if (ctxState === 'ok' && openSubmittalCount > 0) {
    work.push({ id: 'submittals', tier: 'open', title: `${plural(openSubmittalCount, 'submittal')} open`, meta: ['Awaiting review or resubmission'], href: `${base}/submittals`, actionLabel: 'Open Submittals' });
  }
  if (openPunchCount > 0 && stage !== 'closed') {
    work.push({ id: 'punch', tier: 'open', title: `${plural(openPunchCount, 'punch item')} open`, meta: [punchSummary.complete > 0 ? `${punchSummary.complete} closed to date` : 'None closed yet'], href: `${base}/punch-list`, actionLabel: 'Open Punch List' });
  }
  if (stage === 'building' && ctxState === 'ok' && (logAgeDays == null || logAgeDays > 3)) {
    work.push({ id: 'dailylog', tier: 'info', title: logAgeDays == null ? 'No daily logs yet' : `Last daily log was ${plural(logAgeDays, 'day')} ago`, meta: [lastLogDate ? `Filed ${fmtShort(lastLogDate)}` : 'Field history builds the claim file'], href: `${base}/daily-logs`, actionLabel: 'Log Today' });
  }
  work.sort((a, b) => TIER[a.tier].rank - TIER[b.tier].rank || String(a.sortDate || '9999').localeCompare(String(b.sortDate || '9999')));
  const workShown = showAllWork ? work : work.slice(0, 7);

  /* ── Coming Up: unfinished schedule tasks by end date + scheduled inspections ── */
  const upcoming: UpcomingEntry[] = [];
  for (const t of schedulePhases) {
    const end = t.planned_end ? String(t.planned_end).slice(0, 10) : '';
    if (!end || end < today || t.status === 'complete') continue;
    upcoming.push({ id: 'task:' + t.id, date: end, kind: 'Task Due', title: t.name || 'Untitled task', meta: t.status ? titleCase(String(t.status)) : undefined, href: `${base}/schedule` });
  }
  for (const r of (inspections || [])) {
    const date = String(r.date ?? r.scheduled_date ?? '').slice(0, 10);
    const status = String(r.status ?? '');
    if (!date || date < today || !/sched/i.test(status)) continue;
    const inspector = String(r.inspector ?? r.inspector_name ?? '').trim();
    upcoming.push({ id: 'insp:' + r.id, date, kind: 'Inspection', title: String(r.type ?? r.inspection_type ?? 'Inspection'), meta: inspector || undefined, href: `${base}/inspections` });
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  const upcomingGroups: [string, UpcomingEntry[]][] = [];
  for (const e of upcoming.slice(0, 10)) {
    const g = upcomingGroups.find(x => x[0] === e.date);
    if (g) g[1].push(e); else upcomingGroups.push([e.date, [e]]);
  }
  const dayLabel = (d: string) => {
    if (d === today) return 'Today';
    const diff = daysFrom(today, d);
    if (diff === 1) return 'Tomorrow';
    return asDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  /* ── Header ── */
  const stageBadge: { label: string; tone: BadgeTone } = stage === 'closed' ? { label: 'Closed', tone: 'closed' } : stage === 'bidding' ? { label: 'Bidding', tone: 'lead' } : { label: 'Building', tone: 'ongoing' };
  const primary = stage === 'closed'
    ? { href: `${base}/closeout`, label: 'Open Closeout', icon: <ArrowRight size={15} weight="bold" /> }
    : stage === 'bidding'
      ? { href: `${base}/takeoff`, label: 'Open Takeoff', icon: <ArrowRight size={15} weight="bold" /> }
      : { href: `${base}/pay-apps/new`, label: 'New Pay App', icon: <Plus size={15} weight="bold" /> };

  const detailRows: [string, React.ReactNode][] = [
    ['Status', titleCase(String(p.status || 'active'))],
    ['Type', p.project_type ? titleCase(String(p.project_type)) : '—'],
    ['Owner', p.owner_entity?.name || p.owner_name || '—'],
    ['Architect', p.architect_entity?.name || p.architect_name || '—'],
    ['Start Date', p.start_date ? fmtShort(p.start_date) + ', ' + String(p.start_date).slice(0, 4) : '—'],
    ['End Date', p.end_date ? fmtShort(p.end_date) + ', ' + String(p.end_date).slice(0, 4) : '—'],
    ['State', p.state || '—'],
    ['GC License', p.gc_license || '—'],
    ['Prevailing Wage', p.prevailing_wage ? 'Yes' : 'No'],
    ['Public Project', p.is_public_project ? 'Yes' : 'No'],
  ];
  const moneyRows: [string, string, string?][] = [
    ['Original Contract', fmt(Number(p.original_contract) || Number(p.contract_amount) || Number(cm?.originalContract) || 0)],
    ['Change Orders', (coShown < 0 ? '−' : '+') + fmt(Math.abs(coShown))],
    ['Contract to Date', fmt(heroContract)],
    ['Billed to Date', fmt(heroBilled) + ' (' + fmtPct(heroBilled, heroContract) + ')'],
    ['Retainage Held', fmt(retainageHeld)],
    ['Total Paid', fmt(heroPaid), paidApps.length ? plural(paidApps.length, 'payment') : undefined],
    ['Balance Due', fmt(balanceDue)],
  ];

  return (
    <div className="pov">
      {css}

      <ProjectHeader
        name={String(p.name || 'Untitled job')}
        number={p.project_number || p.number || null}
        status={stageBadge}
        project={p}
        dateText={p.end_date
          ? <>Finish {fmtShort(p.end_date)}{!closed && daysRemaining != null ? (daysRemaining >= 0 ? ` \u00B7 ${plural(daysRemaining, 'day')} left` : ` \u00B7 ${plural(-daysRemaining, 'day')} over`) : ''}</>
          : 'No end date set'}
        dateTone={!closed && daysRemaining != null ? (daysRemaining < 0 ? 'bad' : daysRemaining < 14 ? 'warn' : undefined) : undefined}
        /* Quick action, secondary: NextAction below holds the page's ONE primary button. */
        actions={[{ href: primary.href, label: primary.label, icon: primary.icon }]}
      />

      <div className="pov-stack">
        {/* ONE path, not two — the journey is the whole job, project through
            to payment. Compact here: it folds once the job is moving and its
            Next link is outlined so the header keeps the only filled action. */}
        <NextAction projectId={projectId} />

        {scanMsg && (
          <div className={scanMsg.ok ? 'pov-banner pov-banner-ok' : 'pov-banner pov-banner-bad'} role="status">
            {scanMsg.ok ? <CheckCircle size={16} weight="fill" /> : <XCircle size={16} weight="fill" />} {scanMsg.text}
          </div>
        )}

        <div className="pj-metrics">{metrics.map((m) => <MetricTile key={m.key} m={m} />)}</div>

        <div className="pov-primary">
          <Section
            id="pov-needs"
            title="Needs Attention"
            action={alerts.length > 0 ? (
              <>
                <button type="button" onClick={runAutopilot} disabled={scanning} className="pov-linkbtn">{scanning ? 'Scanning…' : 'Re-Scan'}</button>
                <SecLink href={`${base}/autopilot`}>All Alerts</SecLink>
              </>
            ) : undefined}
          >
            {ctxState === 'failed' && (
              <div className="pov-warn" role="status">
                <WarningCircle size={15} weight="fill" /> Couldn&apos;t load submittals, punch and critical-path counts. RFIs, change orders and pay apps below are current.
                <button type="button" className="pov-linkbtn" onClick={() => { void revalidateCtx(); }}>Retry</button>
              </div>
            )}
            {work.length === 0 ? (
              <p className="pov-empty">{ctxState === 'loading' ? 'Checking the rest of this job…' : 'Nothing on this job needs attention right now.'}</p>
            ) : (
              <ul className="pov-qlist">
                {workShown.map(it => (
                  <li key={it.id} className="pov-qrow">
                    <span className="pov-tier"><Badge tone={TIER[it.tier].tone}>{TIER[it.tier].label}</Badge></span>
                    <div className="pov-qmain">
                      <div className="pov-qtitle">{it.title}</div>
                      {it.meta.length > 0 && <div className="pov-qmeta">{it.meta.map((m, i) => <span key={i}>{m}</span>)}</div>}
                    </div>
                    <Link href={it.href} className="pov-btn pov-btn-ghost pov-qbtn">{it.actionLabel} <ArrowRight size={13} weight="bold" /></Link>
                  </li>
                ))}
              </ul>
            )}
            {work.length > 7 && (
              <button type="button" className="pov-more" onClick={() => setShowAllWork(v => !v)}>
                {showAllWork ? 'Show fewer' : `Show all ${work.length}`}
              </button>
            )}
          </Section>

          <Section
            id="pov-upcoming"
            title="Coming Up"
            action={<><SecLink href={`${base}/schedule`}>Full Schedule</SecLink><SecLink href={`${base}/inspections`}>Inspections</SecLink></>}
          >
            {inspError && (
              <div className="pov-warn" role="status">
                <WarningCircle size={15} weight="fill" /> Couldn&apos;t load inspections. Schedule tasks below are current.
                <button type="button" className="pov-linkbtn" onClick={() => { void revalidateInsp(); }}>Retry</button>
              </div>
            )}
            {upcomingGroups.length === 0 ? (
              <p className="pov-empty">
                {inspLoading && !inspections ? 'Loading inspections…'
                  : schedulePhases.length === 0
                    ? <>No schedule yet. <Link href={`${base}/schedule`} className="pov-inline">Build the schedule</Link> and upcoming tasks show here.</>
                    : 'No open tasks or scheduled inspections ahead. Update the schedule to keep this lookahead live.'}
              </p>
            ) : (
              <div className="pov-sched">
                {upcomingGroups.map(([date, list]) => (
                  <div key={date}>
                    <div className="pov-sday">{dayLabel(date)}</div>
                    <ul className="pov-slist">
                      {list.map(e => (
                        <li key={e.id}>
                          <Link href={e.href} className="pov-srow pov-link">
                            <span className="pov-skind">{e.kind}</span>
                            <span className="pov-stext">
                              <span className="pov-stitle">{e.title}</span>
                              {e.meta && <span className="pov-smeta">{e.meta}</span>}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {upcoming.length > 10 && <p className="pov-dim">{upcoming.length - 10} more on the schedule</p>}
              </div>
            )}
          </Section>
        </div>

        {/* The phase table — bid packages while chasing it, pay apps after. */}
        {stage === 'bidding' ? (
          <Section id="pov-table" title="Bid Packages" action={<SecLink href={`${base}/bid-packages`}>All Bid Packages</SecLink>}>
            {ctxState === 'loading' ? (
              <div className="pov-skel" style={{ height: 120, borderRadius: 10 }} aria-label="Loading bid packages" />
            ) : ctxState === 'failed' ? (
              <p className="pov-empty">Couldn&apos;t load bid packages. <button type="button" className="pov-linkbtn" onClick={() => { void revalidateCtx(); }}>Retry</button></p>
            ) : ((ctx?.bidPackages || []) as any[]).length === 0 ? (
              <p className="pov-empty">No bid packages yet. <Link href={`${base}/bid-packages`} className="pov-inline">Create one</Link> to send the scope to subs.</p>
            ) : (
              <div className="pov-tablewrap" role="region" aria-label="Bid packages (scrolls sideways on small screens)" tabIndex={0}>
                <table className="pov-table">
                  <thead><tr><th>Package</th><th>Trade</th><th>Status</th><th className="num">Invited</th><th className="num">Awarded</th></tr></thead>
                  <tbody>
                    {((ctx?.bidPackages || []) as any[]).slice(0, 12).map((b: any) => (
                      <tr key={b.id}>
                        <td><Link href={`${base}/bid-packages/${b.id}`} className="pov-tlink">{b.name || 'Untitled package'}</Link></td>
                        <td>{b.trade || '—'}</td>
                        <td><Badge tone={String(b.status || '').toLowerCase() === 'awarded' ? 'under_contract' : 'neutral'}>{titleCase(String(b.status || 'draft'))}</Badge></td>
                        <td className="num">{Number(b.invitedCount) || 0}</td>
                        <td className="num">{Number(b.awardedAmount) > 0 ? fmt(Number(b.awardedAmount)) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        ) : (
          <Section id="pov-table" title="Pay Applications" action={<SecLink href={`${base}/pay-apps`}>All Pay Apps</SecLink>}>
            {payApps.length === 0 ? (
              <p className="pov-empty">No pay applications yet. Billing starts with App #1.</p>
            ) : (
              <div className="pov-tablewrap" role="region" aria-label="Pay applications (scrolls sideways on small screens)" tabIndex={0}>
                <table className="pov-table">
                  <thead><tr><th>App</th><th>Period To</th><th>Status</th><th className="num">Completed &amp; Stored</th><th className="num">Retainage</th><th className="num">Amount Due</th></tr></thead>
                  <tbody>
                    {payApps.slice(0, 8).map((pa: any) => (
                      <tr key={pa.id}>
                        <td><Link href={`${base}/pay-apps/${pa.id}`} className="pov-tlink">Pay App #{pa.app_number ?? '—'}</Link></td>
                        <td>{pa.period_to ? fmtShort(pa.period_to) + ', ' + String(pa.period_to).slice(0, 4) : '—'}</td>
                        <td><Badge tone={payAppTone(pa.status)}>{titleCase(String(pa.status || 'draft'))}</Badge></td>
                        <td className="num">{fmt(Number(pa.total_completed_and_stored) || 0)}</td>
                        <td className="num">{fmt(Number(pa.retainage_amount) || 0)}</td>
                        <td className="num">{fmt(Number(pa.current_payment_due) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {/* Ownership, details, money and people — reference, below the work. */}
        <div className="pov-lower">
          <div className="pov-col">
            <ProjectOwnershipCard projectId={projectId} project={p} onSaved={() => { void revalidate(); }} />
            <Section id="pov-details" title="Project Details">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'center', padding: '8px 0 12px', borderBottom: '1px solid var(--border-subtle)', marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-tertiary)', minWidth: 110 }}>Job color</span>
                <JobColorPicker projectId={projectId} color={p.color} onSaved={() => { void revalidate(); }} />
              </div>
              <dl className="pov-dl">
                {detailRows.map(([l, v]) => (
                  <div key={l} className="pov-dlrow"><dt>{l}</dt><dd>{v}</dd></div>
                ))}
              </dl>
            </Section>
          </div>
          <div className="pov-col">
            <Section id="pov-money" title="Contract & Billing" action={<><SecLink href={`${base}/contracts`}>Contracts</SecLink><SecLink href={`${base}/pay-apps`}>Pay Apps</SecLink></>}>
              {heroContract > 0 && (
                <div className="pov-bar" aria-label={`Billed ${fmtPct(heroBilled, heroContract)} of contract`}>
                  <div className="pov-barhead"><span>Billed {fmt(heroBilled)} of {fmt(heroContract)}</span><strong>{fmtPct(heroBilled, heroContract)}</strong></div>
                  <div className="pov-track"><div className="pov-fill" style={{ width: Math.min(100, (heroBilled / heroContract) * 100) + '%' }} /></div>
                </div>
              )}
              <dl className="pov-dl">
                {moneyRows.map(([l, v, sub]) => (
                  <div key={l} className="pov-dlrow"><dt>{l}</dt><dd className="num">{v}{sub ? <span className="pov-faint"> · {sub}</span> : null}</dd></div>
                ))}
              </dl>
            </Section>
            {budgetHealth.lineCount > 0 && (
              <Section id="pov-budget" title="Budget Health" action={<SecLink href={`${base}/budget`}>View Budget</SecLink>}>
                <div className="pov-bar">
                  <div className="pov-barhead">
                    <span>Actual vs. revised budget</span>
                    <strong style={{ color: budgetVariance > 0 ? 'var(--status-overdue, #FF3B30)' : 'var(--status-ongoing, #2CFF7A)' }}>{budgetPct}% spent</strong>
                  </div>
                  <div className="pov-track"><div className="pov-fill" style={{ width: Math.min(100, parseFloat(budgetPct)) + '%', background: parseFloat(budgetPct) > 90 ? 'var(--status-overdue, #FF3B30)' : undefined }} /></div>
                </div>
                <dl className="pov-dl">
                  {([
                    ['Original Budget', fmt(budgetHealth.originalBudget)],
                    ...(Number(budgetHealth.approvedChanges) ? [['Approved Changes', '+' + fmt(budgetHealth.approvedChanges)], ['Revised Budget', fmt(budgetBasis)]] : []),
                    ['Committed Cost', fmt(budgetHealth.committedCost)],
                    ['Actual Cost', fmt(budgetHealth.actualCost)],
                    ['Forecast', fmt(budgetHealth.forecastCost)],
                    ['Variance', fmt(Math.abs(budgetVariance)) + (budgetVariance > 0 ? ' over' : ' under')],
                  ] as [string, string][]).map(([l, v]) => (
                    <div key={l} className="pov-dlrow"><dt>{l}</dt><dd className="num" style={l === 'Variance' ? { color: budgetVariance > 0 ? 'var(--status-overdue, #FF3B30)' : 'var(--status-ongoing, #2CFF7A)' } : undefined}>{v}</dd></div>
                  ))}
                </dl>
              </Section>
            )}
            <Section id="pov-subs" title="Subcontractors" action={<SecLink href={`${base}/team`}>Manage</SecLink>}>
              {subs.length === 0 ? (
                <p className="pov-empty">No subs yet. <Link href={`${base}/team`} className="pov-inline">Add Subs</Link></p>
              ) : (
                <ul className="pov-plain">
                  {subs.slice(0, 5).map((sub: any) => (
                    <li key={sub.id} className="pov-subrow">
                      <div className="pov-stext">
                        <span className="pov-stitle">{sub.name || 'Unnamed subcontract'}</span>
                        <span className="pov-smeta">{sub.trade || 'No trade'}</span>
                      </div>
                      <span className="num pov-money">{fmt(Number(sub.contract_amount) || 0)}</span>
                      {sub.status ? <Badge tone={sub.status === 'active' ? 'ongoing' : 'neutral'}>{titleCase(String(sub.status))}</Badge> : null}
                    </li>
                  ))}
                  {subs.length > 5 && <li className="pov-dim">{subs.length - 5} more on the team page</li>}
                </ul>
              )}
            </Section>
          </div>
        </div>

        {/* Recent activity — last, compact. */}
        <Section id="pov-activity" title="Recent Activity" action={<SecLink href={`${base}/files`}>Files</SecLink>}>
          {ctxState === 'loading' ? (
            <div className="pov-skel" style={{ height: 96, borderRadius: 10 }} aria-label="Loading recent activity" />
          ) : ctxState === 'failed' ? (
            <p className="pov-empty">Couldn&apos;t load recent activity. <button type="button" className="pov-linkbtn" onClick={() => { void revalidateCtx(); }}>Retry</button></p>
          ) : (
            <ul className="pov-plain pov-activity">
              {[
                { href: `${base}/pay-apps`, title: ctxLastApp ? `Pay App #${ctxLastApp.appNumber} · ${titleCase(String(ctxLastApp.status || 'draft'))}` : 'No pay applications yet',
                  sub: ctxLastApp ? `Billed through ${fmtShort(ctxLastApp.periodTo)}` : 'Billing starts with App #1',
                  value: ctxLastApp ? fmt(Number(ctxLastApp.currentPaymentDue) || 0) : '—' },
                { href: `${base}/change-orders`, title: `${plural(Number(cm?.approvedCoCount) || 0, 'change order')} approved`,
                  sub: (Number(cm?.pendingCoCount) || 0) > 0 ? `${Number(cm?.pendingCoCount) || 0} pending decision` : 'None pending decision',
                  value: (ctxCoTotal < 0 ? '−' : '+') + fmt(Math.abs(ctxCoTotal)) },
                { href: `${base}/daily-logs`, title: lastLogDate ? 'Daily log filed' : 'No daily logs yet',
                  sub: lastLogDate ? (logAgeDays === 0 ? 'Today' : `${plural(logAgeDays || 0, 'day')} ago`) : 'Field history builds the claim file',
                  value: lastLogDate ? fmtShort(lastLogDate) : '—' },
                { href: `${base}/invoices`, title: moneyDocCount > 0 ? 'Outstanding receivable' : 'No billing documents yet',
                  sub: `${invoiceCount} invoices · ${billCount} bills · ${poCount} POs`,
                  value: fmt(Math.max(0, ctxBilled - ctxPaid)) },
              ].map(row => (
                <li key={row.href}>
                  <Link href={row.href} className="pov-arow pov-link">
                    <span className="pov-stext">
                      <span className="pov-stitle">{row.title}</span>
                      <span className="pov-smeta">{row.sub}</span>
                    </span>
                    <span className="num pov-money">{row.value}</span>
                    <ArrowRight size={13} weight="bold" className="pov-chev" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

/* No quote characters in here (tools/check-style-escapes.mjs); injected with
   dangerouslySetInnerHTML so the server and client text match. */
const CSS = `
.pov { width: 100%; max-width: none; min-width: 0; box-sizing: border-box; padding: 24px clamp(16px, 1.67vw, 32px) 64px; color: var(--text-primary); font-size: 15px; background: var(--bg-base); min-height: calc(100vh - 56px); }
.pov h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.01em; margin: 0; overflow-wrap: anywhere; }
.pov h2 { color: var(--title-color, #FFE600); font-size: 17px; font-weight: 800; margin: 0; padding-bottom: 6px; background: linear-gradient(90deg, var(--neon-yellow, #FFE600), var(--brand-primary)) left bottom / 44px 2px no-repeat; }
.pov-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 20px; }
.pov-titlewrap { min-width: 0; flex: 1 1 320px; }
.pov-titleline { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.pov-sub { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 6px; font-size: 14px; color: var(--text-secondary); }
.pov-faint { color: var(--text-tertiary); }
.pov-dim { color: var(--text-tertiary); font-size: 13px; margin: 8px 0 0; }
.pov-stack { display: flex; flex-direction: column; gap: 20px; margin-top: 18px; min-width: 0; }
.pov-card { background: var(--bg-surface); border: 1px solid var(--glass-border); border-radius: 14px; box-shadow: var(--glass-highlight); min-width: 0; }
.pov-pad { padding: 18px 20px; }
.pov-state { max-width: 640px; }
.pov-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 16px; border-radius: 10px; font-size: 14px; font-weight: 700; text-decoration: none; cursor: pointer; white-space: nowrap; border: 1px solid transparent; }
.pov-btn-primary { background: var(--brand-primary); color: var(--on-brand); }
.pov-btn-primary:hover { background: var(--brand-primary-hover); }
.pov-btn-ghost { background: var(--bg-surface-2); border-color: var(--glass-border); color: var(--text-primary); }
.pov-btn-ghost:hover { border-color: var(--border-strong); }
.pov-btn:focus-visible, .pov-link:focus-visible, .pov-linkbtn:focus-visible, .pov-seclink:focus-visible, .pov-tlink:focus-visible, .pov-more:focus-visible, .pov-inline:focus-visible, .pov-tablewrap:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
.pov-link { text-decoration: none; color: inherit; }
.pov-linkbtn { background: none; border: 0; padding: 0; color: var(--brand-primary); font-weight: 700; font-size: 13px; cursor: pointer; text-decoration: none; }
.pov-linkbtn:disabled { color: var(--text-tertiary); cursor: wait; }
.pov-seclink { display: inline-flex; align-items: center; gap: 4px; color: var(--brand-primary); font-weight: 700; font-size: 13px; text-decoration: none; white-space: nowrap; }
.pov-inline { color: var(--brand-primary); font-weight: 700; text-decoration: none; }
.pov-sechead { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; margin-bottom: 12px; }
.pov-secactions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
.pov-empty { color: var(--text-secondary); font-size: 14px; margin: 6px 0; line-height: 1.5; }
.pov-primary { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.pov-lower { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.pov-col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.pov-qlist, .pov-slist, .pov-plain { list-style: none; margin: 0; padding: 0; }
.pov-qrow { display: grid; grid-template-columns: 104px minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--border-subtle); }
.pov-qrow:first-child { border-top: 0; }
.pov-tier { justify-self: start; }
.pov-qtitle { font-size: 15px; font-weight: 650; overflow-wrap: anywhere; }
.pov-qmeta { display: flex; flex-wrap: wrap; gap: 2px 14px; margin-top: 3px; font-size: 13px; color: var(--text-tertiary); }
.pov-more { margin-top: 10px; background: none; border: 0; padding: 0; color: var(--brand-primary); font-weight: 700; font-size: 14px; cursor: pointer; min-height: 36px; }
.pov-warn { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13.5px; color: var(--status-under-contract, #FFE600); background: rgba(255,230,0,.08); border: 1px solid rgba(255,230,0,.3); border-radius: 10px; padding: 10px 14px; margin-bottom: 10px; }
.pov-banner { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; border-radius: 12px; padding: 12px 16px; }
.pov-banner-ok { color: var(--status-ongoing, #2CFF7A); background: rgba(44,255,122,.08); border: 1px solid rgba(44,255,122,.3); }
.pov-banner-bad { color: var(--status-overdue, #FF3B30); background: rgba(255,59,48,.08); border: 1px solid rgba(255,59,48,.3); }
.pov-sched { display: flex; flex-direction: column; gap: 14px; }
.pov-sday { font-size: 12.5px; font-weight: 750; color: var(--text-secondary); margin-bottom: 4px; }
.pov-srow { display: flex; gap: 10px; padding: 8px 0; border-top: 1px solid var(--border-subtle); min-height: 40px; box-sizing: border-box; }
.pov-srow:hover .pov-stitle, .pov-arow:hover .pov-stitle { color: var(--brand-primary); }
.pov-skind { flex: 0 0 84px; font-size: 12.5px; font-weight: 700; color: var(--text-secondary); padding-top: 1px; }
.pov-stext { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.pov-stitle { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.pov-smeta { font-size: 12.5px; color: var(--text-tertiary); }
.pov-tablewrap { overflow-x: auto; }
.pov-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.pov-table th { font-size: 12.5px; font-weight: 700; color: var(--text-secondary); text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--glass-border); white-space: nowrap; }
.pov-table td { padding: 11px 10px; border-bottom: 1px solid var(--border-subtle); color: var(--text-primary); vertical-align: middle; }
.pov-table tr:hover td { background: rgba(255,255,255,0.025); }
.pov-table .num, .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pov-tlink { color: var(--text-primary); font-weight: 700; text-decoration: none; white-space: nowrap; }
.pov-tlink:hover { color: var(--brand-primary); }
.pov-dl { margin: 0; }
.pov-dlrow { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; border-bottom: 1px solid var(--border-subtle); font-size: 14px; }
.pov-dlrow:last-child { border-bottom: 0; }
.pov-dlrow dt { color: var(--text-tertiary); font-weight: 600; flex-shrink: 0; }
.pov-dlrow dd { margin: 0; color: var(--text-primary); font-weight: 600; text-align: right; min-width: 0; overflow-wrap: anywhere; }
.pov-bar { margin-bottom: 12px; }
.pov-barhead { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px; font-size: 13px; color: var(--text-tertiary); margin-bottom: 7px; font-variant-numeric: tabular-nums; }
.pov-barhead strong { color: var(--text-primary); font-weight: 800; }
.pov-track { height: 8px; background: rgba(255,255,255,0.07); border-radius: 999px; overflow: hidden; }
.pov-fill { height: 100%; background: var(--brand-primary); border-radius: 999px; }
.pov-subrow { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-top: 1px solid var(--border-subtle); }
.pov-subrow:first-child { border-top: 0; }
.pov-money { font-weight: 700; color: var(--text-primary); font-size: 14px; }
.pov-activity { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 28px; }
.pov-arow { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border-subtle); min-height: 44px; box-sizing: border-box; }
.pov-chev { color: var(--text-tertiary); flex-shrink: 0; }
.pov-skel { display: block; background: linear-gradient(90deg, var(--bg-surface), var(--bg-surface-2), var(--bg-surface)); background-size: 200% 100%; animation: povsk 1.4s ease infinite; }
.pov-skel-line { border-radius: 8px; }
@keyframes povsk { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .pov-skel { animation: none; } }
@media (max-width: 1100px) {
  .pov-primary, .pov-lower { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .pov { padding: 16px 16px 48px; }
  .pov h1 { font-size: 22px; }
  .pov-header > .pov-btn { width: 100%; min-height: 44px; }
  .pov-pad { padding: 14px 16px; }
  .pov-qrow { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .pov-qbtn { min-height: 44px; justify-self: start; }
  .pov-activity { grid-template-columns: minmax(0, 1fr); }
  .pov-srow { min-height: 44px; }
  .pov-linkbtn, .pov-seclink, .pov-more, .pov-inline { min-height: 44px; display: inline-flex; align-items: center; }
  .pov-dlrow { min-height: 44px; align-items: center; box-sizing: border-box; }
  .pov-subrow { flex-wrap: wrap; }
  .pov .gsr-toggle { width: 44px !important; height: 44px !important; }
}
`;
