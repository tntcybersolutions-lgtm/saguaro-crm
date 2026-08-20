export default function AppLoading() {
  return (
    <div style={{
      minHeight: '100vh', background: '#0d1117',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, margin: '0 auto 20px',
          background: 'linear-gradient(135deg, rgba(212,160,23,.2), rgba(212,160,23,.08))',
          border: '2px solid rgba(212,160,23,.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
        }}>
          🌵
        </div>
        <div style={{
          display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center',
          marginBottom: 12,
        }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%', background: '#D4A017',
              animation: `pulse 1.2s ${i * 0.2}s ease-in-out infinite`,
            }} />
          ))}
        </div>
        <div style={{ fontSize: 13, color: '#6e7681', fontWeight: 600 }}>
          Loading Saguaro...
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.3; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    </div>
  )
}
