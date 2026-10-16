'use client';
import { useMemo, useState } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { CalendarBlank, CheckCircle, User, Users, Warning, Check, X, Plus } from '@phosphor-icons/react';
import Link from 'next/link';
import { useProjects } from '@/lib/hooks/useProjects';
import { useOAC, createMeeting, toggleAction } from '@/lib/hooks/useFranchise';
import {
  C, font, fmtDate, useFranchiseGate, GateLoading, Chip, SearchInput, SevBadge,
} from '@/components/franchise/kit';
import { PremiumSurface, ModuleHero, StatStrip, SectionCard, PremiumEmpty, GoldButton, GhostButton, Pill } from '@/components/ui/premium';
import { OAC_AGENDA } from '@/lib/franchise-template';
import { localDay } from '@/lib/calendar-day';

import { FlatStyles, RowSkeleton } from '@/components/ui/flat';
const todayMs = () => Date.parse(localDay()); // This device's day — toISOString() is the UTC day, tomorrow from 7 PM on in Iowa.
const daysToDue = (d: any) => { if (!d) return null; const t = Date.parse(String(d)); return isNaN(t) ? null : Math.round((t - todayMs()) / 86400000); };

export default function OacPage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { meetings, actions, loading } = useOAC();
  const { projects } = useProjects();
  const [tab, setTab] = useState<'meetings' | 'actions'>('meetings');
  const [q, setQ] = useState('');
  const [logging, setLogging] = useState(false);
  const [override, setOverride] = useState<Record<string, boolean>>({});

  const isDone = (a: any) => (a.id in override ? override[a.id] : (a.is_completed || /complete|closed|done/i.test(String(a.status || ''))));

  const summary = useMemo(() => {
    const open = (actions as any[]).filter((a) => !isDone(a));
    const overdue = open.filter((a) => { const d = daysToDue(a.due_date); return d != null && d < 0; });
    const sites = new Set((meetings as any[]).map((m) => m.project_id)).size;
    return { meetings: (meetings as any[]).length, open: open.length, overdue: overdue.length, sites };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, actions, override]);

  // GC/Saguaro weekly-call cadence: was a GC call logged for each active site this week (≤7 days)?
  const gcCadence = useMemo(() => {
    const active = (projects as any[]).filter((p) => !/complete|closed|closeout|won|archiv/i.test(String(p.status || '')));
    // Match on the controlled meeting_type only (the 'GC Weekly Call' dropdown value),
    // not the free-text title — so an OAC meeting whose title happens to contain "gc"/"call" isn't miscounted.
    const calls = (meetings as any[]).filter((m) => /gc.*(weekly|call)|weekly.*call/i.test(String(m.meeting_type || '')));
    const rows = active.map((p) => {
      const latest = calls.filter((m) => m.project_id === p.id).map((m) => Date.parse(String(m.meeting_date || ''))).filter((t) => !isNaN(t)).sort((a, b) => b - a)[0];
      const daysSince = latest ? Math.round((todayMs() - latest) / 86400000) : null;
      return { p, daysSince, current: daysSince != null && daysSince <= 7 };
    });
    return { rows, onTrack: rows.filter((r) => r.current).length, total: rows.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, meetings]);

  const filteredMeetings = (meetings as any[]).filter((m) =>
    !q || `${m.title || ''} ${m.project_name || ''} ${m.facilitator_name || ''} ${m.meeting_type || ''}`.toLowerCase().includes(q.toLowerCase()));

  const sortedActions = useMemo(() => {
    const list = [...(actions as any[])];
    list.sort((a, b) => {
      const da = isDone(a) ? 1 : 0, dbb = isDone(b) ? 1 : 0;
      if (da !== dbb) return da - dbb; // open first
      return (daysToDue(a.due_date) ?? 99999) - (daysToDue(b.due_date) ?? 99999); // soonest/overdue first
    });
    return list.filter((a) => !q || `${a.title || a.description || ''} ${a.project_name || ''} ${a.assigned_to_name || ''}`.toLowerCase().includes(q.toLowerCase()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, q, override]);

  async function check(a: any) {
    const next = !isDone(a);
    setOverride((o) => ({ ...o, [a.id]: next }));
    try { await toggleAction(a.id, next); }
    catch { setOverride((o) => { const n = { ...o }; delete n[a.id]; return n; }); }
  }

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  return (
    <PremiumSurface>
      <div style={{ fontFamily: font, color: C.text }}>
      <ModuleHero
        eyebrow="Command Center"
        eyebrowIcon={<Users size={13} weight="fill" color="var(--text-secondary)" />}
        title="OAC"
        accent="Workflow"
        subtitle="OAC meetings and their action items, every site."
        actions={<GoldButton icon={<Plus size={15} weight="bold" />} onClick={() => setLogging(true)}>Log Meeting</GoldButton>}
      />

      {/* Meeting pulse — logged meetings and the accountability they created */}
      {!loading && (
        <StatStrip items={[
          {href: '/app/command-center/oac',  label: 'Meetings', value: String(summary.meetings), sub: 'Logged across sites' },
          {href: '/app/command-center/oac',  label: 'Open Actions', value: String(summary.open), accent: summary.open ? C.gold : C.green, sub: summary.open ? 'Awaiting owners' : 'All closed out' },
          {href: '/app/command-center/oac',  label: 'Overdue Actions', value: String(summary.overdue), accent: summary.overdue ? C.red : C.green, sub: summary.overdue ? 'Past their due date' : 'None late' },
          {href: '/app/command-center/oac',  label: 'Sites Covered', value: String(summary.sites), sub: 'With logged meetings' },
        ]} />
      )}

      {/* GC / Saguaro weekly-call cadence — one call per site per week (per the spec's GC/Saguaro weekly call). */}
      {gcCadence.total > 0 && (
        <SectionCard flat
          title="GC / Saguaro Weekly Call"
          icon={<CalendarBlank size={16} weight="duotone" color="var(--text-secondary)" />}
          action={<span style={{ fontSize: 13, fontWeight: 700, color: gcCadence.onTrack === gcCadence.total ? C.green : C.gold, whiteSpace: 'nowrap' }}>{gcCadence.onTrack}/{gcCadence.total} on cadence this week</span>}
          style={{ marginBottom: 18 }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {gcCadence.rows.map(({ p, daysSince, current }) => {
              const bg = current ? 'rgba(74,222,128,0.12)' : daysSince == null ? 'rgba(248,113,113,0.10)' : 'rgba(251,191,36,0.12)';
              const fg = current ? C.green : daysSince == null ? C.red : C.yellow;
              const bd = current ? 'rgba(74,222,128,0.3)' : daysSince == null ? 'rgba(248,113,113,0.25)' : 'rgba(251,191,36,0.3)';
              const note = current ? null : daysSince == null ? 'Never' : `${daysSince}d ago`;
              return (
                <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 999, background: bg, color: fg, border: `1px solid ${bd}` }}>
                  {current ? <CheckCircle size={13} weight="fill" color={fg} /> : <Warning size={13} weight="fill" color={fg} />} {p.name}{note ? ` · ${note}` : ''}
                </span>
              );
            })}
          </div>
        </SectionCard>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <Chip active={tab === 'meetings'} onClick={() => setTab('meetings')} count={summary.meetings}>Meetings</Chip>
        <Chip active={tab === 'actions'} color={C.blue} onClick={() => setTab('actions')} count={summary.open}>Action Items</Chip>
        <SearchInput value={q} onChange={setQ} placeholder={tab === 'meetings' ? 'Search meeting, site…' : 'Search action, owner…'} />
      </div>

      {loading ? (
        <><FlatStyles /><RowSkeleton rows={6} /></>
      ) : tab === 'meetings' ? (
        filteredMeetings.length === 0 ? (
          <SectionCard>
            <PremiumEmpty icon={<CalendarBlank size={32} weight="duotone" color="var(--text-secondary)" />} title="No meetings logged yet"
              description="Log OAC meetings across all your sites — capture attendees, decisions, and the action items that come out of them, each with an owner and a due date."
              action={<GoldButton icon={<Plus size={15} weight="bold" />} onClick={() => setLogging(true)}>Log Your First Meeting</GoldButton>} />
          </SectionCard>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
            {filteredMeetings.map((m) => (
              <div key={m.id} className="pmHover" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '15px 16px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{m.title || 'Meeting'}</div>
                    <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
                      {m.project_id ? <Link href={`/app/projects/${m.project_id}`} style={{ color: C.blue, textDecoration: 'none' }}>{m.project_name || 'Site'}</Link> : 'Site'}
                      {m.project_city ? ` · ${m.project_city}, ${m.project_state}` : ''} · {fmtDate(m.meeting_date)}
                    </div>
                  </div>
                  <Pill tone="gold">{m.meeting_type || 'OAC'}</Pill>
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: C.dim, flexWrap: 'wrap' }}>
                  {m.facilitator_name && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><User size={13} color={C.dim} />{m.facilitator_name}</span>}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Users size={13} color={C.dim} />{Array.isArray(m.attendees) ? m.attendees.length : 0} attendees</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: m.action_open > 0 ? C.blue : C.dim, fontWeight: m.action_open > 0 ? 700 : 400 }}><CheckCircle size={13} />{m.action_open}/{m.action_total} actions open</span>
                </div>
                {m.agenda && <div style={{ fontSize: 12, color: C.dim, marginTop: 10, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.agenda}</div>}
              </div>
            ))}
          </div>
        )
      ) : (
        sortedActions.length === 0 ? (
          <SectionCard flat>
            <PremiumEmpty icon={<CheckCircle size={32} weight="duotone" color="var(--text-secondary)" />} title="No action items"
              description="Items captured in OAC meetings land here." primary={{ label: 'Log Meeting', onClick: () => setLogging(true) }} perm={['Admin', 'Full']} />
          </SectionCard>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sortedActions.map((a) => {
              const done = isDone(a); const d = daysToDue(a.due_date);
              const overdue = !done && d != null && d < 0;
              return (
                <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${done ? C.green : overdue ? C.red : C.blue}`, borderRadius: 12, padding: '12px 14px' }}>
                  <button onClick={() => check(a)} aria-label="Toggle action item" style={{ marginTop: 1, width: 20, height: 20, borderRadius: 6, border: `2px solid ${done ? C.green : C.border}`, background: done ? C.green : 'var(--bg-surface-2)', color: 'var(--text-primary)', cursor: 'pointer', flexShrink: 0, fontSize: 12, fontWeight: 900, lineHeight: '16px' }}>{done ? <Check size={14} weight="bold" color="var(--text-primary)" /> : ''}</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: done ? C.dim : C.text, textDecoration: done ? 'line-through' : 'none' }}>{a.title || a.description}</div>
                    <div style={{ fontSize: 12, color: C.dim, marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {a.project_name && <span>{a.project_name}</span>}
                      {a.assigned_to_name && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><User size={13} color={C.dim} />{a.assigned_to_name}</span>}
                      {a.meeting_title && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CalendarBlank size={13} color={C.dim} />{a.meeting_title}</span>}
                      {a.due_date && <span style={{ color: overdue ? C.red : C.dim, fontWeight: overdue ? 700 : 400 }}>Due {fmtDate(a.due_date)}{overdue ? ` · ${Math.abs(d as number)}d overdue` : ''}</span>}
                    </div>
                  </div>
                  {overdue && <SevBadge sev="red" label="Overdue" />}
                </div>
              );
            })}
          </div>
        )
      )}

      {logging && <LogMeetingModal projects={projects} onClose={() => setLogging(false)} />}
      </div>
    </PremiumSurface>
  );
}

function LogMeetingModal({ projects, onClose }: { projects: any[]; onClose: () => void }) {
  const [f, setF] = useState<Record<string, any>>({ meeting_type: 'OAC', meeting_date: localDay(), agenda: OAC_AGENDA.map((a) => `• ${a}`).join('\n') });
  const [attendees, setAttendees] = useState<any[]>([{ name: '', company: '', role: 'Owner' }]);
  const [items, setItems] = useState<any[]>([{ description: '', assigned_to_name: '', due_date: '' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: 'none', background: 'var(--bg-surface-2)', width: '100%' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: C.dim, marginBottom: 4, display: 'block' };

  async function submit() {
    if (!f.project_id || !f.title || !f.meeting_date) { setErr('Site, title, and date are required.'); return; }
    setBusy(true); setErr('');
    try {
      await createMeeting({ ...f, attendees: attendees.filter((a) => a.name), action_items: items.filter((i) => i.description) });
      onClose();
    } catch (e: any) { setErr(e?.message || "Couldn't save the meeting. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(2,4,8,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflow: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: 'min(640px, 100%)', boxShadow: '0 24px 80px rgba(2,4,8,0.5), inset 0 1px 0 rgba(255,255,255,0.06)', fontFamily: font }}>
        <div className="k-dialog-title" style={{ marginBottom: 14 }}>Log OAC Meeting</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Meeting Title *</label><input style={inp} placeholder="e.g. Back Nine Buckeye — OAC #3" value={f.title || ''} onChange={(e) => set('title', e.target.value)} /></div>
          <div><label style={lbl}>Site *</label><select style={inp} value={f.project_id || ''} onChange={(e) => set('project_id', e.target.value)}><option value="">Select site…</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label style={lbl}>Type</label><select style={inp} value={f.meeting_type} onChange={(e) => set('meeting_type', e.target.value)}>{['OAC', 'GC Weekly Call', 'Progress', 'Preconstruction', 'Design', 'Coordination', 'Closeout'].map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label style={lbl}>Date *</label><SaguaroDatePicker style={inp} value={f.meeting_date} onChange={(v) => set('meeting_date', v)} /></div>
          <div><label style={lbl}>Facilitator</label><input style={inp} value={f.facilitator_name || ''} onChange={(e) => set('facilitator_name', e.target.value)} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Location</label><input style={inp} value={f.location || ''} onChange={(e) => set('location', e.target.value)} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Agenda / Notes</label><textarea style={{ ...inp, minHeight: 60, resize: 'vertical', fontFamily: font }} value={f.agenda || ''} onChange={(e) => set('agenda', e.target.value)} /></div>
        </div>

        {/* Attendees */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>Attendees</span>
            <button onClick={() => setAttendees((a) => [...a, { name: '', company: '', role: '' }])} style={miniBtn}>+ Add</button>
          </div>
          {attendees.map((a, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.9fr auto', gap: 8, marginBottom: 6 }}>
              <input style={inp} placeholder="Name" value={a.name} onChange={(e) => setAttendees((x) => x.map((r, j) => j === i ? { ...r, name: e.target.value } : r))} />
              <input style={inp} placeholder="Company" value={a.company} onChange={(e) => setAttendees((x) => x.map((r, j) => j === i ? { ...r, company: e.target.value } : r))} />
              <select style={inp} value={a.role} onChange={(e) => setAttendees((x) => x.map((r, j) => j === i ? { ...r, role: e.target.value } : r))}><option value="">Role</option>{['Owner', 'Architect', 'Contractor', 'Engineer', 'PM', 'Sub', 'Landlord', 'Franchisor'].map((r) => <option key={r} value={r}>{r}</option>)}</select>
              <button onClick={() => setAttendees((x) => x.filter((_, j) => j !== i))} style={{ ...miniBtn, color: C.red }}><X size={12} weight="bold" color={C.red} /></button>
            </div>
          ))}
        </div>

        {/* Action items */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>Action Items</span>
            <button onClick={() => setItems((a) => [...a, { description: '', assigned_to_name: '', due_date: '' }])} style={miniBtn}>+ Add</button>
          </div>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr auto', gap: 8, marginBottom: 6 }}>
              <input style={inp} placeholder="Action…" value={it.description} onChange={(e) => setItems((x) => x.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} />
              <input style={inp} placeholder="Owner" value={it.assigned_to_name} onChange={(e) => setItems((x) => x.map((r, j) => j === i ? { ...r, assigned_to_name: e.target.value } : r))} />
              <SaguaroDatePicker style={inp} value={it.due_date} onChange={(v) => setItems((x) => x.map((r, j) => j === i ? { ...r, due_date: v } : r))} />
              <button onClick={() => setItems((x) => x.filter((_, j) => j !== i))} style={{ ...miniBtn, color: C.red }}><X size={12} weight="bold" color={C.red} /></button>
            </div>
          ))}
        </div>

        {err && <div style={{ color: C.red, fontSize: 13, marginTop: 12 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <GoldButton onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save Meeting'}</GoldButton>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
        </div>
      </div>
    </div>
  );
}

const miniBtn: React.CSSProperties = { padding: '4px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'var(--bg-surface-2)', color: C.blue, fontSize: 12, fontWeight: 700, cursor: 'pointer' };
