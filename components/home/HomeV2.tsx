'use client';
/**
 * Home — flat and list-first (approved by Chad on 2026-10-10; see
 * components/ui/flat.tsx). Phone first.
 *
 *   date · view chip · job chip · +        one row of controls
 *   Good morning, Chad                     22px
 *   Sage's brief                           one or two sentences, one action
 *   number strip                           four figures for the view
 *   Bidding · Jobs · Money · Needs attention · the view's list · More · Activity
 *
 * Every word and number comes from GET /api/home (`flat` + the existing
 * sections). Filters live in the URL, so opening a row and coming back keeps
 * the view. Nothing on this page scrolls the window: the schedule and its
 * Today / Next 7 Days switch moved to My Work ("Coming up" links there).
 */
import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { FlatStyles, Brief, NumberStrip, RowSkeleton } from '@/components/ui/flat';
import { useProjects } from '@/lib/hooks/useProjects';
import type { TickerItem, TickerSummary } from '@/lib/home/ticker';
import type { Metric, QueueItem, ScheduleEntry, HomeView, DataState } from '@/lib/home/rank';
import type { FlatHome } from '@/lib/home/flat-build';
import HomeHeader from './HomeHeader';
import { ActivitySection, AttentionSection, BiddingSection, JobsSection, LinksSection, MoneySection, Prose, WorkRowsSection } from './HomeSections';
import { HOME_CSS } from './home-css';
import { STATUS_HEADER, reasonFromResponse, isNetworkError, NO_SIGNAL_DETAIL } from '@/lib/ui/status-fetch';

export interface HomePayload {
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
  ticker?: { items: TickerItem[]; summary: TickerSummary; state: DataState };
  flat: FlatHome;
  generatedAt: string;
}

const fetcher = async (url: string): Promise<HomePayload> => {
  const r = await fetch(url);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error || `Couldn't load your home (${r.status}).`);
  return body as HomePayload;
};

const CLOSED = ['completed', 'complete', 'closed', 'cancelled', 'archived', 'lost'];

/** Where each section sits: phone order, and the column on a wide screen. */
type SectionKey = 'brief' | 'strip' | 'bidding' | 'jobs' | 'money' | 'attention' | 'work' | 'links' | 'activity';
const PHONE_ORDER: Record<HomeView, SectionKey[]> = {
  owner: ['brief', 'strip', 'bidding', 'jobs', 'money', 'attention', 'links', 'activity'],
  operations: ['brief', 'strip', 'attention', 'bidding', 'jobs', 'money', 'links', 'activity'],
  sales: ['brief', 'strip', 'attention', 'work', 'links', 'activity'],
  service: ['brief', 'strip', 'attention', 'work', 'links', 'activity'],
  field: ['brief', 'strip', 'attention', 'work', 'links', 'activity'],
};
const SIDE: SectionKey[] = ['strip', 'bidding', 'links'];

function HomeInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const { projects } = useProjects();
  const qs = new URLSearchParams();
  for (const k of ['view', 'scope', 'project']) { const v = sp.get(k); if (v) qs.set(k, v); }
  const key = `/api/home${qs.toString() ? '?' + qs.toString() : ''}`;
  const { data, error, isLoading, isValidating, mutate } = useSWR<HomePayload>(key, fetcher, { revalidateOnFocus: true, refreshInterval: 120_000, keepPreviousData: true });
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  useEffect(() => { if (data?.context.classicHome) router.replace('/app/classic'); }, [data?.context.classicHome, router]);

  const setParam = (k: 'view' | 'scope' | 'project', v: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v); else next.delete(k);
    next.delete('window'); // the schedule switch moved to My Work
    setSaveNote(null);
    router.replace(`/app${next.toString() ? '?' + next.toString() : ''}`, { scroll: false });
  };

  const saveDefault = async () => {
    if (!data) return;
    setSaving(true); setSaveNote(null);
    try {
      const r = await fetch('/api/home', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ view: data.context.view }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Could not save your home view.');
      await mutate();
      setSaveNote(`Home now opens on ${data.context.viewLabel}.`);
    } catch (e) {
      setSaveNote((e as Error).message);
    } finally { setSaving(false); }
  };

  /* The brief's "Turn links on" does the switch here (the same route My Work's
     Turn on uses) instead of only opening the jacket. */
  const [turning, setTurning] = useState(false);
  const turnLinksOn = async (ids: string[]) => {
    setTurning(true); setSaveNote(null);
    let on = 0;
    let why: string | null = null;
    try {
      for (const id of ids) {
        const r = await fetch(`/api/bid-packages/${id}/portal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [STATUS_HEADER]: "Turning on the bid link|Bid link on|Couldn't turn on the bid link" },
          body: JSON.stringify({ enabled: true }),
        });
        if (r.ok) on++; else why = await reasonFromResponse(r);
      }
    } catch (e) {
      why = isNetworkError(e) ? NO_SIGNAL_DETAIL : 'Something stopped it before it reached the server. Try again.';
    } finally {
      setTurning(false);
    }
    const left = ids.length - on;
    setSaveNote(why == null
      ? (ids.length > 1 ? 'Bid links on — your bidders can open the jackets now.' : 'Bid link on — your bidders can open the jacket now.')
      : `${on ? `${on} of ${ids.length} bid links on. ` : ''}Couldn't turn on ${left > 1 ? `${left} bid links` : 'the bid link'}: ${why}`);
    void mutate();
  };

  const ctx = data?.context || null;
  const projectId = sp.get('project');
  const activeProjects = projects.filter(p => !CLOSED.includes(String(p.status || '').toLowerCase()));
  const retry = () => { void mutate(); };

  let body: React.ReactNode;
  if (error && !data) {
    body = (
      <p className="fh-fail" role="alert">
        {String((error as Error).message || "Couldn't load your home.")} · <button type="button" onClick={retry}>Retry</button>
      </p>
    );
  } else if (!data) {
    body = (
      <div aria-busy="true" aria-label="Loading your home">
        <div className="fl-brief" style={{ display: 'grid', gap: 8 }}><span className="fh-skel-line" style={{ width: '92%' }} /><span className="fh-skel-line" style={{ width: '64%' }} /></div>
        <RowSkeleton rows={7} />
      </div>
    );
  } else {
    const f = data.flat;
    const view = data.context.view;
    const order = PHONE_ORDER[view] || PHONE_ORDER.operations;
    const review = (data.ticker?.items || []).filter(t => t.tone === 'review');
    const done = (data.ticker?.items || []).filter(t => t.tone === 'green' && t.id !== 'clear');
    const render: Record<SectionKey, React.ReactNode> = {
      brief: f?.brief ? (
        <Brief action={f.brief.action?.portalIds?.length
          ? { label: turning ? 'Turning on…' : f.brief.action.label, onClick: () => { if (!turning) void turnLinksOn(f.brief.action!.portalIds!); } }
          : f.brief.action || undefined}>
          <Prose parts={f.brief.parts} />
        </Brief>
      ) : null,
      strip: f?.strip?.length ? (
        <NumberStrip items={f.strip.map(s => ({
          value: <span title={s.note}>{s.value ?? '—'}</span>,
          label: s.label,
          tone: s.value == null ? undefined : s.tone,
        }))} />
      ) : null,
      bidding: f?.bidding ? <BiddingSection sec={f.bidding} onRetry={retry} /> : null,
      jobs: f?.jobs ? <JobsSection sec={f.jobs} onRetry={retry} /> : null,
      money: f?.money ? <MoneySection sec={f.money} onRetry={retry} /> : null,
      attention: (
        <AttentionSection items={data.queue.items} total={data.queue.total} restricted={data.queue.state === 'restricted'}
          today={data.context.today} canEdit={!!data.context.canEditWork} review={review} onChanged={() => mutate()} />
      ),
      work: <WorkRowsSection table={data.workTable} today={data.context.today} onRetry={retry} />,
      links: f?.comingUp ? <LinksSection comingUp={f.comingUp} pipeline={view === 'sales' || view === 'owner'} /> : null,
      activity: <ActivitySection projectId={projectId} done={done} />,
    };
    const place = (k: SectionKey) => (
      render[k] == null ? null : <section key={k} className="fh-sec" data-section={k} style={{ order: order.indexOf(k) }}>{render[k]}</section>
    );
    // Wide screen: the brief, the work and what happened on the left; figures, bids and links on the right.
    body = (
      <>
        {saveNote && <p className="fh-notice" role="status">{saveNote}</p>}
        <div className="fh-cols">
          <div className="fh-main">{order.filter(k => !SIDE.includes(k)).map(place)}</div>
          <div className="fh-side">{order.filter(k => SIDE.includes(k)).map(place)}</div>
        </div>
        <footer className="fh-foot">
          <span>Updated {new Date(data.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: data.context.timeZone })} · {data.context.timeZone.replace(/_/g, ' ')}</span>
          <button type="button" onClick={retry} disabled={isValidating}>{isValidating ? 'Refreshing…' : 'Refresh'}</button>
          <Link href="/app/classic">Classic dashboard</Link>
        </footer>
      </>
    );
  }

  return (
    <div className="fh">
      <div className="fh-in" aria-busy={isLoading || undefined}>
        <FlatStyles />
        <style dangerouslySetInnerHTML={{ __html: HOME_CSS }} />
        <HomeHeader
          ctx={ctx}
          loading={!data && !error}
          projects={activeProjects}
          projectId={projectId}
          onParam={setParam}
          onSaveDefault={saveDefault}
          saving={saving}
        />
        {body}
      </div>
    </div>
  );
}

export default function HomeV2() {
  return (
    <Suspense fallback={<div className="fh"><div className="fh-in"><FlatStyles /><RowSkeleton rows={6} /></div></div>}>
      <HomeInner />
    </Suspense>
  );
}
