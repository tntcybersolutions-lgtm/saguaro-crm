'use client';
/**
 * Crews — Pass 4, on the RFIs reference layout (dense table + roster + rail).
 *
 * Web parity with the mobile Crews screen (Saguaro-Field app/crews.tsx): the
 * crew register (status / foreman / trade / member count) beside a roster
 * workspace — inline add-member composer, remove, crew edit, archive. Crews
 * built here feed the daily-log manpower prefill — that is the payoff the
 * empty state teaches.
 *
 * Every write funnels through the one branch-dispatched route this screen
 * already used:
 *   list     GET  /api/projects/[id]/crews[?archived=1]
 *   create   POST same URL { name, foremanName, trade, status, notes }
 *   update   POST same URL { crewId, ... }
 *   archive  POST same URL { crewId, archive: true } / { crewId, restore: true }
 *   members  POST same URL { crewId, addMember } / { removeMemberId }
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { humanError } from '@/lib/errors';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import {
  UsersThree, HardHat, User, UserPlus, Plus, X, Wrench,
  Archive, ArrowCounterClockwise, PencilSimple, ClipboardText, ArrowClockwise, WarningCircle,
} from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, RowActions,
  FormModal, Field, Input, Textarea, Select, FormGrid, DetailList, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import { SUB_TRADES } from '@/lib/construction-intelligence';
import { layout } from '@/lib/design-tokens';

interface CrewMember { id: string; person_name: string; role: string | null; trade: string | null; }
interface Crew {
  id: string; name: string; foreman_name: string | null; trade: string | null;
  status: string | null; notes: string | null; deleted_at: string | null;
  memberCount: number; members: CrewMember[];
}

const STATUS_FILTERS = ['all', 'active', 'standby', 'inactive'] as const;

// crews.status is free text — map the known values to a badge tone, default neutral.
function statusBadge(status: string | null | undefined, archived = false): { label: string; tone: BadgeTone } {
  if (archived) return { label: 'Archived', tone: 'closed' };
  switch ((status ?? '').toLowerCase()) {
    case 'active':   return { label: 'Active', tone: 'ongoing' };
    case 'standby':  return { label: 'Standby', tone: 'under_contract' };
    case 'inactive': return { label: 'Inactive', tone: 'closed' };
    default:         return { label: status ? cap(status) : '—', tone: 'neutral' };
  }
}
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

type Panel =
  | { mode: 'roster'; crewId: string }
  | { mode: 'edit'; crewId: string }
  | { mode: 'create' }
  | null;

const EMPTY_FORM = { name: '', foremanName: '', trade: '', status: 'active', notes: '' };

const CSS = `
.crWs > .k-page { max-width: none; }
.crCq { container: crws / inline-size; min-width: 0; }
.crSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.crSplit > * { min-width: 0; }
@container crws (min-width: 1080px) {
  .crSplit[data-open="true"] { grid-template-columns: minmax(340px, 0.8fr) minmax(0, 1.6fr); }
}
.crDetailCq { container: crdetail / inline-size; min-width: 0; }
.crDetail { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.crDetail > * { min-width: 0; }
.crRail { order: -1; }
@container crdetail (min-width: 720px) {
  .crDetail { grid-template-columns: minmax(0, 1fr) clamp(${layout.detailRailMin}px, 34%, ${layout.detailRailMax}px); }
  .crRail { order: 0; position: sticky; top: 16px; }
}
.crList .k-table th:first-child, .crList .k-table td:first-child { position: sticky; left: 0; z-index: 1; background: var(--bg-solid); }
.crList .k-table th:first-child { background: var(--bg-solid-2); z-index: 3; }
.crList .k-table tbody tr:hover td:first-child { background: linear-gradient(rgba(255,255,255,0.03), rgba(255,255,255,0.03)), var(--bg-solid); }
.crList .k-table tbody tr:has([data-sel="true"]) td { background: var(--brand-primary-08); }
.crList .k-table tbody tr:has([data-sel="true"]) td:first-child { background: linear-gradient(var(--brand-primary-08), var(--brand-primary-08)), var(--bg-solid); box-shadow: inset 3px 0 0 var(--brand-primary); }
.crName { display: inline-block; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; color: var(--text-primary); font-weight: 700; }
.crMuted { color: var(--text-tertiary); }
.crNum { font-variant-numeric: tabular-nums; }
.crBadges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.crSection { display: flex; flex-direction: column; gap: 8px; }
.crSection + .crSection { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-subtle); }
.crSectionTitle { display: flex; align-items: center; gap: 8px; font-size: var(--fs-sm); font-weight: 700; color: var(--text-tertiary); }
.crProse { font-size: var(--fs-md); line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; max-width: ${layout.readingMaxWidth}; }
.crMembers { display: flex; flex-direction: column; gap: 8px; }
.crMember { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: var(--radius-sm); background: var(--bg-surface-2); border: 1px solid var(--border-subtle); }
.crAvatar { width: 32px; height: 32px; border-radius: 16px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; background: var(--brand-primary-12); border: 1px solid var(--brand-primary-25); color: var(--brand-primary); }
.crMemberName { flex: 1; min-width: 0; }
.crMemberName > div:first-child { font-size: var(--fs-sm); font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crMemberName > div + div { font-size: var(--fs-xs); color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crEmptyRoster { padding: 16px; border-radius: var(--radius-sm); border: 1px dashed var(--border-default); font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.5; }
.crAdd { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.crAddRow { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
.crActions { display: flex; flex-direction: column; gap: 8px; }
.crActions .k-btn { width: 100%; justify-content: flex-start; }
.crActionsRow { display: flex; gap: 8px; align-items: center; }
.crActionsRow > .k-btn { flex: 1 1 auto; }
.crNext { display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.5; }
.crInlineErr { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: var(--fs-sm); color: var(--status-overdue); }
@media (max-width: 640px) {
  .crWs .k-btn, .crWs .k-stat, .crWs select.k-select, .crWs .k-input { min-height: 44px; }
  .crWs .k-table td { height: 48px; }
  .crName { max-width: 200px; }
  .crAddRow { grid-template-columns: minmax(0, 1fr); }
}
`;

export default function CrewsPage() {
  const { projectId } = useParams() as { projectId: string };
  const { ctx } = useProjectContext(projectId);

  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const detailRef = useRef<HTMLDivElement>(null);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving this
   *    module (sidebar, field nav, ⌘K, breadcrumb, back) confirms first, and
   *    the draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(panel?.mode==='create'||panel?.mode==='edit', form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `crews:${projectId}`,
    draftData: panel?.mode==='create'?form:undefined,
    restoreDraft: (d) => { setForm({ ...EMPTY_FORM, ...(d as object) }); setPanel({ mode: 'create' }); },
    onSave: () => saveCrew(),
  });
  const [saving, setSaving] = useState(false);
  const { toast, show: showToast } = useToast(4000);

  const key = projectId ? `/api/projects/${projectId}/crews${showArchived ? '?archived=1' : ''}` : null;
  const { data, error: loadError, isLoading, mutate } = useSWR<{ crews: Crew[] }>(
    key,
    async (url: string) => {
      const h = await getAuthHeaders();
      const r = await fetch(url, { headers: h });
      if (!r.ok) throw new Error('Failed to load crews.');
      return r.json();
    },
    { revalidateOnFocus: false, keepPreviousData: true }
  );
  const crews: Crew[] = data?.crews ?? [];
  const loading = isLoading && !data;

  // POST helper — every write funnels through the one branch-dispatched route.
  async function post(body: Record<string, any>) {
    const h = await getAuthHeaders();
    const r = await fetch(`/api/projects/${projectId}/crews`, {
      method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d?.error || 'Save failed.');
    }
    return r.json();
  }

  const filtered = useMemo(() => crews.filter((c) => {
    const fs = statusFilter === 'all' || (c.status ?? '').toLowerCase() === statusFilter;
    const q = search.trim().toLowerCase();
    const ms = !q
      || c.name.toLowerCase().includes(q)
      || (c.foreman_name ?? '').toLowerCase().includes(q)
      || (c.trade ?? '').toLowerCase().includes(q)
      || c.members.some((m) => m.person_name.toLowerCase().includes(q));
    return fs && ms;
  }), [crews, statusFilter, search]);

  const totalMembers = crews.reduce((s, c) => s + (c.memberCount || 0), 0);
  const tradesCovered = new Set(crews.map((c) => c.trade).filter(Boolean)).size;
  const activeCount = crews.filter((c) => (c.status ?? '').toLowerCase() === 'active').length;
  const standbyCount = crews.filter((c) => (c.status ?? '').toLowerCase() === 'standby').length;

  const selected = panel && panel.mode !== 'create'
    ? crews.find((c) => c.id === panel.crewId) ?? null
    : null;

  function openCreate() { setForm({ ...EMPTY_FORM }); setPanel({ mode: 'create' }); }
  function openEdit(c: Crew) {
    setForm({ name: c.name, foremanName: c.foreman_name ?? '', trade: c.trade ?? '',
      status: c.status ?? 'active', notes: c.notes ?? '' });
    setPanel({ mode: 'edit', crewId: c.id });
  }
  function closePanel() { setPanel(null); }
  function openRoster(c: Crew) { setPanel({ mode: 'roster', crewId: c.id }); }

  // Stacked layouts: once the roster is in the DOM, bring it into view instead of leaving it below the fold.
  const rosterOpen = !!selected && panel?.mode !== 'create';
  useEffect(() => {
    if (!rosterOpen) return;
    const el = detailRef.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterOpen, selected?.id]);

  // ── Crew create / edit — optimistic: the row lands instantly, network settles after ──
  async function saveCrew(): Promise<boolean> {
    if (!form.name.trim()) { showToast('Crew name is required.', 'bad'); return false; }
    const isEdit = panel?.mode === 'edit';
    const editId = isEdit && panel && panel.mode === 'edit' ? panel.crewId : null;
    const snapshot = { ...form };
    const prevPanel = panel;
    setSaving(true);
    try {
      const optimistic: Partial<Crew> = {
        name: form.name.trim(), foreman_name: form.foremanName.trim() || null,
        trade: form.trade.trim() || null, status: form.status || 'active',
        notes: form.notes.trim() || null,
      };
      if (isEdit && editId) {
        mutate((d) => d && ({ crews: d.crews.map((c) => c.id === editId ? { ...c, ...optimistic } as Crew : c) }), false);
        // Stay on the crew — the roster re-renders with the saved values.
        setPanel({ mode: 'roster', crewId: editId }); showToast('Crew updated.');
        await post({ crewId: editId, name: form.name, foremanName: form.foremanName,
          trade: form.trade, status: form.status, notes: form.notes });
      } else {
        const temp: Crew = { id: `temp-${Date.now()}`, deleted_at: null, memberCount: 0, members: [], ...optimistic } as Crew;
        mutate((d) => ({ crews: [...(d?.crews ?? []), temp].sort((a, b) => a.name.localeCompare(b.name)) }), false);
        closePanel(); showToast('Crew added.');
        await post({ name: form.name, foremanName: form.foremanName,
          trade: form.trade, status: form.status, notes: form.notes });
      }
      mutate();
      guard.clearDraft();
      return true;
    } catch (e: any) {
      showToast(humanError(e, 'Save failed. Please try again.'), 'bad');
      mutate(); // rollback to server truth
      setForm(snapshot); setPanel(prevPanel);
    } finally { setSaving(false); }
    return false;
  }

  async function archiveCrew(c: Crew, restore: boolean) {
    if (!restore && !(await confirmDialog({ title: 'Please confirm', message: `Archive ${c.name}? The roster is kept and the crew can be restored.`, danger: true }))) return;
    mutate((d) => d && ({ crews: d.crews.filter((x) => x.id !== c.id) }), false);
    closePanel(); showToast(restore ? 'Crew restored.' : 'Crew archived.');
    try {
      await post(restore ? { crewId: c.id, restore: true } : { crewId: c.id, archive: true });
      mutate();
    } catch (e: any) {
      showToast(humanError(e, restore ? 'Restore failed. Please try again.' : 'Archive failed. Please try again.'), 'bad');
      mutate();
    }
  }

  async function addMember(crew: Crew, personName: string, role: string, trade: string) {
    const temp: CrewMember = { id: `temp-${Date.now()}`, person_name: personName.trim(),
      role: role.trim() || null, trade: trade.trim() || crew.trade || null };
    mutate((d) => d && ({ crews: d.crews.map((c) => c.id === crew.id
      ? { ...c, members: [...c.members, temp], memberCount: c.memberCount + 1 } : c) }), false);
    try {
      await post({ crewId: crew.id, addMember: { personName, role, trade } });
      mutate();
    } catch (e: any) {
      showToast(humanError(e, 'Could not add the member. Please try again.'), 'bad');
      mutate();
    }
  }

  async function removeMember(crew: Crew, m: CrewMember) {
    mutate((d) => d && ({ crews: d.crews.map((c) => c.id === crew.id
      ? { ...c, members: c.members.filter((x) => x.id !== m.id), memberCount: Math.max(0, c.memberCount - 1) } : c) }), false);
    try {
      await post({ removeMemberId: m.id });
      mutate();
    } catch (e: any) {
      showToast(humanError(e, 'Could not remove the member. Please try again.'), 'bad');
      mutate();
    }
  }

  const filtersActive = !!search || statusFilter !== 'all';
  const clearFilters = () => { setSearch(''); setStatusFilter('all'); };
  const toggleStatus = (s: (typeof STATUS_FILTERS)[number]) => setStatusFilter((prev) => (prev === s ? 'all' : s));

  // ── Stat tiles: each opens the register filtered to that slice ──
  const stats: StatItem[] = loading
    ? [
        { label: 'Crews', value: '—', sub: 'Loading…' },
        { label: 'Active', value: '—', sub: 'Loading…' },
        { label: 'Workers Rostered', value: '—', sub: 'Loading…' },
        { label: 'Trades Covered', value: '—', sub: 'Loading…' },
      ]
    : [
        { label: showArchived ? 'Archived Crews' : 'Crews', value: crews.length, sub: filtersActive ? 'Click to show everything' : showArchived ? 'Rosters kept, restorable' : 'On this project', onClick: filtersActive ? clearFilters : undefined },
        { label: 'Active', value: activeCount, tone: activeCount > 0 ? 'good' : 'default', sub: statusFilter === 'active' ? 'Filtered — click to clear' : standbyCount > 0 ? `${standbyCount} on standby` : 'Ready for the field', onClick: showArchived ? undefined : () => toggleStatus('active') },
        { label: 'Workers Rostered', value: totalMembers, sub: 'Across all crews' },
        { label: 'Trades Covered', value: tradesCovered, sub: 'Distinct crew trades', href: `/app/projects/${projectId}/subs` },
      ];

  // ── Register columns: full register, or a compact one beside the roster ──
  const isSel = (c: Crew) => selected?.id === c.id;
  const nameCol: Column<Crew> = { key: 'name', header: 'Crew', accessor: (c) => c.name.toLowerCase(), render: (c) => <span className="crName" data-sel={isSel(c) ? 'true' : undefined} title={c.name}>{c.name}</span> };
  const statusCol: Column<Crew> = { key: 'status', header: 'Status', accessor: (c) => (c.status ?? '').toLowerCase(), render: (c) => { const b = statusBadge(c.status, showArchived || !!c.deleted_at); return <Badge tone={b.tone}>{b.label}</Badge>; } };
  const foremanCol: Column<Crew> = { key: 'foreman', header: 'Foreman', accessor: (c) => (c.foreman_name ?? '').toLowerCase(), render: (c) => c.foreman_name ? <span style={{ color: 'var(--text-primary)' }}>{c.foreman_name}</span> : <span className="crMuted">—</span> };
  const tradeCol: Column<Crew> = { key: 'trade', header: 'Trade', accessor: (c) => (c.trade ?? '').toLowerCase(), render: (c) => c.trade ? <span>{c.trade}</span> : <span className="crMuted">—</span> };
  const membersCol: Column<Crew> = { key: 'members', header: 'Members', accessor: (c) => c.memberCount || 0, align: 'right', render: (c) => <span className="crNum" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-primary)', fontWeight: 700 }}><UsersThree size={14} style={{ color: 'var(--text-tertiary)' }} />{c.memberCount || 0}</span> };
  const columns: Column<Crew>[] = rosterOpen
    ? [nameCol, statusCol, membersCol]
    : [nameCol, statusCol, foremanCol, tradeCol, membersCol];

  /** The record's verbs — shared by the row overflow and the rail. */
  function crewActions(c: Crew): Action[] {
    const temp = c.id.startsWith('temp-');
    const archived = showArchived || !!c.deleted_at;
    return [
      { label: 'Open Roster', icon: <UsersThree size={15} />, onClick: () => openRoster(c) },
      { label: 'Edit Crew', icon: <PencilSimple size={15} />, onClick: () => openEdit(c), hidden: archived, disabled: temp },
      { label: 'Archive', icon: <Archive size={15} />, onClick: () => archiveCrew(c, false), tone: 'danger', hidden: archived, disabled: temp },
      { label: 'Restore', icon: <ArrowCounterClockwise size={15} />, onClick: () => archiveCrew(c, true), hidden: !archived, disabled: temp },
    ];
  }

  // ── Roster workspace ──
  const rosterWorkspace = rosterOpen && selected && (
    <div ref={detailRef} className="crDetailCq">
      <div className="crDetail">
        <Card
          title={selected.name}
          subtitle={[selected.foreman_name ? `Foreman ${selected.foreman_name}` : null, selected.trade].filter(Boolean).join(' · ') || undefined}
          actions={<Button variant="ghost" size="sm" icon={<X size={16} />} aria-label="Close roster" title="Close roster" onClick={closePanel} />}
        >
          <RosterBody key={selected.id} crew={selected}
            onAdd={(n, r, t) => addMember(selected, n, r, t)}
            onRemove={(m) => removeMember(selected, m)} />
        </Card>

        <aside className="crRail" aria-label="Crew details and actions">
          <Card title="Details">
            <div className="crSection">
              <div className="crBadges">
                <Badge tone={statusBadge(selected.status, !!selected.deleted_at).tone} dot>{statusBadge(selected.status, !!selected.deleted_at).label}</Badge>
              </div>
              <div className="crNext"><ClipboardText size={14} /> This roster feeds the manpower prefill on new daily logs.</div>
            </div>
            <div className="crSection">
              <DetailList items={[
                ['Foreman', selected.foreman_name || ''],
                ['Trade', selected.trade || ''],
                ['Members', String(selected.memberCount || 0)],
                ['Status', statusBadge(selected.status, !!selected.deleted_at).label],
              ]} />
            </div>
            <div className="crSection">
              <div className="crActions">
                {!selected.deleted_at ? (
                  <div className="crActionsRow">
                    <Button icon={<PencilSimple size={16} />} onClick={() => openEdit(selected)} disabled={selected.id.startsWith('temp-') || panel?.mode === 'edit'}>Edit Crew</Button>
                    <RowActions actions={[
                      { label: 'Archive', icon: <Archive size={15} />, onClick: () => archiveCrew(selected, false), tone: 'danger', disabled: selected.id.startsWith('temp-') },
                    ]} />
                  </div>
                ) : (
                  <Button icon={<ArrowCounterClockwise size={16} />} onClick={() => archiveCrew(selected, true)}>Restore Crew</Button>
                )}
                <Button icon={<ClipboardText size={16} />} href={`/app/projects/${projectId}/daily-logs`}>Project Daily Logs</Button>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );

  // ── Register body: loading / error / empty / no-match / rows — each distinct ──
  let listBody: React.ReactNode;
  if (!loading && loadError) {
    listBody = (
      <EmptyState
        icon={<WarningCircle size={22} />}
        title="Couldn't load crews"
        text={`${humanError(loadError, 'Failed to load crews.')} Nothing has been lost — try again.`}
        action={<Button icon={<ArrowClockwise size={15} />} onClick={() => mutate()}>Retry</Button>}
      />
    );
  } else if (!loading && crews.length === 0) {
    listBody = (
      <EmptyState
        icon={<UsersThree size={22} />}
        title={showArchived ? 'No archived crews' : 'No crews yet'}
        text={showArchived
          ? 'Archived crews land here with their rosters intact — restore one any time.'
          : 'Build a crew with a foreman, a trade, and a roster. Daily logs then prefill their manpower-by-trade section from your active crews — no retyping headcounts.'}
        action={!showArchived ? <Button icon={<Plus size={15} weight="bold" />} onClick={openCreate}>Build First Crew</Button> : undefined}
      />
    );
  } else {
    listBody = (
      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(c) => c.id}
        loading={loading}
        defaultSort={{ key: 'name', dir: 'asc' }}
        onRowClick={openRoster}
        rowActions={crewActions}
        empty={
          <EmptyState
            icon={<UsersThree size={22} />}
            title="No crews match these filters"
            text="Clear the search or status filter to see more."
            action={<Button onClick={clearFilters}>Clear Filters</Button>}
          />
        }
      />
    );
  }

  const composerOpen = panel?.mode === 'create' || panel?.mode === 'edit';
  const closeComposer = () => (panel?.mode === 'edit' && selected) ? setPanel({ mode: 'roster', crewId: selected.id }) : closePanel();

  return (
    <div className="crWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: ctx?.project?.name || 'Project', href: `/app/projects/${projectId}/overview` },
          { label: 'Crews' },
        ]}
        title="Crews & Rosters"
        subtitle="Build a crew once; every daily log's manpower fills itself."
        actions={
          <>
            <Button icon={<Archive size={15} />} aria-pressed={showArchived} onClick={() => { setShowArchived(v => !v); setPanel(null); }}>
              {showArchived ? 'Viewing Archived' : 'Archived'}
            </Button>
            <Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openCreate}>New Crew</Button>
          </>
        }
      >
        {!loadError && <StatRow items={stats} />}

        {!loading && !loadError && crews.length > 0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search crews, foremen, trades, or members…"
            filters={
              <>
                {!showArchived && (
                  <Select
                    aria-label="Status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as (typeof STATUS_FILTERS)[number])}
                    style={{ width: 'auto', minWidth: 150 }}
                    options={STATUS_FILTERS.map((v) => ({ value: v, label: v === 'all' ? 'All Statuses' : cap(v) }))}
                  />
                )}
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={<span className="crMuted" style={{ fontSize: 'var(--fs-sm)' }}>{filtered.length} of {crews.length}</span>}
          />
        )}

        <div className="crCq">
          <div className="crSplit" data-open={rosterOpen ? 'true' : 'false'}>
            <div className="crList">
              <Card flush>{listBody}</Card>
            </div>
            {rosterWorkspace}
          </div>
        </div>
      </PageShell>

      {/* ── Composer: create / edit ───────────────────────────────── */}
      <FormModal
        open={!!composerOpen}
        onClose={closeComposer}
        title={panel?.mode === 'edit' ? `Edit Crew — ${selected?.name ?? ''}` : 'New Crew'}
        subtitle={ctx?.project?.name || undefined}
        onSubmit={async () => { await saveCrew(); }}
        submitLabel={panel?.mode === 'create' ? 'Create Crew' : 'Save Changes'}
        busy={saving}
      >
        <FormGrid cols={2}>
          <Field label="Crew Name" required span>
            <Input value={form.name} autoFocus onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Framing Crew A" />
          </Field>
          <Field label="Foreman">
            <Input value={form.foremanName} onChange={(e) => setForm(f => ({ ...f, foremanName: e.target.value }))} placeholder="Who runs this crew" />
          </Field>
          <Field label="Trade">
            <Suggest className="k-input" value={form.trade} onChange={(e) => setForm(f => ({ ...f, trade: e.target.value }))} placeholder="Pick or type a trade" options={SUB_TRADES} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))} options={[{ value: 'active', label: 'Active' }, { value: 'standby', label: 'Standby' }, { value: 'inactive', label: 'Inactive' }]} />
          </Field>
          <Field label="Notes" span>
            <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Certs, equipment, anything worth recording…" />
          </Field>
        </FormGrid>
      </FormModal>

      {/* Above the FormModal overlay so the unsaved-work prompt is never hidden behind it. */}
      <div style={{ position: 'relative', zIndex: 10001 }}>
        <UnsavedGuardModal guard={guard} />
      </div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roster body — notes, member list with remove, and the inline add-member
// composer (always-visible inputs, no empty Add-button dead zone).
// Keyed by crew id so composer state resets when the workspace switches crews.
// ---------------------------------------------------------------------------
function RosterBody({ crew, onAdd, onRemove }: {
  crew: Crew;
  onAdd: (personName: string, role: string, trade: string) => void;
  onRemove: (m: CrewMember) => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [trade, setTrade] = useState(crew.trade ?? '');

  function submit() {
    if (!name.trim()) return;
    onAdd(name, role, trade);
    setName(''); setRole('');
    // Trade stays — adding several members of one trade is the common case.
  }

  return (
    <>
      {crew.notes && (
        <div className="crSection">
          <div className="crSectionTitle">Notes</div>
          <div className="crProse">{crew.notes}</div>
        </div>
      )}

      <div className="crSection">
        <div className="crSectionTitle"><UsersThree size={14} /> Roster <Badge tone="neutral">{crew.memberCount}</Badge></div>
        {crew.members.length === 0 && (
          <div className="crEmptyRoster">
            No members yet. Add the people working in this crew below — each one counts toward the crew&apos;s headcount on daily logs.
          </div>
        )}
        {crew.members.length > 0 && (
          <div className="crMembers">
            {crew.members.map((m) => (
              <div key={m.id} className="crMember">
                <span className="crAvatar"><User size={15} weight="fill" /></span>
                <div className="crMemberName">
                  <div>{m.person_name}</div>
                  {(m.role || m.trade) && <div>{[m.role, m.trade].filter(Boolean).join(' · ')}</div>}
                </div>
                {!crew.deleted_at && (
                  <Button variant="ghost" size="sm" icon={<X size={13} weight="bold" />} aria-label={`Remove ${m.person_name}`} title={`Remove ${m.person_name}`} onClick={() => onRemove(m)} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inline add-member composer */}
      {!crew.deleted_at && (
        <div className="crSection">
          <div className="crSectionTitle"><UserPlus size={14} /> Add Member</div>
          <div className="crAdd">
            <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="Name" aria-label="Member name" />
            <div className="crAddRow">
              <Input value={role} onChange={(e) => setRole(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="Role (Lead, Operator…)" aria-label="Role" />
              <Input value={trade} list="sgCrewTrades" onChange={(e) => setTrade(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder={crew.trade ? `Trade (${crew.trade})` : 'Trade'} aria-label="Trade" />
            </div>
            <div><Button icon={<HardHat size={14} />} onClick={submit} disabled={!name.trim()}>Add to Roster</Button></div>
          </div>
        </div>
      )}
    </>
  );
}
