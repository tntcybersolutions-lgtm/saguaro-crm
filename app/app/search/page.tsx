'use client';
/**
 * /app/search?q=…&type=… — every result for a search, grouped by type with
 * counts, narrowed by type chips. The ⌘K palette's "Search all results" row
 * and its "See all" links land here.
 *
 * Results come from /api/search (tenant-scoped, permission-aware: a role
 * without money access never sees an invoice or pay-app chip). Rows are laid
 * on the page — no boxed tiles; the chosen chip is the one yellow control.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { MagnifyingGlass, X, ClockCounterClockwise } from '@phosphor-icons/react';
import { PageShell } from '@/components/ui/kit';
import { TYPE_LABEL, TYPE_ORDER, isSearchType, type SearchHit, type SearchType } from '@/lib/search/core';
import {
  HitBody, SEARCH_CSS, clearRecents, readRecentHits, readRecentQueries, rememberHit, rememberQuery,
  useUniversalSearch, type RecentHit,
} from '@/components/search/search-ui';

type Filter = SearchType | 'all';

function readUrl(): { q: string; type: Filter } {
  try {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get('type') || '';
    return { q: sp.get('q') || '', type: isSearchType(t) ? t : 'all' };
  } catch {
    return { q: '', type: 'all' }; // no window (server render) — start empty
  }
}

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [type, setType] = useState<Filter>('all');
  const [ready, setReady] = useState(false);
  const [recentHits, setRecentHits] = useState<RecentHit[]>([]);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The address is the state: read it on arrival and on Back/Forward.
  useEffect(() => {
    const apply = () => { const u = readUrl(); setQ(u.q); setType(u.type); };
    apply();
    setReady(true);
    setRecentHits(readRecentHits());
    setRecentQueries(readRecentQueries());
    window.addEventListener('popstate', apply);
    return () => window.removeEventListener('popstate', apply);
  }, []);

  // Keep the address in step (replace, so typing doesn't stack history).
  useEffect(() => {
    if (!ready) return;
    const sp = new URLSearchParams();
    if (q.trim()) sp.set('q', q.trim());
    if (type !== 'all') sp.set('type', type);
    const next = `/app/search${sp.toString() ? `?${sp}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, '', next);
  }, [q, type, ready]);

  const term = q.trim();
  const all = useUniversalSearch(q, { limit: 8, enabled: ready });
  const one = useUniversalSearch(q, { types: type === 'all' ? undefined : [type], limit: 50, enabled: ready && type !== 'all' });

  const chips = useMemo(() => {
    const groups = all.data?.groups ?? [];
    return TYPE_ORDER.map((t) => groups.find((g) => g.type === t)).filter((g): g is NonNullable<typeof g> => !!g);
  }, [all.data]);

  // A type chosen from a link that has no results for this query falls back to All.
  useEffect(() => {
    if (type !== 'all' && all.data && !all.loading && !all.data.groups.some((g) => g.type === type)) setType('all');
  }, [type, all.data, all.loading]);

  const open = useCallback((h: SearchHit | RecentHit) => {
    if (term) rememberQuery(term);
    rememberHit(h);
  }, [term]);

  /** Arrow keys walk the result links; ArrowDown from the box enters the list. */
  const moveFocus = (dir: 1 | -1) => {
    const links = Array.from(listRef.current?.querySelectorAll<HTMLElement>('.srx-row') ?? []);
    if (!links.length) return;
    const i = links.indexOf(document.activeElement as HTMLElement);
    if (i === -1) { if (dir === 1) links[0].focus(); return; }
    const n = i + dir;
    if (n < 0) inputRef.current?.focus();
    else links[Math.min(n, links.length - 1)].focus();
  };

  const view = type === 'all' ? all : one;
  const groups = type === 'all' ? (all.data?.groups ?? []) : (one.data?.groups ?? []);
  const loadingFirst = !!term && view.loading && !view.data;

  return (
    <PageShell title="Search" subtitle="Every job, RFI, submittal, change order, punch item, drawing, log, file, photo, sub and person you can see.">
      <style dangerouslySetInnerHTML={{ __html: SEARCH_CSS + PAGE_CSS }} />

      <div className="srp-box">
        <MagnifyingGlass size={20} aria-hidden className="srp-box-ico" />
        <input
          ref={inputRef}
          className="srp-input"
          type="search"
          enterKeyHint="search"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
            if (e.key === 'Enter' && term) rememberQuery(term);
          }}
          placeholder="RFI-005, A-101, CO 3, a sub, a person, a word…"
          aria-label="Search everything"
        />
        {q ? (
          <button type="button" className="srp-clear" aria-label="Clear search" onClick={() => { setQ(''); setType('all'); inputRef.current?.focus(); }}>
            <X size={18} />
          </button>
        ) : null}
      </div>

      {term && chips.length > 0 ? (
        <div className="srp-chips" role="toolbar" aria-label="Filter by type">
          <button type="button" className="k-chip srp-chip" aria-pressed={type === 'all'} onClick={() => setType('all')}>
            All <span className="srp-chip-n">{all.data?.total ?? 0}</span>
          </button>
          {chips.map((g) => (
            <button key={g.type} type="button" className="k-chip srp-chip" aria-pressed={type === g.type} onClick={() => setType(g.type)}>
              {g.label} <span className="srp-chip-n">{g.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div
        ref={listRef}
        className="srp-list"
        aria-live="polite"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
          if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
        }}
      >
        {!term ? (
          <>
            {recentQueries.length ? (
              <section aria-label="Recent searches">
                <div className="srx-head">
                  <span>Recent searches</span>
                  <button type="button" onClick={() => { clearRecents(); setRecentHits([]); setRecentQueries([]); }}>Clear history</button>
                </div>
                {recentQueries.map((s) => (
                  <button key={s} type="button" className="srx-row" onClick={() => setQ(s)}>
                    <span className="srx-ico srp-neutral" aria-hidden><ClockCounterClockwise size={20} /></span>
                    <span className="srx-txt"><span className="srx-label">{s}</span></span>
                  </button>
                ))}
              </section>
            ) : null}
            {recentHits.length ? (
              <section aria-label="Recently opened">
                <div className="srx-head"><span>Recently opened</span></div>
                {recentHits.map((h) => (
                  <Link key={h.href} href={h.href} className="srx-row" onClick={() => open(h)}>
                    <HitBody hit={h} showType />
                  </Link>
                ))}
              </section>
            ) : null}
            {!recentQueries.length && !recentHits.length ? (
              <p className="srx-note">Type a record number (RFI-005, CO 3, pay app 2), a sheet (A-101), a sub, a person or any word.</p>
            ) : null}
          </>
        ) : loadingFirst ? (
          <p className="srx-note">Searching…</p>
        ) : view.error ? (
          <p className="srx-note" role="alert">{view.error}</p>
        ) : groups.length === 0 ? (
          <p className="srx-note">No records match “{term}”. Try a number like RFI-005, a sheet like A-101, or fewer words.</p>
        ) : (
          <>
            {view.data?.partial?.length ? <p className="srx-note">Some record types could not be searched just now. Try again in a moment.</p> : null}
            {groups.map((g) => (
              <section key={g.type} aria-label={g.label}>
                <div className="srx-head">
                  <span>{g.label} · {g.count}</span>
                  {type === 'all' && g.count > g.hits.length ? (
                    <button type="button" onClick={() => setType(g.type)}>Show all {g.count}</button>
                  ) : null}
                </div>
                {g.hits.map((h) => (
                  <Link key={`${h.type}:${h.id}`} href={h.href} className="srx-row" onClick={() => open(h)}>
                    <HitBody hit={h} />
                  </Link>
                ))}
                {type !== 'all' && g.count > g.hits.length ? (
                  <p className="srx-note">Showing the best {g.hits.length} of {g.count} {TYPE_LABEL[g.type].many.toLowerCase()}. Add a word to narrow it down.</p>
                ) : null}
              </section>
            ))}
          </>
        )}
      </div>
    </PageShell>
  );
}

const PAGE_CSS = `
.srp-box { position: relative; display: flex; align-items: center; max-width: 760px; }
.srp-box-ico { position: absolute; left: 14px; color: var(--text-tertiary); pointer-events: none; }
.srp-input { width: 100%; min-height: 48px; padding: 0 48px 0 44px; font: inherit; font-size: 16px; font-weight: 500; color: var(--text-primary); background: var(--bg-input); border: 1px solid var(--border-default); border-radius: var(--radius-md); outline: none; }
.srp-input::placeholder { color: var(--text-tertiary); }
.srp-input:hover { border-color: var(--border-strong); }
.srp-input:focus { border-color: var(--focus-ring); box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring) 25%, transparent); }
.srp-input::-webkit-search-cancel-button { display: none; }
.srp-clear { all: unset; position: absolute; right: 2px; display: inline-grid; place-items: center; width: 44px; height: 44px; border-radius: 8px; color: var(--text-tertiary); cursor: pointer; }
.srp-clear:hover { color: var(--text-primary); }
.srp-chips { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
.srp-chips::-webkit-scrollbar { display: none; }
.srp-chip { flex: none; }
.srp-chip-n { font-variant-numeric: tabular-nums; opacity: .8; }
.srp-list { display: flex; flex-direction: column; max-width: 960px; border-top: 1px solid var(--border-subtle); }
.srp-list .srx-row { padding-left: 4px; padding-right: 4px; }
.srp-list .srx-head { padding-left: 4px; padding-right: 4px; }
.srp-list .srx-row:focus-visible { background: var(--selected-row-bg); box-shadow: inset 3px 0 0 var(--selected-row-indicator); outline: none; }
.srp-list .srx-note { padding-left: 4px; }
.srp-neutral { color: var(--text-secondary); }
@media (max-width: 640px) {
  .srp-chip { min-height: 44px; }
  .srp-list .srx-row { min-height: 56px; }
}
`;
