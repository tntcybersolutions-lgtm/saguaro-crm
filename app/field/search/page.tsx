'use client';
/**
 * Saguaro Field — Global Search
 * Cross-module search with filters, recent searches, and highlighted results.
 */
import React, { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';

const RECENT_KEY = 'saguaro_recent_searches';
const MAX_RECENT = 10;

interface SearchModule {
  id: string;
  label: string;
  route: string;
  icon: 'rfi' | 'punch' | 'log' | 'inspect' | 'co' | 'submittal' | 'safety' | 'doc' | 'photo' | 'meeting' | 'tm';
}

const MODULES: SearchModule[] = [
  { id: 'rfis', label: 'RFIs', route: '/field/rfis', icon: 'rfi' },
  { id: 'punch_lists', label: 'Punch Lists', route: '/field/punch', icon: 'punch' },
  { id: 'daily_logs', label: 'Daily Logs', route: '/field/log', icon: 'log' },
  { id: 'inspections', label: 'Inspections', route: '/field/inspect', icon: 'inspect' },
  { id: 'change_orders', label: 'Change Orders', route: '/field/change-orders', icon: 'co' },
  { id: 'submittals', label: 'Submittals', route: '/field/submittals', icon: 'submittal' },
  { id: 'safety', label: 'Safety', route: '/field/safety', icon: 'safety' },
  { id: 'documents', label: 'Documents', route: '/field/docs', icon: 'doc' },
  { id: 'photos', label: 'Photos', route: '/field/photos', icon: 'photo' },
  { id: 'meetings', label: 'Meetings', route: '/field/meetings', icon: 'meeting' },
  { id: 'tm_tickets', label: 'T&M Tickets', route: '/field/tm-tickets', icon: 'tm' },
];

interface SearchResult {
  id: string;
  module: string;
  title: string;
  number?: string;
  status: string;
  date: string;
  excerpt: string;
  route: string;
}

interface GroupedResults {
  module: string;
  label: string;
  icon: SearchModule['icon'];
  route: string;
  items: SearchResult[];
}

type QuickFilter = 'today' | 'this_week' | 'my_items' | 'overdue' | null;

function statusColor(status: string): string {
  const s = status?.toLowerCase() || '';
  if (s === 'open' || s === 'pending' || s === 'in_progress' || s === 'in progress') return BLUE;
  if (s === 'closed' || s === 'approved' || s === 'resolved' || s === 'complete' || s === 'completed' || s === 'passed') return GREEN;
  if (s === 'overdue' || s === 'rejected' || s === 'failed') return RED;
  if (s === 'draft' || s === 'submitted') return AMBER;
  return DIM;
}

function formatDate(d: string | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getRecentSearches(): string[] {
  try {
    const s = localStorage.getItem(RECENT_KEY);
    if (s) return JSON.parse(s);
  } catch { /* ok */ }
  return [];
}

function saveRecentSearch(query: string) {
  try {
    let recent = getRecentSearches();
    recent = recent.filter((r) => r.toLowerCase() !== query.toLowerCase());
    recent.unshift(query);
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch { /* ok */ }
}

function removeRecentSearch(query: string) {
  try {
    let recent = getRecentSearches();
    recent = recent.filter((r) => r !== query);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch { /* ok */ }
}

function ModuleIcon({ type, size = 16, color = GOLD }: { type: SearchModule['icon']; size?: number; color?: string }) {
  const props = { viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, width: size, height: size };
  switch (type) {
    case 'rfi': return <svg {...props}><circle cx={12} cy={12} r={10}/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1={12} y1={17} x2={12.01} y2={17}/></svg>;
    case 'punch': return <svg {...props}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
    case 'log': return <svg {...props}><rect x={3} y={4} width={18} height={18} rx={2}/><line x1={16} y1={2} x2={16} y2={6}/><line x1={8} y1={2} x2={8} y2={6}/><line x1={3} y1={10} x2={21} y2={10}/></svg>;
    case 'inspect': return <svg {...props}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
    case 'co': return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1={12} y1={18} x2={12} y2={12}/><line x1={9} y1={15} x2={15} y2={15}/></svg>;
    case 'submittal': return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1={16} y1={13} x2={8} y2={13}/><line x1={16} y1={17} x2={8} y2={17}/><polyline points="10 9 9 9 8 9"/></svg>;
    case 'safety': return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    case 'doc': return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
    case 'photo': return <svg {...props}><rect x={3} y={3} width={18} height={18} rx={2}/><circle cx={8.5} cy={8.5} r={1.5}/><polyline points="21 15 16 10 5 21"/></svg>;
    case 'meeting': return <svg {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx={9} cy={7} r={4}/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case 'tm': return <svg {...props}><circle cx={12} cy={12} r={10}/><polyline points="12 6 12 12 16 14"/></svg>;
    default: return null;
  }
}

function HighlightedText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight || !text) return <span>{text}</span>;
  const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase()
          ? <mark key={i} style={{ background: 'rgba(212,160,23,.3)', color: GOLD, borderRadius: 2, padding: '0 1px' }}>{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </span>
  );
}

function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeModules, setActiveModules] = useState<Set<string>>(new Set(MODULES.map((m) => m.id)));
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showModuleFilters, setShowModuleFilters] = useState(false);

  // Auto-focus on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
    setRecentSearches(getRecentSearches());
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Execute search when debounced query or filters change
  useEffect(() => {
    if (!debouncedQuery || !projectId) {
      if (!debouncedQuery) { setResults([]); setSearched(false); }
      return;
    }
    let cancelled = false;
    const doSearch = async () => {
      setLoading(true);
      try {
        const modules = Array.from(activeModules).join(',');
        let url = `/api/projects/${projectId}/search?q=${encodeURIComponent(debouncedQuery)}&modules=${modules}`;
        if (quickFilter) url += `&filter=${quickFilter}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        if (!cancelled) {
          setResults(data.results || []);
          setSearched(true);
          saveRecentSearch(debouncedQuery);
          setRecentSearches(getRecentSearches());
        }
      } catch {
        if (!cancelled) { setResults([]); setSearched(true); }
      }
      if (!cancelled) setLoading(false);
    };
    doSearch();
    return () => { cancelled = true; };
  }, [debouncedQuery, activeModules, quickFilter, projectId]);

  const toggleModule = useCallback((moduleId: string) => {
    setActiveModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) { next.delete(moduleId); } else { next.add(moduleId); }
      return next;
    });
  }, []);

  const selectAllModules = useCallback(() => {
    setActiveModules(new Set(MODULES.map((m) => m.id)));
  }, []);

  const clearAllModules = useCallback(() => {
    setActiveModules(new Set());
  }, []);

  const handleResultTap = useCallback((result: SearchResult) => {
    const sep = result.route.includes('?') ? '&' : '?';
    router.push(`${result.route}${sep}projectId=${projectId}&id=${result.id}`);
  }, [router, projectId]);

  const handleRecentTap = useCallback((term: string) => {
    setQuery(term);
  }, []);

  const handleRemoveRecent = useCallback((term: string) => {
    removeRecentSearch(term);
    setRecentSearches(getRecentSearches());
  }, []);

  const clearRecentSearches = useCallback(() => {
    try { localStorage.removeItem(RECENT_KEY); } catch { /* ok */ }
    setRecentSearches([]);
  }, []);

  // Group results by module
  const grouped: GroupedResults[] = [];
  const byModule = new Map<string, SearchResult[]>();
  results.forEach((r) => {
    const arr = byModule.get(r.module) || [];
    arr.push(r);
    byModule.set(r.module, arr);
  });
  byModule.forEach((items, moduleId) => {
    const mod = MODULES.find((m) => m.id === moduleId);
    if (mod) {
      grouped.push({ module: moduleId, label: mod.label, icon: mod.icon, route: mod.route, items });
    }
  });

  const totalResults = results.length;

  const QUICK_FILTERS: { id: QuickFilter; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'this_week', label: 'This Week' },
    { id: 'my_items', label: 'My Items' },
    { id: 'overdue', label: 'Overdue' },
  ];

  const SUGGESTIONS = [
    'Try searching for RFI numbers, punch item descriptions, or keywords',
    'Filter by module to narrow your search',
    'Use quick filters to find today\'s items or overdue items',
  ];

  return (
    <div style={{ padding: '18px 16px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={() => router.back()} style={backBtnStyle}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
            <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Search</h1>
          <p style={{ margin: 0, fontSize: 12, color: DIM }}>Search across all modules</p>
        </div>
      </div>

      {/* Search Input */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: RAISED, border: `1px solid ${query ? GOLD : BORDER}`,
        borderRadius: 14, padding: '10px 14px', marginBottom: 12,
        transition: 'border-color .2s',
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={query ? GOLD : DIM} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search RFIs, punch items, logs..."
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            color: TEXT, fontSize: 16, fontWeight: 500,
          }}
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setSearched(false); inputRef.current?.focus(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: DIM }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
              <line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/>
            </svg>
          </button>
        )}
        {loading && (
          <div style={{
            width: 18, height: 18, border: `2px solid ${BORDER}`, borderTopColor: GOLD,
            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
          }} />
        )}
      </div>

      {/* Module Filters Toggle */}
      <button
        onClick={() => setShowModuleFilters(!showModuleFilters)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
          color: DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0', marginBottom: 8,
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        Modules ({activeModules.size}/{MODULES.length})
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}
          style={{ transform: showModuleFilters ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {showModuleFilters && (
        <div style={{
          background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14,
          padding: '12px 14px', marginBottom: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Search In
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={selectAllModules} style={linkBtn}>All</button>
              <button onClick={clearAllModules} style={linkBtn}>None</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {MODULES.map((mod) => {
              const active = activeModules.has(mod.id);
              return (
                <button
                  key={mod.id}
                  onClick={() => toggleModule(mod.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '6px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', transition: 'all .15s',
                    background: active ? 'rgba(212,160,23,.15)' : 'transparent',
                    border: `1px solid ${active ? 'rgba(212,160,23,.4)' : BORDER}`,
                    color: active ? GOLD : DIM,
                  }}
                >
                  <ModuleIcon type={mod.icon} size={12} color={active ? GOLD : DIM} />
                  {mod.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto' }}>
        {QUICK_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setQuickFilter(quickFilter === f.id ? null : f.id)}
            style={{
              padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s',
              background: quickFilter === f.id ? 'rgba(212,160,23,.15)' : 'transparent',
              border: `1px solid ${quickFilter === f.id ? 'rgba(212,160,23,.4)' : BORDER}`,
              color: quickFilter === f.id ? GOLD : DIM,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Recent Searches (shown when no query) */}
      {!query && !searched && recentSearches.length > 0 && (
        <div style={{
          background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14,
          padding: '14px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Recent Searches
            </span>
            <button onClick={clearRecentSearches} style={linkBtn}>Clear</button>
          </div>
          {recentSearches.map((term, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 0', borderTop: i > 0 ? `1px solid rgba(30,58,95,.5)` : 'none',
              }}
            >
              <button
                onClick={() => handleRecentTap(term)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', gap: 8, color: TEXT, fontSize: 14,
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                </svg>
                {term}
              </button>
              <button
                onClick={() => handleRemoveRecent(term)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: DIM, display: 'flex' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
                  <line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty State (no query, no recent) */}
      {!query && !searched && recentSearches.length === 0 && (
        <div style={{
          background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14,
          padding: '32px 20px', textAlign: 'center',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={48} height={48} style={{ marginBottom: 12, opacity: 0.5 }}>
            <circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/>
          </svg>
          <p style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: TEXT }}>Search Your Project</p>
          <div style={{ textAlign: 'left', maxWidth: 280, margin: '0 auto' }}>
            {SUGGESTIONS.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, marginTop: 6, flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: 13, color: DIM, lineHeight: 1.5 }}>{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && !results.length && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{
            width: 32, height: 32, border: `3px solid ${BORDER}`, borderTopColor: GOLD,
            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            margin: '0 auto 12px',
          }} />
          <p style={{ margin: 0, fontSize: 14, color: DIM }}>Searching...</p>
        </div>
      )}

      {/* Results Count */}
      {searched && !loading && (
        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: DIM, fontWeight: 600 }}>
            {totalResults} result{totalResults !== 1 ? 's' : ''} found
          </span>
          {quickFilter && (
            <button onClick={() => setQuickFilter(null)} style={{ ...linkBtn, fontSize: 12 }}>
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* No Results */}
      {searched && !loading && totalResults === 0 && (
        <div style={{
          background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14,
          padding: '32px 20px', textAlign: 'center',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={40} height={40} style={{ marginBottom: 12, opacity: 0.5 }}>
            <circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/>
            <line x1={8} y1={8} x2={14} y2={14}/>
          </svg>
          <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: TEXT }}>No results found</p>
          <p style={{ margin: 0, fontSize: 13, color: DIM }}>
            Try different keywords or broaden your module filters
          </p>
        </div>
      )}

      {/* Grouped Results */}
      {grouped.map((group) => (
        <div key={group.module} style={{
          background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14,
          marginBottom: 12, overflow: 'hidden',
        }}>
          {/* Group Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderBottom: `1px solid ${BORDER}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.2)',
              }}>
                <ModuleIcon type={group.icon} size={14} color={GOLD} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{group.label}</span>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
              background: 'rgba(212,160,23,.1)', color: GOLD, border: '1px solid rgba(212,160,23,.2)',
            }}>
              {group.items.length}
            </span>
          </div>

          {/* Results */}
          {group.items.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => handleResultTap(item)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '12px 14px', cursor: 'pointer',
                background: 'transparent', border: 'none',
                borderTop: idx > 0 ? `1px solid rgba(30,58,95,.5)` : 'none',
                transition: 'background .15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(212,160,23,.04)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>
                  {item.number && <span style={{ color: GOLD, marginRight: 6 }}>#{item.number}</span>}
                  <HighlightedText text={item.title} highlight={debouncedQuery} />
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                  background: `${statusColor(item.status)}18`, color: statusColor(item.status),
                  border: `1px solid ${statusColor(item.status)}30`,
                  textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', marginLeft: 8,
                }}>
                  {item.status}
                </span>
              </div>
              {item.excerpt && (
                <p style={{ margin: '0 0 4px', fontSize: 12, color: DIM, lineHeight: 1.4 }}>
                  <HighlightedText text={item.excerpt} highlight={debouncedQuery} />
                </p>
              )}
              <span style={{ fontSize: 11, color: DIM, opacity: 0.7 }}>{formatDate(item.date)}</span>
            </button>
          ))}
        </div>
      ))}

      {/* Spinner keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function FieldSearchPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}>
      <SearchPage />
    </Suspense>
  );
}

const backBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: DIM, cursor: 'pointer',
  padding: 8, marginLeft: -8, display: 'flex', alignItems: 'center',
};

const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: GOLD, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', padding: 0,
};
