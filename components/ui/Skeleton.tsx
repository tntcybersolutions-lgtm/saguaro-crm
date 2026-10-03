'use client';
import React from 'react';
import { colors, radius, shadow } from '../../lib/design-tokens';

// Shared skeleton system — raised surface base with a soft neutral shimmer
// sweep. Tokens keep every loading state consistent with the design system.
const SKEL_BASE = colors.raised;       // solid stand-in for the glass card surface
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
      <style>{keyframes}</style>
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

export function SkeletonCard({ height = 80 }: { height?: number }) {
  return (
    <div
      style={{
        background: colors.raised,
        borderRadius: radius['2xl'],
        padding: '16px 18px',
        marginBottom: 12,
        border: `1px solid ${colors.border}`,
        boxShadow: shadow.sm,
        height,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', height: '100%' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton width="55%" height={14} />
          <Skeleton width="80%" height={11} />
        </div>
        <Skeleton width={64} height={24} borderRadius={radius.sm} />
      </div>
    </div>
  );
}

export function SkeletonKPI() {
  return (
    <div
      style={{
        background: colors.raised,
        border: `1px solid ${colors.border}`,
        borderRadius: radius['2xl'],
        boxShadow: shadow.sm,
        padding: '18px 20px',
      }}
    >
      <Skeleton width="60%" height={10} style={{ marginBottom: 10 }} />
      <Skeleton width="45%" height={28} style={{ marginBottom: 6 }} />
      <Skeleton width="70%" height={10} />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 18px',
        borderBottom: `1px solid ${colors.borderDim}`,
      }}
    >
      <Skeleton width={4} height={48} borderRadius={radius.full} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <Skeleton width="55%" height={14} style={{ marginBottom: 8 }} />
        <Skeleton width="75%" height={11} />
      </div>
      <Skeleton width={80} height={30} borderRadius={radius.sm} />
    </div>
  );
}
