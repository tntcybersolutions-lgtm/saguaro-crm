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
import { Plus, ArrowRight, ArrowClockwise, CaretDown, CalendarBlank, WarningCircle, Check } from '@phosphor-icons/react';
import { useProjects } from '@/lib/hooks/useProjects';
import { useProjectColors } from '@/lib/hooks/useProjectColor';
import { jobStripeStyle, jobOptionStyle, jobDotStyle } from '@/lib/project-colors';
import ActivityFeed from '@/components/ActivityFeed';
import SalesOverview from '@/components/SalesOverview';
import type { Metric, QueueItem, ScheduleEntry, HomeView, DataState } from '@/lib/home/rank';
import { TIER_LABEL } from '@/lib/home/rank';

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

/** "Good morning" in the company's time zone, not the browser's. */
function greeting(timeZone: string): string {
  let h = 12;
  try {
    h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(new Date()));
  } catch (e) {
    console.error('[home] unknown time zone for greeting', timeZone, e);
  }
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** TUESDAY · OCT 6 */
function eyebrowDate(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00Z');
  const wd = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${wd} · ${md}`;
}

/** Server words for "nothing recorded" — shown calm, never as a value. */
const isNil = (v: unknown) => v == null || v === '—' || v === 'Not set' || v === 'None recorded' || String(v).startsWith('Unknown');

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

/** One cell of the hero strip. The lead cell (a money total with a share
 *  billed) gets the big figure and a bar; the rest say what the number means
 *  in a few words. A missing number is said in words and stays muted. */
function HeroCell({ m, lead }: { m: Metric; lead: boolean }) {
  const shown = m.state === 'ok' || m.state === 'empty';
  const text = shown ? m.value : m.state === 'restricted' ? 'No access' : m.state === 'failed' ? 'Couldn\u2019t load' : 'Not available';
  const first = (m.basis || '').split(' · ')[0];
  let foot: React.ReactNode;
  if (!shown) foot = <span className="hv2-hsub">{m.note || m.basis}</span>;
  else if (m.key === 'risk') foot = m.state === 'empty'
    ? <span className="hv2-chip hv2-chip-good"><Check size={12} weight="bold" /> All clear</span>
    : <span className="hv2-chip hv2-chip-warn">of {first}</span>;
  else if (m.key === 'billed') foot = <span className="hv2-hsub">{m.state === 'empty' ? 'No open receivables' : first}</span>;
  else if (m.key === 'decisions' || m.key === 'approvals') foot = m.state === 'empty'
    ? <span className="hv2-hsub">Nothing waiting on you</span>
    : <span className="hv2-chip hv2-chip-warn">{first}</span>;
  else foot = <span className="hv2-hsub">{m.basis}</span>;
  const pct = m.progress != null ? Math.round(m.progress * 100) : null;
  const body = (
    <>
      <span className="hv2-hlabel">{m.label}</span>
      <span className="hv2-hvalue" data-muted={shown ? undefined : 'true'}>{text}</span>
      {shown && pct != null && (
        <span className="hv2-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${pct}% billed`}><i style={{ width: `${pct}%` }} /></span>
      )}
      {foot}
    </>
  );
  const cls = `hv2-hcell${lead ? ' hv2-hlead' : ''}`;
  return m.href && shown
    ? <Link href={m.href} className={`${cls} hv2-link`} title={m.basis} aria-label={`${m.label}: ${m.value}`}>{body}</Link>
    : <div className={cls} title={m.basis || m.note}>{body}</div>;
}

function Hero({ metrics }: { metrics: Metric[] }) {
  const lead = metrics[0]?.progress != null;
  return (
    <section className="hv2-hero" data-lead={lead ? 'true' : undefined} aria-label="Key numbers">
      {metrics.map((m, i) => <HeroCell key={m.key} m={m} lead={lead && i === 0} />)}
    </section>
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
          {it.projectName ? <span className="hv2-proj"><span style={jobDotStyle(colorFor(it.projectId))} />{it.projectName}</span> : null}
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
          <Link href={it.href} className="hv2-btn hv2-btn-outline">{it.actionLabel} <ArrowRight size={14} weight="bold" /></Link>
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
        <h2 id="hv2-needs">Needs Attention{data.queue.total ? <span className="hv2-cnt">{data.queue.total}</span> : null}</h2>
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

/** A calendar tile: TODAY / WED over the day number. */
function DateTile({ ymd, today }: { ymd: string; today: string }) {
  const d = new Date(ymd + 'T12:00:00Z');
  const top = ymd === today ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  return (
    <div className="hv2-dt" data-today={ymd === today ? 'true' : undefined} aria-hidden="true">
      <span>{top}</span><b>{d.getUTCDate()}</b>
    </div>
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
        <div className="hv2-day">
          <DateTile ymd={today} today={today} />
          <div className="hv2-dbody">
            <p className="hv2-nothing">Nothing scheduled</p>
            <p className="hv2-empty">{data.context.window === 'today' ? 'Try Next 7 Days, or add' : 'Add'} milestones, inspections or meetings to a job and they land here.</p>
          </div>
        </div>
      ) : (
        <div className="hv2-sched">
          {groups.slice(0, 7).map(([date, list]) => (
            <div key={date} className="hv2-day">
              <DateTile ymd={date} today={today} />
              <div className="hv2-dbody">
                <span className="sr-only">{fmtDay(date, today)}</span>
                <ul className="hv2-slist">
                  {list.slice(0, 8).map(e => {
                    const inner = (
                      <>
                        <span className="hv2-stitle">{e.title}</span>
                        <span className="hv2-smeta">
                          {fmtTime(e.time) ? <b>{fmtTime(e.time)}</b> : null}
                          <span>{e.kind}</span>
                          {e.projectName ? <span className="hv2-proj"><span style={jobDotStyle(colorFor(e.projectId))} />{e.projectName}</span> : null}
                          {e.who ? <span>{e.who}</span> : null}
                        </span>
                      </>
                    );
                    const stripe = e.projectId ? { ...jobStripeStyle(colorFor(e.projectId)), paddingLeft: 10 } : undefined;
                    return <li key={e.id}>{e.href ? <Link href={e.href} className="hv2-srow hv2-link" style={stripe}>{inner}</Link> : <div className="hv2-srow" style={stripe}>{inner}</div>}</li>;
                  })}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Progress as a slim bar plus the number; '—' when the job has none. */
function ProgressCell({ v }: { v: unknown }) {
  const n = typeof v === 'string' && /^\d+%$/.test(v) ? parseInt(v, 10) : null;
  if (n == null) return <span className="hv2-nil">—</span>;
  return (
    <span className="hv2-pcell">
      <span className="hv2-bar hv2-bar-sm" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={n} aria-label={`${n}% complete`}><i style={{ width: `${n}%` }} /></span>
      <span className="hv2-pnum">{n}%</span>
    </span>
  );
}

function WorkTable({ data }: { data: HomePayload }) {
  const colorFor = useProjectColors();
  const t = data.workTable;
  const today = data.context.today;
  const isJobs = t.kind === 'jobs' || t.kind === 'my-jobs';
  const isDateCol = (k: string) => k === 'due' || k === 'nextDate' || k === 'when';
  const rows = t.rows.slice(0, 25);
  const cell = (key: string, raw: unknown) => {
    if (key === 'progress') return <ProgressCell v={raw} />;
    if (key === 'phase' && !isNil(raw)) return <span className="hv2-pill">{String(raw)}</span>;
    const val = isDateCol(key) ? (raw ? fmtDay(String(raw), today) : '—') : raw ?? '—';
    return isNil(val) ? <span className="hv2-nil">{String(val)}</span> : String(val);
  };
  const extra = t.columns.filter(c => !['job', 'phase', 'progress', 'contract'].includes(c.key) && c.key !== t.columns[0]?.key);
  return (
    <section className="hv2-card hv2-pad" aria-labelledby="hv2-table">
      <div className="hv2-sechead">
        <h2 id="hv2-table">{t.title}{t.rows.length ? <span className="hv2-cnt">{t.rows.length}</span> : null}</h2>
        {isJobs && t.rows.length > 0 && <Link href="/app/projects" className="hv2-linkbtn">View all jobs</Link>}
      </div>
      {t.rows.length === 0 ? (
        <p className="hv2-empty">{t.state === 'failed' ? 'Couldn\'t load this table.' : t.note || 'Nothing here yet.'}</p>
      ) : (
        <>
          <div className={`hv2-tablewrap${isJobs ? ' hv2-hide-sm' : ''}`} role="region" aria-label={`${t.title} (scrolls sideways on small screens)`} tabIndex={0}>
            <table className="hv2-table">
              <thead><tr>{t.columns.map(c => <th key={c.key} style={{ textAlign: c.align || 'left' }}>{c.label}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    {t.columns.map((c, i) => (
                      <td key={c.key} style={{ textAlign: c.align || 'left' }} className={i === 0 ? 'hv2-tfirst' : undefined}>
                        {i === 0 && r.href ? (
                          <Link href={r.href} className="hv2-tlink">
                            {isJobs && <span style={jobDotStyle(colorFor(String(r.id)))} />}
                            {String(r[c.key] ?? '—')}
                          </Link>
                        ) : cell(c.key, r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isJobs && (
            <ul className="hv2-jobcards">
              {rows.map(r => {
                const first = t.columns[0]?.key || 'job';
                const contract = t.columns.some(c => c.key === 'contract') && !isNil(r.contract) ? String(r.contract) : null;
                const hasProgress = t.columns.some(c => c.key === 'progress');
                return (
                  <li key={r.id}>
                    <Link href={r.href} className="hv2-jobcard hv2-link">
                      <span className="hv2-jc-top">
                        <span style={jobDotStyle(colorFor(String(r.id)))} />
                        <span className="hv2-jc-name">{String(r[first] ?? '—')}</span>
                        {contract && <span className="hv2-jc-money">{contract}</span>}
                      </span>
                      <span className="hv2-jc-meta">
                        {!isNil(r.phase) && <span className="hv2-pill">{String(r.phase)}</span>}
                        {extra.filter(c => !isNil(isDateCol(c.key) ? (r[c.key] ? fmtDay(String(r[c.key]), today) : null) : r[c.key])).map(c => (
                          <span key={c.key}><em>{c.label}</em> {isDateCol(c.key) ? fmtDay(String(r[c.key]), today) : String(r[c.key])}</span>
                        ))}
                      </span>
                      {hasProgress && !isNil(r.progress) && <ProgressCell v={r.progress} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
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

      {/* Header: date, greeting, every control on one row, one primary action. */}
      <header className="hv2-header">
        <div className="hv2-titlewrap">
          {ctx && <div className="hv2-eyebrow">{eyebrowDate(ctx.today)} · {ctx.viewLabel} view</div>}
          <h1>{ctx?.firstName ? `${greeting(ctx.timeZone)}, ${ctx.firstName}` : ctx ? `${ctx.viewLabel} Home` : 'Home'}</h1>
        </div>
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
          {/* Search lives in the app top bar (⌘K) — one search box, not two. */}
          <QuickCreate view={(ctx?.view || 'operations') as HomeView} projectId={sp.get('project')} />
        </div>
      </header>
      {/* Offer to keep a view only when it differs from where they'd land. */}
      {ctx && (ctx.savedView ? ctx.savedView !== ctx.view : ctx.view !== ctx.defaultView) && (
        <div className="hv2-hint">
          {ctx.savedView ? `Your default is ${ctx.views.find(v => v.key === ctx.savedView)?.label || ctx.savedView}.` : null}{' '}
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
          <div className="hv2-hero hv2-skel" style={{ height: 132 }} />
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
          <div className={data.context.view === 'owner' ? 'hv2-order-0' : 'hv2-order-3'}><Hero metrics={data.metrics} /></div>
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
          {/* ActivityFeed brings its own card and title — wrapping it in a
              second card drew a box inside a box. */}
          <div className="hv2-order-6">
            <SectionBoundary name="recent activity"><ActivityFeed limit={8} /></SectionBoundary>
          </div>
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
.hv2 { padding: 24px clamp(16px, 1.67vw, 32px) 64px; max-width: 1600px; margin: 0 auto; color: var(--c-text); font-size: 15px; }
.sag-app .hv2 h1, .hv2 h1 { font-size: 32px; font-weight: 900; letter-spacing: -0.025em; line-height: 1.1; margin: 0; }
.sag-app .hv2 h2, .hv2 h2 { display: inline-flex; align-items: center; gap: 8px; color: var(--c-text); font-size: 17px; font-weight: 800; letter-spacing: -0.01em; margin: 0; }
.hv2-eyebrow { color: var(--c-orange); font-size: 11.5px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 6px; }
.hv2-cnt { font-size: 12px; font-weight: 800; letter-spacing: 0; padding: 2px 8px; border-radius: 999px; background: rgba(255,230,0,0.12); color: var(--c-yellow); }
.hv2-proj { display: inline-flex; align-items: center; gap: 6px; color: var(--c-text); font-weight: 700; }
.hv2 .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.hv2-header { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 14px 20px; margin-bottom: 18px; }
.hv2-titlewrap { min-width: 0; }
.hv2-controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
.hv2-seg { display: inline-flex; flex-wrap: wrap; gap: 2px; }
.hv2-seg button { min-height: 34px; padding: 0 13px; border: 0; background: transparent; font-size: 13px; cursor: pointer; }
.hv2-seg button:focus-visible, .hv2-btn:focus-visible, .hv2-select select:focus-visible, .hv2-link:focus-visible, .hv2-tlink:focus-visible { outline: 2px solid var(--c-yellow); outline-offset: 2px; }
.hv2-select select { min-height: 42px; max-width: 240px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.04); color: var(--c-text); font-size: 16px; font-weight: 600; }
.hv2-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 14px; border-radius: 10px; font-size: 14px; font-weight: 700; text-decoration: none; cursor: pointer; white-space: nowrap; border: 1px solid transparent; }
.hv2-btn-primary { min-height: 42px; background: linear-gradient(180deg, var(--c-yellow-hi), var(--c-yellow) 55%, var(--c-yellow-hover)); color: var(--on-brand); border-color: rgba(0,0,0,0.25); box-shadow: inset 0 1px 0 rgba(255,255,255,0.55), 0 8px 22px -10px rgba(255,200,0,0.75); }
.hv2-btn-primary:hover { filter: brightness(1.04); }
.hv2-btn-ghost { background: rgba(255,255,255,0.04); border-color: var(--border-default); color: var(--c-text); }
.hv2-btn-ghost:hover { background: rgba(255,255,255,0.07); }
.hv2-btn-outline { background: rgba(255,230,0,0.05); border-color: rgba(255,230,0,0.38); color: var(--c-yellow); }
.hv2-btn-outline:hover { background: rgba(255,230,0,0.11); border-color: rgba(255,230,0,0.6); }
.hv2-btn-disabled { background: transparent; border-color: var(--border-subtle); color: var(--c-text-3); cursor: not-allowed; }
.hv2-hint { color: var(--c-text-3); font-size: 13px; margin: -6px 0 16px; text-align: right; }
.hv2-linkbtn { background: none; border: 0; padding: 0; color: var(--c-yellow); font-weight: 700; font-size: 13px; cursor: pointer; text-decoration: none; }
.hv2-linkbtn:hover { text-decoration: underline; text-underline-offset: 3px; }
.hv2-stack { display: flex; flex-direction: column; gap: 20px; }
.hv2-card, .hv2-hero { position: relative; background: linear-gradient(180deg, var(--c-raised), var(--c-card)); border: 1px solid var(--border-subtle); border-radius: 18px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 18px 40px -24px rgba(0,0,0,0.9); }
.hv2-pad { padding: 20px 22px; }
.hv2-link { text-decoration: none; color: inherit; }
/* Hero strip: one card, four figures. */
.hv2-hero { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); overflow: hidden; }
.hv2-hero[data-lead] { grid-template-columns: minmax(0, 1.6fr) repeat(3, minmax(0, 1fr)); }
.hv2-hcell { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 20px 22px; min-width: 0; }
.hv2-hcell + .hv2-hcell { border-left: 1px solid var(--border-subtle); }
a.hv2-hcell:hover { background: rgba(255,255,255,0.025); }
.hv2-hlabel { color: var(--c-text-3); font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
.hv2-hvalue { color: var(--c-yellow); font-size: 28px; font-weight: 900; letter-spacing: -0.02em; line-height: 1.05; font-variant-numeric: tabular-nums; }
.hv2-hlead .hv2-hvalue { font-size: 38px; }
.hv2-hvalue[data-muted] { color: var(--c-text-3); font-size: 18px; font-weight: 700; }
.hv2-hsub { color: var(--c-text-2); font-size: 12.5px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.hv2-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 750; padding: 3px 9px; border-radius: 999px; }
.hv2-chip-good { color: var(--c-green); background: rgba(44,255,122,0.10); }
.hv2-chip-warn { color: var(--c-orange); background: rgba(255,138,0,0.12); }
.hv2-chip-warn::before { content: ''; width: 6px; height: 6px; border-radius: 999px; background: currentColor; }
.hv2-bar { display: block; position: relative; width: 100%; height: 6px; border-radius: 999px; background: rgba(255,255,255,0.07); overflow: hidden; margin: 4px 0 2px; }
.hv2-bar > i { display: block; height: 100%; min-width: 0; border-radius: inherit; background: linear-gradient(90deg, var(--c-yellow), var(--c-orange)); }
.hv2-bar-sm { width: 96px; height: 5px; margin: 0; }
.hv2-pcell { display: inline-flex; align-items: center; gap: 10px; }
.hv2-pnum { color: var(--c-text-2); font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums; min-width: 34px; }
.hv2-primary { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.hv2-sechead { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.hv2-dim { color: var(--c-text-3); font-size: 13px; }
.hv2-empty { color: var(--c-text-2); font-size: 14px; margin: 4px 0; line-height: 1.45; }
.hv2-nothing { color: var(--c-text); font-size: 15px; font-weight: 700; margin: 2px 0; }
.hv2-nil { color: var(--c-text-4); }
.hv2-qlist, .hv2-slist { list-style: none; margin: 0; padding: 0; }
.hv2-qrow { display: grid; grid-template-columns: 112px minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--border-subtle); }
.hv2-qrow:first-child { border-top: 0; }
.hv2-tier { justify-self: start; font-size: 11.5px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; padding: 4px 9px; border-radius: 999px; white-space: nowrap; }
.hv2-qtitle { color: var(--c-text); font-size: 15px; font-weight: 700; overflow-wrap: anywhere; }
.hv2-count { margin-left: 8px; font-size: 12px; font-weight: 750; padding: 1px 7px; border-radius: 999px; background: rgba(255,255,255,0.06); color: var(--c-text-2); }
.hv2-qmeta { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 3px; font-size: 13px; color: var(--c-text-2); }
.hv2-unassigned { color: var(--c-orange); font-style: normal; font-weight: 700; }
.hv2-qactions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.hv2-qerr { margin-top: 6px; font-size: 13px; color: var(--c-red); }
.hv2-qok { margin-top: 6px; font-size: 13px; color: var(--c-green); }
.hv2-more { margin-top: 10px; background: none; border: 0; color: var(--c-yellow); font-weight: 700; font-size: 14px; cursor: pointer; min-height: 36px; }
/* Schedule: a date tile beside each day's entries. */
.hv2-sched { display: flex; flex-direction: column; gap: 14px; }
.hv2-day { display: flex; gap: 14px; align-items: flex-start; }
.hv2-dt { flex: 0 0 52px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 56px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle); }
.hv2-dt span { color: var(--c-orange); font-size: 10.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
.hv2-dt b { color: var(--c-text); font-size: 20px; font-weight: 900; line-height: 1.1; font-variant-numeric: tabular-nums; }
.hv2-dt[data-today] { border-color: rgba(255,230,0,0.4); background: rgba(255,230,0,0.06); }
.hv2-dt[data-today] span { color: var(--c-yellow); }
.hv2-dbody { flex: 1; min-width: 0; }
.hv2-srow { display: flex; flex-direction: column; gap: 2px; padding: 8px 0; border-top: 1px solid var(--border-subtle); text-decoration: none; color: inherit; }
.hv2-slist li:first-child .hv2-srow { border-top: 0; padding-top: 2px; }
.hv2-stitle { color: var(--c-text); font-size: 14px; font-weight: 650; overflow-wrap: anywhere; }
.hv2-smeta { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 12.5px; color: var(--c-text-2); }
.hv2-smeta b { color: var(--c-text); font-weight: 750; }
/* Work table */
.hv2-tablewrap { overflow-x: auto; }
.hv2-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.hv2-table th { font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--c-text-3); padding: 8px 12px; border-bottom: 1px solid var(--border-subtle); white-space: nowrap; }
.hv2-table td { padding: 13px 12px; border-bottom: 1px solid var(--border-subtle); color: var(--c-text-2); font-variant-numeric: tabular-nums; vertical-align: middle; }
.hv2-table tr:last-child td { border-bottom: 0; }
.hv2-table tbody tr:hover td { background: rgba(255,230,0,0.025); }
.hv2-tlink { display: inline-flex; align-items: center; gap: 10px; color: var(--c-text); font-weight: 750; text-decoration: none; }
.hv2-tlink:hover { color: var(--c-yellow); }
.hv2-pill { display: inline-flex; align-items: center; font-size: 12px; font-weight: 750; padding: 3px 10px; border-radius: 999px; color: var(--c-text); background: rgba(255,255,255,0.06); border: 1px solid var(--border-subtle); white-space: nowrap; }
.hv2-jobcards { display: none; list-style: none; margin: 0; padding: 0; }
.hv2-jobcard { display: flex; flex-direction: column; gap: 10px; padding: 14px 2px; border-top: 1px solid var(--border-subtle); min-height: 44px; }
.hv2-jobcards li:first-child .hv2-jobcard { border-top: 0; padding-top: 4px; }
.hv2-jc-top { display: flex; align-items: center; gap: 10px; min-width: 0; }
.hv2-jc-name { flex: 1; min-width: 0; color: var(--c-text); font-size: 15px; font-weight: 750; overflow-wrap: anywhere; }
.hv2-jc-money { color: var(--c-text); font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
.hv2-jc-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font-size: 13px; color: var(--c-text-2); }
.hv2-jc-meta em { font-style: normal; color: var(--c-text-3); font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; margin-right: 2px; }
.hv2-jobcard .hv2-pcell { width: 100%; }
.hv2-jobcard .hv2-bar-sm { flex: 1; width: auto; }
/* Create menu */
.hv2-create { position: relative; }
.hv2-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 50; min-width: 220px; padding: 6px; border-radius: 14px; background: var(--c-raised); border: 1px solid var(--border-default); box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 44px -12px rgba(0,0,0,.9); }
.hv2-menu-hint { font-size: 12.5px; color: var(--c-text-3); padding: 6px 10px 8px; }
.hv2-menu-item { display: block; padding: 10px 12px; border-radius: 9px; font-size: 14px; font-weight: 600; color: var(--c-text-2); text-decoration: none; }
.hv2-menu-item:hover { background: rgba(255,230,0,0.08); color: var(--c-text); }
.hv2-menu-item.off { color: var(--c-text-4); cursor: not-allowed; }
.hv2-menu-item.off:hover { background: transparent; color: var(--c-text-4); }
.hv2-warn { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13.5px; color: var(--c-orange); background: rgba(255,138,0,.08); border: 1px solid rgba(255,138,0,.3); border-radius: 12px; padding: 10px 14px; }
.hv2-error { display: flex; align-items: center; gap: 10px; color: var(--c-red); }
.hv2-skel { background: linear-gradient(90deg, var(--c-card), var(--c-raised), var(--c-card)); background-size: 200% 100%; animation: hv2sk 1.4s ease infinite; }
@keyframes hv2sk { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .hv2-skel { animation: none; } }
.hv2-lower-h { margin: 4px 0 12px !important; }
.hv2-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; font-size: 13px; color: var(--c-text-3); padding-bottom: 8px; }
.hv2-foot span { display: inline-flex; align-items: center; gap: 6px; }
@media (max-width: 1100px) {
  .hv2-primary { grid-template-columns: minmax(0, 1fr); }
  .hv2-header { align-items: flex-start; flex-direction: column; }
  .hv2-controls { justify-content: flex-start; }
  .hv2-hint { text-align: left; }
}
@media (max-width: 900px) {
  .hv2-hero, .hv2-hero[data-lead] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hv2-hero[data-lead] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .hv2-hero[data-lead] .hv2-hlead { grid-column: 1 / -1; border-bottom: 1px solid var(--border-subtle); }
  .hv2-hero[data-lead] .hv2-hcell:nth-child(2) { border-left: 0; }
  .hv2-hero:not([data-lead]) .hv2-hcell:nth-child(odd) { border-left: 0; }
  .hv2-hero:not([data-lead]) .hv2-hcell:nth-child(n+3) { border-top: 1px solid var(--border-subtle); }
}
@media (max-width: 640px) {
  .hv2 { padding: 16px; }
  .sag-app .hv2 h1, .hv2 h1 { font-size: 26px; }
  .hv2-header { margin-bottom: 14px; }
  .hv2-pad { padding: 16px; }
  .hv2-hcell { padding: 14px 12px; }
  .hv2-hlead { padding: 16px; }
  .hv2-hvalue { font-size: 22px; }
  .hv2-hlead .hv2-hvalue { font-size: 32px; }
  .hv2-hlabel { font-size: 10px; letter-spacing: 0.1em; }
  .hv2-chip { font-size: 11px; padding: 2px 7px; }
  .hv2-qrow { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .hv2-qrow .hv2-btn { min-height: 44px; }
  .hv2-qactions { justify-content: flex-start; }
  .hv2-seg { display: flex; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; max-width: 100%; }
  .hv2-seg { contain: inline-size; }
  .hv2-seg::-webkit-scrollbar { display: none; }
  .hv2-seg button { min-height: 44px; flex: 1 0 auto; padding: 0 8px; font-size: 12.5px; }
  .hv2-sechead .hv2-seg { display: grid; grid-template-columns: 1fr 1fr; width: 100%; overflow: visible; contain: none; }
  .hv2-chip { background: none; padding: 0; border-radius: 0; line-height: 1.35; }
  .hv2-chip-warn::before { display: none; }
  .hv2-linkbtn, .hv2-more { min-height: 44px; display: inline-flex; align-items: center; }
  .hv2-hide-sm { display: none; }
  .hv2-jobcards { display: block; }
  .hv2-controls { width: 100%; }
  .hv2-select { display: block; min-width: 0; max-width: 100%; flex: 1 1 100%; }
  .hv2-select select { max-width: 100%; width: 100%; min-height: 44px; }
  .hv2-controls .hv2-seg, .hv2-controls .hv2-btn { min-width: 0; max-width: 100%; }
  .hv2-controls > .hv2-seg:first-child { flex: 1 1 100%; }
  .hv2-controls > .hv2-seg:not(:first-child) { flex: 1 1 auto; }
  .hv2-create .hv2-btn { min-height: 44px; }
  .hv2-order-0 { order: 0; } .hv2-order-1 { order: 1; } .hv2-order-3 { order: 3; } .hv2-order-4 { order: 4; } .hv2-order-5 { order: 5; } .hv2-order-6 { order: 6; } .hv2-order-7 { order: 7; }
}
`;
