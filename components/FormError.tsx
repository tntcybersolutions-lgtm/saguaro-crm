import React from 'react'

export function FormError({ error }: { error?: string }) {
  if (!error) return null
  return (
    <div style={{ background: 'rgba(248,81,73,.1)', border: '1px solid rgba(248,81,73,.25)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#F85149', marginTop: 4 }}>
      {error}
    </div>
  )
}

export function FormErrors({ errors }: { errors: Record<string, string> }) {
  const keys = Object.keys(errors)
  if (!keys.length) return null
  return (
    <div style={{ background: 'rgba(248,81,73,.08)', border: '1px solid rgba(248,81,73,.2)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#F85149', margin: '0 0 6px' }}>Please fix the following:</p>
      <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
        {keys.map(k => <li key={k} style={{ fontSize: 12, color: '#F85149', marginBottom: 2 }}>{errors[k]}</li>)}
      </ul>
    </div>
  )
}

export function FieldError({ error }: { error?: string }) {
  if (!error) return null
  return <span style={{ fontSize: 11, color: '#F85149', display: 'block', marginTop: 3 }}>{error}</span>
}

export function ApiErrorBanner({ error, onDismiss }: { error: string; onDismiss?: () => void }) {
  return (
    <div style={{ background: 'rgba(248,81,73,.1)', border: '1px solid rgba(248,81,73,.25)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
      <p style={{ fontSize: 13, color: '#F85149', margin: 0, flex: 1 }}>{error}</p>
      {onDismiss && <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#F85149', cursor: 'pointer', fontSize: 16, padding: 0, flexShrink: 0 }}>×</button>}
    </div>
  )
}
