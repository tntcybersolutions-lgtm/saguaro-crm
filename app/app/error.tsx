'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()
  useEffect(() => { console.error('[AppError]', error) }, [error])

  return (
    <div style={{
      minHeight: '100vh', background: '#0d1117',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: 18, margin: '0 auto 28px',
          background: 'linear-gradient(135deg, rgba(248,81,73,.15), rgba(248,81,73,.05))',
          border: '2px solid rgba(248,81,73,.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34,
        }}>⚠️</div>

        <div style={{
          display: 'inline-block', background: 'rgba(212,160,23,.1)',
          border: '1px solid rgba(212,160,23,.3)', borderRadius: 20,
          padding: '4px 14px', fontSize: 11, fontWeight: 700,
          color: '#D4A017', letterSpacing: '0.08em', textTransform: 'uppercase',
          marginBottom: 16,
        }}>
          🌵 Saguaro
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e6edf3', marginBottom: 10, marginTop: 0 }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 14, color: '#8b949e', lineHeight: 1.65, marginBottom: 28, marginTop: 0 }}>
          Saguaro hit an unexpected error loading this page.
          Your data is safe — this is a temporary issue.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
          <button
            onClick={() => reset()}
            style={{
              background: 'linear-gradient(135deg, #D4A017, #F0C040)',
              border: 'none', borderRadius: 8, padding: '11px 26px',
              fontSize: 14, fontWeight: 800, color: '#0d1117', cursor: 'pointer',
            }}
          >
            Try Again
          </button>
          <button
            onClick={() => router.push('/app')}
            style={{
              background: 'rgba(255,255,255,.04)',
              border: '1px solid #30363d', borderRadius: 8, padding: '11px 26px',
              fontSize: 14, fontWeight: 600, color: '#8b949e', cursor: 'pointer',
            }}
          >
            Go to Dashboard
          </button>
        </div>

        <p style={{ fontSize: 11, color: '#6e7681', marginTop: 0 }}>
          If this keeps happening —{' '}
          <a href="mailto:support@saguarocontrol.net"
            style={{ color: '#D4A017', textDecoration: 'none' }}>
            contact support
          </a>
          {error.digest && (
            <span style={{ marginLeft: 8, fontFamily: 'monospace', color: '#484f58' }}>
              [{error.digest}]
            </span>
          )}
        </p>
      </div>
    </div>
  )
}
