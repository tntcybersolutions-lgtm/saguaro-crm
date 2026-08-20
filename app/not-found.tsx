import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh', background: '#0d1117',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <div style={{
          fontSize: 80, fontWeight: 900, lineHeight: 1,
          color: 'rgba(212,160,23,.15)', letterSpacing: '-0.04em',
          marginBottom: 20,
        }}>404</div>

        <div style={{
          display: 'inline-block', background: 'rgba(212,160,23,.1)',
          border: '1px solid rgba(212,160,23,.3)', borderRadius: 20,
          padding: '4px 14px', fontSize: 11, fontWeight: 700,
          color: '#D4A017', letterSpacing: '0.08em', textTransform: 'uppercase',
          marginBottom: 18,
        }}>
          🌵 Saguaro
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e6edf3', marginBottom: 10, marginTop: 0 }}>
          Page not found
        </h1>
        <p style={{ fontSize: 14, color: '#8b949e', lineHeight: 1.65, marginBottom: 28, marginTop: 0 }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/app" style={{
            background: 'linear-gradient(135deg, #D4A017, #F0C040)',
            border: 'none', borderRadius: 8, padding: '11px 26px',
            fontSize: 14, fontWeight: 800, color: '#0d1117',
            textDecoration: 'none', display: 'inline-block',
          }}>
            Go to Dashboard
          </Link>
          <Link href="/" style={{
            background: 'rgba(255,255,255,.04)',
            border: '1px solid #30363d', borderRadius: 8, padding: '11px 26px',
            fontSize: 14, fontWeight: 600, color: '#8b949e',
            textDecoration: 'none', display: 'inline-block',
          }}>
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
