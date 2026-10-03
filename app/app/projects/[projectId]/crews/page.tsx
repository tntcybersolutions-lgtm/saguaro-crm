'use client';
import React, { useMemo, useState } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { humanError } from '@/lib/errors';
import { SUB_TRADES } from '@/lib/construction-intelligence';
import { moduleAccent } from '@/lib/module-identity';
import {
  UsersThree, HardHat, User, UserPlus, Plus, X, Wrench,
  Archive, ArrowCounterClockwise, PencilSimple, ClipboardText,
} from '@phosphor-icons/react';
import {
  PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, IconChip,
  goldButtonStyle, ghostButtonStyle,
} from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';

// ---------------------------------------------------------------------------
// Crews — web parity with the mobile Crews screen (Saguaro-Field app/crews.tsx).
// Master grid of crew cards (status / foreman / trade / member count) with a
// roster drawer: inline add-member composer, remove, crew edit, archive.
// Crews built here feed the daily-log manpower prefill — that is the payoff
// the empty state teaches.
// ---------------------------------------------------------------------------

const DARK = 'var(--bg-base)', RAISED = 'var(--bg-surface)', BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#D4D4D8', TEXT = '#FFFFFF', GOLD = 'var(--brand-primary)';
const GREEN = '#2CFF7A', AMBER = 'var(--warning)', RED = '#FF3B30';

interface CrewMember { id: string; person_name: string; role: string | null; trade: string | null; }
interface Crew {
  id: string; name: string; foreman_name: string | null; trade: string | null;
  status: string | null; notes: string | null; deleted_at: string | null;
  memberCount: number; members: CrewMember[];
}

const STATUS_FILTERS = ['all', 'active', 'standby', 'inactive'] as const;

// crews.status is free text — map the known values to a tone, default neutral.
function statusTone(status: string | null | undefined): { ink: string; bg: string } {
  switch ((status ?? '').toLowerCase()) {
    case 'active':   return { ink: GREEN, bg: 'rgba(44,255,122,0.14)' };
    case 'standby':  return { ink: AMBER, bg: 'color-mix(in srgb, var(--warning) 14%, transparent)' };
    case 'inactive': return { ink: RED, bg: 'rgba(255,59,48,0.14)' };
    default:         return { ink: DIM, bg: 'rgba(255,255,255,0.08)' };
  }
}
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: 'var(--bg-surface-2)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, color: TEXT,
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) return null;
  const t = statusTone(status);
  return (
    <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 999,
      background: t.bg, color: t.ink, whiteSpace: 'nowrap' }}>
      {cap(status)}
    </span>
  );
}

// Skeletons shaped like the crew cards they stand in for.
function CrewSkeletons() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12, padding: '4px 16px 16px' }}>
      <style>{`@keyframes sgCrewPulse{0%,100%{opacity:.55}50%{opacity:.95}}`}</style>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10,
          padding: '16px 18px', animation: `sgCrewPulse 1.4s ease ${i * .12}s infinite` }}>
          <div style={{ height: 15, width: '55%', borderRadius: 4, background: 'rgba(255,255,255,0.10)' }} />
          <div style={{ height: 11, width: '80%', borderRadius: 4, background: 'rgba(255,255,255,0.07)', marginTop: 12 }} />
          <div style={{ height: 11, width: '40%', borderRadius: 4, background: 'rgba(255,255,255,0.07)', marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

type Panel =
  | { mode: 'roster'; crewId: string }
  | { mode: 'edit'; crewId: string }
  | { mode: 'create' }
  | null;

const EMPTY_FORM = { name: '', foremanName: '', trade: '', status: 'active', notes: '' };

export default function CrewsPage() {
  const { projectId } = useParams() as { projectId: string };
  const AC = moduleAccent('crews');

  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

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
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000);
  };

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

  const chips = useMemo(() => {
    const byStatus = (s: string) => crews.filter((c) => (c.status ?? '').toLowerCase() === s).length;
    return STATUS_FILTERS.map((v) => ({
      value: v, label: v === 'all' ? 'All' : cap(v),
      count: v === 'all' ? crews.length : byStatus(v),
    }));
  }, [crews]);

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

  // ── Crew create / edit — optimistic: the card lands instantly, network settles after ──
  async function saveCrew(): Promise<boolean> {
    if (!form.name.trim()) { showToast('Crew name is required.', 'error'); return false; }
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
        closePanel(); showToast('Crew updated.');
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
      showToast(humanError(e, 'Save failed. Please try again.'), 'error');
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
      showToast(humanError(e, restore ? 'Restore failed. Please try again.' : 'Archive failed. Please try again.'), 'error');
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
      showToast(humanError(e, 'Could not add the member. Please try again.'), 'error');
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
      showToast(humanError(e, 'Could not remove the member. Please try again.'), 'error');
      mutate();
    }
  }

  const panelOpen = panel !== null;

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, position: 'relative', background: DARK }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 99999,
          padding: '12px 20px', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 14, pointerEvents: 'none',
          background: toast.type === 'success' ? 'rgba(26,138,74,.92)' : 'rgba(192,48,48,.92)' }}>
          {toast.msg}
        </div>
      )}

      {/* Main */}
      <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PremiumSurface maxWidth={2200}>
          <ModuleHero
            eyebrow="Field Workforce"
            eyebrowIcon={<IconChip size={24} vivid={AC.vivid ?? AC.hex}><UsersThree size={13} weight="fill" color="#F8FAFC" /></IconChip>}
            accentColor={AC.hex}
            title="Crews"
            accent="& Rosters"
            subtitle="Build a crew once; every daily log's manpower fills itself."
            actions={
              <button onClick={openCreate} style={goldButtonStyle} className="pmBtn">
                <Plus size={15} weight="bold" /> New Crew
              </button>
            }
          />

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 24 }}>
            <StatCard icon={<UsersThree size={19} weight="duotone" color={AC.hex} />}
              label="Crews" value={String(crews.length)} sub={showArchived ? 'Archived crews' : 'On this project'} delay={0.02}  href={`/app/projects/${projectId}/crews`}/>
            <StatCard icon={<HardHat size={19} weight="duotone" color={AC.hex} />}
              label="Active" value={String(activeCount)} accent={activeCount > 0 ? GREEN : undefined} sub="Ready for the field" delay={0.06}  href={`/app/projects/${projectId}/crews`}/>
            <StatCard icon={<User size={19} weight="duotone" color={AC.hex} />}
              label="Workers Rostered" value={String(totalMembers)} sub="Across all crews" delay={0.10}  href={`/app/projects/${projectId}/crews`}/>
            <StatCard icon={<Wrench size={19} weight="duotone" color={AC.hex} />}
              label="Trades Covered" value={String(tradesCovered)} sub="Distinct crew trades" delay={0.14}  href={`/app/projects/${projectId}/subs`}/>
          </div>

          <SectionCard
            title={showArchived ? 'Archived Crews' : 'Crews'}
            icon={<UsersThree size={17} weight="duotone" color={AC.hex} />}
            action={
              <button onClick={() => { setShowArchived(v => !v); setPanel(null); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                  background: showArchived ? AC.soft : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${showArchived ? AC.ring : BORDER}`, borderRadius: 999,
                  color: showArchived ? AC.hex : DIM, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <Archive size={13} weight="bold" color={showArchived ? AC.hex : DIM} />
                {showArchived ? 'Viewing Archived' : 'Archived'}
              </button>
            }
            flush
          >
            {/* Search + filter chips */}
            <div style={{ padding: '14px 16px 4px' }}>
              <ListToolbar
                module="crews"
                search={search}
                onSearch={setSearch}
                searchPlaceholder="Search crews, foremen, trades, or members…"
                count={{ shown: filtered.length, total: crews.length }}
              />
              {!showArchived && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0 10px' }}>
                  {chips.map((ch) => {
                    const active = statusFilter === ch.value;
                    return (
                      <button key={ch.value} onClick={() => setStatusFilter(ch.value)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px',
                          borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                          background: active ? AC.soft : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${active ? AC.ring : BORDER}`,
                          color: active ? AC.hex : DIM, transition: 'all .15s' }}>
                        {ch.label}
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '1px 7px', borderRadius: 999,
                          background: active ? AC.soft : 'rgba(255,255,255,0.07)',
                          color: active ? AC.hex : 'rgba(255,255,255,0.55)' }}>
                          {ch.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {loading && <CrewSkeletons />}

            {!loading && loadError && (
              <div style={{ margin: '10px 16px 14px', background: 'rgba(192,48,48,.12)', border: '1px solid rgba(192,48,48,.3)',
                borderRadius: 8, padding: '12px 16px', color: '#FF3B30', fontSize: 13 }}>
                {humanError(loadError, 'Failed to load crews. Please try again.')}
              </div>
            )}

            {!loading && !loadError && filtered.length === 0 && (
              <div style={{ padding: '8px 8px 20px' }}>
                <PremiumEmpty
                  icon={<UsersThree size={30} weight="duotone" color={GOLD} />}
                  title={showArchived
                    ? 'No Archived Crews'
                    : crews.length === 0 ? 'No Crews Yet' : 'No Crews Match'}
                  description={showArchived
                    ? 'Archived crews land here with their rosters intact — restore one any time.'
                    : crews.length === 0
                      ? 'Build a crew with a foreman, a trade, and a roster. Daily logs then prefill their manpower-by-trade section from your active crews — no retyping headcounts.'
                      : 'Try a different status chip or clear the search.'}
                  action={!showArchived && crews.length === 0 ? (
                    <button onClick={openCreate} style={goldButtonStyle} className="pmBtn">
                      <Plus size={15} weight="bold" /> Build First Crew
                    </button>
                  ) : undefined}
                />
              </div>
            )}

            {/* Crew cards */}
            {!loading && filtered.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12,
                padding: '4px 16px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {filtered.map((c) => {
                  const isSel = selected?.id === c.id;
                  return (
                    <div key={c.id}
                      onClick={() => setPanel({ mode: 'roster', crewId: c.id })}
                      style={{ background: isSel ? 'var(--brand-primary-08)' : RAISED,
                        border: `1px solid ${isSel ? GOLD : BORDER}`, borderRadius: 10,
                        padding: '15px 18px', cursor: 'pointer', transition: 'all .15s' }}
                      onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--brand-primary) 40%, transparent)'; }}
                      onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.borderColor = BORDER; }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ fontWeight: 800, fontSize: 15, color: TEXT, lineHeight: 1.3, minWidth: 0 }}>{c.name}</div>
                        <StatusPill status={showArchived ? 'inactive' : c.status} />
                      </div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 9, fontSize: 12.5, color: DIM }}>
                        {c.foreman_name && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <User size={13} weight="fill" color={DIM} /> {c.foreman_name}
                          </span>
                        )}
                        {c.trade && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <Wrench size={13} weight="fill" color={DIM} /> {c.trade}
                          </span>
                        )}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <UsersThree size={13} weight="fill" color={AC.hex} />
                          <span style={{ fontWeight: 700, color: TEXT }}>{c.memberCount}</span>
                          {c.memberCount === 1 ? 'member' : 'members'}
                        </span>
                      </div>
                      {c.notes && (
                        <div style={{ marginTop: 8, fontSize: 12.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.45,
                          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                          {c.notes}
                        </div>
                      )}
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)',
                        fontSize: 11.5, fontWeight: 700, color: 'rgba(255,255,255,0.45)' }}>
                        {showArchived ? 'Open to restore' : 'Open to manage the roster'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </PremiumSurface>
      </div>

      {/* Side panel — roster drawer / crew composer */}
      {panelOpen && (
        <div style={{ width: 460, borderLeft: `1px solid ${BORDER}`, background: DARK,
          overflow: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: TEXT, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {panel?.mode === 'create' ? 'New Crew' : panel?.mode === 'edit' ? 'Edit Crew' : selected?.name ?? 'Crew'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {panel?.mode === 'roster' && selected && !selected.deleted_at && (
                <>
                  <button onClick={() => openEdit(selected)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                      background: 'var(--brand-primary-12)', border: '1px solid var(--brand-primary-25)', borderRadius: 6,
                      color: 'var(--brand-primary-strong)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <PencilSimple size={13} weight="bold" color="var(--brand-primary-strong)" /> Edit
                  </button>
                  <button onClick={() => archiveCrew(selected, false)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                      background: 'rgba(192,48,48,.1)', border: '1px solid rgba(192,48,48,.27)', borderRadius: 6,
                      color: RED, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <Archive size={13} weight="bold" color={RED} /> Archive
                  </button>
                </>
              )}
              {panel?.mode === 'roster' && selected && selected.deleted_at && (
                <button onClick={() => archiveCrew(selected, true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                    background: 'rgba(44,255,122,.1)', border: '1px solid rgba(44,255,122,.3)', borderRadius: 6,
                    color: GREEN, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  <ArrowCounterClockwise size={13} weight="bold" color={GREEN} /> Restore
                </button>
              )}
              <button onClick={closePanel}
                style={{ padding: '6px 10px', background: 'rgba(143,163,192,.1)',
                  border: `1px solid ${BORDER}`, borderRadius: 6, color: DIM, fontSize: 12, cursor: 'pointer' }}>
                <X size={14} weight="bold" color={DIM} />
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
            {(panel?.mode === 'create' || panel?.mode === 'edit') ? (
              /* ── Crew composer ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Field label="Crew Name *">
                  <input value={form.name} autoFocus
                    onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                    style={inp} placeholder="e.g. Framing Crew A" />
                </Field>
                <Field label="Foreman">
                  <input value={form.foremanName}
                    onChange={(e) => setForm(f => ({ ...f, foremanName: e.target.value }))}
                    style={inp} placeholder="Who runs this crew" />
                </Field>
                <Field label="Trade">
                  <Suggest value={form.trade}
                    onChange={(e) => setForm(f => ({ ...f, trade: e.target.value }))}
                    style={inp} placeholder="Pick or type a trade" options={['t']} />
                  </Field>
                <Field label="Status">
                  <select value={form.status}
                    onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                    style={{ ...inp, cursor: 'pointer' }}>
                    <option value="active">Active</option>
                    <option value="standby">Standby</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </Field>
                <Field label="Notes">
                  <textarea value={form.notes}
                    onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={3} style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }}
                    placeholder="Certs, equipment, anything worth recording…" />
                </Field>
                <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                  <button onClick={saveCrew} disabled={saving}
                    style={{ flex: 1, padding: '11px 0', background: `linear-gradient(135deg,${GOLD},var(--brand-primary-strong))`,
                      border: 'none', borderRadius: 8, color: '#0A0A00', fontSize: 14, fontWeight: 800,
                      cursor: 'pointer', opacity: saving ? .6 : 1 }}>
                    {saving ? 'Saving…' : panel?.mode === 'create' ? 'Create Crew' : 'Save Changes'}
                  </button>
                  <button onClick={() => (panel?.mode === 'edit' && selected)
                    ? setPanel({ mode: 'roster', crewId: selected.id })
                    : closePanel()}
                    style={{ padding: '11px 16px', background: 'rgba(143,163,192,.1)',
                      border: `1px solid ${BORDER}`, borderRadius: 8, color: DIM, fontSize: 14, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : selected ? (
              /* ── Roster drawer ── */
              <RosterDrawer key={selected.id} crew={selected}
                onAdd={(n, r, t) => addMember(selected, n, r, t)}
                onRemove={(m) => removeMember(selected, m)} />
            ) : (
              <div style={{ padding: 30, textAlign: 'center', color: DIM, fontSize: 13 }}>
                This crew is no longer in the current list.
              </div>
            )}
          </div>
        </div>
      )}
      <UnsavedGuardModal guard={guard} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roster drawer body — meta, notes, member list with remove, and the inline
// add-member composer (always-visible inputs, no empty Add-button dead zone).
// Keyed by crew id so composer state resets when the drawer switches crews.
// ---------------------------------------------------------------------------
function RosterDrawer({ crew, onAdd, onRemove }: {
  crew: Crew;
  onAdd: (personName: string, role: string, trade: string) => void;
  onRemove: (m: CrewMember) => void;
}) {
  const AC = moduleAccent('crews');
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Crew meta */}
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <StatusPill status={crew.deleted_at ? 'inactive' : crew.status} />
          {crew.foreman_name && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: DIM }}>
              <User size={14} weight="fill" color={DIM} /> {crew.foreman_name}
            </span>
          )}
          {crew.trade && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: DIM }}>
              <Wrench size={14} weight="fill" color={DIM} /> {crew.trade}
            </span>
          )}
        </div>
        {crew.notes && (
          <div style={{ marginTop: 10, fontSize: 13, color: DIM, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{crew.notes}</div>
        )}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)',
          fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ClipboardText size={13} weight="fill" color={AC.hex} />
          This roster feeds the manpower prefill on new daily logs.
        </div>
      </div>

      {/* Roster */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
          Roster
          <span style={{ fontSize: 10.5, fontWeight: 800, padding: '1px 8px', borderRadius: 999,
            background: AC.soft, color: AC.hex }}>{crew.memberCount}</span>
        </div>

        {crew.members.length === 0 && (
          <div style={{ background: RAISED, border: `1px dashed ${BORDER}`, borderRadius: 10,
            padding: '18px 16px', fontSize: 12.5, color: DIM, lineHeight: 1.5 }}>
            No members yet. Add the people working in this crew below — each one
            counts toward the crew's headcount on daily logs.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {crew.members.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
              background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '10px 12px' }}>
              <span style={{ width: 34, height: 34, borderRadius: 17, flexShrink: 0,
                background: AC.soft, border: `1px solid ${AC.ring}`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={15} weight="fill" color={AC.hex} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: TEXT,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.person_name}</div>
                {(m.role || m.trade) && (
                  <div style={{ fontSize: 12, color: DIM, marginTop: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[m.role, m.trade].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              {!crew.deleted_at && (
                <button onClick={() => onRemove(m)} title={`Remove ${m.person_name}`}
                  style={{ padding: '5px 8px', background: 'rgba(192,48,48,.08)',
                    border: '1px solid rgba(192,48,48,.22)', borderRadius: 6, cursor: 'pointer' }}>
                  <X size={13} weight="bold" color={RED} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Inline add-member composer */}
      {!crew.deleted_at && (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserPlus size={13} weight="bold" color={AC.hex} /> Add Member
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              style={inp} placeholder="Name *" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input value={role} onChange={(e) => setRole(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                style={inp} placeholder="Role (Lead, Operator…)" />
              <input value={trade} list="sgCrewTrades" onChange={(e) => setTrade(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                style={inp} placeholder={crew.trade ? `Trade (${crew.trade})` : 'Trade'} />
            </div>
            <button onClick={submit} disabled={!name.trim()}
              style={{ padding: '10px 0', background: name.trim() ? `linear-gradient(135deg,${GOLD},var(--brand-primary-strong))` : 'rgba(255,255,255,0.06)',
                border: 'none', borderRadius: 8, color: name.trim() ? '#0A0A00' : 'rgba(255,255,255,0.35)',
                fontSize: 13, fontWeight: 800, cursor: name.trim() ? 'pointer' : 'default' }}>
              Add to Roster
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
