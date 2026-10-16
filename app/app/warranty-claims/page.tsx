'use client';
import { jsonRequest } from '@/lib/list-view';
import { useEditRights } from '@/lib/hooks/usePermissions';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DataTable, type Column } from '@/components/ui/kit';
import { useProjects } from '@/lib/hooks/useProjects';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { PremiumSurface, ModuleHero, SectionCard, PremiumEmpty, StatStrip, FlowSteps, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';
import { SUB_TRADES } from '@/lib/construction-intelligence';
import {
  ShieldWarning, ClipboardText, Timer, Warning,
  CurrencyDollar, ShieldSlash, ChartBar, Tag, Wrench, PlusCircle, Buildings,
} from '@phosphor-icons/react';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { StatusPill } from '@/components/ui/Status';
import { localDay } from '@/lib/calendar-day';

/* ───── PALETTE ───── */
const GOLD = 'var(--brand-primary)', BG = 'var(--bg-base)', RAISED = 'var(--bg-surface)', BORDER = 'rgba(255,255,255,0.12)',
  TEXT = 'var(--text-primary)', DIM = 'var(--text-secondary)', GREEN = 'var(--success)', RED = 'var(--danger)',
  AMBER = 'var(--warning)', BLUE = 'var(--brand-primary)', PURPLE = 'var(--warning)';

/* ───── TYPES ───── */
interface WarrantyClaim {
  id: string;
  claim_number: string;
  title: string;
  description: string;
  category: string;
  location: string;
  reported_by: string;
  reported_date: string;
  priority: string;
  status: string;
  assigned_trade: string;
  assigned_contractor: string;
  scheduled_date: string;
  completed_date: string;
  resolution: string;
  cost: number;
  covered_under_warranty: boolean;
  warranty_expiry: string;
  photos: string[];
  notes: string;
  communication_log?: CommEntry[];
}

interface CommEntry {
  id: string;
  date: string;
  from: string;
  message: string;
}

interface Project {
  id: string;
  name: string;
}

/* ───── CONSTANTS ───── */
const CATEGORIES = ['structural','mechanical','electrical','plumbing','roofing','exterior','interior','appliance','landscaping','general','other'];
const PRIORITIES = ['low','medium','high','emergency'];
const STATUSES = ['submitted','acknowledged','scheduled','in_progress','completed','denied','closed'];
const STATUS_FLOW: Record<string, string[]> = {
  submitted: ['acknowledged','denied'],
  acknowledged: ['scheduled','denied'],
  scheduled: ['in_progress','denied'],
  in_progress: ['completed','denied'],
  completed: ['closed'],
  denied: ['closed'],
  closed: [],
};

const PRIORITY_COLORS: Record<string, string> = { low: DIM, medium: AMBER, high: 'var(--warning)', emergency: RED };
const STATUS_COLORS: Record<string, string> = {
  submitted: DIM, acknowledged: BLUE, scheduled: AMBER,
  in_progress: 'var(--warning)', completed: GREEN, denied: RED, closed: 'var(--status-closed)',
};
const CATEGORY_ICONS: Record<string, string> = {
  structural: '\u2302', mechanical: '\u2699', electrical: '\u26A1', plumbing: '\u{1F6BF}',
  roofing: '\u25B2', exterior: '\u{1F3E0}', interior: '\u{1F6AA}', appliance: '\u2668',
  landscaping: '\u2618', general: '\u2605', other: '\u2731',
};

/** A blank claim reported today on this device — fresh each time, not frozen at page load. */
const emptyForm = (): Omit<WarrantyClaim, 'id'> => ({
  claim_number: '', title: '', description: '', category: 'general', location: '',
  reported_by: '', reported_date: localDay(),
  priority: 'medium', status: 'submitted', assigned_trade: '', assigned_contractor: '',
  scheduled_date: '', completed_date: '', resolution: '', cost: 0,
  covered_under_warranty: true, warranty_expiry: '', photos: [], notes: '',
  communication_log: [],
});

/* ───── STYLE HELPERS ───── */
const css = {
  page: { background: BG, minHeight: '100vh', color: TEXT, fontFamily: "'Inter','Segoe UI',sans-serif", padding: 32 } as React.CSSProperties,
  h1: { fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 } as React.CSSProperties,
  h2: { fontSize: 20, fontWeight: 600, color: TEXT, margin: '24px 0 12px' } as React.CSSProperties,
  h3: { fontSize: 16, fontWeight: 600, color: TEXT, margin: '16px 0 8px' } as React.CSSProperties,
  card: { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20, marginBottom: 16 } as React.CSSProperties,
  row: { display: 'flex', gap: 16, flexWrap: 'wrap' as const } as React.CSSProperties,
  stat: (accent: string) => ({ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 20px', flex: '1 1 160px', borderLeft: `4px solid ${accent}` }) as React.CSSProperties,
  statVal: { fontSize: 28, fontWeight: 700, color: TEXT } as React.CSSProperties,
  statLbl: { fontSize: 12, color: DIM, marginTop: 4} as React.CSSProperties,
  badge: (c: string) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: `color-mix(in srgb, ${c} 13%, transparent)`, color: c, border: `1px solid color-mix(in srgb, ${c} 27%, transparent)`, textTransform: 'capitalize' as const }) as React.CSSProperties,
  btn: (bg: string) => ({ padding: '8px 18px', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13, color: bg === GOLD || bg === AMBER ? 'var(--on-brand)' : 'var(--text-primary)', background: bg, transition: 'opacity .15s' }) as React.CSSProperties,
  btnOutline: (c: string) => ({ padding: '6px 14px', border: `1px solid ${c}`, borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12, color: c, background: 'transparent' }) as React.CSSProperties,
  input: { width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const } as React.CSSProperties,
  select: { width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const } as React.CSSProperties,
  textarea: { width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG, color: TEXT, fontSize: 13, minHeight: 80, outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const } as React.CSSProperties,
  label: { fontSize: 12, color: DIM, marginBottom: 4, display: 'block', fontWeight: 500 } as React.CSSProperties,
  field: { flex: '1 1 220px', marginBottom: 12 } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 } as React.CSSProperties,
  th: { textAlign: 'left' as const, padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12} as React.CSSProperties,
  td: { padding: '10px 12px', borderBottom: `1px solid color-mix(in srgb, ${BORDER} 8%, transparent)` } as React.CSSProperties,
  trHover: { cursor: 'pointer', transition: 'background .15s' } as React.CSSProperties,
  overlay: { position: 'fixed' as const, inset: 0, background: 'var(--bg-base)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
  modal: { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28, width: '90%', maxWidth: 820, maxHeight: '90vh', overflowY: 'auto' as const, position: 'relative' as const } as React.CSSProperties,
  close: { position: 'absolute' as const, top: 12, right: 16, background: 'none', border: 'none', color: DIM, fontSize: 22, cursor: 'pointer' } as React.CSSProperties,
  tab: (active: boolean) => ({ minHeight: 44, padding: '8px 18px', border: 'none', borderBottom: active ? `2px solid ${GOLD}` : '2px solid transparent', background: 'transparent', color: active ? GOLD : DIM, fontWeight: active ? 700 : 500, fontSize: 13, cursor: 'pointer' }) as React.CSSProperties,
  photoThumb: { width: 64, height: 64, objectFit: 'cover' as const, borderRadius: 6, border: `1px solid ${BORDER}`, cursor: 'pointer' } as React.CSSProperties,
  timeline: { borderLeft: `2px solid ${BORDER}`, marginLeft: 8, paddingLeft: 20 } as React.CSSProperties,
  timelineDot: (c: string) => ({ width: 12, height: 12, borderRadius: '50%', background: c, position: 'absolute' as const, left: -27, top: 4 }) as React.CSSProperties,
  expiredTag: { display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: `color-mix(in srgb, ${RED} 13%, transparent)`, color: RED, border: `1px solid color-mix(in srgb, ${RED} 27%, transparent)`, marginLeft: 8 } as React.CSSProperties,
};

/* The create form sits beside a context rail on desktop; on a phone the rail
   drops below it (a fixed 320px rail left the form ~20px wide at 390px). */
const CREATE_CSS = `
.wcCreate { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; align-items: start; }
@media (max-width: 900px) { .wcCreate { grid-template-columns: minmax(0, 1fr); } }
`;

/* ───── COMPONENT ───── */
export default function WarrantyClaimsPage() {
  /* state */
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const claimRights = useEditRights('Safety');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard'|'claims'|'create'>('dashboard');
  const [detailClaim, setDetailClaim] = useState<WarrantyClaim | null>(null);
  const [form, setForm] = useState<Omit<WarrantyClaim, 'id'>>(emptyForm);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving this
   *    module (sidebar, field nav, ⌘K, breadcrumb, back) confirms first, and
   *    the draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(activeTab === 'create', form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: 'warranty-claim-create',
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setActiveTab('create'); },
    onSave: () => handleCreate(),
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  /* filters */
  const [fCategory, setFCategory] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fDateFrom, setFDateFrom] = useState('');
  const [fDateTo, setFDateTo] = useState('');
  const [fSearch, setFSearch] = useState('');

  /* dispatch modal */
  const [dispatchClaim, setDispatchClaim] = useState<WarrantyClaim | null>(null);
  const [dispatchForm, setDispatchForm] = useState({ assigned_trade: '', assigned_contractor: '', scheduled_date: '' });

  /* comm log */
  const [commMsg, setCommMsg] = useState('');

  /* photo viewer */
  const [viewPhoto, setViewPhoto] = useState('');

  /* projects — shared SWR cache */
  const { projects: liveProjects } = useProjects();
  useEffect(() => { setProjects(liveProjects as any); }, [liveProjects]);

  /* fetch claims when project changes.
   * A failed read must never render as "no warranty claims" — that is an
   * all-clear on a project that may have open defects. loadError is a distinct,
   * retryable state. */
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!selectedProject) { setClaims([]); setLoadError(''); return; }
    let cancelled = false;
    (async () => {
      setLoading(true); setLoadError('');
      try {
        const r = await fetch(`/api/projects/${selectedProject}/warranty-claims`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `Request failed (${r.status})`);
        if (!cancelled) setClaims(Array.isArray(j.claims) ? j.claims : []);
      } catch (e) {
        if (!cancelled) { setClaims([]); setLoadError(e instanceof Error ? e.message : 'Could not load warranty claims.'); }
      }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [selectedProject, reloadKey]);

  /* helpers */
  const flash = (text: string, type: 'ok' | 'err' = 'ok') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 3500); };
  const today = localDay(); // This device's day — toISOString() is the UTC day, tomorrow from 7 PM on in Iowa.
  const isExpired = (d: string) => d && d < today;

  /* filtered claims */
  const filtered = useMemo(() => {
    let list = [...claims];
    if (fCategory) list = list.filter(c => c.category === fCategory);
    if (fStatus) list = list.filter(c => c.status === fStatus);
    if (fPriority) list = list.filter(c => c.priority === fPriority);
    if (fDateFrom) list = list.filter(c => c.reported_date >= fDateFrom);
    if (fDateTo) list = list.filter(c => c.reported_date <= fDateTo);
    if (fSearch) {
      const q = fSearch.toLowerCase();
      list = list.filter(c => c.title?.toLowerCase().includes(q) || c.claim_number?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q) || c.reported_by?.toLowerCase().includes(q));
    }
    return list;
  }, [claims, fCategory, fStatus, fPriority, fDateFrom, fDateTo, fSearch]);
  const claimColumns: Column<(typeof claims)[number]>[] = [
    { key: 'claim_number', header: 'Claim #', primary: true, phone: 'show', accessor: c => c.claim_number, render: c => <span style={{ fontFamily: 'monospace' }}>{c.claim_number}</span> },
    { key: 'category', header: 'Cat', phone: 'hide', accessor: c => c.category, render: c => <span title={c.category} style={{ fontSize: 16 }}>{CATEGORY_ICONS[c.category] || '\u2731'}</span> },
    { key: 'title', header: 'Title', phone: 'show', accessor: c => c.title, render: c => <span style={{ display: 'inline-block', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom', color: TEXT }}>{c.title}</span> },
    { key: 'priority', header: 'Priority', phone: 'show', accessor: c => ({ low: 0, medium: 1, high: 2, emergency: 3 } as Record<string, number>)[c.priority] ?? 0, render: c => <span style={css.badge(PRIORITY_COLORS[c.priority] || DIM)}>{c.priority}</span> },
    { key: 'status', header: 'Status', phone: 'show', accessor: c => c.status, render: c => <StatusPill module="warranty_claims" status={c.status} size="sm" /> },
    { key: 'reported_date', header: 'Reported', phone: 'show', accessor: c => c.reported_date, render: c => c.reported_date },
    { key: 'assigned_contractor', header: 'Assigned', phone: 'hide', accessor: c => c.assigned_contractor || '', render: c => c.assigned_contractor || '—' },
    { key: 'cost', header: 'Cost', align: 'right', phone: 'hide', accessor: c => Number(c.cost) || 0, render: c => Number(c.cost) ? <span style={{ fontFamily: 'monospace' }}>${(Number(c.cost) || 0).toLocaleString()}</span> : '—' },
    { key: 'warranty_expiry', header: 'Warranty', phone: 'show', accessor: c => c.warranty_expiry || '', render: c => isExpired(c.warranty_expiry) ? <StatusPill module="paperwork" status="expired" size="sm" /> : c.warranty_expiry ? <StatusPill module="paperwork" status="active" size="sm" /> : <span style={{ color: DIM }}>N/A</span> },
    { key: 'actions', header: 'Actions', sortable: false, phone: 'show', render: c => (
      <span style={{ display: 'inline-flex', gap: 6 }} onClick={e => e.stopPropagation()}>
        <button className="k-btn k-btn-secondary k-btn-sm" onClick={() => { setDispatchForm({ assigned_trade: c.assigned_trade || '', assigned_contractor: c.assigned_contractor || '', scheduled_date: c.scheduled_date || '' }); setDispatchClaim(c); }}>Dispatch</button>
        <button className="k-btn k-btn-secondary k-btn-sm" onClick={() => exportClaimPDF(c)}>PDF</button>
      </span>
    ) },
  ];

  /* dashboard stats */
  const stats = useMemo(() => {
    const total = claims.length;
    const open = claims.filter(c => !['completed','denied','closed'].includes(c.status)).length;
    const closed = claims.filter(c => ['completed','closed'].includes(c.status)).length;
    const denied = claims.filter(c => c.status === 'denied').length;
    const totalCost = claims.reduce((s, c) => s + (Number(c.cost) || 0), 0);
    const expiredCount = claims.filter(c => isExpired(c.warranty_expiry)).length;
    const emergency = claims.filter(c => c.priority === 'emergency').length;

    /* avg resolution time */
    const resolved = claims.filter(c => c.completed_date && c.reported_date);
    const avgDays = resolved.length > 0
      ? Math.round(resolved.reduce((s, c) => s + (new Date(c.completed_date).getTime() - new Date(c.reported_date).getTime()) / 86400000, 0) / resolved.length)
      : 0;

    /* Buckets skip rows that carry no value for the dimension — a claim with no
     * category must not become a bar labeled "undefined". */
    const costByCat: Record<string, number> = {};
    claims.forEach(c => { if (c.category && Number(c.cost)) costByCat[c.category] = (costByCat[c.category] || 0) + Number(c.cost); });

    const byTrade: Record<string, number> = {};
    claims.forEach(c => { if (c.assigned_trade) byTrade[c.assigned_trade] = (byTrade[c.assigned_trade] || 0) + 1; });

    const byStatus: Record<string, number> = {};
    claims.forEach(c => { if (c.status) byStatus[c.status] = (byStatus[c.status] || 0) + 1; });

    const byCat: Record<string, number> = {};
    claims.forEach(c => { if (c.category) byCat[c.category] = (byCat[c.category] || 0) + 1; });

    /* How many rows actually back each headline number. A metric with no
     * underlying rows renders an em-dash, not a confident zero. */
    const costedCount = claims.filter(c => Number(c.cost) > 0).length;

    return { total, open, closed, denied, totalCost, expiredCount, emergency, avgDays,
      resolvedCount: resolved.length, costedCount, costByCat, byTrade, byStatus, byCat };
  }, [claims]);

  /* One place that turns a fetch into either the saved row or a thrown, readable
   * error. supabase-js and fetch both fail quietly on their own — a PATCH that
   * matched nothing still resolves — so every write goes through here. */
  async function saveClaim(id: string, patch: Record<string, unknown>): Promise<WarrantyClaim> {
    const res = await fetch(`/api/projects/${selectedProject}/warranty-claims/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j?.claim) throw new Error(j?.error || `Save failed (${res.status})`);
    return j.claim as WarrantyClaim;
  }

  function applySaved(saved: WarrantyClaim) {
    setClaims(prev => prev.map(c => c.id === saved.id ? saved : c));
    setDetailClaim(prev => prev && prev.id === saved.id ? saved : prev);
  }

  /* create claim — claim_number is allocated by the server, never guessed here,
   * and nothing lands in the list unless the DB actually returned a row. */
  async function handleCreate(): Promise<boolean> {
    if (!form.title) { flash('Title is required.', 'err'); return false; }
    if (!selectedProject) { flash('Select a project first.', 'err'); return false; }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${selectedProject}/warranty-claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, project_id: selectedProject }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.claim) throw new Error(j?.error || `Create failed (${res.status})`);
      setClaims(prev => [j.claim as WarrantyClaim, ...prev]);
      setForm(emptyForm());
      setActiveTab('claims');
      flash(`Warranty claim ${(j.claim as WarrantyClaim).claim_number} created.`);
      guard.clearDraft();
      return true;
    } catch (e) { flash(e instanceof Error ? e.message : 'Failed to create claim.', 'err'); }
    finally { setSaving(false); }
    return false;
  }

  /* update status */
  async function updateStatus(claim: WarrantyClaim, newStatus: string) {
    try {
      const saved = await saveClaim(claim.id, {
        status: newStatus,
        completed_date: newStatus === 'completed' ? today : claim.completed_date,
      });
      applySaved(saved);
      flash(`Status updated to ${newStatus}.`);
    } catch (e) { flash(e instanceof Error ? e.message : 'Failed to update status.', 'err'); }
  }

  /* dispatch contractor */
  async function handleDispatch() {
    if (!dispatchClaim) return;
    try {
      const saved = await saveClaim(dispatchClaim.id, {
        ...dispatchForm,
        status: dispatchForm.scheduled_date ? 'scheduled' : dispatchClaim.status,
      });
      applySaved(saved);
      flash('Contractor dispatched.');
      setDispatchClaim(null);
    } catch (e) { flash(e instanceof Error ? e.message : 'Dispatch failed.', 'err'); }
  }

  /* add communication entry */
  async function addCommEntry() {
    if (!commMsg.trim() || !detailClaim) return;
    const entry: CommEntry = { id: `cm-${Date.now()}`, date: new Date().toISOString(), from: 'Staff', message: commMsg };
    const log = [...(detailClaim.communication_log || []), entry];
    try {
      const saved = await saveClaim(detailClaim.id, { communication_log: log });
      applySaved(saved);
      setCommMsg('');
    } catch (e) {
      // The message is NOT added to the thread — showing it there would tell the
      // homeowner's file a note exists that no one else will ever see.
      flash(e instanceof Error ? e.message : 'Message not saved.', 'err');
    }
  }

  /* update resolution + cost on detail */
  async function saveResolution(claim: WarrantyClaim, resolution: string, cost: number) {
    try {
      const saved = await saveClaim(claim.id, { resolution, cost });
      applySaved(saved);
      flash('Resolution saved.');
    } catch (e) { flash(e instanceof Error ? e.message : 'Save failed.', 'err'); }
  }

  /* PDF export */
  function exportClaimPDF(claim: WarrantyClaim) {
    const lines = [
      `WARRANTY CLAIM REPORT`, ``, `Claim #: ${claim.claim_number}`, `Title: ${claim.title}`,
      `Category: ${claim.category}`, `Location: ${claim.location}`, `Priority: ${claim.priority}`,
      `Status: ${claim.status}`, `Reported By: ${claim.reported_by}`, `Reported Date: ${claim.reported_date}`,
      `Warranty Expiry: ${claim.warranty_expiry || 'N/A'}`, `Covered: ${claim.covered_under_warranty ? 'Yes' : 'No'}`,
      ``, `--- Description ---`, claim.description || '(none)',
      ``, `--- Resolution ---`, claim.resolution || '(pending)',
      ``, `Assigned Trade: ${claim.assigned_trade || 'N/A'}`, `Contractor: ${claim.assigned_contractor || 'N/A'}`,
      `Scheduled: ${claim.scheduled_date || 'N/A'}`, `Completed: ${claim.completed_date || 'N/A'}`,
      `Cost: $${(Number(claim.cost) || 0).toLocaleString()}`,
      ``, `--- Notes ---`, claim.notes || '(none)',
      ``, `--- Communication Log ---`,
    ];
    (claim.communication_log || []).forEach(e => lines.push(`[${new Date(e.date).toLocaleString()}] ${e.from}: ${e.message}`));
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${claim.claim_number || 'warranty-claim'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    flash('Claim report exported.');
  }

  /* bar chart helper */
  function MiniBar({ data, colorMap, money, emptyNote }: { data: Record<string, number>; colorMap?: Record<string, string>; money?: boolean; emptyNote?: string }) {
    const entries = Object.entries(data).filter(([k, v]) => k && k !== 'undefined' && k !== 'null' && Number.isFinite(v));
    // No bars is not "all zeroes" — say which datum is missing instead of drawing
    // an empty chart that reads like a measured result.
    if (entries.length === 0) {
      return <div style={{ fontSize: 12, color: DIM, padding: '10px 2px' }}>{emptyNote || 'Not recorded on any claim yet.'}</div>;
    }
    const max = Math.max(...entries.map(([, v]) => v), 1);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 90, fontSize: 12, color: DIM, textTransform: 'capitalize', textAlign: 'right', flexShrink: 0 }}>{k}</span>
            <div style={{ flex: 1, height: 16, background: BG, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(v / max) * 100}%`, background: colorMap?.[k] || GOLD, borderRadius: 4, transition: 'width .4s' }} />
            </div>
            <span style={{ fontSize: 12, color: TEXT, minWidth: 36, textAlign: 'right', whiteSpace: 'nowrap' }}>{money ? `$${(Number(v) || 0).toLocaleString()}` : v}</span>
          </div>
        ))}
      </div>
    );
  }

  /* ──────── RENDER ──────── */
  return (
    <PremiumSurface>
      <style dangerouslySetInnerHTML={{ __html: CREATE_CSS }} />
      {/* header */}
      <ModuleHero
        eyebrow="Warranty Program"
        eyebrowIcon={<ShieldWarning size={13} weight="fill" color="var(--text-secondary)" />}
        title="Warranty"
        accent="Claims"
        subtitle="Track, manage, and resolve warranty claims across all projects"
        actions={<>
          <select style={{ ...css.select, width: 240 }} value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
            <option value="">Select a project…</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button style={goldButtonStyle} className="pmBtn" onClick={() => { setForm(emptyForm()); setActiveTab('create'); }}>
            <PlusCircle size={16} weight="bold" /> New Claim
          </button>
        </>}
      />

      {/* toast */}
      {msg && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 2000, padding: '12px 24px', borderRadius: 8, background: msg.type === 'ok' ? GREEN : RED, color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, boxShadow: '0 4px 20px rgba(0,0,0,.4)' }}>
          {msg.text}
        </div>
      )}

      {/* tabs */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, marginBottom: 20, display: 'flex', gap: 4 }}>
        {(['dashboard','claims','create'] as const).map(t => (
          <button key={t} style={css.tab(activeTab === t)} onClick={() => setActiveTab(t)}>
            {t === 'dashboard' ? 'Dashboard' : t === 'claims' ? 'Claims' : 'Create Claim'}
          </button>
        ))}
      </div>

      {/* Pipeline intelligence strip — the warranty program at a glance (the one summary;
          per-status counts, Denied included, are on the pipeline right under it) */}
      {selectedProject && !loading && !loadError && claims.length > 0 && (
        <>
          <StatStrip items={[
            {href: '/app/warranty-claims',  label: 'Claims', value: stats.total, sub: `${stats.open} open · ${stats.closed} closed` },
            {href: '/app/warranty-claims', label: 'Emergency', value: stats.emergency, accent: stats.emergency > 0 ? RED : undefined, sub: stats.emergency > 0 ? 'Need immediate action' : 'None outstanding' },
            /* An average over zero resolved claims is not "0 days" — it is unknown. */
            {href: '/app/warranty-claims', label: 'Avg Resolution', value: stats.resolvedCount > 0 ? `${stats.avgDays}d` : '—', sub: 'Reported to completed' },
            /* $0 across claims that never had a cost entered is a fabrication. */
            {href: '/app/warranty-claims',  label: 'Warranty Cost', value: stats.costedCount > 0 ? `$${(Number(stats.totalCost) || 0).toLocaleString()}` : '—', sub: `${claims.filter(c => c.covered_under_warranty).length} covered · ${claims.filter(c => !c.covered_under_warranty).length} not covered` },
            {href: '/app/warranty-claims', label: 'Expired Coverage', value: stats.expiredCount, accent: stats.expiredCount > 0 ? RED : undefined, sub: stats.expiredCount > 0 ? 'Claims past warranty' : 'All inside warranty' },
          ]} />
          <StatusPipeline
            byStatus={stats.byStatus}
            active={fStatus}
            onPick={(s) => { setActiveTab('claims'); setFStatus(fStatus === s ? '' : s); }}
          />
        </>
      )}

      {/* New Claim works without a project picked first — the form asks for one. */}
      {!selectedProject && activeTab !== 'create' && (
        <SectionCard flat>
          <PremiumEmpty
            icon={<Buildings size={30} weight="duotone" color="var(--text-secondary)" />}
            title="Select a project"
            description="Choose a project above to view its warranty claims." primary={{ label: 'New Claim', icon: <PlusCircle size={16} weight="bold" />, onClick: () => { setForm(emptyForm()); setActiveTab('create'); } }} perm={['Safety', 'Edit']} />
        </SectionCard>
      )}

      {selectedProject && loading && activeTab !== 'create' && (
        <div style={{ textAlign: 'center', padding: 60, color: DIM }}>Loading warranty claims…</div>
      )}

      {/* A failed read is its OWN state — visually distinct from a project that
          genuinely has no claims, because "no claims" is an all-clear we have
          not earned when the query never came back. */}
      {selectedProject && !loading && loadError && activeTab !== 'create' && (
        <SectionCard>
          <div style={{ padding: '28px 20px', textAlign: 'center' }}>
            <ShieldSlash size={30} weight="duotone" color={RED} />
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, margin: '12px 0 6px' }}>Could not load warranty claims</div>
            <div style={{ fontSize: 13, color: DIM, marginBottom: 16 }}>{loadError}</div>
            <div style={{ fontSize: 12, color: DIM, marginBottom: 16 }}>This is a read failure, not an empty list — open claims may exist on this project.</div>
            <button style={goldButtonStyle} className="pmBtn" onClick={() => setReloadKey(k => k + 1)}>Retry</button>
          </div>
        </SectionCard>
      )}

      {/* ═══ DASHBOARD TAB — teaching empty state when the program has no claims ═══ */}
      {selectedProject && !loading && !loadError && activeTab === 'dashboard' && claims.length === 0 && (
        <SectionCard>
          <PremiumEmpty
            icon={<ShieldWarning size={30} weight="duotone" color="var(--text-secondary)" />}
            title="No warranty claims on this project"
            description="Warranty claims track defects reported after closeout. Each one moves through a pipeline — submitted, acknowledged, scheduled, in progress, completed — with contractor dispatch, cost, and homeowner communication all on the record."
            action={<button style={goldButtonStyle} className="pmBtn" onClick={() => { setForm(emptyForm()); setActiveTab('create'); }}><PlusCircle size={16} weight="bold" /> Log the First Claim</button>}
          />
        </SectionCard>
      )}

      {/* ═══ DASHBOARD TAB ═══ */}
      {selectedProject && !loading && !loadError && activeTab === 'dashboard' && claims.length > 0 && (
        <div>
          {/* charts row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginTop: 24 }}>
            <SectionCard flat title="Claims by Status" icon={<ChartBar size={17} weight="duotone" color="var(--text-secondary)" />}>
              <MiniBar data={stats.byStatus} colorMap={STATUS_COLORS} />
            </SectionCard>
            <SectionCard flat title="Claims by Category" icon={<Tag size={17} weight="duotone" color="var(--text-secondary)" />}>
              <MiniBar data={stats.byCat} emptyNote="No claim has a category set yet." />
            </SectionCard>
            <SectionCard flat title="Cost by Category" icon={<CurrencyDollar size={17} weight="duotone" color="var(--text-secondary)" />}>
              <MiniBar data={stats.costByCat} money emptyNote="No repair cost has been recorded yet." />
            </SectionCard>
            <SectionCard flat title="Claims by Trade" icon={<Wrench size={17} weight="duotone" color="var(--text-secondary)" />}>
              <MiniBar data={stats.byTrade} emptyNote="No claim has been dispatched to a trade yet." />
            </SectionCard>
          </div>
        </div>
      )}

      {/* ═══ CLAIMS LIST TAB ═══ */}
      {selectedProject && !loading && !loadError && activeTab === 'claims' && (
        <div>
          {/* List toolbar — search + category/status/priority; date range rides in extra */}
          <ListToolbar
            module="warranty-claims"
            search={fSearch}
            onSearch={setFSearch}
            searchPlaceholder="Title, claim #, reporter…"
            filters={[
              { key: 'category', label: 'Category', value: fCategory, onChange: setFCategory, allValue: '', allLabel: 'All Categories', options: CATEGORIES },
              { key: 'status', label: 'Status', value: fStatus, onChange: setFStatus, allValue: '', allLabel: 'All Statuses', options: STATUSES.map(s => ({ value: s, label: s.replace('_', ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()) })) },
              { key: 'priority', label: 'Priority', value: fPriority, onChange: setFPriority, allValue: '', allLabel: 'All Priorities', options: PRIORITIES },
            ]}
            count={{ shown: filtered.length, total: claims.length }}
            style={{ marginBottom: 16 }}
            extra={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <SaguaroDatePicker style={{ ...css.input, width: 130 }} value={fDateFrom} onChange={v => setFDateFrom(v)} />
              <span style={{ color: DIM, fontSize: 12 }}>to</span>
              <SaguaroDatePicker style={{ ...css.input, width: 130 }} value={fDateTo} onChange={v => setFDateTo(v)} />
              {(fDateFrom || fDateTo) && (
                <button style={css.btnOutline(DIM)} onClick={() => { setFDateFrom(''); setFDateTo(''); }}>Clear Dates</button>
              )}
            </div>}
          />

          {filtered.length === 0 ? (
            <SectionCard>
              <PremiumEmpty
                icon={<ClipboardText size={30} weight="duotone" color="var(--text-secondary)" />}
                title={claims.length > 0 ? 'No claims match these filters' : 'No warranty claims found'}
                description={claims.length > 0 ? 'Clear the filters above to see the full pipeline again.' : 'Log the first homeowner defect — it enters the pipeline at submitted and tracks dispatch, cost, and communication through closeout.'}
                action={<button style={goldButtonStyle} className="pmBtn" onClick={() => { setForm(emptyForm()); setActiveTab('create'); }}><PlusCircle size={16} weight="bold" /> New Claim</button>}
              />
            </SectionCard>
          ) : (
            <SectionCard flush bodyStyle={{ overflow: 'auto' }}>
              <DataTable<(typeof claims)[number]>
                columns={claimColumns}
                rows={filtered}
                rowKey={c => c.id}
                defaultSort={{ key: 'reported_date', dir: 'desc' }}
                onRowClick={c => setDetailClaim(c)}
                isSelected={c => detailClaim?.id === c.id}
                tableId="company-warranty-claims"
                /* The detail panel's status step, row by row: only a next step in STATUS_FLOW is taken. */
                bulkEdit={{
                  noun: 'claim',
                  allowed: claimRights.edit,
                  status: {
                    options: STATUSES.map(s => ({ value: s, label: s.replace('_', ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()) })),
                    apply: (c, v) => (STATUS_FLOW[c.status] || []).includes(v)
                      ? jsonRequest(`/api/projects/${selectedProject}/warranty-claims/${c.id}`, 'PATCH', { status: v, completed_date: v === 'completed' ? today : c.completed_date })
                      : Promise.resolve(new Response(JSON.stringify({ error: `Claim ${c.claim_number || ''} is ${String(c.status).replace('_', ' ')} and can't move to ${v.replace('_', ' ')}.` }), { status: 409 })),
                  },
                  onDone: () => setReloadKey(k => k + 1),
                }}
                empty="No claims match these filters."
              />
            </SectionCard>
          )}
        </div>
      )}

      {/* ═══ CREATE CLAIM TAB ═══ */}
      {activeTab === 'create' && (
        <div className="wcCreate">
        <SectionCard title="New Warranty Claim" subtitle={selectedProject ? `${projects.find(p => p.id === selectedProject)?.name || 'This project'} — homeowner defect intake` : 'Homeowner defect intake — pick the project it belongs to'} icon={<PlusCircle size={17} weight="duotone" color="var(--text-secondary)" />}>
          <div style={css.row}>
            <div style={css.field}>
              <label style={css.label} htmlFor="wc-project">Project *</label>
              <select id="wc-project" style={{ ...css.select, minHeight: 44 }} value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
                <option value="">Select a project…</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={css.field}><label style={css.label}>Claim #<AutoChip /></label>{selectedProject && !loading && !loadError ? (<><div style={{ ...css.input, display: 'flex', alignItems: 'center', color: 'var(--text-primary)', fontFamily: 'monospace', fontWeight: 700 }}>{`WC-${String(claims.length + 1).padStart(4, '0')}`}</div><div style={{ fontSize: 12, color: 'var(--c-text-2)', marginTop: 4 }}>Numbered automatically — {claims.length} claim{claims.length === 1 ? '' : 's'} on this project so far.</div></>) : (<><div style={{ ...css.input, display: 'flex', alignItems: 'center', color: DIM }}>Assigned on save</div><div style={{ fontSize: 12, color: 'var(--c-text-2)', marginTop: 4 }}>{selectedProject && loading ? 'Reading this project\u2019s claims…' : 'Numbered automatically once the project is picked.'}</div></>)}</div>
          </div>
          <div style={css.row}>
            <div style={css.field}><label style={css.label}>Title *</label><input style={css.input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Master bath shower pan leak" /></div>
            <div style={css.field}><label style={css.label}>Category</label>
              <select style={css.select} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={css.field}><label style={css.label}>Priority</label>
              <select style={css.select} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div style={css.row}>
            <div style={{ ...css.field, flex: '2 1 400px' }}><label style={css.label}>Description</label><textarea style={css.textarea} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          </div>

          <div style={css.row}>
            <div style={css.field}><label style={css.label}>Location</label><input style={css.input} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
            <div style={css.field}><label style={css.label}>Reported By</label><input style={css.input} value={form.reported_by} onChange={e => setForm({ ...form, reported_by: e.target.value })} /></div>
            <div style={css.field}><label style={css.label}>Reported Date{form.reported_date === today && <AutoChip />}</label><SaguaroDatePicker style={css.input} value={form.reported_date} onChange={v => setForm({ ...form, reported_date: v })} /><div style={{ fontSize: 12, color: 'var(--c-text-2)', marginTop: 4 }}>Defaults to today — resolution time is measured from this date.</div></div>
          </div>

          <div style={css.row}>
            <div style={css.field}><label style={css.label}>Assigned Trade</label>
              <select style={css.select} value={form.assigned_trade} onChange={e => setForm({ ...form, assigned_trade: e.target.value })}>
                <option value="">Not assigned yet</option>
                {SUB_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <div style={{ fontSize: 12, color: 'var(--c-text-2)', marginTop: 4 }}>Canonical trade list — drives the claims-by-trade cost rollup.</div>
            </div>
            <div style={css.field}><label style={css.label}>Assigned Contractor</label><input style={css.input} value={form.assigned_contractor} onChange={e => setForm({ ...form, assigned_contractor: e.target.value })} /></div>
            <div style={css.field}><label style={css.label}>Scheduled Date</label><SaguaroDatePicker style={css.input} value={form.scheduled_date} onChange={v => setForm({ ...form, scheduled_date: v })} /></div>
          </div>

          <div style={css.row}>
            <div style={css.field}><label style={css.label}>Warranty Expiry Date</label><SaguaroDatePicker style={css.input} value={form.warranty_expiry} onChange={v => setForm({ ...form, warranty_expiry: v })} /></div>
            <div style={css.field}>
              <label style={css.label}>Covered Under Warranty</label>
              <select style={css.select} value={form.covered_under_warranty ? 'yes' : 'no'} onChange={e => setForm({ ...form, covered_under_warranty: e.target.value === 'yes' })}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div style={css.field}><label style={css.label}>Estimated Cost</label><input style={css.input} type="number" value={form.cost || ''} onChange={e => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })} /></div>
          </div>

          <div style={css.row}>
            <div style={{ ...css.field, flex: '2 1 400px' }}><label style={css.label}>Notes</label><textarea style={css.textarea} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button style={{ ...goldButtonStyle, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }} className="pmBtn" disabled={saving} onClick={handleCreate}>{saving ? 'Saving…' : 'Create Claim'}</button>
            <button style={ghostButtonStyle} className="pmBtn" onClick={() => setActiveTab('claims')}>Cancel</button>
          </div>
        </SectionCard>

        {/* Context rail — what the program already knows + what happens next */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard flat title="Program Snapshot" icon={<ChartBar size={17} weight="duotone" color="var(--text-secondary)" />}>
            <InsightRow label="Open Claims" value={stats.open} />
            <InsightRow label="Emergency" value={stats.emergency} accent={stats.emergency > 0 ? RED : undefined} />
            <InsightRow label="Avg Resolution" value={`${stats.avgDays} days`} />
            <InsightRow label="Warranty Cost" value={`$${(Number(stats.totalCost) || 0).toLocaleString()}`} accent={GOLD} />
            {Object.keys(stats.byCat).length > 0 && <InsightRow label="Most Reported" value={Object.entries(stats.byCat).sort((a, b) => b[1] - a[1])[0][0]} />}
          </SectionCard>
          <SectionCard flat title="After You Create" icon={<Timer size={17} weight="duotone" color="var(--text-secondary)" />}>
            <FlowSteps title="" steps={[
              { title: 'Claim enters the pipeline', desc: 'Starts at submitted — acknowledge it to start the clock.' },
              { title: 'Dispatch the trade', desc: 'Assign a contractor and service date straight from the claims list.' },
              { title: 'Work is tracked to completion', desc: 'Status, cost, and homeowner communication live on the claim.' },
              { title: 'Close with a paper trail', desc: 'Resolution notes and the exportable report finish the record.' },
            ]} />
          </SectionCard>
        </div>
        </div>
      )}

      {/* ═══ CLAIM DETAIL MODAL ═══ */}
      {detailClaim && (
        <div style={css.overlay} onClick={() => setDetailClaim(null)}>
          <div style={css.modal} onClick={e => e.stopPropagation()}>
            <button style={css.close} onClick={() => setDetailClaim(null)}>&times;</button>

            {/* header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)', fontSize: 13 }}>{detailClaim.claim_number}</span>
                <h2 style={{ ...css.h2, marginTop: 4 }}>{detailClaim.title}</h2>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <StatusPill module="warranty_claims" status={detailClaim.status} />
                  <span style={css.badge(PRIORITY_COLORS[detailClaim.priority] || DIM)}>{detailClaim.priority}</span>
                  <span style={{ ...css.badge(GOLD), fontSize: 13 }}>{CATEGORY_ICONS[detailClaim.category] || ''} {detailClaim.category}</span>
                  {isExpired(detailClaim.warranty_expiry) && <span style={css.expiredTag}>Warranty Expired</span>}
                </div>
              </div>
              <button style={css.btnOutline(GOLD)} onClick={() => exportClaimPDF(detailClaim)}>Export PDF</button>
            </div>

            {/* info grid */}
            <div style={{ ...css.card, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, fontSize: 13 }}>
              <div><span style={{ color: DIM }}>Location:</span> {detailClaim.location || '---'}</div>
              <div><span style={{ color: DIM }}>Reported By:</span> {detailClaim.reported_by || '---'}</div>
              <div><span style={{ color: DIM }}>Reported Date:</span> {detailClaim.reported_date || '---'}</div>
              <div><span style={{ color: DIM }}>Warranty Expiry:</span> {detailClaim.warranty_expiry || '---'}</div>
              <div><span style={{ color: DIM }}>Covered:</span> {detailClaim.covered_under_warranty ? 'Yes' : 'No'}</div>
              <div><span style={{ color: DIM }}>Trade:</span> {detailClaim.assigned_trade || '---'}</div>
              <div><span style={{ color: DIM }}>Contractor:</span> {detailClaim.assigned_contractor || '---'}</div>
              <div><span style={{ color: DIM }}>Scheduled:</span> {detailClaim.scheduled_date || '---'}</div>
              <div><span style={{ color: DIM }}>Completed:</span> {detailClaim.completed_date || '---'}</div>
              <div><span style={{ color: DIM }}>Cost:</span> <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>${(Number(detailClaim.cost) || 0).toLocaleString()}</span></div>
            </div>

            {/* description */}
            <div style={css.card}>
              <h3 style={css.h3}>Description</h3>
              <p style={{ color: TEXT, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{detailClaim.description || 'No description provided.'}</p>
            </div>

            {/* status workflow timeline */}
            <div style={css.card}>
              <h3 style={css.h3}>Status Workflow</h3>
              <div style={{ display: 'flex', gap: 0, alignItems: 'center', flexWrap: 'wrap' }}>
                {STATUSES.map((s, i) => {
                  const isCurrent = detailClaim.status === s;
                  const isPast = STATUSES.indexOf(detailClaim.status) > i;
                  const c = isCurrent ? GOLD : isPast ? GREEN : BORDER;
                  return (
                    <React.Fragment key={s}>
                      {i > 0 && <div style={{ width: 24, height: 2, background: isPast ? GREEN : BORDER }} />}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: isCurrent ? GOLD : isPast ? `color-mix(in srgb, ${GREEN} 20%, transparent)` : BG, border: `2px solid ${c}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: isCurrent ? BG : isPast ? GREEN : DIM }}>
                          {isPast ? '\u2713' : i + 1}
                        </div>
                        <span style={{ fontSize: 12, color: isCurrent ? GOLD : DIM, textTransform: 'capitalize', maxWidth: 60, textAlign: 'center' }}>{s.replace('_', ' ')}</span>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
              {/* transition buttons */}
              {STATUS_FLOW[detailClaim.status] && STATUS_FLOW[detailClaim.status].length > 0 && (
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <span style={{ color: DIM, fontSize: 12, lineHeight: '32px' }}>Move to:</span>
                  {STATUS_FLOW[detailClaim.status].map(ns => (
                    <button key={ns} style={css.btn(STATUS_COLORS[ns] || BLUE)} onClick={() => updateStatus(detailClaim, ns)}>
                      {ns.replace('_', ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* photo evidence */}
            {detailClaim.photos && detailClaim.photos.length > 0 && (
              <div style={css.card}>
                <h3 style={css.h3}>Photo Evidence</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {detailClaim.photos.map((p, i) => (
                    <img key={i} src={p} alt={`Evidence ${i + 1}`} style={css.photoThumb} onClick={() => setViewPhoto(p)} />
                  ))}
                </div>
              </div>
            )}

            {/* resolution + cost edit */}
            <div style={css.card}>
              <h3 style={css.h3}>Resolution &amp; Cost</h3>
              <div style={css.row}>
                <div style={{ ...css.field, flex: '2 1 300px' }}>
                  <label style={css.label}>Resolution Notes</label>
                  <textarea
                    style={css.textarea}
                    defaultValue={detailClaim.resolution || ''}
                    id="detail-resolution"
                  />
                </div>
                <div style={{ ...css.field, flex: '0 1 140px' }}>
                  <label style={css.label}>Cost ($)</label>
                  <input
                    style={css.input}
                    type="number"
                    defaultValue={detailClaim.cost || 0}
                    id="detail-cost"
                  />
                </div>
              </div>
              <button style={css.btn(GREEN)} onClick={() => {
                const resEl = document.getElementById('detail-resolution') as HTMLTextAreaElement;
                const costEl = document.getElementById('detail-cost') as HTMLInputElement;
                saveResolution(detailClaim, resEl?.value || '', parseFloat(costEl?.value) || 0);
              }}>Save Resolution</button>
            </div>

            {/* homeowner communication log */}
            <div style={css.card}>
              <h3 style={css.h3}>Homeowner Communication Log</h3>
              <div style={css.timeline}>
                {(detailClaim.communication_log || []).length === 0 && <p style={{ color: DIM, fontSize: 12 }}>No communication entries yet.</p>}
                {(detailClaim.communication_log || []).map(entry => (
                  <div key={entry.id} style={{ position: 'relative', marginBottom: 16, paddingBottom: 4 }}>
                    <div style={css.timelineDot(BLUE)} />
                    <div style={{ fontSize: 12, color: DIM }}>{new Date(entry.date).toLocaleString()} &mdash; {entry.from}</div>
                    <div style={{ fontSize: 13, color: TEXT, marginTop: 2 }}>{entry.message}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input style={{ ...css.input, flex: 1 }} placeholder="Add communication entry…" value={commMsg} onChange={e => setCommMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCommEntry()} />
                <button style={css.btn(BLUE)} onClick={addCommEntry}>Send</button>
              </div>
            </div>

            {/* notes */}
            {detailClaim.notes && (
              <div style={css.card}>
                <h3 style={css.h3}>Notes</h3>
                <p style={{ color: TEXT, fontSize: 13, whiteSpace: 'pre-wrap' }}>{detailClaim.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ DISPATCH MODAL ═══ */}
      {dispatchClaim && (
        <div style={css.overlay} onClick={() => setDispatchClaim(null)}>
          <div style={{ ...css.modal, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <button style={css.close} onClick={() => setDispatchClaim(null)}>&times;</button>
            <h2 style={{ ...css.h2, marginTop: 0 }}>Dispatch Contractor</h2>
            <p style={{ color: DIM, fontSize: 13, marginBottom: 16 }}>Assign trade and contractor for claim <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{dispatchClaim.claim_number}</span></p>
            <div style={css.row}>
              <div style={css.field}>
                <label style={css.label}>Trade</label>
                <select style={css.select} value={dispatchForm.assigned_trade} onChange={e => setDispatchForm({ ...dispatchForm, assigned_trade: e.target.value })}>
                  <option value="">Select a trade…</option>
                  {SUB_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                  {dispatchForm.assigned_trade && !SUB_TRADES.includes(dispatchForm.assigned_trade) && <option value={dispatchForm.assigned_trade}>{dispatchForm.assigned_trade}</option>}
                </select>
              </div>
              <div style={css.field}>
                <label style={css.label}>Contractor</label>
                <input style={css.input} value={dispatchForm.assigned_contractor} onChange={e => setDispatchForm({ ...dispatchForm, assigned_contractor: e.target.value })} placeholder="Contractor name…" />
              </div>
            </div>
            <div style={{ ...css.field, marginTop: 4 }}>
              <label style={css.label}>Service Date</label>
              <SaguaroDatePicker style={css.input} value={dispatchForm.scheduled_date} onChange={v => setDispatchForm({ ...dispatchForm, scheduled_date: v })} />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button style={css.btn(GREEN)} onClick={handleDispatch}>Dispatch</button>
              <button style={css.btnOutline(DIM)} onClick={() => setDispatchClaim(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PHOTO VIEWER MODAL ═══ */}
      {viewPhoto && (
        <div style={css.overlay} onClick={() => setViewPhoto('')}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <button style={{ ...css.close, top: -36, right: 0, color: TEXT, fontSize: 28 }} onClick={() => setViewPhoto('')}>&times;</button>
            <img src={viewPhoto} alt="Claim photo" style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 8, border: `2px solid ${BORDER}` }} />
          </div>
        </div>
      )}

      {/* ═══ FOOTER SUMMARY ═══ */}
      {selectedProject && !loading && !loadError && activeTab === 'claims' && filtered.length > 0 && (
        <SectionCard style={{ marginTop: 16 }} bodyStyle={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', gap: 24 }}>
            <div>
              <span style={{ color: DIM, fontSize: 12}}>Filtered Total Cost</span>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                ${filtered.reduce((s, c) => s + (Number(c.cost) || 0), 0).toLocaleString()}
              </div>
            </div>
            <div>
              <span style={{ color: DIM, fontSize: 12}}>Covered Claims</span>
              <div style={{ fontSize: 18, fontWeight: 700, color: GREEN }}>
                {filtered.filter(c => c.covered_under_warranty).length}
              </div>
            </div>
            <div>
              <span style={{ color: DIM, fontSize: 12}}>Not Covered</span>
              <div style={{ fontSize: 18, fontWeight: 700, color: RED }}>
                {filtered.filter(c => !c.covered_under_warranty).length}
              </div>
            </div>
            <div>
              <span style={{ color: DIM, fontSize: 12}}>Expired Warranties</span>
              <div style={{ fontSize: 18, fontWeight: 700, color: AMBER }}>
                {filtered.filter(c => isExpired(c.warranty_expiry)).length}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={goldOutlineButtonStyle}
              className="pmBtn"
              onClick={() => {
                const csvRows = [
                  ['Claim #','Title','Category','Priority','Status','Reported By','Reported Date','Location','Trade','Contractor','Scheduled','Completed','Cost','Covered','Warranty Expiry','Resolution'].join(','),
                  ...filtered.map(c => [
                    c.claim_number, `"${(c.title || '').replace(/"/g, '""')}"`, c.category, c.priority, c.status,
                    `"${(c.reported_by || '').replace(/"/g, '""')}"`, c.reported_date, `"${(c.location || '').replace(/"/g, '""')}"`,
                    c.assigned_trade, `"${(c.assigned_contractor || '').replace(/"/g, '""')}"`,
                    c.scheduled_date, c.completed_date, c.cost || 0,
                    c.covered_under_warranty ? 'Yes' : 'No', c.warranty_expiry,
                    `"${(c.resolution || '').replace(/"/g, '""')}"`
                  ].join(','))
                ];
                const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'warranty-claims-export.csv';
                a.click();
                URL.revokeObjectURL(url);
                flash('Claims exported to CSV.');
              }}
            >
              Export CSV
            </button>
          </div>
        </SectionCard>
      )}

      {/* ═══ DASHBOARD WARRANTY EXPIRY WATCHLIST ═══ */}
      {selectedProject && !loading && !loadError && activeTab === 'dashboard' && (() => {
        const expiring = claims.filter(c => {
          if (!c.warranty_expiry) return false;
          const exp = new Date(c.warranty_expiry);
          const daysLeft = (exp.getTime() - Date.now()) / 86400000;
          return daysLeft >= 0 && daysLeft <= 30;
        });
        const expired = claims.filter(c => isExpired(c.warranty_expiry));
        const watchlist = [...expired, ...expiring];
        if (watchlist.length === 0) return null;
        return (
          <SectionCard
            title="Warranty Expiry Watchlist"
            subtitle="Claims with expired or soon-to-expire warranties (within 30 days)"
            icon={<Warning size={17} weight="duotone" color={RED} />}
            accent={RED}
            style={{ marginTop: 16 }}
            bodyStyle={{ overflow: 'auto' }}
          >
            <table className="k-table" style={css.table}>
              <thead>
                <tr>
                  <th style={css.th}>Claim</th>
                  <th style={css.th}>Title</th>
                  <th style={css.th}>Category</th>
                  <th style={css.th}>Expiry Date</th>
                  <th style={css.th}>Status</th>
                  <th style={css.th}>Days Left</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map(c => {
                  const daysLeft = Math.ceil((new Date(c.warranty_expiry).getTime() - Date.now()) / 86400000);
                  return (
                    <tr key={c.id} style={css.trHover} onClick={() => { setDetailClaim(c); setActiveTab('claims'); }}
                      onMouseEnter={e => (e.currentTarget.style.background = `color-mix(in srgb, ${BORDER} 20%, transparent)`)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={css.td}><span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{c.claim_number}</span></td>
                      <td style={css.td}>{c.title}</td>
                      <td style={css.td}><span style={{ textTransform: 'capitalize' }}>{c.category}</span></td>
                      <td style={css.td}>{c.warranty_expiry}</td>
                      <td style={css.td}><StatusPill module="warranty_claims" status={c.status} size="sm" /></td>
                      <td style={css.td}>
                        <span style={{ fontWeight: 700, color: daysLeft < 0 ? RED : daysLeft <= 7 ? AMBER : GREEN }}>
                          {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </SectionCard>
        );
      })()}
      <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}

/* Inline primitive — StatusPipeline: the claim pipeline as a horizontal band with
 * live counts per stage. Click a stage to filter the Claims tab; click again to clear. */
function StatusPipeline({ byStatus, active, onPick }: { byStatus: Record<string, number>; active: string; onPick: (s: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, overflowX: 'auto', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '12px 14px', marginBottom: 20, background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))' }}>
      {STATUSES.map((s, i) => {
        const n = Number(byStatus[s]) || 0;
        const on = active === s;
        const c = STATUS_COLORS[s] || DIM;
        return (
          <React.Fragment key={s}>
            {i > 0 && <div style={{ alignSelf: 'center', width: 18, height: 1, background: 'rgba(255,255,255,0.14)', flexShrink: 0 }} />}
            <button
              onClick={() => onPick(s)}
              title={`${n} ${s.replace('_', ' ')} claim${n === 1 ? '' : 's'} — click to filter the list`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 10, cursor: 'pointer', flexShrink: 0, background: on ? 'color-mix(in srgb, var(--brand-primary) 14%, transparent)' : 'transparent', border: `1px solid ${on ? 'color-mix(in srgb, var(--brand-primary) 45%, transparent)' : 'transparent'}` }}
            >
              <span style={{ fontSize: 17, fontWeight: 800, color: n > 0 ? c : DIM, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: on ? GOLD : DIM, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{s.replace('_', ' ')}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
