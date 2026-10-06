'use client';

/**
 * BrandMark — the Saguaro lockup, drawn one way.
 *
 * It was rendered three different ways across the site: the homepage used
 * /logo-horizontal.png as a single image, the marketing nav used /logo-full.jpg
 * beside hand-set type at 19px and 9.5px, and the app sidebar used a fourth
 * arrangement. Same company, three lockups, different sizes on every page — the
 * one asset a visitor uses to decide whether a product is serious.
 *
 * One component, one set of proportions, three sizes. Where a tenant has
 * branded the platform this is not what renders at all — their own logo takes
 * the slot, which is what the white-label promise means.
 */

import React from 'react';
import Link from 'next/link';

export type BrandMarkSize = 'sm' | 'md' | 'lg';

/* The badge, the SAGUARO line and the CONTROL SYSTEMS line move together —
   locking the ratios is the point of having a component at all. The smallest
   line never drops below 9px, because below that letterforms stop resolving
   and the wordmark reads as a grey smudge. That was the original bug: it was
   set at 7px. */
const SIZES: Record<BrandMarkSize, { badge: number; name: number; sub: number; gap: number }> = {
  sm: { badge: 34, name: 15, sub: 9,    gap: 9 },
  md: { badge: 46, name: 19, sub: 9.5,  gap: 11 },
  lg: { badge: 58, name: 24, sub: 11,   gap: 13 },
};

export interface BrandMarkProps {
  size?: BrandMarkSize;
  /** Badge only — for a collapsed rail or a tight header. */
  markOnly?: boolean;
  /** Where it links. Null renders it as plain artwork. */
  href?: string | null;
  style?: React.CSSProperties;
}

export default function BrandMark({
  size = 'md',
  markOnly = false,
  href = '/',
  style,
}: BrandMarkProps) {
  const s = SIZES[size];

  const inner = (
    <>
      <img
        src="/logo-badge.png"
        alt=""
        aria-hidden
        style={{ height: s.badge, width: s.badge, objectFit: 'contain', display: 'block', flexShrink: 0 }}
      />
      {!markOnly && (
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.12, minWidth: 0 }}>
          <span
            style={{
              fontWeight: 800,
              fontSize: s.name,
              letterSpacing: '0.11em',
              background: 'linear-gradient(90deg,var(--brand-primary),var(--brand-primary-strong))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
              whiteSpace: 'nowrap',
            }}
          >
            SAGUARO
          </span>
          <span
            style={{
              fontSize: s.sub,
              color: 'var(--text-secondary)',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            Control Systems
          </span>
        </span>
      )}
    </>
  );

  const box: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: s.gap,
    textDecoration: 'none',
    ...style,
  };

  if (!href) return <span style={box}>{inner}</span>;

  return (
    <Link href={href} aria-label="Saguaro Control Systems" style={box}>
      {inner}
    </Link>
  );
}
