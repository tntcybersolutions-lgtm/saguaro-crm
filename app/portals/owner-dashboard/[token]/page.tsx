'use client'
import { useState, useEffect } from 'react'

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export default function OwnerPortal({ params }: { params: Promise<{ token: string }> }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('overview')

  useEffect(() => {
    params.then(p => {
      fetch(`/api/portals/owner-dashboard/${p.token}`)
        .then(r => r.json())
        .then(d => { setData(d); setLoading(false) })
        .catch(() => { setError('Invalid or expired link'); setLoading(false) })
    })
  }, [params])

  if (loading) return <div style={{ minHeight: '100vh', background: '#0f0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 16 }}>Loading project portal...</div>
  if (error || !data) return <div style={{ minHeight: '100vh', background: '#0f0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F85149', fontSize: 16 }}>{error || 'Not found'}</div>

  const project = (data.project as Record<string, unknown>) || {}
  const payApps = (data.pay_apps as Record<string, unknown>[]) || []
  const cos = (data.change_orders as Record<string, unknown>[]) || []
  const rfis = (data.open_rfis as Record<string, unknown>[]) || []
  const schedule = (data.schedule as Record<string, unknown>[]) || []
  const photos = (data.photos as Record<string, unknown>[]) || []
  const logs = (data.daily_logs as Record<string, unknown>[]) || []

  const totalBilled = payApps.reduce((s, p) => s + Number(p.current_payment_due || 0), 0)
  const approvedCOs = cos.filter(c => c.status === 'approved').reduce((s, c) => s + Number(c.amount || 0), 0)
  const contractValue = Number(project?.contract_value || 0)
  const pctComplete = schedule.length > 0 ? Math.round(schedule.reduce((s, t) => s + Number(t.percent_complete || 0), 0) / schedule.length) : Number(project?.percent_complete || 0)

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f1a', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ background: '#16213e', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 24 }}>🏗️</div>
          <div>
            <div style={{ color: '#D4A017', fontWeight: 900, fontSize: 14 }}>{(data.company_name as string) || 'General Contractor'}</div>
            <div style={{ color: '#666', fontSize: 11 }}>Owner Project Portal</div>
          </div>
        </div>
        <div style={{ color: '#555', fontSize: 11 }}>Last updated: {new Date().toLocaleDateString()}</div>
      </div>

      <div style={{ background: 'linear-gradient(135deg,#16213e,#1a1a2e)', padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: '#fff', margin: '0 0 4px' }}>{project?.name as string}</h1>
        <div style={{ color: '#888', fontSize: 13 }}>{project?.address as string}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginTop: 20 }}>
          {[
            { l: 'Overall Complete', v: `${pctComplete}%`, c: '#D4A017' },
            { l: 'Contract Value', v: fmt(contractValue), c: '#fff' },
            { l: 'Billed to Date', v: fmt(totalBilled), c: '#60A5FA' },
            { l: 'Approved Changes', v: fmt(approvedCOs), c: approvedCOs > 0 ? '#F0B429' : '#3DD68C' },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: c }}>{v}</div>
              <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '0 24px', background: '#16213e' }}>
        {['overview', 'photos', 'schedule', 'financials', 'rfis'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '12px 18px', fontSize: 12, fontWeight: tab === t ? 700 : 400, color: tab === t ? '#fff' : '#555', borderBottom: tab === t ? '2px solid #D4A017' : '2px solid transparent', marginBottom: -1, textTransform: 'capitalize' }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>

        {tab === 'overview' && (
          <div>
            {logs.length > 0 && (
              <div style={{ background: '#16213e', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#ddd', marginBottom: 14 }}>Recent Field Activity</div>
                {logs.map((l, i) => (
                  <div key={i} style={{ display: 'flex', gap: 16, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: '#D4A017', fontWeight: 700, minWidth: 80 }}>{new Date(String(l.log_date)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{l.weather as string}</div>
                    <div style={{ fontSize: 12, color: '#666', marginLeft: 'auto' }}>{l.total_crew as number} workers</div>
                  </div>
                ))}
              </div>
            )}
            {rfis.length > 0 && (
              <div style={{ background: 'rgba(240,180,41,0.08)', border: '1px solid rgba(240,180,41,0.25)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <span style={{ fontSize: 13, color: '#F0B429' }}>{rfis.length} open RFI{rfis.length > 1 ? 's' : ''} awaiting response</span>
              </div>
            )}
            {schedule.length > 0 && (
              <div style={{ background: '#16213e', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#ddd', marginBottom: 14 }}>Schedule Status</div>
                {schedule.slice(0, 6).map((t, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: '#ccc' }}>{t.title as string}</span>
                      <span style={{ fontSize: 12, color: '#888' }}>{t.percent_complete as number}%</span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${t.percent_complete as number}%`, height: '100%', background: Number(t.percent_complete) === 100 ? '#3DD68C' : '#D4A017', borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'photos' && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#ddd', marginBottom: 16 }}>{photos.length} progress photos</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
              {photos.map((p, i) => (
                <div key={i} style={{ borderRadius: 8, overflow: 'hidden', aspectRatio: '4/3', background: '#16213e' }}>
                  <img src={p.file_url as string} alt={(p.caption as string) || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'schedule' && (
          <div style={{ background: '#16213e', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#1a1a2e' }}>{['Task', 'Start', 'End', 'Progress', 'Status'].map(h => <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>)}</tr></thead>
              <tbody>
                {schedule.map((t, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '11px 16px', color: '#ddd', fontSize: 13 }}>{t.title as string}</td>
                    <td style={{ padding: '11px 16px', color: '#666', fontSize: 12 }}>{t.start_date ? new Date(String(t.start_date)).toLocaleDateString() : ''}</td>
                    <td style={{ padding: '11px 16px', color: '#666', fontSize: 12 }}>{t.end_date ? new Date(String(t.end_date)).toLocaleDateString() : ''}</td>
                    <td style={{ padding: '11px 16px', minWidth: 120 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
                          <div style={{ width: `${t.percent_complete as number}%`, height: '100%', background: '#D4A017', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, color: '#888' }}>{t.percent_complete as number}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '11px 16px' }}><span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 700, background: t.status === 'complete' ? 'rgba(61,214,140,0.12)' : 'rgba(212,160,23,0.12)', color: t.status === 'complete' ? '#3DD68C' : '#D4A017' }}>{String(t.status || '').replace(/_/g, ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'financials' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              {[
                { l: 'Contract Value', v: fmt(contractValue) },
                { l: 'Billed to Date', v: fmt(totalBilled) },
                { l: 'Approved Change Orders', v: fmt(approvedCOs) },
                { l: 'Balance Remaining', v: fmt(contractValue + approvedCOs - totalBilled) },
              ].map(({ l, v }) => (
                <div key={l} style={{ background: '#16213e', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '16px 20px' }}>
                  <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{l}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#D4A017' }}>{v}</div>
                </div>
              ))}
            </div>
            {cos.length > 0 && (
              <div style={{ background: '#16213e', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', fontSize: 13, fontWeight: 700, color: '#ddd', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Change Orders</div>
                {cos.map((co, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <div>
                      <div style={{ fontSize: 13, color: '#ddd', fontWeight: 600 }}>{co.title as string}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#D4A017' }}>{fmt(Number(co.amount || 0))}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 700, background: co.status === 'approved' ? 'rgba(61,214,140,0.12)' : 'rgba(240,180,41,0.12)', color: co.status === 'approved' ? '#3DD68C' : '#F0B429' }}>{co.status as string}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'rfis' && (
          rfis.length === 0
            ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#3DD68C', fontSize: 15, fontWeight: 700 }}>✅ No open RFIs</div>
            : <div style={{ background: '#16213e', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
                {rfis.map((r, i) => (
                  <div key={i} style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: 11, color: '#D4A017', fontWeight: 700, marginBottom: 2 }}>{r.rfi_number as string}</div>
                    <div style={{ fontSize: 13, color: '#ddd' }}>{r.title as string}</div>
                    <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{new Date(String(r.created_at)).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
        )}
      </div>
    </div>
  )
}
