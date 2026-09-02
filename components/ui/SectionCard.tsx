'use client';

/**
 * <SectionCard> — premium container panel.
 * Gradient surface + subtle border + soft inner glow, with an optional header
 * (icon chip · title · subtitle · right-aligned actions slot). Set `glow` for
 * an ambient gold inner glow, `hover` for a lift-on-hover, `accentBar` for the
 * left gold edge. Theme-aware. Presentational only.
 */

import React, { useState } from 'react';
import { gold, GOLD } from './fx';

export interface SectionCardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  padding?: number;
  glow?: boolean;
  hover?: boolean;
  accentBar?: boolean;
  /**
   * Content on the page rather than an object on a tray.
   *
   * Same meaning as the `flat` on the premium SectionCard, and written to match
   * it: header kept as a small uppercase label over a hairline, tray dropped —
   * no fill, no border, no radius, no shadow. Raised is reserved for things you
   * would point at and name.
   */
  flat?: boolean;
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
  padding = 20,
  glow = false,
  hover = false,
  accentBar = false,
  flat = false,
  onClick,
  className,
  style,
  bodyStyle,
}: SectionCardProps) {
  const [hovered, setHovered] = useState(false);
  const lift = hover && hovered;

  if (flat) {
    return (
      <div className={className} onClick={onClick} style={{ position: 'relative', ...style }}>
        {(title != null || icon != null || actions != null || subtitle != null) && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              paddingBottom: 9, marginBottom: 14,
              borderBottom: '1px solid var(--sg-border)',
            }}
          >
            {icon != null && <span style={{ display: 'inline-flex', flexShrink: 0, opacity: 0.9, color: GOLD }}>{icon}</span>}
            <div style={{ minWidth: 0, flex: 1 }}>
              {title != null && (
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--sg-text-2)', lineHeight: 1.3 }}>
                  {title}
                </div>
              )}
              {subtitle != null && (
                <div style={{ fontSize: 12.5, color: 'var(--sg-text-2)', marginTop: 3, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
                  {subtitle}
                </div>
              )}
            </div>
            {actions != null && <div style={{ flex: '0 0 auto', display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
          </div>
        )}
        {children != null && <div style={bodyStyle}>{children}</div>}
      </div>
    );
  }

  const boxShadow = [
    glow ? `inset 0 0 60px ${gold(5)}` : `inset 0 1px 0 var(--sg-inner-glow)`,
    lift
      ? `0 22px 50px -22px rgba(0,0,0,0.5), 0 0 0 1px ${gold(35)}`
      : 'var(--sg-shadow)',
  ].join(', ');

  const hasHeader = title != null || icon != null || actions != null || subtitle != null;

  return (
    <div
      className={`sgUi${className ? ` ${className}` : ''}`}
      onClick={onClick}
      onMouseEnter={() => hover && setHovered(true)}
      onMouseLeave={() => hover && setHovered(false)}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        border: `1px solid ${lift ? gold(45) : 'var(--sg-border)'}`,
        background: 'linear-gradient(160deg, var(--sg-surface-from), var(--sg-surface-to))',
        boxShadow,
        cursor: onClick ? 'pointer' : undefined,
        transform: lift ? 'translateY(-4px)' : 'none',
        transition: 'transform .2s cubic-bezier(.2,.7,.3,1), box-shadow .2s ease, border-color .2s ease',
        ...style,
      }}
    >
      {accentBar && (
        <div
          aria-hidden
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${GOLD}, transparent)` }}
        />
      )}

      {hasHeader && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: `${Math.min(padding, 18)}px ${padding}px`,
            borderBottom: children != null ? `1px solid var(--sg-border)` : undefined,
          }}
        >
          {icon != null && (
            <div
              style={{
                flex: '0 0 auto',
                display: 'inline-flex',
                width: 40,
                height: 40,
                borderRadius: 11,
                alignItems: 'center',
                justifyContent: 'center',
                background: `linear-gradient(150deg, ${gold(18)}, ${gold(5)})`,
                border: `1px solid ${gold(30)}`,
                color: GOLD,
              }}
            >
              {icon}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            {title != null && (
              <h2 className="sgSectionTitle" style={{ margin: 0, color: 'var(--sg-text)' }}>
                {title}
              </h2>
            )}
            {subtitle != null && (
              <div style={{ color: 'var(--sg-text-2)', fontSize: 12.5, marginTop: title != null ? 2 : 0, lineHeight: 1.4 }}>
                {subtitle}
              </div>
            )}
          </div>
          {actions != null && <div style={{ flex: '0 0 auto', display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
        </div>
      )}

      {children != null && (
        <div style={{ padding, position: 'relative', zIndex: 1, ...bodyStyle }}>{children}</div>
      )}
    </div>
  );
}

export default SectionCard;
