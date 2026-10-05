'use client';

/**
 * Sorting for every list — the same behaviour whether the table is the kit
 * DataTable or a hand-rolled <table>.
 *
 *   useSort(initial)            → { sort, setSort, cycle }   (asc → desc → off)
 *   useSortedRows(rows, sort, getValue)   stable sort over the FULL filtered
 *                                 set (from ./premium): empties sink, ties keep
 *                                 source order; lists in this app are fetched
 *                                 whole and filtered client-side, so the sort
 *                                 always covers every row, never one page.
 *   <SortTh>                    header cell: click to cycle, aria-sort, caret.
 *   <SortBar>                   phone-only control (the header row is hidden
 *                                 or scrolled away on a phone): a Sort select
 *                                 plus an asc/desc toggle, 44px targets.
 */

import React from 'react';
import { ArrowsDownUp, CaretDown, CaretUp, SortAscending, SortDescending } from '@phosphor-icons/react';
import { useSortedRows, type SortState, type SortDir } from './premium';

export { useSortedRows };
export type { SortState, SortDir };

export type SortColumn = { key: string; label: string };

export function useSort(initial: SortState = null) {
  const [sort, setSort] = React.useState<SortState>(initial);
  const cycle = React.useCallback((key: string) => {
    setSort((p) => (!p || p.key !== key ? { key, dir: 'asc' } : p.dir === 'asc' ? { key, dir: 'desc' } : null));
  }, []);
  return { sort, setSort, cycle };
}

export function SortTh({ col, label, sort, onSort, align = 'left', style, className, title }: {
  col: string;
  label: React.ReactNode;
  sort: SortState;
  onSort: (key: string) => void;
  align?: 'left' | 'right' | 'center';
  style?: React.CSSProperties;
  className?: string;
  title?: string;
}) {
  const dir = sort?.key === col ? sort.dir : null;
  return (
    <th
      data-sortable="true"
      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
      onClick={() => onSort(col)}
      title={title ?? (dir === 'asc' ? 'Sorted ascending — click for descending' : dir === 'desc' ? 'Sorted descending — click to clear' : 'Click to sort')}
      className={className}
      style={{ cursor: 'pointer', userSelect: 'none', textAlign: align, ...style }}
    >
      <span className="k-sort-th" data-dir={dir ?? 'none'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: align === 'right' ? 'flex-end' : undefined }}>
        {label}
        {dir === 'asc' ? <CaretUp size={11} weight="bold" aria-hidden /> : dir === 'desc' ? <CaretDown size={11} weight="bold" aria-hidden /> : <ArrowsDownUp size={11} weight="bold" aria-hidden style={{ opacity: .35 }} />}
      </span>
    </th>
  );
}

export function SortBar({ columns, sort, onChange, defaultLabel = 'Default order' }: {
  columns: SortColumn[];
  sort: SortState;
  onChange: (s: SortState) => void;
  defaultLabel?: string;
}) {
  if (columns.length === 0) return null;
  const dir: SortDir = sort?.dir ?? 'asc';
  return (
    <div className="k-sortbar" role="group" aria-label="Sort">
      <label className="k-sortbar-field">
        <span className="k-sortbar-label">Sort</span>
        <select
          className="k-sortbar-select"
          value={sort?.key ?? ''}
          onChange={(e) => onChange(e.target.value ? { key: e.target.value, dir } : null)}
          aria-label="Sort by"
        >
          <option value="">{defaultLabel}</option>
          {columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </label>
      <button
        type="button"
        className="k-sortbar-dir"
        disabled={!sort}
        aria-label={dir === 'asc' ? 'Ascending — switch to descending' : 'Descending — switch to ascending'}
        onClick={() => sort && onChange({ key: sort.key, dir: dir === 'asc' ? 'desc' : 'asc' })}
      >
        {dir === 'asc' ? <SortAscending size={16} weight="bold" aria-hidden /> : <SortDescending size={16} weight="bold" aria-hidden />}
        <span>{dir === 'asc' ? 'Asc' : 'Desc'}</span>
      </button>
    </div>
  );
}
