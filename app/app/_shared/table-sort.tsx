'use client';
/**
 * R11 table-behavior sweep — shared sortable-header kit for hand-rolled tables.
 *
 * Mirrors the premium DataTable's machined header treatment exactly
 * (pmSortTh / pmSortGlyph classes, chrome header band, tri-state asc → desc →
 * none cycle, localStorage persistence under 'sag_sort_' + tableId) so list
 * pages that can't adopt <DataTable> wholesale — drag-reorder rows, inline
 * menus, expanding rows — still sort with the same feel and persistence.
 * Row ordering itself comes from premium's useSortedRows (money/date-aware).
 *
 * NOTE: pmSortTh/pmSortGlyph styling ships in PREMIUM_FX, which every page
 * using PremiumSurface or PremiumFX already renders.
 */
import React from 'react';
import type { SortState } from '@/components/ui/premium';

export { useSortedRows, compareSortValues } from '@/components/ui/premium';
export type { SortState, SortDir } from '@/components/ui/premium';

/** Tri-state sort state persisted the same way DataTable persists tableId. */
export function usePersistedSort(tableId: string, defaultSort: SortState = null) {
  const [sort, setSort] = React.useState<SortState>(defaultSort);

  // Load after mount (not in the initializer) so server and first client
  // render agree — no hydration mismatch. Same contract as DataTable.
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem('sag_sort_' + tableId);
      if (raw == null) return;
      const parsed = JSON.parse(raw) as SortState;
      if (parsed === null) setSort(null); // user explicitly cycled back to none
      else if (parsed && typeof parsed.key === 'string' && (parsed.dir === 'asc' || parsed.dir === 'desc')) setSort(parsed);
    } catch {
      /* corrupt entry — keep defaultSort */
    }
  }, [tableId]);

  const cycleSort = React.useCallback((key: string) => {
    setSort((prev) => {
      const next: SortState =
        !prev || prev.key !== key ? { key, dir: 'asc' } : prev.dir === 'asc' ? { key, dir: 'desc' } : null;
      try {
        window.localStorage.setItem('sag_sort_' + tableId, JSON.stringify(next));
      } catch {
        /* storage unavailable — sort still applies for this session */
      }
      return next;
    });
  }, [tableId]);

  return { sort, cycleSort };
}

/** Machined header cell base — identical to the premium DataTable header band. */
const TH_BASE: React.CSSProperties = {
  padding: '11px 14px',
  background: 'linear-gradient(180deg, #17181b 0%, #101114 100%)',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 800,
  color: 'var(--c-text-2)',
  userSelect: 'none',
  whiteSpace: 'nowrap',
};

/** Sortable (or plain, when sortKey is omitted) header cell for hand-rolled
 *  tables — same markup DataTable renders: pmSortTh th, aria-sort, glyph. */
export function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  align,
  style,
  colSpan,
}: {
  label: React.ReactNode;
  /** Omit to render a non-sortable header with the same machined treatment. */
  sortKey?: string;
  sort: SortState;
  onSort: (key: string) => void;
  align?: 'left' | 'center' | 'right';
  style?: React.CSSProperties;
  colSpan?: number;
}) {
  const active = sortKey && sort?.key === sortKey ? sort.dir : null;
  return (
    <th
      className={sortKey ? 'pmSortTh' : undefined}
      colSpan={colSpan}
      aria-sort={sortKey ? (active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none') : undefined}
      onClick={sortKey ? () => onSort(sortKey) : undefined}
      style={{ ...TH_BASE, textAlign: align || 'left', ...style }}
    >
      {sortKey ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSort(sortKey);
          }}
          style={{
            all: 'unset',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            cursor: 'pointer',
            font: 'inherit',
            color: 'inherit',
            letterSpacing: 'inherit',
            textTransform: 'inherit',
          }}
        >
          {label}
          <span className="pmSortGlyph" aria-hidden>
            {active === 'asc' ? '▲' : active === 'desc' ? '▼' : '↕'}
          </span>
        </button>
      ) : (
        label
      )}
    </th>
  );
}
