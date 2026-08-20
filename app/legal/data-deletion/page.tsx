'use client'
import { useState, useEffect } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import Link from 'next/link'

export default function DataDeletionPage() {
  const supabase = getSupabaseBrowser()
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setIsLoggedIn(true); setEmail(data.user.email || '') }
    })
  }, [supabase])

  const handleSubmit = async () => {
    if (!email) return
    setLoading(true)
    await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, reason, confirmed: confirmText === 'DELETE' }),
    })
    setSubmitted(true)
    setLoading(false)
  }

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ marginBottom: 40 }}><Link href="/" style={{ color: '#D4A017', fontWeight: 700, fontSize: 24, textDecoration: 'none' }}>Saguaro</Link></div>
        <h1 style={{ fontSize: 32, fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>Data Deletion Request</h1>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 32 }}>Request deletion of your account and all associated data.</p>

        {submitted ? (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>&#x2705;</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#166534', marginBottom: 8 }}>Request Received</h2>
            <p style={{ color: '#374151', fontSize: 14, lineHeight: 1.7 }}>
              We&apos;ve received your data deletion request for <strong>{email}</strong>.
              Your account and all associated data will be permanently deleted within <strong>30 days</strong>.
              You&apos;ll receive a confirmation email once deletion is complete.
            </p>
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 16 }}>
              Questions? Email <a href="mailto:privacy@saguarocrm.com" style={{ color: '#D4A017' }}>privacy@saguarocrm.com</a>
            </p>
          </div>
        ) : (
          <>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '16px 20px', marginBottom: 32 }}>
              <p style={{ fontSize: 14, color: '#dc2626', fontWeight: 700, margin: '0 0 6px' }}>&#x26A0;&#xFE0F; This action is permanent</p>
              <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.6 }}>
                Deleting your account will permanently remove all projects, documents, financial data, photos, and team data associated with your company. This cannot be undone. We recommend exporting your data first from Settings &rarr; Export Data.
              </p>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email Address *</label>
                <input value={email} onChange={e => setEmail(e.target.value)} disabled={isLoggedIn} placeholder="your@email.com"
                  style={{ width: '100%', padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: isLoggedIn ? '#f8fafc' : '#fff', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reason (optional)</label>
                <select value={reason} onChange={e => setReason(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}>
                  <option value="">Select a reason</option>
                  <option value="no_longer_needed">No longer need the service</option>
                  <option value="switching">Switching to another product</option>
                  <option value="privacy">Privacy concerns</option>
                  <option value="too_expensive">Too expensive</option>
                  <option value="missing_features">Missing features I need</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type DELETE to confirm *</label>
                <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="DELETE"
                  style={{ width: '100%', padding: '12px 14px', border: `1px solid ${confirmText === 'DELETE' ? '#dc2626' : '#e2e8f0'}`, borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <button onClick={handleSubmit} disabled={loading || !email || confirmText !== 'DELETE'}
                style={{ padding: '14px', background: confirmText === 'DELETE' && email ? '#dc2626' : '#e2e8f0', color: confirmText === 'DELETE' && email ? '#fff' : '#94a3b8', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 800, cursor: confirmText === 'DELETE' && email ? 'pointer' : 'not-allowed' }}>
                {loading ? 'Submitting...' : 'Submit Deletion Request'}
              </button>
            </div>
          </>
        )}
        <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 48, paddingTop: 24, display: 'flex', gap: 24 }}>
          <Link href="/legal/terms" style={{ color: '#D4A017', fontSize: 14 }}>Terms of Service</Link>
          <Link href="/legal/privacy" style={{ color: '#D4A017', fontSize: 14 }}>Privacy Policy</Link>
        </div>
      </div>
    </div>
  )
}
