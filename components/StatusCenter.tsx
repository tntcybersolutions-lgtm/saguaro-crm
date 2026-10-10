'use client';
/**
 * The status box: what the app is doing right now, as numbered steps in the
 * order they started. Sits just above the tab bar on a phone and at the bottom
 * centre on a desktop.
 *
 *   WORKING ON IT   1. ✓ Punch item saved
 *                   2. ◌ Uploading 3 photos — 2 of 3  ▬▬▬▬▬▭▭
 *   DONE            every step checked; closes by itself after 3 s
 *   NO SIGNAL       what was kept on the phone and what happens next
 *   NEEDS ATTENTION what failed, in plain words; stays until closed
 *
 * Steps come from lib/ui/status (fed by lib/ui/status-fetch, the offline
 * outbox and the upload queue). This file also adds an "Opening …" step when a
 * link takes more than a moment to load.
 */
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, X } from '@phosphor-icons/react';
import { subscribeStatus, getStatusGroups, getServerStatusGroups, dismissGroup, step, type StatusGroup, type StatusStep } from '@/lib/ui/status';
import { installStatusFetch } from '@/lib/ui/status-fetch';

const CSS = `
.stc { position: fixed; z-index: 10100; left: 50%; transform: translateX(-50%); bottom: 20px;
  width: min(440px, calc(100vw - 32px)); box-sizing: border-box; padding: 12px 6px 6px 16px; border-radius: 16px;
  background: var(--bg-solid-2); color: var(--text-primary); border: 1px solid var(--border-strong);
  box-shadow: 0 18px 40px -14px rgba(0,0,0,.8); font-size: 15px; line-height: 1.3; }
.stc[data-place="top"] { bottom: auto; top: calc(env(safe-area-inset-top, 0px) + 10px); }
.stc-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.stc-title { font-size: 11.5px; font-weight: 800; letter-spacing: .12em; color: var(--text-secondary); }
.stc[data-tone="bad"] .stc-title { color: var(--c-red); }
.stc[data-tone="nosig"] .stc-title { color: var(--c-orange); }
.stc[data-tone="done"] .stc-title { color: var(--c-green); }
.stc-x { flex: 0 0 auto; width: 44px; height: 44px; margin: -12px -2px -6px 0; display: grid; place-items: center;
  border: 0; background: transparent; color: var(--text-secondary); border-radius: 12px; cursor: pointer; }
.stc-x:hover { color: var(--text-primary); background: var(--bg-surface-2); }
.stc ol { list-style: none; margin: 4px 0 0; padding: 0 10px 0 0; max-height: min(46vh, 340px); overflow-y: auto; }
.stc li { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; }
.stc li + li { border-top: 1px solid var(--border-subtle); }
.stc-ic { flex: 0 0 22px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; margin-top: 1px;
  font-size: 12px; font-weight: 800; box-sizing: border-box; }
.stc-ic[data-s="done"], .stc-ic[data-s="offline"] { background: var(--c-green); color: var(--on-brand); }
.stc-ic[data-s="failed"] { background: var(--c-red); color: var(--on-brand); }
.stc-ic[data-s="waiting"] { border: 2px solid var(--border-strong); color: var(--text-secondary); }
.stc-ic[data-s="running"] { border: 2.5px solid var(--gold); border-right-color: transparent; }
@media (prefers-reduced-motion: no-preference) {
  .stc-ic[data-s="running"] { animation: stc-spin .8s linear infinite; }
  .stc { animation: stc-in .18s ease-out; }
}
@keyframes stc-spin { to { transform: rotate(360deg); } }
@keyframes stc-in { from { opacity: 0; } to { opacity: 1; } }
.stc-body { min-width: 0; flex: 1; }
.stc-label { font-weight: 700; overflow-wrap: anywhere; }
.stc li[data-s="waiting"] .stc-label { color: var(--text-secondary); }
.stc li[data-s="failed"] .stc-label { color: var(--c-red); }
.stc-detail { margin-top: 2px; font-size: 13px; font-weight: 600; color: var(--text-secondary); overflow-wrap: anywhere; }
.stc-bar { margin-top: 6px; height: 4px; border-radius: 4px; background: var(--border-subtle); overflow: hidden; }
.stc-bar > span { display: block; height: 100%; background: var(--gold); border-radius: 4px; transition: width .25s ease; }
.stc-more { font-size: 12.5px; color: var(--text-tertiary); padding: 4px 0 2px; }
@media (max-width: 767px) {
  .stc { left: 12px; right: 12px; width: auto; transform: none; bottom: calc(var(--sag-tabbar-h, 0px) + 8px); }
}
`;

/** Show at most this many steps; older finished ones fold into one line. */
const MAX_ROWS = 6;

function toneOf(g: StatusGroup): 'run' | 'bad' | 'nosig' | 'done' {
  const s = g.steps;
  if (s.some((x) => x.state === 'running' || x.state === 'waiting')) return 'run';
  if (s.some((x) => x.state === 'failed' && !x.net)) return 'bad';
  if (s.some((x) => x.state === 'offline' || (x.state === 'failed' && x.net))) return 'nosig';
  return 'done';
}
const TITLE = { run: 'WORKING ON IT', bad: 'NEEDS ATTENTION', nosig: 'NO SIGNAL', done: 'DONE' } as const;

function Row({ s, n }: { s: StatusStep; n: number }) {
  const settled = s.state === 'done' || s.state === 'failed' || s.state === 'offline';
  const text = settled && s.result ? s.result : s.label;
  const count = s.count && !settled ? ` — ${s.count.done} of ${s.count.total}` : '';
  return (
    <li data-s={s.state}>
      <span className="stc-ic" data-s={s.state} aria-hidden>
        {s.state === 'done' || s.state === 'offline' ? <Check size={13} weight="bold" /> : s.state === 'failed' ? '!' : s.state === 'waiting' ? n : null}
      </span>
      <span className="stc-body">
        <span className="stc-label">{n}. {text}{count}</span>
        {s.detail ? <span className="stc-detail" style={{ display: 'block' }}>{s.detail}</span> : null}
        {s.state === 'running' && typeof s.progress === 'number' ? (
          <span className="stc-bar" style={{ display: 'block' }}><span style={{ width: `${Math.round(Math.max(0.03, Math.min(1, s.progress)) * 100)}%` }} /></span>
        ) : null}
      </span>
    </li>
  );
}

/** A short name for where a link goes: its own words, or the page name from the path. */
function linkName(a: HTMLAnchorElement, url: URL): string {
  const own = (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim();
  if (own.length >= 2 && own.length <= 32) return own;
  const segs = url.pathname.split('/').filter((x) => x && x !== 'app' && !/^[0-9a-f-]{20,}$|^\d+$/i.test(x));
  const last = segs[segs.length - 1];
  return last ? last.replace(/[-_]+/g, ' ') : 'Home';
}

/** "Opening Jobs…" when a tapped link is slow to load. */
function useNavigationSteps() {
  useEffect(() => {
    let timer: number | null = null;
    let poll: number | null = null;
    const stop = () => { if (timer) window.clearTimeout(timer); if (poll) window.clearInterval(poll); timer = poll = null; };
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      let url: URL;
      try { url = new URL(a.href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/app')) return;
      const from = window.location.pathname + window.location.search;
      if (url.pathname + url.search === from) return;
      stop();
      const name = linkName(a, url);
      const started = Date.now();
      let h: ReturnType<typeof step> | null = null;
      timer = window.setTimeout(() => {
        if (window.location.pathname + window.location.search !== from) return;
        h = step(`Opening ${name}`, { transient: true });
      }, 400);
      poll = window.setInterval(() => {
        const moved = window.location.pathname + window.location.search !== from;
        if (moved || Date.now() - started > 20_000) { stop(); h?.drop(); }
      }, 150);
    };
    document.addEventListener('click', onClick);
    return () => { document.removeEventListener('click', onClick); stop(); };
  }, []);
}

export default function StatusCenter() {
  const groups = useSyncExternalStore(subscribeStatus, getStatusGroups, getServerStatusGroups);
  const g = groups[groups.length - 1];
  const [place, setPlace] = useState<'bottom' | 'top'>('bottom');
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => { installStatusFetch(); }, []);
  useNavigationSteps();

  // A sheet or dialog keeps its buttons at the bottom of the screen — move up out of their way.
  useEffect(() => {
    if (!g) return;
    const check = () => setPlace(document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]') ? 'top' : 'bottom');
    check();
    const t = window.setInterval(check, 400);
    return () => window.clearInterval(t);
  }, [g]);

  // Keep the newest step in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [g]);

  if (!g || !g.steps.length) return <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }} />;
  const tone = toneOf(g);
  const hidden = Math.max(0, g.steps.length - MAX_ROWS);
  const shown = g.steps.slice(hidden);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <section className="stc" data-tone={tone} data-place={place} role="status" aria-live="polite" aria-label="What Saguaro is doing">
        <div className="stc-head">
          <span className="stc-title">{TITLE[tone]}</span>
          <button type="button" className="stc-x" aria-label="Close" onClick={() => dismissGroup(g.id)}><X size={18} weight="bold" /></button>
        </div>
        <ol ref={listRef}>
          {hidden ? <li className="stc-more">{hidden} earlier {hidden === 1 ? 'step' : 'steps'} finished</li> : null}
          {shown.map((s, i) => <Row key={s.id} s={s} n={hidden + i + 1} />)}
        </ol>
      </section>
    </>
  );
}
