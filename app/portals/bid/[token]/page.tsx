'use client'
import { useState, useEffect } from 'react'

interface BidPkg { id: string; name: string; description: string; scope_summary: string; bid_due_date: string; walkthrough_date: string; project_name: string; project_address: string }

export default function BidSubmissionPortal({ params }: { params: Promise<{ token: string }> }) {
  const [pkg, setPkg] = useState<BidPkg | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    company_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    bid_amount: '',
    proposed_start_date: '',
    estimated_duration_days: '',
    scope_notes: '',
    inclusions: '',
    exclusions: '',
    valid_until: '',
  })

  useEffect(() => {
    params.then(p => {
      fetch(`/api/bid-portal/${p.token}`)
        .then(r => r.json())
        .then(d => {
          if (d.error) { setError(d.error); setLoading(false); return }
          setPkg(d.package); setLoading(false)
        })
        .catch(() => { setError('Invalid or expired link'); setLoading(false) })
    })
  }, [params])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const p = await params
    const res = await fetch(`/api/bid-portal/${p.token}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        bid_amount: Number(form.bid_amount || 0),
        estimated_duration_days: Number(form.estimated_duration_days || 0),
      }),
    })
    const d = await res.json()
    setSaving(false)
    if (res.ok) setSubmitted(true)
    else setError(d.error || 'Submission failed')
  }

  if (loading) return <div style={{ minHeight: '100vh', background: '#0f0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading bid invitation...</div>
  if (error || !pkg) return <div style={{ minHeight: '100vh', background: '#0f0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F85149', fontSize: 16 }}>{error || 'Not found'}</div>

  if (submitted) return (
    <div style={{ minHeight: '100vh', background: '#0f0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 72, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: '#3DD68C', marginBottom: 8 }}>Bid Submitted</div>
        <div style={{ color: '#888', fontSize: 14 }}>The general contractor has received your bid. Thank you.</div>
      </div>
    </div>
  )

  const inputStyle: React.CSSProperties = { width: '100%', background: '#16213e', border: '1px solid #374151', borderRadius: 7, padding: '10px 14px', color: '#fff', fontSize: 16, boxSizing: 'border-box', outline: 'none' }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f1a', fontFamily: 'system-ui,sans-serif', padding: 20 }}>
      <div style={{ maxWidth: 620, margin: '40px auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏗️</div>
          <div style={{ color: '#D4A017', fontWeight: 900, fontSize: 18 }}>Saguaro Control</div>
          <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>Subcontractor Bid Submission</div>
        </div>

        <div style={{ background: '#16213e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Project</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{pkg.project_name}</div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>{pkg.project_address}</div>

          <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Bid Package</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#D4A017', marginBottom: 8 }}>{pkg.name}</div>
          {pkg.scope_summary && <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.6, marginBottom: 12 }}>{pkg.scope_summary}</div>}

          <div style={{ display: 'flex', gap: 20, fontSize: 12, color: '#888' }}>
            {pkg.bid_due_date && <div>📅 Due: <span style={{ color: '#F85149', fontWeight: 700 }}>{new Date(pkg.bid_due_date).toLocaleDateString()}</span></div>}
            {pkg.walkthrough_date && <div>🚶 Walkthrough: <span style={{ color: '#ddd' }}>{new Date(pkg.walkthrough_date).toLocaleDateString()}</span></div>}
          </div>
        </div>

        <form onSubmit={submit} style={{ background: '#16213e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 16 }}>Your Bid</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Company *</label>
              <input required value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Contact Name *</label>
              <input required value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Email *</label>
              <input type="email" required value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Bid Amount (USD) *</label>
            <input type="number" required min="0" step="0.01" value={form.bid_amount} onChange={e => setForm({ ...form, bid_amount: e.target.value })} style={inputStyle} placeholder="0.00" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Proposed Start Date</label>
              <input type="date" value={form.proposed_start_date} onChange={e => setForm({ ...form, proposed_start_date: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Duration (days)</label>
              <input type="number" min="0" value={form.estimated_duration_days} onChange={e => setForm({ ...form, estimated_duration_days: e.target.value })} style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Scope Notes</label>
            <textarea value={form.scope_notes} onChange={e => setForm({ ...form, scope_notes: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Inclusions</label>
              <textarea value={form.inclusions} onChange={e => setForm({ ...form, inclusions: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div>
              <label style={labelStyle}>Exclusions</label>
              <textarea value={form.exclusions} onChange={e => setForm({ ...form, exclusions: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Valid Until</label>
            <input type="date" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })} style={inputStyle} />
          </div>

          {error && <div style={{ color: '#F85149', fontSize: 13, marginBottom: 12 }}>{error}</div>}

          <button type="submit" disabled={saving}
            style={{ width: '100%', background: saving ? '#333' : '#D4A017', color: saving ? '#555' : '#000', border: 'none', borderRadius: 10, padding: '14px 0', fontWeight: 900, fontSize: 16, cursor: saving ? 'not-allowed' : 'pointer', minHeight: 44 }}>
            {saving ? '⏳ Submitting...' : '📤 Submit Bid'}
          </button>
        </form>
      </div>
    </div>
  )
}
