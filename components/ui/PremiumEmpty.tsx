'use client';

/**
 * <PremiumEmpty> — nothing here yet, flat (owner approved 2026-10-10): one
 * plain line and one action. No medallion, no halo, no ring, no aurora. The
 * title leads the line in the body colour (red for `tone="red"`), the
 * description finishes it, the action sits beside it.
 *
 * Same API as before, so no caller breaks. A `secondaryLabel` stays reachable
 * as a quiet text button after the primary. `variant="dropzone"` keeps its
 * job — the whole area is the drop / tap target — as a dashed hairline box.
 * `icon`, `aurora` are accepted and not drawn.
 *
 * Styles: the FLAT SHARED PARTS block in app/globals.css (.pmEmpty).
 */

import React from 'react';
import { GradientButton } from './GradientButton';

type Variant = 'card' | 'dropzone' | 'plain';
type Tone = 'gold' | 'green' | 'red' | 'blue';

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
  /** Not drawn — there is no backdrop. */
  aurora?: boolean;
  compact?: boolean;
  style?: React.CSSProperties;
  className?: string;
  /** Extra content under the line (e.g. accepted-file chips). */
  children?: React.ReactNode;
}

export function PremiumEmpty({
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
  compact = false,
  style,
  className,
  children,
}: PremiumEmptyProps) {
  const isDrop = variant === 'dropzone';
  // In dropzone mode the whole area is the target, so the button only labels it.
  const zoneClick = isDrop && onAction ? onAction : undefined;
  const t = title.trim();
  const joiner = /[.!?…]$/.test(t) ? ' ' : '. ';

  return (
    <div
      className={className}
      data-tone={tone === 'red' ? 'error' : undefined}
      onClick={zoneClick}
      role={zoneClick ? 'button' : undefined}
      tabIndex={zoneClick ? 0 : undefined}
      onKeyDown={zoneClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zoneClick(); } } : undefined}
      style={{
        cursor: zoneClick ? 'pointer' : undefined,
        ...(isDrop ? { border: '1px dashed var(--sg-border-strong)', borderRadius: 10, padding: compact ? '12px 14px' : '16px' } : null),
        ...style,
      }}
    >
      <div className="pmEmpty" data-tone={tone === 'red' ? 'error' : undefined} style={isDrop || compact ? { padding: 0 } : undefined}>
        <p className="pmEmptyLine"><b>{t}</b>{description != null ? <>{joiner}{description}</> : null}</p>
        {(actionLabel || secondaryLabel) && (
          <div className="pmEmptyActs">
            {actionLabel && (
              <GradientButton variant="primary" size="md" href={actionHref} onClick={zoneClick ? undefined : onAction}>
                {actionLabel}
              </GradientButton>
            )}
            {secondaryLabel && (
              // Its own action — never also the drop zone's.
              <span onClick={zoneClick ? (e) => e.stopPropagation() : undefined} style={{ display: 'inline-flex' }}>
                <GradientButton variant="ghost" size="md" href={secondaryHref} onClick={onSecondary}>
                  {secondaryLabel}
                </GradientButton>
              </span>
            )}
          </div>
        )}
      </div>
      {children != null && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}

export default PremiumEmpty;
