'use client'
import { useState, useEffect } from 'react'

interface CO { id: string; title: string; amount: number; description: string; co_number: number; status: string; project_name: string }

export default function COApprovalPortal({ params }: { params: Promise<{ token: string }> }) {
  const [co, setCo] = useState<CO | null>(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    params.then(p => {
      fetch(`/api/portals/co-approval/${p.token}`)
        .then(r => r.json())
        .then(d => { setCo(d.change_order); setLoading(false) })
        .catch(() => { setError('Invalid or expired link'); setLoading(false) })
    })
  }, [params])

  const submit = async (chosenAction: 'approve' | 'reject') => {
    if (!co) return
    setAction(chosenAction)
    setSaving(true)
    const p = await params
    const res = await fetch(`/api/portals/co-approval/${p.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: chosenAction, notes }),
    })
    const d = await res.json()
    setSaving(false)
    if (res.ok) setDone(chosenAction)
    else setError(d.error || 'Failed to submit')
  }

  if (loading) return <div style={{ minHeight: '100vh', background: '#0f0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading...</div>
  if (error) return <div style={{ minHeight: '100vh', background: '#0f0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F85149', fontSize: 16 }}>{error}</div>

  if (done) return (
    <div style={{ minHeight: '100vh', background: '#0f0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 72, marginBottom: 16 }}>{done === 'approve' ? '✅' : '❌'}</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: done === 'approve' ? '#3DD68C' : '#F85149', marginBottom: 8 }}>
          Change Order {done === 'approve' ? 'Approved' : 'Rejected'}
        </div>
        <div style={{ color: '#888', fontSize: 14 }}>The general contractor has been notified. Thank you.</div>
      </div>
    </div>
  )

  if (!co) return null

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f1a', fontFamily: 'system-ui,sans-serif', padding: 20 }}>
      <div style={{ maxWidth: 560, margin: '40px auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏗️</div>
          <div style={{ color: '#D4A017', fontWeight: 900, fontSize: 18 }}>Saguaro Control</div>
          <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>Change Order Approval Portal</div>
        </div>

        <div style={{ background: '#16213e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 28, marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Project</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 20 }}>{co.project_name}</div>

          <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Change Order {co.co_number ? `#${co.co_number}` : ''}</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 4 }}>{co.title}</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#D4A017', marginBottom: 16 }}>${Number(co.amount || 0).toLocaleString()}</div>

          {co.description && (
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 14, fontSize: 13, color: '#aaa', lineHeight: 1.6 }}>
              {co.description}
            </div>
          )}
        </div>

        {co.status !== 'approved' && co.status !== 'rejected' ? (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Add any comments or conditions..."
                style={{ width: '100%', background: '#16213e', border: '1px solid #374151', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 16, boxSizing: 'border-box', outline: 'none', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button onClick={() => submit('approve')} disabled={saving}
                style={{ background: 'rgba(61,214,140,0.12)', color: '#3DD68C', border: '2px solid rgba(61,214,140,0.3)', borderRadius: 12, padding: '16px 0', fontWeight: 900, fontSize: 18, cursor: saving ? 'not-allowed' : 'pointer', minHeight: 44 }}>
                ✅ Approve Change Order
              </button>
              <button onClick={() => submit('reject')} disabled={saving}
                style={{ background: 'rgba(248,81,73,0.08)', color: '#F85149', border: '2px solid rgba(248,81,73,0.2)', borderRadius: 12, padding: '14px 0', fontWeight: 700, fontSize: 16, cursor: saving ? 'not-allowed' : 'pointer', minHeight: 44 }}>
                ❌ Reject
              </button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 20, color: co.status === 'approved' ? '#3DD68C' : '#F85149', fontSize: 16, fontWeight: 700 }}>
            This change order has already been {co.status}.
          </div>
        )}
      </div>
    </div>
  )
}
