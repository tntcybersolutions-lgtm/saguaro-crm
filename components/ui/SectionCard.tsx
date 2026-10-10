'use client';

/**
 * <SectionCard> — a section of a page, flat by default (owner approved
 * 2026-10-10): the content sits on the page under a small caps label and a
 * hairline. No tray, no gradient, no glow, no radius, no shadow, no hover
 * lift. The body keeps the page's own inset (16px on a phone, set by the
 * page), so nothing is padded twice.
 *
 * `tray` is the opt-in for the rare thing that must stay raised — a dialog
 * body, a picker: a solid surface with a hairline border, padded by `padding`.
 *
 * Same API as the premium SectionCard (components/ui/premium.tsx), and every
 * existing prop still works: `flat` is the default now; `glow`, `hover` and
 * `accentBar` are accepted and not drawn; `padding` pads a tray's body.
 * Styles: the FLAT SHARED PARTS block in app/globals.css.
 */

import React from 'react';

export interface SectionCardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  /** Body padding of a `tray`. A flat section sits at the page's own inset. */
  padding?: number;
  /** Not drawn — the flat section has no glow. */
  glow?: boolean;
  /** Not drawn — nothing lifts on hover. */
  hover?: boolean;
  /** Not drawn — no accent edge. */
  accentBar?: boolean;
  /** Kept for callers: flat is the default now. */
  flat?: boolean;
  /** The rare raised surface (dialogs, pickers): solid fill + hairline border. */
  tray?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}

export function SectionCard({
  title,
  subtitle,
  icon,
  actions,
  children,
  padding = 16,
  tray = false,
  onClick,
  className,
  style,
  bodyStyle,
}: SectionCardProps) {
  const hasHead = title != null || subtitle != null || actions != null;
  return (
    <div
      className={`${tray ? 'pmSec pmSecTray' : 'pmSec'}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : undefined, ...style }}
    >
      {hasHead && (
        <div className="pmSecHead">
          {tray && icon != null && <span aria-hidden style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--sg-text-3)' }}>{icon}</span>}
          <div style={{ minWidth: 0, flex: 1 }}>
            {title != null && <div className="pmSecTitle" role="heading" aria-level={2}>{title}</div>}
            {subtitle != null && <div className="pmSecSub">{subtitle}</div>}
          </div>
          {actions != null && <div style={{ flex: '0 0 auto', display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
        </div>
      )}
      {children != null && (
        <div style={{ padding: tray ? padding : 0, minWidth: 0, ...bodyStyle }}>{children}</div>
      )}
    </div>
  );
}

export default SectionCard;
