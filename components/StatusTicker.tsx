'use client';
/**
 * StatusTicker — new items scrolling across the top, color-coded by status.
 *
 * The owner's mandate: when a salesperson or employee adds anything to the
 * system, the GC should see it scroll past and read its status by COLOUR — red
 * overdue, blue leads, yellow under contract, green ongoing, orange completed,
 * grey closed (lib/status-colors, the one source of truth). It polls the live
 * company activity feed every 60s, so new items appear on their own.
 *
 * Honest by construction: renders NOTHING while loading, on error, or when
 * there is no activity — no filler.
 */
import React, { useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { statusKindForItem, STATUS_COLORS, type StatusKind } from '@/lib/status-colors';

interface ActivityRow {
  id: string;
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  user_name: string | null;
  project_id: string | null;
  project_name: string | null;
  project_status: string | null;
  created_at: string;
}

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
};

const OVERDUE_RE = /overdue|past due|late|expired|missing|delinquent|rejected|failed/i;
const LEAD_RE = /lead|deal|opportunity|prospect|pipeline/i;

function kindFor(a: ActivityRow): StatusKind {
  const text = `${a.action ?? ''} ${a.entity_type ?? ''} ${a.description ?? ''}`;
  const overdue = OVERDUE_RE.test(text);
  const type = LEAD_RE.test(`${a.entity_type ?? ''} ${a.action ?? ''}`) ? 'lead' : (a.entity_type ?? '');
  return statusKindForItem({ type, status: a.project_status, overdue });
}

function hrefFor(a: ActivityRow): string {
  if (a.project_id) return `/app/projects/${a.project_id}`;
  if (LEAD_RE.test(`${a.entity_type ?? ''}`)) return '/app/leads';
  return '/app/my-work';
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

const TICKER_FX = `
@keyframes stTickerScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes stTickerDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.3)}}
.stTickerTrack{display:inline-flex;align-items:center;will-change:transform}
.stTickerViewport:hover .stTickerTrack{animation-play-state:paused}
.stTickerItem{transition:background .15s ease,border-color .15s ease}
.stTickerItem:hover{background:rgba(255,255,255,0.08)}
@media (prefers-reduced-motion: reduce){
  .stTickerTrack{animation:none}
  .stTickerViewport{overflow-x:auto}
  .stTickerDup{display:none}
}
`;

function TickerItem({ a, ghost = false }: { a: ActivityRow; ghost?: boolean }) {
  const kind = kindFor(a);
  const st = STATUS_COLORS[kind];
  const label = (a.description || a.action || a.entity_type || 'Update').toString();
  return (
    <Link
      href={hrefFor(a)}
      className="stTickerItem"
      tabIndex={ghost ? -1 : undefined}
      aria-hidden={ghost || undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 9, flexShrink: 0,
        margin: '0 5px', padding: '6px 13px', borderRadius: 999,
        background: st.bg, border: `1px solid ${st.border}`,
        textDecoration: 'none', whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, background: st.color, boxShadow: `0 0 8px ${st.color}` }} />
      <span style={{ fontSize: 9.5, fontWeight: 900, color: st.color, flexShrink: 0 }}>
        {st.label}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-2)' }}>{label}</span>
      {a.project_name && <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)' }}>· {a.project_name}</span>}
      <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>· {timeAgo(a.created_at)}</span>
    </Link>
  );
}

export default function StatusTicker({ style }: { style?: React.CSSProperties }) {
  const { data } = useSWR<{ activities: ActivityRow[] }>('/api/activity?limit=30', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
    refreshInterval: 60_000,
  });

  const items = useMemo(() => (Array.isArray(data?.activities) ? data!.activities : []), [data]);
  if (items.length === 0) return null;

  const duration = Math.max(30, items.length * 6);

  return (
    <div
      role="region"
      aria-label={`${items.length} recent items`}
      style={{
        position: 'relative', display: 'flex', alignItems: 'stretch',
        background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        ...style,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: TICKER_FX }} />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        padding: '10px 16px', borderRight: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(20,20,22,0.6)', position: 'relative', zIndex: 1,
      }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--success)', boxShadow: '0 0 10px #2CFF7A', animation: 'stTickerDot 2s ease-in-out infinite' }} />
        <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>
          New Activity
        </span>
      </div>
      <div className="stTickerViewport" style={{ overflow: 'hidden', flex: 1, display: 'flex', alignItems: 'center' }}>
        <div className="stTickerTrack" style={{ animation: `stTickerScroll ${duration}s linear infinite`, padding: '7px 0' }}>
          {items.map((a) => <TickerItem key={a.id} a={a} />)}
          <span aria-hidden className="stTickerDup" style={{ display: 'inline-flex' }}>
            {items.map((a) => <TickerItem key={`dup-${a.id}`} a={a} ghost />)}
          </span>
        </div>
      </div>
    </div>
  );
}
