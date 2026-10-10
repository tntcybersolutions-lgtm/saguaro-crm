'use client';
import React from 'react';
import { radius } from '../../lib/design-tokens';

// Shared skeleton system — flat (2026-10-10): hairline rows and bare bars on
// the page, with a soft shimmer. No trays, no shadows: a loading screen has
// the same shape as the flat page it stands in for.
const SKEL_BASE = 'var(--sg-border)';
const SKEL_SHEEN = 'rgba(255,255,255,0.06)';

const keyframes = `
@keyframes skelShimmer {
  0%   { background-position: -160% 0; }
  100% { background-position: 160% 0; }
}
.skel {
  position: relative;
  background-color: ${SKEL_BASE};
  background-image: linear-gradient(
    90deg,
    transparent 0%,
    ${SKEL_SHEEN} 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  background-repeat: no-repeat;
  animation: skelShimmer 1.6s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .skel { animation-duration: 3s; }
}
`;

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = 14, borderRadius = radius.sm, style }: SkeletonProps) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: keyframes }} />
      <div
        className="skel"
        style={{
          width,
          height,
          borderRadius,
          display: 'block',
          ...style,
        }}
      />
    </>
  );
}

export function SkeletonText({ lines = 3, gap = 8 }: { lines?: number; gap?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '65%' : '100%'} height={13} />
      ))}
    </div>
  );
}

/** A list row's stand-in: title and meta bars over a hairline. `height` is the row's height. */
export function SkeletonCard({ height = 64 }: { height?: number }) {
  return (
    <div
      aria-hidden
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        minHeight: Math.min(Math.max(height, 52), 96),
        padding: '10px 0',
        borderBottom: '1px solid var(--sg-border)',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton width="55%" height={12} />
        <Skeleton width="80%" height={9} />
      </div>
      <Skeleton width={56} height={12} borderRadius={radius.sm} />
    </div>
  );
}

/** One figure's stand-in, the size of a number-strip figure. */
export function SkeletonKPI() {
  return (
    <div aria-hidden style={{ padding: '9px 12px', borderLeft: '1px solid var(--sg-border)', minHeight: 44 }}>
      <Skeleton width="45%" height={15} style={{ marginBottom: 6 }} />
      <Skeleton width="65%" height={9} />
    </div>
  );
}

/** A list row's stand-in, full width with a hairline under it. */
export function SkeletonRow() {
  return (
    <div
      aria-hidden
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 58,
        padding: '10px 16px',
        borderBottom: '1px solid var(--sg-border)',
      }}
    >
      <div style={{ flex: 1 }}>
        <Skeleton width="55%" height={12} style={{ marginBottom: 8 }} />
        <Skeleton width="75%" height={9} />
      </div>
      <Skeleton width={56} height={12} borderRadius={radius.sm} />
    </div>
  );
}
