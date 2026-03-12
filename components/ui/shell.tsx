import React from 'react';

// ─── Design Tokens ────────────────────────────────────────────────────────────
export const T = {
  bg: '#09111A',
  surface: '#0E1A26',
  surface2: '#152030',
  border: 'rgba(255,255,255,0.07)',
  borderGold: 'rgba(212,160,23,0.3)',
  gold: '#D4A017',
  goldDim: 'rgba(212,160,23,0.12)',
  goldMid: 'rgba(212,160,23,0.22)',
  white: '#FFFFFF',
  muted: 'rgba(255,255,255,0.45)',
  faint: 'rgba(255,255,255,0.15)',
  green: '#22C55E',
  greenDim: 'rgba(34,197,94,0.12)',
  red: '#EF4444',
  redDim: 'rgba(239,68,68,0.12)',
  amber: '#F59E0B',
  amberDim: 'rgba(245,158,11,0.12)',
  blue: '#3B82F6',
  blueDim: 'rgba(59,130,246,0.12)',
} as const;

// ─── PageWrap ─────────────────────────────────────────────────────────────────
export function PageWrap({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: T.bg,
        color: T.white,
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: '20px', ...style }}>
      {children}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeColor = 'gold' | 'green' | 'red' | 'amber' | 'blue' | 'muted';

const badgeStyles: Record<BadgeColor, { bg: string; color: string; border: string }> = {
  gold:  { bg: T.goldDim,  color: T.gold,  border: T.borderGold },
  green: { bg: T.greenDim, color: T.green, border: 'rgba(34,197,94,0.25)' },
  red:   { bg: T.redDim,   color: T.red,   border: 'rgba(239,68,68,0.25)' },
  amber: { bg: T.amberDim, color: T.amber, border: 'rgba(245,158,11,0.25)' },
  blue:  { bg: T.blueDim,  color: T.blue,  border: 'rgba(59,130,246,0.25)' },
  muted: { bg: 'rgba(255,255,255,0.06)', color: T.muted, border: T.border },
};

export function Badge({ label, color = 'muted' }: { label: string; color?: BadgeColor }) {
  const s = badgeStyles[color];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 12, color: T.muted, fontWeight: 500, letterSpacing: '0.02em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: T.white, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.muted }}>{sub}</div>}
    </div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
export function SectionHeader({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.white, letterSpacing: '-0.02em' }}>{title}</h2>
        {sub && <p style={{ margin: '4px 0 0', fontSize: 13, color: T.muted }}>{sub}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ─── Btn ──────────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'ghost' | 'danger';
type BtnSize = 'sm' | 'md';

const btnBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  fontWeight: 600,
  cursor: 'pointer',
  border: 'none',
  borderRadius: 8,
  transition: 'opacity 0.15s, background 0.15s',
  fontFamily: 'inherit',
  letterSpacing: '0.01em',
};

const btnVariants: Record<BtnVariant, React.CSSProperties> = {
  primary: { background: T.gold, color: '#000' },
  ghost: { background: T.surface2, color: T.white, border: `1px solid ${T.border}` },
  danger: { background: T.redDim, color: T.red, border: `1px solid rgba(239,68,68,0.25)` },
};

const btnSizes: Record<BtnSize, React.CSSProperties> = {
  sm: { padding: '6px 14px', fontSize: 12 },
  md: { padding: '9px 18px', fontSize: 13 },
};

export function Btn({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  size?: BtnSize;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...btnBase,
        ...btnVariants[variant],
        ...btnSizes[size],
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────
export function ProgressBar({
  pct,
  color,
  height = 6,
}: {
  pct: number;
  color?: string;
  height?: number;
}) {
  const clampedPct = Math.max(0, Math.min(100, pct));
  return (
    <div
      style={{
        width: '100%',
        height,
        background: 'rgba(255,255,255,0.07)',
        borderRadius: height,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${clampedPct}%`,
          background: color || T.gold,
          borderRadius: height,
          transition: 'width 0.4s ease',
        }}
      />
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────
export function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  color: T.muted,
                  fontWeight: 600,
                  fontSize: 11,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  borderBottom: `1px solid ${T.border}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              style={{ borderBottom: `1px solid ${T.border}` }}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: '10px 12px',
                    color: T.white,
                    verticalAlign: 'middle',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={headers.length}
                style={{ padding: '32px 12px', textAlign: 'center', color: T.muted }}
              >
                No data available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
