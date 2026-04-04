'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const GOLD = '#C8960F', DARK = '#F8F9FB', CARD = '#F8F9FB', BORDER = '#E2E5EA';
const DIM = '#6B7280', TEXT = '#e8edf8', GREEN = '#22C55E', RED = '#EF4444', QB_GREEN = '#2CA01C';

type SyncHistoryEntry = {
  timestamp: string;
  direction: string;
  entities: string[];
  results: Record<string, { count: number; status: string; details?: string }>;
  initiated_by: string;
};

type QBIntegration = {
  key: string;
  name: string;
  connected: boolean;
  status: string | null;
  last_sync_at: string | null;
  integration_id: string | null;
  settings: {
    sync_invoices?: boolean;
    sync_bills?: boolean;
    sync_customers?: boolean;
    sync_vendors?: boolean;
    sync_direction?: string;
    sync_frequency?: string;
    sync_history?: SyncHistoryEntry[];
  };
};

const SYNC_ENTITIES = [
  { key: 'invoices', label: 'Invoices', description: 'AR invoices sent to clients' },
  { key: 'bills', label: 'Bills', description: 'AP bills from subcontractors' },
  { key: 'customers', label: 'Customers', description: 'Client/owner contacts' },
  { key: 'vendors', label: 'Vendors', description: 'Subcontractor records' },
];

const FIELD_MAPPINGS = [
  { saguaro: 'invoice_number', quickbooks: 'DocNumber', entity: 'Invoice' },
  { saguaro: 'total', quickbooks: 'TotalAmt', entity: 'Invoice' },
  { saguaro: 'due_date', quickbooks: 'DueDate', entity: 'Invoice' },
  { saguaro: 'description', quickbooks: 'Line[0].Description', entity: 'Invoice' },
  { saguaro: 'vendor_name', quickbooks: 'VendorRef.name', entity: 'Bill' },
  { saguaro: 'amount', quickbooks: 'TotalAmt', entity: 'Bill' },
  { saguaro: 'name', quickbooks: 'DisplayName', entity: 'Customer' },
  { saguaro: 'email', quickbooks: 'PrimaryEmailAddr.Address', entity: 'Customer' },
  { saguaro: 'company_name', quickbooks: 'CompanyName', entity: 'Vendor' },
  { saguaro: 'phone', quickbooks: 'PrimaryPhone.FreeFormNumber', entity: 'Vendor' },
];

function formatDate(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function QuickBooksPage() {
  const [integration, setIntegration] = useState<QBIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Editable sync settings
  const [syncInvoices, setSyncInvoices] = useState(true);
  const [syncBills, setSyncBills] = useState(true);
  const [syncCustomers, setSyncCustomers] = useState(true);
  const [syncVendors, setSyncVendors] = useState(true);
  const [syncDirection, setSyncDirection] = useState('bidirectional');
  const [syncFrequency, setSyncFrequency] = useState('manual');

  const fetchIntegration = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/marketplace');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const qb = data.integrations?.find((i: any) => i.key === 'quickbooks');
      setIntegration(qb || null);
      if (qb?.settings) {
        setSyncInvoices(qb.settings.sync_invoices ?? true);
        setSyncBills(qb.settings.sync_bills ?? true);
        setSyncCustomers(qb.settings.sync_customers ?? true);
        setSyncVendors(qb.settings.sync_vendors ?? true);
        setSyncDirection(qb.settings.sync_direction || 'bidirectional');
        setSyncFrequency(qb.settings.sync_frequency || 'manual');
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIntegration(); }, [fetchIntegration]);

  useEffect(() => {
    if (notification) {
      const t = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [notification]);

  function handleConnectQB() {
    const clientId = process.env.NEXT_PUBLIC_QUICKBOOKS_CLIENT_ID || '';
    const redirectUri = encodeURIComponent(window.location.origin + '/api/integrations/quickbooks/callback');
    const scope = encodeURIComponent('com.intuit.quickbooks.accounting');
    const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=`;
    window.open(authUrl, '_blank', 'width=600,height=700');
  }

  async function handleSyncNow() {
    setSyncing(true);
    setSyncProgress(0);

    const entities: string[] = [];
    if (syncInvoices) entities.push('invoices');
    if (syncBills) entities.push('bills');
    if (syncCustomers) entities.push('customers');
    if (syncVendors) entities.push('vendors');

    if (entities.length === 0) {
      setNotification({ type: 'error', msg: 'Select at least one entity to sync' });
      setSyncing(false);
      return;
    }

    // Simulate progress
    const progressInterval = setInterval(() => {
      setSyncProgress((p) => Math.min(p + Math.random() * 15, 90));
    }, 400);

    try {
      const direction = syncDirection === 'bidirectional' ? 'push' : syncDirection === 'push' ? 'push' : 'pull';
      const res = await fetch('/api/integrations/quickbooks/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction, entities }),
      });

      clearInterval(progressInterval);
      setSyncProgress(100);

      if (!res.ok) throw new Error('Sync failed');
      const data = await res.json();

      const totalRecords = Object.values(data.results || {}).reduce((sum: number, r: any) => sum + (r.count || 0), 0);
      setNotification({ type: 'success', msg: `Sync complete! ${totalRecords} records processed.` });
      fetchIntegration();
    } catch {
      clearInterval(progressInterval);
      setNotification({ type: 'error', msg: 'Sync failed. Check your connection.' });
    }

    setTimeout(() => { setSyncing(false); setSyncProgress(0); }, 1000);
  }

  const syncHistory = integration?.settings?.sync_history || [];

  if (loading) {
    return (
      <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ color: DIM, fontSize: 14 }}>Loading QuickBooks integration...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Notification */}
      {notification && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 1000, padding: '14px 24px',
          background: notification.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          border: `1px solid ${notification.type === 'success' ? GREEN : RED}`,
          borderRadius: 10, color: notification.type === 'success' ? GREEN : RED,
          fontSize: 13, fontWeight: 600, backdropFilter: 'blur(12px)',
        }}>
          {notification.msg}
        </div>
      )}

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, fontSize: 13, color: DIM }}>
        <Link href="/app/integrations" style={{ color: GOLD, textDecoration: 'none' }}>Integrations</Link>
        <span>/</span>
        <span style={{ color: TEXT }}>QuickBooks Online</span>
      </div>

      {/* Connection Status Card */}
      <div style={{
        background: CARD, border: `1px solid ${integration?.connected ? 'rgba(34,197,94,0.3)' : BORDER}`,
        borderRadius: 14, padding: 24, marginBottom: 24, backdropFilter: 'blur(16px)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: `linear-gradient(135deg, ${QB_GREEN}22, ${QB_GREEN}44)`,
              border: `1px solid ${QB_GREEN}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 900, color: QB_GREEN,
            }}>
              QB
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>QuickBooks Online</h1>
              <div style={{ fontSize: 13, color: DIM, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: integration?.connected ? GREEN : RED, display: 'inline-block',
                }} />
                {integration?.connected ? 'Connected' : 'Not Connected'}
                {integration?.last_sync_at && (
                  <span> &middot; Last sync: {timeAgo(integration.last_sync_at)}</span>
                )}
              </div>
            </div>
          </div>

          {!integration?.connected ? (
            <button
              onClick={handleConnectQB}
              style={{
                padding: '12px 28px', borderRadius: 10, cursor: 'pointer',
                background: `linear-gradient(135deg,${QB_GREEN},#34D058)`, border: 'none',
                color: '#fff', fontSize: 14, fontWeight: 700,
              }}
            >
              Connect to QuickBooks
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleSyncNow}
                disabled={syncing}
                style={{
                  padding: '10px 24px', borderRadius: 10, cursor: 'pointer',
                  background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none',
                  color: '#ffffff', fontSize: 13, fontWeight: 700,
                  opacity: syncing ? 0.6 : 1,
                }}
              >
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          )}
        </div>

        {/* Sync Progress Bar */}
        {syncing && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: DIM, marginBottom: 6 }}>
              <span>Syncing data...</span>
              <span>{Math.round(syncProgress)}%</span>
            </div>
            <div style={{ height: 6, background: DARK, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3, transition: 'width 0.3s',
                width: `${syncProgress}%`,
                background: `linear-gradient(90deg, ${GOLD}, ${GREEN})`,
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Only show settings if connected */}
      {integration?.connected && (
        <>
          {/* Sync Settings */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 24 }}>
            {/* Entities to Sync */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 22 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: TEXT }}>Sync Entities</h3>
              {SYNC_ENTITIES.map((ent) => {
                const checked = ent.key === 'invoices' ? syncInvoices
                  : ent.key === 'bills' ? syncBills
                  : ent.key === 'customers' ? syncCustomers
                  : syncVendors;
                const toggle = ent.key === 'invoices' ? setSyncInvoices
                  : ent.key === 'bills' ? setSyncBills
                  : ent.key === 'customers' ? setSyncCustomers
                  : setSyncVendors;
                return (
                  <label
                    key={ent.key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                      borderRadius: 8, cursor: 'pointer', marginBottom: 6,
                      background: checked ? 'rgba(212,160,23,0.06)' : 'transparent',
                      border: `1px solid ${checked ? 'rgba(212,160,23,0.2)' : 'transparent'}`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggle(e.target.checked)}
                      style={{ accentColor: GOLD, width: 16, height: 16 }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{ent.label}</div>
                      <div style={{ fontSize: 11, color: DIM }}>{ent.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Direction & Frequency */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 22 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: TEXT }}>Sync Settings</h3>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 8 }}>Direction</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { key: 'push', label: 'Push to QB', icon: '\u2192' },
                    { key: 'pull', label: 'Pull from QB', icon: '\u2190' },
                    { key: 'bidirectional', label: 'Bi-directional', icon: '\u21C4' },
                  ].map((d) => (
                    <button
                      key={d.key}
                      onClick={() => setSyncDirection(d.key)}
                      style={{
                        flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        border: syncDirection === d.key ? `1px solid ${GOLD}` : `1px solid ${BORDER}`,
                        background: syncDirection === d.key ? 'rgba(212,160,23,0.1)' : 'transparent',
                        color: syncDirection === d.key ? GOLD : DIM,
                      }}
                    >
                      <div style={{ fontSize: 18, marginBottom: 4 }}>{d.icon}</div>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 8 }}>Frequency</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {['manual', 'hourly', 'daily', 'realtime'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setSyncFrequency(f)}
                      style={{
                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        border: syncFrequency === f ? `1px solid ${GOLD}` : `1px solid ${BORDER}`,
                        background: syncFrequency === f ? 'rgba(212,160,23,0.1)' : 'transparent',
                        color: syncFrequency === f ? GOLD : DIM,
                        textTransform: 'capitalize',
                      }}
                    >
                      {f === 'realtime' ? 'Real-time' : f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Sync History */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 22, marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: TEXT }}>Sync History</h3>
            {syncHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: DIM, fontSize: 13 }}>
                No sync history yet. Run your first sync above.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                      {['Date', 'Direction', 'Entities', 'Records', 'Status', 'By'].map((h) => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: DIM, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {syncHistory.slice(0, 20).map((entry, i) => {
                      const totalCount = Object.values(entry.results).reduce((s, r) => s + (r.count || 0), 0);
                      const allSuccess = Object.values(entry.results).every((r) => r.status === 'success');
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${BORDER}22` }}>
                          <td style={{ padding: '10px 12px', color: TEXT }}>{formatDate(entry.timestamp)}</td>
                          <td style={{ padding: '10px 12px', color: DIM }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                              background: entry.direction === 'push' ? 'rgba(212,160,23,0.12)' : 'rgba(59,130,246,0.12)',
                              color: entry.direction === 'push' ? GOLD : '#3B82F6',
                            }}>
                              {entry.direction === 'push' ? '\u2192 Push' : '\u2190 Pull'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', color: DIM }}>{entry.entities.join(', ')}</td>
                          <td style={{ padding: '10px 12px', color: TEXT, fontWeight: 600 }}>{totalCount}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                              background: allSuccess ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                              color: allSuccess ? GREEN : RED,
                            }}>
                              {allSuccess ? 'Success' : 'Partial Error'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', color: DIM }}>{entry.initiated_by?.split('@')[0] || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Field Mapping */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 22 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: TEXT }}>Field Mapping</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: DIM }}>How Saguaro fields map to QuickBooks fields</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: DIM, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Entity</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: DIM, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Saguaro Field</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', color: DIM, fontWeight: 600 }}>\u21C4</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: DIM, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>QuickBooks Field</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELD_MAPPINGS.map((m, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${BORDER}22` }}>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                          background: 'rgba(212,160,23,0.1)', color: GOLD,
                        }}>
                          {m.entity}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: TEXT, fontFamily: 'monospace', fontSize: 12 }}>{m.saguaro}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: DIM }}>\u2192</td>
                      <td style={{ padding: '10px 12px', color: QB_GREEN, fontFamily: 'monospace', fontSize: 12 }}>{m.quickbooks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Not connected state */}
      {!integration?.connected && (
        <div style={{
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 48,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.5 }}>QB</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: TEXT }}>Connect QuickBooks Online</h2>
          <p style={{ margin: '0 0 24px', fontSize: 14, color: DIM, maxWidth: 500, marginLeft: 'auto', marginRight: 'auto' }}>
            Sync invoices, bills, customers, and vendors between Saguaro and QuickBooks. Set up bi-directional sync to keep your accounting data in perfect harmony.
          </p>
          <button
            onClick={handleConnectQB}
            style={{
              padding: '14px 36px', borderRadius: 10, cursor: 'pointer',
              background: `linear-gradient(135deg,${QB_GREEN},#34D058)`, border: 'none',
              color: '#fff', fontSize: 15, fontWeight: 700,
            }}
          >
            Connect to QuickBooks
          </button>
        </div>
      )}
    </div>
  );
}
