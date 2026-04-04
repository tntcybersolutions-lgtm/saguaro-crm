'use client';
import React, { useState } from 'react';

const GOLD = '#C8960F', BORDER = '#1E3A5F', TEXT = '#F0F4FF', DIM = '#8BAAC8';

interface FilterOption {
  label: string;
  value: string;
  color?: string;
}

interface SearchFilterProps {
  placeholder?: string;
  onSearch: (query: string) => void;
  filters?: FilterOption[];
  activeFilter?: string;
  onFilter?: (value: string) => void;
  resultCount?: number;
  sortOptions?: FilterOption[];
  activeSort?: string;
  onSort?: (value: string) => void;
}

export default function SearchFilter({
  placeholder = 'Search...',
  onSearch,
  filters,
  activeFilter = 'all',
  onFilter,
  resultCount,
  sortOptions,
  activeSort,
  onSort,
}: SearchFilterProps) {
  const [query, setQuery] = useState('');

  const handleChange = (val: string) => {
    setQuery(val);
    onSearch(val);
  };

  return (
    <div style={{ padding: '0 0 10px' }}>
      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: filters ? 8 : 0 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: DIM, fontSize: 14, pointerEvents: 'none' }}>🔍</span>
        <input
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', padding: '9px 12px 9px 36px',
            background: 'rgba(255,255,255,.04)', border: `1px solid ${BORDER}`,
            borderRadius: 10, color: TEXT, fontSize: 13, outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {query && (
          <button onClick={() => handleChange('')}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: DIM, fontSize: 16, cursor: 'pointer' }}>
            ×
          </button>
        )}
      </div>

      {/* Filter chips + sort */}
      {(filters || sortOptions) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {filters?.map(f => (
            <button key={f.value} onClick={() => onFilter?.(f.value)}
              style={{
                padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600,
                whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0,
                background: activeFilter === f.value ? 'rgba(212,160,23,.2)' : 'rgba(255,255,255,.04)',
                border: `1px solid ${activeFilter === f.value ? GOLD : 'rgba(255,255,255,.08)'}`,
                color: activeFilter === f.value ? GOLD : DIM,
              }}>
              {f.label}
            </button>
          ))}
          {sortOptions && (
            <select
              value={activeSort}
              onChange={e => onSort?.(e.target.value)}
              style={{
                marginLeft: 'auto', padding: '4px 8px', background: 'rgba(255,255,255,.04)',
                border: `1px solid ${BORDER}`, borderRadius: 8, color: DIM, fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {sortOptions.map(s => (
                <option key={s.value} value={s.value} style={{ background: '#0D1D2E' }}>{s.label}</option>
              ))}
            </select>
          )}
          {resultCount !== undefined && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: DIM, flexShrink: 0 }}>{resultCount} results</span>
          )}
        </div>
      )}
    </div>
  );
}
