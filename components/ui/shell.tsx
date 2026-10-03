import React from 'react';

// ─── Design Tokens ────────────────────────────────────────────────────────────
// Jet black + glass + neon yellow (docs/COPY-STYLE.md §6–§7). Status hues are
// the one neon-on-black family from lib/status-colors.ts.
export const T = {
  bg: '#000000',
  surface: 'rgba(255,255,255,0.045)',
  surface2: 'rgba(255,255,255,0.045)',
  elevated: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)',
  borderSubtle: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.22)',
  borderGold: 'rgba(255,230,0,0.35)',
  gold: '#FFE600',
  goldBright: '#FFF04A',
  goldDim: 'rgba(255,230,0,0.12)',
  goldMid: 'rgba(255,230,0,0.18)',
  white: '#FFFFFF',
  muted: '#D7DEE8',
  faint: '#A9B4C4',
  green: '#2CFF7A',
  greenDim: 'rgba(44,255,122,0.16)',
  red: '#FF3B30',
  redDim: 'rgba(255,59,48,0.16)',
  amber: '#FFE600',
  amberDim: 'rgba(255,230,0,0.16)',
  blue: '#FF8A00',
  blueDim: 'rgba(255,138,0,0.16)',
  shadowSm: '0 1px 2px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
  shadowMd: '0 4px 14px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
  shadowLg: '0 16px 44px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
  glassBlur: 'blur(16px) saturate(140%)',
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
        background: T.surface2,
        backdropFilter: T.glassBlur, WebkitBackdropFilter: T.glassBlur,
        border: `1px solid ${T.borderSubtle}`,
        borderRadius: 14,
        boxShadow: T.shadowMd,
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
        borderBottom: `1px solid ${T.borderSubtle}`,
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
  green: { bg: T.greenDim, color: T.green, border: 'rgba(44,255,122,0.50)' },
  red:   { bg: T.redDim,   color: T.red,   border: 'rgba(255,59,48,0.50)' },
  amber: { bg: T.amberDim, color: T.amber, border: 'rgba(255,230,0,0.50)' },
  blue:  { bg: T.blueDim,  color: T.blue,  border: 'rgba(255,138,0,0.50)' },
  muted: { bg: 'rgba(163,172,187,0.16)', color: T.muted, border: 'rgba(163,172,187,0.45)' },
};

/** Title Case a raw lowercase/snake_case value for DISPLAY only ("in_progress"
 *  → "In Progress"). Labels that already carry capitals are left as written. */
function displayLabel(label: string): string {
  if (label !== label.toLowerCase()) return label;
  return label.replace(/_/g, ' ').replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

export function Badge({ label, color = 'muted' }: { label: string; color?: BadgeColor }) {
  const s = badgeStyles[color];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {displayLabel(label)}
    </span>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        background: T.surface2,
        backdropFilter: T.glassBlur, WebkitBackdropFilter: T.glassBlur,
        border: `1px solid ${T.borderSubtle}`,
        borderRadius: 14,
        boxShadow: T.shadowSm,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 8,
            background: T.surface,
            border: `1px solid ${T.borderSubtle}`,
            fontSize: 15,
            color: T.muted,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <span
          style={{
            fontSize: 12.5,
            color: T.muted,
            fontWeight: 600,
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: T.white, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: T.faint }}>{sub}</div>}
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
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.white, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{title}</h2>
        {sub && <p style={{ margin: '6px 0 0', fontSize: 13, color: T.muted, lineHeight: 1.5 }}>{sub}</p>}
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
  borderRadius: 10,
  transition: 'opacity 0.15s, background 0.15s, border-color 0.15s',
  fontFamily: 'inherit',
  letterSpacing: '0.01em',
  whiteSpace: 'nowrap',
};

const btnVariants: Record<BtnVariant, React.CSSProperties> = {
  primary: { background: T.gold, color: '#0A0A00', boxShadow: T.shadowSm },
  ghost: { background: T.elevated, backdropFilter: T.glassBlur, WebkitBackdropFilter: T.glassBlur, color: T.white, border: `1px solid ${T.border}` },
  danger: { background: T.redDim, color: T.red, border: `1px solid rgba(255,59,48,0.50)` },
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
        background: 'rgba(255,255,255,0.08)',
        borderRadius: 999,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${clampedPct}%`,
          background: color || T.gold,
          borderRadius: 999,
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
                  fontSize: 12,
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
              style={{ borderBottom: `1px solid ${T.borderSubtle}` }}
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
                style={{ padding: '40px 12px', textAlign: 'center', color: T.faint, fontSize: 13 }}
              >
                No data yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
