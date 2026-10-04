'use client';
/**
 * Service & Dispatch — create service calls, assign a tech, set the visit
 * window, move the call through its statuses, and keep a dated trail.
 * Spec §7 (docs/SPEC-dashboard-2026-10-03.md). API: /api/service-tickets.
 * Billing is separate from status: Completed ≠ invoiced.
 */
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, X, ArrowLeft, WarningCircle } from '@phosphor-icons/react';
import {
  TICKET_STATUS_LABEL, TICKET_PRIORITIES, WAITING_REASONS, OPEN_TICKET_STATUSES,
  normaliseTicketStatus, type TicketStatus,
} from '@/lib/service-tickets';

interface Ticket {
  id: string; ticket_number: string; project_id: string | null; title: string; description: string | null;
  category: string | null; priority: string | null; sla_hours: number | null; status: string | null;
  scheduled_window_start: string | null; scheduled_window_end: string | null; assigned_tech_id: string | null;
  dispatch_notes: string | null; resolution: string | null; closed_at: string | null; created_at: string; updated_at: string;
}
interface Payload { tickets: Ticket[]; techs: Array<{ id: string; full_name: string | null; email: string | null }>; projects: Array<{ id: string; name: string; address: string | null; city: string | null; status: string | null }> }

const fetcher = async (u: string): Promise<Payload> => {
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `Request failed (${r.status})`);
  return j as Payload;
};

type Filter = 'open' | 'unassigned' | 'today' | 'waiting' | 'completed' | 'all';
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'open', label: 'Open' }, { key: 'unassigned', label: 'Unassigned' }, { key: 'today', label: 'Today' },
  { key: 'waiting', label: 'Waiting' }, { key: 'completed', label: 'Completed' }, { key: 'all', label: 'All' },
];

/* Which buttons to offer from each status. Waiting and Completed collect
   their required reason/resolution before saving. */
const NEXT: Record<TicketStatus, TicketStatus[]> = {
  new: ['triaged', 'scheduled', 'waiting', 'closed'],
  triaged: ['scheduled', 'waiting', 'closed'],
  scheduled: ['en_route', 'on_site', 'waiting', 'completed'],
  en_route: ['on_site', 'waiting'],
  on_site: ['completed', 'waiting'],
  waiting: ['triaged', 'scheduled', 'completed'],
  completed: ['closed', 'on_site'],
  closed: ['triaged'],
};

const todayYmd = () => new Date().toLocaleDateString('en-CA');
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
const fmtWindow = (s: string | null, e: string | null) => {
  if (!s) return 'Not scheduled';
  const a = new Date(s);
  const day = a.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const t = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${t(a)}${e ? '–' + t(new Date(e)) : ''}`;
};

async function patch(id: string, body: Record<string, unknown>) {
  const r = await fetch(`/api/service-tickets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body: j };
}

function NewCall({ data, onClose, onCreated }: { data: Payload; onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = useState({ title: '', project_id: '', priority: 'normal', category: '', description: '', sla_hours: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!f.title.trim()) { setErr('Give the call a short title.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/service-tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, project_id: f.project_id || null, sla_hours: f.sla_hours || null }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Could not create the call.');
      onCreated(j.ticket.id);
    } catch (e2) { setErr((e2 as Error).message); setBusy(false); }
  };
  const activeJobs = data.projects.filter(p => !['completed', 'closed', 'cancelled', 'archived', 'lost'].includes(String(p.status || '').toLowerCase()));
  return (
    <form className="sv-card sv-pad" onSubmit={submit} aria-labelledby="sv-new-h">
      <div className="sv-head"><h2 id="sv-new-h">New Service Call</h2><button type="button" className="sv-icon" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <div className="sv-grid">
        <label className="sv-field sv-span2"><span>Title *</span><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="e.g. RTU-2 not cooling" autoFocus /></label>
        <label className="sv-field"><span>Job / Site</span>
          <select value={f.project_id} onChange={e => setF({ ...f, project_id: e.target.value })}>
            <option value="">No job</option>
            {activeJobs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="sv-field"><span>Priority</span>
          <select value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })}>
            {TICKET_PRIORITIES.map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
          </select>
        </label>
        <label className="sv-field"><span>Category</span><input value={f.category} onChange={e => setF({ ...f, category: e.target.value })} placeholder="HVAC, electrical, warranty callback…" /></label>
        <label className="sv-field"><span>SLA Hours</span><input inputMode="numeric" value={f.sla_hours} onChange={e => setF({ ...f, sla_hours: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Only if a contract SLA applies" /></label>
        <label className="sv-field sv-span2"><span>What&apos;s wrong</span><textarea rows={3} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></label>
      </div>
      {err && <p className="sv-err" role="alert">{err}</p>}
      <div className="sv-actions">
        <button type="button" className="sv-btn sv-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="sv-btn sv-primary" disabled={busy}>{busy ? 'Creating…' : 'Create Call'}</button>
      </div>
    </form>
  );
}

function Detail({ t, data, onClose, onSaved }: { t: Ticket; data: Payload; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const status = normaliseTicketStatus(t.status);
  const [tech, setTech] = useState(t.assigned_tech_id || '');
  const [start, setStart] = useState(toLocalInput(t.scheduled_window_start));
  const [end, setEnd] = useState(toLocalInput(t.scheduled_window_end));
  const [pending, setPending] = useState<TicketStatus | null>(null);
  const [reason, setReason] = useState<string>(WAITING_REASONS[0]);
  const [resolution, setResolution] = useState(t.resolution || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'conflict'; text: string } | null>(null);

  useEffect(() => {
    setTech(t.assigned_tech_id || ''); setStart(toLocalInput(t.scheduled_window_start)); setEnd(toLocalInput(t.scheduled_window_end));
    setResolution(t.resolution || ''); setPending(null); setMsg(null);
  }, [t.id, t.updated_at, t.assigned_tech_id, t.scheduled_window_start, t.scheduled_window_end, t.resolution]);

  const run = async (body: Record<string, unknown>, okText: string) => {
    setBusy(true); setMsg(null);
    const r = await patch(t.id, { ...body, expected_updated_at: t.updated_at });
    setBusy(false);
    if (r.ok) { setMsg({ kind: 'ok', text: okText }); setPending(null); setNote(''); await onSaved(); return; }
    if (r.status === 409 && r.body?.needsConfirmation) { setMsg({ kind: 'conflict', text: r.body.error }); return; }
    setMsg({ kind: 'err', text: r.body?.error || 'Could not save.' });
  };

  const saveSchedule = (force = false) => run({ assigned_tech_id: tech || null, scheduled_window_start: fromLocalInput(start), scheduled_window_end: fromLocalInput(end), ...(force ? { force: true } : {}) }, 'Schedule saved.');
  const setStatus = (s: TicketStatus) => {
    if (s === 'waiting' || s === 'completed') { setPending(s); return; }
    run({ status: s }, `Marked ${TICKET_STATUS_LABEL[s]}.`);
  };
  const job = data.projects.find(p => p.id === t.project_id);
  const notes = (t.dispatch_notes || '').split('\n').filter(Boolean).reverse();

  return (
    <section className="sv-card sv-pad sv-detail" aria-labelledby="sv-detail-h">
      <div className="sv-head">
        <div>
          <div className="sv-dim">{t.ticket_number} · {TICKET_STATUS_LABEL[status]}{t.priority ? ` · ${t.priority} priority` : ''}</div>
          <h2 id="sv-detail-h">{t.title}</h2>
        </div>
        <button type="button" className="sv-icon" onClick={onClose} aria-label="Close ticket"><X size={18} /></button>
      </div>
      <dl className="sv-dl">
        <div><dt>Job / Site</dt><dd>{job ? <Link href={`/app/projects/${job.id}/overview`} className="sv-link">{job.name}</Link> : 'No job'}{job && (job.address || job.city) ? <span className="sv-dim"> · {[job.address, job.city].filter(Boolean).join(', ')}</span> : null}</dd></div>
        {t.category && <div><dt>Category</dt><dd>{t.category}</dd></div>}
        <div><dt>SLA</dt><dd>{t.sla_hours ? `${t.sla_hours} hours from creation` : 'No SLA configured'}</dd></div>
        {t.description && <div><dt>Issue</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{t.description}</dd></div>}
      </dl>

      <h3>Assign &amp; Schedule</h3>
      <div className="sv-grid">
        <label className="sv-field sv-span2"><span>Technician</span>
          <select value={tech} onChange={e => setTech(e.target.value)}>
            <option value="">Unassigned</option>
            {data.techs.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
          </select>
        </label>
        <label className="sv-field"><span>Window Start</span><input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label className="sv-field"><span>Window End</span><input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>
      </div>
      <div className="sv-actions"><button type="button" className="sv-btn sv-primary" disabled={busy} onClick={() => saveSchedule(false)}>{busy ? 'Saving…' : 'Save Schedule'}</button></div>

      <h3>Status</h3>
      <div className="sv-statusrow">
        {NEXT[status].map(s => (
          <button key={s} type="button" className="sv-btn sv-ghost" disabled={busy} onClick={() => setStatus(s)}>{TICKET_STATUS_LABEL[s]}</button>
        ))}
      </div>
      {pending === 'waiting' && (
        <div className="sv-inline">
          <label className="sv-field"><span>Waiting on</span>
            <select value={reason} onChange={e => setReason(e.target.value)}>{WAITING_REASONS.map(r => <option key={r}>{r}</option>)}</select>
          </label>
          <button type="button" className="sv-btn sv-primary" disabled={busy} onClick={() => run({ status: 'waiting', waiting_reason: reason }, 'Put on hold.')}>Put On Hold</button>
          <button type="button" className="sv-btn sv-ghost" onClick={() => setPending(null)}>Cancel</button>
        </div>
      )}
      {pending === 'completed' && (
        <div className="sv-inline sv-col">
          <label className="sv-field"><span>Resolution *</span><textarea rows={3} value={resolution} onChange={e => setResolution(e.target.value)} placeholder="What was found and what was done" /></label>
          <div className="sv-actions">
            <button type="button" className="sv-btn sv-ghost" onClick={() => setPending(null)}>Cancel</button>
            <button type="button" className="sv-btn sv-primary" disabled={busy || !resolution.trim()} onClick={() => run({ status: 'completed', resolution }, 'Visit completed. Billing is separate — invoice from Invoicing when ready.')}>Complete Visit</button>
          </div>
        </div>
      )}

      {msg && (
        <div className={`sv-msg sv-${msg.kind}`} role={msg.kind === 'ok' ? 'status' : 'alert'}>
          {msg.kind !== 'ok' && <WarningCircle size={15} weight="fill" />} {msg.text}
          {msg.kind === 'conflict' && <button type="button" className="sv-linkbtn" onClick={() => saveSchedule(true)}>Assign anyway</button>}
        </div>
      )}

      <h3>Notes &amp; History</h3>
      <div className="sv-inline">
        <input className="sv-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Add a dispatch note" aria-label="Dispatch note" />
        <button type="button" className="sv-btn sv-ghost" disabled={busy || !note.trim()} onClick={() => run({ note }, 'Note added.')}>Add</button>
      </div>
      {t.resolution && <p className="sv-res"><strong>Resolution:</strong> {t.resolution}</p>}
      <ul className="sv-notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
    </section>
  );
}

function ServiceInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<Payload>('/api/service-tickets', fetcher, { revalidateOnFocus: true });
  const filter = (sp.get('filter') as Filter) || 'open';
  const selected = sp.get('ticket');
  const creating = sp.get('new') === '1';
  const setParams = (p: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    Object.entries(p).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    router.replace(`/app/service${next.toString() ? '?' + next.toString() : ''}`, { scroll: false });
  };
  const techName = (id: string | null) => (id && data?.techs.find(u => u.id === id)) ? (data!.techs.find(u => u.id === id)!.full_name || data!.techs.find(u => u.id === id)!.email) : null;
  const jobName = (id: string | null) => (id && data?.projects.find(p => p.id === id)?.name) || '—';
  const rows = useMemo(() => {
    const all = data?.tickets || [];
    const today = todayYmd();
    return all.filter(t => {
      const s = normaliseTicketStatus(t.status);
      const open = OPEN_TICKET_STATUSES.includes(s);
      if (filter === 'open') return open;
      if (filter === 'unassigned') return open && !t.assigned_tech_id;
      if (filter === 'today') return open && !!t.scheduled_window_start && new Date(t.scheduled_window_start).toLocaleDateString('en-CA') === today;
      if (filter === 'waiting') return s === 'waiting';
      if (filter === 'completed') return s === 'completed';
      return true;
    }).sort((a, b) => {
      const pr = (p: string | null) => ({ emergency: 0, high: 1, normal: 2, low: 3 } as Record<string, number>)[String(p || 'normal')] ?? 2;
      return pr(a.priority) - pr(b.priority) || String(a.scheduled_window_start || '9999').localeCompare(String(b.scheduled_window_start || '9999'));
    });
  }, [data, filter]);
  const sel = data?.tickets.find(t => t.id === selected) || null;

  return (
    <div className="sv">
      <style>{CSS}</style>
      <Link href="/app?view=service" className="sv-back"><ArrowLeft size={14} /> Service Home</Link>
      <div className="sv-top">
        <h1>Service &amp; Dispatch</h1>
        <button type="button" className="sv-btn sv-primary" onClick={() => setParams({ new: '1', ticket: null })}><Plus size={15} weight="bold" /> New Service Call</button>
      </div>
      <div role="group" aria-label="Filter calls" className="sv-seg">
        {FILTERS.map(f => <button key={f.key} type="button" aria-pressed={filter === f.key} className={filter === f.key ? 'on' : ''} onClick={() => setParams({ filter: f.key })}>{f.label}</button>)}
      </div>

      {error && !data ? (
        <div className="sv-card sv-pad sv-err" role="alert">{(error as Error).message} <button type="button" className="sv-linkbtn" onClick={() => mutate()}>Retry</button></div>
      ) : isLoading && !data ? (
        <div className="sv-card sv-pad sv-dim">Loading service calls…</div>
      ) : data ? (
        <div className={`sv-layout ${sel || creating ? 'with-side' : ''}`}>
          <section className="sv-card sv-pad" aria-label="Service calls">
            {rows.length === 0 ? (
              <p className="sv-dim">{filter === 'open' ? 'No open service calls. Create one when a customer calls in.' : 'Nothing in this filter.'}</p>
            ) : (
              <ul className="sv-list">
                {rows.map(t => {
                  const s = normaliseTicketStatus(t.status);
                  const tn = techName(t.assigned_tech_id);
                  return (
                    <li key={t.id}>
                      <button type="button" className={`sv-row ${t.id === selected ? 'sel' : ''}`} onClick={() => setParams({ ticket: t.id, new: null })}>
                        <span className="sv-rowtop"><span className="sv-num">{t.ticket_number}</span><span className={`sv-pill sv-p-${t.priority || 'normal'}`}>{t.priority || 'normal'}</span><span className="sv-pill">{TICKET_STATUS_LABEL[s]}</span></span>
                        <span className="sv-rowtitle">{t.title}</span>
                        <span className="sv-rowmeta">{jobName(t.project_id)} · {tn || <em className="sv-unassigned">Unassigned</em>} · {fmtWindow(t.scheduled_window_start, t.scheduled_window_end)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {creating ? (
            <NewCall data={data} onClose={() => setParams({ new: null })} onCreated={async id => { await mutate(); setParams({ new: null, ticket: id, filter: 'open' }); }} />
          ) : sel ? (
            <Detail t={sel} data={data} onClose={() => setParams({ ticket: null })} onSaved={() => mutate()} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function ServicePage() {
  return <Suspense fallback={<div style={{ padding: 24, color: 'var(--text-tertiary)' }}>Loading…</div>}><ServiceInner /></Suspense>;
}

const CSS = `
.sv { padding: 24px; max-width: 1600px; margin: 0 auto; color: var(--text-primary); font-size: 15px; }
.sv h1 { font-size: 26px; font-weight: 800; margin: 0; }
.sv h2 { font-size: 18px; font-weight: 750; margin: 2px 0 0; }
.sv h3 { font-size: 14px; font-weight: 750; color: var(--text-secondary); margin: 20px 0 10px; }
.sv-back { display: inline-flex; align-items: center; gap: 6px; color: var(--text-tertiary); font-size: 13px; text-decoration: none; margin-bottom: 10px; }
.sv-top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.sv-seg { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border-radius: 10px; background: var(--bg-surface-2); border: 1px solid var(--glass-border); margin-bottom: 16px; }
.sv-seg button { min-height: 36px; padding: 0 12px; border: 0; border-radius: 7px; background: transparent; color: var(--text-secondary); font-size: 13px; font-weight: 650; cursor: pointer; }
.sv-seg button.on { background: var(--brand-primary); color: var(--on-brand); }
.sv-card { background: var(--bg-surface); border: 1px solid var(--glass-border); border-radius: 14px; box-shadow: var(--glass-highlight); }
.sv-pad { padding: 18px 20px; }
.sv-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: start; }
.sv-layout.with-side { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); }
.sv-list { list-style: none; margin: 0; padding: 0; }
.sv-row { width: 100%; text-align: left; display: flex; flex-direction: column; gap: 4px; padding: 12px 10px; border: 0; border-top: 1px solid var(--border-subtle); background: transparent; color: inherit; cursor: pointer; border-radius: 8px; }
.sv-list li:first-child .sv-row { border-top: 0; }
.sv-row:hover, .sv-row.sel { background: var(--bg-surface-2); }
.sv-row:focus-visible, .sv-btn:focus-visible, .sv-seg button:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
.sv-rowtop { display: flex; gap: 8px; align-items: center; }
.sv-num { font-size: 13px; font-weight: 750; color: var(--text-secondary); }
.sv-rowtitle { font-size: 15px; font-weight: 650; }
.sv-rowmeta { font-size: 13px; color: var(--text-tertiary); }
.sv-unassigned { color: #FFE600; font-style: normal; font-weight: 700; }
.sv-pill { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--bg-surface-2); color: var(--text-secondary); text-transform: capitalize; }
.sv-p-emergency { background: rgba(255,59,48,.16); color: #FF3B30; }
.sv-p-high { background: rgba(255,138,0,.16); color: #FF8A00; }
.sv-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
.sv-icon { background: none; border: 0; color: var(--text-tertiary); cursor: pointer; min-width: 44px; min-height: 44px; }
.sv-dim { color: var(--text-tertiary); font-size: 13px; }
.sv-dl { display: grid; gap: 8px; margin: 0; }
.sv-dl div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px; }
.sv-dl dt { font-size: 13px; color: var(--text-tertiary); }
.sv-dl dd { margin: 0; font-size: 14px; }
.sv-link { color: var(--brand-primary); text-decoration: none; font-weight: 700; }
.sv-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.sv-span2 { grid-column: span 2; }
.sv-field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-secondary); font-weight: 650; }
.sv-field input, .sv-field select, .sv-field textarea, .sv-note { min-height: 44px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--glass-border); background: var(--bg-solid-2, #15171C); color: var(--text-primary); font-size: 16px; font-family: inherit; }
.sv-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.sv-statusrow { display: flex; flex-wrap: wrap; gap: 8px; }
.sv-inline { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; margin-top: 12px; }
.sv-inline.sv-col { flex-direction: column; align-items: stretch; }
.sv-note { flex: 1; min-width: 0; }
.sv-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 16px; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; border: 1px solid transparent; }
.sv-btn:disabled { opacity: .55; cursor: not-allowed; }
.sv-primary { background: var(--brand-primary); color: var(--on-brand); }
.sv-ghost { background: var(--bg-surface-2); border-color: var(--glass-border); color: var(--text-primary); }
.sv-linkbtn { background: none; border: 0; color: var(--brand-primary); font-weight: 700; cursor: pointer; font-size: 13px; }
.sv-msg { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; padding: 10px 12px; border-radius: 10px; font-size: 13.5px; }
.sv-ok { background: rgba(44,255,122,.1); color: #2CFF7A; }
.sv-err { color: #FF3B30; }
.sv-msg.sv-err, .sv-msg.sv-conflict { background: rgba(255,59,48,.1); color: #FF3B30; }
.sv-notes { list-style: none; margin: 10px 0 0; padding: 0; font-size: 13px; color: var(--text-tertiary); display: flex; flex-direction: column; gap: 6px; }
.sv-res { font-size: 14px; margin: 10px 0 0; }
@media (max-width: 1100px) { .sv-layout.with-side { grid-template-columns: minmax(0, 1fr); } .sv-detail { order: -1; } }
@media (max-width: 640px) { .sv { padding: 16px; } .sv-seg button, .sv-linkbtn { min-height: 44px; } .sv-grid { grid-template-columns: minmax(0, 1fr); } .sv-span2 { grid-column: auto; } .sv-dl div { grid-template-columns: minmax(0, 1fr); gap: 2px; } }
`;
