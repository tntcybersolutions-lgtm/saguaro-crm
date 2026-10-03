'use client';
/**
 * DataTable — Reusable, Procore-grade data table.
 * Built on TanStack Table with sorting, filtering, pagination.
 * Fully wired — no placeholders.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type OnChangeFn,
} from '@tanstack/react-table';
import { CaretUp, CaretDown, CaretUpDown, MagnifyingGlass, CaretLeft, CaretRight, Export } from '@phosphor-icons/react';
import { colors, font, radius, shadow } from '../lib/design-tokens';

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[];
  searchPlaceholder?: string;
  searchKey?: string;
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  onExport?: () => void;
  toolbar?: React.ReactNode;
  /** Initial sort when the user hasn't chosen one. Same {key,dir} shape the premium DataTable uses. */
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  /**
   * Persist the user's sort as 'sag_sort_' + tableId in localStorage — the exact
   * contract of the premium-kit DataTable (components/ui/premium.tsx), storing
   * {key, dir: 'asc'|'desc'} or null when the user cycles back to unsorted, so
   * the two table primitives stay one system. Omit it and nothing changes.
   */
  tableId?: string;
}

// Shared persisted shape (mirrors SortState in components/ui/premium.tsx).
type PersistedSort = { key: string; dir: 'asc' | 'desc' } | null;

const toSortingState = (s: PersistedSort): SortingState =>
  s ? [{ id: s.key, desc: s.dir === 'desc' }] : [];

const toPersistedSort = (s: SortingState): PersistedSort =>
  s.length > 0 ? { key: s[0].id, dir: s[0].desc ? 'desc' : 'asc' } : null;

export default function DataTable<T extends Record<string, any>>({
  data,
  columns,
  searchPlaceholder = 'Search…',
  searchKey,
  loading = false,
  emptyMessage = 'No records found',
  emptyIcon,
  pageSize = 20,
  onRowClick,
  onExport,
  toolbar,
  defaultSort,
  tableId,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(() => toSortingState(defaultSort ?? null));
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // Load the persisted choice AFTER mount (not in the initializer) so server
  // and first client render agree — no hydration mismatch. Matches the premium
  // DataTable's hydration behavior exactly.
  useEffect(() => {
    if (!tableId) return;
    try {
      const raw = window.localStorage.getItem('sag_sort_' + tableId);
      if (raw == null) return;
      const parsed = JSON.parse(raw) as PersistedSort;
      if (parsed === null) setSorting([]); // user explicitly cycled back to none
      else if (parsed && typeof parsed.key === 'string' && (parsed.dir === 'asc' || parsed.dir === 'desc')) {
        setSorting(toSortingState(parsed));
      }
    } catch {
      /* corrupt entry — keep defaultSort */
    }
  }, [tableId]);

  // Persist on user-driven sort changes (TanStack only calls this from header
  // interactions; the hydration effect above sets state directly and never writes).
  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    setSorting((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (tableId) {
        try {
          window.localStorage.setItem('sag_sort_' + tableId, JSON.stringify(toPersistedSort(next)));
        } catch {
          /* storage unavailable — sort still applies for this session */
        }
      }
      return next;
    });
  };

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnFilters },
    onSortingChange: handleSortingChange,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const rowCount = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();
  const currentPage = table.getState().pagination.pageIndex;

  return (
    <div>
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 400 }}>
          <MagnifyingGlass
            size={14}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: colors.textDim }}
          />
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              background: colors.raised,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              color: colors.text,
              fontSize: font.size.md,
              outline: 'none',
              transition: 'border-color .15s',
            }}
            onFocus={(e) => (e.target.style.borderColor = colors.gold)}
            onBlur={(e) => (e.target.style.borderColor = colors.border)}
          />
        </div>

        {toolbar}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: font.size.sm, color: colors.textMuted }}>
            {rowCount} record{rowCount !== 1 ? 's' : ''}
          </span>
          {onExport && (
            <button
              onClick={onExport}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', background: 'rgba(255,255,255,.04)',
                border: `1px solid ${colors.border}`, borderRadius: radius.md,
                color: colors.textMuted, fontSize: font.size.sm, fontWeight: font.weight.semibold,
                cursor: 'pointer', transition: 'all .15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.textMuted; e.currentTarget.style.color = colors.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.color = colors.textMuted; }}
            >
              <Export size={14} /> Export
            </button>
          )}
        </div>
      </div>

      {/* ── Table — machined panel (.pmTable milled plate + chrome header) ── */}
      <div className="pmTable">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header, hIdx) => {
                    const sorted = header.column.getIsSorted();
                    const canSort = header.column.getCanSort();
                    return (
                      <th
                        key={header.id}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        style={{
                          // chrome band: subtle top-lit gradient (mobile chromeGrad)
                          padding: `11px ${hIdx === headerGroup.headers.length - 1 ? 20 : 16}px 11px ${hIdx === 0 ? 20 : 16}px`,
                          background: 'linear-gradient(180deg, #17181b 0%, #101114 100%)',
                          borderBottom: `1px solid ${colors.border}`,
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                          textAlign: 'left',
                          fontSize: 10.5,
                          fontWeight: font.weight.bold,
                          color: colors.textDim,
                          cursor: canSort ? 'pointer' : 'default',
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                          transition: 'color .15s',
                        }}
                        onMouseEnter={(e) => canSort && (e.currentTarget.style.color = colors.text)}
                        onMouseLeave={(e) => canSort && (e.currentTarget.style.color = colors.textDim)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && (
                            <span style={{ display: 'flex', color: sorted ? colors.gold : colors.textFaint }}>
                              {sorted === 'asc' ? <CaretUp size={12} weight="bold" /> :
                               sorted === 'desc' ? <CaretDown size={12} weight="bold" /> :
                               <CaretUpDown size={12} />}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    {columns.map((_, j) => (
                      <td key={j} style={{ padding: '13px 16px', borderBottom: `1px solid ${colors.borderDim}` }}>
                        <div style={{ height: 12, borderRadius: 5, background: 'rgba(255,255,255,.05)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} style={{ padding: '64px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                      {emptyIcon && (
                        <div
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 48, height: 48, borderRadius: 'var(--radius-pill)',
                            background: colors.goldDim, border: `1px solid ${colors.goldBorder}`,
                            color: colors.gold,
                          }}
                        >
                          {emptyIcon}
                        </div>
                      )}
                      <div style={{ color: colors.textMuted, fontSize: font.size.md, fontWeight: font.weight.medium }}>
                        {emptyMessage}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row, rowIndex) => {
                  const isLast = rowIndex === table.getRowModel().rows.length - 1;
                  const cells = row.getVisibleCells();
                  // zebra-free machined rows: hairlines + brand-08 hover wash
                  return (
                    <tr
                      key={row.id}
                      onClick={() => onRowClick?.(row.original)}
                      style={{
                        cursor: onRowClick ? 'pointer' : 'default',
                        background: 'transparent',
                        transition: 'background .12s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--brand-primary-08)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {cells.map((cell, cIdx) => (
                        <td
                          key={cell.id}
                          style={{
                            padding: `12px ${cIdx === cells.length - 1 ? 20 : 16}px 12px ${cIdx === 0 ? 20 : 16}px`,
                            borderBottom: isLast ? 'none' : `1px solid ${colors.borderDim}`,
                            fontSize: font.size.md,
                            color: colors.text,
                            whiteSpace: 'nowrap',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ───────────────────────────────────────────────── */}
      {pageCount > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, fontSize: font.size.sm, color: colors.textMuted }}>
          <span>
            Page {currentPage + 1} of {pageCount}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 10px', background: 'rgba(255,255,255,.04)',
                border: `1px solid ${colors.border}`, borderRadius: radius.md,
                color: table.getCanPreviousPage() ? colors.text : colors.textFaint,
                fontSize: font.size.sm, cursor: table.getCanPreviousPage() ? 'pointer' : 'not-allowed',
              }}
            >
              <CaretLeft size={12} /> Prev
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 10px', background: 'rgba(255,255,255,.04)',
                border: `1px solid ${colors.border}`, borderRadius: radius.md,
                color: table.getCanNextPage() ? colors.text : colors.textFaint,
                fontSize: font.size.sm, cursor: table.getCanNextPage() ? 'pointer' : 'not-allowed',
              }}
            >
              Next <CaretRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Skeleton animation */}
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
