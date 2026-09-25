'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PremiumSurface, ModuleHero, SectionCard, StatStrip, PremiumEmpty, goldButtonStyle } from '@/components/ui/premium';
import { Plugs, ArrowsClockwise, ListChecks, SlidersHorizontal, ClockCounterClockwise, ArrowsLeftRight } from '@phosphor-icons/react';

const GOLD = '#F59E0B', DARK = '#1c1c1e', BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1', TEXT = '#FFFFFF', GREEN = '#22C55E', RED = '#EF4444', QB_GREEN = '#2CA01C';

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
    const entities: string[] = [];
    if (syncInvoices) entities.push('invoices');
    if (syncBills) entities.push('bills');
    if (syncCustomers) entities.push('customers');
    if (syncVendors) entities.push('vendors');

    if (entities.length === 0) {
      setNotification({ type: 'error', msg: 'Select at least one entity to sync' });
      return;
    }

    setSyncing(true);

    try {
      const direction = syncDirection === 'pull' ? 'pull' : 'push';
      const res = await fetch('/api/integrations/quickbooks/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction, entities }),
      });

      const data = await res.json().catch(() => ({}));

      // Honest handling of the server's real response. The API returns an
      // explicit not-configured / not-connected message when QuickBooks cannot
      // actually be reached — surface it verbatim instead of a fake "complete".
      if (!res.ok) {
        setNotification({ type: 'error', msg: data.error || 'Sync failed. Check your QuickBooks connection.' });
        setSyncing(false);
        return;
      }

      const results = (data.results || {}) as Record<string, { count: number; status: string; details?: string }>;
      const totalRecords = Object.values(results).reduce((sum, r) => sum + (r.count || 0), 0);
      const failed = Object.values(results).filter((r) => r.status === 'error' || r.status === 'partial');

      if (failed.length) {
        const firstDetail = failed[0]?.details ? ` (${failed[0].details})` : '';
        setNotification({
          type: 'error',
          msg: `Synced ${totalRecords} record${totalRecords === 1 ? '' : 's'}; some failed${firstDetail}. See sync history.`,
        });
      } else {
        setNotification({
          type: 'success',
          msg: `Synced ${totalRecords} record${totalRecords === 1 ? '' : 's'} with QuickBooks.`,
        });
      }
      fetchIntegration();
    } catch {
      setNotification({ type: 'error', msg: 'Sync failed. Check your connection.' });
    }

    setSyncing(false);
  }

  const syncHistory = integration?.settings?.sync_history || [];

  if (loading) {
    return (
      <PremiumSurface maxWidth={1100}>
        <div style={{ color: DIM, fontSize: 14 }}>Loading QuickBooks integration...</div>
      </PremiumSurface>
    );
  }

  const connected = !!integration?.connected;

  return (
    <PremiumSurface maxWidth={1100}>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: 13, color: DIM }}>
        <Link href="/app/integrations" style={{ color: GOLD, textDecoration: 'none' }}>Integrations</Link>
        <span>/</span>
        <span style={{ color: TEXT }}>QuickBooks Online</span>
      </div>

      {/* Header */}
      <ModuleHero
        eyebrow="Integration"
        eyebrowIcon={<Plugs size={13} weight="fill" color={GOLD} />}
        title="QuickBooks"
        accent="Online"
        subtitle="Two-way sync of invoices, bills, customers, and vendors."
        actions={connected ? (
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="pmBtn"
            style={{ ...goldButtonStyle, opacity: syncing ? 0.6 : 1, cursor: syncing ? 'not-allowed' : 'pointer' }}
          >
            <ArrowsClockwise size={15} weight="bold" /> {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        ) : (
          <button onClick={handleConnectQB} className="pmBtn" style={goldButtonStyle}>
            <Plugs size={15} weight="fill" /> Connect to QuickBooks
          </button>
        )}
      />

      {/* What the integration already knows — every figure derived from live state */}
      <StatStrip items={[
        { label: 'Connection', value: connected ? 'Connected' : 'Not Connected', accent: connected ? GREEN : RED, sub: 'QuickBooks Online' },
        { label: 'Last Sync', value: timeAgo(integration?.last_sync_at ?? null), sub: 'most recent run' },
        { label: 'Syncs Recorded', value: String(syncHistory.length), sub: 'kept in history below' },
        { label: 'Records Synced', value: String(syncHistory.reduce((s, h) => s + Object.values(h.results).reduce((x, r) => x + (r.count || 0), 0), 0)), sub: 'across all runs' },
        { label: 'Entities Enabled', value: `${[syncInvoices, syncBills, syncCustomers, syncVendors].filter(Boolean).length}/${SYNC_ENTITIES.length}`, sub: 'invoices to vendors' },
      ]} />

      {/* Connection Status */}
      <SectionCard flat accent={connected ? GREEN : GOLD} style={{ marginBottom: 24 }}>
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
              <div style={{ fontSize: 15.5, fontWeight: 800, color: TEXT }}>QuickBooks Online</div>
              <div style={{ fontSize: 13, color: DIM, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: connected ? GREEN : RED, display: 'inline-block',
                }} />
                {connected ? 'Connected' : 'Not Connected'}
                {integration?.last_sync_at && (
                  <span> &middot; Last sync: {timeAgo(integration.last_sync_at)}</span>
                )}
              </div>
            </div>
          </div>

          <span style={{
            padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            background: connected ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${connected ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
            color: connected ? GREEN : RED,
          }}>
            {connected ? 'Active' : 'Inactive'}
          </span>
        </div>

        {/* Sync indicator — honest indeterminate state. A single sync request
            gives no real per-record progress, so we never fabricate a %. */}
        {syncing && (
          <div style={{ marginTop: 16 }}>
            <style>{`@keyframes qbSyncBar{0%{left:-40%}100%{left:100%}}`}</style>
            <div style={{ fontSize: 12, color: DIM, marginBottom: 6 }}>Contacting QuickBooks&hellip;</div>
            <div style={{ position: 'relative', height: 6, background: DARK, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', top: 0, height: '100%', width: '40%', borderRadius: 3,
                background: `linear-gradient(90deg, ${GOLD}, ${GREEN})`,
                animation: 'qbSyncBar 1.1s linear infinite',
              }} />
            </div>
          </div>
        )}
      </SectionCard>

      {/* Only show settings if connected */}
      {connected && (
        <>
          {/* Sync Settings */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 24 }}>
            {/* Entities to Sync */}
            <SectionCard title="Sync Entities" icon={<ListChecks size={17} weight="duotone" color={GOLD} />}>
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
                      background: checked ? 'rgba(245, 158, 11,0.06)' : 'transparent',
                      border: `1px solid ${checked ? 'rgba(245, 158, 11,0.2)' : 'transparent'}`,
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
            </SectionCard>

            {/* Direction & Frequency */}
            <SectionCard title="Sync Settings" icon={<SlidersHorizontal size={17} weight="duotone" color={GOLD} />}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 8 }}>Direction</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { key: 'push', label: 'Push to QB', icon: '→' },
                    { key: 'pull', label: 'Pull from QB', icon: '←' },
                    { key: 'bidirectional', label: 'Bi-directional', icon: '⇄' },
                  ].map((d) => (
                    <button
                      key={d.key}
                      onClick={() => setSyncDirection(d.key)}
                      style={{
                        flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        border: syncDirection === d.key ? `1px solid ${GOLD}` : `1px solid ${BORDER}`,
                        background: syncDirection === d.key ? 'rgba(245, 158, 11,0.1)' : 'transparent',
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
                        background: syncFrequency === f ? 'rgba(245, 158, 11,0.1)' : 'transparent',
                        color: syncFrequency === f ? GOLD : DIM,
                        textTransform: 'capitalize',
                      }}
                    >
                      {f === 'realtime' ? 'Real-time' : f}
                    </button>
                  ))}
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Sync History */}
          <SectionCard title="Sync History" icon={<ClockCounterClockwise size={17} weight="duotone" color={GOLD} />} style={{ marginBottom: 24 }}>
            {syncHistory.length === 0 ? (
              <PremiumEmpty
                icon={<ClockCounterClockwise size={30} weight="duotone" color={GOLD} />}
                title="No sync history yet"
                description="Run your first sync above to see results here."
                compact
              />
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
                        <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                          <td style={{ padding: '10px 12px', color: TEXT }}>{formatDate(entry.timestamp)}</td>
                          <td style={{ padding: '10px 12px', color: DIM }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                              background: entry.direction === 'push' ? 'rgba(245, 158, 11,0.12)' : 'rgba(245,158,11,0.12)',
                              color: entry.direction === 'push' ? GOLD : '#F59E0B',
                            }}>
                              {entry.direction === 'push' ? '→ Push' : '← Pull'}
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
          </SectionCard>

          {/* Field Mapping */}
          <SectionCard
            title="Field Mapping"
            subtitle="How Saguaro fields map to QuickBooks fields"
            icon={<ArrowsLeftRight size={17} weight="duotone" color={GOLD} />}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: DIM, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Entity</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: DIM, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Saguaro Control Systems</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', color: DIM, fontWeight: 600 }}>{'⇄'}</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: DIM, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>QuickBooks Field</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELD_MAPPINGS.map((m, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                          background: 'rgba(245, 158, 11,0.1)', color: GOLD,
                        }}>
                          {m.entity}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: TEXT, fontFamily: 'monospace', fontSize: 12 }}>{m.saguaro}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: DIM }}>{'→'}</td>
                      <td style={{ padding: '10px 12px', color: QB_GREEN, fontFamily: 'monospace', fontSize: 12 }}>{m.quickbooks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}

      {/* Not connected state */}
      {!connected && (
        <SectionCard>
          <PremiumEmpty
            icon={<Plugs size={34} weight="duotone" color={GOLD} />}
            title="Connect QuickBooks Online"
            description="Sync invoices, bills, customers, and vendors between Saguaro and QuickBooks. Set up bi-directional sync to keep your accounting data in perfect harmony."
            action={
              <button onClick={handleConnectQB} className="pmBtn" style={goldButtonStyle}>
                <Plugs size={16} weight="fill" /> Connect to QuickBooks
              </button>
            }
          />
        </SectionCard>
      )}
    </PremiumSurface>
  );
}
