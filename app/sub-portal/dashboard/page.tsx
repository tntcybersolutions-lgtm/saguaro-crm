'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const C = {
  bg: '#0f0f1a',
  card: '#16213e',
  border: 'rgba(255,255,255,0.08)',
  text: '#ffffff',
  dim: '#888888',
  gold: '#D4A017',
  success: '#3DD68C',
  warning: '#F0B429',
}

interface Me {
  user: { id: string; email?: string | null }
  subcontractor: { id?: string; company_name?: string; tenant_id?: string } | null
}

interface PayApp {
  id: string
  period_to?: string | null
  current_payment_due?: number | null
  status?: string | null
}

interface Rfi {
  id: string
  subject?: string | null
  question?: string | null
  status?: string | null
  due_date?: string | null
}

function fmtMoney(n: number) {
  return '$' + Math.round(Math.max(0, n)).toLocaleString('en-US')
}

export default function SubPortalDashboard() {
  const [me, setMe] = useState<Me | null>(null)
  const [payApps, setPayApps] = useState<PayApp[]>([])
  const [rfis, setRfis] = useState<Rfi[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/sub-portal/me').then(r => r.json()),
      fetch('/api/sub-portal/pay-apps').then(r => r.json()),
      fetch('/api/sub-portal/rfis').then(r => r.json()),
    ]).then(([meData, payData, rfiData]) => {
      setMe(meData)
      setPayApps(payData.pay_apps || [])
      setRfis(rfiData.rfis || [])
    }).finally(() => setLoading(false))
  }, [])

  const openRfis = rfis.filter(r => r.status !== 'answered' && r.status !== 'closed')
  const pendingPay = payApps.filter(p => ['submitted', 'under_review', 'in_review'].includes(String(p.status)))
  const approvedPay = payApps.filter(p => ['approved', 'certified'].includes(String(p.status)))
  const approvedTotal = approvedPay.reduce((s, p) => s + Number(p.current_payment_due || 0), 0)

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 4px' }}>Welcome{me?.subcontractor?.company_name ? `, ${me.subcontractor.company_name}` : ''}</h1>
      <p style={{ color: C.dim, fontSize: 13, margin: '0 0 24px' }}>Your portal overview</p>

      {loading ? (
        <div style={{ color: C.dim }}>Loading…</div>
      ) : !me?.subcontractor ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, color: C.dim }}>
          Your account isn&apos;t linked to a subcontractor profile yet. Please contact the GC.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Open RFIs</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: openRfis.length > 0 ? C.warning : C.success }}>{openRfis.length}</div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Pay Apps Submitted</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: C.gold }}>{payApps.length}</div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Pending Review</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: C.warning }}>{pendingPay.length}</div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Approved YTD</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: C.success }}>{fmtMoney(approvedTotal)}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recent Pay Apps</div>
                <Link href="/sub-portal/pay-apps" style={{ color: C.gold, fontSize: 12, textDecoration: 'none' }}>View all →</Link>
              </div>
              {payApps.slice(0, 5).length === 0 ? (
                <div style={{ color: C.dim, fontSize: 13, padding: '12px 0' }}>No pay applications yet.</div>
              ) : (
                payApps.slice(0, 5).map(p => (
                  <div key={p.id} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.period_to ? new Date(p.period_to).toLocaleDateString() : 'Pay App'}</div>
                      <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase' }}>{p.status || 'draft'}</div>
                    </div>
                    <div style={{ fontSize: 13, color: C.gold, fontWeight: 700 }}>{fmtMoney(Number(p.current_payment_due || 0))}</div>
                  </div>
                ))
              )}
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Open RFIs</div>
                <Link href="/sub-portal/rfis" style={{ color: C.gold, fontSize: 12, textDecoration: 'none' }}>View all →</Link>
              </div>
              {openRfis.slice(0, 5).length === 0 ? (
                <div style={{ color: C.dim, fontSize: 13, padding: '12px 0' }}>No open RFIs.</div>
              ) : (
                openRfis.slice(0, 5).map(r => (
                  <div key={r.id} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.subject || 'RFI'}</div>
                    <div style={{ fontSize: 11, color: C.dim }}>
                      {r.due_date ? `Due ${new Date(r.due_date).toLocaleDateString()}` : 'No due date'} · {r.status || 'open'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
