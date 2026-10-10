'use client';
/*
 * app/app/leads — the lead pipeline: board, list, funnel and per-owner views.
 * Built on components/ui/kit (design system Phase 2). Each lead's full page is
 * app/app/leads/[id]; this board's detail modal is the quick look.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, DownloadSimple, ArrowRight, PencilSimple, Trash, Eye, EnvelopeSimple } from '@phosphor-icons/react';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/errors';
import { fmtDate as fmtDateSafe } from '@/lib/format-date';
import MarkOutcomeModal from '@/components/bids/MarkOutcomeModal';
import { BUILDING_TYPES } from '@/lib/contractor-trades';
import { summariseByStage, LEAD_SOURCES } from '@/lib/lead-stages';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import {
  PageShell, Card, StatRow, Badge, Button, Tabs, Toolbar, DataTable, EmptyState, Menu, DetailList,
  FormModal, Field, Input, Select, Textarea, DateInput, FormGrid, FormSection,
  type Column, type BadgeTone, type Action,
} from '@/components/ui/kit';
import { localDay } from '@/lib/calendar-day';

/* ─── Constants ─── */
const STAGES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'] as const;
type Stage = typeof STAGES[number];
/* Stages read as the six fixed status colors (lib/status-colors). */
const STAGE_TONE: Record<Stage, BadgeTone> = {
  New: 'lead', Contacted: 'lead', Qualified: 'lead', Proposal: 'lead',
  Negotiation: 'lead', Won: 'under_contract', Lost: 'closed',
};
const SOURCES = LEAD_SOURCES; // shared with the deal page's Edit (lib/lead-stages)
const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note'] as const;
const ACTIVITY_LABELS: Record<string, string> = { call: 'Phone Call', email: 'Email', meeting: 'Meeting', note: 'Note' };

/* ─── Types ─── */
type Lead = {
  id: string; company_name: string; contact_name: string; contact_email: string;
  contact_phone: string; source: string; estimated_value: number; stage: Stage;
  notes: string; tags: string[]; created_at: string; updated_at: string;
  project_type?: string | null; next_action_date?: string | null;
  /* Who owns this deal. Stored since lead_pipeline existed and read by
     nothing, so an owner could not tell who was producing. */
  assigned_to?: string | null;
};
type Activity = {
  id: string; lead_id: string; activity_type: string; description: string;
  scheduled_at: string; created_at: string;
};
type View = 'kanban' | 'list' | 'funnel' | 'owners';
type RepRow = { id: string; name: string; open: number; openVal: number; won: number; wonVal: number; lost: number };

/* ─── Helpers ─── */
const fmt = (n: number) =>
  '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
/* Via lib/format-date: next_action_date and the other `date` columns arrive as
   bare YYYY-MM-DD, which new Date() reads as UTC midnight — so every follow-up
   on this board rendered one day early for anyone west of Greenwich. */
const fmtDate = (d: string) => fmtDateSafe(d);
const fmtTime = (d: string) =>
  d ? new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

/* DB numerics can round-trip as strings — coerce before any math. */
const num = (v: unknown) => Number(v) || 0;
/* Suggested first follow-up: 3 days out, while the lead is still warm. */
const plus3d = () => {
  const d = new Date(Date.now() + 3 * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const isOverdue = (l: Lead) =>
  !!l.next_action_date && l.stage !== 'Won' && l.stage !== 'Lost' && new Date(l.next_action_date) < new Date();

const emptyLead = (): Partial<Lead> => ({
  company_name: '', contact_name: '', contact_email: '', contact_phone: '',
  source: 'Website', stage: 'New', estimated_value: 0, notes: '', tags: [],
  project_type: '', next_action_date: plus3d(),
});

/* ═══════════════════════════════ MAIN PAGE ═══════════════════════════════ */
export default function LeadsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('kanban');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  /* lead_pipeline.assigned_to is a uuid; the rep's name lives on profiles.
     /api/team/users maps profiles.full_name onto `name`. */
  const [team, setTeam] = useState<{ id: string; name?: string; full_name?: string; email?: string }[]>([]);
  const [valueMin, setValueMin] = useState('');
  const [valueMax, setValueMax] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editLead, setEditLead] = useState<Partial<Lead> | null>(null);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving this
   *    module (sidebar, field nav, ⌘K, breadcrumb, back) confirms first, and
   *    the draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(showModal && !!editLead, editLead);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: 'lead-create',
    draftData: editLead?.id ? undefined : editLead,
    restoreDraft: (d) => { setEditLead(d as Partial<Lead>); setShowModal(true); },
  });
  const [saving, setSaving] = useState(false);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [actLoading, setActLoading] = useState(false);
  const [actForm, setActForm] = useState({ activity_type: 'call', description: '', scheduled_at: '' });
  const [emailForm, setEmailForm] = useState({ subject: '', message: '' });
  const [emailSending, setEmailSending] = useState(false);
  const [actSaving, setActSaving] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Win/Loss capture — opens MarkOutcomeModal when a lead moves to Won/Lost.
  const [outcomeModal, setOutcomeModal] = useState<{ lead: Lead; outcome: 'won' | 'lost' } | null>(null);

  /* ─── Fetch leads ─── */
  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const r = await fetch('/api/leads');
      if (!r.ok) throw new Error('Failed to load leads');
      const d = await r.json();
      // DB rows come back with email/phone columns — surface them under the
      // names the page renders so contact info never shows blank.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setLeads((d.leads ?? []).map((l: any) => ({
        ...l,
        contact_email: l.contact_email ?? l.email ?? '',
        contact_phone: l.contact_phone ?? l.phone ?? '',
        tags: Array.isArray(l.tags) ? l.tags : [],
      })));
      setError('');
    } catch (e) {
      console.error(e);
      setError(humanError(e, 'Failed to load leads. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  /* ─── Fetch activities for a lead ─── */
  const fetchActivities = useCallback(async (leadId: string) => {
    setActLoading(true);
    try {
      const r = await fetch(`/api/leads/${leadId}/activities`);
      if (!r.ok) throw new Error('Failed to load activities');
      const d = await r.json();
      setActivities(d.activities ?? []);
    } catch {
      setActivities([]);
    } finally {
      setActLoading(false);
    }
  }, []);

  /* ─── Filtering ─── */
  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (stageFilter !== 'all' && l.stage !== stageFilter) return false;
      if (sourceFilter !== 'all' && l.source !== sourceFilter) return false;
      if (ownerFilter !== 'all' && (l.assigned_to || 'unassigned') !== ownerFilter) return false;
      if (valueMin && num(l.estimated_value) < Number(valueMin)) return false;
      if (valueMax && num(l.estimated_value) > Number(valueMax)) return false;
      if (search) {
        const q = search.toLowerCase();
        const fields = [l.company_name, l.contact_name, l.contact_email, l.contact_phone, ...(l.tags || [])];
        if (!fields.some(f => (f || '').toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [leads, stageFilter, sourceFilter, ownerFilter, valueMin, valueMax, search]);
  const filtersOn = !!(search || stageFilter !== 'all' || sourceFilter !== 'all' || ownerFilter !== 'all' || valueMin || valueMax);
  const clearFilters = () => { setSearch(''); setStageFilter('all'); setSourceFilter('all'); setOwnerFilter('all'); setValueMin(''); setValueMax(''); };

  useEffect(() => {
    let live = true;
    fetch('/api/team/users')
      .then(r => (r.ok ? r.json() : { users: [] }))
      .then(d => { if (live) setTeam(Array.isArray(d?.users) ? d.users : []); })
      /* A failed team read must not break the pipeline — the board still works,
         reps just show as Unassigned until it succeeds. */
      .catch(() => { if (live) setTeam([]); });
    return () => { live = false; };
  }, []);

  const ownerName = useCallback((id?: string | null) => {
    if (!id) return 'Unassigned';
    const u = team.find(t => t.id === id);
    return u?.name || u?.full_name || u?.email || 'Unassigned';
  }, [team]);

  /* ─── Pipeline Metrics ─── */
  const metrics = useMemo(() => {
    const totalVal = leads.reduce((s, l) => s + num(l.estimated_value), 0);
    const won = leads.filter(l => l.stage === 'Won');
    const lost = leads.filter(l => l.stage === 'Lost');
    const wonVal = won.reduce((s, l) => s + num(l.estimated_value), 0);
    const activeVal = leads
      .filter(l => l.stage !== 'Won' && l.stage !== 'Lost')
      .reduce((s, l) => s + num(l.estimated_value), 0);
    const winRate = won.length + lost.length > 0
      ? Math.round(won.length / (won.length + lost.length) * 100)
      : 0;
    const avgDeal = won.length > 0 ? wonVal / won.length : 0;
    /* ONE bucketer, shared with the sales overview and the journey signal
       (Path 14). Seed the canonical kanban columns for a stable layout, then
       fill from the shared summary — so a legacy-cased row ('qualified') lands
       in 'Qualified' instead of being dropped. */
    const agg = summariseByStage(leads);
    const byStage: Record<string, { count: number; value: number }> = {};
    STAGES.forEach(s => { byStage[s] = agg[s] || { count: 0, value: 0 }; });
    return { total: leads.length, totalVal, wonVal, activeVal, winRate, avgDeal, byStage };
  }, [leads]);

  /* ─── Per-rep performance ───
     Who is producing. Unassigned is its own row on purpose — leads nobody owns
     are the ones that go cold, and hiding them would hide the problem. */
  const byRep = useMemo(() => {
    const map = new Map<string, RepRow>();
    leads.forEach(l => {
      const id = l.assigned_to || 'unassigned';
      if (!map.has(id)) map.set(id, { id, name: ownerName(l.assigned_to), open: 0, openVal: 0, won: 0, wonVal: 0, lost: 0 });
      const r = map.get(id)!;
      const v = num(l.estimated_value);
      if (l.stage === 'Won') { r.won++; r.wonVal += v; }
      else if (l.stage === 'Lost') { r.lost++; }
      else { r.open++; r.openVal += v; }
    });
    return Array.from(map.values()).sort((a, b) => (b.wonVal - a.wonVal) || (b.openVal - a.openVal));
  }, [leads, ownerName]);

  const ownerOptions = useMemo(
    () => Array.from(new Set(leads.map(l => l.assigned_to || 'unassigned'))),
    [leads],
  );

  /* ─── Create / Update lead ─── */
  const handleSave = async () => {
    if (!editLead) return;
    setSaving(true);
    try {
      const isEdit = !!editLead.id;
      const url = isEdit ? `/api/leads/${editLead.id}` : '/api/leads';
      const method = isEdit ? 'PATCH' : 'POST';
      const body = {
        company_name: editLead.company_name,
        contact_name: editLead.contact_name,
        contact_email: editLead.contact_email,
        contact_phone: editLead.contact_phone,
        source: editLead.source,
        estimated_value: Number(editLead.estimated_value) || 0,
        stage: editLead.stage,
        notes: editLead.notes,
        tags: editLead.tags || [],
        // Parsed by both POST /api/leads and PATCH /api/leads/[id] (verified).
        project_type: editLead.project_type || null,
        next_action_date: editLead.next_action_date || null,
      };
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      setShowModal(false);
      setEditLead(null);
      showToast(isEdit ? 'Lead updated.' : 'Lead created.', 'success');
      fetchLeads();
    } catch (e) {
      console.error(e);
      showToast(humanError(e, "Couldn't save the lead. Please try again."), 'error');
    } finally {
      setSaving(false);
    }
  };
  const closeEditor = () => guard.requestClose(() => { setShowModal(false); setEditLead(null); });
  const openEditor = (lead: Partial<Lead>) => { setDetailLead(null); setEditLead(lead); setTagInput(''); setShowModal(true); };

  /* ─── Move stage ─── */
  const moveToStage = async (lead: Lead, newStage: Stage) => {
    try {
      const r = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      });
      if (!r.ok) throw new Error('Failed to update stage');
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, stage: newStage } : l));
      // On Won/Lost, capture the outcome + reason into the bid learner.
      if (newStage === 'Won' || newStage === 'Lost') {
        setDetailLead(null); // ensure the capture modal isn't hidden behind the detail panel
        setOutcomeModal({ lead: { ...lead, stage: newStage }, outcome: newStage === 'Won' ? 'won' : 'lost' });
      } else {
        showToast(`Moved to ${newStage}.`, 'success');
      }
    } catch (e) {
      console.error(e);
      showToast(humanError(e, "Couldn't move the lead. Please try again."), 'error');
    }
  };

  /* ─── Delete lead (confirmed in a kit modal) ─── */
  const runDelete = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setDeleting(true);
    try {
      const r = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Delete failed');
      setLeads(prev => prev.filter(l => l.id !== id));
      if (detailLead?.id === id) setDetailLead(null);
      setConfirmDelete(null);
      showToast('Lead deleted.', 'success');
    } catch (e) {
      console.error(e);
      showToast(humanError(e, "Couldn't delete the lead. Please try again."), 'error');
    } finally {
      setDeleting(false);
    }
  };

  /* ─── Create activity ─── */
  const handleCreateActivity = async () => {
    if (!detailLead || !actForm.description.trim()) return;
    setActSaving(true);
    try {
      const r = await fetch(`/api/leads/${detailLead.id}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actForm),
      });
      if (!r.ok) throw new Error('Failed to create activity');
      setActForm({ activity_type: 'call', description: '', scheduled_at: '' });
      fetchActivities(detailLead.id);
    } catch (e) {
      console.error(e);
      showToast(humanError(e, "Couldn't add the activity. Please try again."), 'error');
    } finally {
      setActSaving(false);
    }
  };

  /* ─── Send an email to the lead ───
     The route answers 503 when email is not configured and writes no activity
     in that case, so a mail that never left is never logged as sent. */
  const handleSendEmail = async () => {
    if (!detailLead || !emailForm.subject.trim() || !emailForm.message.trim()) return;
    setEmailSending(true);
    try {
      const r = await fetch(`/api/leads/${detailLead.id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailForm),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Request failed (${r.status})`);
      setEmailForm({ subject: '', message: '' });
      fetchActivities(detailLead.id);
      showToast(`Sent to ${detailLead.contact_email || 'the lead'}.`, 'success');
    } catch (e) {
      showToast(humanError(e, "Couldn't send that email."), 'error');
    } finally {
      setEmailSending(false);
    }
  };

  /* ─── Open detail panel ─── */
  const openDetail = (lead: Lead) => {
    setDetailLead(lead);
    setEmailForm({ subject: '', message: '' });
    fetchActivities(lead.id);
  };

  /* ─── Tag management ─── */
  const addTag = () => {
    if (!tagInput.trim() || !editLead) return;
    setEditLead({ ...editLead, tags: [...(editLead.tags || []), tagInput.trim()] });
    setTagInput('');
  };
  const removeTag = (idx: number) => {
    if (!editLead) return;
    setEditLead({ ...editLead, tags: (editLead.tags || []).filter((_, i) => i !== idx) });
  };

  /* ─── Funnel data ─── */
  const funnelData = useMemo(() => {
    const pipeline = STAGES.filter(s => s !== 'Lost');
    let maxCount = 0;
    const data = pipeline.map(s => {
      const count = leads.filter(l => l.stage === s).length;
      if (count > maxCount) maxCount = count;
      const value = leads.filter(l => l.stage === s).reduce((a, l) => a + num(l.estimated_value), 0);
      return { stage: s, count, value };
    });
    return { data, maxCount: maxCount || 1 };
  }, [leads]);

  /* ─── Conversion rates between stages ─── */
  const conversionRates = useMemo(() => {
    const pipeline = STAGES.filter(s => s !== 'Lost');
    const rates: { from: string; to: string; rate: number }[] = [];
    for (let i = 0; i < pipeline.length - 1; i++) {
      const fromCount = leads.filter(l => STAGES.indexOf(l.stage) >= STAGES.indexOf(pipeline[i])).length;
      const toCount = leads.filter(l => STAGES.indexOf(l.stage) >= STAGES.indexOf(pipeline[i + 1])).length;
      rates.push({ from: pipeline[i], to: pipeline[i + 1], rate: fromCount > 0 ? Math.round(toCount / fromCount * 100) : 0 });
    }
    return rates;
  }, [leads]);

  /* ─── CSV Export ─── */
  const exportCSV = () => {
    const cols = [
      'company_name', 'contact_name', 'contact_email', 'contact_phone',
      'source', 'stage', 'estimated_value', 'notes', 'tags', 'created_at',
    ];
    const header = cols.join(',');
    const rows = filtered.map(l =>
      cols.map(c => {
        const v = (l as unknown as Record<string, unknown>)[c];
        const s = Array.isArray(v) ? v.join(';') : String(v ?? '');
        return s.includes(',') ? `"${s}"` : s;
      }).join(',')
    );
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'leads_export.csv';
    a.click();
  };

  /* ─── The lead's verbs — one set, used by the board menu, list rows and the detail modal ─── */
  const leadActions = (lead: Lead, opts: { inlineOpen?: boolean } = {}): Action[] => [
    { label: 'Open Deal Page', icon: <ArrowRight size={14} />, href: `/app/leads/${lead.id}`, inline: opts.inlineOpen },
    { label: 'Quick Look', icon: <Eye size={14} />, onClick: () => openDetail(lead) },
    { label: 'Edit', icon: <PencilSimple size={14} />, onClick: () => openEditor(lead) },
    ...STAGES.filter(s => s !== lead.stage).map((s): Action => ({ label: `Move to ${s}`, onClick: () => moveToStage(lead, s) })),
    { label: 'Delete', icon: <Trash size={14} />, tone: 'danger', onClick: () => setConfirmDelete(lead) },
  ];

  /* ─── Table columns ─── */
  const listColumns: Column<Lead>[] = [
    { key: 'company_name', header: 'Company', primary: true, accessor: (l) => l.company_name || 'Untitled' },
    { key: 'contact_name', header: 'Contact' },
    { key: 'contact_email', header: 'Email' },
    { key: 'stage', header: 'Stage', render: (l) => <Badge tone={STAGE_TONE[l.stage] ?? 'neutral'} dot>{l.stage}</Badge> },
    { key: 'estimated_value', header: 'Value', align: 'right', accessor: (l) => num(l.estimated_value), render: (l) => fmt(l.estimated_value) },
    { key: 'source', header: 'Source' },
    { key: 'owner', header: 'Owner', accessor: (l) => ownerName(l.assigned_to) },
    {
      key: 'next_action_date', header: 'Follow-Up', accessor: (l) => l.next_action_date || null,
      render: (l) => l.next_action_date
        ? <span style={{ color: isOverdue(l) ? 'var(--danger)' : undefined, fontWeight: isOverdue(l) ? 700 : undefined }}>{fmtDate(l.next_action_date)}</span>
        : '—',
    },
    { key: 'created_at', header: 'Created', render: (l) => fmtDate(l.created_at) },
  ];
  const ownerColumns: Column<RepRow>[] = [
    { key: 'name', header: 'Owner', primary: true, render: (r) => <span style={{ color: r.id === 'unassigned' ? 'var(--warning)' : undefined }}>{r.name}</span> },
    { key: 'open', header: 'Open', align: 'right' },
    { key: 'openVal', header: 'Pipeline', align: 'right', render: (r) => fmt(r.openVal) },
    { key: 'won', header: 'Won', align: 'right' },
    { key: 'wonVal', header: 'Won Value', align: 'right', render: (r) => <span style={{ color: r.wonVal > 0 ? 'var(--success)' : undefined }}>{fmt(r.wonVal)}</span> },
    {
      key: 'rate', header: 'Win Rate', align: 'right', accessor: (r) => (r.won + r.lost > 0 ? Math.round((r.won / (r.won + r.lost)) * 100) : null),
      render: (r) => {
        const closed = r.won + r.lost;
        if (!closed) return '—';
        const rate = Math.round((r.won / closed) * 100);
        return <span style={{ fontWeight: 700, color: rate >= 50 ? 'var(--success)' : 'var(--warning)' }}>{rate}%</span>;
      },
    },
  ];
  const stageColumns: Column<{ stage: Stage; count: number; value: number; pct: number }>[] = [
    { key: 'stage', header: 'Stage', render: (r) => <Badge tone={STAGE_TONE[r.stage]} dot>{r.stage}</Badge> },
    { key: 'count', header: 'Count', align: 'right' },
    { key: 'value', header: 'Value', align: 'right', render: (r) => fmt(r.value) },
    { key: 'pct', header: '% of Pipeline', align: 'right', render: (r) => `${r.pct}%` },
  ];

  const emptyAll = (
    <EmptyState
      title="No leads yet"
      text="Track every prospect from first contact to signed contract. Each new lead gets a follow-up 3 days out, and win/loss outcomes feed your bid intelligence."
      action={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={() => openEditor(emptyLead())}>Add Your First Lead</Button>}
    />
  );
  const emptyFiltered = (
    <EmptyState title="No leads match your filters" text="Try a different search or clear the filters." action={<Button onClick={clearFilters}>Clear Filters</Button>} />
  );

  /* ═══════════════════════════════ RENDER ═══════════════════════════════ */
  return (
    <PageShell
      title="Lead Pipeline"
      subtitle={loading ? 'Loading leads…' : `${filtered.length} lead${filtered.length !== 1 ? 's' : ''} · ${fmt(metrics.totalVal)} in the pipeline`}
      actions={
        <>
          <Button icon={<DownloadSimple size={15} />} onClick={exportCSV} disabled={filtered.length === 0}>Export CSV</Button>
          <Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={() => openEditor(emptyLead())}>New Lead</Button>
        </>
      }
    >
      {!loading && !error && leads.length > 0 && (
        <StatRow items={[
          { label: 'Total Pipeline', value: fmt(metrics.totalVal), sub: `${metrics.total} leads` },
          { label: 'Active Pipeline', value: fmt(metrics.activeVal), sub: 'Open stages only' },
          { label: 'Won Revenue', value: fmt(metrics.wonVal), sub: `${metrics.byStage['Won']?.count || 0} deals closed`, tone: metrics.wonVal > 0 ? 'good' : 'default' },
          { label: 'Win Rate', value: `${metrics.winRate}%`, sub: 'Of decided deals', tone: metrics.winRate >= 50 ? 'good' : metrics.winRate >= 25 ? 'warn' : 'bad' },
          { label: 'Avg Deal Size', value: fmt(metrics.avgDeal), sub: 'Won deals' },
        ]} />
      )}

      <Card flush>
        <div style={{ padding: '4px 16px 0' }}>
          <Tabs
            value={view}
            onChange={(k) => setView(k as View)}
            tabs={[
              { key: 'kanban', label: 'Board' },
              { key: 'list', label: 'List', count: loading ? undefined : filtered.length },
              { key: 'funnel', label: 'Funnel' },
              { key: 'owners', label: 'By Owner', count: loading ? undefined : byRep.length },
            ]}
          />
        </div>

        {view !== 'funnel' && view !== 'owners' && (
          <div style={{ padding: 12 }}>
            <Toolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search company, contact, email, tags…"
              filters={
                <>
                  <Select aria-label="Stage" options={[...STAGES]} placeholder="All stages" value={stageFilter === 'all' ? '' : stageFilter} onChange={(e) => setStageFilter(e.target.value || 'all')} style={{ width: 150 }} />
                  <Select aria-label="Source" options={[...SOURCES]} placeholder="All sources" value={sourceFilter === 'all' ? '' : sourceFilter} onChange={(e) => setSourceFilter(e.target.value || 'all')} style={{ width: 150 }} />
                  <Select
                    aria-label="Owner"
                    options={ownerOptions.map(id => ({ value: id, label: id === 'unassigned' ? 'Unassigned' : ownerName(id) }))}
                    placeholder="All owners"
                    value={ownerFilter === 'all' ? '' : ownerFilter}
                    onChange={(e) => setOwnerFilter(e.target.value || 'all')}
                    style={{ width: 160 }}
                  />
                  <Input type="number" inputMode="decimal" aria-label="Minimum value" placeholder="Min $" value={valueMin} onChange={(e) => setValueMin(e.target.value)} style={{ width: 100 }} />
                  <Input type="number" inputMode="decimal" aria-label="Maximum value" placeholder="Max $" value={valueMax} onChange={(e) => setValueMax(e.target.value)} style={{ width: 100 }} />
                </>
              }
              actions={
                <>
                  <span className="k-hint">{filtered.length} of {leads.length}</span>
                  {filtersOn && <Button size="sm" variant="ghost" onClick={clearFilters}>Clear Filters</Button>}
                </>
              }
            />
          </div>
        )}

        {error ? (
          <EmptyState title="Couldn't load leads" text={error} action={<Button onClick={fetchLeads}>Retry</Button>} />
        ) : view === 'list' ? (
          <DataTable
            columns={listColumns}
            rows={filtered}
            rowKey={(l) => l.id}
            loading={loading}
            defaultSort={{ key: 'created_at', dir: 'desc' }}
            onRowClick={openDetail}
            rowActions={(l) => leadActions(l, { inlineOpen: true })}
            empty={leads.length === 0 ? emptyAll : emptyFiltered}
          />
        ) : view === 'owners' ? (
          <>
            <div className="k-hint" style={{ padding: '10px 16px' }}>Click an owner to filter the board and list to their leads.</div>
            <DataTable
              columns={ownerColumns}
              rows={byRep}
              rowKey={(r) => r.id}
              loading={loading}
              onRowClick={(r) => { setOwnerFilter(ownerFilter === r.id ? 'all' : r.id); setView('list'); }}
              empty={emptyAll}
            />
          </>
        ) : view === 'funnel' ? (
          loading ? <div className="k-card-body k-hint">Loading…</div> : leads.length === 0 ? emptyAll : (
            <div className="k-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 860 }}>
                {funnelData.data.map((item, idx) => {
                  const widthPct = Math.max(12, (item.count / funnelData.maxCount) * 100);
                  const rate = conversionRates[idx]?.rate;
                  return (
                    <div key={item.stage}>
                      <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', alignItems: 'center', gap: 12 }}>
                        <span style={{ textAlign: 'right', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{item.stage}</span>
                        <div style={{ width: `${widthPct}%`, minWidth: 140, height: 36, borderRadius: 'var(--radius-sm)', background: 'rgba(255,138,0,0.18)', border: '1px solid rgba(255,138,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', fontSize: 'var(--fs-sm)', fontWeight: 700, gap: 8 }}>
                          <span>{item.count} lead{item.count !== 1 ? 's' : ''}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{fmt(item.value)}</span>
                        </div>
                      </div>
                      {rate != null && (
                        <div className="k-hint" style={{ marginLeft: 108, padding: '2px 0' }}>
                          <span style={{ fontWeight: 700, color: rate >= 50 ? 'var(--success)' : rate >= 25 ? 'var(--warning)' : 'var(--danger)' }}>{rate}%</span> ↓ convert to {conversionRates[idx].to}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <StatRow items={[
                { label: 'Overall Win Rate', value: `${metrics.winRate}%`, tone: metrics.winRate >= 50 ? 'good' : metrics.winRate >= 25 ? 'warn' : 'bad' },
                { label: 'Avg Deal Size (Won)', value: fmt(metrics.avgDeal) },
                { label: 'Active Leads', value: leads.filter(l => l.stage !== 'Won' && l.stage !== 'Lost').length },
              ]} />
              <Card flush title="Stage Breakdown">
                <DataTable
                  columns={stageColumns}
                  rows={STAGES.map(s => ({ stage: s, count: metrics.byStage[s]?.count || 0, value: metrics.byStage[s]?.value || 0, pct: metrics.total ? Math.round(((metrics.byStage[s]?.count || 0) / metrics.total) * 100) : 0 }))}
                  rowKey={(r) => r.stage}
                  onRowClick={(r) => { setStageFilter(r.stage); setView('list'); }}
                />
              </Card>
            </div>
          )
        ) : loading ? (
          <div className="k-card-body k-hint">Loading leads…</div>
        ) : leads.length === 0 ? emptyAll : filtered.length === 0 ? emptyFiltered : (
          /* ═════ BOARD ═════ */
          <div className="k-board" style={{ padding: '0 12px 12px' }}>
            {STAGES.map(stage => {
              const stageLeads = filtered.filter(l => l.stage === stage);
              const stageVal = stageLeads.reduce((s, l) => s + num(l.estimated_value), 0);
              return (
                <section key={stage} className="k-board-col" aria-label={`${stage} — ${stageLeads.length} leads`}>
                  <div className="k-board-head">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Badge tone={STAGE_TONE[stage]} dot>{stage}</Badge>
                      <span className="k-tab-count">{stageLeads.length}</span>
                    </span>
                    <span className="k-hint" style={{ fontWeight: 700 }}>{fmt(stageVal)}</span>
                  </div>
                  <div className="k-board-list">
                    {stageLeads.length === 0 && <div className="k-board-empty">No leads</div>}
                    {stageLeads.map(lead => (
                      <div key={lead.id} className="k-board-card" role="button" tabIndex={0}
                        onClick={() => openDetail(lead)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) openDetail(lead); }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 'var(--fs-md)', color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company_name || 'Untitled'}</span>
                          <Menu actions={leadActions(lead)} label={`Actions for ${lead.company_name || 'lead'}`} />
                        </div>
                        {lead.contact_name && <span className="k-hint">{lead.contact_name}</span>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(lead.estimated_value)}</span>
                          <span className="k-hint">{lead.source}</span>
                        </div>
                        {(lead.project_type || lead.next_action_date) && (
                          <div className="k-hint" style={{ display: 'flex', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.project_type || ''}</span>
                            {lead.next_action_date && (
                              <span style={{ color: isOverdue(lead) ? 'var(--danger)' : undefined, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                Follow-Up {fmtDate(lead.next_action_date)}
                              </span>
                            )}
                          </div>
                        )}
                        {(lead.tags || []).length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {lead.tags.slice(0, 3).map((t, i) => <Badge key={i} tone="gold">{t}</Badge>)}
                            {lead.tags.length > 3 && <span className="k-hint">+{lead.tags.length - 3}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </Card>

      {/* ═══════════════════ ADD / EDIT ═══════════════════ */}
      <FormModal
        open={showModal && !!editLead}
        onClose={closeEditor}
        title={editLead?.id ? 'Edit Lead' : 'New Lead'}
        busy={saving}
        footer={
          <>
            {editLead?.id && (
              <Button variant="danger" icon={<Trash size={15} />} style={{ marginRight: 'auto' }}
                onClick={() => { const l = leads.find(x => x.id === editLead.id); setShowModal(false); setEditLead(null); if (l) setConfirmDelete(l); }}>
                Delete
              </Button>
            )}
            <Button variant="ghost" onClick={closeEditor} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving || !editLead?.company_name?.trim()}>
              {saving ? 'Saving…' : editLead?.id ? 'Update Lead' : 'Create Lead'}
            </Button>
          </>
        }
      >
        {editLead && (
          <FormGrid cols={2}>
            <FormSection>Company & Contact</FormSection>
            <Field label="Company Name" required>
              <Input value={editLead.company_name || ''} onChange={e => setEditLead({ ...editLead, company_name: e.target.value })} placeholder="Acme Corp" autoFocus />
            </Field>
            <Field label="Contact Name">
              <Input value={editLead.contact_name || ''} onChange={e => setEditLead({ ...editLead, contact_name: e.target.value })} placeholder="John Smith" />
            </Field>
            <Field label="Contact Email">
              <Input type="email" value={editLead.contact_email || ''} onChange={e => setEditLead({ ...editLead, contact_email: e.target.value })} placeholder="john@acme.com" />
            </Field>
            <Field label="Contact Phone">
              <Input type="tel" value={editLead.contact_phone || ''} onChange={e => setEditLead({ ...editLead, contact_phone: e.target.value })} placeholder="(555) 123-4567" />
            </Field>

            <FormSection>Deal</FormSection>
            <Field label="Stage">
              <Select options={[...STAGES]} value={editLead.stage || 'New'} onChange={e => setEditLead({ ...editLead, stage: e.target.value as Stage })} />
            </Field>
            <Field label="Estimated Value ($)">
              <Input type="number" inputMode="decimal" value={editLead.estimated_value || ''} onChange={e => setEditLead({ ...editLead, estimated_value: Number(e.target.value) })} placeholder="50000" />
            </Field>
            <Field label="Source">
              <Select options={[...SOURCES]} value={editLead.source || 'Website'} onChange={e => setEditLead({ ...editLead, source: e.target.value })} />
            </Field>
            <Field label="Project Type">
              <Select options={[...BUILDING_TYPES]} placeholder="Select building type…" value={editLead.project_type || ''} onChange={e => setEditLead({ ...editLead, project_type: e.target.value })} />
            </Field>
            <Field
              label="Follow-Up Date"
              hint={editLead.id ? 'Next scheduled touch for this lead.' : 'Suggested 3 days out — first touch while the lead is warm. The card turns red if it slips.'}
            >
              <DateInput value={editLead.next_action_date || ''} onChange={e => setEditLead({ ...editLead, next_action_date: e.target.value })} />
            </Field>
            <Field label="Tags" hint={(editLead.tags || []).length ? 'Click a tag to remove it.' : 'Type a tag and press Enter.'}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder="Add a tag" />
                  <Button onClick={addTag} disabled={!tagInput.trim()} aria-label="Add tag" icon={<Plus size={14} weight="bold" />} />
                </div>
                {(editLead.tags || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {editLead.tags!.map((t, i) => (
                      <button key={i} type="button" onClick={() => removeTag(i)} style={{ all: 'unset', cursor: 'pointer' }} aria-label={`Remove tag ${t}`}>
                        <Badge tone="gold">{t} ✕</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Field>
            <Field label="Notes" span>
              <Textarea value={editLead.notes || ''} onChange={e => setEditLead({ ...editLead, notes: e.target.value })} placeholder="Scope, budget signals, who decides…" />
            </Field>
            {!editLead.id && (
              <p className="k-hint k-span-all">
                After you create it: the lead lands in <strong>{editLead.stage || 'New'}</strong> on the board and counts toward the pipeline. Moving it to Won or Lost opens outcome capture, so every decided deal sharpens future bids.
              </p>
            )}
          </FormGrid>
        )}
      </FormModal>

      {/* ═══════════════════ QUICK LOOK / ACTIVITY ═══════════════════ */}
      <FormModal
        open={!!detailLead}
        onClose={() => setDetailLead(null)}
        title={detailLead?.company_name || 'Lead'}
        subtitle={detailLead ? `${detailLead.contact_name || 'No contact'}${detailLead.contact_email ? ` · ${detailLead.contact_email}` : ''}` : undefined}
        footer={detailLead && (
          <>
            <Button variant="danger" icon={<Trash size={15} />} style={{ marginRight: 'auto' }} onClick={() => setConfirmDelete(detailLead)}>Delete</Button>
            <Button icon={<PencilSimple size={15} />} onClick={() => openEditor(detailLead)}>Edit Lead</Button>
            <Button variant="primary" icon={<ArrowRight size={15} />} onClick={() => router.push(`/app/leads/${detailLead.id}`)}>Open Deal Page</Button>
          </>
        )}
      >
        {detailLead && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <StatRow items={[
              { label: 'Value', value: fmt(detailLead.estimated_value) },
              { label: 'Stage', value: <Badge tone={STAGE_TONE[detailLead.stage] ?? 'neutral'} dot>{detailLead.stage}</Badge> },
              { label: 'Follow-Up', value: detailLead.next_action_date ? fmtDate(detailLead.next_action_date) : '—', tone: isOverdue(detailLead) ? 'bad' : 'default' },
            ]} />

            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
              <div>
                <DetailList items={[
                  ['Source', detailLead.source],
                  ['Phone', detailLead.contact_phone],
                  ['Owner', ownerName(detailLead.assigned_to)],
                  ['Project Type', detailLead.project_type],
                ]} />
                {(detailLead.tags || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                    {detailLead.tags.map((t, i) => <Badge key={i} tone="gold">{t}</Badge>)}
                  </div>
                )}
                {detailLead.notes && <p className="k-hint" style={{ marginTop: 10, whiteSpace: 'pre-wrap', fontSize: 'var(--fs-sm)' }}>{detailLead.notes}</p>}
              </div>
              <div>
                <div className="k-label" style={{ marginBottom: 8 }}>Move to Stage</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {STAGES.map(s => (
                    <Button key={s} size="sm" variant={s === detailLead.stage ? 'primary' : 'secondary'} disabled={s === detailLead.stage}
                      onClick={() => { moveToStage(detailLead, s); if (s !== 'Won' && s !== 'Lost') setDetailLead({ ...detailLead, stage: s }); }}>
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Email the lead — logged as an activity only once the provider accepts it. */}
            {detailLead.contact_email && (
              <Card title={`Email ${detailLead.contact_email}`}>
                <form style={{ display: 'flex', flexDirection: 'column', gap: 8 }} onSubmit={(e) => { e.preventDefault(); void handleSendEmail(); }}>
                  <Input placeholder="Subject" aria-label="Email subject" value={emailForm.subject} onChange={e => setEmailForm({ ...emailForm, subject: e.target.value })} />
                  <Textarea placeholder="Write your message…" aria-label="Email message" value={emailForm.message} onChange={e => setEmailForm({ ...emailForm, message: e.target.value })} rows={4} />
                  <div>
                    <Button type="submit" icon={<EnvelopeSimple size={15} />} disabled={emailSending || !emailForm.subject.trim() || !emailForm.message.trim()}>
                      {emailSending ? 'Sending…' : 'Send Email'}
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            <Card title="Activity">
              <form className="k-toolbar" style={{ marginBottom: 10 }} onSubmit={(e) => { e.preventDefault(); void handleCreateActivity(); }}>
                <Select aria-label="Activity type" options={ACTIVITY_TYPES.map(t => ({ value: t, label: ACTIVITY_LABELS[t] }))} value={actForm.activity_type} onChange={e => setActForm({ ...actForm, activity_type: e.target.value })} style={{ width: 140 }} />
                <DateInput
                  aria-label="Scheduled date"
                  value={(actForm.scheduled_at || '').split('T')[0] || ''}
                  onChange={e => setActForm({ ...actForm, scheduled_at: e.target.value ? `${e.target.value}T${(actForm.scheduled_at || '').split('T')[1] || '09:00'}` : '' })}
                  style={{ width: 160 }}
                />
                <Input
                  type="time"
                  aria-label="Scheduled time"
                  value={(actForm.scheduled_at || '').split('T')[1] || ''}
                  onChange={e => setActForm({ ...actForm, scheduled_at: `${(actForm.scheduled_at || '').split('T')[0] || localDay()}T${e.target.value}` })}
                  style={{ width: 120 }}
                />
                <Input aria-label="Activity description" value={actForm.description} onChange={e => setActForm({ ...actForm, description: e.target.value })} placeholder="Describe this activity…" style={{ flex: '1 1 200px', width: 'auto' }} />
                <Button type="submit" variant="primary" disabled={actSaving || !actForm.description.trim()}>{actSaving ? 'Logging…' : 'Log'}</Button>
              </form>
              {actLoading ? (
                <div className="k-hint">Loading activities…</div>
              ) : activities.length === 0 ? (
                <div className="k-board-empty">No activities logged yet. Add the first one above.</div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {activities.map((act) => (
                    <div key={act.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Badge tone={act.activity_type === 'note' ? 'neutral' : 'lead'}>{ACTIVITY_LABELS[act.activity_type] || act.activity_type}</Badge>
                          {act.scheduled_at && <span className="k-hint">Scheduled {fmtDate(act.scheduled_at)} {fmtTime(act.scheduled_at)}</span>}
                        </span>
                        <span className="k-hint">{fmtDate(act.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>{act.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </FormModal>

      {/* ═══════════════════ DELETE CONFIRMATION ═══════════════════ */}
      <FormModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        size="sm"
        busy={deleting}
        title="Delete Lead?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" icon={<Trash size={15} />} onClick={runDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)' }}>
          {confirmDelete?.company_name || 'This lead'} and its activity history will be permanently removed. This can’t be undone.
        </p>
      </FormModal>

      {/* ═══════════════════ WIN/LOSS OUTCOME CAPTURE ═══════════════════ */}
      {outcomeModal && (
        <MarkOutcomeModal
          open
          onClose={() => setOutcomeModal(null)}
          source="lead"
          sourceId={outcomeModal.lead.id}
          defaultOutcome={outcomeModal.outcome}
          projectName={outcomeModal.lead.company_name || outcomeModal.lead.contact_name}
          ourAmount={num(outcomeModal.lead.estimated_value) || undefined}
          onRecorded={() => { setOutcomeModal(null); fetchLeads(); }}
        />
      )}
      <UnsavedGuardModal guard={guard} />
    </PageShell>
  );
}
