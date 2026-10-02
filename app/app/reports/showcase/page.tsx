'use client';

/*
 * app/app/reports/showcase — a live preview of the financial chart kit
 * (components/charts) rendered with realistic construction sample data, so the
 * integrating engineer and the owner can see every graph working on a preview
 * deploy before they are wired to real endpoints (/api/sales/overview,
 * /api/sales/profit, /api/financial, …).
 *
 * Net-new, self-contained, and intentionally NOT gated or linked from the nav —
 * it's a showroom. The sample data below is illustrative only.
 */

import React from 'react';
import {
  PremiumSurface,
  ModuleHero,
  SectionCard,
} from '@/components/ui/premium';
import {
  TrendArea,
  WinLossBar,
  MetricTrendCard,
  DonutRatio,
  MiniSpark,
  type TrendPoint,
  type DonutSlice,
  formatCurrency,
} from '@/components/charts';

// ─── Sample data (illustrative — a mid-size GC's trailing 12 months) ─────────
const REVENUE: TrendPoint[] = [
  { label: 'Nov', value: 1_180_000 },
  { label: 'Dec', value: 920_000 },
  { label: 'Jan', value: 1_040_000 },
  { label: 'Feb', value: 1_260_000 },
  { label: 'Mar', value: 1_520_000 },
  { label: 'Apr', value: 1_410_000 },
  { label: 'May', value: 1_680_000 },
  { label: 'Jun', value: 1_950_000 },
  { label: 'Jul', value: 2_120_000 },
  { label: 'Aug', value: 1_880_000 },
  { label: 'Sep', value: 2_340_000 },
  { label: 'Oct', value: 2_610_000 },
];

const PIPELINE: TrendPoint[] = [
  { label: 'Nov', value: 3_400_000 },
  { label: 'Dec', value: 3_100_000 },
  { label: 'Jan', value: 3_800_000 },
  { label: 'Feb', value: 4_200_000 },
  { label: 'Mar', value: 4_050_000 },
  { label: 'Apr', value: 4_600_000 },
  { label: 'May', value: 5_100_000 },
  { label: 'Jun', value: 4_900_000 },
  { label: 'Jul', value: 5_600_000 },
  { label: 'Aug', value: 6_050_000 },
  { label: 'Sep', value: 5_800_000 },
  { label: 'Oct', value: 6_480_000 },
];

const STAGE_MIX: DonutSlice[] = [
  { label: 'Qualified', value: 2_100_000 },
  { label: 'Estimating', value: 1_750_000 },
  { label: 'Bid submitted', value: 1_480_000 },
  { label: 'Negotiation', value: 840_000 },
  { label: 'Verbal win', value: 310_000 },
];

const PROJECT_TYPE: DonutSlice[] = [
  { label: 'Commercial TI', value: 4_200_000 },
  { label: 'Ground-up', value: 3_100_000 },
  { label: 'Healthcare', value: 1_900_000 },
  { label: 'Education', value: 1_200_000 },
  { label: 'Civic', value: 640_000 },
];

const monthLabels = REVENUE.map((p) => p.label);

export default function ChartShowcasePage() {
  // KPI sparklines (dollars in thousands for the margin spark, raw for counts).
  const revenueSpark = REVENUE.map((p) => p.value);
  const pipelineSpark = PIPELINE.map((p) => p.value);
  const winRateSpark = [31, 29, 33, 35, 34, 38, 37, 41, 39, 44, 42, 46];
  const avgDealSpark = [148, 152, 149, 161, 170, 168, 182, 191, 188, 205, 212, 224];

  const sectionGap: React.CSSProperties = { marginBottom: 24 };

  return (
    <PremiumSurface>
      <ModuleHero
        eyebrow="Financial tracking"
        title="Reporting"
        accent="charts"
        subtitle="Real tracking graphs at a glance — hover left-to-right for every value, watch trends move up and down with live percentage deltas, and read win / loss at a ratio. Sample data shown for preview."
      />

      {/* KPI row — big number + delta + MiniSpark, on StatCard chrome. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 14,
          ...sectionGap,
        }}
      >
        <MetricTrendCard
          label="Revenue (MTD)"
          value={formatCurrency(REVENUE[REVENUE.length - 1].value)}
          sub="Oct vs Sep"
          spark={revenueSpark}
          accent="gold"
          delay={0}
        />
        <MetricTrendCard
          label="Open pipeline"
          value={formatCurrency(PIPELINE[PIPELINE.length - 1].value)}
          sub="Weighted by stage"
          spark={pipelineSpark}
          accent="blue"
          delay={0.05}
        />
        <MetricTrendCard
          label="Win rate"
          value={`${winRateSpark[winRateSpark.length - 1]}%`}
          sub="Trailing 90 days"
          spark={winRateSpark}
          accent="gold"
          delay={0.1}
        />
        <MetricTrendCard
          label="Avg deal size"
          value={formatCurrency(avgDealSpark[avgDealSpark.length - 1] * 1000)}
          sub="Per awarded job"
          spark={avgDealSpark}
          accent="blue"
          delay={0.15}
        />
      </div>

      {/* Scrubbable time-series — revenue (gold) + pipeline (blue). */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          ...sectionGap,
        }}
      >
        <SectionCard title="Revenue trend" subtitle="Booked revenue, trailing 12 months" flush>
          <div style={{ padding: 16 }}>
            <TrendArea
              data={REVENUE}
              title="Revenue"
              deltaSuffix="vs last mo"
              accent="gold"
              format="currency"
              showAverage
            />
          </div>
        </SectionCard>
        <SectionCard title="Pipeline trend" subtitle="Open opportunity value over time" flush>
          <div style={{ padding: 16 }}>
            <TrendArea
              data={PIPELINE}
              title="Pipeline"
              deltaSuffix="vs last mo"
              accent="blue"
              format="currency"
              showAverage
            />
          </div>
        </SectionCard>
      </div>

      {/* Win/loss ratio + stage-mix donut. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          ...sectionGap,
        }}
      >
        <SectionCard title="Win / loss" subtitle="Bids decided this quarter" flush>
          <div style={{ padding: 16 }}>
            <WinLossBar
              title="Bid outcomes"
              subtitle="Awarded vs lost (open deals excluded from rate)"
              won={46}
              lost={54}
              pending={38}
            />
          </div>
        </SectionCard>
        <SectionCard title="Pipeline by stage" subtitle="Where open value sits right now" flush>
          <div style={{ padding: 16 }}>
            <DonutRatio
              data={STAGE_MIX}
              title="Pipeline by stage"
              centerLabel="Pipeline"
              format="currency"
            />
          </div>
        </SectionCard>
      </div>

      {/* Revenue mix donut + sparkline reference row. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          ...sectionGap,
        }}
      >
        <SectionCard title="Revenue by project type" subtitle="Share of booked revenue, trailing 12 months" flush>
          <div style={{ padding: 16 }}>
            <DonutRatio
              data={PROJECT_TYPE}
              title="Revenue by type"
              centerLabel="Revenue"
              format="currency"
            />
          </div>
        </SectionCard>
        <SectionCard title="Sparklines" subtitle="MiniSpark — inline trend for any tile" flush>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: 'Revenue', data: revenueSpark },
              { label: 'Pipeline', data: pipelineSpark },
              { label: 'Win rate', data: winRateSpark },
              { label: 'Avg deal', data: avgDealSpark },
            ].map((row) => (
              <div
                key={row.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  paddingBottom: 12,
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-tertiary, #8094B0)',
                  }}
                >
                  {row.label}
                </span>
                <MiniSpark data={row.data} width={140} height={34} />
              </div>
            ))}
            <div style={{ fontSize: 12, color: 'var(--text-tertiary, #8094B0)' }}>
              Period: {monthLabels[0]}–{monthLabels[monthLabels.length - 1]}
            </div>
          </div>
        </SectionCard>
      </div>
    </PremiumSurface>
  );
}
