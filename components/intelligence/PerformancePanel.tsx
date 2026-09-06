'use client';

/**
 * PerformancePanel — cost and schedule performance, stated in dollars.
 *
 * Every enterprise PM tool gets reviewed with the same three complaints: no
 * capacity planning, no forecasting, no earned value. This is the answer to the
 * third, and it is deliberately not a health percentage. "82% healthy" is a
 * number nobody can act on. "Spending $1.18 for every dollar earned, projected
 * $240k over at completion" is a sentence somebody takes into a meeting.
 *
 * Arithmetic lives in lib/earned-value.ts; this only renders it.
 */

import React, { useState } from 'react';
import useSWR from 'swr';
import CostCodeDrill from '@/components/intelligence/CostCodeDrill';
import {
  TrendUp, TrendDown, WarningCircle, CheckCircle, Warning,
  CaretDown, CaretRight, Gauge,
} from '@phosphor-icons/react';

const GOLD = '#F59E0B', DIM = '#CBD5E1', TEXT = '#FFFFFF';
const GREEN = '#45B37D', RED = '#E0644E', AMBER = '#F0A63C';
const NEST = 'rgba(20,20,22,0.55)', NEST_BORDER = 'rgba(255,255,255,0.08)';
const HAIR = 'rgba(255,255,255,0.06)';

type Health = 'good' | 'watch' | 'critical';

interface Ev {
  bac: number; pv: number; ev: number; ac: number; committed: number;
  cv: number; sv: number; cpi: number | null; spi: number | null;
  eac: number | null; etc: number | null; vac: number | null; tcpi: number | null;
  teamEac: number; percentSpent: number | null; percentComplete: number;
}
interface Sched {
  actualPct: number; plannedPct: number; criticalTasks: number; negativeFloatTasks: number;
  behindTasks: { name: string; plannedPct: number; actualPct: number; slipDays: number }[];
}
interface Row {
  id: string; name: string; contract: number;
  budgetLines: number; scheduleTasks: number;
  schedule: Sched; ev: Ev;
  verdict: { health: Health; headline: string; reasons: string[] };
  worstCodes: { code: string; description: string; budget: number; spent: number; forecast: number; variance: number }[];
}
interface Payload {
  projects: Row[];
  portfolio: null | (Ev & { atRisk: number; watch: number; healthy: number });
  meta: { projectCount: number; generatedAt: string };
}

const money = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${s}$${(a / 1_000).toFixed(0)}K`;
  return `${s}$${Math.round(a).toLocaleString('en-US')}`;
};

const HEALTH: Record<Health, { color: string; label: string; Icon: typeof CheckCircle }> = {
  good: { color: GREEN, label: 'On track', Icon: CheckCircle },
  watch: { color: AMBER, label: 'Watch', Icon: Warning },
  critical: { color: RED, label: 'Off track', Icon: WarningCircle },
};

/** An index reads as good above 1.0 and bad below it, so colour it that way. */
const indexColor = (v: number | null): string =>
  v == null ? DIM : v >= 0.98 ? GREEN : v >= 0.9 ? AMBER : RED;

function IndexDial({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  const c = indexColor(value);
  /* 0.7–1.3 is the band where these indices actually live; a 0–2 scale wastes
     most of the bar and makes a catastrophic 0.85 look mild. */
  const pct = value == null ? 0 : Math.max(0, Math.min(100, ((value - 0.7) / 0.6) * 100));
  return (
    <div style={{ flex: '1 1 150px', minWidth: 140 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: DIM, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: c, fontVariantNumeric: 'tabular-nums' }}>
          {value == null ? '—' : value.toFixed(2)}
        </span>
      </div>
      <div style={{ position: 'relative', height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.09)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: c, borderRadius: 3, transition: 'width .3s ease' }} />
        {/* 1.0 is the only number that matters on this bar — mark it. */}
        <div style={{ position: 'absolute', left: '50%', top: -2, width: 1, height: 9, background: 'rgba(255,255,255,0.55)' }} />
      </div>
      <div style={{ fontSize: 10, color: DIM, marginTop: 4, lineHeight: 1.4 }}>{hint}</div>
    </div>
  );
}

function Figure({ label, value, tone, sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div style={{ flex: '1 1 118px', minWidth: 108 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: DIM, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: tone || TEXT, marginTop: 3, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: DIM, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Progress vs spend, on one axis. The gap between the two bars IS the story. */
function ProgressVsSpend({ complete, spent }: { complete: number; spent: number | null }) {
  const s = spent ?? 0;
  const gap = s - complete;
  const tone = gap > 10 ? RED : gap > 3 ? AMBER : GREEN;
  return (
    <div style={{ marginTop: 12 }}>
      {([['Work complete', complete, GOLD], ['Budget spent', s, tone]] as [string, number, string][]).map(([lab, val, col]) => (
        <div key={lab} style={{ marginBottom: 7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: DIM, marginBottom: 3 }}>
            <span style={{ fontWeight: 700 }}>{lab}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: col, fontWeight: 800 }}>{val.toFixed(1)}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, val))}%`, background: col, borderRadius: 3, transition: 'width .3s ease' }} />
          </div>
        </div>
      ))}
      {Math.abs(gap) > 3 && (
        <div style={{ fontSize: 10.5, color: tone, fontWeight: 700, marginTop: 2 }}>
          {gap > 0
            ? `${gap.toFixed(0)} points more spent than built`
            : `${Math.abs(gap).toFixed(0)} points more built than spent`}
        </div>
      )}
    </div>
  );
}

const fetcher = (u: string) => fetch(u).then((r) => {
  if (!r.ok) throw new Error('Failed to load performance');
  return r.json();
});

export default function PerformancePanel({ projectIds }: { projectIds?: string[] }) {
  const qs = projectIds && projectIds.length ? `?projectIds=${projectIds.join(',')}` : '';
  const { data, error, isLoading } = useSWR<Payload>(`/api/intelligence/performance${qs}`, fetcher, {
    revalidateOnFocus: false,
  });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [drill, setDrill] = useState<{ projectId: string; division: string } | null>(null);

  const card: React.CSSProperties = {
    background: NEST, border: `1px solid ${NEST_BORDER}`, borderRadius: 12, padding: 14,
  };

  if (isLoading) {
    return <div style={{ ...card, color: DIM, fontSize: 12.5, textAlign: 'center', padding: 30 }}>Reading budgets and schedules…</div>;
  }

  if (error) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: 26 }}>
        <WarningCircle size={18} weight="fill" color={RED} />
        <div style={{ color: RED, fontSize: 12.5, fontWeight: 700, marginTop: 8 }}>Couldn&apos;t load cost performance.</div>
      </div>
    );
  }

  const rows = data?.projects || [];
  const pf = data?.portfolio;

  if (!pf || rows.length === 0) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: 30, color: DIM, fontSize: 12.5, lineHeight: 1.7 }}>
        <Gauge size={26} weight="duotone" color={DIM} />
        <div style={{ fontWeight: 800, color: TEXT, marginTop: 10, fontSize: 13.5 }}>No cost performance yet</div>
        <div style={{ marginTop: 5, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
          This reads budget line items and schedule tasks. Once a project has a budget with
          cost codes and a schedule with percent-complete, earned value appears here.
        </div>
      </div>
    );
  }

  const noCost = pf.ac === 0;

  return (
    <div>
      {/* ── portfolio ─────────────────────────────────────────────── */}
      <div style={{ ...card, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <Gauge size={15} weight="duotone" color={GOLD} />
          <span style={{ fontSize: 12.5, fontWeight: 800, color: TEXT, letterSpacing: '-0.01em' }}>Portfolio earned value</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([['critical', pf.atRisk], ['watch', pf.watch], ['good', pf.healthy]] as [Health, number][])
              .filter(([, n]) => n > 0)
              .map(([h, n]) => (
                <span key={h} style={{
                  fontSize: 10, fontWeight: 800, color: HEALTH[h].color,
                  background: `${HEALTH[h].color}1F`, border: `1px solid ${HEALTH[h].color}55`,
                  borderRadius: 20, padding: '2px 9px',
                }}>
                  {n} {HEALTH[h].label.toLowerCase()}
                </span>
              ))}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <Figure label="Budget (BAC)" value={money(pf.bac)} />
          <Figure label="Earned (EV)" value={money(pf.ev)} sub="value of work in place" />
          <Figure label="Actual (AC)" value={money(pf.ac)} sub="spent to date" />
          <Figure label="Committed" value={money(pf.committed)} sub="POs + subcontracts" />
          <Figure
            label="Forecast (EAC)"
            value={money(pf.eac)}
            tone={pf.vac != null && pf.vac < 0 ? RED : TEXT}
          />
          <Figure
            label="Variance (VAC)"
            value={money(pf.vac)}
            tone={pf.vac == null ? DIM : pf.vac < 0 ? RED : GREEN}
            sub={pf.vac == null ? undefined : pf.vac < 0 ? 'projected overrun' : 'projected under'}
          />
        </div>

        {noCost ? (
          <div style={{ fontSize: 11.5, color: DIM, borderTop: `1px solid ${HAIR}`, paddingTop: 10 }}>
            No cost booked against any budget line yet, so there is nothing to project from.
            The indices appear once actuals start landing.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', borderTop: `1px solid ${HAIR}`, paddingTop: 12 }}>
            <IndexDial label="CPI · cost" value={pf.cpi} hint={pf.cpi == null ? 'no actuals yet' : pf.cpi >= 1 ? `earning $${pf.cpi.toFixed(2)} per $1 spent` : `spending $${(1 / pf.cpi).toFixed(2)} per $1 earned`} />
            <IndexDial label="SPI · schedule" value={pf.spi} hint={pf.spi == null ? 'no baseline dates' : pf.spi >= 1 ? 'ahead of plan' : `${money(Math.abs(pf.sv))} of planned work not earned`} />
          </div>
        )}
      </div>

      {/* ── per project ───────────────────────────────────────────── */}
      {rows.map((p) => {
        const H = HEALTH[p.verdict.health];
        const isOpen = open[p.id] ?? p.verdict.health !== 'good';
        return (
          <div key={p.id} style={{ ...card, marginBottom: 10, borderLeft: `3px solid ${H.color}` }}>
            <button
              type="button"
              onClick={() => setOpen((s) => ({ ...s, [p.id]: !isOpen }))}
              style={{
                width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'flex-start', gap: 9, textAlign: 'left',
              }}
            >
              {isOpen ? <CaretDown size={12} weight="bold" color={DIM} style={{ marginTop: 5 }} />
                      : <CaretRight size={12} weight="bold" color={DIM} style={{ marginTop: 5 }} />}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: TEXT, letterSpacing: '-0.01em' }}>{p.name}</span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 800,
                    color: H.color, background: `${H.color}1F`, border: `1px solid ${H.color}55`,
                    borderRadius: 20, padding: '1px 8px',
                  }}>
                    <H.Icon size={10} weight="fill" /> {H.label}
                  </span>
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: DIM, marginTop: 3 }}>{p.verdict.headline}</span>
              </span>
              <span style={{ textAlign: 'right', flexShrink: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: p.ev.vac == null ? DIM : p.ev.vac < 0 ? RED : GREEN, fontVariantNumeric: 'tabular-nums' }}>
                  {p.ev.vac == null ? '—' : money(p.ev.vac)}
                </span>
                <span style={{ display: 'block', fontSize: 9.5, color: DIM, fontWeight: 700, letterSpacing: 0.4 }}>AT COMPLETION</span>
              </span>
            </button>

            {isOpen && (
              <div style={{ marginTop: 12, borderTop: `1px solid ${HAIR}`, paddingTop: 12 }}>
                {p.verdict.reasons.length > 0 && (
                  <ul style={{ margin: '0 0 12px', padding: 0, listStyle: 'none' }}>
                    {p.verdict.reasons.map((r, i) => (
                      <li key={i} style={{ display: 'flex', gap: 7, fontSize: 11.5, color: TEXT, marginBottom: 5, lineHeight: 1.5 }}>
                        <span style={{ color: H.color, flexShrink: 0, marginTop: 1 }}>
                          {p.verdict.health === 'critical' ? <TrendDown size={12} weight="bold" /> : <TrendUp size={12} weight="bold" />}
                        </span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <Figure label="BAC" value={money(p.ev.bac)} />
                  <Figure label="EV" value={money(p.ev.ev)} />
                  <Figure label="AC" value={money(p.ev.ac)} />
                  <Figure label="EAC" value={money(p.ev.eac)} tone={p.ev.vac != null && p.ev.vac < 0 ? RED : TEXT} />
                  <Figure label="Team EAC" value={money(p.ev.teamEac)} sub="from the field" />
                  <Figure label="TCPI" value={p.ev.tcpi == null ? '—' : p.ev.tcpi.toFixed(2)} tone={p.ev.tcpi != null && p.ev.tcpi > 1.1 ? RED : TEXT} sub="efficiency still needed" />
                </div>

                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 14 }}>
                  <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                    <ProgressVsSpend complete={p.ev.percentComplete} spent={p.ev.percentSpent} />
                  </div>
                  <div style={{ flex: '1 1 300px', minWidth: 260, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <IndexDial label="CPI" value={p.ev.cpi} hint={p.ev.cpi == null ? 'no actuals' : p.ev.cpi >= 1 ? 'under budget for work done' : 'over budget for work done'} />
                    <IndexDial label="SPI" value={p.ev.spi} hint={p.ev.spi == null ? 'no dates' : `${p.schedule.actualPct.toFixed(0)}% built vs ${p.schedule.plannedPct.toFixed(0)}% planned`} />
                  </div>
                </div>

                {p.worstCodes.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                      Where the overrun is
                      <span style={{ color: DIM, opacity: 0.7, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}> — click a division to open it</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {p.worstCodes.map((c) => {
                          const open = drill?.projectId === p.id && drill?.division === c.code;
                          return (
                            <tr
                              key={c.code}
                              onClick={() => setDrill(open ? null : { projectId: p.id, division: c.code })}
                              style={{
                                borderTop: `1px solid ${HAIR}`, cursor: 'pointer',
                                background: open ? 'rgba(245,158,11,0.10)' : 'transparent',
                              }}
                            >
                              <td style={{ padding: '5px 0', fontSize: 11.5, color: open ? GOLD : TEXT, fontWeight: 700, whiteSpace: 'nowrap' }}>{c.code}</td>
                              <td style={{ padding: '5px 8px', fontSize: 11, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{c.description}</td>
                              <td style={{ padding: '5px 0', fontSize: 11, color: DIM, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(c.budget)}</td>
                              <td style={{ padding: '5px 0 5px 10px', fontSize: 11.5, color: RED, textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{money(c.variance)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {drill?.projectId === p.id && (
                      <CostCodeDrill
                        projectId={drill.projectId}
                        division={drill.division}
                        onClose={() => setDrill(null)}
                      />
                    )}
                  </div>
                )}

                {p.schedule.behindTasks.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                      Slipping tasks
                      {p.schedule.negativeFloatTasks > 0 && (
                        <span style={{ color: RED, marginLeft: 8 }}>· {p.schedule.negativeFloatTasks} with negative float</span>
                      )}
                    </div>
                    {p.schedule.behindTasks.slice(0, 5).map((t) => (
                      <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: `1px solid ${HAIR}`, padding: '5px 0' }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                        <span style={{ fontSize: 10.5, color: DIM, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {t.actualPct}% of {t.plannedPct}%
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: AMBER, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          ~{t.slipDays}d
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {p.budgetLines === 0 && (
                  <div style={{ marginTop: 12, fontSize: 11, color: DIM }}>
                    No budget line items on this project — earned value needs a budget with cost codes.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
