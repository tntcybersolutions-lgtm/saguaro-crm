'use client'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  borderRadius?: number
  style?: React.CSSProperties
}

export function Skeleton({ width = '100%', height = 20, borderRadius = 4, style }: SkeletonProps) {
  return (
    <>
      <div style={{
        width, height, borderRadius,
        background: 'linear-gradient(90deg, #21262d 25%, #30363d 50%, #21262d 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        ...style,
      }} />
      <style>{SHIMMER_CSS}</style>
    </>
  )
}

export const SHIMMER_CSS = `
@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`

export function SkeletonCard() {
  return (
    <div style={{
      background: '#161b22', border: '1px solid #30363d',
      borderRadius: 12, padding: 24, marginBottom: 16,
    }}>
      <Skeleton height={24} width="60%" style={{ marginBottom: 12 }} />
      <Skeleton height={16} width="40%" style={{ marginBottom: 8 }} />
      <Skeleton height={16} width="30%" style={{ marginBottom: 20 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <Skeleton height={36} width={100} borderRadius={6} />
        <Skeleton height={36} width={100} borderRadius={6} />
        <Skeleton height={36} width={120} borderRadius={6} />
      </div>
    </div>
  )
}
