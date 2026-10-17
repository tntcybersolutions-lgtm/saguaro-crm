'use client';

/**
 * MetricTrendCard — a big-number KPI tile with a period-over-period delta % and
 * an embedded MiniSpark, built on the exact StatCard chrome from premium.tsx
 * (flat on the page, uppercase micro-label, tabular-nums).
 *
 * Optionally clickable: pass `href` to render an <a> (routing-agnostic, like
 * StatCard), or `onClick` for a handler. When interactive it borrows the
 * premium `.pmHover` lift (render inside a <PremiumSurface> or a page that has
 * mounted <PremiumFX/> so that class is defined; it degrades to a static card
 * otherwise).
 */

import React from 'react';
import {
  CHART,
  CARD_SURFACE,
  cardShadow,
  CHART_FRAME,
  microLabel,
  accentColors,
  computeDelta,
  TrendDelta,
  type ChartAccent,
  type Delta,
} from './shared';
import { MiniSpark } from './MiniSpark';

export interface MetricTrendCardProps {
  label: string;
  /** Pre-formatted headline value (e.g. "$1.24M", "38%", "126"). */
  value: React.ReactNode;
  /** Secondary line under the value. */
  sub?: React.ReactNode;
  /** Explicit delta %. If omitted and `spark` has ≥2 points, it's derived
   *  from the last two spark values. */
  deltaPct?: number | null;
  /** Sparkline series (oldest → newest). */
  spark?: number[];
  accent?: ChartAccent;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  /** Force the interactive chrome even without href/onClick. */
  interactive?: boolean;
  /** Stagger the entrance (seconds) to match StatCard grids. */
  delay?: number;
  style?: React.CSSProperties;
}

export function MetricTrendCard({
  label,
  value,
  sub,
  deltaPct,
  spark,
  accent = 'gold',
  icon,
  href,
  onClick,
  interactive: forceInteractive,
  delay = 0,
  style,
}: MetricTrendCardProps) {
  const interactive = !!(href || onClick || forceInteractive);
  const { main } = accentColors(accent);

  const derived: Delta | null =
    deltaPct === undefined && spark && spark.length >= 2
      ? computeDelta(spark[spark.length - 1], spark[spark.length - 2])
      : null;
  const pct = deltaPct !== undefined ? deltaPct : derived ? derived.pct : null;
  const direction = derived?.direction;

  const inner = (
    <div
      onClick={onClick}
      className={interactive ? 'pmHover' : undefined}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: CARD_SURFACE,
        ...CHART_FRAME,
        padding: '14px 0',
        boxShadow: cardShadow,
        cursor: interactive ? 'pointer' : 'default',
        animation: `pmRise .5s ease ${delay.toFixed(2)}s both`,
        height: '100%',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          {icon && (
            <span style={{ display: 'inline-flex', color: main, flexShrink: 0 }}>{icon}</span>
          )}
          <span style={microLabel}>{label}</span>
        </span>
        {(pct != null || direction) && (
          <TrendDelta pct={pct} direction={direction} size={12} />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: CHART.textPrimary,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {value}
          </div>
          {sub != null && (
            <div style={{ fontSize: 13, color: CHART.textTertiary, marginTop: 4 }}>{sub}</div>
          )}
        </div>
        {spark && spark.length >= 2 && (
          <MiniSpark
            data={spark}
            width={84}
            height={32}
            trend={direction ?? 'auto'}
            aria-label={`${label} trend`}
            style={{ flex: '0 0 auto' }}
          />
        )}
      </div>
    </div>
  );

  if (href) {
    // Routing-agnostic, exactly like premium.tsx StatCard: a plain <a>.
    return (
      <a href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
        {inner}
      </a>
    );
  }
  return inner;
}

export default MetricTrendCard;
