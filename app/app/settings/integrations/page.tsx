'use client'
import { useState, useEffect } from 'react'

interface QBOConn { realm_id: string; status: string; connected_at: string }
interface SyncLog { sync_type: string; status: string; synced_at: string; notes: string }

export default function IntegrationsPage() {
  const [qbo, setQbo] = useState<QBOConn | null>(null)
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/integrations/quickbooks/sync')
      .then(r => r.json())
      .then(d => { setQbo(d.connection); setLogs(d.sync_log || []); setLoading(false) })
      .catch(() => setLoading(false))

    const params = new URLSearchParams(window.location.search)
    if (params.get('qbo') === 'connected') setSyncResult('✅ QuickBooks connected successfully!')
    if (params.get('error')) setSyncResult(`❌ ${params.get('error')?.replace(/_/g, ' ')}`)
  }, [])

  const sync = async (type = 'all') => {
    setSyncing(true); setSyncResult('')
    const res = await fetch('/api/integrations/quickbooks/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sync_type: type }),
    })
    const d = await res.json()
    setSyncing(false)
    setSyncResult(d.message || d.error || 'Sync complete')
    if (res.ok) {
      fetch('/api/integrations/quickbooks/sync').then(r => r.json()).then(d => setLogs(d.sync_log || []))
    }
  }

  const disconnect = async () => {
    if (!confirm('Disconnect QuickBooks? This will stop syncing.')) return
    await fetch('/api/integrations/quickbooks/disconnect', { method: 'POST' })
    setQbo(null); setSyncResult('QuickBooks disconnected.')
  }

  return (
    <div style={{ padding: 28, background: '#0f0f1a', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>🔗 Integrations</h1>
      <p style={{ color: '#666', fontSize: 13, margin: '0 0 32px' }}>Connect Saguaro to your accounting and project management tools.</p>

      <div style={{ background: '#16213e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 28, maxWidth: 640, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{ width: 48, height: 48, background: '#2CA01C', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>📊</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>QuickBooks Online</div>
            <div style={{ fontSize: 12, color: '#666' }}>Sync pay apps → invoices, contracts → bills, change orders → line items</div>
          </div>
          {qbo?.status === 'active' && (
            <span style={{ marginLeft: 'auto', background: 'rgba(61,214,140,0.12)', color: '#3DD68C', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>Connected</span>
          )}
        </div>

        {loading ? (
          <div style={{ color: '#555', fontSize: 13 }}>Loading...</div>
        ) : qbo?.status === 'active' ? (
          <>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 12 }}>
              <div style={{ color: '#555', marginBottom: 4 }}>Realm ID: <span style={{ color: '#888' }}>{qbo.realm_id}</span></div>
              <div style={{ color: '#555' }}>Connected: <span style={{ color: '#888' }}>{new Date(qbo.connected_at).toLocaleDateString()}</span></div>
            </div>

            {syncResult && (
              <div style={{ background: syncResult.startsWith('✅') ? 'rgba(61,214,140,0.1)' : 'rgba(248,81,73,0.1)', border: `1px solid ${syncResult.startsWith('✅') ? 'rgba(61,214,140,0.3)' : 'rgba(248,81,73,0.3)'}`, borderRadius: 7, padding: '8px 14px', marginBottom: 14, fontSize: 13, color: syncResult.startsWith('✅') ? '#3DD68C' : '#F85149' }}>
                {syncResult}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button onClick={() => sync('all')} disabled={syncing}
                style={{ flex: 1, background: syncing ? '#333' : '#D4A017', color: syncing ? '#555' : '#000', border: 'none', borderRadius: 8, padding: '10px 0', fontWeight: 700, cursor: syncing ? 'not-allowed' : 'pointer', fontSize: 13 }}>
                {syncing ? '⏳ Syncing...' : '⚡ Sync Now'}
              </button>
              <button onClick={() => sync('pay_apps')} disabled={syncing}
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: '#888', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 0', cursor: syncing ? 'not-allowed' : 'pointer', fontSize: 12 }}>
                Pay Apps Only
              </button>
              <button onClick={disconnect}
                style={{ background: 'transparent', color: '#F85149', border: '1px solid rgba(248,81,73,0.25)', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', fontSize: 12 }}>
                Disconnect
              </button>
            </div>

            <div style={{ fontSize: 12, color: '#555', marginBottom: 16 }}>
              <div style={{ marginBottom: 6, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em' }}>What syncs:</div>
              {[
                { from: '✅ Certified Pay Applications', to: 'QBO Invoices' },
                { from: '✅ Approved Change Orders', to: 'QBO Journal Entries' },
                { from: '✅ Executed Subcontracts', to: 'QBO Bills' },
              ].map(({ from, to }) => (
                <div key={from} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: '#888' }}>{from}</span>
                  <span style={{ color: '#555' }}>→ {to}</span>
                </div>
              ))}
            </div>

            {logs.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Recent Syncs</div>
                {logs.slice(0, 5).map((l, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 12 }}>
                    <span style={{ color: '#888' }}>{l.sync_type.replace(/_/g, ' ')}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: '#555' }}>{new Date(l.synced_at).toLocaleString()}</span>
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: l.status === 'success' ? 'rgba(61,214,140,0.12)' : 'rgba(240,180,41,0.12)', color: l.status === 'success' ? '#3DD68C' : '#F0B429', fontWeight: 700 }}>
                        {l.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {syncResult && (
              <div style={{ background: syncResult.startsWith('✅') ? 'rgba(61,214,140,0.1)' : 'rgba(248,81,73,0.1)', borderRadius: 7, padding: '8px 14px', marginBottom: 14, fontSize: 13, color: syncResult.startsWith('✅') ? '#3DD68C' : '#F85149', border: `1px solid ${syncResult.startsWith('✅') ? 'rgba(61,214,140,0.3)' : 'rgba(248,81,73,0.3)'}` }}>
                {syncResult}
              </div>
            )}
            <div style={{ fontSize: 13, color: '#666', marginBottom: 20, lineHeight: 1.6 }}>
              Connect QuickBooks Online to automatically sync certified pay applications as invoices, approved change orders, and executed subcontracts as bills.
              <br /><br />
              <strong style={{ color: '#888' }}>Setup required:</strong> Add <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>QUICKBOOKS_CLIENT_ID</code> and <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>QUICKBOOKS_CLIENT_SECRET</code> to your Vercel environment variables. Get these from <a href="https://developer.intuit.com" target="_blank" rel="noopener noreferrer" style={{ color: '#D4A017' }}>developer.intuit.com</a>.
            </div>
            <a href="/api/integrations/quickbooks/connect"
              style={{ display: 'inline-block', background: '#2CA01C', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 24px', fontWeight: 700, cursor: 'pointer', fontSize: 14, textDecoration: 'none' }}>
              Connect QuickBooks →
            </a>
          </>
        )}
      </div>

      {[
        { icon: '💼', name: 'Sage 300 CRE', desc: 'Two-way job cost sync', status: 'Roadmap' },
        { icon: '📥', name: 'Procore Import', desc: 'Import projects and data from Procore', status: 'Roadmap' },
        { icon: '📧', name: 'Outlook / Gmail', desc: 'Auto-log project emails to RFI and correspondence log', status: 'Roadmap' },
      ].map(({ icon, name, desc, status }) => (
        <div key={name} style={{ background: '#16213e', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '20px 24px', maxWidth: 640, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 16, opacity: 0.6 }}>
          <div style={{ fontSize: 28 }}>{icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#888' }}>{name}</div>
            <div style={{ fontSize: 12, color: '#555' }}>{desc}</div>
          </div>
          <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.05)', color: '#555', padding: '3px 10px', borderRadius: 20 }}>{status}</span>
        </div>
      ))}
    </div>
  )
}
