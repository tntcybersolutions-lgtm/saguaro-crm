'use client';
/**
 * My Work — the GC's to-do list, flat (Chad's 2026-10-10 look).
 *
 *   Today · N      Do first (red / amber: money or a deadline at risk), then
 *                  the rest, then a peek at what's coming up
 *   This week · N  the next 7 days, under small day labels (TUE OCT 20)
 *   Later          further out, and anything without a date
 *
 * Rows come from /api/my-work (lib/my-work-server reads the tables; lib/my-work
 * buckets and ranks — the same rule the tab badge counts with). Each row's one
 * button really does the thing: Turn on (the bid link), Remind (every bidder
 * who hasn't answered — sent / failed reported honestly), Request (a COI via
 * the compliance "Ask for it"), Done (punch, to-do, schedule task), Snooze.
 *
 * Tabs switch in place and nothing here moves the page: no scrollIntoView, no
 * scrollTo, and the list keeps its height across a tab change so the browser
 * never has to clamp the scroll position either.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { FlatStyles, FlatList, SectionLabel, Tabs, RowSkeleton } from '@/components/ui/flat';
import { UiFx } from '@/components/ui/fx';
import { buildView, dayLabel, fmtDay, groupByDay, type Bucket, type MyWorkItem, type Snooze } from '@/lib/my-work';
import { addDays } from '@/lib/time-zone';
import { STATUS_HEADER, reasonFromResponse, isNetworkError, NO_SIGNAL_DETAIL } from '@/lib/ui/status-fetch';
import { MyWorkRow, type RowControl } from './MyWorkRow';

type Payload = {
  today: string;
  zone: string;
  companyWide: boolean;
  assigned: number;
  items: MyWorkItem[];
  snoozes: Snooze[];
  snoozeReady: boolean;
  failures: Array<{ source: string; label: string }>;
};

class LoadError extends Error {}

const fetcher = async (url: string): Promise<Payload> => {
  const r = await fetch(url);
  if (!r.ok) throw new LoadError(await reasonFromResponse(r));
  return r.json();
};

const CSS = `
.mw{max-width:1040px;margin:0 auto;padding-bottom:24px}
.mw-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:14px 16px 2px}
.sag-app .mw .mw-h1,.mw .mw-h1{margin:0;font-size:20px;line-height:1.2}
.mw-date{font-size:12px;font-weight:600;letter-spacing:.4px;color:var(--sg-text-2);white-space:nowrap}
.sag-app .mw .fl-sec,.mw .fl-sec{margin:0}
.mw .fl-row{position:relative}
.mw .fl-row:has(.mw-tl:active){background:var(--sg-border)}
.mw .mw-tl{color:inherit;text-decoration:none;outline:none}
.mw .mw-tl::after{content:'';position:absolute;inset:0}
.mw .mw-tl:focus-visible::after{outline:2px solid var(--focus-ring);outline-offset:-2px}
.mw .fl-act,.mw .mw-more,.mw .fl-chev{position:relative;z-index:1}
.mw .fl-act::after{inset:-5px -2px}
.mw .fl-sec-act{position:relative}
.mw .fl-sec-act::after{content:'';position:absolute;inset:-6px -6px}
.mw [role=tabpanel]{overflow-anchor:none}
.mw .fl-chev{pointer-events:none}
.mw-more{display:inline-flex;gap:2px;flex:none}
.mw-sec{position:relative;height:36px;padding:0 10px;border:0;background:none;color:var(--sg-text-3);font:inherit;font-size:13px;font-weight:600;border-radius:8px;cursor:pointer}
.mw-sec::after{content:'';position:absolute;inset:-4px 0}
.mw-sec:hover,.mw-sec:focus-visible{color:var(--sg-text);background:var(--sg-border)}
.mw-sec[disabled]{opacity:.5;cursor:default}
@media (hover:hover) and (pointer:fine){.mw li:not(:hover):not(:focus-within) .mw-more{opacity:0}}
@media (hover:none),(pointer:coarse){.mw-more{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}}
.mw-day{padding:14px 16px 6px;font-size:12px;font-weight:700;letter-spacing:.5px;color:var(--sg-text-2)}
.mw-day+.fl-list{border-top:1px solid var(--sg-border)}
.mw-fail{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 16px 0;padding:8px 0 8px 12px;border-left:2px solid var(--danger);font-size:14px;color:var(--sg-text)}
.mw-link{background:none;border:0;padding:0 2px;min-height:44px;font:inherit;font-size:14px;font-weight:650;color: var(--link);cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
.mw-empty{display:flex;align-items:center;flex-wrap:wrap;gap:4px 10px;padding:14px 16px;font-size:14.5px;color:var(--sg-text)}
.mw-empty span{color:var(--sg-text-2);font-size:14px}
.mw-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(var(--sag-tabbar-h,0px) + 12px);z-index:60;width:min(520px,calc(100vw - 32px));box-sizing:border-box;display:flex;align-items:center;gap:12px;padding:10px 8px 10px 14px;border-radius:10px;border:1px solid var(--sg-border-strong,var(--sg-border));background:var(--sg-surface-solid,var(--bg-base));color:var(--sg-text);font-size:14px;line-height:1.35}
.mw-toast[data-tone=bad]{border-color:var(--danger)}
.mw-toast p{flex:1;margin:0;min-width:0}
.mw-toast button{flex:none;min-height:44px;padding:0 10px;border:0;background:none;color: var(--link);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
`;

type Toast = { text: string; tone: 'ok' | 'bad'; undo?: () => void } | null;

/** 'RFIs', 'RFIs and pay apps', 'RFIs, pay apps and COIs'. */
function listOf(words: string[]): string {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

const TAB_LABEL: Record<Bucket, string> = { today: 'Today', week: 'This week', later: 'Later' };

async function why(res: Response): Promise<string> {
  return reasonFromResponse(res);
}
function caught(e: unknown): string {
  return isNetworkError(e) ? NO_SIGNAL_DETAIL : 'Something stopped it before it reached the server. Try again.';
}
const json = (method: string, body: unknown, status: string): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json', [STATUS_HEADER]: status }, body: JSON.stringify(body),
});

export default function MyWorkView() {
  const { data, error, isLoading, mutate } = useSWR<Payload>('/api/my-work', fetcher, {
    refreshInterval: 60_000, revalidateOnFocus: true, dedupingInterval: 10_000, keepPreviousData: true,
  });

  const [tab, setTab] = useState<Bucket>('today');
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [localSnoozes, setLocalSnoozes] = useState<Snooze[]>([]);
  const [portalOn, setPortalOn] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<Record<string, string | undefined>>({});
  const [notes, setNotes] = useState<Record<string, string | undefined>>({});
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const say = useCallback((t: Toast, ms = 6000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    if (t) toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);
  const setBusyFor = (key: string, label?: string) => setBusy((b) => ({ ...b, [key]: label }));
  const hide = (key: string) => setHidden((h) => new Set(h).add(key));

  const today = data?.today ?? null;
  const view = useMemo(() => {
    if (!data) return null;
    const items = data.items.filter((it) => !hidden.has(it.key) && !(it.key.startsWith('bid-link:') && it.packageId && portalOn.has(it.packageId)));
    return buildView(items, [...data.snoozes, ...localSnoozes], data.today);
  }, [data, hidden, localSnoozes, portalOn]);

  /** Switch tabs in place. The list keeps the height it had, so the page can't jump. */
  const switchTab = useCallback((k: Bucket) => {
    const el = bodyRef.current;
    if (el) el.style.minHeight = `${Math.max(el.offsetHeight, parseFloat(el.style.minHeight) || 0)}px`;
    setTab(k);
  }, []);

  /* ── Actions — each one a real write; the result is said, not assumed ── */

  const turnOn = useCallback(async (it: MyWorkItem) => {
    if (it.action?.kind !== 'portal') return;
    const pkg = it.action.packageId;
    const name = it.meta.split(' · ')[0];
    setBusyFor(it.key, 'Turning on…');
    try {
      const res = await fetch(`/api/bid-packages/${pkg}/portal`, json('POST', { enabled: true }, `Turning on the bid link|Bid link on|Couldn't turn on the bid link`));
      if (!res.ok) { say({ text: `Couldn't turn on the bid link for ${name}: ${await why(res)}`, tone: 'bad' }); return; }
      setPortalOn((s) => new Set(s).add(pkg));
      hide(it.key);
      say({ text: `Bid link on — bidders can open ${name} now.`, tone: 'ok' });
      void mutate();
    } catch (e) {
      say({ text: `Couldn't turn on the bid link for ${name}. ${caught(e)}`, tone: 'bad' });
    } finally {
      setBusyFor(it.key, undefined);
    }
  }, [mutate, say]);

  const remind = useCallback(async (it: MyWorkItem) => {
    if (it.action?.kind !== 'remind') return;
    const { packageId, invites } = it.action;
    setBusyFor(it.key, 'Reminding…');
    const sent: string[] = [];
    const failed: Array<{ name: string; why: string }> = [];
    for (const iv of invites) {
      try {
        const res = await fetch(`/api/bid-packages/${packageId}/remind`, json('POST', { inviteId: iv.id }, `Reminding ${iv.name}|Reminder sent to ${iv.name}|Couldn't remind ${iv.name}`));
        if (res.ok) sent.push(iv.name);
        else failed.push({ name: iv.name, why: await why(res) });
      } catch (e) {
        failed.push({ name: iv.name, why: caught(e) });
      }
    }
    setBusyFor(it.key, undefined);
    if (sent.length) setNotes((n) => ({ ...n, [it.key]: `Reminded ${sent.length} just now` }));
    const n = invites.length;
    if (!failed.length) say({ text: `Reminder sent to ${n === 1 ? sent[0] : `all ${n} bidders`}.`, tone: 'ok' });
    else if (!sent.length) say({ text: `No reminders went out. ${failed[0].name}: ${failed[0].why}${failed.length > 1 ? ` (and ${failed.length - 1} more)` : ''}`, tone: 'bad' }, 10000);
    else say({ text: `Reminded ${sent.length} of ${n}. Not sent to ${failed.map((f) => `${f.name} (${f.why})`).join('; ')}`, tone: 'bad' }, 10000);
  }, [say]);

  const askCoi = useCallback(async (it: MyWorkItem) => {
    if (it.action?.kind !== 'ask_coi') return;
    const sub = it.title.replace(/^Request COI from /, '');
    setBusyFor(it.key, 'Asking…');
    try {
      const res = await fetch('/api/sub-portal/compliance', json('POST', { subId: it.action.subId, docs: ['insurance'] }, `Asking ${sub} for a new COI|Asked ${sub} for a new COI|Couldn't ask ${sub} for a COI`));
      if (!res.ok) { say({ text: `Couldn't ask ${sub}: ${await why(res)}`, tone: 'bad' }, 9000); return; }
      setNotes((n) => ({ ...n, [it.key]: 'Asked just now' }));
      say({ text: `Asked ${sub} for a new COI — it's in their portal.`, tone: 'ok' });
    } catch (e) {
      say({ text: `Couldn't ask ${sub}. ${caught(e)}`, tone: 'bad' });
    } finally {
      setBusyFor(it.key, undefined);
    }
  }, [say]);

  const done = useCallback(async (it: MyWorkItem) => {
    if (!it.done) return;
    const { kind, id } = it.done;
    const req = kind === 'punch'
      ? fetch(`/api/punch-list/${id}/complete`, json('PATCH', { status: 'completed' }, 'Closing the punch item|Punch item closed|Couldn\'t close the punch item'))
      : kind === 'todo'
        ? fetch(`/api/todos/${id}/complete`, json('PATCH', {}, 'Completing the to-do|To-do done|Couldn\'t complete the to-do'))
        : fetch(`/api/schedule/${id}`, json('PUT', { status: 'complete' }, 'Marking the task complete|Task complete|Couldn\'t mark the task complete'));
    setBusyFor(it.key, 'Saving…');
    try {
      const res = await req;
      if (!res.ok) { say({ text: `Couldn't mark it done: ${await why(res)}`, tone: 'bad' }); return; }
      hide(it.key);
      say({ text: `Done: ${it.title}`, tone: 'ok' });
      void mutate();
    } catch (e) {
      say({ text: `Couldn't mark it done. ${caught(e)}`, tone: 'bad' });
    } finally {
      setBusyFor(it.key, undefined);
    }
  }, [mutate, say]);

  const snooze = useCallback(async (it: MyWorkItem) => {
    if (!today) return;
    const until = addDays(today, 1);
    setBusyFor(it.key, 'Snoozing…');
    try {
      const res = await fetch('/api/my-work/snooze', json('POST', { key: it.key, until }, 'Snoozing|Snoozed until tomorrow|Couldn\'t snooze it'));
      if (!res.ok) { say({ text: `Couldn't snooze it: ${await why(res)}`, tone: 'bad' }); return; }
      setLocalSnoozes((s) => [...s.filter((x) => x.item_key !== it.key), { item_key: it.key, until }]);
      say({
        text: `Snoozed until tomorrow (${fmtDay(until)}): ${it.title}`, tone: 'ok',
        undo: async () => {
          say(null);
          try {
            const r = await fetch('/api/my-work/snooze', json('DELETE', { key: it.key }, 'Bringing it back|Back on your list|Couldn\'t bring it back'));
            if (!r.ok) { say({ text: `Couldn't bring it back: ${await why(r)}`, tone: 'bad' }); return; }
            setLocalSnoozes((s) => s.filter((x) => x.item_key !== it.key));
            void mutate();
          } catch (e) {
            say({ text: `Couldn't bring it back. ${caught(e)}`, tone: 'bad' });
          }
        },
      }, 8000);
      void mutate();
    } catch (e) {
      say({ text: `Couldn't snooze it. ${caught(e)}`, tone: 'bad' });
    } finally {
      setBusyFor(it.key, undefined);
    }
  }, [today, mutate, say]);

  const ctl: RowControl = {
    busy, notes, snoozeReady: !!data?.snoozeReady,
    portalOn: (pkg, fromServer) => fromServer === true || (!!pkg && portalOn.has(pkg)),
    turnOn, remind, askCoi, done, snooze,
  };

  /* ── Render ── */

  const rowsOf = (list: MyWorkItem[], label: string) => (
    <FlatList label={label}>{list.map((it) => <MyWorkRow key={it.key} it={it} ctl={ctl} />)}</FlatList>
  );
  const byDay = (list: MyWorkItem[], undatedLabel: string) => groupByDay(list).map((g) => (
    <section key={g.day ?? 'none'} aria-label={g.day ? dayLabel(g.day) : undatedLabel}>
      <div className="mw-day">{g.day ? dayLabel(g.day) : undatedLabel}</div>
      {rowsOf(g.items, g.day ? dayLabel(g.day) : undatedLabel)}
    </section>
  ));

  let panel: React.ReactNode;
  if (!data && (isLoading || !error)) {
    panel = <RowSkeleton rows={7} />;
  } else if (!data || !view) {
    panel = (
      <p className="mw-fail" role="alert">
        {error instanceof LoadError && error.message ? error.message : 'Couldn’t load your work. Check your signal and try again.'}
        <button type="button" className="mw-link" onClick={() => void mutate()}>Retry</button>
      </p>
    );
  } else if (tab === 'today') {
    const { doFirst, rest } = view.today;
    const upcoming = [...view.week, ...view.later].filter((it) => it.day).sort((a, b) => a.day!.localeCompare(b.day!)).slice(0, 3);
    const upTab: Bucket = view.week.length ? 'week' : 'later';
    panel = (
      <>
        {view.counts.today === 0 && (
          <div className="mw-empty">
            Nothing needs you today.
            <button type="button" className="mw-link" onClick={() => switchTab('week')}>This week ›</button>
            {!data.companyWide && data.assigned === 0 && <span>Nothing is assigned to you yet — a PM adds you to a job from its Team page. <Link className="mw-link" href="/app/projects">Jobs ›</Link></span>}
          </div>
        )}
        {doFirst.length > 0 && <><SectionLabel>Do first</SectionLabel>{rowsOf(doFirst, 'Do first')}</>}
        {rest.length > 0 && <><SectionLabel>{doFirst.length ? 'Also today' : 'Today'}</SectionLabel>{rowsOf(rest, 'Also today')}</>}
        {upcoming.length > 0 && (
          <>
            <SectionLabel action={{ label: `${TAB_LABEL[upTab]} ›`, onClick: () => switchTab(upTab) }}>Coming up</SectionLabel>
            {byDay(upcoming, 'No date')}
          </>
        )}
      </>
    );
  } else if (tab === 'week') {
    panel = view.week.length ? byDay(view.week, 'No date') : (
      <div className="mw-empty">Nothing due in the next 7 days.<button type="button" className="mw-link" onClick={() => switchTab('later')}>Later ›</button></div>
    );
  } else {
    panel = view.later.length ? byDay(view.later, 'No date') : (
      <div className="mw-empty">Nothing further out.<button type="button" className="mw-link" onClick={() => switchTab('today')}>Today ›</button></div>
    );
  }

  const failures = data?.failures ?? [];

  return (
    <div className="sgUi mw">
      <UiFx />
      <FlatStyles />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="mw-head">
        <h1 className="mw-h1">My Work</h1>
        {today && <span className="mw-date">{dayLabel(today)}</span>}
      </div>
      <Tabs<Bucket>
        label="When"
        value={tab}
        onChange={switchTab}
        options={[
          { key: 'today', label: 'Today', count: view?.counts.today },
          { key: 'week', label: 'This week', count: view?.counts.week },
          { key: 'later', label: 'Later' },
        ]}
      />
      {failures.length > 0 && (
        <p className="mw-fail" role="status">
          Couldn&apos;t load {listOf(failures.map((f) => f.label))} ·
          <button type="button" className="mw-link" onClick={() => void mutate()}>Retry</button>
        </p>
      )}
      <div ref={bodyRef} role="tabpanel" aria-label={TAB_LABEL[tab]}>
        {panel}
      </div>
      <div role="status" aria-live="polite">
        {toast && (
          <div className="mw-toast" data-tone={toast.tone}>
            <p>{toast.text}</p>
            {toast.undo ? <button type="button" onClick={toast.undo}>Undo</button> : <button type="button" onClick={() => say(null)} aria-label="Dismiss">OK</button>}
          </div>
        )}
      </div>
    </div>
  );
}

