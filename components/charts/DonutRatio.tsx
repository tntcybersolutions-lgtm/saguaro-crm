'use client';

/**
 * DonutRatio — a recharts donut for a ratio breakdown (pipeline by stage,
 * revenue by project type, …). A center label shows the total (or a caller
 * override), each arc is hoverable for its value and share, and a readable
 * legend lists every slice with its color, value and percentage. Responsive
 * down to phone width; the legend wraps/stacks beside or under the ring.
 */

import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, type PieLabelRenderProps } from 'recharts';
import {
  CHART,
  CARD_SURFACE,
  cardShadow,
  microLabel,
  CATEGORICAL,
  formatValue,
  ChartTooltip,
  ChartEmpty,
  type ValueFormat,
  type ChartTooltipEntry,
} from './shared';

export interface DonutSlice {
  label: string;
  value: number;
  /** Optional explicit color; otherwise taken from the categorical palette. */
  color?: string;
}

export interface DonutRatioProps {
  data: DonutSlice[];
  /** Uppercase micro-title, e.g. "PIPELINE BY STAGE". */
  title?: string;
  subtitle?: string;
  /** Small caption under the center number, e.g. "Pipeline". Defaults to "Total". */
  centerLabel?: string;
  /** Override the big center value (defaults to the formatted sum). */
  centerValue?: React.ReactNode;
  format?: ValueFormat;
  /** Ring diameter in px. Default 196. */
  size?: number;
  /** Palette override (per-slice `color` still wins). */
  colors?: readonly string[];
  /** Stack the legend under the ring instead of beside it. Default false. */
  stackLegend?: boolean;
  style?: React.CSSProperties;
}

interface DonutDatum extends DonutSlice {
  color: string;
  pct: number;
}

export function DonutRatio({
  data,
  title,
  subtitle,
  centerLabel = 'Total',
  centerValue,
  format = 'currency',
  size = 196,
  colors = CATEGORICAL,
  stackLegend = false,
  style,
}: DonutRatioProps) {
  const clean = (Array.isArray(data) ? data : []).filter(
    (d) => d && Number.isFinite(d.value) && d.value > 0,
  );
  const total = clean.reduce((sum, d) => sum + d.value, 0);

  const datums: DonutDatum[] = clean.map((d, i) => ({
    ...d,
    color: d.color || colors[i % colors.length],
    pct: total > 0 ? (d.value / total) * 100 : 0,
  }));

  const valueFmt = React.useCallback((v: number) => formatValue(v, format), [format]);
  const inner = Math.round(size * 0.62) / 2;
  const outer = Math.round(size) / 2;

  // Recharts' label payload is loosely typed; read our fields off it defensively.
  const renderTooltip = (
    <ChartTooltip
      valueFormatter={valueFmt}
      labelFormatter={(l) => String(l)}
    />
  );

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
          background: `linear-gradient(180deg, ${CHART.gold}, transparent)`,
          opacity: 0.85,
        }}
      />

      {(title || subtitle) && (
        <div style={{ marginBottom: 12 }}>
          {title && <div style={microLabel}>{title}</div>}
          {subtitle && (
            <div style={{ fontSize: 12.5, color: CHART.textTertiary, marginTop: 4 }}>{subtitle}</div>
          )}
        </div>
      )}

      {datums.length === 0 ? (
        <ChartEmpty height={size} message="No breakdown data yet" />
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: stackLegend ? 'column' : 'row',
            alignItems: 'center',
            gap: 18,
            flexWrap: 'wrap',
          }}
        >
          {/* Ring + center label */}
          <div style={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={datums}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={inner}
                  outerRadius={outer}
                  paddingAngle={datums.length > 1 ? 2 : 0}
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth={1}
                  startAngle={90}
                  endAngle={-270}
                  isAnimationActive={false}
                  labelLine={false}
                  label={(props: PieLabelRenderProps) => {
                    const pct = typeof props.percent === 'number' ? props.percent * 100 : 0;
                    return pct >= 8 ? `${Math.round(pct)}%` : '';
                  }}
                >
                  {datums.map((d) => (
                    <Cell key={d.label} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip content={renderTooltip} />
              </PieChart>
            </ResponsiveContainer>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: CHART.textPrimary,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1.05,
                }}
              >
                {centerValue ?? formatValue(total, format, true)}
              </div>
              <div style={{ ...microLabel, marginTop: 5 }}>{centerLabel}</div>
            </div>
          </div>

          {/* Legend */}
          <div style={{ flex: '1 1 160px', minWidth: 150, width: stackLegend ? '100%' : undefined }}>
            {datums.map((d) => (
              <div
                key={d.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '6px 0',
                  borderBottom: `1px solid ${CHART.border}`,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      flexShrink: 0,
                      background: d.color,
                      boxShadow: `0 0 10px -1px ${d.color}`,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      color: CHART.textSecondary,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {d.label}
                  </span>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: CHART.textPrimary,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatValue(d.value, format, true)}
                  </span>
                  <span style={{ fontSize: 11.5, color: CHART.textTertiary, fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'right' }}>
                    {d.pct.toFixed(d.pct % 1 === 0 ? 0 : 1)}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Keep the ChartTooltipEntry import meaningful for downstream typing consumers.
export type { ChartTooltipEntry };

export default DonutRatio;
