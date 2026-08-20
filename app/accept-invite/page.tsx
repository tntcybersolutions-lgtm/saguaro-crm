'use client'
import { Suspense, useState, useEffect } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import { useRouter, useSearchParams } from 'next/navigation'

function AcceptInviteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const supabase = getSupabaseBrowser()
  const [invite, setInvite] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) { setError('Invalid invite link'); setLoading(false); return }
    fetch(`/api/auth/invite/validate?token=${token}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setInvite(d); setLoading(false) })
      .catch(() => { setError('Failed to validate invite'); setLoading(false) })
  }, [token])

  const handleAccept = async () => {
    if (!name.trim()) { setError('Full name required'); return }
    if (password.length < 8) { setError('Password min 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setError('')
    setSubmitting(true)
    const res = await fetch('/api/auth/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, fullName: name, password }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSubmitting(false); return }
    // Auto sign in
    await supabase.auth.signInWithPassword({ email: invite.email, password })
    router.push('/app')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>
        Loading invite...
      </div>
    )
  }

  if (error && !invite) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#F85149', textAlign: 'center' }}>
          <p style={{ fontSize: 18, fontWeight: 700 }}>{error}</p>
          <p style={{ fontSize: 14, color: '#8b949e' }}>This invite may have expired or already been used.</p>
        </div>
      </div>
    )
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', background: '#0d1117',
    border: '1px solid #30363d', borderRadius: 8, color: '#e6edf3',
    fontSize: 14, boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0d1117,#161b22)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 16, padding: '40px 48px', width: '100%', maxWidth: 440 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#D4A017', marginBottom: 8 }}>Saguaro</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Accept Invitation</h1>
        <p style={{ fontSize: 14, color: '#8b949e', marginBottom: 28 }}>
          You&apos;ve been invited to join <strong style={{ color: '#e6edf3' }}>{invite?.tenant_name}</strong> as <strong style={{ color: '#D4A017' }}>{invite?.role}</strong>.
        </p>
        {error && (
          <div style={{ background: 'rgba(248,81,73,.12)', border: '1px solid rgba(248,81,73,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#F85149', marginBottom: 16 }}>
            {error}
          </div>
        )}
        {[
          { label: 'Your Full Name', type: 'text' as const, val: name, set: setName, ph: 'John Martinez' },
          { label: 'Create Password', type: 'password' as const, val: password, set: setPassword, ph: 'Min 8 chars' },
          { label: 'Confirm Password', type: 'password' as const, val: confirm, set: setConfirm, ph: 'Repeat password' },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#8b949e', display: 'block', marginBottom: 6 }}>{f.label}</label>
            <input type={f.type} value={f.val} placeholder={f.ph} onChange={e => f.set(e.target.value)}
              style={inputStyle} />
          </div>
        ))}
        <button onClick={handleAccept} disabled={submitting}
          style={{ width: '100%', marginTop: 8, padding: 14, background: '#D4A017', color: '#0d1117', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
          {submitting ? 'Setting up...' : 'Accept & Create Account'}
        </button>
      </div>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>Loading...</div>}>
      <AcceptInviteContent />
    </Suspense>
  )
}
