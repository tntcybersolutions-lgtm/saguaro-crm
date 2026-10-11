'use client';

/**
 * <SMeter> — analog S/RF meter for the Saguaro Radio dispatch console.
 *
 * A classic communications-receiver signal meter rendered as inline SVG in
 * the premium dark-kit language: dark face, hairline bezel, glass highlight,
 * ~100 degree scale arc with S1..S9 white ticks and a red +dB overdrive
 * zone, a tapered gold needle, RX/TX lamps, and an 'S / RF' legend.
 *
 * Motion: the needle is a single SVG <g> rotated about the pivot with a CSS
 * transition on transform (slight-overshoot cubic-bezier for the ballistic
 * spring feel). The transform lives entirely INSIDE the svg — it is never
 * applied to an HTML ancestor, so it can never capture position:fixed
 * popovers or otherwise disturb page layout. Feed it a sampled `level`
 * every ~100ms and the spring interpolates between samples.
 *
 * Purely presentational — the caller owns signal analysis and mode wiring.
 */

import React from 'react';

export type SMeterMode = 'idle' | 'rx' | 'tx';

export interface SMeterProps {
  /** rx while receiving traffic, tx while keyed up, idle otherwise. */
  mode: SMeterMode;
  /** Deflection 0..1 (clamped; non-finite values rest the needle). */
  level: number;
  /** Rendered width in px; height follows the face's aspect ratio. */
  width?: number;
}

/* ── Palette (jet black shell: white alphas, brand neon yellow, status red/green). SVG attributes cannot read CSS vars, so these are literal hexes of the tokens. ── */
const GOLD = 'var(--brand-primary)';
const GOLD_HI = 'var(--brand-primary-hi)';
const RED = 'var(--danger)';
const RED_SOFT = '#FF7A87';
const GREEN = 'var(--success)';
const TICK_WHITE = 'rgba(255,255,255,0.72)';
const TICK_FAINT = 'rgba(255,255,255,0.40)';
const LABEL_WHITE = 'rgba(255,255,255,0.62)';
const LEGEND = 'rgba(255,255,255,0.46)';
const HAIRLINE = 'rgba(255,255,255,0.13)';
const HAIRLINE_SOFT = 'rgba(255,255,255,0.07)';

/* ── Geometry (viewBox units) ────────────────────────────────────────────
 * Pivot sits just below the face; the scale spans ~100 degrees centered on
 * vertical (-50..+50). S1..S9 occupy the first 68% of the sweep; the last
 * 32% is the red +dB zone — the classic S-meter split. */
const VB_W = 220;
const VB_H = 128;
const CX = 110;
const CY = 118;
const ARC_START = -50;
const SWEEP = 100;
const S9_FRAC = 0.68;
const R_ARC = 93;
const R_TICK_OUT = 90;
const R_TICK_MAJOR = 80;
const R_TICK_MINOR = 84.5;
const R_LABEL = 101;
const R_NEEDLE = 86;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Point at `deg` from vertical (0 = straight up, positive clockwise). */
function polar(deg: number, r: number): { x: number; y: number } {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function arcPath(fromDeg: number, toDeg: number, r: number): string {
  const p1 = polar(fromDeg, r);
  const p2 = polar(toDeg, r);
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
}

const degAt = (frac: number) => ARC_START + frac * SWEEP;
const S9_DEG = degAt(S9_FRAC);

/* S1..S9 — odd units get long ticks + numerals, even units short ticks. */
const S_TICKS = Array.from({ length: 9 }, (_, i) => ({
  deg: degAt((i / 8) * S9_FRAC),
  major: i % 2 === 0,
  label: i % 2 === 0 ? String(i + 1) : null,
}));

/* Red +dB-over-S9 ticks: +10 / +20 / +30. */
const DB_TICKS = [10, 20, 30].map((db, i) => ({
  deg: degAt(S9_FRAC + ((i + 1) / 3) * (1 - S9_FRAC)),
  label: `+${db}`,
}));

const NEEDLE_SPRING_CSS = `
.sagSMeterNeedle {
  transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
  will-change: transform;
}
@media (prefers-reduced-motion: reduce) {
  .sagSMeterNeedle { transition: transform 120ms ease-out; }
}
`;

function Lamp({
  cx,
  cy,
  color,
  lit,
  label,
  labelAnchor,
  labelX,
}: {
  cx: number;
  cy: number;
  color: string;
  lit: boolean;
  label: string;
  labelAnchor: 'start' | 'end';
  labelX: number;
}) {
  return (
    <g>
      {lit && <circle cx={cx} cy={cy} r={8.5} fill={color} opacity={0.18} />}
      <circle
        cx={cx}
        cy={cy}
        r={4.2}
        fill={lit ? color : 'rgba(255,255,255,0.07)'}
        stroke={lit ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.16)'}
        strokeWidth={0.8}
      />
      {lit && <circle cx={cx - 1.2} cy={cy - 1.3} r={1.1} fill="rgba(255,255,255,0.55)" />}
      <text
        x={labelX}
        y={cy + 2.6}
        textAnchor={labelAnchor}
        fontSize={7}
        fontWeight={800}
        letterSpacing="0.08em"
        fill={lit ? color : LEGEND}
      >
        {label}
      </text>
    </g>
  );
}

export function SMeter({ mode, level, width = 132 }: SMeterProps) {
  /* Unique gradient/clip ids so several meters can share a page. */
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const faceId = `sagSMeterFace-${uid}`;
  const bezelId = `sagSMeterBezel-${uid}`;
  const glassId = `sagSMeterGlass-${uid}`;
  const needleId = `sagSMeterNeedleGrad-${uid}`;
  const clipId = `sagSMeterClip-${uid}`;

  const angle = ARC_START + clamp01(level) * SWEEP;
  const height = Math.round(width * (VB_H / VB_W));
  const tip = polar(0, R_NEEDLE); // needle drawn at rest (vertical); the group rotates

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={width}
      height={height}
      role="img"
      aria-label={`S/RF meter — ${mode === 'tx' ? 'transmitting' : mode === 'rx' ? 'receiving' : 'idle'}`}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <style>{NEEDLE_SPRING_CSS}</style>
      <defs>
        <linearGradient id={bezelId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#23232B" />
          <stop offset="1" stopColor="#101014" />
        </linearGradient>
        <linearGradient id={faceId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#17171C" />
          <stop offset="1" stopColor="#0B0B0E" />
        </linearGradient>
        <linearGradient id={glassId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.10)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <linearGradient id={needleId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={GOLD_HI} />
          <stop offset="1" stopColor={GOLD} />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x={6} y={6} width={VB_W - 12} height={VB_H - 12} rx={12} />
        </clipPath>
      </defs>

      {/* Bezel + face */}
      <rect x={0.75} y={0.75} width={VB_W - 1.5} height={VB_H - 1.5} rx={16} fill={`url(#${bezelId})`} stroke={HAIRLINE} strokeWidth={1} />
      <rect x={6} y={6} width={VB_W - 12} height={VB_H - 12} rx={12} fill={`url(#${faceId})`} stroke={HAIRLINE_SOFT} strokeWidth={1} />

      <g clipPath={`url(#${clipId})`}>
        {/* Scale arc — white S span, red +dB band */}
        <path d={arcPath(ARC_START, S9_DEG, R_ARC)} fill="none" stroke={TICK_FAINT} strokeWidth={1.4} />
        <path d={arcPath(S9_DEG, ARC_START + SWEEP, R_ARC)} fill="none" stroke={RED} strokeWidth={3} strokeLinecap="butt" />

        {/* S1..S9 ticks */}
        {S_TICKS.map((t, i) => {
          const o = polar(t.deg, R_TICK_OUT);
          const inn = polar(t.deg, t.major ? R_TICK_MAJOR : R_TICK_MINOR);
          return (
            <line
              key={`s${i}`}
              x1={inn.x}
              y1={inn.y}
              x2={o.x}
              y2={o.y}
              stroke={t.major ? TICK_WHITE : TICK_FAINT}
              strokeWidth={t.major ? 1.6 : 1}
            />
          );
        })}
        {S_TICKS.map((t, i) => {
          if (!t.label) return null;
          const p = polar(t.deg, R_LABEL);
          return (
            <text key={`sl${i}`} x={p.x} y={p.y + 2.5} textAnchor="middle" fontSize={8} fontWeight={700} fill={LABEL_WHITE}>
              {t.label}
            </text>
          );
        })}

        {/* +dB zone ticks */}
        {DB_TICKS.map((t, i) => {
          const o = polar(t.deg, R_TICK_OUT);
          const inn = polar(t.deg, R_TICK_MAJOR);
          const p = polar(t.deg, R_LABEL);
          return (
            <g key={`db${i}`}>
              <line x1={inn.x} y1={inn.y} x2={o.x} y2={o.y} stroke={RED_SOFT} strokeWidth={1.4} />
              <text x={p.x} y={p.y + 2.2} textAnchor="middle" fontSize={6.5} fontWeight={700} fill={RED_SOFT}>
                {t.label}
              </text>
            </g>
          );
        })}

        {/* Legend */}
        <text x={CX} y={76} textAnchor="middle" fontSize={9} fontWeight={800} letterSpacing="0.22em" fill={LEGEND}>
          S / RF
        </text>

        {/* Needle — rotation confined to this SVG group (spring via CSS class) */}
        <g
          className="sagSMeterNeedle"
          style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${CX}px ${CY}px` }}
        >
          <path
            d={`M ${CX - 2.4} ${CY} L ${CX - 0.7} ${tip.y} L ${CX + 0.7} ${tip.y} L ${CX + 2.4} ${CY} Z`}
            fill={`url(#${needleId})`}
          />
        </g>
        <circle cx={CX} cy={CY} r={6.5} fill="#1D1D23" stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
        <circle cx={CX} cy={CY} r={2} fill="rgba(255,255,255,0.30)" />

        {/* RX / TX lamps */}
        <Lamp cx={22} cy={110} color={GREEN} lit={mode === 'rx'} label="RX" labelAnchor="start" labelX={30.5} />
        <Lamp cx={198} cy={110} color={RED} lit={mode === 'tx'} label="TX" labelAnchor="end" labelX={189.5} />

        {/* Glass highlight across the upper face */}
        <path d={`M 6 6 H ${VB_W - 6} V 40 Q ${CX} 62 6 40 Z`} fill={`url(#${glassId})`} pointerEvents="none" />
      </g>
    </svg>
  );
}

export default SMeter;
