'use client';
/**
 * Saguaro Field — Activity Log / Audit Trail
 * Chronological timeline of all project changes with filters, search, and navigation.
 */
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const GOLD   = '#C8960F';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';

/* ── Types ─────────────────────────────────────────────── */

interface ActivityEntry {
  id: string;
  action: 'created' | 'updated' | 'deleted' | 'status_change' | 'comment' | 'approval';
  module: string;
  item_id: string;
  item_title: string;
  item_number?: string;
  user_name: string;
  user_initials: string;
  user_color: string;
  description: string;
  timestamp: string;
  url: string;
  changes?: { field: string; old_value: string; new_value: string }[];
}

interface ActivityResponse {
  entries: ActivityEntry[];
  total: number;
  page: number;
  has_more: boolean;
}

/* ── Action metadata ───────────────────────────────────── */

const ACTION_META: Record<string, { icon: string; color: string; label: string }> = {
  created:       { icon: '+', color: GREEN, label: 'Created' },
  updated:       { icon: '✎', color: BLUE,  label: 'Updated' },
  deleted:       { icon: '✕', color: RED,   label: 'Deleted' },
  status_change: { icon: '→', color: AMBER, label: 'Status Change' },
  comment:       { icon: '💬', color: BLUE,  label: 'Comment' },
  approval:      { icon: '✓', color: GREEN, label: 'Approval' },
};

function getActionMeta(action: string) {
  return ACTION_META[action] || { icon: '•', color: DIM, label: action };
}

/* ── Module metadata ───────────────────────────────────── */

const MODULE_OPTIONS = [
  { value: '', label: 'All Modules' },
  { value: 'rfi', label: 'RFIs' },
  { value: 'punch', label: 'Punch List' },
  { value: 'change_order', label: 'Change Orders' },
  { value: 'submittal', label: 'Submittals' },
  { value: 'inspection', label: 'Inspections' },
  { value: 'daily_log', label: 'Daily Logs' },
  { value: 'drawing', label: 'Drawings' },
  { value: 'photo', label: 'Photos' },
  { value: 'safety', label: 'Safety' },
  { value: 'document', label: 'Documents' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'meeting', label: 'Meetings' },
];

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'status_change', label: 'Status Change' },
  { value: 'comment', label: 'Comment' },
  { value: 'approval', label: 'Approval' },
];

function moduleLabel(mod: string): string {
  const found = MODULE_OPTIONS.find(m => m.value === mod);
  return found ? found.label : mod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* ── Time helpers ──────────────────────────────────────── */

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) {
    return `Yesterday at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ` at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function dateGroupLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (t === todayStart) return 'Today';
  if (t === todayStart - 86400000) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/* ── Main Component ────────────────────────────────────── */

function ActivityLogPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  // Filters
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Expanded change details
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Known users (built from entries)
  const [knownUsers, setKnownUsers] = useState<string[]>([]);

  /* ── Fetch activity ── */
  const fetchActivity = useCallback(async (pageNum: number, append: boolean) => {
    if (!projectId) return;
    if (pageNum === 1) setLoading(true); else setLoadingMore(true);

    const params = new URLSearchParams();
    params.set('page', String(pageNum));
    if (moduleFilter) params.set('module', moduleFilter);
    if (actionFilter) params.set('action', actionFilter);
    if (userFilter) params.set('user', userFilter);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    if (search) params.set('q', search);

    try {
      const res = await fetch(`/api/projects/${projectId}/activity?${params.toString()}`);
      if (res.ok) {
        const data: ActivityResponse = await res.json();
        setEntries(prev => append ? [...prev, ...data.entries] : data.entries);
        setHasMore(data.has_more);
        setTotal(data.total);
        setPage(data.page);

        // Collect unique user names
        const allEntries = append ? [...entries, ...data.entries] : data.entries;
        const users = Array.from(new Set(allEntries.map(e => e.user_name))).sort();
        setKnownUsers(users);
      }
    } catch {
      // Network error — entries stay as-is
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [projectId, moduleFilter, actionFilter, userFilter, dateFrom, dateTo, search, entries]);

  useEffect(() => {
    fetchActivity(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, moduleFilter, actionFilter, userFilter, dateFrom, dateTo]);

  /* ── Search with debounce ── */
  useEffect(() => {
    const timer = setTimeout(() => { fetchActivity(1, false); }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  /* ── Load more ── */
  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      fetchActivity(page + 1, true);
    }
  }, [loadingMore, hasMore, page, fetchActivity]);

  /* ── Toggle expanded entry ── */
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  /* ── Reset filters ── */
  const resetFilters = useCallback(() => {
    setModuleFilter('');
    setActionFilter('');
    setUserFilter('');
    setDateFrom('');
    setDateTo('');
    setSearch('');
  }, []);

  const hasActiveFilters = moduleFilter || actionFilter || userFilter || dateFrom || dateTo;

  /* ── Group entries by date ── */
  const dateGroups: { label: string; entries: ActivityEntry[] }[] = [];
  let currentGroupLabel = '';
  entries.forEach(entry => {
    const label = dateGroupLabel(entry.timestamp);
    if (label !== currentGroupLabel) {
      dateGroups.push({ label, entries: [entry] });
      currentGroupLabel = label;
    } else {
      dateGroups[dateGroups.length - 1].entries.push(entry);
    }
  });

  /* ── No project guard ── */
  if (!projectId) {
    return (
      <div style={{ padding: 32, color: DIM, textAlign: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        <p style={{ fontSize: 15 }}>No project selected. Please select a project first.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#060E18', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', color: TEXT, paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ background: RAISED, borderBottom: `1px solid ${BORDER}`, padding: '16px 16px 12px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button onClick={() => router.back()} style={backBtn} aria-label="Go back">
            <svg width="20" height="20" fill="none" stroke={DIM} strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: 0, flex: 1, textAlign: 'center' }}>Activity Log</h1>
          <button
            onClick={() => setShowFilters(v => !v)}
            style={{
              background: hasActiveFilters ? `rgba(${hexRgb(GOLD)}, .15)` : 'none',
              border: hasActiveFilters ? `1px solid ${GOLD}` : `1px solid ${BORDER}`,
              borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
              color: hasActiveFilters ? GOLD : DIM, fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></svg>
            Filters
            {hasActiveFilters && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD }} />
            )}
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <svg width="16" height="16" fill="none" stroke={DIM} strokeWidth="2" viewBox="0 0 24 24" style={{ position: 'absolute', left: 12, top: 12 }}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search activity..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inp, paddingLeft: 36 }}
          />
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div style={{ marginTop: 12, padding: 14, background: '#07101C', borderRadius: 12, border: `1px solid ${BORDER}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={filterLabel}>Module</label>
                <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} style={selectStyle}>
                  {MODULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={filterLabel}>Action</label>
                <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={selectStyle}>
                  {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={filterLabel}>User</label>
                <select value={userFilter} onChange={e => setUserFilter(e.target.value)} style={selectStyle}>
                  <option value="">All Users</option>
                  {knownUsers.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={filterLabel}>From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={selectStyle} />
              </div>
              <div>
                <label style={filterLabel}>To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={selectStyle} />
              </div>
            </div>
            {hasActiveFilters && (
              <button onClick={resetFilters} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 14px', color: DIM, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                Clear All Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Summary bar */}
      {!loading && (
        <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: DIM }}>{total.toLocaleString()} activit{total === 1 ? 'y' : 'ies'}</span>
          {hasActiveFilters && (
            <button onClick={resetFilters} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: 40, textAlign: 'center', color: DIM }}>
          <div style={{ width: 28, height: 28, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13 }}>Loading activity...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: DIM }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No activity found</p>
          <p style={{ fontSize: 13 }}>
            {hasActiveFilters || search ? 'Try adjusting your filters or search terms.' : 'Activity will appear here as team members make changes.'}
          </p>
        </div>
      )}

      {/* Timeline */}
      {!loading && dateGroups.length > 0 && (
        <div style={{ padding: '0 16px' }}>
          {dateGroups.map((group, gi) => (
            <div key={`${group.label}-${gi}`} style={{ marginBottom: 8 }}>
              {/* Date separator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 12px' }}>
                <div style={{ height: 1, flex: 1, background: BORDER }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>{group.label}</span>
                <div style={{ height: 1, flex: 1, background: BORDER }} />
              </div>

              {group.entries.map((entry, ei) => {
                const actionMeta = getActionMeta(entry.action);
                const isExpanded = expandedIds.has(entry.id);
                const hasChanges = entry.changes && entry.changes.length > 0;

                return (
                  <div key={entry.id} style={{ display: 'flex', gap: 12, marginBottom: 2 }}>
                    {/* Timeline line */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 40, flexShrink: 0 }}>
                      {/* Avatar */}
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: entry.user_color || BLUE,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
                      }}>
                        {entry.user_initials || '??'}
                      </div>
                      {/* Connector line */}
                      {!(gi === dateGroups.length - 1 && ei === group.entries.length - 1) && (
                        <div style={{ width: 2, flex: 1, background: BORDER, minHeight: 12 }} />
                      )}
                    </div>

                    {/* Content */}
                    <div style={{ ...card, flex: 1, padding: '12px 14px', marginBottom: 8 }}>
                      {/* Top row: action icon + description */}
                      <div
                        style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: entry.url ? 'pointer' : 'default' }}
                        onClick={() => { if (entry.url) router.push(entry.url); }}
                      >
                        {/* Action icon */}
                        <div style={{
                          width: 24, height: 24, borderRadius: 6,
                          background: `rgba(${hexRgb(actionMeta.color)}, .15)`,
                          border: `1px solid rgba(${hexRgb(actionMeta.color)}, .3)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, color: actionMeta.color, flexShrink: 0,
                        }}>
                          {actionMeta.icon}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* User + action */}
                          <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                            <span style={{ fontWeight: 700, color: TEXT }}>{entry.user_name}</span>
                            <span style={{ color: DIM }}> {entry.description}</span>
                          </div>

                          {/* Module + Item ref */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                            <Tag label={moduleLabel(entry.module)} color={BLUE} />
                            {entry.item_number && (
                              <span style={{ fontSize: 12, color: GOLD, fontWeight: 600 }}>#{entry.item_number}</span>
                            )}
                            <span style={{ fontSize: 12, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {entry.item_title}
                            </span>
                          </div>

                          {/* Timestamp */}
                          <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>{relativeTime(entry.timestamp)}</div>
                        </div>
                      </div>

                      {/* Expandable changes */}
                      {hasChanges && (
                        <div style={{ marginTop: 8 }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleExpanded(entry.id); }}
                            style={{
                              background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6,
                              padding: '4px 10px', color: DIM, fontSize: 11, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600,
                            }}
                          >
                            <svg
                              width="10" height="10" fill="none" stroke={DIM} strokeWidth="2" viewBox="0 0 24 24"
                              style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .2s' }}
                            >
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                            {entry.changes!.length} field{entry.changes!.length !== 1 ? 's' : ''} changed
                          </button>
                          {isExpanded && (
                            <div style={{ marginTop: 8, padding: 10, background: '#07101C', borderRadius: 8, border: `1px solid ${BORDER}` }}>
                              {entry.changes!.map((change, ci) => (
                                <div key={ci} style={{ marginBottom: ci < entry.changes!.length - 1 ? 8 : 0 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 2, textTransform: 'capitalize' }}>
                                    {change.field.replace(/_/g, ' ')}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                                    <span style={{ color: RED, textDecoration: 'line-through', opacity: 0.7 }}>{change.old_value || '(empty)'}</span>
                                    <svg width="12" height="12" fill="none" stroke={DIM} strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                                    <span style={{ color: GREEN }}>{change.new_value || '(empty)'}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Load More */}
          {hasMore && (
            <div style={{ textAlign: 'center', padding: '16px 0 32px' }}>
              <button
                onClick={loadMore}
                disabled={loadingMore}
                style={{
                  background: `rgba(${hexRgb(GOLD)}, .1)`, border: `1px solid ${GOLD}`,
                  borderRadius: 10, padding: '12px 32px', color: GOLD, fontSize: 14,
                  fontWeight: 700, cursor: loadingMore ? 'not-allowed' : 'pointer',
                  opacity: loadingMore ? 0.5 : 1, transition: 'opacity .2s',
                }}
              >
                {loadingMore ? 'Loading...' : 'Load More Activity'}
              </button>
            </div>
          )}

          {/* End of list */}
          {!hasMore && entries.length > 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0 32px', color: DIM, fontSize: 12 }}>
              End of activity log
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Default Export with Suspense ── */

export default function FieldActivityPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}>
      <ActivityLogPage />
    </Suspense>
  );
}

/* ── Shared UI helpers ─────────────────────────────────── */

function Tag({ label, color = DIM }: { label: string; color?: string }) {
  return (
    <span style={{
      background: `rgba(${hexRgb(color)}, .12)`,
      border: `1px solid rgba(${hexRgb(color)}, .25)`,
      borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700, color,
    }}>
      {label}
    </span>
  );
}

/* ── Style constants ── */

const card: React.CSSProperties = {
  background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14,
  padding: '14px 14px 6px', marginBottom: 10,
};
const inp: React.CSSProperties = {
  width: '100%', background: '#07101C', border: `1px solid ${BORDER}`,
  borderRadius: 10, padding: '11px 14px', color: TEXT, fontSize: 15, outline: 'none',
  boxSizing: 'border-box',
};
const backBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: DIM, cursor: 'pointer',
  padding: 8, marginLeft: -8, display: 'flex', alignItems: 'center',
};
const filterLabel: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: DIM,
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
};
const selectStyle: React.CSSProperties = {
  width: '100%', background: '#0A1929', border: `1px solid ${BORDER}`,
  borderRadius: 8, padding: '8px 10px', color: TEXT, fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
};

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
