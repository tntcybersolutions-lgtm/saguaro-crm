'use client';

/**
 * <StatCard> — premium metric tile: icon chip · label · big value · optional
 * subtext + trend chip. Gradient surface, gold left-accent, inner glow, and a
 * hover lift with a gold-glow icon chip. Theme-aware. Presentational only.
 *
 * <StatGrid> — convenience auto-fit responsive grid for a row of StatCards.
 */

import React, { useState } from 'react';
import { TrendUp, TrendDown, Minus } from '@phosphor-icons/react';
import { gold, GOLD } from './fx';

type TrendDir = 'up' | 'down' | 'flat';

export interface StatCardProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Optional trend chip. `good` colors up=green/down=red by default; set
   *  `good:false` to invert (e.g. a cost metric where "up" is bad). */
  trend?: { value: React.ReactNode; dir: TrendDir; good?: boolean };
  /** Accent color for the value + chip. Defaults to brand gold. */
  accent?: string;
  onClick?: () => void;
  href?: string;
  /** Entrance stagger index (0,1,2…) → animation-delay. */
  index?: number;
  style?: React.CSSProperties;
}

const GREEN = 'var(--success)'; // status Ongoing green (lib/status-colors)
const RED = 'var(--danger)';   // status Overdue red

export function StatCard({ icon, label, value, sub, trend, accent, onClick, href, index = 0, style }: StatCardProps) {
  const [hover, setHover] = useState(false);
  const valueColor = accent || 'var(--sg-text)';

  const trendColor = trend
    ? trend.dir === 'flat'
      ? 'var(--sg-text-3)'
      : (trend.dir === 'up') === (trend.good !== false)
      ? GREEN
      : RED
    : undefined;
  const TrendIcon = trend ? (trend.dir === 'up' ? TrendUp : trend.dir === 'down' ? TrendDown : Minus) : null;

  const content = (
    <>
      {/* gold left accent */}
      <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${GOLD}, transparent)`, opacity: hover ? 1 : 0.7, transition: 'opacity .2s' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {icon != null && (
          <div
            style={{
              flex: '0 0 auto',
              display: 'inline-flex',
              width: 38,
              height: 38,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              background: `linear-gradient(150deg, ${gold(18)}, ${gold(5)})`,
              border: `1px solid ${gold(30)}`,
              color: GOLD,
              boxShadow: hover ? `0 0 0 3px ${gold(12)}` : 'none',
              transition: 'box-shadow .2s',
            }}
          >
            {icon}
          </div>
        )}
        <div
          style={{
            color: 'var(--sg-text-2)',
            fontSize: 12.5,
            fontWeight: 700,
            minWidth: 0,
          }}
        >
          {label}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ color: valueColor, fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.05 }}>
          {value}
        </div>
        {trend && TrendIcon && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: '3px 8px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 800,
              color: trendColor,
              background: `color-mix(in srgb, ${trendColor} 14%, transparent)`,
              border: `1px solid color-mix(in srgb, ${trendColor} 30%, transparent)`,
            }}
          >
            <TrendIcon size={13} weight="bold" />
            {trend.value}
          </div>
        )}
      </div>

      {sub != null && (
        <div style={{ color: 'var(--sg-text-3)', fontSize: 12.5, marginTop: 6, lineHeight: 1.4 }}>{sub}</div>
      )}
    </>
  );

  const shared: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    display: 'block',
    textAlign: 'left',
    textDecoration: 'none',
    padding: '18px 20px',
    borderRadius: 16,
    border: `1px solid ${hover ? gold(45) : 'var(--sg-border)'}`,
    background: 'linear-gradient(160deg, var(--sg-surface-from), var(--sg-surface-to))',
    backdropFilter: 'blur(16px) saturate(140%)',
    WebkitBackdropFilter: 'blur(16px) saturate(140%)',
    boxShadow: hover
      ? `0 22px 50px -22px rgba(0,0,0,0.6), inset 0 1px 0 var(--sg-inner-glow)`
      : `var(--sg-shadow), inset 0 1px 0 var(--sg-inner-glow)`,
    cursor: onClick || href ? 'pointer' : 'default',
    transform: hover && (onClick || href) ? 'translateY(-5px)' : 'none',
    transition: 'transform .2s cubic-bezier(.2,.7,.3,1), box-shadow .2s ease, border-color .2s ease',
    animation: 'sgRise .5s cubic-bezier(.2,.7,.3,1) both',
    animationDelay: `${(0.06 * index).toFixed(2)}s`,
    ...style,
  };

  const handlers = {
    className: 'sgUi',
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: shared,
  };

  if (href) {
    return (
      <a href={href} onClick={onClick} {...handlers}>
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button onClick={onClick} {...handlers}>
        {content}
      </button>
    );
  }
  return <div {...handlers}>{content}</div>;
}

export interface StatGridProps {
  children: React.ReactNode;
  /** Minimum tile width before wrapping (px). */
  min?: number;
  gap?: number;
  style?: React.CSSProperties;
}

/** Responsive auto-fit grid for a row of StatCards. */
export function StatGrid({ children, min = 200, gap = 14, style }: StatGridProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default StatCard;
