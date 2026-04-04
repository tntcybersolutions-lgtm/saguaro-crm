'use client';
import React from 'react';

const keyframes = `
@keyframes skel {
  0%,100% { opacity: 1; }
  50%      { opacity: .3; }
}
.skel { animation: skel 1.4s ease-in-out infinite; }
`;

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = 14, borderRadius = 4, style }: SkeletonProps) {
  return (
    <>
      <style>{keyframes}</style>
      <div
        className="skel"
        style={{
          width,
          height,
          borderRadius,
          background: '#ffffff',
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
        background: '#ffffff',
        borderRadius: 10,
        padding: '16px 18px',
        marginBottom: 12,
        border: '1px solid #E2E5EA',
        height,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', height: '100%' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton width="55%" height={14} />
          <Skeleton width="80%" height={11} />
        </div>
        <Skeleton width={64} height={24} borderRadius={6} />
      </div>
    </div>
  );
}

export function SkeletonKPI() {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #E2E5EA',
        borderRadius: 10,
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
        borderBottom: '1px solid #E2E5EA',
      }}
    >
      <div
        className="skel"
        style={{ width: 4, height: 48, borderRadius: 2, background: '#E2E5EA', flexShrink: 0 }}
      />
      <div style={{ flex: 1 }}>
        <Skeleton width="55%" height={14} style={{ marginBottom: 8 }} />
        <Skeleton width="75%" height={11} />
      </div>
      <Skeleton width={80} height={30} borderRadius={6} />
    </div>
  );
}
