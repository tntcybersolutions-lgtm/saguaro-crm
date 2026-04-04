'use client';
/**
 * Saguaro — Multi-Project Command Center
 * Aggregated view of all projects with health scores, budgets, open items.
 * Sort & filter, click-through to project overview.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import HealthScoreRing from '@/components/field/HealthScoreRing';

const BASE   = '#F8F9FB';
const CARD   = '#F8F9FB';
const GOLD   = '#C8960F';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const BORDER = '#2A3144';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const BLUE   = '#3B82F6';
const AMBER  = '#F59E0B';

interface ProjectCard {
  id: string;
  name: string;
  type: string;
  status: string;
  health_score: number;
  budget_original: number;
  budget_actual: number;
  open_rfis: number;
  open_punch: number;
  open_cos: number;
  last_activity: string;
}

type SortKey = 'health' | 'budget_variance' | 'open_items' | 'last_activity';
type StatusFilter = 'all' | 'active' | 'completed' | 'on-hold';

function glassCard(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: `${CARD}cc`,
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: `1px solid ${BORDER}`,
    borderRadius: 14,
    padding: 16,
    ...extra,
  };
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatDate(d: string): string {
  if (!d) return '--';
  const date = new Date(d);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'active' || s === 'in_progress' || s === 'in progress') return GREEN;
  if (s === 'completed' || s === 'complete') return BLUE;
  if (s === 'on-hold' || s === 'on_hold' || s === 'paused') return AMBER;
  return DIM;
}

function getTypeColor(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('commercial')) return BLUE;
  if (t.includes('residential')) return GREEN;
  if (t.includes('industrial')) return AMBER;
  if (t.includes('infrastructure') || t.includes('civil')) return '#8B5CF6';
  return GOLD;
}

function getBudgetVariance(original: number, actual: number): { pct: number; color: string; label: string } {
  if (original === 0) return { pct: 0, color: DIM, label: '0%' };
  const pct = ((actual - original) / original) * 100;
  const color = pct > 5 ? RED : pct > 0 ? AMBER : GREEN;
  const sign = pct > 0 ? '+' : '';
  return { pct, color, label: `${sign}${pct.toFixed(1)}%` };
}

/* ─── Sort/Filter Controls ──────────────────────────────────────── */
function SortButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 8,
        border: `1px solid ${active ? GOLD : BORDER}`,
        background: active ? `${GOLD}18` : 'transparent',
        color: active ? GOLD : DIM,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function FilterPill({ active, label, onClick, color }: { active: boolean; label: string; onClick: () => void; color?: string }) {
  const c = color || DIM;
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 10px',
        borderRadius: 20,
        border: `1px solid ${active ? c : BORDER}`,
        background: active ? `${c}15` : 'transparent',
        color: active ? c : DIM,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

/* ─── Main Component ────────────────────────────────────────────── */
export default function CommandCenterPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>('health');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const tenantId = typeof window !== 'undefined' ? localStorage.getItem('saguaro_tenant_id') || '' : '';

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/list?tenantId=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.projects || [];
        setProjects(list.map((p: any) => ({
          id: p.id,
          name: p.name || p.project_name || 'Untitled',
          type: p.type || p.project_type || 'General',
          status: p.status || 'active',
          health_score: p.health_score ?? p.healthScore ?? 75,
          budget_original: p.budget_original ?? p.original_budget ?? p.contract_amount ?? 0,
          budget_actual: p.budget_actual ?? p.actual_cost ?? p.costs_to_date ?? 0,
          open_rfis: p.open_rfis ?? p.rfi_count ?? 0,
          open_punch: p.open_punch ?? p.punch_count ?? 0,
          open_cos: p.open_cos ?? p.co_count ?? 0,
          last_activity: p.last_activity ?? p.updated_at ?? p.last_updated ?? '',
        })));
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  // Unique types for filter
  const projectTypes = useMemo(() => {
    const types = [...new Set(projects.map((p) => p.type))];
    return types.filter(Boolean);
  }, [projects]);

  // Filter
  const filtered = useMemo(() => {
    let list = [...projects];
    if (statusFilter !== 'all') {
      list = list.filter((p) => {
        const s = p.status.toLowerCase().replace(/[_\s]/g, '-');
        return s === statusFilter || s.startsWith(statusFilter);
      });
    }
    if (typeFilter !== 'all') {
      list = list.filter((p) => p.type === typeFilter);
    }
    return list;
  }, [projects, statusFilter, typeFilter]);

  // Sort
  const sorted = useMemo(() => {
    const list = [...filtered];
    switch (sortBy) {
      case 'health':
        list.sort((a, b) => a.health_score - b.health_score); // lowest first (needs attention)
        break;
      case 'budget_variance': {
        const variance = (p: ProjectCard) => p.budget_original ? ((p.budget_actual - p.budget_original) / p.budget_original) : 0;
        list.sort((a, b) => variance(b) - variance(a)); // highest variance first
        break;
      }
      case 'open_items':
        list.sort((a, b) => (b.open_rfis + b.open_punch + b.open_cos) - (a.open_rfis + a.open_punch + a.open_cos));
        break;
      case 'last_activity':
        list.sort((a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime());
        break;
    }
    return list;
  }, [filtered, sortBy]);

  // Summary stats
  const totalOpen = useMemo(() => projects.reduce((s, p) => s + p.open_rfis + p.open_punch + p.open_cos, 0), [projects]);
  const avgHealth = useMemo(() => {
    if (projects.length === 0) return 0;
    return Math.round(projects.reduce((s, p) => s + p.health_score, 0) / projects.length);
  }, [projects]);

  return (
    <div style={{ minHeight: '100vh', background: BASE, padding: '20px 16px 100px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: TEXT }}>Command Center</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: DIM }}>
          {projects.length} project{projects.length !== 1 ? 's' : ''} &middot; {totalOpen} open items &middot; Avg health: {avgHealth}
        </p>
      </div>

      {/* Sort controls */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sort by</div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          <SortButton active={sortBy === 'health'} label="Health Score" onClick={() => setSortBy('health')} />
          <SortButton active={sortBy === 'budget_variance'} label="Budget Variance" onClick={() => setSortBy('budget_variance')} />
          <SortButton active={sortBy === 'open_items'} label="Open Items" onClick={() => setSortBy('open_items')} />
          <SortButton active={sortBy === 'last_activity'} label="Last Activity" onClick={() => setSortBy('last_activity')} />
        </div>
      </div>

      {/* Filter controls */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Filter</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <FilterPill active={statusFilter === 'all'} label="All" onClick={() => setStatusFilter('all')} />
          <FilterPill active={statusFilter === 'active'} label="Active" onClick={() => setStatusFilter('active')} color={GREEN} />
          <FilterPill active={statusFilter === 'completed'} label="Completed" onClick={() => setStatusFilter('completed')} color={BLUE} />
          <FilterPill active={statusFilter === 'on-hold'} label="On Hold" onClick={() => setStatusFilter('on-hold')} color={AMBER} />
          {projectTypes.length > 1 && (
            <>
              <span style={{ width: 1, height: 20, background: BORDER, alignSelf: 'center', margin: '0 4px' }} />
              {typeFilter !== 'all' && (
                <FilterPill active label={typeFilter} onClick={() => setTypeFilter('all')} color={getTypeColor(typeFilter)} />
              )}
              {typeFilter === 'all' && projectTypes.map((t) => (
                <FilterPill key={t} active={false} label={t} onClick={() => setTypeFilter(t)} color={getTypeColor(t)} />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ ...glassCard(), height: 140, opacity: 0.5 }}>
              <div style={{ width: '50%', height: 14, background: `${DIM}22`, borderRadius: 6, marginBottom: 10 }} />
              <div style={{ width: '70%', height: 10, background: `${DIM}15`, borderRadius: 4, marginBottom: 6 }} />
              <div style={{ width: '40%', height: 10, background: `${DIM}11`, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      )}

      {/* Project grid */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {sorted.length === 0 && (
            <div style={{ ...glassCard(), textAlign: 'center', padding: 40, gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              </div>
              <p style={{ color: DIM, fontSize: 14, margin: 0 }}>No projects match your filters.</p>
            </div>
          )}

          {sorted.map((project) => {
            const variance = getBudgetVariance(project.budget_original, project.budget_actual);
            const openTotal = project.open_rfis + project.open_punch + project.open_cos;
            const statusColor = getStatusColor(project.status);
            const typeColor = getTypeColor(project.type);

            return (
              <button
                key={project.id}
                onClick={() => router.push(`/app/projects/${project.id}`)}
                style={{
                  ...glassCard({ cursor: 'pointer', textAlign: 'left', transition: 'transform 0.15s, border-color 0.15s' }),
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {/* Top row: name + badges */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {project.name}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                        color: typeColor, background: `${typeColor}15`, border: `1px solid ${typeColor}33`,
                        borderRadius: 4, padding: '2px 6px',
                      }}>
                        {project.type}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                        color: statusColor, background: `${statusColor}15`, border: `1px solid ${statusColor}33`,
                        borderRadius: 4, padding: '2px 6px',
                      }}>
                        {project.status}
                      </span>
                    </div>
                  </div>
                  <HealthScoreRing score={project.health_score} size={52} />
                </div>

                {/* Budget row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 10, color: DIM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Budget</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{formatCurrency(project.budget_original)}</span>
                      <span style={{ fontSize: 11, color: DIM }}>vs</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: variance.color }}>{formatCurrency(project.budget_actual)}</span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 13, fontWeight: 800, color: variance.color,
                    background: `${variance.color}15`, padding: '3px 8px', borderRadius: 6,
                  }}>
                    {variance.label}
                  </span>
                </div>

                {/* Bottom row: open items + last activity */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <OpenItemPill label="RFIs" count={project.open_rfis} color="#F97316" />
                    <OpenItemPill label="Punch" count={project.open_punch} color="#8B5CF6" />
                    <OpenItemPill label="COs" count={project.open_cos} color={BLUE} />
                  </div>
                  <span style={{ fontSize: 11, color: DIM }}>{formatDate(project.last_activity)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Open Item Pill ────────────────────────────────────────────── */
function OpenItemPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: count > 0 ? `${color}22` : `${DIM}11`,
        fontSize: 10, fontWeight: 800, color: count > 0 ? color : DIM,
      }}>
        {count}
      </span>
      <span style={{ fontSize: 10, color: DIM }}>{label}</span>
    </div>
  );
}
