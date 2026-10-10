'use client';

/**
 * <StatCard> — one figure, flat (owner approved 2026-10-10): value 17px bold
 * over an 11px label, a hairline on its left, an optional line under it. No
 * tile, no icon chip, no glow, no hover lift, no big padding — a row of them
 * reads as the number strip on Home.
 *
 * Kept: `href` / `onClick` (a › says it opens something), `trend` (a small
 * ▲ / ▼ beside the value, green when it is good news), `accent` (the value's
 * colour). `icon`, `index` are accepted and not drawn.
 *
 * <StatGrid> — the row: figures side by side with hairlines between, wrapping
 * on a phone.
 *
 * Styles: the FLAT SHARED PARTS block in app/globals.css (.pmFig, .pmStrip).
 */

import React from 'react';

type TrendDir = 'up' | 'down' | 'flat';

export interface StatCardProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Optional trend. `good` colours up=green/down=red by default; set
   *  `good:false` to invert (e.g. a cost metric where "up" is bad). */
  trend?: { value: React.ReactNode; dir: TrendDir; good?: boolean };
  /** Colour of the value. Defaults to the body text colour. */
  accent?: string;
  onClick?: () => void;
  href?: string;
  /** Not drawn — no entrance stagger in the flat look. */
  index?: number;
  style?: React.CSSProperties;
}

export function StatCard({ label, value, sub, trend, accent, onClick, href, style }: StatCardProps) {
  const trendColor = trend
    ? trend.dir === 'flat'
      ? 'var(--sg-text-3)'
      : (trend.dir === 'up') === (trend.good !== false)
      ? 'var(--success)'
      : 'var(--danger)'
    : undefined;
  const glyph = trend ? (trend.dir === 'up' ? '▲' : trend.dir === 'down' ? '▼' : '–') : null;

  const body = (
    <>
      <span className="pmFigV" style={accent ? { color: accent } : undefined}>
        {value}
        {trend && (
          <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: trendColor }}>
            <span aria-hidden>{glyph}</span> {trend.value}
          </span>
        )}
      </span>
      <span className="pmFigL">
        <span>{label}</span>
        {(href || onClick) && <span className="pmFigGo" aria-hidden>›</span>}
      </span>
      {sub != null && <span className="pmFigS">{sub}</span>}
    </>
  );

  if (href) return <a className="pmFig pmFigSolo" href={href} onClick={onClick} style={style}>{body}</a>;
  if (onClick) return <button type="button" className="pmFig pmFigSolo" onClick={onClick} style={style}>{body}</button>;
  return <div className="pmFig pmFigSolo" style={style}>{body}</div>;
}

export interface StatGridProps {
  children: React.ReactNode;
  /** Minimum figure width before wrapping (px). */
  min?: number;
  /** Not used — figures are separated by hairlines, not gaps. */
  gap?: number;
  style?: React.CSSProperties;
}

/** A row of StatCards with hairlines between, wrapping on a phone. */
export function StatGrid({ children, min = 118, style }: StatGridProps) {
  return (
    <div className="pmStrip" style={style}>
      <div className="pmStripGrid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${Math.min(min, 160)}px, 1fr))` }}>
        {React.Children.map(children, (c) =>
          React.isValidElement<{ style?: React.CSSProperties }>(c)
            ? React.cloneElement(c, { style: { ...(c.props.style || {}), borderBottom: '1px solid var(--sg-border)' } })
            : c,
        )}
      </div>
    </div>
  );
}

export default StatCard;
