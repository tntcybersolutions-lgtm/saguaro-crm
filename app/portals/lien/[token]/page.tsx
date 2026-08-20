'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'

interface SuccessSummary {
  signedAt: string
  claimantName: string | null
  amount: number | null
  waiverType: string | null
  signedBy: string
}

export default function LienWaiverPortalPage() {
  const params = useParams()
  const token = params['token'] as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [html, setHtml] = useState('')
  const [waiverId, setWaiverId] = useState('')
  const [status, setStatus] = useState<string>('draft')
  const [gcName, setGcName] = useState<string>('Saguaro Construction Intelligence')
  const [signedName, setSignedName] = useState('')
  const [signerTitle, setSignerTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [success, setSuccess] = useState<SuccessSummary | null>(null)
  const viewTrackedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/portals/lien/${token}`)
      if (!r.ok) {
        const txt = await r.text()
        throw new Error(txt || 'Invalid or expired link')
      }
      const d = await r.json()
      setHtml(d.html || '')
      setWaiverId(d.waiverId || '')
      setStatus(d.status || 'draft')
      if (d.gcName) setGcName(d.gcName)
      if (d.status === 'signed') setDone(true)
    } catch (e) {
      setError((e as Error).message || 'Failed to load waiver')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  // Fire view tracker once per mount
  useEffect(() => {
    if (viewTrackedRef.current || !token) return
    viewTrackedRef.current = true
    fetch(`/api/portals/lien/${token}/view`, { method: 'POST' }).catch(() => {})
  }, [token])

  async function sign() {
    if (!signedName.trim()) { setError('Signer name is required'); return }
    setSubmitting(true); setError('')
    try {
      const r = await fetch(`/api/portals/lien/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedName, signerTitle }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Sign failed')
      setDone(true)
      setStatus('signed')
      setSuccess({
        signedAt: d.signedAt || new Date().toISOString(),
        claimantName: d.claimantName || null,
        amount: d.amount || null,
        waiverType: d.waiverType || null,
        signedBy: signedName,
      })
    } catch (e) {
      setError((e as Error).message || 'Sign failed')
    } finally {
      setSubmitting(false)
    }
  }

  const stepActive = (n: 1 | 2 | 3) => {
    if (done) return n === 3
    if (html && !done) return n === 1 || n === 2
    return n === 1
  }

  if (done && success) return <SuccessScreen success={success} gcName={gcName} docLabel="Lien Waiver" />

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f1a', color: '#F0F4FF', padding: '24px 12px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', background: '#16213e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.5)', padding: 28 }}>
        {/* GC-branded header */}
        <div style={{ borderBottom: '3px solid #D4A017', paddingBottom: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.2, color: '#D4A017', fontWeight: 800 }}>{gcName.toUpperCase()}</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#F0F4FF', marginTop: 2 }}>Lien Waiver — Electronic Signature</div>
        </div>

        {/* Progress steps */}
        <ProgressSteps
          steps={[
            { n: 1, label: 'Review', active: stepActive(1) },
            { n: 2, label: 'Sign', active: stepActive(2) },
            { n: 3, label: 'Confirmation', active: stepActive(3) },
          ]}
        />

        {loading && <div style={{ padding: 40, textAlign: 'center', color: '#8BAAC8' }}>Loading waiver…</div>}

        {error && !loading && (
          <div style={{ padding: 14, background: 'rgba(248,81,73,.12)', border: '1px solid #F85149', borderRadius: 8, color: '#F85149', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {!loading && !error && html && (
          <>
            <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 0, marginBottom: 20, background: '#fff', maxHeight: 520, overflowY: 'auto' }}>
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </div>

            {status === 'signed' ? (
              <div style={{ padding: 20, background: 'rgba(61,214,140,.12)', border: '1px solid #3DD68C', borderRadius: 8, color: '#3DD68C' }}>
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 4 }}>✓ Signed</div>
                <div style={{ fontSize: 13 }}>This waiver has been signed. A copy has been saved to the project record.</div>
              </div>
            ) : (
              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 20, background: '#0f0f1a' }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#F0F4FF', marginBottom: 14 }}>Sign This Waiver</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8BAAC8', marginBottom: 4 }}>Full Name *</label>
                    <input value={signedName} onChange={e => setSignedName(e.target.value)} placeholder="Jane Smith" style={{ width: '100%', padding: '9px 12px', border: '1px solid rgba(255,255,255,0.1)', background: '#16213e', borderRadius: 6, fontSize: 14, color: '#F0F4FF' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8BAAC8', marginBottom: 4 }}>Title</label>
                    <input value={signerTitle} onChange={e => setSignerTitle(e.target.value)} placeholder="President" style={{ width: '100%', padding: '9px 12px', border: '1px solid rgba(255,255,255,0.1)', background: '#16213e', borderRadius: 6, fontSize: 14, color: '#F0F4FF' }} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#8BAAC8', marginBottom: 12 }}>
                  By clicking &quot;Sign &amp; Submit&quot; you agree this electronic signature has the same legal effect as a handwritten signature (E-SIGN Act, UETA).
                </div>
                <button onClick={sign} disabled={submitting}
                  style={{ padding: '11px 24px', background: 'linear-gradient(135deg,#D4A017,#F0C040)', border: 'none', borderRadius: 8, color: '#0f0f1a', fontSize: 14, fontWeight: 800, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? .6 : 1 }}>
                  {submitting ? 'Submitting…' : 'Sign & Submit'}
                </button>
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 20, fontSize: 10, color: '#8BAAC8', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
          DISCLAIMER: This document was generated by Saguaro Construction Intelligence Platform.
          This document does not constitute legal advice. Verify compliance with current state statutes
          and consult a licensed state construction attorney before relying on this document for legal purposes.
        </div>
      </div>
      {waiverId && <input type="hidden" value={waiverId} readOnly />}
    </div>
  )
}

function ProgressSteps({ steps }: { steps: Array<{ n: number; label: string; active: boolean }> }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18, background: '#0f0f1a', padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: s.active ? '#D4A017' : '#30363d',
              color: s.active ? '#0f0f1a' : '#8BAAC8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 13,
            }}>
              {s.n}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: s.active ? '#F0F4FF' : '#8BAAC8' }}>{s.label}</div>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, background: s.active ? '#D4A017' : '#30363d' }} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

function SuccessScreen({ success, gcName, docLabel }: {
  success: SuccessSummary
  gcName: string
  docLabel: string
}) {
  const animation = `
    @keyframes bounceIn {
      0%   { opacity: 0; transform: scale(.3); }
      50%  { opacity: 1; transform: scale(1.15); }
      70%  { transform: scale(.95); }
      100% { transform: scale(1); }
    }
  `
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f0f1a',
      color: '#F0F4FF',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px 16px',
      fontFamily: 'Arial, sans-serif',
    }}>
      <style>{animation}</style>
      <div style={{
        maxWidth: 520, width: '100%', textAlign: 'center',
        background: '#161b22', borderRadius: 16, padding: '40px 28px',
        border: '1px solid #1E3A5F',
      }}>
        <div style={{
          fontSize: 80, marginBottom: 16,
          animation: 'bounceIn .7s cubic-bezier(.22,1,.36,1) both',
        }}>✅</div>
        <h1 style={{
          margin: '0 0 8px', fontSize: 24, fontWeight: 900,
          color: '#3DD68C', letterSpacing: 0.2,
        }}>Successfully Signed</h1>
        <div style={{ fontSize: 13, color: '#8BAAC8', marginBottom: 20 }}>
          Your {docLabel} has been signed and recorded with {gcName}.
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, margin: '14px 0 18px' }}>
          <tbody>
            <tr>
              <td style={{ padding: '6px 10px', color: '#8BAAC8', textAlign: 'left' }}>Signed by:</td>
              <td style={{ padding: '6px 10px', fontWeight: 700, textAlign: 'right' }}>{success.signedBy}</td>
            </tr>
            <tr>
              <td style={{ padding: '6px 10px', color: '#8BAAC8', textAlign: 'left' }}>Signed at:</td>
              <td style={{ padding: '6px 10px', textAlign: 'right' }}>{new Date(success.signedAt).toLocaleString()}</td>
            </tr>
            {success.claimantName && (
              <tr>
                <td style={{ padding: '6px 10px', color: '#8BAAC8', textAlign: 'left' }}>Subcontractor:</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{success.claimantName}</td>
              </tr>
            )}
            {success.amount != null && (
              <tr>
                <td style={{ padding: '6px 10px', color: '#8BAAC8', textAlign: 'left' }}>Amount:</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', color: '#C8960F', fontWeight: 700 }}>
                  ${Number(success.amount).toLocaleString()}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ fontSize: 13, color: '#8BAAC8' }}>
          A confirmation has been sent to your email address.
        </div>
        <div style={{ marginTop: 26, paddingTop: 20, borderTop: '1px solid #1E3A5F', fontSize: 11, color: '#8BAAC8' }}>
          Powered by Saguaro Construction Intelligence Platform
        </div>
      </div>
    </div>
  )
}
