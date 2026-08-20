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
}

interface Rfi {
  id: string
  rfi_number?: string | null
  subject?: string | null
  question?: string | null
  status?: string | null
  due_date?: string | null
  response?: string | null
  responded_at?: string | null
}

const STATUS_COLOR: Record<string, string> = {
  open: C.warning,
  in_review: C.warning,
  answered: C.success,
  closed: C.dim,
}

export default function SubPortalRfis() {
  const [rfis, setRfis] = useState<Rfi[]>([])
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState<string | null>(null)
  const [responseText, setResponseText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/sub-portal/rfis')
      .then(r => r.json())
      .then(d => setRfis(d.rfis || []))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  async function submitResponse(rfiId: string) {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/sub-portal/rfis', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfi_id: rfiId, response: responseText, status: 'answered' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to respond')
      setResponding(null)
      setResponseText('')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to respond')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>❓ My RFIs</h1>
        <p style={{ color: C.dim, fontSize: 13, margin: '4px 0 0' }}>Requests for information assigned to you</p>
      </div>

      {loading ? (
        <div style={{ color: C.dim }}>Loading…</div>
      ) : rfis.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>❓</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>No RFIs assigned</div>
          <div style={{ color: C.dim, fontSize: 13 }}>You&apos;ll see RFIs here when the GC assigns them to you.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rfis.map(r => {
            const status = String(r.status || 'open')
            const color = STATUS_COLOR[status] || C.warning
            const isOverdue = r.due_date && new Date(r.due_date) < new Date() && status !== 'answered' && status !== 'closed'
            return (
              <div
                key={r.id}
                style={{
                  background: C.card,
                  border: `1px solid ${isOverdue ? C.danger : C.border}`,
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 4 }}>{r.rfi_number || 'RFI'}</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{r.subject || 'No subject'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    {isOverdue && (
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'rgba(248,81,73,0.14)', color: C.danger, fontWeight: 700, textTransform: 'uppercase' }}>Overdue</span>
                    )}
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: `${color}22`, color, fontWeight: 700, textTransform: 'uppercase' }}>{status.replace(/_/g, ' ')}</span>
                  </div>
                </div>
                {r.question && (
                  <div style={{ fontSize: 13, color: C.text, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{r.question}</div>
                )}
                <div style={{ fontSize: 12, color: C.dim }}>
                  {r.due_date ? `Due ${new Date(r.due_date).toLocaleDateString()}` : 'No due date'}
                </div>

                {r.response ? (
                  <div style={{ marginTop: 12, padding: 12, background: 'rgba(61,214,140,0.08)', borderLeft: `3px solid ${C.success}`, borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: C.success, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Your Response</div>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{r.response}</div>
                    {r.responded_at && (
                      <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>Responded {new Date(r.responded_at).toLocaleString()}</div>
                    )}
                  </div>
                ) : responding === r.id ? (
                  <div style={{ marginTop: 12 }}>
                    <textarea
                      rows={4}
                      value={responseText}
                      onChange={e => setResponseText(e.target.value)}
                      placeholder="Type your response…"
                      style={{ width: '100%', background: C.bg, border: '1px solid #374151', color: C.text, borderRadius: 6, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                    {error && <div style={{ color: C.danger, fontSize: 12, marginTop: 6 }}>{error}</div>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        onClick={() => submitResponse(r.id)}
                        disabled={submitting || !responseText.trim()}
                        style={{ background: (submitting || !responseText.trim()) ? '#555' : C.gold, color: (submitting || !responseText.trim()) ? '#888' : '#000', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: submitting || !responseText.trim() ? 'not-allowed' : 'pointer' }}
                      >
                        {submitting ? 'Sending…' : 'Send Response'}
                      </button>
                      <button
                        onClick={() => { setResponding(null); setResponseText(''); setError(null) }}
                        style={{ background: 'transparent', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() => { setResponding(r.id); setResponseText(''); setError(null) }}
                      style={{ background: C.gold, color: '#000', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                    >
                      Respond
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
