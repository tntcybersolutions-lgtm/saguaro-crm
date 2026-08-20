'use client'

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f0f1a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ fontSize: 64, marginBottom: 24 }}>📡</div>
      <h1 style={{ color: '#ffffff', fontSize: 24, fontWeight: 900, margin: '0 0 12px' }}>
        You&apos;re Offline
      </h1>
      <p style={{ color: '#888888', fontSize: 16, margin: '0 0 32px', maxWidth: 360, lineHeight: 1.5 }}>
        No internet connection. Daily reports, photos, and punch list items you capture will sync automatically when you reconnect.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: '#D4A017',
          color: '#000',
          border: 'none',
          borderRadius: 8,
          padding: '12px 24px',
          fontWeight: 700,
          fontSize: 16,
          cursor: 'pointer',
        }}
      >
        Try Again
      </button>
    </div>
  )
}
