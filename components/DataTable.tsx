'use client';
/**
 * DataTable — Reusable, Procore-grade data table.
 * Built on TanStack Table with sorting, filtering, pagination.
 * Fully wired — no placeholders.
 */
import React, { useState, useMemo } from 'react';
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
  /** Render a mobile card for each row (shown below 768px instead of table) */
  mobileCard?: (row: T) => React.ReactNode;
}

export default function DataTable<T extends Record<string, any>>({
  data,
  columns,
  searchPlaceholder = 'Search...',
  searchKey,
  loading = false,
  emptyMessage = 'No records found',
  emptyIcon,
  pageSize = 20,
  onRowClick,
  onExport,
  toolbar,
  mobileCard,
}: DataTableProps<T>) {
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnFilters },
    onSortingChange: setSorting,
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

      {/* ── Mobile Card View (< 768px) ────────────────────────────── */}
      {isMobile && mobileCard ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={`mobile-skeleton-${i}`} style={{ padding: 16, background: 'rgba(255,255,255,.02)', border: `1px solid ${colors.border}`, borderRadius: radius.lg }}>
                <div style={{ height: 14, width: '60%', borderRadius: 4, background: 'rgba(255,255,255,.04)', marginBottom: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ height: 12, width: '80%', borderRadius: 4, background: 'rgba(255,255,255,.04)', marginBottom: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ height: 12, width: '40%', borderRadius: 4, background: 'rgba(255,255,255,.04)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              </div>
            ))
          ) : table.getRowModel().rows.length === 0 ? (
            <div style={{ padding: '48px 16px', textAlign: 'center', color: colors.textDim, fontSize: font.size.md }}>
              {emptyMessage}
            </div>
          ) : (
            table.getRowModel().rows.map((row) => (
              <div
                key={row.id}
                onClick={() => onRowClick?.(row.original)}
                style={{
                  padding: 16,
                  background: 'rgba(255,255,255,.02)',
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.lg,
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'border-color .15s',
                }}
              >
                {mobileCard(row.original)}
              </div>
            ))
          )}
        </div>
      ) : (

      /* ── Desktop Table (>= 768px) ───────────────────────────────── */
      <div style={{ borderRadius: radius.lg, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    const canSort = header.column.getCanSort();
                    return (
                      <th
                        key={header.id}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        style={{
                          padding: '10px 14px',
                          background: colors.darkAlt,
                          borderBottom: `1px solid ${colors.border}`,
                          textAlign: 'left',
                          fontSize: font.size.xs,
                          fontWeight: font.weight.bold,
                          color: colors.textMuted,
                          textTransform: 'uppercase',
                          letterSpacing: 0.8,
                          cursor: canSort ? 'pointer' : 'default',
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                          transition: 'color .15s',
                        }}
                        onMouseEnter={(e) => canSort && (e.currentTarget.style.color = colors.text)}
                        onMouseLeave={(e) => canSort && (e.currentTarget.style.color = colors.textMuted)}
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
                      <td key={j} style={{ padding: '12px 14px', borderBottom: `1px solid ${colors.borderDim}` }}>
                        <div style={{ height: 14, borderRadius: 4, background: 'rgba(255,255,255,.04)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} style={{ padding: '48px 14px', textAlign: 'center' }}>
                    <div style={{ color: colors.textDim, fontSize: font.size.md }}>
                      {emptyIcon && <div style={{ marginBottom: 8, opacity: 0.5 }}>{emptyIcon}</div>}
                      {emptyMessage}
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row.original)}
                    style={{
                      cursor: onRowClick ? 'pointer' : 'default',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.02)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        style={{
                          padding: '10px 14px',
                          borderBottom: `1px solid ${colors.borderDim}`,
                          fontSize: font.size.md,
                          color: colors.text,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      )}

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
