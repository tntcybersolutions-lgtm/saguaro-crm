'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { alertDialog } from '@/lib/ui/async-dialog';
import { useProjects } from '@/lib/hooks/useProjects';
import Link from 'next/link';
import { Skeleton } from '../../../components/ui/Skeleton';
import { WarningCircle, FileText, Clipboard, Shield, Hammer, Buildings, NotePencil, CheckCircle, Square, Receipt, Plus, MagnifyingGlass } from '@phosphor-icons/react';
import { FileTypeBadge } from '@/components/FileTypeBadge';
import { humanError } from '@/lib/errors';
import { openPdf } from '@/components/PdfViewer';
import DocumentLibrary from '@/components/documents/DocumentLibrary';
import {
  PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, IconChip,
  goldButtonStyle, goldOutlineButtonStyle,
} from '@/components/ui/premium';
import { moduleAccent } from '@/lib/module-identity';
import { docTypeLabel } from '@/lib/document-types';
import { PdfIcon } from '@/components/ui/FileTypeIcon';
import { SortableTh, usePersistedSort, useSortedRows } from '@/app/app/_shared/table-sort';
import JobDocsBoard from '@/components/documents/JobDocsBoard';
import type { JobDocs, WaiverState } from '@/lib/documents-by-job';
import { projectColor, jobDotStyle } from '@/lib/project-colors';
import { fmtMoneyShort } from '@/lib/home/rank';

const GOLD = 'var(--brand-primary)';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = 'var(--text-secondary)';
const TEXT = 'var(--text-primary)';
const GREEN = 'var(--success)';
const RED = 'var(--danger)';

const fmt = (n: number | string | null | undefined) =>
  '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// DB date (date-only or ISO) → "Mar 4, 2026". Date-only strings get a noon time
// so the local-timezone shift can never roll them back a day.
const fmtDay = (d: string | null | undefined) =>
  d ? new Date(String(d).includes('T') ? d : `${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

function Badge({ label, color = 'var(--text-secondary)', bg = 'rgba(163,172,187,.12)' }: { label: string; color?: string; bg?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700, padding: '2px 9px',
      borderRadius: 999, background: bg, color, border: `1px solid color-mix(in srgb, ${color} 50%, transparent)`, whiteSpace: 'nowrap',
    }}>{label ? String(label).replace(/_/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase()) : label}</span>
  );
}

// In-table error row: a clear failure state with a Retry action, visually
// distinct from the genuine empty state. Used when a list fetch fails or 404s.
function ErrorRow({ colSpan, message, onRetry }: { colSpan: number; message: string; onRetry: () => void }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0 }}>
        <PremiumEmpty
          tone="error"
          compact
          icon={<WarningCircle size={30} weight="duotone" color={RED} />}
          title={message}
          description="Your data is safe — try again."
          action={<button onClick={onRetry} style={goldOutlineButtonStyle} className="pmBtn">Retry</button>}
        />
      </td>
    </tr>
  );
}

// Skeleton placeholder rows shown while a list fetch is in flight — never
// computed zeros or an empty state during loading.
function SkeletonRows({ rows = 4, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} style={{ borderBottom: `1px solid rgba(255,255,255,0.08)` }}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} style={{ padding: '12px 16px' }}>
              <Skeleton height={14} width={c === 0 ? '50%' : '70%'} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/* lien_waivers.waiver_type values → words ("conditional_progress" → "Conditional · Progress"). */
const waiverTypeLabel = (t: string | null | undefined) => {
  const v = String(t || '').toLowerCase();
  if (!v) return '—';
  const [kind, stage] = v.split('_');
  const cap = (x?: string) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : '');
  return stage ? `${cap(kind)} · ${cap(stage)}` : cap(kind);
};

/* Who signs a waiver: the sub's company when it's linked, else the claimant on the waiver. */
const waiverParty = (lw: any) =>
  lw?.subcontractors?.company_name ?? lw?.company_name ?? lw?.claimant_name ?? lw?.subName ?? lw?.sub_name ?? '—';

const WAIVER_BADGE: Record<WaiverState, { label: string; color: string; bg: string }> = {
  signed:       { label: 'Waiver signed',  color: GREEN, bg: 'rgba(44,255,122,.12)' },
  waiting:      { label: 'Waiver waiting', color: 'var(--warning)', bg: 'rgba(255,138,0,.12)' },
  missing:      { label: 'No waiver',      color: RED,   bg: 'rgba(255,59,48,.12)' },
  'not-needed': { label: '—',              color: DIM,   bg: 'transparent' },
};

const TABS = ['Library', 'Pay Applications', 'Lien Waivers', 'Bonds & Forms', 'Payroll', 'Closeout'] as const;
type Tab = typeof TABS[number];

/* Labels live in lib/document-types, next to the filer that writes the slug.
   This page kept its own map, and twelve of its keys ('a310', 'a312', 'ntp',
   'closeout', 'daily-report', 'purchase-order', 'lien-waiver',
   'preliminary-notice', 'notice-completion', 'prevailing-wage',
   'pay-application') named slugs no generator writes — those rows all fell
   through to the prettifier and read "Wh347 Certified Payroll". */

const BOND_CARDS = [
  { code: 'A310', name: 'Bid Bond', desc: 'AIA A310 – Bid bond for proposal phase', icon: Clipboard },
  { code: 'A312-P', name: 'Performance Bond', desc: 'AIA A312 – Performance bond for contract execution', icon: Shield },
  { code: 'A312-L', name: 'Labor & Material Bond', desc: 'AIA A312 – Payment bond for labor and materials', icon: Hammer },
  { code: 'G704', name: 'Certificate of Substantial Completion', desc: 'AIA G704 – Substantial completion certification', icon: Buildings },
  { code: 'G706', name: "Contractor's Affidavit of Payment", desc: "AIA G706 – Contractor's affidavit of release of liens", icon: NotePencil },
  { code: 'G707', name: "Consent of Surety", desc: 'AIA G707 – Consent of surety to final payment', icon: CheckCircle },
];

// Closeout item shape returned by /api/projects/[projectId]/closeout (real `closeout` table).
interface CloseoutItem {
  id: string;
  item_type: string;
  title: string;
  status: string; // pending | submitted | under_review | accepted | rejected | na
  trade?: string | null;
  responsible_party?: string | null;
  due_date?: string | null;
  received_date?: string | null;
}

// A closeout item counts as "complete" once it has been accepted.
const isCloseoutDone = (s: string) => s === 'accepted';

const CLOSEOUT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:      { label: 'Pending',      color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 10%, transparent)' },
  submitted:    { label: 'Submitted',    color: 'var(--warning)', bg: 'rgba(255,138,0,.12)' },
  under_review: { label: 'Under Review', color: 'var(--warning)', bg: 'rgba(255,138,0,.12)' },
  accepted:     { label: 'Complete',     color: GREEN,     bg: 'rgba(44,255,122,.12)' },
  rejected:     { label: 'Rejected',     color: RED,       bg: 'rgba(255,59,48,.12)' },
  na:           { label: 'N/A',          color: DIM,       bg: 'rgba(163,172,187,.12)' },
};

const CLOSEOUT_TYPE_LABEL: Record<string, string> = {
  warranty: 'Warranty', om_manual: 'O&M Manual', as_built: 'As-Built', attic_stock: 'Attic Stock',
  spare_parts: 'Spare Parts', training: 'Training', certificate: 'Certificate', leed_doc: 'LEED Doc',
  closeout_photo: 'Photo', other: 'Other',
};

const statusConfig: Record<string, { color: string; bg: string }> = {
  paid:      { color: GREEN,   bg: 'rgba(44,255,122,.12)' },
  approved:  { color: 'var(--warning)', bg: 'rgba(255,138,0,.12)' },
  draft:     { color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, transparent)' },
  executed:  { color: GREEN,   bg: 'rgba(44,255,122,.12)' },
  pending:   { color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, transparent)' },
  submitted: { color: 'var(--warning)', bg: 'rgba(255,138,0,.12)' },
};

// AIA bond/form card code -> { route, body } using existing /api/documents/* generators.
const BOND_ROUTES: Record<string, { path: string; body: (projectId: string) => Record<string, unknown> }> = {
  'A310':   { path: '/api/documents/a310', body: (projectId) => ({ projectId }) },
  'A312-P': { path: '/api/documents/a312', body: (projectId) => ({ projectId, bondType: 'performance' }) },
  'A312-L': { path: '/api/documents/a312', body: (projectId) => ({ projectId, bondType: 'payment' }) },
  'G704':   { path: '/api/documents/g704', body: (projectId) => ({ projectId }) },
  'G706':   { path: '/api/documents/g706', body: (projectId) => ({ projectId }) },
  'G707':   { path: '/api/documents/g707', body: (projectId) => ({ projectId }) },
};

export default function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Library');
  /* The stat cards sit above the job board and the tab bar — on a phone the
     tab they switch to is a screen or two below, so a tap changed something
     the user could not see. A card now switches the tab AND brings it up. */
  const tabsRef = useRef<HTMLDivElement>(null);
  const openTab = (tab: Tab) => {
    setActiveTab(tab);
    requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const [payApps, setPayApps] = useState<any[]>([]);
  const [lienWaivers, setLienWaivers] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [loadingPayApps, setLoadingPayApps] = useState(true);
  const [loadingLienWaivers, setLoadingLienWaivers] = useState(true);
  const [loadingPayroll, setLoadingPayroll] = useState(true);
  const [errorPayApps, setErrorPayApps] = useState(false);
  const [errorLienWaivers, setErrorLienWaivers] = useState(false);
  const [errorPayroll, setErrorPayroll] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  /* ── Job-first ──────────────────────────────────────────────────────
     Which job the page shows (null = every job). Kept in ?project= so a
     link opens straight to one job, and it drives the Bonds and Closeout
     generators too, so a form can't be made for a different job than the
     one on screen. */
  const [jobId, setJobIdState] = useState<string | null>(null);
  const setJobId = useCallback((id: string | null) => {
    setJobIdState(id);
    if (id) setSelectedProject(id);
    try {
      const u = new URL(window.location.href);
      if (id) u.searchParams.set('project', id); else u.searchParams.delete('project');
      window.history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) {
      console.error('[documents] could not update the URL', e);
    }
  }, []);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('project');
    if (p) { setJobIdState(p); setSelectedProject(p); }
  }, []);
  const [byJob, setByJob] = useState<{ jobs: JobDocs[]; payAppWaiver: Record<string, WaiverState> } | null>(null);
  const [loadingByJob, setLoadingByJob] = useState(true);
  const [errorByJob, setErrorByJob] = useState(false);
  const loadByJob = useCallback(() => {
    setLoadingByJob(true);
    setErrorByJob(false);
    fetch('/api/documents/by-job')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => setByJob({ jobs: d.jobs ?? [], payAppWaiver: d.payAppWaiver ?? {} }))
      .catch(() => setErrorByJob(true))
      .finally(() => setLoadingByJob(false));
  }, []);
  useEffect(() => { loadByJob(); }, [loadByJob]);

  // Closeout tab — real per-project closeout items from the `closeout` table.
  const [closeoutItems, setCloseoutItems] = useState<CloseoutItem[]>([]);
  const [loadingCloseout, setLoadingCloseout] = useState(false);
  const [errorCloseout, setErrorCloseout] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadCloseout = useCallback((projectId: string) => {
    if (!projectId) { setCloseoutItems([]); return; }
    setLoadingCloseout(true);
    setErrorCloseout(false);
    fetch(`/api/projects/${projectId}/closeout`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => setCloseoutItems((d.items ?? []) as CloseoutItem[]))
      .catch(() => setErrorCloseout(true))
      .finally(() => setLoadingCloseout(false));
  }, []);

  // Persist a closeout item's completion by PATCHing its status on the real row.
  const toggleCloseoutItem = useCallback(async (item: CloseoutItem) => {
    if (!selectedProject) return;
    const nextStatus = isCloseoutDone(item.status) ? 'pending' : 'accepted';
    setTogglingId(item.id);
    try {
      const res = await fetch(`/api/projects/${selectedProject}/closeout/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('closeout update failed', res.status, data.error);
        void alertDialog({ title: 'Notice', message: humanError(data.error, "Couldn't update the item. Please try again.") });
        return;
      }
      const data = await res.json();
      const updated = (data.item ?? { ...item, status: nextStatus }) as CloseoutItem;
      setCloseoutItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updated } : i));
    } catch {
      void alertDialog({ title: 'Notice', message: "Couldn't update item. Check your connection and try again." });
    } finally {
      setTogglingId(null);
    }
  }, [selectedProject]);

  const loadPayApps = useCallback(() => {
    setLoadingPayApps(true);
    setErrorPayApps(false);
    fetch('/api/pay-apps/list')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => setPayApps(d.payApps ?? d.items ?? []))
      .catch(() => setErrorPayApps(true))
      .finally(() => setLoadingPayApps(false));
  }, []);

  const loadLienWaivers = useCallback(() => {
    setLoadingLienWaivers(true);
    setErrorLienWaivers(false);
    fetch('/api/lien-waivers/list')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => setLienWaivers(d.lienWaivers ?? d.items ?? []))
      .catch(() => setErrorLienWaivers(true))
      .finally(() => setLoadingLienWaivers(false));
  }, []);

  const loadPayroll = useCallback(() => {
    setLoadingPayroll(true);
    setErrorPayroll(false);
    /* Certified payroll lives in certified_payroll. This tab used to ask
       generated_documents for doc_type 'payroll' — a type no generator writes
       ('wh347' / 'wh347-certified-payroll') and rows without week / gross —
       so it could never show a single filing. */
    fetch('/api/payroll/list')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => setPayroll(d.records ?? []))
      .catch(() => setErrorPayroll(true))
      .finally(() => setLoadingPayroll(false));
  }, []);

  useEffect(() => { loadPayApps(); }, [loadPayApps]);
  useEffect(() => { loadLienWaivers(); }, [loadLienWaivers]);
  useEffect(() => { loadPayroll(); }, [loadPayroll]);

  const { projects: liveProjects } = useProjects();
  useEffect(() => {
    setProjects(liveProjects as any[]);
    /* Same rule as the time clock: pre-pick a job only when there is one.
       Everything generated here — bonds, pay applications, lien waivers,
       certified payroll — is a legal document carrying the project's name and
       numbers. Defaulting to whichever job loaded first is how the wrong one
       gets sent. */
    if (liveProjects.length === 1) setSelectedProject((prev) => prev || liveProjects[0].id);
  }, [liveProjects]);

  // Load real closeout items whenever the Closeout tab is active for the selected project.
  useEffect(() => {
    if (activeTab === 'Closeout' && selectedProject) loadCloseout(selectedProject);
  }, [activeTab, selectedProject, loadCloseout]);

  // Open an already-saved PDF, or POST to a generator route and open the returned URL.
  async function openOrGenerate(
    key: string,
    existingUrl: string | null | undefined,
    gen: { path: string; body: Record<string, unknown>; urlField?: string } | null,
  ) {
    if (existingUrl) { openPdf({ url: existingUrl, title: key }); return; }
    if (!gen) { void alertDialog({ title: 'Notice', message: 'No document available to download.' }); return; }
    setBusyKey(key);
    try {
      const res = await fetch(gen.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gen.body),
      });
      const data = await res.json();
      const url = data[gen.urlField ?? 'pdfUrl'] ?? data.pdfUrl ?? data.g702Url;
      if (!res.ok || !url) { console.error('doc generation failed', res.status, data.error); void alertDialog({ title: 'Notice', message: humanError(data.error, 'Document generation failed. Please try again.') }); return; }
      openPdf({ url, title: key });
    } catch {
      void alertDialog({ title: 'Notice', message: 'Document generation failed.' });
    } finally {
      setBusyKey(null);
    }
  }

  function requireProject(): string | null {
    if (selectedProject) return selectedProject;
    void alertDialog({ title: 'Notice', message: 'Select a project first.' });
    return null;
  }

  const projectSelectStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
    color: TEXT, fontSize: 13, fontWeight: 600, padding: '9px 12px', cursor: 'pointer',
  };

  // Live summary counts for the KPI stat row (guard values while loading / on error).
  const statVal = (loading: boolean, err: boolean, n: number) => (loading || err ? '—' : String(n));

  // Text search across the active tab's rows — matches any visible field.
  const q = query.trim().toLowerCase();
  const rowMatch = (...vals: (string | number | null | undefined)[]) =>
    !q || vals.some(v => String(v ?? '').toLowerCase().includes(q));
  const inJob = (pid: string | null | undefined) => !jobId || pid === jobId;
  const projectById = (id: string | null | undefined) => (id ? projects.find(p => p.id === id) : undefined);
  const jobName = (id: string | null | undefined) =>
    projectById(id)?.name ?? byJob?.jobs.find(j => j.id === id)?.name ?? (id ? 'Unknown job' : 'No job');
  const jobColor = (id: string | null | undefined) => projectColor(projectById(id) ?? id ?? null);
  const payAppNo = (id: string | null | undefined) => {
    const pa = id ? payApps.find(x => x.id === id) : null;
    const n = pa?.app_number ?? pa?.application_number;
    return n != null ? `#${String(n).padStart(3, '0')}` : null;
  };
  const visPayApps = payApps.filter(pa => inJob(pa.project_id) && rowMatch(pa.app_number ?? pa.application_number, fmtDay(pa.period_from), fmtDay(pa.period_to), pa.current_payment_due ?? pa.net_payment_due, pa.status, jobName(pa.project_id)));
  const visLienWaivers = lienWaivers.filter(lw => inJob(lw.project_id) && rowMatch(waiverParty(lw), waiverTypeLabel(lw.waiver_type ?? lw.type), lw.amount, lw.through_date ?? lw.throughDate, lw.status, jobName(lw.project_id), payAppNo(lw.pay_application_id)));
  const visPayroll = payroll.filter(pr => inJob(pr.project_id) && rowMatch(pr.week_ending, pr.employee_count, pr.total_gross, pr.status, jobName(pr.project_id)));
  const showJobCol = !jobId;
  const scopeJobs = (byJob?.jobs ?? []).filter(j => inJob(j.id));
  const billedAll = scopeJobs.reduce((s, j) => s + j.billed, 0);
  const jobsWithPayApps = scopeJobs.filter(j => j.payApps.total > 0).length;
  const waitingAll = scopeJobs.reduce((s, j) => s + j.waivers.waiting, 0);
  const signedAll = scopeJobs.reduce((s, j) => s + j.waivers.signed, 0);
  const noWaiverAll = scopeJobs.reduce((s, j) => s + j.paidNoWaiver, 0);
  const visCloseout = closeoutItems.filter(i => rowMatch(i.title, i.item_type, i.trade, i.responsible_party, i.status));

  // Sortable columns per tab (R11 sweep) — money on Number()-coerced values,
  // dates on the raw ISO strings. Each table persists its own sort.
  // Grouped by job by default (newest application first inside each job), so
  // two jobs' first applications never sit next to each other looking like one.
  const { sort: paSort, cycleSort: paCycle } = usePersistedSort('documents-payapps-v2', { key: 'job', dir: 'asc' });
  const sortedPayApps = useSortedRows(visPayApps, paSort, (pa: any, key: string) => {
    switch (key) {
      case 'app':    return Number(pa.app_number ?? pa.application_number) || 0;
      case 'period': return pa.period_from ?? pa.period_to ?? null;
      case 'amount': return Number(pa.current_payment_due ?? pa.net_payment_due) || 0;
      case 'status': return pa.status ?? null;
      case 'job':    return `${jobName(pa.project_id)}|${String(99999 - (Number(pa.app_number ?? pa.application_number) || 0)).padStart(5, '0')}`;
      case 'waiver': return byJob?.payAppWaiver[pa.id] ?? null;
      default:       return pa[key];
    }
  });
  const { sort: lwSort, cycleSort: lwCycle } = usePersistedSort('documents-lienwaivers', { key: 'through', dir: 'desc' });
  const sortedLienWaivers = useSortedRows(visLienWaivers, lwSort, (lw: any, key: string) => {
    switch (key) {
      case 'sub':     return waiverParty(lw);
      case 'type':    return waiverTypeLabel(lw.waiver_type ?? lw.type);
      case 'job':     return jobName(lw.project_id);
      case 'payapp':  return payAppNo(lw.pay_application_id);
      case 'amount':  return Number(lw.amount) || 0;
      case 'through': return lw.through_date ?? lw.throughDate ?? null;
      case 'status':  return lw.status ?? null;
      default:        return lw[key];
    }
  });
  const { sort: prSort, cycleSort: prCycle } = usePersistedSort('documents-payroll', { key: 'week', dir: 'desc' });
  const sortedPayroll = useSortedRows(visPayroll, prSort, (pr: any, key: string) => {
    switch (key) {
      case 'week':      return pr.week_ending ?? null;
      case 'employees': return Number(pr.employee_count) || 0;
      case 'gross':     return Number(pr.total_gross) || 0;
      case 'job':       return jobName(pr.project_id);
      case 'status':    return pr.status ?? null;
      default:          return pr[key];
    }
  });

  // The job a row belongs to — its colour dot and name; tap to see only that job.
  const jobCell = (pid: string | null | undefined) => (
    <td style={{ padding: '12px 16px', maxWidth: 260 }}>
      {pid ? (
        <button type="button" onClick={() => setJobId(pid)} title={`Show only ${jobName(pid)}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: '100%', background: 'none', border: 0, padding: 0, color: TEXT, fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
          <span style={jobDotStyle(jobColor(pid))} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{jobName(pid)}</span>
        </button>
      ) : <span style={{ color: DIM }}>No job</span>}
    </td>
  );

  return (
    <PremiumSurface maxWidth={2200}>

      {/* Header */}
      <ModuleHero
        eyebrow="Compliance"
        eyebrowIcon={<IconChip size={24} vivid={moduleAccent('documents').vivid ?? moduleAccent('documents').hex}><FileText size={13} weight="fill" color="var(--text-primary)" /></IconChip>}
        accentColor={moduleAccent('documents').hex}
        title="Project"
        accent="Documents"
        subtitle={jobId
          ? `Pay apps, lien waivers, payroll and closeout for ${jobName(jobId)}.`
          : 'Every job’s pay apps, lien waivers, payroll and closeout — the ones that need you first.'}
      />

      <JobDocsBoard
        jobs={byJob?.jobs ?? []}
        colors={Object.fromEntries(projects.map((p: any) => [p.id, p.color ?? null]))}
        selectedId={jobId}
        onPick={(id) => setJobId(id)}
        onClear={() => setJobId(null)}
        loading={loadingByJob}
        error={errorByJob}
        onRetry={loadByJob}
      />

      {/* KPI stat row — live counts across the document library */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 26 }}>
        <StatCard
          icon={<Receipt size={19} weight="duotone" color={GOLD} />}
          label="Pay Applications" value={statVal(loadingPayApps, errorPayApps, payApps.filter(pa => inJob(pa.project_id)).length)}
          sub={byJob && billedAll > 0 ? `${fmtMoneyShort(billedAll)} billed${jobId ? '' : ` across ${jobsWithPayApps} job${jobsWithPayApps === 1 ? '' : 's'}`}` : 'AIA G702 / G703'} accent={GOLD} delay={0.02}
         onClick={() => openTab('Pay Applications')}/>
        <StatCard
          icon={<Shield size={19} weight="duotone" color={GOLD} />}
          label="Lien Waivers" value={statVal(loadingLienWaivers, errorLienWaivers, lienWaivers.filter(lw => inJob(lw.project_id)).length)}
          sub={byJob ? `${signedAll} signed · ${waitingAll} waiting${noWaiverAll ? ` · ${noWaiverAll} paid with none` : ''}` : 'signed & pending'} delay={0.06}
         onClick={() => openTab('Lien Waivers')}/>
        <StatCard
          icon={<NotePencil size={19} weight="duotone" color={GOLD} />}
          label="Certified Payroll" value={statVal(loadingPayroll, errorPayroll, payroll.filter(pr => inJob(pr.project_id)).length)}
          sub="WH-347 weeks filed" delay={0.10}
         onClick={() => openTab('Payroll')}/>
        <StatCard
          icon={<Clipboard size={19} weight="duotone" color={GOLD} />}
          label="AIA Forms" value={String(BOND_CARDS.length)}
          sub="bond & closeout templates" delay={0.14}
         onClick={() => openTab('Bonds & Forms')}/>
      </div>

      {/* Tab bar + search */}
      <div ref={tabsRef} style={{
        display: 'flex', gap: 4, alignItems: 'center',
        borderBottom: `1px solid rgba(255,255,255,0.08)`,
        marginBottom: 24, overflowX: 'auto',
        // Clears the fixed top bar when a stat card scrolls the tabs into view.
        scrollMarginTop: 76,
      }}>
        <div role="tablist" aria-label="Document type" style={{ display: 'contents' }}>
        {TABS.map(tab => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              /* Handle for Help Mode — "docs-tab-bonds-forms", "docs-tab-lien-waivers".
                 Two walkthroughs point at these tabs, and matching them by
                 label meant hunting for the words "Lien Waivers" anywhere on
                 a page that also lists lien waivers by name. */
              data-tour={`docs-tab-${tab.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 20px', minHeight: 44,
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${active ? GOLD : 'transparent'}`,
                color: active ? GOLD : DIM,
                fontSize: 13, fontWeight: active ? 700 : 500,
                cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all .15s',
              }}
            >{tab}</button>
          );
        })}
        </div>
        {activeTab !== 'Library' && <div style={{ marginLeft: 'auto', position: 'relative', minWidth: 230, flexShrink: 0, alignSelf: 'center', marginBottom: 6 }}>
          <MagnifyingGlass size={14} color={DIM} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search this tab…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px 8px 30px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: TEXT, fontSize: 12.5, outline: 'none' }}
          />
        </div>}
      </div>

      {/* Tab content */}
      <div>

        {/* ── Pay Applications ──────────────────────────────────────── */}
        {activeTab === 'Library' && <DocumentLibrary jobId={jobId} />}

        {activeTab === 'Pay Applications' && (
          <SectionCard
            flush
            icon={<Receipt size={17} weight="duotone" color={GOLD} />}
            title="Pay Applications (AIA G702 / G703)"
            action={
              <Link href="/app/projects" style={goldButtonStyle} className="pmBtn">
                <Plus size={15} weight="bold" /> Generate New
              </Link>
            }
          >
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
              <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {([
                      ...(showJobCol ? [['Job','job']] : []),
                      ['Application #','app'],['Period','period'],['Amount Due','amount'],['Status','status'],['Lien Waiver','waiver'],['Download',undefined],
                    ] as [string, string|undefined][]).map(([h,k]) => (
                      <SortableTh key={h} label={h} sortKey={k} sort={paSort} onSort={paCycle} style={{ padding: '10px 16px' }} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingPayApps ? (
                    <SkeletonRows cols={showJobCol ? 7 : 6} />
                  ) : errorPayApps ? (
                    <ErrorRow colSpan={showJobCol ? 7 : 6} message="Couldn't Load Pay Applications" onRetry={loadPayApps} />
                  ) : visPayApps.length === 0 ? (
                    <tr><td colSpan={showJobCol ? 7 : 6} style={{ padding: 0 }}>
                      <PremiumEmpty
                        compact
                        icon={<Receipt size={30} weight="duotone" color={GOLD} />}
                        title={payApps.length > 0 ? (jobId && !q ? 'No Pay Applications on This Job' : 'No Pay Applications Match') : 'No Pay Applications Yet'}
                        description={payApps.length > 0 ? (jobId && !q ? 'Tap Show all jobs above to see every job.' : 'Clear the search above to see every record.') : 'Generated AIA G702 / G703 pay applications will appear here.'}
                        action={<Link href="/app/projects" style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Generate New</Link>}
                      />
                    </td></tr>
                  ) : sortedPayApps.map(pa => {
                    const sc = statusConfig[pa.status] || statusConfig.draft;
                    const wv = WAIVER_BADGE[(byJob?.payAppWaiver[pa.id] ?? 'not-needed') as WaiverState];
                    return (
                      <tr key={pa.id} style={{ borderBottom: `1px solid rgba(255,255,255,0.08)` }}>
                        {showJobCol && jobCell(pa.project_id)}
                        {/* Real pay_applications columns (the list route returns raw rows):
                            app_number, period_from/period_to, current_payment_due — the old
                            appNo/period/amount keys never existed, so every row read #000 / $0.00. */}
                        <td style={{ padding: '12px 16px', color: GOLD, fontWeight: 700 }}>#{String(pa.app_number ?? pa.application_number ?? '').padStart(3, '0')}</td>
                        <td style={{ padding: '12px 16px', color: DIM }}>{[fmtDay(pa.period_from), fmtDay(pa.period_to)].filter(Boolean).join(' – ') || '—'}</td>
                        <td style={{ padding: '12px 16px', color: GOLD, fontWeight: 700 }}>{fmt(pa.current_payment_due ?? pa.net_payment_due)}</td>
                        <td style={{ padding: '12px 16px' }}><Badge label={pa.status} color={sc.color} bg={sc.bg} /></td>
                        <td style={{ padding: '12px 16px' }}>
                          {wv.label === '—' ? <span style={{ color: DIM }}>—</span> : <Badge label={wv.label} color={wv.color} bg={wv.bg} />}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <button
                            disabled={busyKey === `payapp-${pa.id}`}
                            onClick={() => openOrGenerate(
                              `payapp-${pa.id}`,
                              pa.g702_pdf_url ?? pa.g702Url,
                              { path: '/api/documents/pay-application', body: { payAppId: pa.id, projectId: pa.project_id ?? pa.projectId }, urlField: 'g702Url' },
                            )}
                            style={{
                              background: 'none', border: `1px solid ${BORDER}`,
                              borderRadius: 5, color: GOLD, fontSize: 11,
                              padding: '3px 10px', cursor: 'pointer',
                              opacity: busyKey === `payapp-${pa.id}` ? 0.5 : 1,
                            }}>{busyKey === `payapp-${pa.id}` ? '…' : (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><FileText size={12} weight="regular" color={GOLD} /> G702 PDF</span>)}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {/* ── Lien Waivers ──────────────────────────────────────────── */}
        {activeTab === 'Lien Waivers' && (
          <SectionCard
            flush
            icon={<Shield size={17} weight="duotone" color={GOLD} />}
            title="Lien Waivers"
            action={
              <Link href="/app/projects" style={goldButtonStyle} className="pmBtn">
                <Plus size={15} weight="bold" /> Generate New
              </Link>
            }
          >
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
              <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {([
                      ...(showJobCol ? [['Job','job']] : []),
                      ['Sub / Claimant','sub'],['Type','type'],['Pay App','payapp'],['Amount','amount'],['Through Date','through'],['Status','status'],['Download',undefined],
                    ] as [string, string|undefined][]).map(([h,k]) => (
                      <SortableTh key={h} label={h} sortKey={k} sort={lwSort} onSort={lwCycle} style={{ padding: '10px 16px' }} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingLienWaivers ? (
                    <SkeletonRows cols={showJobCol ? 8 : 7} />
                  ) : errorLienWaivers ? (
                    <ErrorRow colSpan={showJobCol ? 8 : 7} message="Couldn't Load Lien Waivers" onRetry={loadLienWaivers} />
                  ) : visLienWaivers.length === 0 ? (
                    <tr><td colSpan={showJobCol ? 8 : 7} style={{ padding: 0 }}>
                      <PremiumEmpty
                        compact
                        icon={<Shield size={30} weight="duotone" color={GOLD} />}
                        title={lienWaivers.length > 0 ? 'No Lien Waivers Match' : 'No Lien Waivers Yet'}
                        description={lienWaivers.length > 0 ? 'Clear the search above to see every record.' : 'Conditional and unconditional lien waivers you generate will be listed here.'}
                        action={<Link href="/app/projects" style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Generate New</Link>}
                      />
                    </td></tr>
                  ) : sortedLienWaivers.map(lw => {
                    const sc = statusConfig[lw.status] || statusConfig.pending;
                    return (
                      <tr key={lw.id} style={{ borderBottom: `1px solid rgba(255,255,255,0.08)` }}>
                        {showJobCol && jobCell(lw.project_id)}
                        {/* Real lien_waivers columns. The old sub_name / type keys don't
                            exist, so Sub Name and Type rendered blank on every row. */}
                        <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 600 }}>{waiverParty(lw)}</td>
                        <td style={{ padding: '12px 16px', color: DIM }}>{waiverTypeLabel(lw.waiver_type ?? lw.type)}</td>
                        <td style={{ padding: '12px 16px', color: payAppNo(lw.pay_application_id) ? GOLD : DIM, fontWeight: 700 }}>{payAppNo(lw.pay_application_id) ?? '—'}</td>
                        <td style={{ padding: '12px 16px', color: TEXT }}>{fmt(lw.amount)}</td>
                        <td style={{ padding: '12px 16px', color: DIM }}>{fmtDay(lw.through_date ?? lw.throughDate) ?? '—'}</td>
                        <td style={{ padding: '12px 16px' }}><Badge label={lw.status} color={sc.color} bg={sc.bg} /></td>
                        <td style={{ padding: '12px 16px' }}>
                          <button
                            disabled={busyKey === `lw-${lw.id}`}
                            onClick={() => openOrGenerate(
                              `lw-${lw.id}`,
                              lw.signed_pdf_url ?? lw.pdf_url ?? lw.pdfUrl,
                              {
                                path: '/api/lien-waivers/generate',
                                // This waiver is already on file — build its PDF, don't file a second waiver.
                                body: { projectId: lw.project_id ?? lw.projectId, waiverId: lw.id },
                              },
                            )}
                            style={{
                              background: 'none', border: `1px solid ${BORDER}`,
                              borderRadius: 5, color: GOLD, fontSize: 11,
                              padding: '3px 10px', cursor: 'pointer',
                              opacity: busyKey === `lw-${lw.id}` ? 0.5 : 1,
                            }}>{busyKey === `lw-${lw.id}` ? '…' : (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><FileText size={12} weight="regular" color={GOLD} /> Download</span>)}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {/* ── Bonds & Forms ─────────────────────────────────────────── */}
        {activeTab === 'Bonds & Forms' && (
          <SectionCard
            icon={<Buildings size={17} weight="duotone" color={GOLD} />}
            title="AIA Bonds & Standard Forms"
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <select
                  value={selectedProject}
                  onChange={e => setSelectedProject(e.target.value)}
                  style={projectSelectStyle}
                >
                  {projects.length === 0 && <option value="">No Projects</option>}
                  {projects.map(pr => (
                    <option key={pr.id} value={pr.id}>{pr.name ?? pr.project_number ?? pr.id}</option>
                  ))}
                </select>
                <button
                  disabled={busyKey === 'bond-new'}
                  onClick={() => {
                    const projectId = requireProject();
                    if (!projectId) return;
                    openOrGenerate('bond-new', null, { ...BOND_ROUTES['A312-P'], body: BOND_ROUTES['A312-P'].body(projectId) });
                  }}
                  className="pmBtn"
                  style={{ ...goldButtonStyle, opacity: busyKey === 'bond-new' ? 0.6 : 1 }}
                >{busyKey === 'bond-new' ? 'Generating…' : (<><Plus size={15} weight="bold" /> Generate New</>)}</button>
              </div>
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {BOND_CARDS.map(card => (
                <div key={card.code} className="pmHover" style={{
                  background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))',
                  border: `1px solid rgba(255,255,255,0.08)`,
                  borderRadius: 14, padding: 20,
                  display: 'flex', flexDirection: 'column', gap: 10,
                  boxShadow: '0 10px 30px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <IconChip size={40}>{React.createElement(card.icon, { size: 22, weight: 'duotone', color: GOLD })}</IconChip>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13, color: TEXT }}>{card.name}</div>
                      <div style={{ fontSize: 11, color: GOLD, fontWeight: 700 }}>{card.code}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: DIM, lineHeight: 1.5 }}>{card.desc}</div>
                  <button
                    disabled={busyKey === `bond-${card.code}` || !BOND_ROUTES[card.code]}
                    onClick={() => {
                      const route = BOND_ROUTES[card.code];
                      if (!route) { void alertDialog({ title: 'Notice', message: `No generator for ${card.code}.` }); return; }
                      const projectId = requireProject();
                      if (!projectId) return;
                      openOrGenerate(`bond-${card.code}`, null, { ...route, body: route.body(projectId) });
                    }}
                    className="pmBtn"
                    style={{
                      ...goldButtonStyle, marginTop: 4, width: '100%',
                      opacity: busyKey === `bond-${card.code}` ? 0.6 : 1,
                    }}>{busyKey === `bond-${card.code}` ? 'Generating…' : `Generate ${card.code}`}</button>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ── Payroll ───────────────────────────────────────────────── */}
        {activeTab === 'Payroll' && (
          <SectionCard
            flush
            icon={<NotePencil size={17} weight="duotone" color={GOLD} />}
            title="Certified Payroll (WH-347)"
            action={
              <Link href="/app/projects" style={goldButtonStyle} className="pmBtn">
                <Plus size={15} weight="bold" /> Generate WH-347
              </Link>
            }
          >
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
              <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {([
                      ...(showJobCol ? [['Job','job']] : []),
                      ['Week Ending','week'],['# Employees','employees'],['Total Gross','gross'],['Status','status'],['Download',undefined],
                    ] as [string, string|undefined][]).map(([h,k]) => (
                      <SortableTh key={h} label={h} sortKey={k} sort={prSort} onSort={prCycle} style={{ padding: '10px 16px' }} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingPayroll ? (
                    <SkeletonRows cols={showJobCol ? 6 : 5} />
                  ) : errorPayroll ? (
                    <ErrorRow colSpan={showJobCol ? 6 : 5} message="Couldn't Load Certified Payroll" onRetry={loadPayroll} />
                  ) : visPayroll.length === 0 ? (
                    <tr><td colSpan={showJobCol ? 6 : 5} style={{ padding: 0 }}>
                      <PremiumEmpty
                        compact
                        icon={<NotePencil size={30} weight="duotone" color={GOLD} />}
                        title={payroll.length > 0 ? 'No Payroll Records Match' : 'No Certified Payroll Records Yet'}
                        description={payroll.length > 0 ? 'Clear the search above to see every record.' : 'WH-347 certified payroll filings you generate will appear here.'}
                        action={<Link href="/app/projects" style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Generate WH-347</Link>}
                      />
                    </td></tr>
                  ) : sortedPayroll.map(pr => {
                    const sc = statusConfig[pr.status] || statusConfig.draft;
                    return (
                      <tr key={pr.id} style={{ borderBottom: `1px solid rgba(255,255,255,0.08)` }}>
                        {showJobCol && jobCell(pr.project_id)}
                        <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 600 }}>{fmtDay(pr.week_ending) ?? '—'}</td>
                        <td style={{ padding: '12px 16px', color: DIM }}>{pr.employee_count ?? 0}</td>
                        <td style={{ padding: '12px 16px', color: TEXT }}>{fmt(pr.total_gross ?? 0)}</td>
                        <td style={{ padding: '12px 16px' }}><Badge label={pr.status} color={sc.color} bg={sc.bg} /></td>
                        <td style={{ padding: '12px 16px' }}>
                          <button
                            onClick={() => openOrGenerate(
                              `pr-${pr.id}`,
                              pr.pdf_url,
                              null,
                            )}
                            style={{
                              background: 'none', border: `1px solid ${BORDER}`,
                              borderRadius: 5, color: GOLD, fontSize: 11,
                              padding: '3px 10px', cursor: 'pointer',
                            }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><FileText size={12} weight="regular" color={GOLD} /> WH-347</span></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {/* ── Closeout ──────────────────────────────────────────────── */}
        {activeTab === 'Closeout' && (
          <SectionCard
            flush
            icon={<Clipboard size={17} weight="duotone" color={GOLD} />}
            title="Closeout Checklist"
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <select
                  value={selectedProject}
                  onChange={e => setSelectedProject(e.target.value)}
                  style={projectSelectStyle}
                >
                  {projects.length === 0 && <option value="">No Projects</option>}
                  {projects.map(pr => (
                    <option key={pr.id} value={pr.id}>{pr.name ?? pr.project_number ?? pr.id}</option>
                  ))}
                </select>
                <button
                  disabled={busyKey === 'closeout'}
                  onClick={() => {
                    const projectId = requireProject();
                    if (!projectId) return;
                    openOrGenerate('closeout', null, { path: '/api/documents/closeout', body: { projectId } });
                  }}
                  className="pmBtn"
                  style={{ ...goldButtonStyle, opacity: busyKey === 'closeout' ? 0.6 : 1 }}
                >{busyKey === 'closeout' ? 'Generating…' : (<><FileText size={15} weight="bold" /> Export Closeout Package</>)}</button>
              </div>
            }
          >
            {/* Progress bar — real completion across this project's closeout items. */}
            {!loadingCloseout && !errorCloseout && closeoutItems.length > 0 && (() => {
              const done = closeoutItems.filter(i => isCloseoutDone(i.status)).length;
              const pct = Math.round((done / closeoutItems.length) * 100);
              return (
                <div style={{ padding: '16px 20px', borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Closeout Progress</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>{done} / {closeoutItems.length} items ({pct}%)</span>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>
                    <div style={{
                      height: '100%', width: `${pct}%`,
                      background: `linear-gradient(90deg,${GOLD},var(--brand-primary-strong))`,
                      borderRadius: 4, transition: 'width .3s',
                    }} />
                  </div>
                </div>
              );
            })()}

            {loadingCloseout ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < 4 ? `1px solid rgba(255,255,255,0.08)` : 'none' }}>
                  <Skeleton height={18} width={18} />
                  <Skeleton height={13} width="45%" />
                </div>
              ))
            ) : errorCloseout ? (
              <PremiumEmpty
                tone="error"
                compact
                icon={<WarningCircle size={30} weight="duotone" color={RED} />}
                title="Couldn't Load Closeout Items"
                description="We couldn't reach this project's closeout list. Your data is safe — try again."
                action={<button onClick={() => selectedProject && loadCloseout(selectedProject)} style={goldOutlineButtonStyle} className="pmBtn">Retry</button>}
              />
            ) : !selectedProject ? (
              <PremiumEmpty
                compact
                icon={<Clipboard size={30} weight="duotone" color={GOLD} />}
                title="Select a Project"
                description="Choose a project above to view its closeout checklist."
              />
            ) : visCloseout.length === 0 ? (
              <PremiumEmpty
                compact
                icon={<Clipboard size={30} weight="duotone" color={GOLD} />}
                title={closeoutItems.length > 0 ? 'No Closeout Items Match' : 'No Closeout Items Yet'}
                description={closeoutItems.length > 0 ? 'Clear the search above to see the full checklist.' : 'Closeout items (warranties, O&M manuals, as-builts, certificates) added to this project will appear here.'}
              />
            ) : (
              visCloseout.map((item, idx) => {
                const done = isCloseoutDone(item.status);
                const sc = CLOSEOUT_STATUS[item.status] ?? CLOSEOUT_STATUS.pending;
                const busy = togglingId === item.id;
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 20px',
                      borderBottom: idx < visCloseout.length - 1 ? `1px solid rgba(255,255,255,0.08)` : 'none',
                      background: done ? 'rgba(44,255,122,.03)' : 'transparent',
                    }}
                  >
                    <button
                      onClick={() => toggleCloseoutItem(item)}
                      disabled={busy}
                      title={done ? 'Mark as pending' : 'Mark as complete'}
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: busy ? 'default' : 'pointer',
                        display: 'inline-flex', opacity: busy ? 0.5 : 1,
                      }}
                    >
                      {done ? <CheckCircle size={20} weight="fill" color={GREEN} /> : <Square size={20} weight="regular" color={DIM} />}
                    </button>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: done ? TEXT : DIM }}>{item.title}</div>
                      <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>
                        {[CLOSEOUT_TYPE_LABEL[item.item_type] ?? item.item_type, item.trade, item.responsible_party]
                          .filter(Boolean).join(' · ')}
                        {item.due_date ? ` · Due ${item.due_date}` : ''}
                      </div>
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                      <Badge label={sc.label} color={sc.color} bg={sc.bg} />
                    </div>
                  </div>
                );
              })
            )}
          </SectionCard>
        )}
      </div>
    </PremiumSurface>
  );
}
