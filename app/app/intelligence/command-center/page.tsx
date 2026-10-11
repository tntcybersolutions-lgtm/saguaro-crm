'use client';
import { useRouter } from 'next/navigation';
/**
 * Saguaro — Multi-Project Command Center
 * Aggregated view of all projects with health scores, budgets, open items.
 * Sort & filter, click-through to project overview.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useProjects } from '@/lib/hooks/useProjects';
import Link from 'next/link';
import { Broadcast, Buildings, ClipboardText, Gauge, Funnel } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty } from '@/components/ui/premium';

const BASE   = 'var(--bg-base)';
const CARD   = 'var(--bg-surface)';
const GOLD   = 'var(--brand-primary)';
const GREEN  = 'var(--success)';
const RED    = 'var(--danger)';
const BORDER = 'rgba(255,255,255,0.12)';
const TEXT   = 'var(--text-primary)';
const DIM    = 'var(--text-secondary)';
const BLUE   = 'var(--brand-primary)';
const AMBER  = 'var(--warning)';

interface ProjectCard {
  id: string;
  name: string;
  type: string;
  status: string;
  percent_complete: number;
  budget_original: number;
  budget_actual: number;
  open_rfis: number;
  open_punch: number;
  open_cos: number;
  last_activity: string;
}

type SortKey = 'progress' | 'budget_variance' | 'open_items' | 'last_activity';
type StatusFilter = 'all' | 'active' | 'completed' | 'on-hold';

/* ─── Progress ring — real % complete from the project record (no fabricated fallback) ── */
function ProgressRing({ pct, size = 52 }: { pct: number; size?: number }) {
  const v = Math.max(0, Math.min(100, Math.round(pct || 0)));
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - v / 100);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          style={{ stroke: GOLD }} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: TEXT, lineHeight: 1 }}>{v}%</span>
      </div>
    </div>
  );
}

function glassCard(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015))',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    boxShadow: '0 10px 30px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
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

// Display-only: 'on_hold' → 'On Hold'. The raw value still drives filters/colors.
const titleize = (s: string) => s.replace(/[_-]/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());

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
  if (t.includes('infrastructure') || t.includes('civil')) return 'var(--warning)';
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
        background: active ? `color-mix(in srgb, ${GOLD} 9%, transparent)` : 'transparent',
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
        background: active ? `color-mix(in srgb, ${c} 8%, transparent)` : 'transparent',
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
  const [sortBy, setSortBy] = useState<SortKey>('last_activity');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { projects: liveProjects, loading } = useProjects();
  const projects = useMemo<ProjectCard[]>(() => (liveProjects as any[]).map((p: any) => ({
    id: p.id,
    name: p.name || p.project_name || 'Untitled',
    type: p.type || p.project_type || 'General',
    status: p.status || 'active',
    percent_complete: Number(p.percent_complete ?? p.percentComplete ?? 0) || 0,
    budget_original: p.budget_original ?? p.original_budget ?? p.contract_amount ?? 0,
    budget_actual: p.budget_actual ?? p.actual_cost ?? p.costs_to_date ?? 0,
    open_rfis: p.open_rfis ?? p.rfi_count ?? 0,
    open_punch: p.open_punch ?? p.punch_count ?? 0,
    open_cos: p.open_cos ?? p.co_count ?? 0,
    last_activity: p.last_activity ?? p.updated_at ?? p.last_updated ?? '',
  })), [liveProjects]);

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
      case 'progress':
        list.sort((a, b) => b.percent_complete - a.percent_complete); // most complete first
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
  const avgComplete = useMemo(() => {
    if (projects.length === 0) return 0;
    return Math.round(projects.reduce((s, p) => s + p.percent_complete, 0) / projects.length);
  }, [projects]);

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Header */}
      <ModuleHero
        eyebrow="Intelligence"
        eyebrowIcon={<Broadcast size={13} weight="fill" color={GOLD} />}
        title="Command"
        accent="Center"
        subtitle="Health, budget, and open items across the portfolio."
      />

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard
          icon={<Buildings size={19} weight="duotone" color={GOLD} />}
          label="Projects"
          value={String(projects.length)}
          sub={`${filtered.length} shown`}
          accent={GOLD}
          delay={0.02}
         href="/app/intelligence/command-center"/>
        <StatCard
          icon={<ClipboardText size={19} weight="duotone" color="var(--warning)" />}
          label="Open Items"
          value={String(totalOpen)}
          sub="RFIs · Punch · COs"
          accent={totalOpen > 0 ? 'var(--warning)' : undefined}
          delay={0.06}
         href="/app/intelligence/command-center"/>
        <StatCard
          icon={<Gauge size={19} weight="duotone" color={GREEN} />}
          label="Avg Complete"
          value={`${avgComplete}%`}
          sub="Across portfolio"
          accent={GREEN}
          delay={0.10}
         href="/app/intelligence/command-center"/>
      </div>

      {/* Sort + Filter controls */}
      <SectionCard title="Sort & Filter" icon={<Funnel size={17} weight="duotone" color={GOLD} />} style={{ marginBottom: 24 }}>
        {/* Sort controls */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 8 }}>Sort By</div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            <SortButton active={sortBy === 'progress'} label="Progress" onClick={() => setSortBy('progress')} />
            <SortButton active={sortBy === 'budget_variance'} label="Budget Variance" onClick={() => setSortBy('budget_variance')} />
            <SortButton active={sortBy === 'open_items'} label="Open Items" onClick={() => setSortBy('open_items')} />
            <SortButton active={sortBy === 'last_activity'} label="Last Activity" onClick={() => setSortBy('last_activity')} />
          </div>
        </div>

        {/* Filter controls */}
        <div>
          <div style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 8 }}>Filter</div>
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
      </SectionCard>

      {/* Projects — loading / empty / grid */}
      <SectionCard
        title="Projects"
        subtitle={loading ? undefined : `${sorted.length} shown`}
        icon={<Buildings size={17} weight="duotone" color={GOLD} />}
      >
        {/* Loading */}
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ ...glassCard(), height: 140, opacity: 0.5 }}>
                <div style={{ width: '50%', height: 14, background: `${DIM}22`, borderRadius: 6, marginBottom: 10 }} />
                <div style={{ width: '70%', height: 10, background: `${DIM}15`, borderRadius: 4, marginBottom: 6 }} />
                <div style={{ width: '40%', height: 10, background: `${DIM}11`, borderRadius: 4 }} />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && sorted.length === 0 && (
          <PremiumEmpty
            icon={<Buildings size={30} weight="duotone" color={GOLD} />}
            title="No projects match your filters"
            description="Adjust the sort or filter controls above to see your projects."
          />
        )}

        {/* Project grid */}
        {!loading && sorted.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {sorted.map((project) => {
              const variance = getBudgetVariance(project.budget_original, project.budget_actual);
              const openTotal = project.open_rfis + project.open_punch + project.open_cos;
              const statusColor = getStatusColor(project.status);
              const typeColor = getTypeColor(project.type);

              return (
                <Link
                  key={project.id}
                  href={`/app/projects/${project.id}`}
                  className="pmHover"
                  style={{
                    ...glassCard({ cursor: 'pointer', textAlign: 'left' }),
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    textDecoration: 'none',
                    color: 'inherit',
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
                        fontSize: 9, fontWeight: 700,
                        color: typeColor, background: `color-mix(in srgb, ${typeColor} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${typeColor} 20%, transparent)`,
                        borderRadius: 4, padding: '2px 6px',
                      }}>
                        {titleize(project.type)}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 700,
                        color: statusColor, background: `color-mix(in srgb, ${statusColor} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${statusColor} 20%, transparent)`,
                        borderRadius: 4, padding: '2px 6px',
                      }}>
                        {titleize(project.status)}
                      </span>
                    </div>
                  </div>
                  <ProgressRing pct={project.percent_complete} size={52} />
                </div>

                {/* Budget row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 10, color: DIM, fontWeight: 600, marginBottom: 2 }}>Budget</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{formatCurrency(project.budget_original)}</span>
                      <span style={{ fontSize: 11, color: DIM }}>vs</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: variance.color }}>{formatCurrency(project.budget_actual)}</span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 13, fontWeight: 800, color: variance.color,
                    background: `color-mix(in srgb, ${variance.color} 8%, transparent)`, padding: '3px 8px', borderRadius: 6,
                  }}>
                    {variance.label}
                  </span>
                </div>

                {/* Bottom row: open items + last activity */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <OpenItemPill label="RFIs" count={project.open_rfis} color="var(--warning)" />
                    <OpenItemPill label="Punch" count={project.open_punch} color="var(--warning)" />
                    <OpenItemPill label="COs" count={project.open_cos} color={BLUE} />
                  </div>
                  <span style={{ fontSize: 11, color: DIM }}>{formatDate(project.last_activity)}</span>
                </div>
              </Link>
            );
          })}
          </div>
        )}
      </SectionCard>
    </PremiumSurface>
  );
}

/* ─── Open Item Pill ────────────────────────────────────────────── */
function OpenItemPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: count > 0 ? `color-mix(in srgb, ${color} 13%, transparent)` : `${DIM}11`,
        fontSize: 10, fontWeight: 800, color: count > 0 ? color : DIM,
      }}>
        {count}
      </span>
      <span style={{ fontSize: 10, color: DIM }}>{label}</span>
    </div>
  );
}
