'use client';

/**
 * TrendArea — a scrubbable area/line time-series for revenue or pipeline over
 * time. Hover anywhere left-to-right to read the exact value at that point; a
 * header shows the latest value and the period-over-period % change with an
 * up/down arrow (green up, red down). Accent is prop-driven between brand gold
 * and sales blue. Responsive down to phone width via ResponsiveContainer.
 */

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  CHART,
  CARD_SURFACE,
  cardShadow,
  microLabel,
  accentColors,
  computeDelta,
  formatValue,
  TrendDelta,
  ChartTooltip,
  ChartEmpty,
  type ChartAccent,
  type ValueFormat,
} from './shared';

export interface TrendPoint {
  /** X-axis label — a period, e.g. "Jan" or "2026-01". */
  label: string;
  /** The value at that period. */
  value: number;
}

export interface TrendAreaProps {
  data: TrendPoint[];
  /** Uppercase micro-title, e.g. "REVENUE". */
  title?: string;
  /** What a point counts, shown next to the delta, e.g. "vs last month". */
  deltaSuffix?: string;
  accent?: ChartAccent;
  format?: ValueFormat;
  /** Plot height in px (the card grows with header + padding). Default 220. */
  height?: number;
  /** Show the latest-value + delta header. Default true. */
  showHeader?: boolean;
  /** Curve interpolation. Default 'monotone'. */
  curve?: 'monotone' | 'linear';
  /** Draw a dashed baseline at the average value. Default false. */
  showAverage?: boolean;
  /** Right-hand slot in the header (e.g. a period toggle). */
  headerRight?: React.ReactNode;
  style?: React.CSSProperties;
}

export function TrendArea({
  data,
  title,
  deltaSuffix,
  accent = 'gold',
  format = 'currency',
  height = 220,
  showHeader = true,
  curve = 'monotone',
  showAverage = false,
  headerRight,
  style,
}: TrendAreaProps) {
  const gradientId = React.useId();
  const { main, bright } = accentColors(accent);

  const valueFmt = React.useCallback((v: number) => formatValue(v, format), [format]);
  const axisFmt = React.useCallback((v: number) => formatValue(v, format, true), [format]);

  const latest = data.length ? data[data.length - 1].value : 0;
  const previous = data.length > 1 ? data[data.length - 2].value : 0;
  const delta = computeDelta(latest, previous);
  const average = data.length
    ? data.reduce((sum, p) => sum + p.value, 0) / data.length
    : 0;

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: CARD_SURFACE,
        border: `1px solid ${CHART.border}`,
        borderRadius: 16,
        padding: '14px 16px 8px',
        boxShadow: cardShadow,
        ...style,
      }}
    >
      {/* left accent bar — StatCard signature */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: `linear-gradient(180deg, ${main}, transparent)`,
          opacity: 0.85,
        }}
      />

      {showHeader && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && <div style={microLabel}>{title}</div>}
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                marginTop: title ? 6 : 0,
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: CHART.textPrimary,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.05,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatValue(latest, format)}
              </span>
              {data.length > 1 && (
                <TrendDelta pct={delta.pct} direction={delta.direction} suffix={deltaSuffix} />
              )}
            </div>
          </div>
          {headerRight && <div style={{ flex: '0 0 auto' }}>{headerRight}</div>}
        </div>
      )}

      {data.length === 0 ? (
        <div style={{ paddingBottom: 6 }}>
          <ChartEmpty height={height} message="No trend data yet" />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={bright} stopOpacity={0.42} />
                <stop offset="55%" stopColor={main} stopOpacity={0.14} />
                <stop offset="100%" stopColor={main} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="label"
              tick={{ fill: CHART.textTertiary, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              minTickGap={12}
              padding={{ left: 6, right: 6 }}
            />
            <YAxis
              width={46}
              tick={{ fill: CHART.textTertiary, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={axisFmt}
            />
            {showAverage && (
              <ReferenceLine
                y={average}
                stroke="rgba(255,255,255,0.22)"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
            )}
            <Tooltip
              cursor={{ stroke: main, strokeWidth: 1, strokeDasharray: '4 4' }}
              content={<ChartTooltip valueFormatter={valueFmt} hideName />}
            />
            <Area
              type={curve}
              dataKey="value"
              name={title || 'Value'}
              stroke={main}
              strokeWidth={2.4}
              fill={`url(#${gradientId})`}
              activeDot={{
                r: 5,
                fill: bright,
                stroke: 'rgba(0,0,0,0.45)',
                strokeWidth: 2,
              }}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default TrendArea;
