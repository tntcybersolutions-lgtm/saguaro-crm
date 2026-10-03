'use client';

/**
 * <PremiumEmpty> — a gorgeous empty / zero-state: a glowing icon medallion
 * (radial halo + expanding ring), a bold title, supporting copy, and a primary
 * CTA (+ optional secondary). `variant="dropzone"` gives the breathing dashed
 * frame + blueprint interior from the Takeoff upload zone (purely the *look* —
 * wire your own onAction).
 *
 * A drop-in richer replacement for <EmptyState> (compatible prop names).
 * Renders <UiFx/> itself. Theme-aware. Presentational only.
 */

import React, { useState } from 'react';
import { FolderOpen } from '@phosphor-icons/react';
import { Aurora, UiFx, gold, GOLD, GOLD_HI } from './fx';
import { GradientButton } from './GradientButton';

type Variant = 'card' | 'dropzone' | 'plain';
type Tone = 'gold' | 'green' | 'red' | 'blue';

const TONES: Record<Tone, string> = {
  gold: 'var(--brand-primary)',
  green: '#2CFF7A',
  red: '#FF3B30',
  blue: '#FF8A00',
};

export interface PremiumEmptyProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryHref?: string;
  variant?: Variant;
  tone?: Tone;
  /** Show the aurora backdrop behind the state (default on for dropzone). */
  aurora?: boolean;
  compact?: boolean;
  style?: React.CSSProperties;
  className?: string;
  /** Extra content under the CTAs (e.g. accepted-file chips). */
  children?: React.ReactNode;
}

export function PremiumEmpty({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  secondaryLabel,
  onSecondary,
  secondaryHref,
  variant = 'card',
  tone = 'gold',
  aurora,
  compact = false,
  style,
  className,
  children,
}: PremiumEmptyProps) {
  const [hover, setHover] = useState(false);
  const isDrop = variant === 'dropzone';
  const showAurora = aurora ?? isDrop;
  const toneColor = TONES[tone];
  const toneMix = (a: number) => `color-mix(in srgb, ${toneColor} ${a}%, transparent)`;
  const interactive = isDrop && (onAction != null || actionHref != null);

  const clickable = interactive ? { onClick: onAction, style: { cursor: 'pointer' } } : {};

  return (
    <div
      className={`sgUi${className ? ` ${className}` : ''}`}
      onMouseEnter={() => interactive && setHover(true)}
      onMouseLeave={() => interactive && setHover(false)}
      {...clickable}
      style={{
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: compact ? '36px 24px' : `${isDrop ? 72 : 56}px 28px`,
        borderRadius: 22,
        border: variant === 'plain'
          ? 'none'
          : isDrop
          ? `2px dashed ${hover ? toneMix(60) : toneMix(38)}`
          : `1px solid var(--sg-border)`,
        background: variant === 'plain'
          ? 'transparent'
          : isDrop
          ? `radial-gradient(circle at 50% 28%, ${toneMix(8)}, var(--sg-surface-to))`
          : 'linear-gradient(160deg, var(--sg-surface-from), var(--sg-surface-to))',
        boxShadow: variant === 'plain' ? 'none' : isDrop ? 'none' : 'var(--sg-shadow)',
        transform: interactive && hover ? 'scale(1.008)' : 'none',
        transition: 'transform .2s ease, border-color .2s ease',
        ...(clickable as { style?: React.CSSProperties }).style,
        ...style,
      }}
    >
      {(showAurora || isDrop) && <UiFx />}
      {showAurora && <Aurora soft grid={isDrop} />}

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Glowing medallion */}
        <div
          style={{
            position: 'relative',
            display: 'inline-flex',
            width: compact ? 72 : 96,
            height: compact ? 72 : 96,
            borderRadius: '50%',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: compact ? 16 : 22,
            background: `radial-gradient(circle, ${toneMix(24)}, ${toneMix(4)})`,
            border: `1px solid ${toneMix(42)}`,
            color: tone === 'gold' ? GOLD_HI : toneColor,
            boxShadow: `0 0 0 6px ${toneMix(8)}`,
            animation: 'sgFloat 5s ease-in-out infinite',
          }}
        >
          <div aria-hidden style={{ position: 'absolute', inset: -1, borderRadius: '50%', border: `1px solid ${toneColor}`, animation: 'sgRing 3s ease-out infinite' }} />
          {icon ?? <FolderOpen size={compact ? 32 : 42} weight="duotone" />}
        </div>

        <h3
          style={{
            margin: 0,
            fontSize: compact ? 18 : 22,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--sg-text)',
          }}
        >
          {title}
        </h3>

        {description != null && (
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 14.5,
              color: 'var(--sg-text-2)',
              maxWidth: 440,
              lineHeight: 1.55,
            }}
          >
            {description}
          </p>
        )}

        {(actionLabel || secondaryLabel) && (
          <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
            {actionLabel && (
              <GradientButton
                variant="primary"
                size={compact ? 'md' : 'lg'}
                href={actionHref}
                // In dropzone mode the whole card is the click target, so the
                // button just visually anchors the CTA (parent handles onClick).
                onClick={interactive ? undefined : onAction}
              >
                {actionLabel}
              </GradientButton>
            )}
            {secondaryLabel && (
              <GradientButton variant="ghost" size={compact ? 'md' : 'lg'} href={secondaryHref} onClick={onSecondary}>
                {secondaryLabel}
              </GradientButton>
            )}
          </div>
        )}

        {children != null && <div style={{ marginTop: 18 }}>{children}</div>}
      </div>
    </div>
  );
}

export default PremiumEmpty;
