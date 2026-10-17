'use client';

/**
 * The job you are in, in the top bar's trail: Home / [Job ▾] / Tool.
 *
 * A dense, keyboard-driven list in the manner of Procore's project selector
 * (Chad, 17 Oct 2026: "make the drop down more professional like procore").
 *
 * It KEEPS YOUR PLACE: on one job's pay applications, picking another job
 * opens that job's pay applications, not its overview. The row under the
 * pointer (or the arrow keys) names the screen it will open, quietly, beside
 * the contract value — the list shows it instead of a sentence explaining it.
 *
 * Order: the last five jobs this person opened (per user, this browser), then
 * every job by stage — Bidding, Building, Closeout — with Closed folded away.
 * Each row: the full name, then number · city · stage, the contract value in
 * tabular figures on the right, and a check on the job you are in.
 *
 * Desktop: a flat popover — one hairline border on the surface colour. Phone:
 * a full-height sheet with 44px+ rows and a 16px search box (smaller and iOS
 * zooms on focus).
 *
 * Keys: ↑ ↓ move, Home / End jump, Enter opens, Esc closes and returns focus
 * to the trigger; ↓ or Enter on the closed trigger opens the list.
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGuardedRouter } from '@/lib/navGuard';
import { CaretUpDown, MagnifyingGlass, Buildings, Check, Plus, ArrowRight, X, CaretDown } from '@phosphor-icons/react';
import { useProjects } from '@/lib/hooks/useProjects';
import { ProjectDot, ProjectTile } from '@/components/ui/ProjectColor';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { contractOf, pickerSection, progressOf, PICKER_SECTIONS, SECTION_LABEL } from '@/lib/job-picker';
import { fmtMoneyShort } from '@/lib/home/rank';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Proj {
  id: string; name?: string; project_name?: string; title?: string; status?: string;
  project_number?: string; color?: string | null; phase?: string | null;
  city?: string | null; address?: string | null;
  revised_contract_value?: number | string | null; contract_amount?: number | string | null; contract_value?: number | string | null;
  percent_complete?: number | string | null;
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

/* Recently opened jobs, per person, in this browser only — a convenience, not
   data anyone else needs. Keyed by the signed-in user so a shared office PC
   never shows one person's jobs to the next. Storage can be blocked (private
   mode, iOS lockdown); the picker then simply has no Recent group. */
const RECENT_MAX = 5;
const LEGACY_RECENT_KEY = 'sag.recentJobs';
const recentKey = (userId: string) => `sag.recentJobs.${userId}`;
function readRecent(userId: string | null | undefined): string[] {
  if (!userId) return [];
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(recentKey(userId)) || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x)).slice(0, RECENT_MAX) : [];
  } catch (e) {
    console.warn('[job picker] recent jobs unavailable', e);
    return [];
  }
}
function rememberJob(userId: string | null | undefined, id: string) {
  if (!userId) return;
  try {
    window.localStorage.setItem(recentKey(userId), JSON.stringify([id, ...readRecent(userId).filter(x => x !== id)].slice(0, RECENT_MAX)));
    // The old list was shared by everyone on the browser; it is not carried over.
    window.localStorage.removeItem(LEGACY_RECENT_KEY);
  } catch (e) {
    console.warn('[job picker] could not remember recent job', e);
  }
}

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

export default function HeaderProjectPicker({ userId = null }: { userId?: string | null } = {}) {
  const pathname = usePathname() ?? '';
  // Switching jobs mid-form asks first (unsaved changes), like every other way out.
  const router = useGuardedRouter();
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
  useEffect(() => { if (currentId) rememberJob(userId, currentId); }, [currentId, userId]);

  const groups = useMemo<Group[]>(() => {
    const byName = (a: Proj, b: Proj) => nameOf(a).localeCompare(nameOf(b), undefined, { numeric: true, sensitivity: 'base' });
    const needle = q.trim().toLowerCase();
    if (needle) {
      const hits = list.filter((p) => `${nameOf(p)} ${p.project_number ?? ''} ${p.city ?? ''} ${p.address ?? ''}`.toLowerCase().includes(needle));
      const rank = (p: Proj) => PICKER_SECTIONS.indexOf(pickerSection(p));
      hits.sort((a, b) => rank(a) - rank(b) || byName(a, b));
      return [{ key: 'hits', label: `${hits.length} ${hits.length === 1 ? 'match' : 'matches'}`, items: hits }];
    }
    const byId = new Map(list.map((p) => [p.id, p]));
    const recentJobs = recent.map((id) => byId.get(id)).filter((p): p is Proj => !!p).slice(0, RECENT_MAX);
    const seen = new Set(recentJobs.map((p) => p.id));
    const out: Group[] = [];
    // Recent only earns its space when there is a longer list to skip; when
    // it shows, those jobs are not repeated in their stage group.
    const showRecent = recentJobs.length > 0 && list.some((p) => !seen.has(p.id));
    if (showRecent) out.push({ key: 'recent', label: 'Recent', items: recentJobs });
    for (const sec of PICKER_SECTIONS) {
      const items = list.filter((p) => pickerSection(p) === sec && !(showRecent && seen.has(p.id))).sort(byName);
      if (!items.length) continue;
      if (sec === 'closed') out.push({ key: 'closed', label: `Closed (${items.length})`, items: showClosed ? items : [] });
      else out.push({ key: sec, label: SECTION_LABEL[sec], items });
    }
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
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); triggerRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function openList() { setRecent(readRecent(userId)); setOpen(true); }
  function close() { setOpen(false); setQ(''); setDragY(0); }

  /* Swipe down to close the phone sheet. A drag that starts in the list only
     moves the sheet once the list is scrolled to its top and the finger goes
     down — otherwise it is a scroll. Far enough (or a quick flick) closes it;
     anything less springs back. */
  const dragRef = useRef<{ y0: number; t0: number; dy: number; live: boolean } | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  function sheetTouchStart(e: React.TouchEvent) {
    const scroller = (e.target as HTMLElement).closest('.jp-scroll');
    if (scroller && scroller.scrollTop > 0) { dragRef.current = null; return; }
    if ((e.target as HTMLElement).closest('input, button, a')) { dragRef.current = null; return; }
    dragRef.current = { y0: e.touches[0].clientY, t0: Date.now(), dy: 0, live: false };
  }
  function sheetTouchMove(e: React.TouchEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.touches[0].clientY - d.y0;
    if (dy <= 0) { if (d.live) { d.dy = 0; setDragY(0); } return; }
    if (!d.live && dy < 6) return; // ignore a tap's jitter
    d.live = true;
    d.dy = dy;
    setDragging(true);
    setDragY(dy);
  }
  function sheetTouchEnd() {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!d || !d.live) return;
    const speed = d.dy / Math.max(1, Date.now() - d.t0); // px per ms
    if (d.dy > 110 || (d.dy > 40 && speed > 0.7)) close();
    else setDragY(0);
  }

  /** Same screen, different job. */
  function go(id: string) {
    close();
    rememberJob(userId, id);
    router.push(tail ? `/app/projects/${id}/${tail}` : `/app/projects/${id}`);
  }

  function keys(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'PageDown') { e.preventDefault(); setActive((i) => Math.min(i + 8, options.length - 1)); }
    else if (e.key === 'PageUp') { e.preventDefault(); setActive((i) => Math.max(i - 8, 0)); }
    else if (e.key === 'Home' && !q) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && !q) { e.preventDefault(); setActive(Math.max(0, options.length - 1)); }
    else if (e.key === 'Enter' && options[active]) { e.preventDefault(); go(options[active].id); }
  }

  function triggerKeys(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); openList(); }
  }

  const loadFailed = !loading && (!!error || degraded) && list.length === 0;
  /* Under the job's name on the button: its number and where it is in its life. */
  const trigMeta = current ? [current.project_number, SECTION_LABEL[pickerSection(current)]].filter(Boolean).join(' · ') : null;
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
          placeholder="Search name, number or city"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={options[active] ? optId(active) : undefined}
          aria-autocomplete="list"
          aria-label="Search jobs"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
        />
        {q ? (
          <button type="button" className="jp-iconbtn" onClick={() => { setQ(''); searchRef.current?.focus(); }} aria-label="Clear search"><X size={15} weight="bold" /></button>
        ) : !sheet ? (
          <kbd className="jp-kbd" aria-hidden>Esc</kbd>
        ) : null}
      </div>

      <div className="jp-scroll" id={listId} role="listbox" aria-label="Jobs">
        {loading && list.length === 0 ? (
          <div className="jp-empty" role="status">Loading jobs…</div>
        ) : loadFailed ? (
          <div className="jp-empty" role="alert">
            Couldn&apos;t load your jobs.{' '}
            <button type="button" className="jp-linkbtn" onClick={() => revalidate()}>Try again</button>
          </div>
        ) : list.length === 0 ? (
          <div className="jp-empty">No jobs yet.</div>
        ) : options.length === 0 && q ? (
          <div className="jp-empty">No job matches &ldquo;{q.trim()}&rdquo;.</div>
        ) : (
          groups.map((g) => (
            <div key={g.key} role="group" aria-label={g.label} className="jp-grp">
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
                const isActive = i === active;
                const sec = pickerSection(p);
                const closed = sec === 'closed';
                const where = p.city || (p.address ? p.address.split(',')[0] : null);
                const pct = closed ? null : progressOf(p);
                const stage = pct != null ? `${SECTION_LABEL[sec]} ${pct}%` : SECTION_LABEL[sec];
                const meta = [p.project_number, where, stage].filter(Boolean).join(' · ');
                const money = contractOf(p);
                const name = nameOf(p);
                return (
                  <div
                    key={`${g.key}-${p.id}`}
                    id={optId(i)}
                    role="option"
                    aria-selected={isActive}
                    aria-current={isCurrent ? 'true' : undefined}
                    className="jp-opt"
                    title={name}
                    data-active={isActive ? 'true' : undefined}
                    data-current={isCurrent ? 'true' : undefined}
                    data-closed={closed ? 'true' : undefined}
                    onClick={() => go(p.id)}
                    onMouseMove={() => { if (active !== i) setActive(i); }}
                  >
                    <ProjectDot project={p} size={8} style={{ marginTop: 6 }} />
                    <span className="jp-main">
                      <span className="jp-name">{name}</span>
                      <span className="jp-meta">{meta}</span>
                    </span>
                    <span className="jp-side">
                      {money != null && <span className="jp-money" aria-label={`Contract ${fmtMoneyShort(money)}`}>{fmtMoneyShort(money)}</span>}
                      {/* Where Enter takes you — only on the row you are about to open. */}
                      {screen && isActive && !isCurrent && (
                        <span className="jp-to" aria-hidden><ArrowRight size={11} weight="bold" />{screen}</span>
                      )}
                    </span>
                    <span className="jp-checkcol">
                      {isCurrent && <Check size={14} weight="bold" className="jp-check" aria-label="Current job" />}
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="jp-foot">
        <Link href="/app/projects" className="jp-footlink" onClick={close}>All jobs <ArrowRight size={13} weight="bold" aria-hidden /></Link>
        <Link href="/app/projects/new" className="jp-footlink" onClick={close}><Plus size={13} weight="bold" aria-hidden /> New job</Link>
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
        onClick={() => { if (open) { close(); return; } openList(); }}
        onKeyDown={triggerKeys}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={currentName ? `${currentName} — switch job` : 'Select a job'}
      >
        {currentName && currentId
          ? <ProjectTile project={current ?? currentId} name={currentName} size={28} />
          : <span className="jp-trig-tile" aria-hidden><Buildings size={15} weight="duotone" /></span>}
        <span className="jp-trig-text">
          <span className="jp-trig-label">{currentName ?? 'Select a job'}</span>
          {trigMeta && <span className="jp-trig-meta">{trigMeta}</span>}
        </span>
        <CaretUpDown size={13} weight="bold" aria-hidden className="jp-trig-caret" />
      </button>

      {open && !sheet && (
        <div ref={panelRef} className="jp-panel">{body}</div>
      )}
      {open && sheet && typeof document !== 'undefined' && createPortal(
        <div className="jp-sheet-root">
          <style dangerouslySetInnerHTML={{ __html: CSS }} />
          <div className="jp-scrim" onClick={close} aria-hidden style={dragY ? { opacity: Math.max(0.15, 1 - dragY / 320) } : undefined} />
          <div
            ref={panelRef}
            className="jp-panel jp-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={currentName ? 'Switch job' : 'Select a job'}
            data-dragging={dragging ? 'true' : undefined}
            style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
            onTouchStart={sheetTouchStart}
            onTouchMove={sheetTouchMove}
            onTouchEnd={sheetTouchEnd}
            onTouchCancel={sheetTouchEnd}
          >
            <div className="jp-sheet-head">
              <div className="k-dialog-title jp-sheet-title">{currentName ? 'Switch job' : 'Select a job'}</div>
              <button type="button" className="jp-iconbtn" onClick={close} aria-label="Close"><X size={18} weight="bold" /></button>
            </div>
            {body}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

const CSS = `
.jp-wrap { position: relative; flex: 0 1 auto; min-width: 0; }
.jp-trigger { display: flex; align-items: center; gap: 8px; min-height: 40px; max-width: 100%; padding: 2px 8px 2px 4px; border-radius: 8px; cursor: pointer; white-space: nowrap; text-align: left;
  background: transparent; border: 1px solid transparent; color: var(--text-primary); font-size: 14px; font-weight: 700; transition: background-color .15s ease, border-color .15s ease; }
.jp-trigger:hover, .jp-trigger[aria-expanded="true"] { background: var(--bg-hover); }
.jp-trigger:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.jp-trig-tile { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 7px; flex-shrink: 0; color: var(--text-secondary); border: 1px solid var(--border-default); }
.jp-trig-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.jp-trig-label { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.jp-trig-meta { color: var(--text-tertiary); font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.jp-trig-caret { color: var(--text-tertiary); flex-shrink: 0; margin-left: auto; }

/* Desktop: a flat popover — the surface colour, one hairline, the smallest
   shadow that lifts it off the page beneath. */
.jp-panel { position: absolute; top: calc(100% + 6px); left: 0; z-index: 3000; width: 440px; max-width: calc(100vw - 24px); max-height: min(600px, 76vh);
  display: flex; flex-direction: column; overflow: hidden; background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: 10px;
  box-shadow: var(--shadow-md); color: var(--text-primary); }
.jp-search { display: flex; align-items: center; gap: 10px; padding: 0 10px 0 14px; min-height: 48px; border-bottom: 1px solid var(--border-default); color: var(--text-tertiary); flex-shrink: 0; }
.jp-panel .jp-search input { flex: 1; min-width: 0; height: 44px; background: transparent; border: 0; outline: none; color: var(--text-primary); font-size: 14px !important; font-weight: 500; }
.jp-panel .jp-search input:focus, .jp-panel .jp-search input:focus-visible { border: 0 !important; box-shadow: none !important; outline: none !important; background: transparent !important; }
.jp-panel .jp-search input::placeholder { color: var(--text-tertiary); font-weight: 500; }
.jp-kbd { font-family: inherit; font-size: 12px; font-weight: 600; line-height: 1; color: var(--text-tertiary); padding: 3px 6px; border-radius: 5px; border: 1px solid var(--border-default); }
.jp-iconbtn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 32px; height: 32px; border-radius: 8px; border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; }
.jp-iconbtn:hover { background: var(--bg-hover); color: var(--text-primary); }
.jp-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; padding: 2px 0 6px; }
.jp-grp + .jp-grp { border-top: 1px solid var(--border-default); margin-top: 4px; }
/* Section labels: quiet small caps, not tracked-out capitals. */
.jp-group { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 10px 14px 4px; font-size: 13px; font-weight: 650; font-variant-caps: small-caps; letter-spacing: .02em; color: var(--text-tertiary); }
.jp-group-btn { background: transparent; border: 0; cursor: pointer; min-height: 36px; text-align: left; font-family: inherit; }
.jp-group-btn:hover { color: var(--text-primary); }
.jp-opt { display: flex; align-items: flex-start; gap: 10px; min-height: 44px; padding: 6px 10px 6px 14px; cursor: pointer; }
.jp-opt[data-active] { background: var(--bg-hover); }
.jp-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
/* The full name: it wraps to a second line before it is ever cut. */
.jp-name { color: var(--text-primary); font-size: 14px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.jp-opt[data-current] .jp-name { font-weight: 750; }
.jp-opt[data-closed] .jp-name { color: var(--text-secondary); }
.jp-meta { color: var(--text-tertiary); font-size: 12px; font-weight: 500; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jp-side { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 1px; padding-top: 1px; }
.jp-money { color: var(--text-primary); font-size: 13px; font-weight: 700; line-height: 1.3; font-variant-numeric: tabular-nums; }
.jp-opt[data-closed] .jp-money { color: var(--text-secondary); }
.jp-to { display: inline-flex; align-items: center; gap: 3px; color: var(--text-tertiary); font-size: 12px; font-weight: 600; line-height: 1.35; white-space: nowrap; }
.jp-checkcol { flex: 0 0 16px; display: flex; justify-content: center; padding-top: 3px; }
.jp-check { color: var(--text-primary); }
.jp-empty { padding: 16px 14px; font-size: 14px; color: var(--text-secondary); line-height: 1.45; }
.jp-linkbtn { background: none; border: 0; padding: 0; color: var(--link); font: inherit; font-weight: 700; text-decoration: underline; cursor: pointer; }
.jp-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 6px; border-top: 1px solid var(--border-default); flex-shrink: 0; }
.jp-footlink { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 8px; border-radius: 6px; font-size: 13px; font-weight: 600; color: var(--text-secondary); text-decoration: none; }
.jp-footlink:hover { background: var(--bg-hover); color: var(--text-primary); }
.jp-footlink:focus-visible, .jp-group-btn:focus-visible, .jp-iconbtn:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }

/* Phone: a full-height sheet. */
.jp-sheet-root { position: fixed; inset: 0; z-index: 4000; }
.jp-scrim { position: absolute; inset: 0; background: var(--bg-base); transition: opacity .24s ease; }
.jp-panel.jp-sheet { position: absolute; inset: 0; width: auto; max-width: none; max-height: none; border: 0; border-radius: 0; box-shadow: none;
  padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); transition: transform .24s cubic-bezier(.2,.8,.2,1); touch-action: pan-y; }
.jp-panel.jp-sheet[data-dragging] { transition: none; }
@media (prefers-reduced-motion: reduce) { .jp-panel.jp-sheet, .jp-scrim { transition: none; } }
.jp-sheet-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 52px; padding: 4px 6px 4px 16px; flex-shrink: 0; }
.jp-sheet-title { margin: 0; }
.jp-sheet .jp-search { border-top: 1px solid var(--border-default); padding: 0 6px 0 16px; }
.jp-sheet .jp-search input { font-size: 16px !important; }
.jp-sheet .jp-iconbtn { width: 44px; height: 44px; }
.jp-sheet .jp-opt { min-height: 52px; padding: 8px 12px 8px 16px; }
.jp-sheet .jp-name { font-size: 15px; }
.jp-sheet .jp-group { padding-left: 16px; padding-right: 16px; }
.jp-sheet .jp-footlink, .jp-sheet .jp-group-btn { min-height: 44px; }
.jp-sheet .jp-foot { padding: 6px 10px; }

@media (max-width: 767px) {
  .sag-menu-tools .jp-wrap, .sag-menu-tools .jp-trigger { width: 100%; max-width: none; }
  .sag-menu-tools .jp-trigger { min-height: 52px; padding: 6px 12px 6px 7px; border-radius: 10px; background: var(--bg-surface); border-color: var(--border-default); }
}
`;
