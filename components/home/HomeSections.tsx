'use client';
/**
 * Home's sections as flat rows: Bidding, Jobs, Money, Needs attention, the
 * view's work list, Coming up, and Activity. Every row's words and numbers come
 * from /api/home (lib/home/flat, lib/home/build); this file only lays them out.
 */
import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Camera, CalendarBlank, ChartLineUp, ClockCounterClockwise, Flag, HardHat, Receipt, UserCircle, Wrench } from '@phosphor-icons/react';
import { FlatList, FlatEmpty, Row, RowAction, RowSkeleton, SectionLabel, Tabs, type DotColor } from '@/components/ui/flat';
import type { BidRow, JobRow, MoneyRow, TextPart } from '@/lib/home/flat';
import type { FlatSection } from '@/lib/home/flat-build';
import type { QueueItem } from '@/lib/home/rank';
import type { TickerItem } from '@/lib/home/ticker';
import { fmtDowMonDay, shortJobName } from '@/lib/home/flat';
import type { JobHealth } from '@/lib/job-health';
import { HealthRing, JOB_HEALTH_CSS } from '@/components/jobs/JobHealthParts';

/* ── Text ───────────────────────────────────────────────────────────────── */

/** A meta line: parts joined with " · ", emphasis and tone kept. */
export function Meta({ parts }: { parts: TextPart[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && ' · '}
          {p.b ? <b data-tone={p.tone}>{p.t}</b> : p.tone ? <span data-tone={p.tone}>{p.t}</span> : p.t}
        </React.Fragment>
      ))}
    </>
  );
}

/** Running text (the brief): parts as written, bold where marked. */
export function Prose({ parts }: { parts: TextPart[] }) {
  return <>{parts.map((p, i) => (p.b ? <b key={i}>{p.t}</b> : <React.Fragment key={i}>{p.t}</React.Fragment>))}</>;
}

/* ── Section scaffolding ────────────────────────────────────────────────── */

/** A section that failed to load says so, with Retry; the rest of Home still renders. */
export function SectionFailed({ name, onRetry }: { name: string; onRetry: () => void }) {
  return (
    <p className="fh-fail" role="status">
      Couldn&apos;t load {name} · <button type="button" onClick={onRetry}>Retry</button>
    </p>
  );
}

/** One line + one action. */
export function SectionEmpty({ text, action }: { text: string; action?: { label: string; href: string } }) {
  return <p className="fh-empty">{text}{action && <> <Link href={action.href}>{action.label} ›</Link></>}</p>;
}

/** A row with its one action beside it (never a button inside the row's link). */
function RowWithAction({ action, ...row }: React.ComponentProps<typeof Row> & { action: React.ReactNode }) {
  return (
    <div className="fh-row2">
      <div className="fh-grow"><Row {...row} chevron={false} /></div>
      <span className="fh-act">{action}</span>
    </div>
  );
}

/* ── Bidding ────────────────────────────────────────────────────────────── */

export function BiddingSection({ sec, onRetry }: { sec: FlatSection<BidRow>; onRetry: () => void }) {
  const [all, setAll] = useState(false);
  if (sec.state === 'restricted') return null;
  const rows = all ? sec.rows : sec.rows.slice(0, 5);
  return (
    <>
      <SectionLabel id="fh-bidding" action={sec.rows.length > 5 ? { label: all ? 'Fewer' : `All ${sec.total}`, onClick: () => setAll(a => !a) } : undefined}>Bidding</SectionLabel>
      {sec.state === 'failed' ? <SectionFailed name="Bidding" onRetry={onRetry} />
        : sec.state === 'empty' ? <SectionEmpty text="No bid packages out right now." action={{ label: 'Open a job', href: '/app/projects' }} />
        : (
          <FlatList label="Bid packages out">
            {rows.map(b => (
              <li key={b.id}>
                {b.action
                  ? <RowWithAction icon={<Flag size={18} weight="bold" />} dot={b.dot} title={b.title} meta={<Meta parts={b.meta} />} href={b.href}
                      action={<RowAction href={b.action.href} label={`${b.action.label}: ${b.title}`}>{b.action.label}</RowAction>} />
                  : <Row icon={<Flag size={18} weight="bold" />} dot={b.dot} title={b.title} meta={<Meta parts={b.meta} />} right={b.right} rightSub={b.rightSub} href={b.href} chevron={false} />}
              </li>
            ))}
          </FlatList>
        )}
    </>
  );
}

/* ── Jobs ───────────────────────────────────────────────────────────────── */

/** Health per job id, from the Jobs list (useProjects). Jobs are shown worst first once it is in. */
export function JobsSection({ sec, onRetry, health }: { sec: FlatSection<JobRow>; onRetry: () => void; health?: Map<string, JobHealth> }) {
  if (sec.state === 'restricted') return null;
  const rows = health && health.size
    ? [...sec.rows].sort((a, b) => (health.get(a.id)?.score ?? 101) - (health.get(b.id)?.score ?? 101))
    : sec.rows;
  return (
    <>
      <SectionLabel id="fh-jobs" action={sec.total ? { label: `All ${sec.total}`, href: '/app/projects' } : undefined}>Jobs</SectionLabel>
      {sec.state === 'failed' ? <SectionFailed name="Jobs" onRetry={onRetry} />
        : sec.state === 'empty' ? <SectionEmpty text="No active jobs yet." action={{ label: 'New job', href: '/app/projects/new' }} />
        : (
          <div className="hs-jobs">
          <style dangerouslySetInnerHTML={{ __html: JOB_HEALTH_CSS + HS_JOBS_CSS }} />
          <FlatList label="Jobs">
            {rows.map(j => {
              const h = health?.get(j.id);
              return (
                <li key={j.id} data-ring={h ? '' : undefined}>
                  <Row icon={h ? <HealthRing health={h} size={40} /> : <HardHat size={18} weight="bold" />} tone={h ? undefined : j.dot ? undefined : 'info'} dot={h ? undefined : j.dot || undefined} title={j.title} meta={<Meta parts={j.meta} />} bar={j.billedPct} right={j.right} rightSub={j.rightSub} href={j.href} chevron={false} />
                </li>
              );
            })}
          </FlatList>
          </div>
        )}
    </>
  );
}

/* The ring replaces the icon tile: no box behind it. */
const HS_JOBS_CSS = `.hs-jobs li[data-ring] .k-tile{background:transparent !important;border:0 !important;box-shadow:none !important;width:42px;height:42px;padding:0}`;

/* ── Money ──────────────────────────────────────────────────────────────── */

export function MoneySection({ sec, onRetry }: { sec: FlatSection<MoneyRow> & { usualDays: number | null }; onRetry: () => void }) {
  // Only when there is something to say: no rows, no section.
  if (sec.state === 'restricted' || sec.state === 'empty') return null;
  return (
    <>
      <SectionLabel id="fh-money">Money{sec.usualDays != null && <small> · usually paid in {sec.usualDays} days</small>}</SectionLabel>
      {sec.state === 'failed' ? <SectionFailed name="pay apps" onRetry={onRetry} /> : (
        <FlatList label="Pay apps">
          {sec.rows.map(m => (
            <li key={m.id}><Row icon={<Receipt size={18} weight="bold" />} dot={m.dot} title={m.title} meta={<Meta parts={m.meta} />} right={m.right} rightSub={m.rightSub} href={m.href} chevron={false} /></li>
          ))}
        </FlatList>
      )}
    </>
  );
}

/* ── Needs attention (the ranked queue) ─────────────────────────────────── */

const DECISION_TYPES = ['change_order', 'pay_app', 'purchase_order', 'invoice'];
const ownerless = (it: QueueItem) => it.id.startsWith('group:') || DECISION_TYPES.includes(it.sourceType);
const tierDot = (t: number): DotColor => (t <= 2 ? 'red' : t === 3 ? 'amber' : t === 4 ? 'gold' : 'grey');

/** Inline completion only where an existing route owns the write: to-dos and punch items. */
const COMPLETABLE: Partial<Record<string, (id: string) => { url: string; body?: unknown }>> = {
  todo: id => ({ url: `/api/todos/${id}/complete` }),
  punch: id => ({ url: `/api/punch-list/${id}/complete`, body: { status: 'completed' } }),
};

function queueMeta(it: QueueItem, today: string): TextPart[] {
  const parts: TextPart[] = [];
  if (it.projectName) parts.push({ t: shortJobName(it.projectName) });
  if (DECISION_TYPES.includes(it.sourceType)) parts.push({ t: 'your decision' });
  else if (!ownerless(it)) parts.push(it.owner ? { t: it.owner } : { t: 'Unassigned', tone: 'warn' });
  if (it.reason) parts.push({ t: it.reason, tone: it.tier <= 2 ? 'bad' : undefined });
  const due = it.dueAt ? it.dueAt.slice(0, 10) : null;
  if (due && !/due|overdue|today/i.test(it.reason)) parts.push({ t: due === today ? 'due today' : `due ${fmtDowMonDay(due)}` });
  return parts;
}

function QueueRow({ it, today, canEdit, onChanged }: { it: QueueItem; today: string; canEdit: boolean; onChanged: () => Promise<unknown> }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [err, setErr] = useState('');
  const complete = COMPLETABLE[it.sourceType];
  const title = <>{it.title}{it.count ? ` (${it.count})` : ''}</>;
  const meta = state === 'error' ? <span data-tone="bad">{err}</span> : state === 'done' ? <span data-tone="good">Marked done.</span> : <Meta parts={queueMeta(it, today)} />;
  if (complete && canEdit && state !== 'done') {
    const markDone = async () => {
      if (state === 'busy') return;
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
    return <RowWithAction dot={tierDot(it.tier)} title={title} meta={meta} href={it.href || undefined}
      action={<RowAction onClick={markDone} busy={state === 'busy'} label={`Mark done: ${it.title}`}>{state === 'busy' ? 'Saving…' : 'Done'}</RowAction>} />;
  }
  return <Row dot={tierDot(it.tier)} title={title} meta={meta} href={it.href || undefined} />;
}

/** Four filters at most, so they fit a phone: urgent = critical, blocking today, or overdue. */
type QFilter = 'all' | 'urgent' | 'today' | 'unassigned';
const FILTER_LABEL: Record<QFilter, string> = { all: 'All', urgent: 'Urgent', today: 'Today', unassigned: 'No owner' };

export function AttentionSection({ items, total, restricted, today, canEdit, review, onChanged }: {
  items: QueueItem[]; total: number; restricted: boolean; today: string; canEdit: boolean;
  /** Owner: sub photos / video waiting to be looked at (the old alert strip's "review" lines). */
  review: TickerItem[];
  onChanged: () => Promise<unknown>;
}) {
  const [filter, setFilter] = useState<QFilter>('all');
  const [all, setAll] = useState(false);
  const test: Record<QFilter, (i: QueueItem) => boolean> = {
    all: () => true,
    urgent: i => i.tier <= 2,
    today: i => i.tier === 3,
    unassigned: i => !i.owner && !ownerless(i),
  };
  const counts = { all: total } as Record<QFilter, number>;
  for (const k of ['urgent', 'today', 'unassigned'] as QFilter[]) counts[k] = items.filter(test[k]).length;
  const filtered = items.filter(test[filter]);
  const shown = all ? filtered : filtered.slice(0, 6);
  const opts = (['all', 'urgent', 'today', 'unassigned'] as QFilter[])
    .filter(k => k === 'all' || counts[k] > 0)
    .map(k => ({ key: k, label: FILTER_LABEL[k], count: counts[k] }));
  const reviewRows = filter === 'all' ? review : [];
  return (
    <>
      <SectionLabel id="fh-attn" action={filtered.length > 6 ? { label: all ? 'Show fewer' : `Show all ${filtered.length}`, onClick: () => setAll(a => !a) } : undefined}>Needs attention</SectionLabel>
      {restricted ? <FlatEmpty>Your role doesn&apos;t include this work area.</FlatEmpty> : (
        <>
          {items.length > 6 && opts.length > 2 && <Tabs label="Filter what needs attention" value={filter} options={opts} onChange={k => { setFilter(k); setAll(false); }} />}
          {shown.length === 0 && reviewRows.length === 0
            ? <SectionEmpty text={filter === 'all' ? 'Nothing needs you right now.' : 'Nothing in this filter.'} action={filter === 'all' ? { label: 'My Work', href: '/app/my-work' } : undefined} />
            : (
              <FlatList label="Needs attention">
                {shown.map(it => <li key={it.id}><QueueRow it={it} today={today} canEdit={canEdit} onChanged={onChanged} /></li>)}
                {reviewRows.map(r => <li key={r.id}><Row icon={<Camera size={18} weight="bold" />} dot="blue" title={r.text} meta="Not looked at yet" href={r.href} /></li>)}
              </FlatList>
            )}
        </>
      )}
    </>
  );
}

/* ── The view's own list (Sales leads, Service calls, Field jobs) ───────── */

type WorkTable = {
  kind: string; title: string; state: string; note?: string;
  columns: Array<{ key: string; label: string; align?: 'right' }>;
  rows: Array<Record<string, string | number | null> & { id: string; href: string }>;
};
const NIL = (v: unknown) => v == null || v === '' || v === '—' || v === 'Not set' || v === 'None recorded' || String(v).startsWith('Unknown');
const DATE_COLS = ['due', 'nextDate', 'when'];
const RIGHT_COLS = ['value', 'contract', 'open'];
const KIND_ICON: Record<string, React.ElementType> = { leads: UserCircle, service: Wrench, 'my-jobs': HardHat, jobs: HardHat };
const ALL_LINK: Record<string, string> = { leads: '/app/leads', service: '/app/service', 'my-jobs': '/app/projects', jobs: '/app/projects' };

export function WorkRowsSection({ table, today, onRetry }: { table: WorkTable; today: string; onRetry: () => void }) {
  const [all, setAll] = useState(false);
  const first = table.columns[0]?.key;
  const KindIcon = KIND_ICON[table.kind] || HardHat;
  const rightCol = table.columns.find(c => RIGHT_COLS.includes(c.key));
  const rows = all ? table.rows.slice(0, 25) : table.rows.slice(0, 6);
  const meta = (r: WorkTable['rows'][number]): TextPart[] => table.columns
    .filter(c => c.key !== first && c !== rightCol && !NIL(r[c.key]))
    .map(c => {
      const v = String(r[c.key]);
      if (DATE_COLS.includes(c.key)) return { t: `${c.label.toLowerCase()} ${v.slice(0, 10) === today ? 'today' : fmtDowMonDay(v.slice(0, 10))}` };
      return { t: c.key === 'open' ? `${v} open` : v, tone: /unassigned/i.test(v) ? 'warn' as const : undefined };
    });
  const more = table.rows.length > 6 ? { label: all ? 'Fewer' : `All ${table.rows.length}`, onClick: () => setAll(a => !a) }
    : ALL_LINK[table.kind] && table.rows.length ? { label: 'All', href: ALL_LINK[table.kind] } : undefined;
  return (
    <>
      <SectionLabel id="fh-work" action={more}>{table.title}</SectionLabel>
      {table.state === 'failed' ? <SectionFailed name={table.title} onRetry={onRetry} />
        : table.rows.length === 0 ? <SectionEmpty text={table.note || 'Nothing here yet.'} />
        : (
          <FlatList label={table.title}>
            {rows.map(r => (
              <li key={r.id}>
                <Row icon={<KindIcon size={18} weight="bold" />} tone="info" title={String(r[first] ?? '—')} meta={<Meta parts={meta(r)} />} right={rightCol && !NIL(r[rightCol.key]) ? String(r[rightCol.key]) : undefined} href={r.href} />
              </li>
            ))}
          </FlatList>
        )}
    </>
  );
}

/* ── Coming up · pipeline (links out) ───────────────────────────────────── */

export function LinksSection({ comingUp, pipeline }: { comingUp: { count: number; next: { title: string; date: string; kind: string } | null }; pipeline: boolean }) {
  const next = comingUp.next;
  return (
    <>
      <SectionLabel id="fh-links">More</SectionLabel>
      <FlatList label="More">
        <li>
          <Row icon={<CalendarBlank size={18} weight="bold" />} tone="info" title="Coming up" href="/app/my-work"
            meta={comingUp.count ? <><b>{comingUp.count}</b> in the next 7 days{next ? <> · next: {next.title}, {fmtDowMonDay(next.date)}</> : null}</> : 'Your schedule for the week is in My Work'} />
        </li>
        {pipeline && <li><Row icon={<ChartLineUp size={18} weight="bold" />} tone="info" title="Pipeline & win rate" meta="Leads, follow-ups, won vs active" href="/app/sales" /></li>}
      </FlatList>
    </>
  );
}

/* ── Activity ───────────────────────────────────────────────────────────── */

interface Activity { id: string; action: string; description: string | null; user_name: string | null; project_id: string | null; project_name: string | null; created_at: string | null }

/** "3 min ago" from the difference — never by formatting a date-only string. */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d} day${d === 1 ? '' : 's'} ago` : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const activityFetcher = async (url: string): Promise<{ activities: Activity[] }> => {
  const r = await fetch(url);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error || 'Could not load recent activity.');
  return body;
};

export function ActivitySection({ projectId, done }: { projectId: string | null; done: TickerItem[] }) {
  const key = `/api/activity?limit=5${projectId ? `&project=${projectId}` : ''}`;
  const { data, error, isLoading, mutate } = useSWR(key, activityFetcher, { revalidateOnFocus: true });
  const rows = data?.activities || [];
  return (
    <>
      <SectionLabel id="fh-activity">Activity</SectionLabel>
      {error && !data ? <SectionFailed name="activity" onRetry={() => mutate()} />
        : isLoading && !data ? <RowSkeleton rows={3} />
        : rows.length === 0 && done.length === 0 ? <SectionEmpty text="Nothing has happened yet. Each save, send and award lands here." />
        : (
          <FlatList label="Recent activity">
            {done.map(d => <li key={d.id}><Row dot="green" title={d.text} href={d.href} /></li>)}
            {rows.map(a => {
              const meta = [a.user_name, a.project_name ? shortJobName(a.project_name) : null, ago(a.created_at)].filter(Boolean).join(' · ');
              return <li key={a.id}><Row icon={<ClockCounterClockwise size={18} weight="bold" />} title={a.description || a.action} meta={meta} href={a.project_id ? `/app/projects/${a.project_id}/overview` : undefined} /></li>;
            })}
          </FlatList>
        )}
    </>
  );
}
