'use client';

/**
 * <ModuleHero> — page header on a glass panel over the jet-black page
 * (docs/COPY-STYLE.md §6), an optional Title Case eyebrow pill, a bold title with an optional gradient accent word, a subtitle, and a
 * right-aligned `actions` slot. Drop it at the top of any module page.
 *
 * Renders <UiFx/> itself, so the shared stylesheet + heading size-cap
 * overrides are always present. Theme-aware. Presentational only.
 *
 *   <ModuleHero
 *     eyebrow="Progress Billing" eyebrowIcon={<CurrencyDollar weight="fill" />}
 *     title="Bill the work." accent="Get paid faster."
 *     subtitle="AIA G702/G703 pay applications, generated from your SOV."
 *     actions={<GradientButton icon={<Plus/>}>New Pay App</GradientButton>}
 *   />
 */

import React from 'react';
import { Aurora, UiFx, gold, GOLD, GOLD_TEXT_GRADIENT } from './fx';

type Align = 'left' | 'center';
type Size = 'sm' | 'md' | 'lg';

export interface ModuleHeroProps {
  title: React.ReactNode;
  /** Gradient accent word/phrase rendered after the title (own line if `accentBreak`). */
  accent?: React.ReactNode;
  accentBreak?: boolean;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  eyebrowIcon?: React.ReactNode;
  /** Large icon chip shown left of the title (left-aligned layouts). */
  icon?: React.ReactNode;
  /** Right-aligned actions slot (buttons, filters…). */
  actions?: React.ReactNode;
  align?: Align;
  size?: Size;
  /** Softer, calmer aurora (good for dense/interior pages). */
  soft?: boolean;
  /** Draw the drifting blueprint grid (default true). */
  grid?: boolean;
  /** Extra content rendered below the header block (e.g. a StatGrid). */
  children?: React.ReactNode;
  maxWidth?: number;
  style?: React.CSSProperties;
  className?: string;
}

export function ModuleHero({
  title,
  accent,
  accentBreak = false,
  subtitle,
  eyebrow,
  eyebrowIcon,
  icon,
  actions,
  align = 'left',
  size = 'md',
  soft = false,
  grid = true,
  children,
  maxWidth,
  style,
  className,
}: ModuleHeroProps) {
  const centered = align === 'center';

  const accentSpan = accent != null && (
    <span
      className="sgShine"
      style={{
        background: GOLD_TEXT_GRADIENT,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        color: 'transparent',
      }}
    >
      {accent}
    </span>
  );

  return (
    <div
      className={`sgUi${className ? ` ${className}` : ''}`}
      style={{
        position: 'relative', overflow: 'hidden', borderRadius: 20,
        background: 'rgba(255,255,255,0.045)',
        backdropFilter: 'blur(16px) saturate(140%)', WebkitBackdropFilter: 'blur(16px) saturate(140%)',
        border: '1px solid rgba(255,255,255,0.09)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        ...style,
      }}
    >
      <UiFx />
      <Aurora soft={soft} grid={grid} />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          padding: size === 'lg' ? '56px 28px' : size === 'sm' ? '28px 22px' : '40px 26px',
          maxWidth: maxWidth ?? (centered ? 880 : undefined),
          margin: centered ? '0 auto' : undefined,
          textAlign: centered ? 'center' : 'left',
        }}
      >
        <div
          className="sgHeroRow"
          style={{
            display: 'flex',
            alignItems: centered ? 'center' : 'flex-start',
            flexDirection: centered ? 'column' : 'row',
            justifyContent: 'space-between',
            gap: 20,
          }}
        >
          {/* Title block */}
          <div style={{ minWidth: 0, display: 'flex', gap: 16, alignItems: 'flex-start', flexDirection: centered ? 'column' : 'row' }}>
            {icon != null && !centered && (
              <div
                className="sgIn"
                style={{
                  flex: '0 0 auto',
                  display: 'inline-flex',
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `linear-gradient(150deg, ${gold(18)}, ${gold(6)})`,
                  border: `1px solid ${gold(35)}`,
                  color: GOLD,
                  marginTop: 4,
                }}
              >
                {icon}
              </div>
            )}

            <div style={{ minWidth: 0 }}>
              {eyebrow != null && (
                <div
                  className="sgIn"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '6px 14px',
                    borderRadius: 999,
                    marginBottom: 14,
                    background: gold(12),
                    border: `1px solid ${gold(35)}`,
                    color: GOLD,
                    fontSize: 12.5,
                    fontWeight: 700,
                    letterSpacing: 'normal',
                  }}
                >
                  {eyebrowIcon}
                  {eyebrow}
                </div>
              )}

              <h1
                className="sgHeroTitle sgIn"
                data-size={size}
                style={{ margin: 0, color: 'var(--sg-text)', animationDelay: '.05s' }}
              >
                {title}
                {accent != null && (accentBreak ? <><br />{accentSpan}</> : <> {accentSpan}</>)}
              </h1>

              {subtitle != null && (
                <p
                  className="sgIn"
                  style={{
                    color: 'var(--sg-text-2)',
                    fontSize: size === 'sm' ? 14 : 16,
                    marginTop: 14,
                    marginBottom: 0,
                    maxWidth: centered ? 620 : 640,
                    marginInline: centered ? 'auto' : undefined,
                    lineHeight: 1.55,
                    animationDelay: '.1s',
                  }}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Actions slot */}
          {actions != null && (
            <div
              className="sgHeroActions sgIn"
              style={{
                flex: '0 0 auto',
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                justifyContent: centered ? 'center' : 'flex-end',
                flexWrap: 'wrap',
                animationDelay: '.12s',
              }}
            >
              {actions}
            </div>
          )}
        </div>

        {children != null && <div style={{ marginTop: 26 }}>{children}</div>}
      </div>
    </div>
  );
}

export default ModuleHero;
