'use client';

/**
 * components/charts/shared — the common language for the financial chart kit.
 *
 * Every chart in this folder draws its colors, card chrome, number formatting
 * and tooltip from here so the set reads as ONE system and matches the premium
 * surface (components/ui/premium.tsx): the same gold (var(--brand-primary) brand) / blue
 * (#3B82F6 sales) accents, the same milled-plate card, tabular-nums, uppercase
 * micro-labels, and the readability tokens from globals.css (--text-*,
 * --brand-primary, --bg-surface, --border-*). Colors resolve through the CSS
 * variables so white-label re-themes and the app's readability pass carry
 * straight through to the charts.
 *
 * Presentational only — no fetching, no routing, no app state.
 */

import React from 'react';

// ─── Color tokens (resolve through globals.css :root, with safe fallbacks) ──
export const CHART = {
  gold: 'var(--brand-primary)',
  goldStrong: 'var(--brand-primary-strong)',
  blue: '#3B82F6',
  blueStrong: '#60A5FA',
  green: 'var(--success, #22C55E)',
  red: 'var(--danger, #EF4444)',
  textPrimary: 'var(--text-primary, #FFFFFF)',
  textSecondary: 'var(--text-secondary, #CBD5E1)',
  textTertiary: 'var(--text-tertiary, #8094B0)',
  border: 'var(--border-subtle, rgba(255,255,255,0.06))',
  borderDefault: 'var(--border-default, rgba(255,255,255,0.12))',
  surface: 'var(--bg-surface, #141416)',
  surfaceRaised: 'var(--bg-surface-2, #1c1c1e)',
} as const;

/** The two money/sales accents. Charts are prop-driven between them. */
export type ChartAccent = 'gold' | 'blue';

export interface AccentPair {
  /** Primary stroke / strong stop. */
  main: string;
  /** Brighter highlight stop. */
  bright: string;
}

export function accentColors(accent: ChartAccent): AccentPair {
  return accent === 'blue'
    ? { main: CHART.blue, bright: CHART.blueStrong }
    : { main: CHART.gold, bright: CHART.goldStrong };
}

/** Categorical palette for ratio breakdowns (stage mix, project type, …).
 *  Ordered gold → blue → green → violet → cyan → orange → pink → slate, so a
 *  money chart leads with the brand hue and never collides series on hue. */
export const CATEGORICAL: readonly string[] = [
  'var(--brand-primary)',
  '#3B82F6',
  '#22C55E',
  '#A78BFA',
  '#22D3EE',
  '#FB923C',
  '#F472B6',
  '#64748B',
];

// ─── Card chrome (byte-matched to premium.tsx StatCard / SectionCard) ─────────
export const CARD_SURFACE =
  'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))';

/** Milled-plate card — drop + top light + inset perimeter ring, as StatCard. */
export const cardShadow =
  '0 14px 34px -24px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px rgba(255,255,255,0.03)';

/** Uppercase micro-label used across the premium surface. */
export const microLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: CHART.textTertiary,
};

// ─── Number formatting ────────────────────────────────────────────────────────
export type ValueFormat = 'currency' | 'number' | 'percent';

/** Compact magnitude: 950 → "950", 12_500 → "13K", 1_240_000 → "1.2M". */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${sign}${Math.round(abs / 1e3)}K`;
  return `${sign}${Math.round(abs)}`;
}

/** Full currency with thousands separators — "$1,240,000". */
export function formatCurrency(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function formatValue(n: number, format: ValueFormat = 'number', compact = false): string {
  if (!Number.isFinite(n)) return '—';
  if (format === 'percent') return `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`;
  if (format === 'currency') return compact ? '$' + formatCompact(n) : formatCurrency(n);
  return compact ? formatCompact(n) : Math.round(n).toLocaleString('en-US');
}

export type TrendDirection = 'up' | 'down' | 'flat';

export interface Delta {
  /** Signed percentage change, or null when it can't be computed (no base). */
  pct: number | null;
  direction: TrendDirection;
}

/** Period-over-period change from a base value to a current value. A zero or
 *  missing base yields a null pct (an "up from nothing" is not a real %). */
export function computeDelta(current: number, previous: number): Delta {
  const direction: TrendDirection =
    current > previous ? 'up' : current < previous ? 'down' : 'flat';
  if (!Number.isFinite(previous) || previous === 0) return { pct: null, direction };
  return { pct: ((current - previous) / Math.abs(previous)) * 100, direction };
}

// ─── TrendDelta — the up/down % chip (green up, red down) ────────────────────
export function TrendDelta({
  pct,
  direction,
  size = 13,
  suffix,
}: {
  pct: number | null | undefined;
  /** Override the direction (e.g. for a flat run where pct rounds to 0). */
  direction?: TrendDirection;
  size?: number;
  /** Trailing context, e.g. "vs last mo". */
  suffix?: string;
}) {
  const dir: TrendDirection =
    direction ?? (pct == null ? 'flat' : pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat');
  const color = dir === 'up' ? CHART.green : dir === 'down' ? CHART.red : CHART.textTertiary;
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '→';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color,
        fontSize: size,
        fontWeight: 800,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden style={{ fontSize: size - 2 }}>{arrow}</span>
      {pct == null ? '—' : `${Math.abs(pct).toFixed(1)}%`}
      {suffix ? <span style={{ color: CHART.textTertiary, fontWeight: 600 }}>{suffix}</span> : null}
    </span>
  );
}

// ─── Custom dark tooltip (shared by every recharts chart in the kit) ─────────
// Recharts injects `active`, `payload` and `label` at runtime when the tooltip
// is passed as an element (`content={<ChartTooltip … />}`), so those three are
// optional here; the formatter props are ours.
export interface ChartTooltipEntry {
  value?: number | string;
  name?: string | number;
  dataKey?: string | number;
  color?: string;
  payload?: Record<string, unknown>;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipEntry[];
  label?: string | number;
  /** Format a numeric series value for display. */
  valueFormatter?: (value: number) => string;
  /** Format the axis label (x value) shown as the tooltip heading. */
  labelFormatter?: (label: string | number) => string;
  /** Hide the per-series name row when there is only one series. */
  hideName?: boolean;
}

export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
  labelFormatter,
  hideName,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const fmt = valueFormatter ?? ((v: number) => Math.round(v).toLocaleString('en-US'));
  return (
    <div
      style={{
        background: 'rgba(16,17,20,0.96)',
        border: `1px solid ${CHART.borderDefault}`,
        borderRadius: 12,
        padding: '10px 12px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
        backdropFilter: 'blur(6px)',
        minWidth: 120,
      }}
    >
      {label != null && label !== '' && (
        <div
          style={{
            ...microLabel,
            color: CHART.textTertiary,
            marginBottom: payload.length ? 7 : 0,
          }}
        >
          {labelFormatter ? labelFormatter(label) : String(label)}
        </div>
      )}
      {payload.map((entry, i) => {
        const raw = typeof entry.value === 'number' ? entry.value : Number(entry.value);
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              padding: '2px 0',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <span
                aria-hidden
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 3,
                  flexShrink: 0,
                  background: entry.color || CHART.gold,
                  boxShadow: `0 0 10px -1px ${entry.color || CHART.gold}`,
                }}
              />
              {!hideName && entry.name != null && (
                <span
                  style={{
                    fontSize: 12,
                    color: CHART.textSecondary,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {entry.name}
                </span>
              )}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: CHART.textPrimary,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {Number.isFinite(raw) ? fmt(raw) : String(entry.value ?? '—')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Empty state (never crash on empty arrays) ───────────────────────────────
export function ChartEmpty({ message = 'No data yet', height }: { message?: string; height?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: height ?? 160,
        height: height ?? undefined,
        textAlign: 'center',
        color: CHART.textTertiary,
        fontSize: 13,
        border: `1px dashed ${CHART.borderDefault}`,
        borderRadius: 12,
        background: 'rgba(255,255,255,0.015)',
        padding: 20,
      }}
    >
      {message}
    </div>
  );
}

/** Thin uppercase header used inside chart cards (title + optional right slot). */
export function ChartHeader({
  title,
  subtitle,
  right,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  if (!title && !subtitle && !right) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 14,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {title && <div style={microLabel}>{title}</div>}
        {subtitle && (
          <div style={{ fontSize: 12.5, color: CHART.textTertiary, marginTop: 4, textTransform: 'none', letterSpacing: 0 }}>
            {subtitle}
          </div>
        )}
      </div>
      {right && <div style={{ flex: '0 0 auto' }}>{right}</div>}
    </div>
  );
}
