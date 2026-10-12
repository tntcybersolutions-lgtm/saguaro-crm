'use client';

/**
 * <GradientButton> — the kit's premium CTA.
 *  - primary: gold gradient fill with a shine sweep + hover lift
 *  - ghost:   transparent with a gold border
 *  - subtle:  faint gold tint (secondary actions)
 * Renders an <a> when `href` is given, otherwise a <button>. Presentational
 * only — pass your own onClick/href for behavior.
 */

import React, { useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import { GOLD, GOLD_HI } from './fx';

type Variant = 'primary' | 'ghost' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

export interface GradientButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  target?: string;
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
  style?: React.CSSProperties;
}

const SIZES: Record<Size, { pad: string; font: number; gap: number; radius: number; icon: number }> = {
  sm: { pad: '8px 14px', font: 13, gap: 7, radius: 10, icon: 15 },
  md: { pad: '11px 20px', font: 14.5, gap: 8, radius: 12, icon: 17 },
  lg: { pad: '15px 28px', font: 16, gap: 10, radius: 14, icon: 19 },
};

export function GradientButton({
  children,
  onClick,
  href,
  target,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  type = 'button',
  title,
  style,
}: GradientButtonProps) {
  const [hover, setHover] = useState(false);
  const s = SIZES[size];
  const isDisabled = disabled || loading;

  const base: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s.gap,
    width: fullWidth ? '100%' : undefined,
    padding: s.pad,
    fontSize: s.font,
    fontWeight: 800,
    letterSpacing: '-0.01em',
    borderRadius: s.radius,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    transition: 'transform .16s ease, box-shadow .16s ease, filter .16s ease, border-color .16s ease, background .16s ease',
    transform: hover && !isDisabled ? 'translateY(-1px)' : 'none',
    opacity: isDisabled ? 0.55 : 1,
    ...style,
  };

  const variantStyle: React.CSSProperties =
    variant === 'primary'
      ? {
          color: 'var(--on-brand)',
          border: '1px solid transparent',
          background: `var(--brand-primary)`,
          boxShadow: hover && !isDisabled
            ? `0 8px 22px var(--brand-primary-35), inset 0 1px 0 rgba(255,255,255,0.35)`
            : `0 4px 14px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)`,
          filter: hover && !isDisabled ? 'brightness(1.04)' : 'none',
        }
      : variant === 'ghost'
      ? {
          color: 'var(--sg-text)',
          border: `1px solid ${hover && !isDisabled ? 'color-mix(in srgb, var(--brand-primary) 55%, transparent)' : 'var(--sg-border-strong)'}`,
          background: hover && !isDisabled
            ? 'linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.04))'
            : 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
        }
      : {
          color: 'var(--text-primary)',
          border: '1px solid var(--border-default)',
          background: hover && !isDisabled
            ? 'color-mix(in srgb, var(--brand-primary) 18%, transparent)'
            : 'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
        };

  const inner = (
    <>
      {/* shine sweep on primary */}
      {variant === 'primary' && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%)',
            backgroundSize: '200% 100%',
            backgroundPosition: hover ? '-120% 0' : '180% 0',
            transition: 'background-position .7s ease',
            pointerEvents: 'none',
          }}
        />
      )}
      {loading ? (
        <CircleNotch size={s.icon} weight="bold" className="sgSpin" />
      ) : (
        icon
      )}
      <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
      {iconRight && !loading && iconRight}
    </>
  );

  const handlers = {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    className: 'sgUi',
    style: { ...base, ...variantStyle },
    title,
  };

  if (href && !isDisabled) {
    return (
      <a href={href} target={target} rel={target === '_blank' ? 'noopener noreferrer' : undefined} onClick={onClick} {...handlers}>
        {inner}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={isDisabled} {...handlers}>
      {inner}
    </button>
  );
}

export default GradientButton;
