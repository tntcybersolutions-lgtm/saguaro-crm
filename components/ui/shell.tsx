import React from 'react';

// ─── Design Tokens ────────────────────────────────────────────────────────────
// Jet black + glass + neon yellow (docs/COPY-STYLE.md §6–§7). Status hues are
// the one neon-on-black family from lib/status-colors.ts.
export const T = {
  bg: 'var(--bg-base)',
  surface: 'rgba(255,255,255,0.045)',
  surface2: 'rgba(255,255,255,0.045)',
  elevated: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)',
  borderSubtle: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.22)',
  borderGold: 'rgba(255,224,0,0.35)',
  gold: 'var(--brand-primary)',
  goldBright: 'var(--brand-primary-hi)',
  goldDim: 'rgba(255,224,0,0.12)',
  goldMid: 'rgba(255,224,0,0.18)',
  white: 'var(--text-primary)',
  muted: 'var(--text-secondary)',
  faint: 'var(--text-tertiary)',
  green: 'var(--success)',
  greenDim: 'rgba(74,222,128,0.16)',
  red: 'var(--danger)',
  redDim: 'rgba(248,113,113,0.16)',
  amber: 'var(--brand-primary)',
  amberDim: 'rgba(255,224,0,0.16)',
  blue: 'var(--warning)',
  blueDim: 'rgba(251,191,36,0.16)',
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
// Flat (2026-10-10): content on the page under a hairline — no tray, no blur,
// no radius, no shadow.
export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        borderTop: '1px solid var(--sg-border)',
        minWidth: 0,
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
        padding: '10px 0 8px',
        borderBottom: '1px solid var(--sg-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 36,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: '12px 0', ...style }}>
      {children}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeColor = 'gold' | 'green' | 'red' | 'amber' | 'blue' | 'muted';

const badgeStyles: Record<BadgeColor, { bg: string; color: string; border: string }> = {
  gold:  { bg: T.goldDim,  color: 'var(--text-primary)',  border: T.borderGold },
  green: { bg: T.greenDim, color: T.green, border: 'rgba(74,222,128,0.50)' },
  red:   { bg: T.redDim,   color: T.red,   border: 'rgba(248,113,113,0.50)' },
  amber: { bg: T.amberDim, color: T.amber, border: 'rgba(255,224,0,0.50)' },
  blue:  { bg: T.blueDim,  color: T.blue,  border: 'rgba(251,191,36,0.50)' },
  muted: { bg: 'rgba(148,163,184,0.16)', color: T.muted, border: 'rgba(148,163,184,0.45)' },
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
// One figure, flat (2026-10-10): value 17px bold over an 11px label, a hairline
// on its left. `icon` is accepted and not drawn — no icon chips.
export function StatCard({ label, value, sub }: { icon?: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="pmFig pmFigSolo">
      <span className="pmFigIn">
        <span className="pmFigV">{value}</span>
        <span className="pmFigText">
          <span className="pmFigL"><span>{label}</span></span>
          {sub && <span className="pmFigS">{sub}</span>}
        </span>
      </span>
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
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--sg-text)', letterSpacing: '-0.01em', lineHeight: 1.25 }}>{title}</h2>
        {sub && <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--sg-text-2)', lineHeight: 1.45 }}>{sub}</p>}
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
  primary: { background: T.gold, color: 'var(--on-brand)' },
  ghost: { background: 'none', color: 'var(--sg-text)', border: '1px solid var(--sg-border-strong)' },
  danger: { background: T.redDim, color: T.red, border: `1px solid rgba(248,113,113,0.50)` },
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
