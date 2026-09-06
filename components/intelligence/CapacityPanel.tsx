'use client';

/**
 * CapacityPanel — do the people exist to deliver the plan, and where is the
 * money actually going?
 *
 * PerformancePanel answers whether spend is buying progress. This answers the
 * two questions the market's tools are reviewed as missing entirely: whether
 * the crew exists to hit the dates, and what the spend curve lands at.
 *
 * Arithmetic lives in lib/capacity.ts; this only renders it.
 */

import React, { useState } from 'react';
import useSWR from 'swr';
import {
  UsersThree, WarningCircle, ChartLine, ArrowsLeftRight, Clock, Info,
} from '@phosphor-icons/react';

const GOLD = '#F59E0B', DIM = '#CBD5E1', TEXT = '#FFFFFF';
const GREEN = '#45B37D', RED = '#E0644E', AMBER = '#F0A63C';
const NEST = 'rgba(20,20,22,0.55)', NEST_BORDER = 'rgba(255,255,255,0.08)';
const HAIR = 'rgba(255,255,255,0.06)';

interface WeekLoad { week: string; demand: number; supply: number; overBy: number; tasks: string[] }
interface TradeCap {
  trade: string; label: string; supply: number; peakDemand: number;
  overWeeks: number; worstWeek: WeekLoad | null; weeks: WeekLoad[];
}
interface Move { taskName: string; trade: string; week: string; floatDays: number; overBy: number; suggestion: string }
interface Util {
  employeeId: string; name: string; trade: string; avgUtilisation: number;
  overtimeHours: number; totalHours: number; cost: number;
  weeks: { week: string; hours: number; utilisation: number }[];
}
interface Point { week: string; plannedCum: number; actualCum: number | null; forecastCum: number | null }
interface Suspect { employeeId: string; name: string; workDate: string; hours: number; reason: string }
interface Payload {
  capacity: TradeCap[]; levelling: Move[]; utilisation: Util[]; curve: Point[];
  suspectEntries?: Suspect[];
  curveBasis: { plannedFrom: string; actualFrom: string; forecastFrom: string | null };
  crew: { headcount: number; trades: number; overloadedTrades?: number; tradesWithNoCrew?: string[]; overtimeHours?: number; suspectEntries?: number };
  meta: { projectCount: number; taskCount: number; horizonWeeks: number };
}

const money = (n: number): string => {
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${s}$${(a / 1_000).toFixed(0)}K`;
  return `${s}$${Math.round(a)}`;
};
const shortWeek = (w: string) => {
  const [, m, d] = w.split('-');
  return `${d} ${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m)]}`;
};

const fetcher = (u: string) => fetch(u).then((r) => {
  if (!r.ok) throw new Error('Failed to load capacity');
  return r.json();
});

/** Cumulative cost: planned, actual to date, and where the current rate lands. */
function SCurve({ curve, basis }: { curve: Point[]; basis: Payload['curveBasis'] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (curve.length < 2) return null;

  const W = 720, H = 190, PAD_L = 52, PAD_B = 26, PAD_T = 12, PAD_R = 12;
  const maxY = Math.max(
    ...curve.map((p) => Math.max(p.plannedCum, p.actualCum ?? 0, p.forecastCum ?? 0)),
  ) || 1;
  const x = (i: number) => PAD_L + (i / (curve.length - 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => H - PAD_B - (v / maxY) * (H - PAD_B - PAD_T);

  const path = (pick: (p: Point) => number | null) => {
    let d = '', open = false;
    curve.forEach((p, i) => {
      const v = pick(p);
      if (v == null) { open = false; return; }
      d += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      open = true;
    });
    return d.trim();
  };

  const todayIdx = curve.findIndex((p) => p.actualCum == null);
  const hp = hover != null ? curve[hover] : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Cumulative planned, actual and forecast cost by week"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(maxY * f)} y2={y(maxY * f)} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
            <text x={PAD_L - 6} y={y(maxY * f) + 3} textAnchor="end" fontSize={9} fill={DIM}>{money(maxY * f)}</text>
          </g>
        ))}

        {todayIdx > 0 && (
          <>
            <line x1={x(todayIdx - 1)} x2={x(todayIdx - 1)} y1={PAD_T} y2={H - PAD_B} stroke="rgba(255,255,255,0.30)" strokeWidth={1} strokeDasharray="3 3" />
            <text x={x(todayIdx - 1) + 4} y={PAD_T + 9} fontSize={9} fill={DIM}>today</text>
          </>
        )}

        {/* Forecast first so the facts draw over the projection, not under it. */}
        <path d={path((p) => p.forecastCum)} fill="none" stroke={AMBER} strokeWidth={2} strokeDasharray="5 4" />
        <path d={path((p) => p.plannedCum)} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={2} />
        <path d={path((p) => p.actualCum)} fill="none" stroke={GOLD} strokeWidth={2.5} />

        {curve.map((p, i) => (
          <rect
            key={p.week}
            x={x(i) - (W / curve.length) / 2} y={PAD_T}
            width={W / curve.length} height={H - PAD_B - PAD_T}
            fill="transparent" onMouseEnter={() => setHover(i)}
          />
        ))}

        {hp && (
          <>
            <line x1={x(hover!)} x2={x(hover!)} y1={PAD_T} y2={H - PAD_B} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
            {hp.actualCum != null && <circle cx={x(hover!)} cy={y(hp.actualCum)} r={3.5} fill={GOLD} />}
            <circle cx={x(hover!)} cy={y(hp.plannedCum)} r={3} fill="#fff" />
          </>
        )}

        <text x={PAD_L} y={H - 8} fontSize={9} fill={DIM}>{shortWeek(curve[0].week)}</text>
        <text x={W - PAD_R} y={H - 8} fontSize={9} fill={DIM} textAnchor="end">{shortWeek(curve[curve.length - 1].week)}</text>
      </svg>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 6, fontSize: 10.5, color: DIM }}>
        {([['Planned', 'rgba(255,255,255,0.55)', false], ['Actual', GOLD, false], ['Forecast', AMBER, true]] as [string, string, boolean][])
          .map(([lab, col, dash]) => (
            <span key={lab} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 16, height: 0, borderTop: `2px ${dash ? 'dashed' : 'solid'} ${col}` }} />
              {lab}
            </span>
          ))}
        {hp && (
          <span style={{ marginLeft: 'auto', color: TEXT, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {shortWeek(hp.week)} · planned {money(hp.plannedCum)}
            {hp.actualCum != null && <> · actual <span style={{ color: GOLD }}>{money(hp.actualCum)}</span></>}
            {hp.forecastCum != null && hp.actualCum == null && <> · forecast <span style={{ color: AMBER }}>{money(hp.forecastCum)}</span></>}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 8, fontSize: 10, color: DIM, lineHeight: 1.5 }}>
        <Info size={11} weight="bold" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Actual is dated labour cost from time entries — the only cost source carrying a date. Budget line actuals are larger but undated, so they cannot be time-phased.</span>
      </div>
    </div>
  );
}

/** One row per trade: a week-by-week strip that goes red where demand exceeds crew. */
function TradeStrip({ t }: { t: TradeCap }) {
  const [hover, setHover] = useState<WeekLoad | null>(null);
  const worst = Math.max(1, t.peakDemand, t.supply);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: TEXT }}>{t.label}</span>
        <span style={{ fontSize: 10.5, color: DIM }}>
          {t.supply} on the books · peak demand {t.peakDemand}
        </span>
        {t.overWeeks > 0 && (
          <span style={{ fontSize: 9.5, fontWeight: 800, color: RED, background: `${RED}1F`, border: `1px solid ${RED}55`, borderRadius: 20, padding: '1px 8px' }}>
            short in {t.overWeeks} week{t.overWeeks === 1 ? '' : 's'}
          </span>
        )}
        {t.supply === 0 && t.peakDemand > 0 && (
          <span style={{ fontSize: 9.5, fontWeight: 800, color: RED }}>no crew assigned to this trade</span>
        )}
        {hover && (
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: hover.overBy > 0 ? RED : DIM, fontWeight: 700 }}>
            {shortWeek(hover.week)}: {hover.demand} needed / {hover.supply} available
            {hover.tasks.length > 0 && <span style={{ color: DIM, fontWeight: 500 }}> — {hover.tasks.slice(0, 3).join(', ')}</span>}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 34 }} onMouseLeave={() => setHover(null)}>
        {t.weeks.map((w) => {
          const h = Math.max(3, (w.demand / worst) * 34);
          const col = w.overBy > 0 ? RED : w.demand === 0 ? 'rgba(255,255,255,0.10)' : GREEN;
          return (
            <div
              key={w.week}
              onMouseEnter={() => setHover(w)}
              title={`${shortWeek(w.week)} — ${w.demand} needed, ${w.supply} available`}
              style={{
                flex: 1, height: h, background: col, borderRadius: 2, minWidth: 3,
                cursor: 'default', transition: 'height .2s ease',
                /* The supply line is the whole point of the chart: bars above it
                   are work with nobody to do it. */
                boxShadow: w.supply > 0 ? `inset 0 -${Math.min(h, (w.supply / worst) * 34)}px 0 0 rgba(255,255,255,0.16)` : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function CapacityPanel({ projectIds }: { projectIds?: string[] }) {
  const qs = projectIds && projectIds.length ? `?projectIds=${projectIds.join(',')}` : '';
  const { data, error, isLoading } = useSWR<Payload>(`/api/intelligence/capacity${qs}`, fetcher, { revalidateOnFocus: false });

  const card: React.CSSProperties = { background: NEST, border: `1px solid ${NEST_BORDER}`, borderRadius: 12, padding: 14 };

  if (isLoading) return <div style={{ ...card, color: DIM, fontSize: 12.5, textAlign: 'center', padding: 30 }}>Reading crews, schedules and time…</div>;
  if (error) return (
    <div style={{ ...card, textAlign: 'center', padding: 26 }}>
      <WarningCircle size={18} weight="fill" color={RED} />
      <div style={{ color: RED, fontSize: 12.5, fontWeight: 700, marginTop: 8 }}>Couldn&apos;t load capacity.</div>
    </div>
  );

  const caps = data?.capacity || [];
  const curve = data?.curve || [];
  const moves = data?.levelling || [];
  const util = data?.utilisation || [];
  const crew = data?.crew;

  if (caps.length === 0 && curve.length === 0 && util.length === 0) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: 30, color: DIM, fontSize: 12.5, lineHeight: 1.7 }}>
        <UsersThree size={26} weight="duotone" color={DIM} />
        <div style={{ fontWeight: 800, color: TEXT, marginTop: 10, fontSize: 13.5 }}>No capacity signal yet</div>
        <div style={{ marginTop: 5, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
          This reads schedule tasks (with a trade and dates), the employee roster, and booked time.
          {crew ? ` ${crew.headcount} active employee${crew.headcount === 1 ? '' : 's'} on the roster.` : ''}
        </div>
      </div>
    );
  }

  return (
    <div>
      {crew && (
        <div style={{ ...card, marginBottom: 12, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          {([
            ['Crew', String(crew.headcount), `${crew.trades} trade${crew.trades === 1 ? '' : 's'}`, TEXT],
            ['Trades short', String(crew.overloadedTrades ?? 0), 'demand over supply', (crew.overloadedTrades ?? 0) > 0 ? RED : GREEN],
            ['Overtime booked', `${crew.overtimeHours ?? 0}h`, 'across the roster', (crew.overtimeHours ?? 0) > 0 ? AMBER : DIM],
          ] as [string, string, string, string][]).map(([lab, val, sub, tone]) => (
            <div key={lab} style={{ flex: '1 1 130px', minWidth: 120 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: DIM, letterSpacing: 0.5, textTransform: 'uppercase' }}>{lab}</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: tone, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
              <div style={{ fontSize: 10.5, color: DIM }}>{sub}</div>
            </div>
          ))}
          {(crew.tradesWithNoCrew?.length ?? 0) > 0 && (
            <div style={{ flex: '2 1 240px', fontSize: 11, color: RED, fontWeight: 600 }}>
              Work scheduled with nobody to do it: {crew.tradesWithNoCrew!.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* A shift that was never clocked out is a time-clock defect to go and
          fix, not a workload signal — so it is named here and kept out of the
          utilisation maths below rather than silently averaged in. */}
      {(data?.suspectEntries?.length ?? 0) > 0 && (
        <div style={{ ...card, marginBottom: 12, borderLeft: `3px solid ${AMBER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <WarningCircle size={15} weight="fill" color={AMBER} />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: TEXT }}>
              {data!.suspectEntries!.length} time entr{data!.suspectEntries!.length === 1 ? 'y' : 'ies'} need fixing
            </span>
            <span style={{ fontSize: 10.5, color: DIM }}>excluded from utilisation below so they don&apos;t skew it</span>
          </div>
          {data!.suspectEntries!.slice(0, 6).map((s, i) => (
            <div key={`${s.employeeId}-${s.workDate}-${i}`} style={{ display: 'flex', gap: 10, alignItems: 'baseline', borderTop: `1px solid ${HAIR}`, padding: '5px 0' }}>
              <span style={{ fontSize: 11.5, color: TEXT, fontWeight: 700, minWidth: 0, flex: '1 1 150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
              <span style={{ fontSize: 10.5, color: DIM, whiteSpace: 'nowrap' }}>{s.workDate}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: AMBER, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{s.hours}h</span>
            </div>
          ))}
          <div style={{ fontSize: 10.5, color: DIM, marginTop: 7, lineHeight: 1.5 }}>
            Each of these is one entry spanning days or weeks — a clock-in with no matching clock-out.
          </div>
        </div>
      )}

      {curve.length >= 2 && (
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <ChartLine size={15} weight="duotone" color={GOLD} />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: TEXT }}>Cost curve</span>
            <span style={{ fontSize: 10.5, color: DIM }}>planned vs actual vs where this rate lands</span>
          </div>
          <SCurve curve={curve} basis={data!.curveBasis} />
        </div>
      )}

      {caps.length > 0 && (
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <UsersThree size={15} weight="duotone" color={GOLD} />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: TEXT }}>Crew demand by trade</span>
            <span style={{ fontSize: 10.5, color: DIM }}>next {data?.meta.horizonWeeks} weeks · bar above the pale line is work with nobody free</span>
          </div>
          {caps.map((t) => <TradeStrip key={t.trade} t={t} />)}
        </div>
      )}

      {moves.length > 0 && (
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <ArrowsLeftRight size={15} weight="duotone" color={GOLD} />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: TEXT }}>Resource levelling</span>
            <span style={{ fontSize: 10.5, color: DIM }}>tasks with float that can move — critical-path tasks are never suggested</span>
          </div>
          {moves.map((m) => (
            <div key={m.taskName} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', borderTop: `1px solid ${HAIR}`, padding: '7px 0' }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: GREEN, background: `${GREEN}1A`, border: `1px solid ${GREEN}44`, borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                +{m.floatDays}d float
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: TEXT }}>{m.taskName}</span>
                <span style={{ display: 'block', fontSize: 11, color: DIM, marginTop: 1 }}>{m.suggestion}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {util.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Clock size={15} weight="duotone" color={GOLD} />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: TEXT }}>Actual utilisation</span>
            <span style={{ fontSize: 10.5, color: DIM }}>booked hours against a {40}-hour week</span>
          </div>
          {util.slice(0, 10).map((u) => {
            const over = u.avgUtilisation > 100;
            const tone = over ? RED : u.avgUtilisation >= 70 ? GREEN : DIM;
            return (
              <div key={u.employeeId} style={{ display: 'flex', gap: 10, alignItems: 'center', borderTop: `1px solid ${HAIR}`, padding: '6px 0' }}>
                <span style={{ flex: '1 1 150px', minWidth: 0, fontSize: 12, color: TEXT, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.name}
                  <span style={{ color: DIM, fontWeight: 500 }}> · {u.trade}</span>
                </span>
                <span style={{ flex: '2 1 160px', minWidth: 90, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
                  <span style={{ position: 'absolute', inset: 0, width: `${Math.min(100, u.avgUtilisation)}%`, background: tone, borderRadius: 3 }} />
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: tone, fontVariantNumeric: 'tabular-nums', minWidth: 46, textAlign: 'right' }}>
                  {u.avgUtilisation.toFixed(0)}%
                </span>
                <span style={{ fontSize: 10.5, color: u.overtimeHours > 0 ? AMBER : DIM, minWidth: 62, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {u.overtimeHours > 0 ? `${u.overtimeHours}h OT` : `${u.totalHours}h`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
