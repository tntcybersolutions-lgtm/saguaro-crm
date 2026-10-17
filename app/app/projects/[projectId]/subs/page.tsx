'use client';
import { jsonRequest } from '@/lib/list-view';
import { apiErrorFrom } from '@/lib/api-refusal';
import { useEditRights, IfAllowed } from '@/lib/hooks/usePermissions';
import { useProjectContext, refreshProjectContext } from '@/lib/hooks/useProjectContext';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import {
  Handshake, Users, Plus, ShieldWarning, AddressBook, WarningCircle, PencilSimple, Trash,
  ArrowSquareOut, Receipt, Gavel, ShieldCheck, FileText,
} from '@phosphor-icons/react';
import { SUB_TRADES } from '@/lib/construction-intelligence';
import {
  PageShell, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Callout, Menu, Card,
  FormModal, FormGrid, FormSection, Field, Input, Select, DetailList, Toast, useToast,
  type Column, type Action, type StatItem,
} from '@/components/ui/kit';
import Suggest from '@/components/ui/Suggest';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import type { JobSub } from '@/lib/job-subs';

/**
 * The subcontractors on this job.
 *
 * The list is the job's own subs (project_subcontractors, via
 * /api/projects/[id]/subs) with what each is contracted for and has been paid
 * HERE. It used to be the whole company directory, and "Add" created a new
 * directory company every time — picking ABC Electric made a second ABC
 * Electric — without ever putting anyone on the job; the contract amount typed
 * in was thrown away, and the trash button deleted the company itself (from
 * every job, with its insurance and documents). Now:
 *   Add     — type a company: one already in your directory fills the rest and
 *             goes on the job; a new name is added to the directory and the job.
 *   Open    — tap a row: everything on file, this job's contract and payments.
 *   Edit    — the company's details and this job's contract amount.
 *   Remove  — takes the company off THIS job; it stays in the directory.
 *
 * Reads   GET    /api/projects/[id]/subs, GET /api/subs/list (directory)
 * Writes  POST   /api/projects/[id]/subs            (add; 409 = already in directory)
 *         PATCH  /api/projects/[id]/subs/[subId]    (status, details, contract amount)
 *         DELETE /api/projects/[id]/subs/[subId]    (off this job only)
 */

const cap = (s:string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));
const STATUSES = ['active','prequalified','invited','suspended','inactive'];
/** Trade picker options — keeps a stored trade that is not on the standard list. */
const tradeOptions = (cur: string) => [...(cur && !SUB_TRADES.includes(cur) ? [cur] : []), ...SUB_TRADES];
/** Filters persist per viewer under the same key the old list toolbar used. */
const FILTER_KEY = 'sag_flt_subs';

/** A company in the tenant directory (/api/subs/list). */
interface DirSub {
  id: string; name: string; trade: string; contact_name: string; contact_email: string;
  contact_phone: string; license_number: string; insurance_expiry: string; status: string;
  w9_on_file?: boolean; w9_status?: string;
}

// The `subcontractors` table stores company_name / email / phone — normalize
// onto the names this page renders so rows never come back blank.
function normalizeDir(r: any): DirSub {
  return {
    ...r,
    name: r.company_name ?? r.name ?? '',
    contact_email: r.contact_email ?? r.email ?? '',
    contact_phone: r.contact_phone ?? r.phone ?? '',
  };
}

type Paper = { w9_on_file?: boolean | null; w9_status?: string; insurance_expiry?: string | null };
function w9Ok(s: Paper) { return s.w9_on_file === true || s.w9_status === 'submitted'; }
type CoiKind = 'missing' | 'expired' | 'expiring' | 'valid';
function coiState(s: Paper): { label: string; color: string; ok: boolean; kind: CoiKind } {
  if (!s.insurance_expiry) return { label: 'COI not on file', color: 'var(--danger)', ok: false, kind: 'missing' };
  const exp = new Date(String(s.insurance_expiry).slice(0, 10) + 'T00:00:00');
  const days = Math.floor((exp.getTime() - Date.now()) / 86400000);
  const d = exp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (days < 0) return { label: `COI expired ${d}`, color: 'var(--danger)', ok: false, kind: 'expired' };
  if (days <= 30) return { label: `COI expires in ${days}d`, color: 'var(--warning)', ok: true, kind: 'expiring' };
  return { label: `COI valid through ${d}`, color: 'var(--success)', ok: true, kind: 'valid' };
}
function hasComplianceIssue(s: Paper) { return !w9Ok(s) || !coiState(s).ok; }
const tinted = (color: string | undefined, text: React.ReactNode) => <span style={{ color }}>{text}</span>;

const EMPTY_FORM = { name:'', trade:'', contact_name:'', contact_email:'', contact_phone:'', license_number:'', contract_amount:'' };
type SubForm = typeof EMPTY_FORM;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The record's id lives in the URL (?sub=), so a reload lands back on it. */
function subFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('sub');
}

export default function SubsPage() {
  const { projectId } = useParams() as { projectId: string };
  const [subs, setSubs] = useState<JobSub[]>([]);
  const [directory, setDirectory] = useState<DirSub[]>([]);
  const [dirError, setDirError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast, show } = useToast(4000);
  const rights = useEditRights('Projects');
  const setToast = (t: { msg: string; type: 'success' | 'error' }) => show(t.msg, t.type === 'success' ? 'good' : 'bad');
  const [search, setSearch] = useState('');
  const [filterTrade, setFilterTrade] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  /** Stat-tile slice: everyone, or only the subs with a W-9 / COI problem. */
  const [paperOnly, setPaperOnly] = useState(false);
  const [form, setForm] = useState<SubForm>(EMPTY_FORM);
  /** Why Add Subcontractor refused, said beside the button (role="alert"). */
  const [formErr, setFormErr] = useState('');
  const [pickId, setPickId] = useState('');
  const [auto, setAuto] = useState<{name?:boolean;trade?:boolean;contact?:boolean;license?:boolean;amount?:boolean}>({});
  /* The open record, and its edit form. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<SubForm>(EMPTY_FORM);
  const [editErr, setEditErr] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [removing, setRemoving] = useState(false);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `subs:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm({ ...EMPTY_FORM, ...(d as Partial<SubForm>) }); setShowForm(true); },
    onSave: () => handleCreate(),
  });

  // SmartCreate: walk in knowing awards on this job.
  const { ctx } = useProjectContext(projectId);

  // Restore the remembered trade / status filters once, then keep them saved.
  const [filtersRestored, setFiltersRestored] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(FILTER_KEY) || '{}') as { filters?: Record<string, string> };
      if (saved.filters?.trade) setFilterTrade(saved.filters.trade);
      if (saved.filters?.status) setFilterStatus(saved.filters.status);
    } catch { /* private mode or a bad value — start unfiltered */ }
    setFiltersRestored(true);
  }, []);
  useEffect(() => {
    if (!filtersRestored) return;
    try { window.localStorage.setItem(FILTER_KEY, JSON.stringify({ filters: { trade: filterTrade, status: filterStatus } })); }
    catch { /* persistence is best-effort */ }
  }, [filtersRestored, filterTrade, filterStatus]);

  const load = useCallback(async () => {
    setLoading(true);
    const [job, dir] = await Promise.allSettled([
      fetch(`/api/projects/${projectId}/subs`).then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Could not load this job’s subcontractors.');
        return (d.subs || []) as JobSub[];
      }),
      fetch('/api/subs/list').then(async (r) => {
        if (!r.ok) throw await apiErrorFrom(r, 'directory');
        const d = await r.json();
        return ((d.subs || d.data || []) as any[]).map(normalizeDir);
      }),
    ]);
    if (job.status === 'fulfilled') { setSubs(job.value); setLoadError(''); }
    else setLoadError(job.reason instanceof Error ? job.reason.message : 'Could not load this job’s subcontractors.');
    if (dir.status === 'fulfilled') { setDirectory(dir.value); setDirError(false); } else setDirError(true);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  /* ?sub= opens that record — on load, on a reload, and on Back/Forward. */
  useEffect(() => {
    const sync = () => { setOpenId(subFromUrl()); setEditing(false); setEditErr(''); };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const openSub = (id: string) => {
    const u = new URL(window.location.href); u.searchParams.set('sub', id);
    window.history.pushState(null, '', u.toString());
    setOpenId(id); setEditing(false); setEditErr('');
  };
  const closeSub = () => {
    const u = new URL(window.location.href); u.searchParams.delete('sub');
    window.history.replaceState(null, '', u.toString());
    setOpenId(null); setEditing(false); setEditErr('');
  };
  const record = openId ? subs.find((s) => s.id === openId) ?? null : null;

  const onJob = useMemo(() => new Set(subs.map((s) => s.id)), [subs]);
  /** Directory companies not on this job yet — what the Company field suggests. */
  const pickable = useMemo(() => directory.filter((d) => !onJob.has(d.id)), [directory, onJob]);

  // Typing a company already in the directory fills the rest from it.
  function onCompanyName(v: string) {
    if (formErr) setFormErr('');
    const hit = pickable.find((d) => d.name.trim().toLowerCase() === v.trim().toLowerCase());
    if (hit && hit.id !== pickId) {
      const award = ((ctx?.bidPackages || []) as any[]).find(b => b.awardedTo && String(b.awardedTo).toLowerCase() === hit.name.toLowerCase());
      const amount = Number(award?.awardedAmount) || 0;
      setPickId(hit.id);
      setForm({
        name: hit.name, trade: hit.trade || '', contact_name: hit.contact_name || '',
        contact_email: hit.contact_email || '', contact_phone: hit.contact_phone || '',
        license_number: hit.license_number || '', contract_amount: amount > 0 ? String(amount) : form.contract_amount,
      });
      setAuto({ name: true, trade: !!hit.trade, contact: !!(hit.contact_name || hit.contact_email || hit.contact_phone), license: !!hit.license_number, amount: amount > 0 });
      return;
    }
    if (!hit && pickId) { setPickId(''); setAuto({}); }
    setForm((p) => ({ ...p, name: v }));
  }
  const picked = pickId ? directory.find(x => x.id === pickId) : undefined;
  const pickedAward = picked ? ((ctx?.bidPackages || []) as any[]).find(b => b.awardedTo && picked.name && String(b.awardedTo).toLowerCase() === picked.name.toLowerCase()) : undefined;

  const closeForm = () => { setShowForm(false); setForm(EMPTY_FORM); setPickId(''); setAuto({}); setFormErr(''); };
  /** Every close path for the Add modal (X, Cancel, Esc, backdrop) runs through the guard. */
  const requestCloseForm = () => guard.requestClose(closeForm);
  /* Open the Add modal with the cursor in Company Name. */
  const openForm = () => {
    setShowForm(true); setFormErr('');
    requestAnimationFrame(() => {
      const el = document.getElementById('sb-company-name');
      (el as HTMLInputElement | null)?.focus({ preventScroll: true });
    });
  };

  const handleCreate = async (e?: React.FormEvent): Promise<boolean> => {
    e?.preventDefault();
    if (saving) return false;
    // The page owns the rule (the native `required` bubble was easy to miss on a phone).
    if (!form.name.trim()) {
      setFormErr('Enter the company name.');
      document.getElementById('sb-company-name')?.focus();
      return false;
    }
    if (form.contact_email.trim() && !EMAIL_RE.test(form.contact_email.trim())) {
      setFormErr('That email doesn’t look right — fix it or leave it blank.');
      document.getElementById('sb-contact-email')?.focus();
      return false;
    }
    setFormErr('');
    setSaving(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/subs`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ ...form, subcontractorId: pickId || undefined }),
      });
      const b = await r.json().catch(() => ({}));
      if (r.status === 409 && b.existing?.id) {
        // Already in the directory under that name: use it, don't copy it.
        const hit = directory.find((d) => d.id === b.existing.id);
        if (hit) onCompanyName(hit.name);
        setFormErr(`${b.existing.company_name} is already in your directory — its details are filled in. Press Add Subcontractor to put it on this job.`);
        return false;
      }
      if (!r.ok) throw new Error(b.error || 'Could not add the subcontractor.');
      closeForm();
      setToast({msg:`${b.sub?.company_name || 'Subcontractor'} is on this job`,type:'success'});
      guard.clearDraft();
      await load();
      refreshProjectContext(projectId).catch(() => { /* the job's other screens catch up on their next read */ });
      return true;
    } catch (err: unknown) {
      setFormErr(humanError(err,'Could not add the subcontractor. Please try again.'));
    } finally {
      setSaving(false);
    }
    return false;
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    const prev = subs;
    setSubs(p => p.map(s => s.id === id ? {...s, status} : s));
    try {
      const r = await fetch(`/api/projects/${projectId}/subs/${id}`, { method: 'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status}) });
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || 'update failed'); }
    } catch (err) { setSubs(prev); setToast({msg: humanError(err, 'Could not update status. Please try again.'), type:'error'}); }
  };

  const startEdit = (s: JobSub) => {
    setEdit({
      name: s.company_name, trade: s.trade || '', contact_name: s.contact_name || '', contact_email: s.contact_email || '',
      contact_phone: s.contact_phone || '', license_number: s.license_number || '', contract_amount: s.contract_amount ? String(s.contract_amount) : '',
    });
    setEditErr(''); setEditing(true);
  };
  const saveEdit = async () => {
    if (!record || editBusy) return;
    if (!edit.name.trim()) { setEditErr('Company Name: a company needs a name.'); return; }
    if (edit.contact_email.trim() && !EMAIL_RE.test(edit.contact_email.trim())) { setEditErr('Email: that doesn’t look right — fix it or leave it blank.'); return; }
    setEditBusy(true); setEditErr('');
    try {
      const body: Record<string, string> = {
        company_name: edit.name, trade: edit.trade, contact_name: edit.contact_name, contact_email: edit.contact_email,
        contact_phone: edit.contact_phone, license_number: edit.license_number,
      };
      if (record.assignment_ids.length === 1) body.contract_amount = edit.contract_amount;
      const r = await fetch(`/api/projects/${projectId}/subs/${record.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || 'Could not save the subcontractor.');
      if (b.sub) setSubs(p => p.map(s => s.id === record.id ? b.sub : s));
      setEditing(false);
      setToast({msg:'Saved',type:'success'});
      refreshProjectContext(projectId).catch(() => { /* catches up on its next read */ });
    } catch (err) {
      setEditErr(humanError(err, 'Could not save the subcontractor. Please try again.'));
    } finally { setEditBusy(false); }
  };

  const removeFromJob = async (s: JobSub) => {
    const ok = await confirmDialog({
      title: `Remove ${s.company_name} from this job?`,
      message: `${s.company_name} comes off this job. They stay in your directory with their insurance, W-9 and history, ready for the next job.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    setRemoving(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/subs/${s.id}`, { method: 'DELETE' });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || 'Could not take the subcontractor off this job.');
      if (openId === s.id) closeSub();
      setSubs(p => p.filter(x => x.id !== s.id));
      setToast({msg:`${s.company_name} is off this job`,type:'success'});
      refreshProjectContext(projectId).catch(() => { /* catches up on its next read */ });
    } catch (err) {
      const msg = humanError(err, 'Could not take the subcontractor off this job.');
      setEditErr(msg);
      // From a row (no record open) the modal's error line is not on screen.
      if (openId !== s.id) setToast({ msg, type: 'error' });
    } finally { setRemoving(false); }
  };

  const known = subs.length > 0 || (!loading && !loadError);
  const awardedPkgs = ((ctx?.bidPackages || []) as any[]).filter(b => b.awardedTo);
  const complianceIssues = subs.filter(hasComplianceIssue).length;
  const totalContract = subs.reduce((s,sub) => s + (sub.contract_amount||0), 0);
  const totalPaid = subs.reduce((s,sub) => s + (sub.paid_amount||0), 0);

  const subTrades = Array.from(new Set(subs.map(s => s.trade || '').filter(Boolean))).sort();
  const filteredSubs = subs.filter(s => {
    if (search) {
      const q = search.toLowerCase();
      const hit = (s.company_name || '').toLowerCase().includes(q)
        || (s.contact_name || '').toLowerCase().includes(q)
        || (s.contact_email || '').toLowerCase().includes(q)
        || (s.license_number || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (filterTrade !== 'all' && s.trade !== filterTrade) return false;
    if (filterStatus !== 'all' && (s.status || 'active') !== filterStatus) return false;
    if (paperOnly && !hasComplianceIssue(s)) return false;
    return true;
  });
  const filtersActive = !!search || filterTrade !== 'all' || filterStatus !== 'all' || paperOnly;
  const clearFilters = () => { setSearch(''); setFilterTrade('all'); setFilterStatus('all'); setPaperOnly(false); };

  // Until the job's list has loaded (or when it failed) the numbers are unknown, not zero.
  const base = `/app/projects/${projectId}`;
  const stats: StatItem[] = [
    { label: 'Subs on job', value: String(subs.length), sub: awardedPkgs.length ? `${awardedPkgs.length} through bid packages` : undefined, icon: <Users size={15} />, onClick: () => setPaperOnly(false), active: !paperOnly },
    ...(totalContract > 0 ? [{ label: 'Sub contracts', value: fmt(totalContract), sub: `${fmt(totalPaid)} paid`, icon: <Receipt size={15} />, href: `${base}/contracts` } as StatItem] : []),
    { label: 'Paperwork', value: complianceIssues > 0 ? `${complianceIssues} missing` : 'Current', tone: complianceIssues > 0 ? 'bad' : 'good', sub: complianceIssues > 0 ? 'W-9 or COI' : undefined, icon: <ShieldWarning size={15} />, onClick: () => setPaperOnly(true), active: paperOnly },
  ];

  /** The row's verbs — the same calls the record modal makes. */
  const subActions = (s: JobSub): Action[] => [
    { label: 'Open', icon: <ArrowSquareOut size={15} />, onClick: () => openSub(s.id) },
    { label: 'Edit', icon: <PencilSimple size={15} />, onClick: () => { openSub(s.id); startEdit(s); } },
    { label: 'Remove From Job', icon: <Trash size={15} />, onClick: () => { void removeFromJob(s); }, tone: 'danger', disabled: removing },
  ];

  const columns: Column<JobSub>[] = [
    { key: 'name', header: 'Company', primary: true, phone: 'show', accessor: (sub) => sub.company_name || '', render: (sub) => (
      <span className="k-name"><span className="k-avatar" aria-hidden>{(sub.company_name||'?').split(/\s+/).slice(0,2).map((w: string)=>w[0]?.toUpperCase()||'').join('')}</span><span className="k-name-text"><span>{sub.company_name}</span><span>{sub.contact_email}</span></span></span>
    ) },
    { key: 'trade', header: 'Trade', phone: 'show', accessor: (sub) => sub.trade || '', render: (sub) => <span style={{color: 'var(--text-primary)',fontWeight:600}}>{sub.trade||''}</span> },
    { key: 'contact_name', header: 'Contact', phone: 'hide', accessor: (sub) => sub.contact_name || '', render: (sub) => <span className="k-cell-stack"><span>{sub.contact_name||''}</span>{sub.contact_phone && <span>{sub.contact_phone}</span>}</span> },
    { key: 'license_number', header: 'License', phone: 'hide', accessor: (sub) => sub.license_number || '', render: (sub) => sub.license_number ? <span style={{fontFamily:'monospace',fontSize:12}}>{sub.license_number}</span> : <Badge tone="overdue">Not on File</Badge> },
    { key: 'paper', header: 'W-9 / COI', sortable: false, groupable: false, phone: 'show', accessor: (sub) => `${w9Ok(sub) ? 'W-9 on file' : 'W-9 missing'} · ${coiState(sub).label}`, render: (sub) => { const coi = coiState(sub); return (
      <span style={{display:'inline-flex',gap:4,flexWrap:'wrap'}}>
        <Badge tone={w9Ok(sub) ? 'ongoing' : 'overdue'}>{w9Ok(sub) ? 'W-9 on file' : 'W-9 missing'}</Badge>
        <Badge tone={coi.kind === 'valid' ? 'ongoing' : coi.kind === 'expiring' ? 'lead' : 'overdue'}>{`COI · ${coi.label}`}</Badge>
      </span>); } },
    { key: 'contract', header: 'Contract', align: 'right', phone: 'show', total: 'sum', format: fmt, accessor: (sub) => sub.contract_amount || null, render: (sub) => <span style={{color:'var(--text-primary)',fontWeight:600}}>{fmt(sub.contract_amount)}</span> },
    { key: 'paid', header: 'Paid', align: 'right', phone: 'show', total: 'sum', format: fmt, accessor: (sub) => sub.paid_amount || 0, render: (sub) => <span style={{color:'var(--success)',fontWeight:600}}>{fmt(sub.paid_amount)}</span> },
    { key: 'status', header: 'Status', phone: 'show', accessor: (sub) => sub.status || 'active', render: (sub) => (
      <span onClick={e=>e.stopPropagation()}>
        <Select aria-label={`Status of ${sub.company_name}`} value={sub.status||'active'} onChange={e=>handleUpdateStatus(sub.id,e.target.value)} style={{minHeight:30,height:30,fontSize:12,padding:'0 8px',width:'auto'}}
          options={STATUSES.map(s => ({ value: s, label: cap(s) }))} />
      </span>) },
  ];

  /** The picked company's paperwork, or the job's tally before one is picked. */
  const snapshot: [string, React.ReactNode][] = picked
    ? [
        ['W-9', tinted(w9Ok(picked) ? 'var(--success)' : 'var(--danger)', w9Ok(picked) ? 'On file' : 'Missing')],
        ['Insurance', tinted(coiState(picked).color, coiState(picked).label)],
        ['License', tinted(picked.license_number ? undefined : 'var(--warning)', picked.license_number || 'Not on file')],
        ['Directory Status', cap(picked.status || 'active')],
        ...(pickedAward ? [['Award', `${fmt(Number(pickedAward.awardedAmount) || 0)} — ${pickedAward.name}`] as [string, React.ReactNode]] : []),
      ]
    : [
        ['W-9 on File', `${subs.filter(w9Ok).length} / ${subs.length}`],
        ['COI Current', `${subs.filter(s => coiState(s).ok).length} / ${subs.length}`],
      ];

  let body: React.ReactNode;
  if (!loading && loadError && subs.length === 0) {
    // A failed read is not an empty job.
    body = <EmptyState icon={<WarningCircle size={22} />} title="Couldn’t load this job’s subcontractors" text={loadError} action={<Button onClick={() => load()}>Try Again</Button>} />;
  } else if (!loading && !loadError && subs.length === 0) {
    body = <EmptyState icon={<Handshake size={22} />} title="No subcontractors on this job yet" text="Add the first company to start the roster." action={<IfAllowed perm={['Projects', 'Edit']}><Button icon={<Plus size={15} weight="bold" />} onClick={openForm}>Add Subcontractor</Button></IfAllowed>} />;
  } else {
    body = (
      <DataTable<JobSub>
        tableId="project-subs"
        bulkEdit={{
          noun: 'subcontractor',
          allowed: rights.edit,
          status: { options: STATUSES.map(s => ({ value: s, label: cap(s) })), apply: (s, v) => jsonRequest(`/api/projects/${projectId}/subs/${s.id}`, 'PATCH', { status: v }) },
          remove: { allowed: rights.edit, label: 'Remove from job', verb: 'removed', apply: (s) => jsonRequest(`/api/projects/${projectId}/subs/${s.id}`, 'DELETE') },
          onDone: () => { void load(); },
        }}
        exportName="subcontractors"
        columns={columns}
        rows={filteredSubs}
        loading={loading && subs.length === 0}
        rowKey={(sub) => sub.id}
        onRowClick={(sub) => openSub(sub.id)}
        isSelected={(sub) => sub.id === openId}
        rowActions={subActions}
        defaultSort={{ key: 'name', dir: 'asc' }}
        empty={<EmptyState title="No subcontractors match" text="Change the search or the filters." action={<Button onClick={clearFilters}>Clear Filters</Button>} />}
      />
    );
  }

  return (
    <>
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
          { label: 'Subcontractors' },
        ]}
        title="Subcontractors"
        actions={
          <>
            <Menu
              triggerLabel="More"
              triggerIcon={<ArrowSquareOut size={15} />}
              label="Related pages"
              actions={[
                { label: 'Company Directory', icon: <AddressBook size={15} />, href: '/app/subs' },
                { label: 'Compliance', icon: <ShieldCheck size={15} />, href: `${base}/compliance` },
                { label: 'Subcontracts', icon: <FileText size={15} />, href: `${base}/contracts` },
                { label: 'Bid Packages', icon: <Gavel size={15} />, href: `${base}/bid-packages` },
              ]}
            />
            <IfAllowed perm={['Projects', 'Edit']}><Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openForm}>Add Subcontractor</Button></IfAllowed>
          </>
        }
      >
        {known && subs.length > 0 && <StatRow items={stats} />}

        {loadError && subs.length > 0 && (
          <Callout tone="danger" icon={<WarningCircle size={17} />} title="Couldn’t refresh the list" text={loadError} actions={<Button size="sm" onClick={() => load()}>Try Again</Button>} />
        )}

        {subs.length > 0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Company, contact or license"
            filters={
              <>
                <Select aria-label="Trade" value={filterTrade} onChange={e => setFilterTrade(e.target.value)} style={{ width: 'auto', minWidth: 150 }}
                  options={[{ value: 'all', label: 'All Trades' }, ...(filterTrade !== 'all' && !subTrades.includes(filterTrade) ? [filterTrade] : []), ...subTrades]} />
                <Select aria-label="Status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 'auto', minWidth: 150 }}
                  options={[{ value: 'all', label: 'All Statuses' }, ...STATUSES.map(s => ({ value: s, label: cap(s) }))]} />
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={<span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)' }}>{filteredSubs.length} of {subs.length}</span>}
          />
        )}

        <Card flush>{body}</Card>
      </PageShell>

      {/* Add — type a company: one in the directory fills the rest */}
      <FormModal
        open={showForm}
        onClose={requestCloseForm}
        title="Add Subcontractor"
        subtitle="Type a company in your directory — or a new one."
        onSubmit={async () => { await handleCreate(); }}
        submitLabel="Add Subcontractor"
        busy={saving}
        error={formErr || null}
      >
        <FormGrid cols={3}>
          <Field label="Company Name" required hint={auto.name ? 'Filled from your directory.' : dirError ? 'Couldn’t load your directory — a new company still works.' : pickable.length ? `${pickable.length} in your directory — start typing to pick one.` : 'A new company is added to your directory too.'}>
            <Suggest id="sb-company-name" className="k-input" placeholder="ABC Electric LLC" value={form.name} onChange={e=>onCompanyName(e.target.value)} options={pickable.map(d => d.name).filter(Boolean)} aria-required="true" aria-invalid={formErr && !form.name.trim() ? true : undefined} />
          </Field>
          <Field label="Trade">
            <Select id="sb-trade" value={form.trade} onChange={e=>setForm(p=>({...p,trade:e.target.value}))} placeholder="Select trade…" options={tradeOptions(form.trade)} />
          </Field>
          <Field label="Contract Amount on This Job" hint={auto.amount ? (pickedAward ? `From their award on "${pickedAward.name}".` : 'Their committed amount on this project.') : undefined}>
            <Input id="sb-amount" type="number" inputMode="decimal" min={0} step="0.01" placeholder="150000" value={form.contract_amount} onChange={e=>setForm(p=>({...p,contract_amount:e.target.value}))} />
          </Field>
          <Field label="Contact Name">
            <Input id="sb-contact-name" type="text" placeholder="John Smith" value={form.contact_name} onChange={e=>setForm(p=>({...p,contact_name:e.target.value}))} />
          </Field>
          <Field label="Email">
            {/* text + email keyboard: the page owns the email rule (the native bubble was easy to miss). */}
            <Input id="sb-contact-email" type="text" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder="john@abc.com" value={form.contact_email} onChange={e=>{const v=e.target.value;setForm(p=>({...p,contact_email:v}));if(formErr)setFormErr('');}} />
          </Field>
          <Field label="Phone">
            <Input id="sb-contact-phone" type="tel" inputMode="tel" placeholder="(602) 555-1234" value={form.contact_phone} onChange={e=>setForm(p=>({...p,contact_phone:e.target.value}))} />
          </Field>
          <Field label="License #">
            <Input id="sb-license" type="text" placeholder="ROC-123456" value={form.license_number} onChange={e=>setForm(p=>({...p,license_number:e.target.value}))} />
          </Field>
        </FormGrid>
        <FormSection>
          <div className="k-label" style={{ marginBottom: 6 }}>{picked ? `${picked.name} — paperwork` : 'Paperwork on this job'}</div>
          <DetailList items={snapshot} />
        </FormSection>
      </FormModal>

      {/* The record: everything on file, this job's contract and payments; Edit; Remove from this job. */}
      {record && editing && (
        <FormModal
          open
          onClose={() => { if (!editBusy) setEditing(false); }}
          title={`Edit ${record.company_name}`}
          subtitle="Company details change everywhere it works; the contract amount is this job's."
          onSubmit={saveEdit}
          submitLabel="Save Changes"
          busy={editBusy}
          error={editErr}
        >
          <FormGrid cols={2}>
            <Field label="Company Name" required>
              <Input id="sb-edit-name" value={edit.name} onChange={(e) => setEdit(p => ({ ...p, name: e.target.value }))} required />
            </Field>
            <Field label="Trade">
              <Select id="sb-edit-trade" value={edit.trade} onChange={(e) => setEdit(p => ({ ...p, trade: e.target.value }))} placeholder="Select trade…" options={tradeOptions(edit.trade)} />
            </Field>
            <Field label="Contact Name">
              <Input id="sb-edit-contact" value={edit.contact_name} onChange={(e) => setEdit(p => ({ ...p, contact_name: e.target.value }))} />
            </Field>
            <Field label="Email">
              <Input id="sb-edit-email" type="email" inputMode="email" autoCapitalize="none" value={edit.contact_email} onChange={(e) => setEdit(p => ({ ...p, contact_email: e.target.value }))} />
            </Field>
            <Field label="Phone">
              <Input id="sb-edit-phone" type="tel" inputMode="tel" value={edit.contact_phone} onChange={(e) => setEdit(p => ({ ...p, contact_phone: e.target.value }))} />
            </Field>
            <Field label="License #">
              <Input id="sb-edit-license" value={edit.license_number} onChange={(e) => setEdit(p => ({ ...p, license_number: e.target.value }))} />
            </Field>
            <Field label="Contract Amount on This Job" hint={record.assignment_ids.length > 1 ? 'Set by its bid-package awards — change it on the package.' : undefined}>
              <Input id="sb-edit-amount" type="number" inputMode="decimal" min={0} step="0.01" value={edit.contract_amount} disabled={record.assignment_ids.length > 1} onChange={(e) => setEdit(p => ({ ...p, contract_amount: e.target.value }))} />
            </Field>
          </FormGrid>
        </FormModal>
      )}
      {record && !editing && (
        <FormModal
          open
          onClose={closeSub}
          title={record.company_name}
          subtitle={[record.trade, record.from_award ? 'Awarded through a bid package' : null].filter(Boolean).join(' · ') || 'Subcontractor on this job'}
          footer={(
            <>
              {editErr && <span className="k-error" role="alert" style={{ marginRight: 'auto', alignSelf: 'center' }}>{editErr}</span>}
              <Button variant="ghost" onClick={closeSub}>Close</Button>
              <Button variant="danger" icon={<Trash size={15} weight="bold" />} onClick={() => removeFromJob(record)} disabled={removing}>{removing ? 'Removing…' : 'Remove From Job'}</Button>
              <Button variant="primary" icon={<PencilSimple size={15} weight="bold" />} onClick={() => startEdit(record)}>Edit</Button>
            </>
          )}
        >
          <DetailList items={[
            ['Contract on This Job', <strong key="c" style={{ color: 'var(--text-primary)' }}>{fmt(record.contract_amount)}</strong>],
            ['Paid on This Job', tinted('var(--success)', fmt(record.paid_amount))],
            ['Contact', record.contact_name || 'Not on file'],
            ['Email', record.contact_email || 'Not on file'],
            ['Phone', record.contact_phone || 'Not on file'],
            ['License', tinted(record.license_number ? undefined : 'var(--warning)', record.license_number || 'Not on file')],
            ['W-9', tinted(w9Ok(record) ? 'var(--success)' : 'var(--danger)', w9Ok(record) ? 'On file' : 'Missing')],
            ['Insurance', tinted(coiState(record).color, coiState(record).label)],
            ['Directory Status', cap(record.status || 'active')],
          ]} />
        </FormModal>
      )}
      {openId && !record && !loading && (
        <FormModal open onClose={closeSub} size="sm" title="Not on this job" footer={<Button variant="ghost" onClick={closeSub}>Close</Button>}>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55 }}>That company isn’t on this job any more — it may have been removed. It is still in your directory.</p>
        </FormModal>
      )}
      {/* Above the FormModal overlay so the unsaved-work prompt is never hidden behind it. */}
      <div style={{ position: 'relative', zIndex: 10001 }}><UnsavedGuardModal guard={guard} /></div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </>
  );
}
