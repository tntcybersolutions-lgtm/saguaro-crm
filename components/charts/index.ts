/**
 * components/charts — interactive financial-reporting chart kit.
 *
 * Real tracking graphs for the sales team & GCs, at a glance: hoverable
 * tooltips, a scrubbable left-to-right time axis, trend up/down with %
 * deltas, and win/loss ratios. Built on recharts (v3) and matched to the
 * premium dark theme (components/ui/premium.tsx + globals.css tokens).
 *
 * Usage:
 *   import { TrendArea, WinLossBar, MiniSpark, MetricTrendCard, DonutRatio } from '@/components/charts';
 */

export { TrendArea, type TrendAreaProps, type TrendPoint } from './TrendArea';
export { WinLossBar, type WinLossBarProps } from './WinLossBar';
export { MiniSpark, type MiniSparkProps } from './MiniSpark';
export { MetricTrendCard, type MetricTrendCardProps } from './MetricTrendCard';
export { DonutRatio, type DonutRatioProps, type DonutSlice } from './DonutRatio';

// Shared primitives & helpers — exported for pages composing the kit directly.
export {
  CHART,
  CATEGORICAL,
  accentColors,
  computeDelta,
  formatValue,
  formatCurrency,
  formatCompact,
  TrendDelta,
  ChartTooltip,
  ChartEmpty,
  ChartHeader,
  type ChartAccent,
  type ValueFormat,
  type Delta,
  type TrendDirection,
  type ChartTooltipProps,
  type ChartTooltipEntry,
  type AccentPair,
} from './shared';
