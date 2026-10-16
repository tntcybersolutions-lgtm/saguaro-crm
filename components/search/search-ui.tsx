'use client';
/**
 * Search everything — the client half shared by the ⌘K palette
 * (components/CommandPalette) and the full results page (/app/search):
 * the debounced fetch, the type icons, the result row and the recents.
 *
 * Rows are laid straight on the surface (no boxed tiles). The selected row is
 * the one place yellow appears: --selected-row-bg with the yellow indicator.
 * Every colour is a token from app/globals.css.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Buildings, TrendUp, UserCircle, AddressBook, HardHat, Question, Stack, ArrowsLeftRight,
  ListChecks, Notebook, Blueprint, FileText, Camera, Receipt, CurrencyDollar, IdentificationBadge,
  type Icon as PhIcon,
} from '@phosphor-icons/react';
import type { SearchHit, SearchResponse, SearchType } from '@/lib/search/core';
import { TYPE_LABEL } from '@/lib/search/core';

// ─── Type icons ──────────────────────────────────────────────────────────────

const TYPE_ICON: Record<SearchType, { Icon: PhIcon; color: string }> = {
  job: { Icon: Buildings, color: 'var(--mod-build)' },
  lead: { Icon: TrendUp, color: 'var(--mod-sales)' },
  customer: { Icon: UserCircle, color: 'var(--mod-sales)' },
  contact: { Icon: AddressBook, color: 'var(--mod-people)' },
  sub: { Icon: HardHat, color: 'var(--mod-people)' },
  rfi: { Icon: Question, color: 'var(--mod-docs)' },
  submittal: { Icon: Stack, color: 'var(--mod-build)' },
  change_order: { Icon: ArrowsLeftRight, color: 'var(--mod-money)' },
  punch: { Icon: ListChecks, color: 'var(--mod-field)' },
  daily_log: { Icon: Notebook, color: 'var(--mod-field)' },
  drawing: { Icon: Blueprint, color: 'var(--mod-docs)' },
  file: { Icon: FileText, color: 'var(--mod-docs)' },
  photo: { Icon: Camera, color: 'var(--mod-field)' },
  invoice: { Icon: Receipt, color: 'var(--mod-money)' },
  pay_app: { Icon: CurrencyDollar, color: 'var(--mod-money)' },
  person: { Icon: IdentificationBadge, color: 'var(--mod-people)' },
};

export function SearchTypeIcon({ type, size = 20 }: { type: SearchType; size?: number }) {
  const { Icon, color } = TYPE_ICON[type];
  return <span className="srx-ico" style={{ color }} aria-hidden><Icon size={size} weight="duotone" /></span>;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

export type SearchState = { data: (SearchResponse & { partial?: SearchType[] }) | null; loading: boolean; error: string | null };

/** Debounced, cancel-on-type search. Fires at 2+ characters (or a bare number). */
export function useUniversalSearch(q: string, opts: { types?: SearchType[]; limit?: number; delay?: number; enabled?: boolean } = {}): SearchState {
  const { types, limit, delay = 180, enabled = true } = opts;
  const [state, setState] = useState<SearchState>({ data: null, loading: false, error: null });
  const typesKey = (types || []).join(',');
  useEffect(() => {
    const term = q.trim();
    if (!enabled || (term.length < 2 && !/^\d+$/.test(term))) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ q: term });
      if (typesKey) params.set('types', typesKey);
      if (limit) params.set('limit', String(limit));
      try {
        const r = await fetch(`/api/search?${params}`, { credentials: 'include', signal: ctrl.signal });
        const d = await r.json().catch(() => null);
        if (!r.ok || !d) throw new Error((d && d.error) || 'Search is not available right now.');
        setState({ data: d, loading: false, error: null });
      } catch (e) {
        if (ctrl.signal.aborted) return; // a newer keystroke replaced this search
        setState({ data: null, loading: false, error: e instanceof Error ? e.message : 'Search is not available right now.' });
      }
    }, delay);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, typesKey, limit, delay, enabled]);
  return state;
}

// ─── Recents (this device only) ──────────────────────────────────────────────

const RECENT_HITS = 'srx_recent_hits_v1';
const RECENT_QUERIES = 'srx_recent_queries_v1';

export type RecentHit = Pick<SearchHit, 'type' | 'id' | 'number' | 'label' | 'sub' | 'href' | 'project'>;

function readList<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return []; // private window or cleared storage — recents are a convenience
  }
}
function writeList(key: string, v: unknown[]) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or blocked — recents are a convenience */ }
}

export function readRecentHits(): RecentHit[] { return readList<RecentHit>(RECENT_HITS).filter((h) => h && h.href && TYPE_ICON[h.type]); }
export function readRecentQueries(): string[] { return readList<string>(RECENT_QUERIES).filter((s) => typeof s === 'string' && s.trim()); }

export function rememberHit(h: SearchHit | RecentHit) {
  const entry: RecentHit = { type: h.type, id: h.id, number: h.number, label: h.label, sub: h.sub, href: h.href, project: h.project ?? null };
  writeList(RECENT_HITS, [entry, ...readRecentHits().filter((x) => x.href !== h.href)].slice(0, 6));
}
export function rememberQuery(q: string) {
  const term = q.trim();
  if (term.length < 2) return;
  writeList(RECENT_QUERIES, [term, ...readRecentQueries().filter((x) => x.toLowerCase() !== term.toLowerCase())].slice(0, 5));
}
export function clearRecents() { writeList(RECENT_HITS, []); writeList(RECENT_QUERIES, []); }

// ─── Row ─────────────────────────────────────────────────────────────────────

/** One result: type icon · number + name · job and detail on one quiet line. */
export function HitBody({ hit, showType = false }: { hit: RecentHit; showType?: boolean }) {
  const meta = [showType ? TYPE_LABEL[hit.type].one : '', hit.project?.name, hit.sub].filter(Boolean).join(' · ');
  return (
    <>
      <SearchTypeIcon type={hit.type} />
      <span className="srx-txt">
        <span className="srx-label">
          {hit.number && !hit.label.includes(hit.number) ? <span className="srx-num">{hit.number}</span> : null}
          {hit.label}
        </span>
        {meta ? <span className="srx-meta">{meta}</span> : null}
      </span>
    </>
  );
}

/** Keeps the highlighted row in view while arrowing through a long list. */
export function useScrollActiveIntoView(listRef: React.RefObject<HTMLElement>, activeId: string | null) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!activeId || activeId === last.current) return;
    last.current = activeId;
    const el = listRef.current?.querySelector(`[id="${CSS.escape(activeId)}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [listRef, activeId]);
}

// ─── Shared CSS (palette + page) ─────────────────────────────────────────────

export const SEARCH_CSS = `
.srx-ico { display: inline-flex; flex: none; width: 24px; justify-content: center; }
.srx-row { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 8px 16px; cursor: pointer; color: var(--text-primary); text-decoration: none; box-shadow: inset 3px 0 0 transparent; }
.srx-row:hover { background: var(--bg-row-hover); }
.srx-row[aria-selected="true"], .srx-row[data-active="true"] { background: var(--selected-row-bg); box-shadow: inset 3px 0 0 var(--selected-row-indicator); }
.srx-row:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
.srx-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.srx-label { font-size: 14px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.srx-num { font-weight: 800; margin-right: 8px; font-variant-numeric: tabular-nums; }
.srx-meta { font-size: 12px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.srx-side { flex: none; font-size: 12px; color: var(--text-tertiary); }
.srx-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 12px 16px 4px; font-size: 12px; font-weight: 700; color: var(--text-tertiary); letter-spacing: .02em; }
.srx-head a, .srx-head button { all: unset; cursor: pointer; color: var(--text-secondary); font-weight: 700; font-size: 12px; min-height: 28px; display: inline-flex; align-items: center; text-decoration: underline; text-underline-offset: 3px; }
.srx-head a:hover, .srx-head button:hover { color: var(--text-primary); }
.srx-note { padding: 14px 16px; font-size: 13px; color: var(--text-secondary); }
.srx-sep { height: 1px; background: var(--border-subtle); margin: 6px 0; }
@media (max-width: 640px) {
  .srx-row { min-height: 52px; }
}
`;
