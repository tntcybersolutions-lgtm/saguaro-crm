'use client'
import { useEffect, useState } from 'react'

const C = {
  bg: '#0f0f1a',
  card: '#16213e',
  border: 'rgba(255,255,255,0.08)',
  text: '#ffffff',
  dim: '#888888',
  gold: '#D4A017',
  success: '#3DD68C',
  warning: '#F0B429',
  danger: '#F85149',
  innerBg: '#1a1a2e',
}

interface PayApp {
  id: string
  project_id?: string | null
  period_from?: string | null
  period_to?: string | null
  current_payment_due?: number | null
  status?: string | null
  submitted_at?: string | null
  notes?: string | null
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:       { bg: 'rgba(255,255,255,0.06)', color: C.dim,     label: 'Draft' },
  submitted:   { bg: 'rgba(96,165,250,0.12)',  color: '#60A5FA', label: 'Submitted' },
  under_review:{ bg: 'rgba(240,180,41,0.14)',  color: C.warning, label: 'Under Review' },
  in_review:   { bg: 'rgba(240,180,41,0.14)',  color: C.warning, label: 'In Review' },
  approved:    { bg: 'rgba(61,214,140,0.14)',  color: C.success, label: 'Approved' },
  certified:   { bg: 'rgba(61,214,140,0.14)',  color: C.success, label: 'Certified' },
  rejected:    { bg: 'rgba(248,81,73,0.12)',   color: C.danger,  label: 'Rejected' },
  paid:        { bg: 'rgba(61,214,140,0.14)',  color: C.success, label: 'Paid' },
}

function fmtMoney(n: number) {
  return '$' + Math.round(Math.max(0, n)).toLocaleString('en-US')
}

export default function SubPortalPayApps() {
  const [payApps, setPayApps] = useState<PayApp[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    project_id: '',
    period_from: '',
    period_to: '',
    current_payment_due: '',
    notes: '',
  })
  const [error, setError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/sub-portal/pay-apps')
      .then(r => r.json())
      .then(d => setPayApps(d.pay_apps || []))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/sub-portal/pay-apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: form.project_id,
          period_from: form.period_from || null,
          period_to: form.period_to,
          current_payment_due: Number(form.current_payment_due || 0),
          notes: form.notes || '',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit')
      setShowForm(false)
      setForm({ project_id: '', period_from: '', period_to: '', current_payment_due: '', notes: '' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>💰 My Pay Applications</h1>
          <p style={{ color: C.dim, fontSize: 13, margin: '4px 0 0' }}>Submit and track your billing</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{ background: C.gold, color: '#000', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          {showForm ? '× Cancel' : '+ New Pay App'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {[
              { key: 'project_id',           label: 'Project ID',          type: 'text', required: true },
              { key: 'period_from',          label: 'Period From',         type: 'date', required: false },
              { key: 'period_to',            label: 'Period To',           type: 'date', required: true },
              { key: 'current_payment_due',  label: 'Amount Due ($)',      type: 'number', required: true },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: 11, color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{f.label}</label>
                <input
                  type={f.type}
                  required={f.required}
                  value={(form as Record<string, string>)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  style={{ width: '100%', background: C.bg, border: '1px solid #374151', color: C.text, borderRadius: 6, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              style={{ width: '100%', background: C.bg, border: '1px solid #374151', color: C.text, borderRadius: 6, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>
          {error && <div style={{ color: C.danger, fontSize: 13, marginTop: 12 }}>{error}</div>}
          <div style={{ marginTop: 16 }}>
            <button
              type="submit"
              disabled={submitting}
              style={{ background: submitting ? '#555' : C.gold, color: submitting ? '#888' : '#000', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 700, fontSize: 14, cursor: submitting ? 'not-allowed' : 'pointer' }}
            >
              {submitting ? 'Submitting…' : 'Submit Pay App'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ color: C.dim }}>Loading…</div>
      ) : payApps.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💰</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>No pay applications yet</div>
          <div style={{ color: C.dim, fontSize: 13 }}>Click &ldquo;New Pay App&rdquo; to submit your first one.</div>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ background: C.innerBg }}>
                  {['Period', 'Amount Due', 'Status', 'Submitted', 'Notes'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payApps.map(p => {
                  const st = STATUS_STYLE[String(p.status || 'draft')] || STATUS_STYLE.draft
                  return (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '10px 14px', fontSize: 13 }}>{p.period_to ? new Date(p.period_to).toLocaleDateString() : '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: C.gold, fontWeight: 700 }}>{fmtMoney(Number(p.current_payment_due || 0))}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: st.bg, color: st.color, fontWeight: 700, textTransform: 'uppercase' }}>{st.label}</span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: C.dim }}>{p.submitted_at ? new Date(p.submitted_at).toLocaleDateString() : '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: C.dim, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.notes || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
