'use client';

/**
 * MiniSpark — a tiny inline sparkline for embedding inside StatCards / metric
 * tiles. Hand-drawn as a crisp inline SVG (no ResponsiveContainer, so it costs
 * nothing at tile size and never fights its parent for layout). The stroke and
 * soft fill colour themselves by trend: green when the series ends higher than
 * it started, red when lower, neutral when flat — or force it with `trend`.
 */

import React from 'react';
import { CHART, type TrendDirection } from './shared';

export interface MiniSparkProps {
  /** Raw series values, oldest → newest. 0–1 points render as a flat baseline. */
  data: number[];
  width?: number;
  height?: number;
  /** 'auto' (first vs last) by default; or pin the colour. */
  trend?: 'auto' | TrendDirection;
  strokeWidth?: number;
  /** Fill the area under the line. Default true. */
  fill?: boolean;
  /** Mark the final point with a dot. Default true. */
  showEndDot?: boolean;
  /** Explicit colour override (wins over trend colouring). */
  color?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
}

function trendColor(dir: TrendDirection): string {
  return dir === 'up' ? CHART.green : dir === 'down' ? CHART.red : CHART.textTertiary;
}

export function MiniSpark({
  data,
  width = 96,
  height = 30,
  trend = 'auto',
  strokeWidth = 2,
  fill = true,
  showEndDot = true,
  color,
  style,
  'aria-label': ariaLabel,
}: MiniSparkProps) {
  const gradientId = React.useId();
  const clipId = React.useId();

  const points = Array.isArray(data) ? data.filter((n) => Number.isFinite(n)) : [];
  const dir: TrendDirection =
    trend !== 'auto'
      ? trend
      : points.length < 2
        ? 'flat'
        : points[points.length - 1] > points[0]
          ? 'up'
          : points[points.length - 1] < points[0]
            ? 'down'
            : 'flat';
  const stroke = color ?? trendColor(dir);

  const pad = strokeWidth + 1;
  const w = width;
  const h = height;

  // Build the line + area paths. One point (or none) draws a flat midline.
  let linePath = '';
  let areaPath = '';
  let endX = w - pad;
  let endY = h / 2;

  if (points.length >= 2) {
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const stepX = (w - pad * 2) / (points.length - 1);
    const coords = points.map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (1 - (v - min) / span) * (h - pad * 2);
      return [x, y] as const;
    });
    linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    const last = coords[coords.length - 1];
    endX = last[0];
    endY = last[1];
    areaPath = `${linePath} L${(w - pad).toFixed(2)},${(h - pad).toFixed(2)} L${pad.toFixed(2)},${(h - pad).toFixed(2)} Z`;
  } else {
    linePath = `M${pad},${(h / 2).toFixed(2)} L${(w - pad).toFixed(2)},${(h / 2).toFixed(2)}`;
  }

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={ariaLabel ?? `Trend ${dir}`}
      style={{ display: 'block', overflow: 'visible', ...style }}
    >
      {fill && points.length >= 2 && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
            <clipPath id={clipId}>
              <rect x="0" y="0" width={w} height={h} />
            </clipPath>
          </defs>
          <path d={areaPath} fill={`url(#${gradientId})`} clipPath={`url(#${clipId})`} />
        </>
      )}
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={points.length >= 2 ? 1 : 0.5}
      />
      {showEndDot && points.length >= 2 && (
        <circle cx={endX} cy={endY} r={strokeWidth + 0.5} fill={stroke} stroke="rgba(0,0,0,0.4)" strokeWidth={1} />
      )}
    </svg>
  );
}

export default MiniSpark;
