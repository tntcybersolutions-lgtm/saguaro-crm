'use client';
export default function FieldError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ background: '#0d1117', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F0F4FF', fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center', padding: 40, maxWidth: 480 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Something went wrong</h2>
        <p style={{ color: '#8BAAC8', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>{error.message || 'An unexpected error occurred'}</p>
        <button onClick={reset} style={{ background: '#C8960F', color: '#0d1117', border: 'none', borderRadius: 8, padding: '12px 28px', fontWeight: 700, cursor: 'pointer', fontSize: 15, minHeight: 44 }}>
          Try Again
        </button>
      </div>
    </div>
  );
}
