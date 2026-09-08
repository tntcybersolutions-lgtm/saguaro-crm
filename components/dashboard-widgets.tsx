'use client';
/**
 * components/dashboard-widgets.tsx
 * Single source of truth for the home-dashboard widget system.
 *
 * Consumed by BOTH surfaces:
 *   - /app/dashboard-config  (the builder — live previews)
 *   - /app                   (the home dashboard — renders the saved layout)
 *
 * Everything renders from LIVE tenant metrics (`/api/dashboard/widget-metrics`).
 * There is no mock/placeholder data — a widget with no rows shows an honest
 * empty state, never a fabricated number.
 */
import React from 'react';
import useSWR from 'swr';
import {
  ChartBar, CurrencyDollar, CalendarBlank, HardHat, Clipboard, Files,
  CloudSun, Users, Clock, Camera, ArrowsClockwise, CheckCircle, type Icon,
} from '@phosphor-icons/react';

/* ─── Palette (dark, shared) ─────────────────────────────────────────── */
export const W = {
  GOLD: '#F59E0B', BG: '#0a0a0a', RAISED: '#141416', BORDER: 'rgba(255,255,255,0.12)',
  TEXT: '#FFFFFF', DIM: '#CBD5E1', GREEN: '#22C55E', RED: '#EF4444',
  AMBER: '#F59E0B', BLUE: '#F59E0B', PURPLE: '#8B5CF6',
} as const;

/* ─── Widget settings & catalog ──────────────────────────────────────── */
export interface WidgetSettings {
  projectId?: string;
  dateRange?: 'week' | 'month' | 'quarter' | 'year';
  location?: string;
  limit?: number;
  showCompleted?: boolean;
}

export type WidgetCategory = 'project' | 'financial' | 'safety' | 'schedule' | 'general';

export interface CatalogWidget {
  id: string;
  name: string;
  description: string;
  icon: Icon;
  category: WidgetCategory;
  defaultSettings: WidgetSettings;
}

export const WIDGET_CATALOG: CatalogWidget[] = [
  { id: 'project-summary',      name: 'Project Summary',      description: 'Active, pre-con, and closeout project counts with status breakdown',   icon: ChartBar,        category: 'project',   defaultSettings: {} },
  { id: 'budget-overview',      name: 'Budget Overview',      description: 'Contract value, billed to date, approved change orders, and remaining', icon: CurrencyDollar,  category: 'financial', defaultSettings: { dateRange: 'quarter' } },
  { id: 'schedule-status',      name: 'Schedule Status',      description: 'On-track vs at-risk vs delayed tasks across your schedule',              icon: CalendarBlank,   category: 'schedule',  defaultSettings: { dateRange: 'week' } },
  { id: 'safety-metrics',       name: 'Safety Metrics',       description: 'Recordable incidents, near-misses, and days since last incident',       icon: HardHat,         category: 'safety',    defaultSettings: { dateRange: 'month' } },
  { id: 'rfi-tracker',          name: 'RFI Tracker',          description: 'Open, overdue, and closed RFIs across your projects',                    icon: Clipboard,       category: 'project',   defaultSettings: { projectId: 'all' } },
  { id: 'submittal-status',     name: 'Submittal Status',     description: 'Submittal review progress: pending, approved, and resubmit',             icon: Files,           category: 'project',   defaultSettings: { projectId: 'all' } },
  { id: 'weather',              name: 'Weather',              description: 'Conditions for a configured project location',                           icon: CloudSun,        category: 'general',   defaultSettings: { location: '' } },
  { id: 'team-activity',        name: 'Team Activity',        description: 'Recent activity feed of team member actions and updates',                icon: Users,           category: 'general',   defaultSettings: { limit: 8 } },
  { id: 'upcoming-deadlines',   name: 'Upcoming Deadlines',   description: 'Approaching due dates for submittals, RFIs, and punch items',            icon: Clock,           category: 'schedule',  defaultSettings: { dateRange: 'week' } },
  { id: 'photo-feed',           name: 'Photo Feed',           description: 'Latest site photos uploaded by field teams',                             icon: Camera,          category: 'general',   defaultSettings: { limit: 6, projectId: 'all' } },
  { id: 'change-order-summary', name: 'Change Order Summary', description: 'Pending, approved, and rejected change orders with total value',         icon: ArrowsClockwise, category: 'financial', defaultSettings: {} },
  { id: 'action-items',         name: 'Action Items',         description: 'Open action items assigned to you or your team with priority levels',    icon: CheckCircle,     category: 'project',   defaultSettings: { showCompleted: false, projectId: 'all' } },
];

export const WIDGET_BY_ID: Record<string, CatalogWidget> =
  Object.fromEntries(WIDGET_CATALOG.map(w => [w.id, w]));

/* ─── Live metrics shape (mirrors /api/dashboard/widget-metrics) ─────── */
export interface WidgetMetrics {
  'project-summary': { active: number; precon: number; closeout: number; onHold: number; total: number };
  'budget-overview': { budget: number; billed: number; changeOrders: number; remaining: number };
  'schedule-status': { onTrack: number; atRisk: number; delayed: number; total: number };
  'safety-metrics': { incidents: number; nearMisses: number; daysSafe: number | null; recordable: number };
  'rfi-tracker': { open: number; overdue: number; closed: number };
  'submittal-status': { pending: number; approved: number; rejected: number; resubmit: number };
  'change-order-summary': { pendingAmt: number; approvedAmt: number; rejectedAmt: number; pendingCount: number };
  'upcoming-deadlines': { date: string; title: string; type: string }[];
  'team-activity': { user: string; action: string; at: string }[];
  'photo-feed': { count: number; recent: { url: string; caption: string | null }[] };
  'action-items': { text: string; priority: string }[];
  'weather': { location: string | null };
}

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
};

/** Live tenant widget metrics — shared by builder previews and the home dashboard. */
export function useWidgetMetrics() {
  const { data, error, isLoading, mutate } = useSWR<{ metrics: Partial<WidgetMetrics> }>(
    '/api/dashboard/widget-metrics',
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true, dedupingInterval: 10_000 },
  );
  return { metrics: data?.metrics ?? null, loading: isLoading, error, revalidate: mutate };
}

/* ─── Saved layout (what the home dashboard renders) ─────────────────── */
export interface SavedWidgetInstance {
  id: string;
  catalogId: string;
  size: 'small' | 'medium' | 'large' | 'full-width' | string;
  settings?: WidgetSettings;
}
export interface SavedLayout {
  id?: string;
  name: string;
  columns: number;
  preset?: string | null;
  widgets: SavedWidgetInstance[];
}

/** The user's active (most-recently-saved) dashboard layout. */
export function useSavedLayout() {
  const { data, error, isLoading, mutate } = useSWR<{ layout: SavedLayout }>(
    '/api/dashboard-layout',
    fetcher,
    { revalidateOnFocus: true, dedupingInterval: 10_000 },
  );
  return { layout: data?.layout ?? null, loading: isLoading, error, revalidate: mutate };
}

function sizeToSpan(size: string, columns: number): number {
  switch (size) {
    case 'medium':     return Math.min(2, columns);
    case 'large':      return Math.min(3, columns);
    case 'full-width': return columns;
    case 'small':
    default:           return 1;
  }
}

/* ─── Formatters ─────────────────────────────────────────────────────── */
function money(n: number): string {
  const v = n || 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000)     return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}
function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function shortDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ─── Small presentational helpers ───────────────────────────────────── */
function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ color: W.DIM, fontSize: 13, textAlign: 'center', padding: '8px 0' }}>{children}</div>;
}

type Stat = { value: string; label: string; color: string };
function StatCluster({ stats }: { stats: Stat[] }) {
  return (
    <div style={{ display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap' }}>
      {stats.map((s, i) => (
        <div key={i} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: s.color, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
          <div style={{ fontSize: 11, color: W.DIM, marginTop: 2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function Bars({ rows }: { rows: { label: string; pct: number; color: string }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {rows.map((row, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: W.DIM, marginBottom: 2 }}>
            <span>{row.label}</span><span>{row.pct}%</span>
          </div>
          <div style={{ position: 'relative', height: 8, background: W.BG, borderRadius: 4 }}>
            <div style={{ position: 'absolute', height: '100%', width: `${row.pct}%`, background: row.color, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const PRIORITY_COLOR: Record<string, string> = {
  high: W.RED, urgent: W.RED, critical: W.RED, medium: W.AMBER, normal: W.AMBER, low: W.BLUE,
};

/* ─── The live widget body renderer ──────────────────────────────────── */
export function WidgetBody({
  catalogId, metrics, loading, settings,
}: {
  catalogId: string;
  metrics: Partial<WidgetMetrics> | null;
  loading: boolean;
  settings?: WidgetSettings;
}) {
  // metrics === null → still fetching. Once loaded, real objects (incl. zeros) render.
  if (!metrics) {
    return <div style={{ color: W.DIM, fontSize: 13, textAlign: 'center', padding: '8px 0', opacity: 0.7 }}>{loading ? 'Loading live data…' : 'Live data unavailable'}</div>;
  }

  switch (catalogId) {
    case 'project-summary': {
      const d = metrics['project-summary'];
      if (!d || d.total === 0) return <Muted>No projects yet</Muted>;
      const stats: Stat[] = [{ value: String(d.active), label: 'Active', color: W.GREEN }];
      if (d.precon)   stats.push({ value: String(d.precon), label: 'Pre-Con', color: W.BLUE });
      if (d.closeout) stats.push({ value: String(d.closeout), label: 'Closeout', color: W.PURPLE });
      if (d.onHold)   stats.push({ value: String(d.onHold), label: 'On Hold', color: W.AMBER });
      return <StatCluster stats={stats} />;
    }
    case 'budget-overview': {
      const d = metrics['budget-overview'];
      if (!d) return <Muted>No budget data</Muted>;
      return <StatCluster stats={[
        { value: money(d.budget),       label: 'Contract', color: W.TEXT },
        { value: money(d.billed),       label: 'Billed',   color: W.AMBER },
        { value: money(d.remaining),    label: 'Remaining', color: W.GREEN },
        { value: money(d.changeOrders), label: 'Change Orders', color: W.PURPLE },
      ]} />;
    }
    case 'schedule-status': {
      const d = metrics['schedule-status'];
      if (!d || d.total === 0) return <Muted>No scheduled tasks</Muted>;
      const pct = (n: number) => Math.round((n / d.total) * 100);
      return <Bars rows={[
        { label: 'On Track', pct: pct(d.onTrack), color: W.GREEN },
        { label: 'At Risk',  pct: pct(d.atRisk),  color: W.AMBER },
        { label: 'Delayed',  pct: pct(d.delayed), color: W.RED },
      ]} />;
    }
    case 'safety-metrics': {
      const d = metrics['safety-metrics'];
      if (!d) return <Muted>No safety data</Muted>;
      return <StatCluster stats={[
        { value: String(d.recordable), label: 'Recordable', color: d.recordable ? W.RED : W.GREEN },
        { value: String(d.nearMisses), label: 'Near Misses', color: W.AMBER },
        { value: d.daysSafe == null ? '—' : String(d.daysSafe), label: 'Days Safe', color: W.BLUE },
        { value: String(d.incidents), label: 'Total', color: W.DIM },
      ]} />;
    }
    case 'rfi-tracker': {
      const d = metrics['rfi-tracker'];
      if (!d) return <Muted>No RFIs</Muted>;
      return <StatCluster stats={[
        { value: String(d.open),    label: 'Open',    color: W.AMBER },
        { value: String(d.overdue), label: 'Overdue', color: d.overdue ? W.RED : W.DIM },
        { value: String(d.closed),  label: 'Closed',  color: W.GREEN },
      ]} />;
    }
    case 'submittal-status': {
      const d = metrics['submittal-status'];
      if (!d) return <Muted>No submittals</Muted>;
      return <StatCluster stats={[
        { value: String(d.pending),  label: 'Pending',  color: W.AMBER },
        { value: String(d.approved), label: 'Approved', color: W.GREEN },
        { value: String(d.rejected), label: 'Rejected', color: d.rejected ? W.RED : W.DIM },
        { value: String(d.resubmit), label: 'Resubmit', color: W.BLUE },
      ]} />;
    }
    case 'change-order-summary': {
      const d = metrics['change-order-summary'];
      if (!d) return <Muted>No change orders</Muted>;
      return <StatCluster stats={[
        { value: money(d.pendingAmt),  label: `Pending (${d.pendingCount})`, color: W.AMBER },
        { value: money(d.approvedAmt), label: 'Approved', color: W.GREEN },
        { value: money(d.rejectedAmt), label: 'Rejected', color: d.rejectedAmt ? W.RED : W.DIM },
      ]} />;
    }
    case 'upcoming-deadlines': {
      const rows = metrics['upcoming-deadlines'] ?? [];
      const limit = settings?.limit ?? 5;
      if (rows.length === 0) return <Muted>No upcoming deadlines</Muted>;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          {rows.slice(0, limit).map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
              <span style={{ color: W.DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ color: W.PURPLE, fontWeight: 600, marginRight: 6 }}>{r.type}</span>{r.title}
              </span>
              <span style={{ color: W.AMBER, fontWeight: 600, flexShrink: 0 }}>{shortDate(r.date)}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'team-activity': {
      const rows = metrics['team-activity'] ?? [];
      const limit = settings?.limit ?? 8;
      if (rows.length === 0) return <Muted>No recent activity</Muted>;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          {rows.slice(0, limit).map((a, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, borderLeft: `2px solid ${W.GOLD}`, paddingLeft: 8 }}>
              <span style={{ color: W.DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ color: W.TEXT, fontWeight: 600 }}>{a.user}</span> {a.action}
              </span>
              <span style={{ color: W.DIM, fontSize: 10, flexShrink: 0, marginLeft: 8 }}>{relTime(a.at)}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'photo-feed': {
      const d = metrics['photo-feed'];
      if (!d || d.count === 0) return <Muted>No photos yet</Muted>;
      const limit = settings?.limit ?? 6;
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, width: '100%' }}>
          {d.recent.slice(0, limit).map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={p.url} alt={p.caption || 'Site photo'} loading="lazy"
              style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6, border: `1px solid ${W.BORDER}`, background: W.BG }} />
          ))}
        </div>
      );
    }
    case 'action-items': {
      const rows = metrics['action-items'] ?? [];
      const limit = settings?.limit ?? 6;
      if (rows.length === 0) return <Muted>No open action items</Muted>;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
          {rows.slice(0, limit).map((it, i) => {
            const color = PRIORITY_COLOR[(it.priority || '').toLowerCase()] ?? W.BLUE;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ color: W.DIM, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.text}</span>
                {it.priority && <span style={{ color, fontSize: 10, fontWeight: 600, flexShrink: 0, textTransform: 'capitalize' }}>{it.priority}</span>}
              </div>
            );
          })}
        </div>
      );
    }
    case 'weather': {
      const loc = settings?.location || metrics['weather']?.location || '';
      return (
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
            <CloudSun size={34} color={W.AMBER} weight="duotone" />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: W.TEXT }}>{loc || 'No location set'}</div>
          <div style={{ fontSize: 11, color: W.DIM, marginTop: 4 }}>
            {loc ? 'Live conditions from the field app' : 'Configure a location in widget settings'}
          </div>
        </div>
      );
    }
    default:
      return <Muted>Preview not available</Muted>;
  }
}

/* ─── ConfiguredDashboard ────────────────────────────────────────────── */
/**
 * Renders a saved layout as a responsive grid of live-data widgets.
 * This is what makes the builder real: the home dashboard renders exactly what
 * the user configured, with live tenant metrics.
 */
export function ConfiguredDashboard({ layout }: { layout: SavedLayout }) {
  const { metrics, loading } = useWidgetMetrics();
  const columns = [2, 3, 4].includes(layout.columns) ? layout.columns : 3;
  const cls = 'saguaro-live-dash';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .${cls}{display:grid;gap:16px;grid-template-columns:repeat(${columns},minmax(0,1fr));}
        @media (max-width:1024px){.${cls}{grid-template-columns:repeat(2,minmax(0,1fr));}}
        @media (max-width:640px){.${cls}{grid-template-columns:1fr;}.${cls}>*{grid-column:span 1 !important;}}
      ` }} />
      <div className={cls}>
        {layout.widgets.map(w => {
          const meta = WIDGET_BY_ID[w.catalogId];
          if (!meta) return null;
          const Ico = meta.icon;
          const colSpan = sizeToSpan(w.size, columns);
          return (
            <div key={w.id} style={{
              gridColumn: `span ${colSpan}`, background: W.RAISED, border: `1px solid ${W.BORDER}`,
              borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: 'rgba(245,158,11,0.12)' }}>
                  <Ico size={17} weight="duotone" color={W.GOLD} />
                </span>
                <span style={{ fontWeight: 700, fontSize: 15, color: W.TEXT, letterSpacing: '-0.01em' }}>{meta.name}</span>
              </div>
              <div style={{ minHeight: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <WidgetBody catalogId={w.catalogId} metrics={metrics} loading={loading} settings={w.settings} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
