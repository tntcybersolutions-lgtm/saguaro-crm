'use client'
import React from 'react'

interface PaginationProps {
  page: number
  totalPages: number
  totalCount: number
  pageSize: number
  onPage: (p: number) => void
}

export function Pagination({ page, totalPages, totalCount, pageSize, onPage }: PaginationProps) {
  if (totalPages <= 1) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  const pages: (number | '...')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push('...')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
    if (page < totalPages - 2) pages.push('...')
    pages.push(totalPages)
  }

  const btnStyle = (active: boolean, disabled?: boolean): React.CSSProperties => ({
    padding: '7px 12px',
    borderRadius: 6,
    border: '1px solid #30363d',
    background: active ? '#D4A017' : 'transparent',
    color: active ? '#0d1117' : disabled ? '#6e7681' : '#8b949e',
    fontSize: 13,
    fontWeight: active ? 700 : 400,
    cursor: disabled ? 'not-allowed' : 'pointer',
    minWidth: 36,
    textAlign: 'center' as const,
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid #30363d' }}>
      <span style={{ fontSize: 12, color: '#8b949e' }}>
        Showing {from}&ndash;{to} of {totalCount.toLocaleString()}
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onPage(page - 1)} disabled={page === 1} style={btnStyle(false, page === 1)}>&lsaquo;</button>
        {pages.map((p, i) =>
          p === '...'
            ? <span key={`dots-${i}`} style={{ padding: '7px 4px', color: '#6e7681', fontSize: 13 }}>&hellip;</span>
            : <button key={p} onClick={() => onPage(p as number)} style={btnStyle(p === page)}>{p}</button>
        )}
        <button onClick={() => onPage(page + 1)} disabled={page === totalPages} style={btnStyle(false, page === totalPages)}>&rsaquo;</button>
      </div>
    </div>
  )
}
