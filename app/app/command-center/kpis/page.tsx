'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { useProjects } from '@/lib/hooks/useProjects';
import { useLongLead, useRisks, useMilestones, useEscalations, useOpKpis } from '@/lib/hooks/useFranchise';
import { computeHealth } from '@/lib/portfolio-health';
import { computeLongLead, computeRisk, milestoneSlip, escalationSeverity, num, type Severity } from '@/lib/franchise';
import {
  C, font, fmtMoneyShort, useFranchiseGate, GateLoading, Tile, SevBadge, Metric, LiftCard,
} from '@/components/franchise/kit';
import { PremiumSurface, ModuleHero, StatStrip } from '@/components/ui/premium';
import { CheckCircle, XCircle, Warning, ChartLineUp } from '@phosphor-icons/react';

// Color a cycle-time metric against its spec target: green ≤ target, yellow ≤ 1.5×, red over.
function dayColor(v: number | null | undefined, target: number): string | undefined {
  if (v == null) return undefined;
  if (v <= target) return C.green;
  if (v <= target * 1.5) return C.yellow;
  return C.red;
}

// One SLA target row: metric · target · current value · met/miss/no-data badge.
function SLARow({ label, target, current, met }: { label: string; target: string; current: string; met: boolean | null }) {
  const col = met == null ? C.dim : met ? C.green : C.red;
  const badge = met == null ? 'No Data'
    : met
    ? (<><CheckCircle size={12} weight="fill" style={{ verticalAlign: 'middle' }} /> On Target</>)
    : (<><XCircle size={12} weight="fill" style={{ verticalAlign: 'middle' }} /> Off Target</>);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 2px', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ flex: '1 1 200px', fontSize: 14, fontWeight: 700 }}>{label}</span>
      <span style={{ flex: '0 0 120px', fontSize: 12, color: C.dim, textAlign: 'right' }}>target {target}</span>
      <span style={{ flex: '0 0 110px', fontSize: 14, fontWeight: 800, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{current}</span>
      <span style={{ flex: '0 0 96px', fontSize: 11, fontWeight: 800, color: col, background: `${col}14`, padding: '4px 9px', borderRadius: 999, textAlign: 'center' }}>{badge}</span>
    </div>
  );
}

// A 0–100 index bar. Higher = healthier; color flips at the usual thresholds.
function IndexBar({ label, pct, invert, hint }: { label: string; pct: number | null; invert?: boolean; hint?: string }) {
  const v = pct == null ? null : Math.max(0, Math.min(100, Math.round(pct)));
  const good = invert ? (v == null ? true : v <= 20) : (v == null ? true : v >= 80);
  const mid = invert ? (v != null && v <= 50) : (v != null && v >= 50);
  const color = v == null ? C.border : good ? C.green : mid ? C.yellow : C.red;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 18, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums' }}>{v == null ? '—' : `${v}%`}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${v ?? 0}%`, background: color, borderRadius: 4, transition: 'width .3s' }} />
      </div>
      {hint && <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

export default function KpiDashboardPage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { projects, loading: pLoading } = useProjects();
  const { items: longLead } = useLongLead();
  const { risks } = useRisks();
  const { milestones } = useMilestones();
  const { escalations } = useEscalations();
  const { kpis: op } = useOpKpis();

  const k = useMemo(() => {
    const projs = (projects as any[]) || [];
    const health = projs.map((p) => ({ p, h: computeHealth(p) }));
    const portfolioValue = health.reduce((s, { h }) => s + (h.budget || 0), 0);
    const compVals = health.map(({ h }) => h.percentComplete).filter((x): x is number => x != null);
    const avgComplete = compVals.length ? Math.round(compVals.reduce((a, b) => a + b, 0) / compVals.length) : null;
    const sitesAttention = health.filter(({ h }) => h.status !== 'green').length;

    // Long-lead
    const ll = ((longLead as any[]) || []).map((it) => computeLongLead(it));
    const llAtRisk = ll.filter((x) => x.severity !== 'green').length;
    const llIndex = ll.length ? Math.round((ll.filter((x) => x.severity === 'green').length / ll.length) * 100) : null;

    // Risks
    const rk = ((risks as any[]) || []).map((r) => computeRisk(r));
    const openCritical = rk.filter((r) => r.isOpen && r.severity === 'red').length;
    const openRisks = rk.filter((r) => r.isOpen).length;
    // Risk exposure index: share of open risks that are red/yellow (higher = worse → invert bar)
    const riskExposure = openRisks ? Math.round((rk.filter((r) => r.isOpen && r.severity !== 'green').length / openRisks) * 100) : 0;

    // Milestones
    const ms = ((milestones as any[]) || []).map((m) => milestoneSlip(m.baseline_date, m.current_date, m.actual_date, m.float_days));
    const slipping = ms.filter((m) => m.severity !== 'green').length;
    const onTimeIndex = ms.length ? Math.round((ms.filter((m) => m.severity === 'green').length / ms.length) * 100) : null;

    // Escalations
    const esc = ((escalations as any[]) || []).filter((e) => !/resolved|closed/i.test(String(e.status || '')));
    const openEsc = esc.length;

    // Budget health index: share of sites within budget
    const budgetOk = health.filter(({ h }) => h.variancePct == null || h.variancePct <= 1).length;
    const budgetIndex = health.length ? Math.round((budgetOk / health.length) * 100) : null;

    // Overall portfolio score: average of site health scores
    const overall = health.length ? Math.round(health.reduce((s, { h }) => s + h.score, 0) / health.length) : null;

    // Schedule freshness: share of sites whose schedule was updated within 7 days (spec SLA).
    const scheduleFreshPct = health.length ? Math.round((health.filter(({ h }) => h.daysSinceUpdate != null && h.daysSinceUpdate <= 7).length / health.length) * 100) : null;

    // Per-site rollup
    const bySite = projs.map((p) => {
      const h = computeHealth(p);
      const siteLL = ((longLead as any[]) || []).filter((it) => it.project_id === p.id).map((it) => computeLongLead(it));
      const siteRisks = ((risks as any[]) || []).filter((r) => r.project_id === p.id).map((r) => computeRisk(r));
      const siteMs = ((milestones as any[]) || []).filter((m) => m.project_id === p.id).map((m) => milestoneSlip(m.baseline_date, m.current_date, m.actual_date, m.float_days));
      const siteEsc = ((escalations as any[]) || []).filter((e) => e.project_id === p.id && !/resolved|closed/i.test(String(e.status || '')));
      return {
        p, h,
        llAtRisk: siteLL.filter((x) => x.severity !== 'green').length,
        risksOpen: siteRisks.filter((r) => r.isOpen).length,
        risksCrit: siteRisks.filter((r) => r.isOpen && r.severity === 'red').length,
        msSlip: siteMs.filter((m) => m.severity !== 'green').length,
        esc: siteEsc.length,
      };
    }).sort((a, b) => a.h.score - b.h.score);

    return {
      sites: projs.length, portfolioValue, avgComplete, sitesAttention,
      llTotal: ll.length, llAtRisk, llIndex,
      openCritical, openRisks, riskExposure,
      msTotal: ms.length, slipping, onTimeIndex,
      openEsc, budgetIndex, overall, scheduleFreshPct, bySite,
    };
  }, [projects, longLead, risks, milestones, escalations]);

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  return (
    <PremiumSurface maxWidth={2200} pad="28px 24px 60px">
      <div style={{ fontFamily: font, color: C.text }}>
      <ModuleHero
        eyebrow="Portfolio Intelligence"
        eyebrowIcon={<ChartLineUp size={13} weight="fill" color={C.gold} />}
        title="KPI"
        accent="Dashboard"
        subtitle="The whole portfolio in numbers."
        actions={<div style={{ fontSize: 12, color: C.dim }}>{k.sites} {k.sites === 1 ? 'site' : 'sites'}</div>}
      />

      {/* Headline KPIs — dense strip, zero dead space */}
      <StatStrip items={[
        {href: '/app/command-center/kpis',  label: 'Portfolio Value', value: fmtMoneyShort(k.portfolioValue), sub: `${k.sites} active site${k.sites === 1 ? '' : 's'}` },
        {href: '/app/command-center/kpis',  label: 'Avg Complete', value: k.avgComplete == null ? '—' : `${k.avgComplete}%`, sub: 'Across reporting sites' },
        {href: '/app/command-center/kpis',  label: 'Sites Needing Attn', value: String(k.sitesAttention), accent: k.sitesAttention > 0 ? C.yellow : C.green, sub: `of ${k.sites}` },
        {href: '/app/command-center/long-lead',  label: 'Long-Lead at Risk', value: String(k.llAtRisk), accent: k.llAtRisk > 0 ? C.red : C.green, sub: `of ${k.llTotal} tracked` },
        {href: '/app/command-center/risks',  label: 'Critical Risks', value: String(k.openCritical), accent: k.openCritical > 0 ? C.red : C.green, sub: `${k.openRisks} open total` },
        {href: '/app/command-center/escalations',  label: 'Escalations', value: String(k.openEsc), accent: k.openEsc > 0 ? C.red : C.green, sub: 'Open now' },
        {href: '/app/command-center/milestones',  label: 'Milestones Slipping', value: String(k.slipping), accent: k.slipping > 0 ? C.yellow : C.green, sub: `of ${k.msTotal}` },
        {href: '/app/command-center/kpis',  label: 'Overall Score', value: k.overall == null ? '—' : String(k.overall), accent: k.overall == null ? undefined : k.overall >= 80 ? C.green : k.overall >= 55 ? C.yellow : C.red, sub: 'Site-health avg / 100' },
      ]} />

      {/* Portfolio scorecard bars */}
      <div style={{ fontSize: 12, fontWeight: 800, color: C.dim, margin: '4px 2px 10px' }}>Portfolio Scorecard</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 26 }}>
        <IndexBar label="On-Time Index" pct={k.onTimeIndex} hint={`${k.msTotal - k.slipping}/${k.msTotal} milestones on baseline`} />
        <IndexBar label="Procurement Health" pct={k.llIndex} hint={`${k.llTotal - k.llAtRisk}/${k.llTotal} long-lead items clear`} />
        <IndexBar label="Budget Health" pct={k.budgetIndex} hint="Share of sites within budget" />
        <IndexBar label="Risk Exposure" pct={k.riskExposure} invert hint="Share of open risks that are high/critical (lower is better)" />
      </div>

      {/* Per-site breakdown */}
      {/* Operational cycle-time KPIs — the "how fast do we turn work" metrics from the spec.
          Tiles with a spec target (RFI ≤5d, CO ≤5d, architect/submittal ≤3d) are colored
          against it: green = meets target, yellow = within 1.5×, red = over. */}
      <div style={{ fontSize: 12, fontWeight: 800, color: C.dim, margin: '4px 2px 10px' }}>Operational Cycle Times</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 26 }}>
        <Tile label="CO Approval" value={op.coApprovalDays != null ? `${op.coApprovalDays}d` : '—'} color={dayColor(op.coApprovalDays, 5)} sub={op.coApprovalN ? `Avg · target ≤5d` : 'No data yet'} />
        <Tile label="RFI Response" value={op.rfiResponseDays != null ? `${op.rfiResponseDays}d` : '—'} color={dayColor(op.rfiResponseDays, 5)} sub={op.rfiResponseN ? `Avg · target ≤5d` : 'No data yet'} />
        <Tile label="Architect Response" value={op.architectResponseDays != null ? `${op.architectResponseDays}d` : '—'} color={dayColor(op.architectResponseDays, 3)} sub={op.architectN ? `Submittal review · ≤3d` : 'No data yet'} />
        <Tile label="Permit Issue" value={op.permitIssueDays != null ? `${op.permitIssueDays}d` : '—'} sub={op.permitIssueN ? `Avg · ${op.permitIssueN} permits` : 'No data yet'} />
        <Tile label="Plan Review" value={op.planReviewDays != null ? `${op.planReviewDays}d` : '—'} sub={op.planReviewN ? `Avg · ${op.planReviewN} reviews` : 'No data yet'} />
        <Tile label="Punch Duration" value={op.punchDurationDays != null ? `${op.punchDurationDays}d` : '—'} sub={op.punchN ? `Avg to close · ${op.punchN} items` : 'No data yet'} />
        <Tile label="Days to Closeout" value={op.closeoutDays != null ? `${op.closeoutDays}d` : '—'} sub={op.closeoutN ? `Start → C-of-O · ${op.closeoutN} sites` : 'No data yet'} />
        <Tile label="Inspection Pass Rate" value={op.inspectionPassRate != null ? `${op.inspectionPassRate}%` : '—'}
          color={op.inspectionPassRate == null ? undefined : op.inspectionPassRate >= 90 ? C.green : op.inspectionPassRate >= 70 ? C.yellow : C.red}
          sub={op.inspectionN ? `${op.inspectionN} inspections` : 'No data yet'} />
        <Tile label="GC Performance" value={op.gcPerformance != null ? `${op.gcPerformance}` : '—'}
          color={op.gcPerformance == null ? undefined : op.gcPerformance >= 85 ? C.green : op.gcPerformance >= 65 ? C.yellow : C.red}
          sub={op.gcPerformanceN ? `/ 100 · ${op.gcPerformanceN}-factor` : 'No data yet'} />
      </div>

      {/* Daily-metric SLA targets — the spec's "Remote PM Daily Metrics" as met/miss gauges. */}
      <div style={{ fontSize: 12, fontWeight: 800, color: C.dim, margin: '4px 2px 10px' }}>Daily Metric Targets (SLA)</div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '6px 16px', marginBottom: 10 }}>
        <SLARow label="RFI Response" target="≤ 5 days" current={op.rfiResponseDays != null ? `${op.rfiResponseDays}d` : '—'} met={op.rfiResponseDays == null ? null : op.rfiResponseDays <= 5} />
        <SLARow label="Submittal Review (Architect)" target="≤ 3 days" current={op.architectResponseDays != null ? `${op.architectResponseDays}d` : '—'} met={op.architectResponseDays == null ? null : op.architectResponseDays <= 3} />
        <SLARow label="Change-Order Turnaround" target="≤ 5 days" current={op.coApprovalDays != null ? `${op.coApprovalDays}d` : '—'} met={op.coApprovalDays == null ? null : op.coApprovalDays <= 5} />
        <SLARow label="Schedule Freshness" target="updated ≤ 7 days" current={k.scheduleFreshPct != null ? `${k.scheduleFreshPct}% of sites` : '—'} met={k.scheduleFreshPct == null ? null : k.scheduleFreshPct >= 90} />
        <SLARow label="Long-Lead Runway" target="8–12 wk ahead" current={k.llIndex != null ? `${k.llIndex}% clear` : '—'} met={k.llIndex == null ? null : k.llIndex >= 90} />
      </div>
      <div style={{ fontSize: 12, color: C.dim, margin: '0 2px 26px' }}>
        Two more daily targets are tracked on their own screens: <Link href="/app/command-center/daily-logs" style={{ color: C.blue, textDecoration: 'none', fontWeight: 700 }}>Field reports by 4 PM</Link> and <Link href="/app/command-center/oac" style={{ color: C.blue, textDecoration: 'none', fontWeight: 700 }}>Weekly OAC / GC call cadence</Link>.
      </div>

      <div style={{ fontSize: 12, fontWeight: 800, color: C.dim, margin: '4px 2px 10px' }}>By Site — Worst First</div>
      {pLoading ? (
        <div style={{ color: C.dim, padding: 40, textAlign: 'center' }}>Loading sites…</div>
      ) : k.bySite.length === 0 ? (
        <div style={{ color: C.dim, padding: 48, textAlign: 'center', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 6 }}>No active sites yet</div>
          <div style={{ fontSize: 13, maxWidth: 500, margin: '0 auto', lineHeight: 1.55 }}>
            Every number on this screen computes itself from live project data — budgets, RFIs, milestones, long-lead items, escalations. Add your first site and the scorecard fills in on its own.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {k.bySite.map(({ p, h, llAtRisk, risksOpen, risksCrit, msSlip, esc }) => (
            <Link key={p.id} href={`/app/projects/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <LiftCard sev={h.status as Severity}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || 'Untitled'}</div>
                    <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{[p.city, p.state].filter(Boolean).join(', ') || '—'}{p.phase ? ` · ${p.phase}` : ''}</div>
                  </div>
                  <SevBadge sev={h.status as Severity} label={h.status === 'red' ? 'Escalate' : h.status === 'yellow' ? 'Watch' : 'On Track'} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 13 }}>
                  <Metric label="Complete" value={h.percentComplete != null ? `${Math.round(h.percentComplete)}%` : '—'} />
                  <Metric label="Budget" value={h.variancePct != null ? `${h.variancePct > 0 ? '+' : ''}${h.variancePct.toFixed(0)}%` : '—'} color={h.variancePct != null && h.variancePct > 5 ? C.red : h.variancePct != null && h.variancePct > 1 ? C.yellow : C.text} />
                  <Metric label="Escalations" value={esc} color={esc > 0 ? C.red : C.text} />
                  <Metric label={<>Long-Lead <Warning size={11} weight="fill" style={{ verticalAlign: 'middle' }} /></>} value={llAtRisk} color={llAtRisk > 0 ? C.red : C.text} />
                  <Metric label="Open Risks" value={risksOpen} color={risksCrit > 0 ? C.red : risksOpen > 0 ? C.yellow : C.text} />
                  <Metric label="Slipping MS" value={msSlip} color={msSlip > 0 ? C.yellow : C.text} />
                </div>
              </LiftCard>
            </Link>
          ))}
        </div>
      )}
      </div>
    </PremiumSurface>
  );
}
