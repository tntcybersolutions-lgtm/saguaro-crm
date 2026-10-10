'use client';

/**
 * <ModuleHero> — the page header, compact (owner approved 2026-10-10): a
 * 20–22px title, one line under it, the actions on the right. No hero panel,
 * no aurora, no gradient accent word, no eyebrow pill, no icon medallion. On
 * a phone the actions are at most one row under the title (it scrolls
 * sideways inside itself rather than stacking).
 *
 * Same API as before, so no caller breaks: `accent` reads as the rest of the
 * title in the same colour (on its own line with `accentBreak`); `eyebrow`,
 * `eyebrowIcon`, `icon`, `size`, `soft` and `grid` are accepted and not
 * drawn; `children` (e.g. a StatGrid) render under the header.
 *
 *   <ModuleHero title="Pay Applications" subtitle="AIA G702/G703 from your SOV."
 *     actions={<GradientButton icon={<Plus/>}>New Pay App</GradientButton>} />
 *
 * Styles: the FLAT SHARED PARTS block in app/globals.css (.pmHead).
 */

import React from 'react';

type Align = 'left' | 'center';
type Size = 'sm' | 'md' | 'lg';

export interface ModuleHeroProps {
  title: React.ReactNode;
  /** The rest of the title, same colour (own line if `accentBreak`). */
  accent?: React.ReactNode;
  accentBreak?: boolean;
  subtitle?: React.ReactNode;
  /** Not drawn in the flat header. */
  eyebrow?: React.ReactNode;
  /** Not drawn in the flat header. */
  eyebrowIcon?: React.ReactNode;
  /** Not drawn in the flat header. */
  icon?: React.ReactNode;
  /** Right-aligned actions slot (buttons, filters…). */
  actions?: React.ReactNode;
  align?: Align;
  /** Accepted for callers; the flat header has one size. */
  size?: Size;
  /** Accepted for callers; there is no backdrop. */
  soft?: boolean;
  /** Accepted for callers; there is no backdrop. */
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
  actions,
  align = 'left',
  children,
  maxWidth,
  style,
  className,
}: ModuleHeroProps) {
  return (
    <div className={className} style={{ maxWidth, margin: align === 'center' && maxWidth ? '0 auto' : undefined, ...style }}>
      <div className="pmHead" data-align={align === 'center' ? 'center' : undefined} style={children != null ? { marginBottom: 12 } : undefined}>
        <div className="pmHeadText">
          <h1 className="pmH1">
            {title}
            {accent != null && (accentBreak ? <><br />{accent}</> : <> {accent}</>)}
          </h1>
          {subtitle != null && <p className="pmHeadSub" title={typeof subtitle === 'string' ? subtitle : undefined}>{subtitle}</p>}
        </div>
        {actions != null && <div className="pmHeadActs">{actions}</div>}
      </div>
      {children != null && <div style={{ marginBottom: 16 }}>{children}</div>}
    </div>
  );
}

export default ModuleHero;
