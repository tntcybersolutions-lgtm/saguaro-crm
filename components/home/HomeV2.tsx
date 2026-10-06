'use client';
/**
 * Role-based home — "what needs me next, and let me start it."
 * Spec: docs/SPEC-dashboard-2026-10-03.md. Data: GET /api/home (lib/home/*).
 *
 * Layout: header (view · Mine/Team · job · date window · search · create),
 * four role metrics, Needs Attention (2/3) beside Today's Schedule (1/3), the
 * role's work table, then secondary context. Filters live in the URL so
 * opening a record and coming back keeps the same view.
 */
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, ArrowRight, ArrowClockwise, CaretDown, CalendarBlank, WarningCircle } from '@phosphor-icons/react';
import { useProjects } from '@/lib/hooks/useProjects';
import { useProjectColors } from '@/lib/hooks/useProjectColor';
import { jobStripeStyle, jobOptionStyle } from '@/lib/project-colors';
import ActivityFeed from '@/components/ActivityFeed';
import SalesOverview from '@/components/SalesOverview';
import type { Metric, QueueItem, ScheduleEntry, HomeView, DataState } from '@/lib/home/rank';
import { TIER_LABEL } from '@/lib/home/rank';
import { neonText } from '@/lib/neon';
import { accentForProject } from '@/lib/project-identity';

interface HomePayload {
  context: {
    view: HomeView; viewLabel: string; defaultView: HomeView; savedView: HomeView | null;
    views: Array<{ key: HomeView; label: string }>;
    scope: 'mine' | 'team'; window: 'today' | '7d'; projectId: string | null;
    today: string; timeZone: string; firstName: string | null; classicHome: boolean; canEditWork?: boolean;
  };
  metrics: Metric[];
  queue: { items: QueueItem[]; total: number; state: DataState; note?: string };
  schedule: { entries: ScheduleEntry[]; state: DataState; note?: string };
  workTable: {
    kind: string; title: string; state: DataState; note?: string;
    columns: Array<{ key: string; label: string; align?: 'right' }>;
    rows: Array<Record<string, string | number | null> & { id: string; href: string }>;
  };
  errors: Record<string, string>;
  generatedAt: string;
}

const fetcher = async (url: string): Promise<HomePayload> => {
  const r = await fetch(url);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error || `Request failed (${r.status})`);
  return body as HomePayload;
};

/* Tier colors use the status palette (COPY-STYLE §7). Red/amber/green only
   where they mean something; the rest stays neutral. */
const TIER_TONE: Record<number, { fg: string; bg: string }> = {
  0: { fg: 'var(--danger)', bg: 'rgba(255,59,48,.14)' },
  1: { fg: 'var(--danger)', bg: 'rgba(255,59,48,.14)' },
  2: { fg: 'var(--warning)', bg: 'rgba(255,138,0,.14)' },
  3: { fg: 'var(--brand-primary)', bg: 'rgba(255,230,0,.14)' },
  4: { fg: 'var(--warning)', bg: 'rgba(255,138,0,.12)' },
  5: { fg: 'var(--status-closed)', bg: 'rgba(163,172,187,.12)' },
};

const SECTION_NAMES: Record<string, string> = {
  rfis: 'RFIs', punch: 'Punch list', todos: 'To-dos', fieldIssues: 'Field issues', inspections: 'Inspections',
  approvals: 'Approvals', compliance: 'Compliance', schedule: 'Schedule', leads: 'Leads', proposals: 'Proposals',
  serviceTickets: 'Service tickets', warranty: 'Warranty claims',
};

function fmtDay(ymd: string | null | undefined, today: string): string {
  if (!ymd) return '—';
  const d = String(ymd).slice(0, 10);
  if (d === today) return 'Today';
  const t = new Date(today + 'T12:00:00Z');
  t.setUTCDate(t.getUTCDate() + 1);
  if (d === t.toISOString().slice(0, 10)) return 'Tomorrow';
  const dt = new Date(d + 'T12:00:00Z');
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function fmtTime(hhmm: string | null): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${ampm}`;
}

/* ── Small pieces ─────────────────────────────────────────────────────── */

/** A failing secondary section must not take the whole home down (spec §14:
 *  partial outage keeps the rest usable). SalesOverview, for one, reads nested
 *  fields without guards and threw on an error payload. */
class SectionBoundary extends React.Component<{ name: string; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.error(`[home] ${this.props.name} failed to render`, e); }
  render() {
    if (this.state.failed) return <p className="hv2-empty" role="status">Couldn&apos;t load {this.props.name}. The rest of your home is current.</p>;
    return this.props.children;
  }
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ key: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="hv2-seg">
      {options.map(o => (
        <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)} className={value === o.key ? 'on' : ''}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MetricCard({ m }: { m: Metric }) {
  // Same compact kit tile as the job overview (components/project): small label,
  // prominent tabular value, one supporting line. A missing number is said in
  // words and stays muted — never a bright zero.
  const shown = m.state === 'ok' || m.state === 'empty';
  const text = shown ? m.value : m.state === 'restricted' ? 'No access' : m.state === 'failed' ? 'Couldn\u2019t load' : 'Not available';
  const body = (
    <>
      <span className="k-stat-top"><span className="k-stat-label">{m.label}</span></span>
      <span className="k-stat-value" data-muted={shown ? undefined : 'true'}>{text}</span>
      <span className="k-stat-sub">{shown ? m.basis : m.note || m.basis}</span>
    </>
  );
  return m.href && shown ? (
    <Link href={m.href} className="k-stat" aria-label={`${m.label}: ${m.value}`}>{body}</Link>
  ) : (
    <div className="k-stat">{body}</div>
  );
}

const DECISION_TYPES = ['change_order', 'pay_app', 'purchase_order', 'invoice'];
/** Rows where "who owns it" is not an assignee question: decisions wait on an
 *  approver with the right role, grouped rows stand for many records. Calling
 *  either "Unassigned" read as a problem that wasn't there. */
const ownerless = (it: QueueItem) => it.id.startsWith('group:') || DECISION_TYPES.includes(it.sourceType);

/** Inline completion, only where an existing route already owns the write:
 *  to-dos and punch items. Approvals always open the record first. */
const COMPLETABLE: Partial<Record<string, (id: string) => { url: string; body?: unknown }>> = {
  todo: id => ({ url: `/api/todos/${id}/complete` }),
  punch: id => ({ url: `/api/punch-list/${id}/complete`, body: { status: 'completed' } }),
};

function QueueRow({ it, today, canEdit, onChanged, colorFor }: { it: QueueItem; today: string; canEdit: boolean; onChanged: () => Promise<unknown>; colorFor: (id: string | null) => string }) {
  const tone = TIER_TONE[it.tier];
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [err, setErr] = useState('');
  const complete = COMPLETABLE[it.sourceType];
  const markDone = async () => {
    if (!complete || state === 'busy') return;
    setState('busy'); setErr('');
    try {
      const { url, body } = complete(it.sourceId);
      const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Could not mark done (${r.status})`);
      setState('done');
      await onChanged();
    } catch (e) {
      setState('error');
      setErr((e as Error).message);
    }
  };
  const ownerCell = DECISION_TYPES.includes(it.sourceType)
    ? <span>Your decision</span>
    : it.id.startsWith('group:') ? null
    : <span>{it.owner ? it.owner : <em className="hv2-unassigned">Unassigned</em>}</span>;
  return (
    <li className="hv2-qrow" style={it.projectId ? { ...jobStripeStyle(colorFor(it.projectId)), paddingLeft: 12 } : undefined}>
      <span className="hv2-tier" style={{ color: tone.fg, background: tone.bg }}>{TIER_LABEL[it.tier]}</span>
      <div className="hv2-qmain">
        <div className="hv2-qtitle">{it.title}{it.count ? <span className="hv2-count">{it.count}</span> : null}</div>
        <div className="hv2-qmeta">
          {it.projectName ? <span className="hv2-proj" style={neonText(accentForProject(it.projectId).hex)}>{it.projectName}</span> : null}
          {ownerCell}
          <span>{it.reason}</span>
          {it.dueAt ? <span>Due {fmtDay(it.dueAt, today)}</span> : null}
        </div>
        {state === 'error' && <div className="hv2-qerr" role="alert">{err}</div>}
        {state === 'done' && <div className="hv2-qok" role="status">Marked done.</div>}
      </div>
      <div className="hv2-qactions">
        {complete && canEdit && state !== 'done' && (
          <button type="button" className="hv2-btn hv2-btn-ghost" onClick={markDone} disabled={state === 'busy'} aria-label={`Mark done: ${it.title}`}>
            {state === 'busy' ? 'Saving…' : 'Mark Done'}
          </button>
        )}
        {it.href ? (
          <Link href={it.href} className="hv2-btn hv2-btn-ghost">{it.actionLabel} <ArrowRight size={14} weight="bold" /></Link>
        ) : (
          <span className="hv2-btn hv2-btn-disabled" title="This record type has no screen yet">{it.actionLabel}</span>
        )}
      </div>
    </li>
  );
}

type QFilter = 'all' | 'critical' | 'overdue' | 'today' | 'unassigned';

function NeedsAttention({ data, onChanged }: { data: HomePayload; onChanged: () => Promise<unknown> }) {
  const colorFor = useProjectColors();
  const [filter, setFilter] = useState<QFilter>('all');
  const [expanded, setExpanded] = useState(false);
  const items = data.queue.items;
  const today = data.context.today;
  const counts = {
    critical: items.filter(i => i.tier <= 1).length,
    overdue: items.filter(i => i.tier === 2).length,
    today: items.filter(i => i.tier === 3).length,
    unassigned: items.filter(i => !i.owner && !ownerless(i)).length,
  };
  const filtered = items.filter(i =>
    filter === 'all' ? true : filter === 'critical' ? i.tier <= 1 : filter === 'overdue' ? i.tier === 2 : filter === 'today' ? i.tier === 3 : !i.owner && !ownerless(i));
  const shown = expanded ? filtered : filtered.slice(0, 6);
  const opts: Array<{ key: QFilter; label: string }> = [
    { key: 'all', label: `All ${data.queue.total}` },
    ...(counts.critical ? [{ key: 'critical' as QFilter, label: `Critical ${counts.critical}` }] : []),
    { key: 'overdue', label: `Overdue ${counts.overdue}` },
    { key: 'today', label: `Due Today ${counts.today}` },
    { key: 'unassigned', label: `Unassigned ${counts.unassigned}` },
  ];
  return (
    <section className="hv2-card hv2-pad" aria-labelledby="hv2-needs">
      <div className="hv2-sechead">
        <h2 id="hv2-needs">Needs Attention</h2>
        <Segmented label="Filter the queue" value={filter} options={opts} onChange={v => { setFilter(v); setExpanded(false); }} />
      </div>
      {data.queue.state === 'restricted' ? (
        <p className="hv2-empty">Your role doesn&apos;t include this work area.</p>
      ) : shown.length === 0 ? (
        <p className="hv2-empty">{filter === 'all' ? 'Nothing needs your attention in this view.' : 'Nothing in this filter.'}</p>
      ) : (
        <ul className="hv2-qlist">{shown.map(it => <QueueRow key={it.id} it={it} today={today} canEdit={!!data.context.canEditWork} onChanged={onChanged} colorFor={colorFor} />)}</ul>
      )}
      {filtered.length > 6 && (
        <button type="button" className="hv2-more" onClick={() => setExpanded(e => !e)}>
          {expanded ? 'Show fewer' : `Show all ${filtered.length}`}
        </button>
      )}
    </section>
  );
}

function Schedule({ data }: { data: HomePayload }) {
  const colorFor = useProjectColors();
  const today = data.context.today;
  const groups = useMemo(() => {
    const m = new Map<string, ScheduleEntry[]>();
    for (const e of data.schedule.entries) m.set(e.date, [...(m.get(e.date) || []), e]);
    return [...m.entries()];
  }, [data.schedule.entries]);
  return (
    <section className="hv2-card hv2-pad" aria-labelledby="hv2-sched">
      <div className="hv2-sechead">
        <h2 id="hv2-sched">{data.context.window === 'today' ? "Today's Schedule" : 'Next 7 Days'}</h2>
      </div>
      {data.schedule.state === 'failed' ? (
        <p className="hv2-empty">Couldn&apos;t load the schedule.</p>
      ) : groups.length === 0 ? (
        <p className="hv2-empty">Nothing scheduled in this view. {data.context.window === 'today' ? 'Try Next 7 Days.' : ''}</p>
      ) : (
        <div className="hv2-sched">
          {groups.slice(0, 7).map(([date, list]) => (
            <div key={date}>
              <div className="hv2-sday">{fmtDay(date, today)}</div>
              <ul className="hv2-slist">
                {list.slice(0, 8).map(e => {
                  const inner = (
                    <>
                      <span className="hv2-skind">{fmtTime(e.time) || e.kind}</span>
                      <span className="hv2-stext">
                        <span className="hv2-stitle">{e.title}</span>
                        <span className="hv2-smeta">{fmtTime(e.time) ? e.kind + ' · ' : ''}{e.projectName ? <span className="hv2-proj" style={neonText(accentForProject(e.projectId).hex)}>{e.projectName}</span> : null}{e.who ? ' · ' + e.who : ''}</span>
                      </span>
                    </>
                  );
                  const stripe = e.projectId ? { ...jobStripeStyle(colorFor(e.projectId)), paddingLeft: 10 } : undefined;
                  return <li key={e.id}>{e.href ? <Link href={e.href} className="hv2-srow hv2-link" style={stripe}>{inner}</Link> : <div className="hv2-srow" style={stripe}>{inner}</div>}</li>;
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function WorkTable({ data }: { data: HomePayload }) {
  const colorFor = useProjectColors();
  const t = data.workTable;
  const today = data.context.today;
  const isDateCol = (k: string) => k === 'due' || k === 'nextDate' || k === 'when';
  return (
    <section className="hv2-card hv2-pad" aria-labelledby="hv2-table">
      <div className="hv2-sechead"><h2 id="hv2-table">{t.title}</h2>{t.rows.length ? <span className="hv2-dim">{t.rows.length}</span> : null}</div>
      {t.rows.length === 0 ? (
        <p className="hv2-empty">{t.state === 'failed' ? 'Couldn\'t load this table.' : t.note || 'Nothing here yet.'}</p>
      ) : (
        <div className="hv2-tablewrap" role="region" aria-label={`${t.title} (scrolls sideways on small screens)`} tabIndex={0}>
          <table className="hv2-table">
            <thead><tr>{t.columns.map(c => <th key={c.key} style={{ textAlign: c.align || 'left' }}>{c.label}</th>)}</tr></thead>
            <tbody>
              {t.rows.slice(0, 25).map(r => (
                <tr key={r.id} style={t.kind === 'jobs' || t.kind === 'my-jobs' ? jobStripeStyle(colorFor(String(r.id))) : undefined}>
                  {t.columns.map((c, i) => {
                    const raw = r[c.key];
                    const val = isDateCol(c.key) ? (raw ? fmtDay(String(raw), today) : '—') : raw ?? '—';
                    return (
                      <td key={c.key} style={{ textAlign: c.align || 'left' }}>
                        {i === 0 && r.href ? <Link href={r.href} className="hv2-tlink" style={t.kind === 'jobs' || t.kind === 'my-jobs' ? neonText(accentForProject(r.id).hex) : undefined}>{String(val)}</Link> : String(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function QuickCreate({ view, projectId }: { view: HomeView; projectId: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const p = projectId ? `/app/projects/${projectId}` : null;
  // Never guess a job: job-level items need one picked in the header.
  const items: Array<{ label: string; href: string | null }> = [
    { label: 'Task', href: p && `${p}/todos` },
    { label: 'Daily Log', href: p && `${p}/daily-logs` },
    { label: 'RFI', href: p && `${p}/rfis` },
    { label: 'Punch Item', href: p && `${p}/punch-list` },
    { label: 'Change Order', href: p && `${p}/change-orders` },
    ...(view === 'sales' || view === 'owner' ? [{ label: 'Lead', href: '/app/leads' }] : []),
    ...(view === 'service' ? [{ label: 'Service Call', href: '/app/service?new=1' }, { label: 'Warranty Claim', href: '/app/warranty-claims' }] : []),
    { label: 'Project', href: '/app/projects/new' },
  ];
  return (
    <div className="hv2-create" ref={ref}>
      <button type="button" className="hv2-btn hv2-btn-primary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Plus size={15} weight="bold" /> Create <CaretDown size={12} weight="bold" />
      </button>
      {open && (
        <div role="menu" className="hv2-menu">
          {!projectId && <div className="hv2-menu-hint">Pick a job above for job items.</div>}
          {items.map(i => i.href ? (
            <Link key={i.label} role="menuitem" href={i.href} className="hv2-menu-item" onClick={() => setOpen(false)}>{i.label}</Link>
          ) : (
            <span key={i.label} role="menuitem" aria-disabled="true" className="hv2-menu-item off">{i.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

function HomeInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const { projects } = useProjects();
  const qs = new URLSearchParams();
  for (const k of ['view', 'scope', 'project', 'window']) { const v = sp.get(k); if (v) qs.set(k, v); }
  const key = `/api/home${qs.toString() ? '?' + qs.toString() : ''}`;
  const { data, error, isLoading, mutate } = useSWR<HomePayload>(key, fetcher, { revalidateOnFocus: true, refreshInterval: 120_000, keepPreviousData: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data?.context.classicHome) router.replace('/app/classic'); }, [data?.context.classicHome, router]);

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v); else next.delete(k);
    router.replace(`/app${next.toString() ? '?' + next.toString() : ''}`, { scroll: false });
  };

  const ctx = data?.context;
  const activeProjects = projects.filter(p => !['completed', 'complete', 'closed', 'cancelled', 'archived', 'lost'].includes(String(p.status || '').toLowerCase()));

  const saveDefault = async () => {
    if (!ctx) return;
    setSaving(true);
    try {
      const r = await fetch('/api/home', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ view: ctx.view }) });
      if (r.ok) await mutate();
    } finally { setSaving(false); }
  };

  const failedSections = data ? Object.keys(data.errors || {}) : [];

  return (
    <div className="hv2">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Header */}
      <header className="hv2-header">
        <div className="hv2-titlewrap">
          <h1>{ctx ? `${ctx.viewLabel} Home` : 'Home'}</h1>
          {ctx?.firstName && <span className="hv2-greet">Hi {ctx.firstName}</span>}
        </div>
        <div className="hv2-actions">
          {/* Search lives in the app top bar (⌘K) — one search box, not two. */}
          <QuickCreate view={(ctx?.view || 'operations') as HomeView} projectId={sp.get('project')} />
        </div>
      </header>
      <div className="hv2-controls">
          {ctx && ctx.views.length > 1 && (
            <Segmented label="Dashboard view" value={ctx.view} options={ctx.views} onChange={v => setParam('view', v)} />
          )}
          {ctx && ctx.view !== 'field' && ctx.view !== 'owner' && (
            <Segmented label="Whose work" value={ctx.scope} options={[{ key: 'mine', label: 'My Work' }, { key: 'team', label: 'Team' }]} onChange={v => setParam('scope', v)} />
          )}
          <label className="hv2-select">
            <span className="sr-only">Job</span>
            <select value={sp.get('project') || ''} onChange={e => setParam('project', e.target.value || null)} aria-label="Job">
              <option value="">All Jobs</option>
              {activeProjects.map(p => <option key={p.id} value={p.id} style={jobOptionStyle(p)}>{p.name}</option>)}
            </select>
          </label>
          {ctx && (
            <Segmented label="Date window" value={ctx.window} options={[{ key: 'today', label: 'Today' }, { key: '7d', label: 'Next 7 Days' }]} onChange={v => setParam('window', v)} />
          )}
      </div>
      {ctx && ctx.savedView !== ctx.view && (
        <div className="hv2-hint">
          {ctx.savedView ? `Your default is ${ctx.views.find(v => v.key === ctx.savedView)?.label || ctx.savedView}.` : `Showing ${ctx.viewLabel} because of your role.`}{' '}
          <button type="button" className="hv2-linkbtn" onClick={saveDefault} disabled={saving}>{saving ? 'Saving…' : `Always start on ${ctx.viewLabel}`}</button>
        </div>
      )}

      {error && !data ? (
        <div className="hv2-card hv2-pad hv2-error" role="alert">
          <WarningCircle size={18} weight="fill" /> {String((error as Error).message || 'Could not load your home dashboard.')}
          <button type="button" className="hv2-btn hv2-btn-ghost" onClick={() => mutate()}><ArrowClockwise size={14} /> Retry</button>
        </div>
      ) : isLoading && !data ? (
        <div className="hv2-stack" aria-busy="true" aria-label="Loading your home dashboard">
          <div className="pj-metrics">{[0, 1, 2, 3].map(i => <div key={i} className="k-stat hv2-skel" style={{ height: 96 }} />)}</div>
          <div className="hv2-primary"><div className="hv2-card hv2-skel" style={{ height: 380 }} /><div className="hv2-card hv2-skel" style={{ height: 380 }} /></div>
        </div>
      ) : data ? (
        <div className="hv2-stack">
          {failedSections.length > 0 && (
            <div className="hv2-warn" role="status">
              <WarningCircle size={15} weight="fill" /> Couldn&apos;t load: {failedSections.map(s => SECTION_NAMES[s] || s).join(', ')}. Everything else is current.
              <button type="button" className="hv2-linkbtn" onClick={() => mutate()}>Retry</button>
            </div>
          )}
          <div className="pj-metrics hv2-order-3">{data.metrics.map((m) => <MetricCard key={m.key} m={m} />)}</div>
          <div className="hv2-primary hv2-order-1">
            <NeedsAttention data={data} onChanged={() => mutate()} />
            <Schedule data={data} />
          </div>
          <div className="hv2-order-4"><WorkTable data={data} /></div>
          {(data.context.view === 'sales' || data.context.view === 'owner') && (
            <div className="hv2-order-5">
              <h2 className="hv2-lower-h">Pipeline &amp; Win Rate</h2>
              <SectionBoundary name="the pipeline"><SalesOverview /></SectionBoundary>
            </div>
          )}
          <section className="hv2-card hv2-pad hv2-order-6" aria-labelledby="hv2-activity">
            <div className="hv2-sechead"><h2 id="hv2-activity">Recent Activity</h2></div>
            <SectionBoundary name="recent activity"><ActivityFeed limit={8} /></SectionBoundary>
          </section>
          <footer className="hv2-foot hv2-order-7">
            <span><CalendarBlank size={13} /> Updated {new Date(data.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {data.context.timeZone.replace('_', ' ')}</span>
            <button type="button" className="hv2-linkbtn" onClick={() => mutate()}>Refresh</button>
            <Link href="/app/classic" className="hv2-linkbtn">Classic dashboard</Link>
          </footer>
        </div>
      ) : null}
    </div>
  );
}

export default function HomeV2() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: 'var(--text-tertiary)' }}>Loading…</div>}>
      <HomeInner />
    </Suspense>
  );
}

const CSS = `
.hv2 { padding: 24px clamp(16px, 1.67vw, 32px) 64px; max-width: 1600px; margin: 0 auto; color: var(--text-primary); font-size: 15px; }
.sag-app .hv2 h1, .hv2 h1 { font-size: 28px; font-weight: 800; letter-spacing: -0.015em; line-height: 1.15; margin: 0; }
.sag-app .hv2 h2, .hv2 h2 { color: var(--brand-primary); font-size: 18px; font-weight: 800; letter-spacing: -0.01em; margin: 0; }
.hv2 h1 { color: var(--text-primary); }
.hv2-proj { font-weight: 700; }
.hv2 .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.hv2-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 20px; margin-bottom: 8px; }
.hv2-titlewrap { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.hv2-greet { color: var(--text-tertiary); font-size: 14px; }
.hv2-actions { display: flex; align-items: center; gap: 8px; }
.hv2-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 4px 0 8px; }
.hv2-seg { display: inline-flex; flex-wrap: wrap; background: var(--surface-card); border: 1px solid var(--border-default); border-radius: 999px; padding: 3px; gap: 2px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); }
.hv2-seg button { min-height: 34px; padding: 0 14px; border: 0; border-radius: 999px; background: transparent; color: var(--text-secondary); font-size: 13px; font-weight: 650; cursor: pointer; }
.hv2-seg button.on { background: var(--brand-primary); color: var(--on-brand); font-weight: 800; box-shadow: inset 0 1px 0 rgba(255,255,255,0.5); }
.hv2-seg button:focus-visible, .hv2-btn:focus-visible, .hv2-select select:focus-visible, .hv2-link:focus-visible, .hv2-tlink:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
.hv2-select select { min-height: 40px; max-width: 240px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--border-default); background: var(--surface-raised); color: var(--text-primary); font-size: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06); }
.hv2-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 14px; border-radius: 10px; font-size: 14px; font-weight: 700; text-decoration: none; cursor: pointer; white-space: nowrap; border: 1px solid transparent; }
.hv2-btn-primary { background: var(--grad-primary); color: var(--on-brand); border-color: rgba(0,0,0,0.25); box-shadow: inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(0,0,0,0.18), 0 8px 22px -10px rgba(255,200,0,0.8); }
.hv2-btn-primary:hover { background: var(--grad-primary-hover); }
.hv2-btn-ghost { background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)), var(--surface-raised); border-color: var(--border-default); color: var(--text-primary); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08); }
.hv2-btn-ghost:hover { border-color: var(--border-strong); }
.hv2-btn-disabled { background: transparent; border-color: var(--glass-border); color: var(--text-tertiary); cursor: not-allowed; }
.hv2-hint { color: var(--text-tertiary); font-size: 13px; margin: 0 0 16px; }
.hv2-linkbtn { background: none; border: 0; padding: 0; color: var(--brand-primary); font-weight: 700; font-size: 13px; cursor: pointer; text-decoration: none; }
.hv2-stack { display: flex; flex-direction: column; gap: 20px; margin-top: 12px; }
/* Same layered card as .k-card: solid dark surface, a sharp upper-edge
   highlight and a yellow-to-orange top edge; no broad glow. */
.hv2-card { position: relative; background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.025) 48px, rgba(255,255,255,0) 160px), var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); }
.hv2-card::before { content: ''; position: absolute; left: 14px; right: 14px; top: -1px; height: 2px; border-radius: 2px; background: linear-gradient(90deg, transparent, var(--brand-primary) 30%, #FF8A00 70%, transparent); opacity: .9; pointer-events: none; }
.hv2-pad { padding: 20px 22px; }
.hv2-link { text-decoration: none; color: inherit; }
.hv2-primary { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.hv2-sechead { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.hv2-dim { color: var(--text-tertiary); font-size: 13px; }
.hv2-empty { color: var(--text-secondary); font-size: 14px; margin: 8px 0; }
.hv2-qlist, .hv2-slist { list-style: none; margin: 0; padding: 0; }
.hv2-qrow { display: grid; grid-template-columns: 112px minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--border-subtle); }
.hv2-qrow:first-child { border-top: 0; }
.hv2-tier { justify-self: start; font-size: 12px; font-weight: 750; padding: 4px 9px; border-radius: 999px; white-space: nowrap; }
.hv2-qtitle { color: var(--title-color, #FFE600); font-size: 15px; font-weight: 700; overflow-wrap: anywhere; }
.hv2-count { margin-left: 8px; font-size: 12px; font-weight: 750; padding: 1px 7px; border-radius: 999px; background: var(--bg-surface-2); color: var(--text-secondary); }
.hv2-qmeta { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 3px; font-size: 13px; color: var(--text-tertiary); }
.hv2-unassigned { color: #FFE600; font-style: normal; font-weight: 700; }
.hv2-qactions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.hv2-qerr { margin-top: 6px; font-size: 13px; color: #FF3B30; }
.hv2-qok { margin-top: 6px; font-size: 13px; color: #2CFF7A; }
.hv2-more { margin-top: 10px; background: none; border: 0; color: var(--brand-primary); font-weight: 700; font-size: 14px; cursor: pointer; min-height: 36px; }
.hv2-sched { display: flex; flex-direction: column; gap: 14px; }
.hv2-sday { font-size: 12.5px; font-weight: 750; color: var(--text-secondary); margin-bottom: 6px; }
.hv2-srow { display: flex; gap: 10px; padding: 8px 0; border-top: 1px solid var(--border-subtle); text-decoration: none; color: inherit; }
.hv2-skind { flex: 0 0 74px; font-size: 12.5px; font-weight: 700; color: var(--text-secondary); }
.hv2-stext { display: flex; flex-direction: column; min-width: 0; }
.hv2-stitle { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.hv2-smeta { font-size: 12.5px; color: var(--text-tertiary); }
.hv2-tablewrap { overflow-x: auto; }
.hv2-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.hv2-table th { font-size: 12.5px; font-weight: 700; color: var(--text-secondary); padding: 8px 10px; border-bottom: 1px solid var(--glass-border); white-space: nowrap; }
.hv2-table td { padding: 11px 10px; border-bottom: 1px solid var(--border-subtle); color: var(--text-primary); font-variant-numeric: tabular-nums; }
.hv2-table tr:hover td { background: rgba(255,255,255,0.025); }
.hv2-tlink { color: var(--title-color, #FFE600); font-weight: 700; text-decoration: none; }
.hv2-tlink:hover { color: var(--brand-primary); }
.hv2-create { position: relative; }
.hv2-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 50; min-width: 220px; padding: 6px; border-radius: 12px; background: var(--c-raised); border: 1px solid var(--border-default); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 16px 40px -12px rgba(0,0,0,.85); }
.hv2-menu-hint { font-size: 12.5px; color: var(--text-tertiary); padding: 6px 10px 8px; }
.hv2-menu-item { display: block; padding: 10px 12px; border-radius: 8px; font-size: 14px; font-weight: 600; color: var(--text-primary); text-decoration: none; }
.hv2-menu-item:hover { background: var(--bg-surface-2); }
.hv2-menu-item.off { color: var(--text-disabled); cursor: not-allowed; }
.hv2-warn { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13.5px; color: #FFE600; background: rgba(255,230,0,.08); border: 1px solid rgba(255,230,0,.3); border-radius: 10px; padding: 10px 14px; }
.hv2-error { display: flex; align-items: center; gap: 10px; color: #FF3B30; }
.hv2-skel { background: linear-gradient(90deg, var(--bg-surface), var(--bg-surface-2), var(--bg-surface)); background-size: 200% 100%; animation: hv2sk 1.4s ease infinite; }
@keyframes hv2sk { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .hv2-skel { animation: none; } }
.hv2-lower-h { margin: 4px 0 12px !important; }
.hv2-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; font-size: 13px; color: var(--text-tertiary); padding-bottom: 8px; }
.hv2-foot span { display: inline-flex; align-items: center; gap: 6px; }
@media (max-width: 1100px) {
  .hv2-primary { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .hv2 { padding: 16px; }
  .sag-app .hv2 h1, .hv2 h1 { font-size: 24px; }
  .hv2-qrow { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .hv2-qrow .hv2-btn { min-height: 44px; }
  .hv2-qactions { justify-content: flex-start; }
  .hv2-seg button { min-height: 44px; }
  .hv2-linkbtn, .hv2-more { min-height: 44px; display: inline-flex; align-items: center; }
  .hv2-hide-sm { display: none; }
  .hv2-select { display: block; min-width: 0; max-width: 100%; flex: 1 1 100%; }
  .hv2-select select { max-width: 100%; width: 100%; }
  .hv2-controls .hv2-seg, .hv2-controls .hv2-btn { min-width: 0; max-width: 100%; }
  .hv2-order-1 { order: 1; } .hv2-order-3 { order: 3; } .hv2-order-4 { order: 4; } .hv2-order-5 { order: 5; } .hv2-order-6 { order: 6; } .hv2-order-7 { order: 7; }
}
`;
