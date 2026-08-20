'use client'
import React from 'react'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  borderRadius?: number
  style?: React.CSSProperties
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 4, style }: SkeletonProps) {
  return (
    <div style={{
      width,
      height,
      borderRadius,
      background: 'linear-gradient(90deg, #21262d 25%, #30363d 50%, #21262d 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s ease-in-out infinite',
      ...style,
    }} />
  )
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ width: '100%' }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: 16, padding: '14px 16px', borderTop: r > 0 ? '1px solid #21262d' : undefined }}>
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} style={{ flex: c === 0 ? 2 : 1 }}>
              <Skeleton height={14} width={c === 0 ? '70%' : c === cols - 1 ? '40%' : '60%'} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 10, padding: '16px 20px' }}>
      <Skeleton height={11} width="40%" style={{ marginBottom: 10 }} />
      <Skeleton height={28} width="55%" style={{ marginBottom: 8 }} />
      <Skeleton height={12} width="30%" />
    </div>
  )
}

export function KpiCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  )
}
