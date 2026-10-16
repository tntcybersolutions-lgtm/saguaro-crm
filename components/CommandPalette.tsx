'use client';
/**
 * ⌘K — search everything, then act.
 *
 * Typing searches every record the user may see (/api/search: jobs, RFIs,
 * submittals, change orders, punch, drawings, daily logs, files, photos,
 * invoices and pay apps for money roles, leads, customers, contacts, subs,
 * people), grouped by type with counts, best match first. Matching quick
 * actions and pages follow. The last row opens the full results page.
 * Empty, it shows recent searches, recently opened records, quick actions
 * and pages.
 *
 * Desktop: a centred dialog. Phone (≤ 640px): a full-screen sheet with a 16px
 * input and 52px rows. Arrow keys walk every row top to bottom; Enter opens.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MagnifyingGlass, ArrowRight, ClockCounterClockwise, X, House, Buildings, Folder, Gavel, ChartBar, Robot, Brain,
  CheckSquare, Radio, Tag, Notebook, SlidersHorizontal, CalendarBlank, Receipt, Camera, Images, CurrencyDollar,
  Question, Package, FileText, Handshake, Hammer, type Icon as PhIcon,
} from '@phosphor-icons/react';
import { useGuardedRouter } from '@/lib/navGuard';
import { openQuickMedia } from '@/components/media/QuickMedia';
import { usePermissions } from '@/lib/hooks/usePermissions';
import type { PermCategory } from '@/lib/permission-categories';
import type { SearchHit } from '@/lib/search/core';
import {
  HitBody, SEARCH_CSS, readRecentHits, readRecentQueries, rememberHit, rememberQuery, useScrollActiveIntoView,
  useUniversalSearch, type RecentHit,
} from '@/components/search/search-ui';

// ─── Static items ────────────────────────────────────────────────────────────

interface StaticItem {
  id: string;
  Icon: PhIcon;
  label: string;
  description: string;
  shortcut?: string;
  href?: string;
  action?: () => void;
}

const NAV_ITEMS: StaticItem[] = [
  { id: 'nav-dashboard',  Icon: House,             label: 'Dashboard',      description: 'Go to your dashboard',             href: '/app' },
  { id: 'nav-projects',   Icon: Buildings,         label: 'Projects',       description: 'All construction projects',        href: '/app/projects' },
  { id: 'nav-documents',  Icon: Folder,            label: 'Documents',      description: 'AI-generated documents',           href: '/app/documents' },
  { id: 'nav-bids',       Icon: Gavel,             label: 'Bids',           description: 'Bid management & scoring',         href: '/app/bids' },
  { id: 'nav-reports',    Icon: ChartBar,          label: 'Reports',        description: 'Financial and project reports',    href: '/app/reports' },
  { id: 'nav-autopilot',  Icon: Robot,             label: 'Autopilot',      description: 'Automated CRM alerts & actions',   href: '/app/autopilot' },
  { id: 'nav-intel',      Icon: Brain,             label: 'Intelligence',   description: 'Market intelligence, analytics & suggestions', href: '/app/intelligence' },
  { id: 'nav-my-work',    Icon: CheckSquare,       label: 'My Day',         description: 'Your workday at a glance — late, today, agenda, what you are waiting on', href: '/app/my-work' },
  { id: 'nav-radio',      Icon: Radio,             label: 'Radio',          description: 'Push-to-talk field radio',         href: '/app/radio' },
  { id: 'nav-catalog',    Icon: Tag,               label: 'Catalog',        description: 'Materials catalog & best prices',  href: '/app/catalog' },
  { id: 'nav-daily-logs', Icon: Notebook,          label: 'Daily Logs',     description: 'Field reports across all projects', href: '/app/daily-logs' },
  { id: 'nav-command',    Icon: SlidersHorizontal, label: 'Command Center', description: 'Portfolio pulse across every project', href: '/app/command-center' },
  { id: 'nav-schedule',   Icon: CalendarBlank,     label: 'Schedule',       description: 'Cross-project schedule',           href: '/app/schedule' },
  { id: 'nav-invoicing',  Icon: Receipt,           label: 'Invoicing',      description: 'Invoices & payments',              href: '/app/invoicing' },
];

/* The palette lists the same doors as the rail, so it hides the same ones
   (components/AppSidebar). Ids absent here are open to everyone. */
const NAV_PERMISSION: Record<string, PermCategory> = {
  'nav-reports': 'Reports',
  'nav-invoicing': 'Budget',
  'nav-bids': 'Sales',
  'nav-intel': 'Sales',
};

const ACTION_ITEMS: StaticItem[] = [
  // Photos & video: the most-used thing in the field.
  { id: 'act-photo',        Icon: Camera,         label: 'Take Photo or Video',    description: 'Camera, video or upload — send to any job', href: '/app?media=1', action: () => openQuickMedia() },
  { id: 'act-upload-media', Icon: Images,         label: 'Upload Photos & Videos', description: 'Choose or drop files and send them to any job', href: '/app?media=1', action: () => openQuickMedia() },
  { id: 'act-new-project',  Icon: Buildings,      label: 'New Project',            description: 'Create a new construction project',    shortcut: 'N', href: '/app/projects/new' },
  { id: 'act-new-pay-app',  Icon: CurrencyDollar, label: 'New Pay App',            description: 'Select a project to create a pay app', href: '/app/projects' },
  { id: 'act-new-rfi',      Icon: Question,       label: 'New RFI',                description: 'Select a project to submit an RFI',    href: '/app/projects' },
  { id: 'act-create-bid',   Icon: Package,        label: 'Create Bid Package',     description: 'Select a project to start a bid package', href: '/app/projects' },
  { id: 'act-gen-doc',      Icon: FileText,       label: 'Generate Document',      description: 'AI-powered document generation',       href: '/app/documents' },
  { id: 'act-invite-sub',   Icon: Handshake,      label: 'Invite Subcontractor',   description: 'Send a sub portal invite',             href: '/app/sub-portal?tab=invite' },
  { id: 'act-new-log',      Icon: Notebook,       label: 'New Daily Log',          description: "Open today's field log composer",      href: '/app/daily-logs?new=1' },
  { id: 'act-new-punch',    Icon: Hammer,         label: 'New Punch Item',         description: 'Select a project to add a punch item', href: '/app/projects' },
];

/** Every word typed appears in the label or description. */
function matchesWords(item: StaticItem, q: string): boolean {
  const hay = `${item.label} ${item.description}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

// ─── Rows ────────────────────────────────────────────────────────────────────

type Row =
  | { kind: 'hit'; key: string; hit: RecentHit; recent?: boolean }
  | { kind: 'item'; key: string; item: StaticItem }
  | { kind: 'query'; key: string; q: string }
  | { kind: 'all'; key: string; q: string };

type Section = { key: string; label: string; count?: number; typeLink?: string; rows: Row[] };

interface Props {
  onScoreBid?: () => void;
}

export default function CommandPalette(_props: Props) {
  const { can: canDo } = usePermissions();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(0);
  const [recentHits, setRecentHits] = useState<RecentHit[]>([]);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useGuardedRouter();

  const q = query.trim();
  const search = useUniversalSearch(query, { enabled: open, limit: 5 });

  /* ⌘K, ⌘N and ⌘⇧P belong to components/GlobalShortcuts, which is mounted in
     the same shell. Both used to act on ⌘K — GlobalShortcuts opened the
     palette and this component toggled it in the same keystroke, so whether
     ⌘K opened anything depended on listener order. Now ⌘K arrives here only
     as an event: 'toggle-command-palette' (the shortcut) or
     'open-command-palette' (the top-bar and menu Search buttons). */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !open) window.dispatchEvent(new CustomEvent('saguaro:close-all'));
    }
    function onOpen() { setOpen(true); }
    function onToggle() { setOpen((o) => !o); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-command-palette', onOpen);
    window.addEventListener('toggle-command-palette', onToggle);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-command-palette', onOpen);
      window.removeEventListener('toggle-command-palette', onToggle);
    };
  }, [open]);

  // Opening: clear, focus, reload recents; lock the page behind the sheet.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setFocused(0);
    setRecentHits(readRecentHits());
    setRecentQueries(readRecentQueries());
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); document.body.style.overflow = prev; };
  }, [open]);

  const navItems = useMemo(
    () => NAV_ITEMS.filter((n) => !NAV_PERMISSION[n.id] || canDo(NAV_PERMISSION[n.id], 'View')),
    [canDo],
  );

  const sections: Section[] = useMemo(() => {
    const out: Section[] = [];
    if (!q) {
      if (recentQueries.length) out.push({ key: 'rq', label: 'Recent searches', rows: recentQueries.map((s) => ({ kind: 'query', key: `rq:${s}`, q: s })) });
      if (recentHits.length) out.push({ key: 'rh', label: 'Recently opened', rows: recentHits.map((h) => ({ kind: 'hit', key: `rh:${h.href}`, hit: h, recent: true })) });
      out.push({ key: 'act', label: 'Quick actions', rows: ACTION_ITEMS.map((a) => ({ kind: 'item', key: a.id, item: a })) });
      out.push({ key: 'nav', label: 'Go to', rows: navItems.map((n) => ({ kind: 'item', key: n.id, item: n })) });
      return out;
    }
    const acts = ACTION_ITEMS.filter((a) => matchesWords(a, q)).slice(0, 4);
    const navs = navItems.filter((n) => matchesWords(n, q)).slice(0, 4);
    const actsSection: Section | null = acts.length ? { key: 'act', label: 'Quick actions', rows: acts.map((a) => ({ kind: 'item', key: a.id, item: a })) } : null;
    // A typed action word ("photo", "new rfi") puts the actions first.
    const actionsFirst = acts.some((a) => a.label.toLowerCase().includes(q.toLowerCase()));
    if (actionsFirst && actsSection) out.push(actsSection);
    for (const g of search.data?.groups ?? []) {
      out.push({
        key: `g:${g.type}`, label: g.label, count: g.count,
        typeLink: `/app/search?q=${encodeURIComponent(q)}&type=${g.type}`,
        rows: g.hits.map((h) => ({ kind: 'hit', key: `${h.type}:${h.id}`, hit: h })),
      });
    }
    if (!actionsFirst && actsSection) out.push(actsSection);
    if (navs.length) out.push({ key: 'nav', label: 'Go to', rows: navs.map((n) => ({ kind: 'item', key: n.id, item: n })) });
    out.push({ key: 'all', label: '', rows: [{ kind: 'all', key: 'all', q }] });
    return out;
  }, [q, recentQueries, recentHits, navItems, search.data]);

  const flat = useMemo(() => sections.flatMap((s) => s.rows), [sections]);

  // Keep the highlight on the best result as results arrive.
  useEffect(() => { setFocused(0); }, [q, search.data]);
  useEffect(() => { setFocused((f) => Math.min(f, Math.max(flat.length - 1, 0))); }, [flat.length]);

  const optionId = (i: number) => `cmdk-opt-${i}`;
  useScrollActiveIntoView(listRef, open && flat.length ? optionId(focused) : null);

  const go = useCallback((href: string) => { setOpen(false); router.push(href); }, [router]);

  const activate = useCallback((row: Row) => {
    if (row.kind === 'query') { setQuery(row.q); inputRef.current?.focus(); return; }
    if (row.kind === 'all') { rememberQuery(row.q); go(`/app/search?q=${encodeURIComponent(row.q)}`); return; }
    if (row.kind === 'hit') {
      if (q) rememberQuery(q);
      rememberHit(row.hit);
      go(row.hit.href);
      return;
    }
    const it = row.item;
    if (it.action) { setOpen(false); it.action(); return; }
    if (it.href) go(it.href);
  }, [go, q]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused((f) => Math.min(f + 1, flat.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFocused((f) => Math.max(f - 1, 0)); return; }
    if (e.key === 'Home' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setFocused(0); return; }
    if (e.key === 'End' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setFocused(flat.length - 1); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      // ⌘/Ctrl+Enter: straight to every result.
      if ((e.metaKey || e.ctrlKey) && q) { activate({ kind: 'all', key: 'all', q }); return; }
      const row = flat[focused];
      if (row) activate(row);
    }
  }

  if (!open) return null;

  let idx = -1;
  const searching = !!q && search.loading && !search.data;
  const noRecords = !!q && !search.loading && !!search.data && search.data.groups.length === 0;

  return (
    <div className="cmdk-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <style dangerouslySetInnerHTML={{ __html: SEARCH_CSS + PALETTE_CSS }} />
      <div className="cmdk-panel" role="dialog" aria-modal="true" aria-label="Search everything" onKeyDown={onKeyDown}>
        <div className="cmdk-bar">
          <MagnifyingGlass size={20} aria-hidden className="cmdk-bar-ico" />
          <input
            data-no-guard=""
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search jobs, RFIs, drawings, subs, invoices…"
            className="cmdk-input"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-autocomplete="list"
            aria-activedescendant={flat.length ? optionId(focused) : undefined}
            aria-label="Search everything"
          />
          {query ? (
            <button type="button" className="cmdk-clear" aria-label="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>
              <X size={16} />
            </button>
          ) : null}
          <button type="button" className="cmdk-cancel" onClick={() => setOpen(false)}>Cancel</button>
          <kbd className="cmdk-kbd">Esc</kbd>
        </div>

        <div ref={listRef} id="cmdk-list" role="listbox" aria-label="Results" className="cmdk-list">
          {searching ? <div className="srx-note" aria-live="polite">Searching…</div> : null}
          {search.error ? <div className="srx-note" role="alert">{search.error}</div> : null}
          {search.data?.partial?.length ? <div className="srx-note">Some record types could not be searched just now. Try again in a moment.</div> : null}
          {noRecords ? <div className="srx-note">No records match “{q}”. Try a number like RFI-005, a sheet like A-101, or a name.</div> : null}

          {sections.map((s) => (
            <div key={s.key} role="group" aria-label={s.label || 'Search all results'}>
              {s.label ? (
                <div className="srx-head">
                  <span>{s.label}{typeof s.count === 'number' ? ` · ${s.count}` : ''}</span>
                  {s.typeLink && typeof s.count === 'number' && s.count > s.rows.length ? (
                    <button type="button" tabIndex={-1} onClick={() => { rememberQuery(q); go(s.typeLink!); }}>See all {s.count}</button>
                  ) : null}
                </div>
              ) : <div className="srx-sep" />}
              {s.rows.map((row) => {
                idx += 1;
                const i = idx;
                const active = i === focused;
                return (
                  <div
                    key={row.key}
                    id={optionId(i)}
                    role="option"
                    aria-selected={active}
                    className="srx-row"
                    onMouseMove={() => { if (!active) setFocused(i); }}
                    onClick={() => activate(row)}
                  >
                    {row.kind === 'hit' ? (
                      <>
                        <HitBody hit={row.hit} showType={!!row.recent} />
                        {row.recent ? <ClockCounterClockwise size={14} className="srx-side" aria-hidden /> : null}
                      </>
                    ) : row.kind === 'item' ? (
                      <>
                        <span className="srx-ico cmdk-ico-neutral" aria-hidden><row.item.Icon size={20} weight="duotone" /></span>
                        <span className="srx-txt">
                          <span className="srx-label">{row.item.label}</span>
                          <span className="srx-meta">{row.item.description}</span>
                        </span>
                        {row.item.shortcut ? <kbd className="cmdk-kbd">⌘{row.item.shortcut}</kbd> : null}
                      </>
                    ) : row.kind === 'query' ? (
                      <>
                        <span className="srx-ico cmdk-ico-neutral" aria-hidden><ClockCounterClockwise size={20} /></span>
                        <span className="srx-txt"><span className="srx-label">{row.q}</span></span>
                      </>
                    ) : (
                      <>
                        <span className="srx-ico cmdk-ico-neutral" aria-hidden><MagnifyingGlass size={20} /></span>
                        <span className="srx-txt">
                          <span className="srx-label">Search all results for “{row.q}”</span>
                          {search.data ? <span className="srx-meta">{search.data.total} {search.data.total === 1 ? 'match' : 'matches'} across {search.data.groups.length} {search.data.groups.length === 1 ? 'type' : 'types'}</span> : null}
                        </span>
                        <ArrowRight size={16} className="srx-side" aria-hidden />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="cmdk-foot" aria-hidden>
          <span><kbd className="cmdk-kbd">↑↓</kbd> move</span>
          <span><kbd className="cmdk-kbd">↵</kbd> open</span>
          <span><kbd className="cmdk-kbd">⌘↵</kbd> all results</span>
          <span><kbd className="cmdk-kbd">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

const PALETTE_CSS = `
.cmdk-scrim { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.72); display: flex; align-items: flex-start; justify-content: center; padding: 10vh 16px 16px; }
.cmdk-panel { width: 100%; max-width: 680px; max-height: 76vh; display: flex; flex-direction: column; background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); overflow: hidden; }
.cmdk-bar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--border-default); }
.cmdk-bar-ico { flex: none; color: var(--text-tertiary); }
.cmdk-input { flex: 1; min-width: 0; min-height: 40px; background: transparent; border: 0; outline: none; color: var(--text-primary); font-size: 16px; font-weight: 500; }
.cmdk-input::placeholder { color: var(--text-tertiary); }
.cmdk-input::-webkit-search-cancel-button { display: none; }
.cmdk-clear { all: unset; flex: none; display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; color: var(--text-tertiary); cursor: pointer; }
.cmdk-clear:hover { color: var(--text-primary); background: var(--bg-row-hover); }
.cmdk-cancel { all: unset; display: none; flex: none; min-height: 44px; padding: 0 4px 0 8px; color: var(--text-primary); font-size: 15px; font-weight: 600; cursor: pointer; }
.cmdk-kbd { flex: none; font: inherit; font-size: 12px; font-weight: 700; padding: 2px 6px; border: 1px solid var(--border-default); border-radius: 4px; background: var(--bg-surface-2); color: var(--text-secondary); }
.cmdk-list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-bottom: 6px; }
.cmdk-ico-neutral { color: var(--text-secondary); }
.cmdk-foot { display: flex; gap: 16px; padding: 8px 16px; border-top: 1px solid var(--border-default); font-size: 12px; color: var(--text-secondary); }
@media (max-width: 640px) {
  .cmdk-scrim { padding: 0; background: var(--bg-base); }
  .cmdk-panel { max-width: none; max-height: none; height: 100%; border: 0; border-radius: 0; box-shadow: none; background: var(--bg-base); padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
  .cmdk-bar { padding: 8px 8px 8px 16px; }
  .cmdk-input { min-height: 44px; }
  .cmdk-clear { width: 44px; height: 44px; }
  .cmdk-cancel { display: inline-flex; align-items: center; }
  .cmdk-bar > .cmdk-kbd, .cmdk-foot, .srx-row .cmdk-kbd { display: none; }
}
`;
