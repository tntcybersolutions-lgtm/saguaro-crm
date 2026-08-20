'use client';
/**
 * Button — Saguaro design system button component.
 * Variants: primary (gold), secondary (outline), ghost, danger.
 * Sizes: sm, md, lg.
 */
import React from 'react';
import { colors, font, radius } from '../../lib/design-tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANT_STYLES: Record<Variant, { bg: string; color: string; border: string; hoverBg: string }> = {
  primary:   { bg: colors.gold, color: colors.dark, border: 'transparent', hoverBg: '#e5b020' },
  secondary: { bg: 'transparent', color: colors.gold, border: colors.goldBorder, hoverBg: colors.goldDim },
  ghost:     { bg: 'transparent', color: colors.textMuted, border: 'transparent', hoverBg: 'rgba(255,255,255,.04)' },
  danger:    { bg: 'rgba(239,68,68,.12)', color: colors.red, border: 'rgba(239,68,68,.3)', hoverBg: 'rgba(239,68,68,.2)' },
};

const SIZE_STYLES: Record<Size, { padding: string; fontSize: string; height: number; iconSize: number }> = {
  sm: { padding: '0 12px', fontSize: font.size.sm, height: 30, iconSize: 14 },
  md: { padding: '0 16px', fontSize: font.size.md, height: 36, iconSize: 16 },
  lg: { padding: '0 24px', fontSize: font.size.lg, height: 42, iconSize: 18 },
};

export default function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  fullWidth = false,
  disabled,
  children,
  style,
  ...props
}: ButtonProps) {
  const v = VARIANT_STYLES[variant];
  const s = SIZE_STYLES[size];
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      role="button"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: s.height,
        padding: s.padding,
        background: v.bg,
        color: v.color,
        border: `1px solid ${v.border}`,
        borderRadius: radius.lg,
        fontSize: s.fontSize,
        fontWeight: font.weight.bold,
        fontFamily: font.family,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
        transition: 'background .15s, opacity .15s, box-shadow .15s',
        whiteSpace: 'nowrap',
        width: fullWidth ? '100%' : undefined,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!isDisabled) e.currentTarget.style.background = v.hoverBg;
      }}
      onMouseLeave={(e) => {
        if (!isDisabled) e.currentTarget.style.background = v.bg;
      }}
      {...props}
    >
      {loading ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={s.iconSize} height={s.iconSize} viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4 31.4" />
          </svg>
          {children}
        </span>
      ) : (
        <>
          {icon}
          {children}
          {iconRight}
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
