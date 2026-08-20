'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

interface SuccessSummary {
  signedAt: string
  signedBy: string
  partyName: string | null
  contractTitle: string | null
  amount: number | null
}

export default function ContractPortalPage() {
  const params = useParams()
  const token = params?.token as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [html, setHtml] = useState('')
  const [contractId, setContractId] = useState('')
  const [title, setTitle] = useState('')
  const [partyName, setPartyName] = useState('')
  const [amount, setAmount] = useState(0)
  const [status, setStatus] = useState('')
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
      const r = await fetch(`/api/portals/contract/${token}`)
      if (!r.ok) {
        const txt = await r.text()
        throw new Error(txt || 'Invalid or expired link')
      }
      const d = await r.json()
      setHtml(d.html || '')
      setContractId(d.contractId || '')
      setTitle(d.title || '')
      setPartyName(d.partyName || '')
      setAmount(Number(d.amount) || 0)
      setStatus(d.status || 'draft')
      if (d.gcName) setGcName(d.gcName)
      if (d.signed || d.status === 'executed') {
        setDone(true)
        setSignedName(d.partyName || '')
      }
    } catch (e) {
      setError((e as Error).message || 'Failed to load contract')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  // Fire view tracker once per mount
  useEffect(() => {
    if (viewTrackedRef.current || !token) return
    viewTrackedRef.current = true
    fetch(`/api/portals/contract/${token}/view`, { method: 'POST' }).catch(() => {})
  }, [token])

  async function sign() {
    if (!signedName.trim()) { setError('Signer name is required'); return }
    setSubmitting(true); setError('')
    try {
      const r = await fetch(`/api/portals/contract/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedName, signerTitle }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Sign failed')
      setDone(true)
      setStatus('executed')
      setSuccess({
        signedAt: d.signedAt || new Date().toISOString(),
        signedBy: signedName,
        partyName: d.partyName || partyName,
        contractTitle: d.contractTitle || title,
        amount: d.amount != null ? Number(d.amount) : amount,
      })
    } catch (e) {
      setError((e as Error).message || 'Sign failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1117', color: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>Loading contract…</div>
      </div>
    )
  }

  if (error && !html) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1117', color: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#161b22', border: '1px solid #EF4444', padding: 30, borderRadius: 12, maxWidth: 500, textAlign: 'center' }}>
          <div style={{ fontSize: 42, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: '#EF4444', marginBottom: 10 }}>Unable to load contract</div>
          <div style={{ color: '#8BAAC8', fontSize: 13 }}>{error}</div>
        </div>
      </div>
    )
  }

  if (done && success) return <SuccessScreen success={success} gcName={gcName} docLabel="Subcontract" />

  const stepActive = (n: 1 | 2 | 3) => {
    if (done) return n === 3
    if (html && !done) return n === 1 || n === 2
    return n === 1
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#F0F4FF' }}>
      <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#16213e)', borderBottom: '3px solid #C8960F', padding: '16px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#C8960F', letterSpacing: 1.2, textTransform: 'uppercase' }}>{gcName}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#F0F4FF', marginTop: 2 }}>Subcontract Agreement</div>
            <div style={{ fontSize: 12, color: '#8BAAC8', marginTop: 3 }}>{title || 'Review and sign below'}</div>
          </div>
          <div style={{ fontSize: 12, color: '#F0F4FF' }}>
            {partyName && <div><strong>Sub:</strong> {partyName}</div>}
            {amount > 0 && <div><strong>Amount:</strong> ${amount.toLocaleString()}</div>}
            <div><strong>Status:</strong> <span style={{ color: status === 'executed' ? '#22C55E' : '#C8960F' }}>{status.toUpperCase()}</span></div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
        <DarkProgressSteps
          steps={[
            { n: 1, label: 'Review', active: stepActive(1) },
            { n: 2, label: 'Sign', active: stepActive(2) },
            { n: 3, label: 'Confirmation', active: stepActive(3) },
          ]}
        />

        {html && (
          <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
            <iframe
              title="Contract"
              srcDoc={html}
              style={{ width: '100%', height: '80vh', border: 'none', background: '#fff' }}
            />
          </div>
        )}

        <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 24 }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, color: '#C8960F' }}>✍️ Sign This Subcontract</div>
          <div style={{ fontSize: 13, color: '#8BAAC8', marginBottom: 18 }}>
            By typing your name below and clicking &quot;Sign &amp; Submit&quot;, you electronically sign this subcontract agreement. Your IP address and timestamp will be recorded.
          </div>
          {error && (
            <div style={{ background: 'rgba(239,68,68,.12)', border: '1px solid #EF4444', borderRadius: 8, padding: 10, marginBottom: 14, color: '#EF4444', fontSize: 13 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8BAAC8', textTransform: 'uppercase', marginBottom: 4 }}>Full Legal Name *</label>
              <input
                value={signedName}
                onChange={e => setSignedName(e.target.value)}
                placeholder="John Doe"
                style={{ width: '100%', padding: '10px 12px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, color: '#F0F4FF', fontSize: 14 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8BAAC8', textTransform: 'uppercase', marginBottom: 4 }}>Title</label>
              <input
                value={signerTitle}
                onChange={e => setSignerTitle(e.target.value)}
                placeholder="President"
                style={{ width: '100%', padding: '10px 12px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, color: '#F0F4FF', fontSize: 14 }}
              />
            </div>
          </div>
          <button
            onClick={sign}
            disabled={submitting || !signedName.trim()}
            style={{
              width: '100%',
              padding: '14px',
              background: submitting || !signedName.trim() ? '#30363d' : 'linear-gradient(135deg,#C8960F,#F0C040)',
              color: submitting || !signedName.trim() ? '#8BAAC8' : '#000',
              border: 'none',
              borderRadius: 10,
              fontWeight: 900,
              fontSize: 15,
              cursor: submitting || !signedName.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Signing…' : '✍️ Sign & Submit'}
          </button>
          <div style={{ fontSize: 10, color: '#8BAAC8', marginTop: 14, textAlign: 'center' }}>
            Contract ID: {contractId} · Powered by Saguaro Construction Intelligence Platform
          </div>
        </div>
      </div>
    </div>
  )
}

function DarkProgressSteps({ steps }: { steps: Array<{ n: number; label: string; active: boolean }> }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18, background: '#161b22', padding: '12px 16px', borderRadius: 10, border: '1px solid #30363d' }}>
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: s.active ? '#C8960F' : '#30363d',
              color: s.active ? '#0d1117' : '#8BAAC8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 13,
            }}>{s.n}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: s.active ? '#F0F4FF' : '#8BAAC8' }}>{s.label}</div>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, background: s.active ? '#C8960F' : '#30363d' }} />
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
        maxWidth: 560, width: '100%', textAlign: 'center',
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
            {success.contractTitle && (
              <tr>
                <td style={{ padding: '6px 10px', color: '#8BAAC8', textAlign: 'left' }}>Contract:</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{success.contractTitle}</td>
              </tr>
            )}
            {success.partyName && (
              <tr>
                <td style={{ padding: '6px 10px', color: '#8BAAC8', textAlign: 'left' }}>Subcontractor:</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{success.partyName}</td>
              </tr>
            )}
            {success.amount != null && success.amount > 0 && (
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
