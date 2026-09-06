'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

const C = {
  bg: '#0f0f1a',
  card: '#16213e',
  border: 'rgba(255,255,255,0.08)',
  text: '#ffffff',
  dim: '#888888',
  gold: '#D4A017',
  danger: '#F85149',
}

export default function SubPortalLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const supabase = getSupabaseBrowser()
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signInErr) throw signInErr
      router.push('/sub-portal/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 420, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 32, color: C.text }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔧</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Subcontractor Portal</h1>
          <p style={{ color: C.dim, fontSize: 13, margin: '6px 0 0' }}>Sign in to access your contracts, pay apps, and RFIs</p>
        </div>

        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ width: '100%', background: C.bg, border: '1px solid #374151', color: C.text, borderRadius: 8, padding: '10px 12px', fontSize: 16, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 11, color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', background: C.bg, border: '1px solid #374151', color: C.text, borderRadius: 8, padding: '10px 12px', fontSize: 16, boxSizing: 'border-box' }}
            />
          </div>
          {error && (
            <div style={{ background: 'rgba(248,81,73,0.1)', border: `1px solid ${C.danger}55`, color: C.danger, borderRadius: 6, padding: '8px 12px', fontSize: 13, marginBottom: 14 }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', background: loading ? '#555' : C.gold, color: loading ? '#888' : '#000', border: 'none', borderRadius: 8, padding: '11px', fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <a href="/forgot-password" style={{ color: C.dim, fontSize: 12, textDecoration: 'none' }}>Forgot password?</a>
        </div>
      </div>
    </div>
  )
}
