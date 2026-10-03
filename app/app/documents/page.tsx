'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { alertDialog } from '@/lib/ui/async-dialog';
import { useProjects } from '@/lib/hooks/useProjects';
import Link from 'next/link';
import { Skeleton } from '../../../components/ui/Skeleton';
import { WarningCircle, FileText, Clipboard, Shield, Hammer, Buildings, NotePencil, CheckCircle, Square, Receipt, Plus, MagnifyingGlass } from '@phosphor-icons/react';
import { FileTypeBadge } from '@/components/FileTypeBadge';
import { humanError } from '@/lib/errors';
import { openPdf } from '@/components/PdfViewer';
import {
  PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, IconChip,
  goldButtonStyle, goldOutlineButtonStyle,
} from '@/components/ui/premium';
import { moduleAccent } from '@/lib/module-identity';
import { docTypeLabel } from '@/lib/document-types';
import { PdfIcon } from '@/components/ui/FileTypeIcon';
import { SortableTh, usePersistedSort, useSortedRows } from '@/app/app/_shared/table-sort';

const GOLD = 'var(--brand-primary)';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#D4D4D8';
const TEXT = '#FFFFFF';
const GREEN = '#2CFF7A';
const RED = '#FF3B30';

const fmt = (n: number | string | null | undefined) =>
  '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// DB date (date-only or ISO) → "Mar 4, 2026". Date-only strings get a noon time
// so the local-timezone shift can never roll them back a day.
const fmtDay = (d: string | null | undefined) =>
  d ? new Date(String(d).includes('T') ? d : `${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

function Badge({ label, color = '#D4D4D8', bg = 'rgba(148,163,184,.12)' }: { label: string; color?: string; bg?: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px',
      borderRadius: 4, background: bg, color,
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
  submitted:    { label: 'Submitted',    color: '#FF8A00', bg: 'rgba(26,95,168,.12)' },
  under_review: { label: 'Under Review', color: '#FF8A00', bg: 'rgba(26,95,168,.12)' },
  accepted:     { label: 'Complete',     color: GREEN,     bg: 'rgba(44,255,122,.12)' },
  rejected:     { label: 'Rejected',     color: RED,       bg: 'rgba(255,59,48,.12)' },
  na:           { label: 'N/A',          color: DIM,       bg: 'rgba(148,163,184,.12)' },
};

const CLOSEOUT_TYPE_LABEL: Record<string, string> = {
  warranty: 'Warranty', om_manual: 'O&M Manual', as_built: 'As-Built', attic_stock: 'Attic Stock',
  spare_parts: 'Spare Parts', training: 'Training', certificate: 'Certificate', leed_doc: 'LEED Doc',
  closeout_photo: 'Photo', other: 'Other',
};

const statusConfig: Record<string, { color: string; bg: string }> = {
  paid:      { color: GREEN,   bg: 'rgba(44,255,122,.12)' },
  approved:  { color: '#FF8A00', bg: 'rgba(26,95,168,.12)' },
  draft:     { color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, transparent)' },
  executed:  { color: GREEN,   bg: 'rgba(44,255,122,.12)' },
  pending:   { color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, transparent)' },
  submitted: { color: '#FF8A00', bg: 'rgba(26,95,168,.12)' },
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

  // Library tab — every generated document, tenant-scoped, freshly signable.
  const [libDocs, setLibDocs] = useState<any[]>([]);
  const [libTypes, setLibTypes] = useState<string[]>([]);
  const [libTypeFilter, setLibTypeFilter] = useState<string>('');
  const [loadingLib, setLoadingLib] = useState(true);
  const [errorLib, setErrorLib] = useState(false);
  const loadLibrary = useCallback(() => {
    setLoadingLib(true); setErrorLib(false);
    fetch('/api/documents/library')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setLibDocs(d.docs ?? []); setLibTypes(d.types ?? []); })
      .catch(() => setErrorLib(true))
      .finally(() => setLoadingLib(false));
  }, []);
  useEffect(() => { loadLibrary(); }, [loadLibrary]);
  // Stored links expire (private bucket) — always open through a fresh signature.
  async function openLibDoc(doc: any) {
    setBusyKey(`lib-${doc.id}`);
    try {
      const res = await fetch('/api/documents/library', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId: doc.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) throw new Error(d.error || 'open failed');
      openPdf({ url: d.url, title: doc.title || doc.doc_type || 'Document' });
    } catch { void alertDialog({ title: 'Notice', message: 'Could not open the document. Try regenerating it.' }); }
    finally { setBusyKey(null); }
  }

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
    fetch('/api/documents/list?type=payroll')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => setPayroll(d.payroll ?? d.documents ?? d.items ?? []))
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
  const visPayApps = payApps.filter(pa => rowMatch(pa.app_number ?? pa.application_number, fmtDay(pa.period_from), fmtDay(pa.period_to), pa.current_payment_due ?? pa.net_payment_due, pa.status));
  const visLienWaivers = lienWaivers.filter(lw => rowMatch(lw.subName ?? lw.sub_name, lw.type, lw.amount, lw.throughDate ?? lw.through_date, lw.status));
  const visPayroll = payroll.filter(pr => rowMatch(pr.weekEnding ?? pr.week_ending, pr.employees, pr.totalGross ?? pr.total_gross, pr.status));
  const visCloseout = closeoutItems.filter(i => rowMatch(i.title, i.item_type, i.trade, i.responsible_party, i.status));
  const visLib = libDocs.filter(d => (!libTypeFilter || d.doc_type === libTypeFilter) && (!query || `${docTypeLabel(d.doc_type)} ${d.projectName ?? ''}`.toLowerCase().includes(query.toLowerCase())));

  // Sortable columns per tab (R11 sweep) — money on Number()-coerced values,
  // dates on the raw ISO strings. Each table persists its own sort.
  const { sort: libSort, cycleSort: libCycle } = usePersistedSort('documents-library', { key: 'generated', dir: 'desc' });
  const sortedLib = useSortedRows(visLib, libSort, (d: any, key: string) => {
    switch (key) {
      case 'doc':       return docTypeLabel(d.doc_type);
      case 'project':   return d.projectName ?? null;
      case 'generated': return d.created_at ?? null;
      case 'status':    return d.status || 'generated';
      default:          return d[key];
    }
  });
  const { sort: paSort, cycleSort: paCycle } = usePersistedSort('documents-payapps', { key: 'app', dir: 'desc' });
  const sortedPayApps = useSortedRows(visPayApps, paSort, (pa: any, key: string) => {
    switch (key) {
      case 'app':    return Number(pa.app_number ?? pa.application_number) || 0;
      case 'period': return pa.period_from ?? pa.period_to ?? null;
      case 'amount': return Number(pa.current_payment_due ?? pa.net_payment_due) || 0;
      case 'status': return pa.status ?? null;
      default:       return pa[key];
    }
  });
  const { sort: lwSort, cycleSort: lwCycle } = usePersistedSort('documents-lienwaivers', { key: 'through', dir: 'desc' });
  const sortedLienWaivers = useSortedRows(visLienWaivers, lwSort, (lw: any, key: string) => {
    switch (key) {
      case 'sub':     return lw.subName ?? lw.sub_name ?? null;
      case 'type':    return lw.type ?? null;
      case 'amount':  return Number(lw.amount) || 0;
      case 'through': return lw.throughDate ?? lw.through_date ?? null;
      case 'status':  return lw.status ?? null;
      default:        return lw[key];
    }
  });
  const { sort: prSort, cycleSort: prCycle } = usePersistedSort('documents-payroll', { key: 'week', dir: 'desc' });
  const sortedPayroll = useSortedRows(visPayroll, prSort, (pr: any, key: string) => {
    switch (key) {
      case 'week':      return pr.weekEnding ?? pr.week_ending ?? null;
      case 'employees': return Number(pr.employees) || 0;
      case 'gross':     return Number(pr.totalGross ?? pr.total_gross) || 0;
      case 'status':    return pr.status ?? null;
      default:          return pr[key];
    }
  });

  return (
    <PremiumSurface maxWidth={2200}>

      {/* Header */}
      <ModuleHero
        eyebrow="Compliance"
        eyebrowIcon={<IconChip size={24} vivid={moduleAccent('documents').vivid ?? moduleAccent('documents').hex}><FileText size={13} weight="fill" color="#F8FAFC" /></IconChip>}
        accentColor={moduleAccent('documents').hex}
        title="Project"
        accent="Documents"
        subtitle="Generated contracts, forms, and compliance documents across all projects."
      />

      {/* KPI stat row — live counts across the document library */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 26 }}>
        <StatCard
          icon={<Receipt size={19} weight="duotone" color={GOLD} />}
          label="Pay Applications" value={statVal(loadingPayApps, errorPayApps, payApps.length)}
          sub="AIA G702 / G703" accent={GOLD} delay={0.02}
         href="/app/documents"/>
        <StatCard
          icon={<Shield size={19} weight="duotone" color={GOLD} />}
          label="Lien Waivers" value={statVal(loadingLienWaivers, errorLienWaivers, lienWaivers.length)}
          sub="signed & pending" delay={0.06}
         href="/app/documents"/>
        <StatCard
          icon={<NotePencil size={19} weight="duotone" color={GOLD} />}
          label="Certified Payroll" value={statVal(loadingPayroll, errorPayroll, payroll.length)}
          sub="WH-347 filings" delay={0.10}
         href="/app/documents"/>
        <StatCard
          icon={<Clipboard size={19} weight="duotone" color={GOLD} />}
          label="AIA Forms" value={String(BOND_CARDS.length)}
          sub="bond & closeout templates" delay={0.14}
         href="/app/documents"/>
      </div>

      {/* Tab bar + search */}
      <div style={{
        display: 'flex', gap: 4, alignItems: 'center',
        borderBottom: `1px solid rgba(255,255,255,0.08)`,
        marginBottom: 24, overflowX: 'auto',
      }}>
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
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 20px',
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
        <div style={{ marginLeft: 'auto', position: 'relative', minWidth: 230, flexShrink: 0, alignSelf: 'center', marginBottom: 6 }}>
          <MagnifyingGlass size={14} color={DIM} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search this tab…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px 8px 30px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: TEXT, fontSize: 12.5, outline: 'none' }}
          />
        </div>
      </div>

      {/* Tab content */}
      <div>

        {/* ── Pay Applications ──────────────────────────────────────── */}
        {activeTab === 'Library' && (
          <SectionCard
            title="Document Library"
            subtitle="Every generated document, with fresh signed links."
            flush
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '14px 20px 4px' }}>
              <button onClick={() => setLibTypeFilter('')} className="pmBtn" style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: !libTypeFilter ? 'var(--brand-primary-18)' : 'rgba(255,255,255,0.05)', border: `1px solid ${!libTypeFilter ? 'color-mix(in srgb, var(--brand-primary) 45%, transparent)' : 'rgba(255,255,255,0.1)'}`, color: !libTypeFilter ? 'var(--brand-primary-strong)' : '#9CA3AF' }}>
                All · {libDocs.length}
              </button>
              {libTypes.map(t => {
                const n = libDocs.filter(d => d.doc_type === t).length;
                const on = libTypeFilter === t;
                return (
                  <button key={t} onClick={() => setLibTypeFilter(on ? '' : t)} className="pmBtn" style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: on ? 'var(--brand-primary-18)' : 'rgba(255,255,255,0.05)', border: `1px solid ${on ? 'color-mix(in srgb, var(--brand-primary) 45%, transparent)' : 'rgba(255,255,255,0.1)'}`, color: on ? 'var(--brand-primary-strong)' : '#9CA3AF' }}>
                    {docTypeLabel(t)} · {n}
                  </button>
                );
              })}
            </div>
            <div className="pmTable" style={{ margin: '12px 20px 18px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <SortableTh label="Document" sortKey="doc" sort={libSort} onSort={libCycle} style={{ padding: '10px 16px' }} />
                  <SortableTh label="Project" sortKey="project" sort={libSort} onSort={libCycle} style={{ padding: '10px 16px' }} />
                  <SortableTh label="Generated" sortKey="generated" sort={libSort} onSort={libCycle} style={{ padding: '10px 16px' }} />
                  <SortableTh label="Status" sortKey="status" sort={libSort} onSort={libCycle} style={{ padding: '10px 16px' }} />
                  <SortableTh label="Open" sort={libSort} onSort={libCycle} align="right" style={{ padding: '10px 16px' }} />
                </tr></thead>
                <tbody>
                  {loadingLib && <SkeletonRows rows={5} cols={5} />}
                  {errorLib && !loadingLib && <ErrorRow colSpan={5} message="Couldn't Load the Library" onRetry={loadLibrary} />}
                  {!loadingLib && !errorLib && sortedLib.map(doc => (
                    <tr key={doc.id}>
                      {/* The library listed every row by its doc_type, so
                          twenty-eight bid jackets on one project rendered as
                          twenty-eight identical lines. The generator records a
                          title; show it, and keep the type as the second line
                          so the column still scans by kind. */}
                      <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                          {/* Generated library docs are PDFs — show the real type, not a generic row. */}
                          <FileTypeBadge name={doc.file_name ?? doc.title} url={doc.url} mime={doc.mime_type ?? 'application/pdf'} />
                          <span>
                            {doc.title || docTypeLabel(doc.doc_type)}
                            {doc.title && (
                              <div style={{ fontSize: 11.5, fontWeight: 500, color: '#9CA3AF', marginTop: 2 }}>
                                {docTypeLabel(doc.doc_type)}
                              </div>
                            )}
                          </span>
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#9CA3AF' }}>{doc.projectName ?? '—'}</td>
                      <td style={{ padding: '12px 16px', color: '#9CA3AF' }}>{fmtDay(doc.created_at) ?? '—'}</td>
                      <td style={{ padding: '12px 16px' }}><Badge label={doc.status || 'generated'} color="#34D27B" bg="rgba(52,210,123,0.12)" /></td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {/* A bid jacket has a real jacket behind it — drawings,
                            specs, bid form, requirements. Send the GC there
                            rather than to the flattened PDF of one section. */}
                        {doc.doc_type === 'bid-jacket' && doc.source_id && doc.project_id && (
                          <Link
                            href={`/app/projects/${doc.project_id}/bid-packages/${doc.source_id}/jacket`}
                            className="pmBtn"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 8, textDecoration: 'none' }}
                          >
                            Open Jacket
                          </Link>
                        )}
                        <button onClick={() => openLibDoc(doc)} disabled={busyKey === `lib-${doc.id}`} className="pmBtn" title="Open the PDF" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#E4E4E7' }}>
                          <PdfIcon size={16} /> {busyKey === `lib-${doc.id}` ? 'Opening…' : 'Open'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!loadingLib && !errorLib && libDocs.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: '28px 16px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
                      No generated documents yet — create a pay app, invoice PDF, or bond from the tabs above and it lands here.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {([
                      ['Application #','app'],['Period','period'],['Amount Due','amount'],['Status','status'],['Download',undefined],
                    ] as [string, string|undefined][]).map(([h,k]) => (
                      <SortableTh key={h} label={h} sortKey={k} sort={paSort} onSort={paCycle} style={{ padding: '10px 16px' }} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingPayApps ? (
                    <SkeletonRows cols={5} />
                  ) : errorPayApps ? (
                    <ErrorRow colSpan={5} message="Couldn't Load Pay Applications" onRetry={loadPayApps} />
                  ) : visPayApps.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: 0 }}>
                      <PremiumEmpty
                        compact
                        icon={<Receipt size={30} weight="duotone" color={GOLD} />}
                        title={payApps.length > 0 ? 'No Pay Applications Match' : 'No Pay Applications Yet'}
                        description={payApps.length > 0 ? 'Clear the search above to see every record.' : 'Generated AIA G702 / G703 pay applications will appear here.'}
                        action={<Link href="/app/projects" style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Generate New</Link>}
                      />
                    </td></tr>
                  ) : sortedPayApps.map(pa => {
                    const sc = statusConfig[pa.status] || statusConfig.draft;
                    return (
                      <tr key={pa.id} style={{ borderBottom: `1px solid rgba(255,255,255,0.08)` }}>
                        {/* Real pay_applications columns (the list route returns raw rows):
                            app_number, period_from/period_to, current_payment_due — the old
                            appNo/period/amount keys never existed, so every row read #000 / $0.00. */}
                        <td style={{ padding: '12px 16px', color: GOLD, fontWeight: 700 }}>#{String(pa.app_number ?? pa.application_number ?? '').padStart(3, '0')}</td>
                        <td style={{ padding: '12px 16px', color: DIM }}>{[fmtDay(pa.period_from), fmtDay(pa.period_to)].filter(Boolean).join(' – ') || '—'}</td>
                        <td style={{ padding: '12px 16px', color: GOLD, fontWeight: 700 }}>{fmt(pa.current_payment_due ?? pa.net_payment_due)}</td>
                        <td style={{ padding: '12px 16px' }}><Badge label={pa.status} color={sc.color} bg={sc.bg} /></td>
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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {([
                      ['Sub Name','sub'],['Type','type'],['Amount','amount'],['Through Date','through'],['Status','status'],['Download',undefined],
                    ] as [string, string|undefined][]).map(([h,k]) => (
                      <SortableTh key={h} label={h} sortKey={k} sort={lwSort} onSort={lwCycle} style={{ padding: '10px 16px' }} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingLienWaivers ? (
                    <SkeletonRows cols={6} />
                  ) : errorLienWaivers ? (
                    <ErrorRow colSpan={6} message="Couldn't Load Lien Waivers" onRetry={loadLienWaivers} />
                  ) : visLienWaivers.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: 0 }}>
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
                        <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 600 }}>{lw.subName ?? lw.sub_name}</td>
                        <td style={{ padding: '12px 16px', color: DIM }}>{lw.type}</td>
                        <td style={{ padding: '12px 16px', color: TEXT }}>{fmt(lw.amount)}</td>
                        <td style={{ padding: '12px 16px', color: DIM }}>{lw.throughDate ?? lw.through_date}</td>
                        <td style={{ padding: '12px 16px' }}><Badge label={lw.status} color={sc.color} bg={sc.bg} /></td>
                        <td style={{ padding: '12px 16px' }}>
                          <button
                            disabled={busyKey === `lw-${lw.id}`}
                            onClick={() => openOrGenerate(
                              `lw-${lw.id}`,
                              lw.signed_pdf_url ?? lw.pdf_url ?? lw.pdfUrl,
                              {
                                path: '/api/lien-waivers/generate',
                                body: {
                                  projectId: lw.project_id ?? lw.projectId,
                                  waiverType: lw.waiver_type ?? lw.type,
                                  claimantName: lw.claimant_name ?? lw.subName ?? lw.sub_name,
                                  amount: lw.amount,
                                  throughDate: lw.through_date ?? lw.throughDate,
                                  state: lw.state,
                                },
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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {([
                      ['Week Ending','week'],['# Employees','employees'],['Total Gross','gross'],['Status','status'],['Download',undefined],
                    ] as [string, string|undefined][]).map(([h,k]) => (
                      <SortableTh key={h} label={h} sortKey={k} sort={prSort} onSort={prCycle} style={{ padding: '10px 16px' }} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingPayroll ? (
                    <SkeletonRows cols={5} />
                  ) : errorPayroll ? (
                    <ErrorRow colSpan={5} message="Couldn't Load Certified Payroll" onRetry={loadPayroll} />
                  ) : visPayroll.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: 0 }}>
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
                        <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 600 }}>{pr.weekEnding ?? pr.week_ending}</td>
                        <td style={{ padding: '12px 16px', color: DIM }}>{pr.employees}</td>
                        <td style={{ padding: '12px 16px', color: TEXT }}>{fmt(pr.totalGross ?? pr.total_gross ?? 0)}</td>
                        <td style={{ padding: '12px 16px' }}><Badge label={pr.status} color={sc.color} bg={sc.bg} /></td>
                        <td style={{ padding: '12px 16px' }}>
                          <button
                            onClick={() => openOrGenerate(
                              `pr-${pr.id}`,
                              pr.pdf_url ?? pr.pdfUrl ?? pr.url ?? pr.file_url,
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
