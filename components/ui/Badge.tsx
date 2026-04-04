'use client';
/**
 * Badge — Status badges, labels, and pills.
 * Variants: default, success, warning, danger, info, gold.
 */
import React from 'react';
import { colors, font, radius } from '../../lib/design-tokens';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gold';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
}

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; color: string; border: string }> = {
  default: { bg: 'rgba(255,255,255,.06)', color: colors.textMuted, border: 'rgba(255,255,255,.08)' },
  success: { bg: 'rgba(34,197,94,.12)', color: colors.green, border: 'rgba(34,197,94,.25)' },
  warning: { bg: 'rgba(245,158,11,.12)', color: colors.orange, border: 'rgba(245,158,11,.25)' },
  danger:  { bg: 'rgba(239,68,68,.12)', color: colors.red, border: 'rgba(239,68,68,.25)' },
  info:    { bg: 'rgba(59,130,246,.12)', color: colors.blue, border: 'rgba(59,130,246,.25)' },
  gold:    { bg: colors.goldDim, color: colors.gold, border: colors.goldBorder },
};

export default function Badge({ children, variant = 'default', size = 'sm', dot }: BadgeProps) {
  const v = VARIANT_STYLES[variant];
  const isSm = size === 'sm';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: isSm ? '2px 8px' : '3px 10px',
        fontSize: isSm ? font.size.xs : font.size.sm,
        fontWeight: font.weight.bold,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        borderRadius: radius.full,
        background: v.bg,
        color: v.color,
        border: `1px solid ${v.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {dot && (
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: v.color,
          flexShrink: 0,
        }} />
      )}
      {children}
    </span>
  );
}
