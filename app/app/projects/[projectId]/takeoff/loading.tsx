export default function TakeoffLoading() {
  const shimmer = {
    background: 'linear-gradient(90deg, #161b22 25%, #1c2128 50%, #161b22 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.4s infinite',
    borderRadius: 6,
  } as React.CSSProperties

  return (
    <div style={{ padding: '24px 28px', background: '#0d1117', minHeight: '100vh' }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

      {/* Header skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ ...shimmer, width: 200, height: 28 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          {[120, 100, 140].map((w, i) => (
            <div key={i} style={{ ...shimmer, width: w, height: 36 }} />
          ))}
        </div>
      </div>

      {/* KPI cards skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            background: '#161b22', border: '1px solid #21262d',
            borderRadius: 10, padding: 16,
          }}>
            <div style={{ ...shimmer, width: '60%', height: 13, marginBottom: 10 }} />
            <div style={{ ...shimmer, width: '80%', height: 28, marginBottom: 6 }} />
            <div style={{ ...shimmer, width: '50%', height: 11 }} />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div style={{
        background: '#161b22', border: '1px solid #21262d',
        borderRadius: 10, overflow: 'hidden',
      }}>
        <div style={{ background: '#0d1117', padding: '10px 16px', borderBottom: '1px solid #21262d' }}>
          <div style={{ ...shimmer, width: 160, height: 13 }} />
        </div>
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
          <div key={i} style={{
            display: 'flex', gap: 16, padding: '10px 16px',
            borderBottom: '1px solid rgba(48,54,61,.5)', alignItems: 'center',
          }}>
            <div style={{ ...shimmer, width: 8, height: 8, borderRadius: '50%' }} />
            <div style={{ ...shimmer, width: 60, height: 11 }} />
            <div style={{ ...shimmer, flex: 1, height: 11 }} />
            <div style={{ ...shimmer, width: 50, height: 11 }} />
            <div style={{ ...shimmer, width: 30, height: 11 }} />
            <div style={{ ...shimmer, width: 70, height: 11 }} />
            <div style={{ ...shimmer, width: 70, height: 11 }} />
            <div style={{ ...shimmer, width: 80, height: 11 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
