'use client';
/**
 * Saguaro Field — Favorites & Recents
 * Pinned items and recently viewed items across all project modules.
 */
import React, { useState, useEffect, useCallback, Suspense } from 'react';
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

/* ── Types ─────────────────────────────────────────────── */

interface FavoriteItem {
  id: string;
  module: string;
  title: string;
  number?: string;
  status: string;
  date: string;
  pinned_at: string;
  url: string;
}

interface RecentItem {
  id: string;
  module: string;
  title: string;
  number?: string;
  status: string;
  viewed_at: string;
  url: string;
  view_count: number;
}

type Tab = 'favorites' | 'recents';

/* ── Module metadata ───────────────────────────────────── */

const MODULE_META: Record<string, { icon: string; color: string; label: string }> = {
  rfi:           { icon: '❓', color: BLUE,  label: 'RFIs' },
  punch:         { icon: '🔨', color: AMBER, label: 'Punch List' },
  change_order:  { icon: '📝', color: GOLD,  label: 'Change Orders' },
  submittal:     { icon: '📋', color: '#8B5CF6', label: 'Submittals' },
  inspection:    { icon: '🔍', color: GREEN, label: 'Inspections' },
  daily_log:     { icon: '📓', color: DIM,   label: 'Daily Logs' },
  drawing:       { icon: '📐', color: '#06B6D4', label: 'Drawings' },
  photo:         { icon: '📸', color: '#EC4899', label: 'Photos' },
  safety:        { icon: '⚠️', color: RED,   label: 'Safety' },
  document:      { icon: '📄', color: DIM,   label: 'Documents' },
  schedule:      { icon: '📅', color: BLUE,  label: 'Schedule' },
  equipment:     { icon: '🚜', color: AMBER, label: 'Equipment' },
  correspondence:{ icon: '✉️', color: '#8B5CF6', label: 'Correspondence' },
  meeting:       { icon: '🤝', color: GREEN, label: 'Meetings' },
};

function getModuleMeta(mod: string) {
  return MODULE_META[mod] || { icon: '📌', color: DIM, label: mod };
}

const STATUS_COLORS: Record<string, string> = {
  open: RED, pending: AMBER, in_progress: AMBER, resolved: GREEN,
  closed: GREEN, complete: GREEN, approved: GREEN, rejected: RED,
  draft: DIM, overdue: RED, answered: GREEN, ready_to_inspect: BLUE,
};

function statusColor(s: string): string {
  return STATUS_COLORS[s?.toLowerCase()] || DIM;
}

function statusLabel(s: string): string {
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* ── LocalStorage helpers ──────────────────────────────── */

const LS_FAV_KEY = (pid: string) => `saguaro_favorites_${pid}`;
const LS_REC_KEY = (pid: string) => `saguaro_recents_${pid}`;
const MAX_RECENTS = 50;

function loadFavoritesLocal(pid: string): FavoriteItem[] {
  try { return JSON.parse(localStorage.getItem(LS_FAV_KEY(pid)) || '[]'); } catch { return []; }
}
function saveFavoritesLocal(pid: string, items: FavoriteItem[]) {
  try { localStorage.setItem(LS_FAV_KEY(pid), JSON.stringify(items)); } catch { /* quota */ }
}
function loadRecentsLocal(pid: string): RecentItem[] {
  try { return JSON.parse(localStorage.getItem(LS_REC_KEY(pid)) || '[]'); } catch { return []; }
}
function saveRecentsLocal(pid: string, items: RecentItem[]) {
  try { localStorage.setItem(LS_REC_KEY(pid), JSON.stringify(items.slice(0, MAX_RECENTS))); } catch { /* quota */ }
}

/* ── Time helpers ──────────────────────────────────────── */

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function groupByTimeframe(items: RecentItem[]): { label: string; items: RecentItem[] }[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 6 * 86400000;

  const groups: { label: string; items: RecentItem[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'This Week', items: [] },
    { label: 'Earlier', items: [] },
  ];

  items.forEach(item => {
    const t = new Date(item.viewed_at).getTime();
    if (t >= todayStart) groups[0].items.push(item);
    else if (t >= yesterdayStart) groups[1].items.push(item);
    else if (t >= weekStart) groups[2].items.push(item);
    else groups[3].items.push(item);
  });

  return groups.filter(g => g.items.length > 0);
}

/* ── Main Component ────────────────────────────────────── */

function FavoritesRecentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [tab, setTab] = useState<Tab>('favorites');
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  /* ── Fetch favorites from API + localStorage merge ── */
  const fetchFavorites = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const local = loadFavoritesLocal(projectId);
    setFavorites(local);
    try {
      const res = await fetch(`/api/projects/${projectId}/favorites`);
      if (res.ok) {
        const data: FavoriteItem[] = await res.json();
        // Merge: API is source of truth, but keep any local-only items
        const apiIds = new Set(data.map(i => i.id));
        const merged = [...data, ...local.filter(l => !apiIds.has(l.id))];
        setFavorites(merged);
        saveFavoritesLocal(projectId, merged);
      }
    } catch {
      // Offline — use local
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadRecents = useCallback(() => {
    if (!projectId) return;
    const local = loadRecentsLocal(projectId);
    setRecents(local);
  }, [projectId]);

  useEffect(() => {
    fetchFavorites();
    loadRecents();
  }, [fetchFavorites, loadRecents]);

  /* ── Toggle favorite (pin/unpin) ── */
  const toggleFavorite = useCallback(async (item: FavoriteItem) => {
    if (!projectId) return;
    const exists = favorites.find(f => f.id === item.id && f.module === item.module);
    if (exists) {
      // Remove
      setRemoving(item.id);
      const updated = favorites.filter(f => !(f.id === item.id && f.module === item.module));
      setFavorites(updated);
      saveFavoritesLocal(projectId, updated);
      try {
        await fetch(`/api/projects/${projectId}/favorites`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, module: item.module }),
        });
      } catch { /* offline — local already updated */ }
      setRemoving(null);
    } else {
      // Add
      const newFav: FavoriteItem = { ...item, pinned_at: new Date().toISOString() };
      const updated = [newFav, ...favorites];
      setFavorites(updated);
      saveFavoritesLocal(projectId, updated);
      try {
        await fetch(`/api/projects/${projectId}/favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newFav),
        });
      } catch { /* offline */ }
    }
  }, [projectId, favorites]);

  /* ── Remove from favorites ── */
  const removeFavorite = useCallback(async (item: FavoriteItem) => {
    if (!projectId) return;
    setRemoving(item.id);
    const updated = favorites.filter(f => !(f.id === item.id && f.module === item.module));
    setFavorites(updated);
    saveFavoritesLocal(projectId, updated);
    try {
      await fetch(`/api/projects/${projectId}/favorites`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, module: item.module }),
      });
    } catch { /* offline */ }
    setRemoving(null);
  }, [projectId, favorites]);

  /* ── Clear recents ── */
  const clearRecents = useCallback(() => {
    if (!projectId) return;
    setRecents([]);
    saveRecentsLocal(projectId, []);
  }, [projectId]);

  /* ── Navigate to item ── */
  const navigateTo = useCallback((item: { url: string; module: string; id: string; title: string; number?: string; status: string }) => {
    // Record in recents
    if (projectId) {
      const existing = loadRecentsLocal(projectId);
      const idx = existing.findIndex(r => r.id === item.id && r.module === item.module);
      const viewCount = idx >= 0 ? (existing[idx].view_count || 0) + 1 : 1;
      const updated: RecentItem[] = [
        { id: item.id, module: item.module, title: item.title, number: item.number, status: item.status, viewed_at: new Date().toISOString(), url: item.url, view_count: viewCount },
        ...existing.filter(r => !(r.id === item.id && r.module === item.module)),
      ].slice(0, MAX_RECENTS);
      saveRecentsLocal(projectId, updated);
      setRecents(updated);
    }
    router.push(item.url);
  }, [projectId, router]);

  /* ── Computed: frequently accessed (top 5 by view_count) ── */
  const frequentItems = recents
    .slice()
    .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
    .slice(0, 5);

  /* ── Computed: grouped favorites by module ── */
  const filteredFavorites = favorites.filter(f =>
    !search || f.title.toLowerCase().includes(search.toLowerCase()) || f.module.toLowerCase().includes(search.toLowerCase())
  );
  const groupedFavorites: { module: string; items: FavoriteItem[] }[] = [];
  const moduleOrder: string[] = [];
  filteredFavorites.forEach(f => {
    if (!moduleOrder.includes(f.module)) moduleOrder.push(f.module);
  });
  moduleOrder.forEach(mod => {
    groupedFavorites.push({ module: mod, items: filteredFavorites.filter(f => f.module === mod) });
  });

  /* ── Computed: filtered recents ── */
  const filteredRecents = recents.filter(r =>
    !search || r.title.toLowerCase().includes(search.toLowerCase()) || r.module.toLowerCase().includes(search.toLowerCase())
  );
  const timeGroups = groupByTimeframe(filteredRecents);

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
      <div style={{ background: RAISED, borderBottom: `1px solid ${BORDER}`, padding: '16px 16px 0', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <button onClick={() => router.back()} style={backBtn} aria-label="Go back">
            <svg width="20" height="20" fill="none" stroke={DIM} strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: 0, flex: 1, textAlign: 'center' }}>
            {tab === 'favorites' ? 'Favorites' : 'Recents'}
          </h1>
          {tab === 'recents' && recents.length > 0 && (
            <button onClick={clearRecents} style={{ background: 'none', border: 'none', color: RED, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 8px' }}>
              Clear
            </button>
          )}
          {tab === 'favorites' && <div style={{ width: 44 }} />}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0 }}>
          {(['favorites', 'recents'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setSearch(''); }}
              style={{
                flex: 1, padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer',
                color: tab === t ? GOLD : DIM, fontSize: 14, fontWeight: 700,
                borderBottom: tab === t ? `2px solid ${GOLD}` : '2px solid transparent',
                transition: 'all .2s',
              }}
            >
              {t === 'favorites' ? '★ Favorites' : '🕐 Recents'}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ position: 'relative' }}>
          <svg width="16" height="16" fill="none" stroke={DIM} strokeWidth="2" viewBox="0 0 24 24" style={{ position: 'absolute', left: 12, top: 12 }}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder={`Search ${tab}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inp, paddingLeft: 36 }}
          />
        </div>
      </div>

      {/* Quick Access — top 5 most frequently viewed */}
      {frequentItems.length > 0 && !search && (
        <div style={{ padding: '16px 16px 0' }}>
          <p style={secLbl}>Quick Access</p>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {frequentItems.map(item => {
              const meta = getModuleMeta(item.module);
              return (
                <button
                  key={`qa-${item.id}-${item.module}`}
                  onClick={() => navigateTo(item)}
                  style={{
                    ...card, minWidth: 130, maxWidth: 160, padding: '10px 12px', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 auto',
                  }}
                >
                  <span style={{ fontSize: 18 }}>{meta.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'left' }}>
                    {item.number ? `#${item.number}` : ''} {item.title}
                  </span>
                  <span style={{ fontSize: 11, color: DIM }}>{meta.label}</span>
                  <span style={{ fontSize: 10, color: DIM }}>{item.view_count} views</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: 32, textAlign: 'center', color: DIM }}>
          <div style={{ width: 28, height: 28, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13 }}>Loading...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* ── Favorites Tab ── */}
      {!loading && tab === 'favorites' && (
        <div style={{ padding: '12px 16px' }}>
          {groupedFavorites.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: DIM }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⭐</div>
              <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No favorites yet</p>
              <p style={{ fontSize: 13 }}>Star items from any module to pin them here for quick access.</p>
            </div>
          ) : (
            groupedFavorites.map(group => {
              const meta = getModuleMeta(group.module);
              return (
                <div key={group.module} style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 16 }}>{meta.icon}</span>
                    <p style={{ ...secLbl, margin: 0 }}>{meta.label}</p>
                    <span style={{ fontSize: 11, color: DIM, marginLeft: 'auto' }}>{group.items.length}</span>
                  </div>
                  {group.items.map(item => (
                    <div
                      key={`${item.id}-${item.module}`}
                      style={{ ...card, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', opacity: removing === item.id ? 0.4 : 1, transition: 'opacity .2s' }}
                    >
                      <div style={{ flex: 1 }} onClick={() => navigateTo({ ...item, url: item.url })}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>
                            {item.number ? `#${item.number} — ` : ''}{item.title}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Tag label={statusLabel(item.status)} color={statusColor(item.status)} />
                          <span style={{ fontSize: 11, color: DIM }}>{formatDate(item.date)}</span>
                        </div>
                      </div>
                      {/* Unpin button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFavorite(item); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}
                        aria-label="Remove from favorites"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill={GOLD} stroke={GOLD} strokeWidth="1">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Recents Tab ── */}
      {!loading && tab === 'recents' && (
        <div style={{ padding: '12px 16px' }}>
          {timeGroups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: DIM }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🕐</div>
              <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No recent activity</p>
              <p style={{ fontSize: 13 }}>Items you view across modules will appear here.</p>
            </div>
          ) : (
            timeGroups.map(group => (
              <div key={group.label} style={{ marginBottom: 20 }}>
                <p style={secLbl}>{group.label}</p>
                {group.items.map(item => {
                  const meta = getModuleMeta(item.module);
                  return (
                    <div
                      key={`${item.id}-${item.module}-${item.viewed_at}`}
                      onClick={() => navigateTo(item)}
                      style={{ ...card, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: `rgba(${hexRgb(meta.color)}, .12)`, border: `1px solid rgba(${hexRgb(meta.color)}, .25)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                        {meta.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.number ? `#${item.number} — ` : ''}{item.title}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                          <Tag label={statusLabel(item.status)} color={statusColor(item.status)} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ fontSize: 11, color: DIM }}>{relativeTime(item.viewed_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ── Default Export with Suspense ── */

export default function FieldFavoritesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}>
      <FavoritesRecentsPage />
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
const secLbl: React.CSSProperties = {
  margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM,
  textTransform: 'uppercase', letterSpacing: 0.8,
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

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
