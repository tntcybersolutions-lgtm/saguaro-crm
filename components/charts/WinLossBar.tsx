'use client';

/**
 * WinLossBar — win vs loss as a single horizontal ratio bar plus a compact
 * stat row (Won N · Lost N · Win rate %). Built to read at a glance: the green
 * segment is won, the red is lost, and each segment is hoverable for its exact
 * count and share. An optional `pending` count is shown in the stat row but,
 * like real win-rate maths, is excluded from the rate itself (open deals are
 * neither won nor lost yet).
 */

import React from 'react';
import {
  CHART,
  CARD_SURFACE,
  cardShadow,
  microLabel,
  ChartEmpty,
} from './shared';

export interface WinLossBarProps {
  won: number;
  lost: number;
  /** Open/in-progress deals — shown in the stat row, excluded from win rate. */
  pending?: number;
  /** Uppercase micro-title, e.g. "WIN / LOSS". */
  title?: string;
  /** Secondary line under the title. */
  subtitle?: string;
  /** Bar thickness in px. Default 14. */
  barHeight?: number;
  style?: React.CSSProperties;
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: React.ReactNode;
  color: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          ...microLabel,
          marginBottom: 4,
        }}
      >
        <span
          aria-hidden
          style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }}
        />
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: CHART.textPrimary,
          letterSpacing: '-0.01em',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function WinLossBar({
  won,
  lost,
  pending,
  title,
  subtitle,
  barHeight = 14,
  style,
}: WinLossBarProps) {
  const [hover, setHover] = React.useState<'won' | 'lost' | null>(null);

  const safeWon = Math.max(0, won || 0);
  const safeLost = Math.max(0, lost || 0);
  const decided = safeWon + safeLost;
  const winRate = decided > 0 ? (safeWon / decided) * 100 : null;
  const wonPct = decided > 0 ? (safeWon / decided) * 100 : 0;
  const lostPct = decided > 0 ? (safeLost / decided) * 100 : 0;

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: CARD_SURFACE,
        border: `1px solid ${CHART.border}`,
        borderRadius: 16,
        padding: '14px 16px',
        boxShadow: cardShadow,
        ...style,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: `linear-gradient(180deg, ${CHART.green}, transparent)`,
          opacity: 0.85,
        }}
      />

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
            <div style={{ fontSize: 13, color: CHART.textTertiary, marginTop: 4 }}>{subtitle}</div>
          )}
        </div>
        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
          <div
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: winRate == null ? CHART.textTertiary : CHART.green,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}
          >
            {winRate == null ? '—' : `${winRate.toFixed(winRate % 1 === 0 ? 0 : 1)}%`}
          </div>
          <div style={{ ...microLabel, marginTop: 4 }}>Win Rate</div>
        </div>
      </div>

      {decided === 0 ? (
        <ChartEmpty height={72} message="No decided deals yet" />
      ) : (
        <div
          role="img"
          aria-label={`Won ${safeWon}, lost ${safeLost}, win rate ${winRate?.toFixed(1)} percent`}
          style={{
            display: 'flex',
            height: barHeight,
            borderRadius: 999,
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${CHART.border}`,
          }}
        >
          <div
            onMouseEnter={() => setHover('won')}
            onMouseLeave={() => setHover(null)}
            title={`Won ${safeWon} · ${wonPct.toFixed(1)}%`}
            style={{
              width: `${wonPct}%`,
              background: `linear-gradient(90deg, ${CHART.green}, color-mix(in srgb, ${CHART.green} 72%, #000))`,
              transition: 'filter .15s ease, opacity .15s ease',
              filter: hover === 'won' ? 'brightness(1.12)' : undefined,
              opacity: hover === 'lost' ? 0.55 : 1,
            }}
          />
          <div
            onMouseEnter={() => setHover('lost')}
            onMouseLeave={() => setHover(null)}
            title={`Lost ${safeLost} · ${lostPct.toFixed(1)}%`}
            style={{
              width: `${lostPct}%`,
              background: `linear-gradient(90deg, color-mix(in srgb, ${CHART.red} 72%, #000), ${CHART.red})`,
              transition: 'filter .15s ease, opacity .15s ease',
              filter: hover === 'lost' ? 'brightness(1.12)' : undefined,
              opacity: hover === 'won' ? 0.55 : 1,
            }}
          />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 22,
          marginTop: 16,
          flexWrap: 'wrap',
        }}
      >
        <Stat label="Won" value={safeWon.toLocaleString('en-US')} color={CHART.green} />
        <Stat label="Lost" value={safeLost.toLocaleString('en-US')} color={CHART.red} />
        {pending != null && (
          <Stat label="Open" value={Math.max(0, pending).toLocaleString('en-US')} color={CHART.blue} />
        )}
      </div>
    </div>
  );
}

export default WinLossBar;
