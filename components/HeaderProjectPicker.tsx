'use client';

/**
 * The job you are in, in the header, on every screen.
 *
 * Before this, the only clue about which job you were looking at was a
 * breadcrumb that said "Project" — the literal word — and changing jobs meant
 * going back to the list and clicking in again. There was a switcher, but it
 * only opened on a keyboard shortcut almost nobody finds.
 *
 * The part that makes this worth having, and the reason Procore's works: it
 * KEEPS YOUR PLACE. On the pay applications for one job and you want the pay
 * applications for another, you get pay applications — not that job's
 * overview. Comparing the same screen across two jobs is most of what a GC
 * does with a project list, and making them re-navigate every time is what
 * turns a two-second question into a thirty-second one.
 *
 * The list is grouped the way a GC thinks about it: the jobs you were just in,
 * then every running job, then the closed ones folded away. Each row says
 * enough to pick the right "Phase II" — number, city, phase, and how much is
 * open on it. On a phone it opens as a bottom sheet with thumb-sized rows and
 * a 16px search box (anything smaller and iOS zooms the page on focus).
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CaretUpDown, MagnifyingGlass, Buildings, Check, Plus, ArrowRight, X, CaretDown } from '@phosphor-icons/react';
import { useProjects } from '@/lib/hooks/useProjects';
import { ProjectDot } from '@/components/ui/ProjectColor';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { isClosedStatus } from '@/lib/project-lifecycle';
import { normalisePhase, PHASE_LABEL } from '@/lib/project-phase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Proj {
  id: string; name?: string; project_name?: string; title?: string; status?: string;
  project_number?: string; color?: string | null; phase?: string | null;
  city?: string | null; address?: string | null;
  open_rfis?: number; open_punch?: number; open_cos?: number;
}

const nameOf = (p: Proj) => p.name || p.project_name || p.title || 'Untitled project';

/**
 * Which project is on screen, and which sub-page of it.
 *
 *   /app/projects/<id>/pay-apps/new  ->  { id, tail: 'pay-apps/new' }
 *
 * The tail is what gets carried across when you switch jobs.
 */
function readPath(pathname: string): { id: string | null; tail: string } {
  const seg = pathname.split('/').filter(Boolean);
  const i = seg.indexOf('projects');
  if (i < 0 || !seg[i + 1] || !UUID_RE.test(seg[i + 1])) return { id: null, tail: '' };
  return { id: seg[i + 1], tail: seg.slice(i + 2).join('/') };
}

const SCREEN_WORDS: Record<string, string> = { rfis: 'RFIs', cos: 'COs', coi: 'COIs', pos: 'POs', sov: 'SOV' };
/** 'pay-apps/new' -> 'Pay Apps' — the screen a switch keeps you on. */
export function screenName(tail: string): string {
  const first = tail.split('/')[0] || '';
  return first.split('-').filter(Boolean).map(w => SCREEN_WORDS[w] || w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/* Recently opened jobs live in this browser only — a per-person convenience,
   not data anyone else needs. Storage can be blocked (private mode, iOS
   lockdown); the picker then simply has no Recent group. */
const RECENT_KEY = 'sag.recentJobs';
function readRecent(): string[] {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x)).slice(0, 5) : [];
  } catch (e) {
    console.warn('[job picker] recent jobs unavailable', e);
    return [];
  }
}
function rememberJob(id: string) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter(x => x !== id)].slice(0, 5)));
  } catch (e) {
    console.warn('[job picker] could not remember recent job', e);
  }
}

const openCount = (p: Proj) => {
  const parts = [p.open_rfis, p.open_punch, p.open_cos];
  if (parts.every(n => typeof n !== 'number')) return null;
  return parts.reduce<number>((s, n) => s + (typeof n === 'number' ? n : 0), 0);
};

/** Mirrors the 767px breakpoint where the header folds into the menu drawer. */
function useSheet(): boolean {
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setSheet(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return sheet;
}

type Group = { key: string; label: string; items: Proj[] };

export default function HeaderProjectPicker() {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { projects, loading, error, degraded, revalidate } = useProjects();
  const list = useMemo(() => (projects as Proj[]) ?? [], [projects]);

  const { id: currentId, tail } = readPath(pathname);
  const sheet = useSheet();
  const uid = useId().replace(/:/g, '');
  const listId = `jp-list-${uid}`;
  const optId = (i: number) => `jp-opt-${uid}-${i}`;

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [showClosed, setShowClosed] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  /**
   * The name of the job we are in, even when it is not in the header's list
   * (archived, or the list has not landed yet) — the crumb whose whole
   * purpose is telling you where you are must never read "Project".
   */
  const inList = list.some((p) => p.id === currentId);
  const [fetchedName, setFetchedName] = useState<string | null>(null);
  useEffect(() => {
    setFetchedName(null);
    if (!currentId || inList) return;
    let cancelled = false;
    fetch(`/api/projects/${currentId}?fields=id,name`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const p = d.project ?? d;
        if (p?.name || p?.project_name) setFetchedName(p.name || p.project_name);
      })
      .catch((e) => { console.warn('[job picker] job name lookup failed; using project context', e); });
    return () => { cancelled = true; };
    /* inList, not list: the list's identity changes on every SWR refresh (and
       on every render while it is still loading), which re-ran this effect,
       nulled the name and cancelled the request before it landed — the
       picker read "Choose a job" inside a job. */
  }, [currentId, inList]);

  /* The project snapshot every project screen (layout, rail, next-step bar)
     already loads, on the same SWR key. */
  const { ctx: currentCtx } = useProjectContext(currentId);
  const ctxName = (currentCtx?.project?.name as string | undefined) || null;

  const current = list.find((p) => p.id === currentId);
  const currentName = current ? nameOf(current) : (ctxName ?? fetchedName);

  /* Being in a job counts as opening it, however you got there. */
  useEffect(() => { if (currentId) rememberJob(currentId); }, [currentId]);

  const groups = useMemo<Group[]>(() => {
    const byName = (a: Proj, b: Proj) => nameOf(a).localeCompare(nameOf(b), undefined, { numeric: true, sensitivity: 'base' });
    const needle = q.trim().toLowerCase();
    if (needle) {
      const hits = list.filter((p) => `${nameOf(p)} ${p.project_number ?? ''} ${p.city ?? ''} ${p.address ?? ''}`.toLowerCase().includes(needle));
      const live = hits.filter((p) => !isClosedStatus(p.status)).sort(byName);
      const closed = hits.filter((p) => isClosedStatus(p.status)).sort(byName);
      return [{ key: 'hits', label: `${hits.length} ${hits.length === 1 ? 'match' : 'matches'}`, items: [...live, ...closed] }];
    }
    const byId = new Map(list.map((p) => [p.id, p]));
    const recentJobs = recent.map((id) => byId.get(id)).filter((p): p is Proj => !!p && !isClosedStatus(p.status)).slice(0, 3);
    const seen = new Set(recentJobs.map((p) => p.id));
    const live = list.filter((p) => !isClosedStatus(p.status) && !seen.has(p.id)).sort(byName);
    const closed = list.filter((p) => isClosedStatus(p.status)).sort(byName);
    const out: Group[] = [];
    // Recent only earns its space when there is a longer list to skip.
    if (recentJobs.length && live.length > 0) out.push({ key: 'recent', label: 'Recent', items: recentJobs });
    out.push({ key: 'active', label: recentJobs.length && live.length > 0 ? 'All active jobs' : 'Active jobs', items: live });
    if (closed.length) out.push({ key: 'closed', label: `Closed (${closed.length})`, items: showClosed ? closed : [] });
    return out;
  }, [list, q, recent, showClosed]);

  const options = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  /* Highlight the job you are in when the list opens, else the first row. */
  useEffect(() => {
    if (!open) return;
    const i = q ? 0 : options.findIndex((p) => p.id === currentId);
    setActive(i >= 0 ? i : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

  /* Keep the highlighted row in view as the arrow keys move it. */
  useEffect(() => {
    if (!open) return;
    document.getElementById(optId(active))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  /* Close on outside click and on Escape; give focus back to the trigger. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /* Desktop: straight to the search box. Phone: don't throw the keyboard up
     over the list — most switches are a tap on a recent job. */
  useEffect(() => {
    if (open && !sheet) window.setTimeout(() => searchRef.current?.focus(), 10);
  }, [open, sheet]);

  /* The sheet owns the screen while it is up. */
  useEffect(() => {
    if (!(open && sheet)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, sheet]);

  function close() { setOpen(false); setQ(''); }

  /** Same screen, different job. */
  function go(id: string) {
    close();
    rememberJob(id);
    router.push(tail ? `/app/projects/${id}/${tail}` : `/app/projects/${id}`);
  }

  function keys(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(Math.max(0, options.length - 1)); }
    else if (e.key === 'Enter' && options[active]) { e.preventDefault(); go(options[active].id); }
  }

  const loadFailed = !loading && (!!error || degraded) && list.length === 0;
  const screen = tail ? screenName(tail) : '';

  let idx = -1;
  const body = (
    <>
      <div className="jp-search">
        <MagnifyingGlass size={16} weight="bold" aria-hidden />
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={keys}
          placeholder="Search jobs, numbers, cities…"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={options[active] ? optId(active) : undefined}
          aria-autocomplete="list"
          aria-label="Search jobs"
          autoComplete="off"
          spellCheck={false}
        />
        {q ? (
          <button type="button" className="jp-iconbtn" onClick={() => { setQ(''); searchRef.current?.focus(); }} aria-label="Clear search"><X size={15} weight="bold" /></button>
        ) : sheet ? (
          <button type="button" className="jp-iconbtn" onClick={close} aria-label="Close job picker"><X size={17} weight="bold" /></button>
        ) : (
          <kbd className="jp-kbd">Esc</kbd>
        )}
      </div>

      {screen && <div className="jp-note">Switching keeps you on <b>{screen}</b>.</div>}

      <div className="jp-scroll" id={listId} role="listbox" aria-label="Jobs">
        {loading && list.length === 0 ? (
          <div className="jp-empty" role="status">Loading jobs…</div>
        ) : loadFailed ? (
          <div className="jp-empty" role="alert">
            Couldn&apos;t load your jobs.{' '}
            <button type="button" className="jp-linkbtn" onClick={() => revalidate()}>Try again</button>
          </div>
        ) : list.length === 0 ? (
          <div className="jp-empty">No jobs yet. Create your first one below.</div>
        ) : options.length === 0 && q ? (
          <div className="jp-empty">No job matches &ldquo;{q.trim()}&rdquo;.</div>
        ) : (
          groups.map((g) => (
            <div key={g.key} role="group" aria-label={g.label}>
              {g.key === 'closed' ? (
                <button type="button" className="jp-group jp-group-btn" aria-expanded={showClosed} onClick={() => setShowClosed((v) => !v)}>
                  <span>{g.label}</span>
                  <CaretDown size={12} weight="bold" style={{ transform: showClosed ? 'rotate(180deg)' : undefined }} aria-hidden />
                </button>
              ) : (
                <div className="jp-group" aria-hidden>{g.label}</div>
              )}
              {g.items.map((p) => {
                idx += 1;
                const i = idx;
                const isCurrent = p.id === currentId;
                const closed = isClosedStatus(p.status);
                const where = p.city || (p.address ? p.address.split(',')[0] : null);
                const meta = [p.project_number, where, closed ? 'Closed' : PHASE_LABEL[normalisePhase(p.phase)]].filter(Boolean).join(' · ');
                const n = closed ? null : openCount(p);
                return (
                  <div
                    key={`${g.key}-${p.id}`}
                    id={optId(i)}
                    role="option"
                    aria-selected={i === active}
                    aria-current={isCurrent ? 'true' : undefined}
                    className="jp-opt"
                    data-active={i === active ? 'true' : undefined}
                    data-current={isCurrent ? 'true' : undefined}
                    data-closed={closed ? 'true' : undefined}
                    onClick={() => go(p.id)}
                    onMouseMove={() => { if (active !== i) setActive(i); }}
                  >
                    <ProjectDot project={p} size={10} />
                    <span className="jp-main">
                      <span className="jp-name">{nameOf(p)}</span>
                      {meta && <span className="jp-meta">{meta}</span>}
                    </span>
                    {n != null && n > 0 && (
                      <span className="jp-open" title={`${p.open_rfis ?? 0} open RFIs · ${p.open_punch ?? 0} open punch items · ${p.open_cos ?? 0} pending change orders`}>{n} open</span>
                    )}
                    {isCurrent && <Check size={15} weight="bold" className="jp-check" aria-label="You are here" />}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="jp-foot">
        <Link href="/app/projects" className="jp-footlink" onClick={close}>See all jobs <ArrowRight size={13} weight="bold" /></Link>
        <Link href="/app/projects/new" className="jp-footlink jp-new" onClick={close}><Plus size={13} weight="bold" /> New job</Link>
      </div>
    </>
  );

  return (
    <div ref={wrapRef} className="jp-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <button
        ref={triggerRef}
        type="button"
        data-tour="project-picker"
        className="jp-trigger"
        data-in-job={currentName ? 'true' : undefined}
        onClick={() => { if (open) { close(); return; } setRecent(readRecent()); setOpen(true); }}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={currentName ? `${currentName} — switch job` : 'Choose a Job'}
      >
        {currentName && currentId
          ? <ProjectDot project={current ?? currentId} size={9} />
          : <Buildings size={15} weight="duotone" aria-hidden className="jp-trig-icon" />}
        <span className="jp-trig-label">{currentName ?? 'Choose a Job'}</span>
        <CaretUpDown size={13} weight="bold" aria-hidden className="jp-trig-caret" />
      </button>

      {open && !sheet && (
        <div ref={panelRef} className="jp-panel">{body}</div>
      )}
      {open && sheet && typeof document !== 'undefined' && createPortal(
        <div className="jp-sheet-root">
          <style dangerouslySetInnerHTML={{ __html: CSS }} />
          <div className="jp-scrim" onClick={close} aria-hidden />
          <div ref={panelRef} className="jp-panel jp-sheet" role="dialog" aria-modal="true" aria-label="Choose a job">
            <div className="jp-grab" aria-hidden />
            <div className="jp-sheet-title">{currentName ? 'Switch job' : 'Choose a job'}</div>
            {body}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

const CSS = `
.jp-wrap { position: relative; flex-shrink: 0; min-width: 0; }
.jp-trigger { display: flex; align-items: center; gap: 8px; height: 36px; max-width: 280px; padding: 0 11px; border-radius: 10px; cursor: pointer; white-space: nowrap;
  background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); color: var(--c-text-2); font-size: 13.5px; font-weight: 700; }
.jp-trigger:hover { background: rgba(255,255,255,0.06); color: var(--c-text); }
.jp-trigger[data-in-job] { color: var(--c-text); background: rgba(255,230,0,0.05); border-color: rgba(255,230,0,0.3); }
.jp-trigger[data-in-job]:hover { border-color: rgba(255,230,0,0.55); }
.jp-trigger[aria-expanded="true"] { border-color: rgba(255,230,0,0.6); box-shadow: 0 0 0 3px rgba(255,230,0,0.12); }
.jp-trigger:focus-visible { outline: 2px solid var(--c-yellow); outline-offset: 2px; }
.jp-trig-icon, .jp-trig-caret { color: var(--c-orange); flex-shrink: 0; }
.jp-trig-label { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.jp-panel { position: absolute; top: calc(100% + 8px); left: 0; z-index: 3000; width: 420px; max-height: min(560px, 72vh);
  display: flex; flex-direction: column; overflow: hidden; background: var(--c-raised); border: 1px solid var(--border-default); border-radius: 16px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 28px 64px -18px rgba(0,0,0,0.95); color: var(--c-text); }
.jp-search { display: flex; align-items: center; gap: 10px; padding: 0 12px 0 14px; min-height: 52px; border-bottom: 1px solid var(--border-subtle); color: var(--c-text-3); }
.jp-panel .jp-search input { flex: 1; min-width: 0; height: 44px; background: transparent; border: 0; outline: none; color: var(--c-text); font-size: 15px !important; font-weight: 600; }
/* globals.css pins inputs to 13px !important on desktop; 16px on a phone stops iOS zooming on focus. */
.jp-sheet .jp-search input { font-size: 16px !important; }
.jp-panel .jp-search input:focus, .jp-panel .jp-search input:focus-visible { border: 0 !important; box-shadow: none !important; outline: none !important; background: transparent !important; }
.jp-panel .jp-search:focus-within { box-shadow: inset 0 -2px 0 rgba(255,230,0,0.45); }
.jp-panel .jp-search input::placeholder { color: var(--c-text-3); font-weight: 500; }
.jp-kbd { font-family: inherit; font-size: 11px; font-weight: 700; line-height: 1; color: var(--c-text-3); padding: 4px 6px; border-radius: 6px; border: 1px solid var(--border-default); background: rgba(255,255,255,0.03); }
.jp-iconbtn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 9px; border: 0; background: transparent; color: var(--c-text-2); cursor: pointer; }
.jp-iconbtn:hover { background: rgba(255,255,255,0.06); color: var(--c-text); }
.jp-note { padding: 8px 14px; font-size: 12px; color: var(--c-text-2); background: rgba(255,230,0,0.04); border-bottom: 1px solid var(--border-subtle); }
.jp-note b { color: var(--c-text); font-weight: 750; }
.jp-scroll { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 4px 6px 8px; }
.jp-group { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 12px 10px 6px; font-size: 10.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--c-text-3); }
.jp-group-btn { background: transparent; border: 0; cursor: pointer; min-height: 36px; text-align: left; }
.jp-group-btn:hover { color: var(--c-text-2); }
.jp-opt { display: flex; align-items: center; gap: 11px; min-height: 48px; padding: 7px 10px; border-radius: 10px; cursor: pointer; }
.jp-opt[data-active] { background: rgba(255,230,0,0.08); }
.jp-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.jp-name { color: var(--c-text-2); font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jp-opt[data-active] .jp-name, .jp-opt[data-current] .jp-name { color: var(--c-text); }
.jp-opt[data-current] .jp-name { font-weight: 800; }
.jp-opt[data-closed] .jp-name { color: var(--c-text-3); }
.jp-meta { color: var(--c-text-3); font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jp-open { flex-shrink: 0; font-size: 11.5px; font-weight: 800; color: var(--c-orange); background: rgba(255,138,0,0.12); padding: 2px 8px; border-radius: 999px; }
.jp-check { color: var(--c-yellow); flex-shrink: 0; }
.jp-empty { padding: 18px 12px; font-size: 13.5px; color: var(--c-text-2); line-height: 1.45; }
.jp-linkbtn { background: none; border: 0; padding: 0; color: var(--c-yellow); font: inherit; font-weight: 700; cursor: pointer; }
.jp-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; border-top: 1px solid var(--border-subtle); }
.jp-footlink { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 10px; border-radius: 9px; font-size: 13px; font-weight: 700; color: var(--c-text-2); text-decoration: none; }
.jp-footlink:hover { background: rgba(255,255,255,0.05); color: var(--c-text); }
.jp-new { color: var(--c-yellow); }
.jp-new:hover { color: var(--c-yellow); background: rgba(255,230,0,0.08); }
/* Phone: a bottom sheet over a dimmed page. */
.jp-sheet-root { position: fixed; inset: 0; z-index: 4000; }
.jp-scrim { position: absolute; inset: 0; background: rgba(0,0,0,0.6); }
.jp-panel.jp-sheet { position: absolute; top: auto; left: 0; right: 0; bottom: 0; width: auto; max-height: 86vh; max-height: 86dvh; border-radius: 22px 22px 0 0; border-bottom: 0;
  padding-bottom: env(safe-area-inset-bottom, 0px); }
.jp-grab { width: 40px; height: 5px; border-radius: 99px; background: rgba(255,255,255,0.18); margin: 8px auto 2px; flex-shrink: 0; }
.jp-sheet-title { padding: 6px 16px 10px; font-size: 17px; font-weight: 800; color: var(--c-text); }
.jp-sheet .jp-search { border-top: 1px solid var(--border-subtle); }
.jp-sheet .jp-opt { min-height: 56px; }
.jp-sheet .jp-name { font-size: 15px; }
.jp-sheet .jp-iconbtn { width: 44px; height: 44px; }
.jp-sheet .jp-footlink, .jp-sheet .jp-group-btn { min-height: 44px; }
.jp-sheet .jp-foot { padding: 8px 10px; }
@media (max-width: 767px) {
  .sag-menu-tools .jp-wrap, .sag-menu-tools .jp-trigger { width: 100%; max-width: none; }
  .jp-trigger { min-height: 44px; font-size: 14px; }
}
`;
