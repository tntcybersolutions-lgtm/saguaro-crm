'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const GOLD = '#D4A017', DARK = '#0F1419', CARD = '#1A1F2E', BORDER = '#263347';
const DIM = '#8fa3c0', TEXT = '#e8edf8', GREEN = '#22C55E', RED = '#EF4444';

type Integration = {
  key: string;
  name: string;
  category: string;
  description: string;
  icon_color: string;
  auth_type: string;
  available: boolean;
  connected: boolean;
  status: string | null;
  last_sync_at: string | null;
  integration_id: string | null;
  settings: Record<string, any>;
};

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'accounting', label: 'Accounting' },
  { key: 'project_management', label: 'Project Management' },
  { key: 'communication', label: 'Communication' },
  { key: 'documents', label: 'Documents' },
  { key: 'storage', label: 'Storage' },
  { key: 'custom', label: 'Custom' },
];

const ICONS: Record<string, string> = {
  quickbooks: 'QB',
  sage300: 'S3',
  xero: 'XO',
  procore: 'PC',
  plangrid: 'PG',
  docusign: 'DS',
  microsoft365: 'MS',
  google_workspace: 'GW',
  dropbox: 'DB',
  box: 'BX',
  zapier: 'ZP',
  custom_api: 'API',
};

const CATEGORY_COLORS: Record<string, string> = {
  accounting: '#22C55E',
  project_management: '#F97316',
  communication: '#3B82F6',
  documents: '#EAB308',
  storage: '#6366F1',
  custom: '#8B5CF6',
};

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

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [connectingKey, setConnectingKey] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState<string | null>(null);
  const [setupForm, setSetupForm] = useState<Record<string, string>>({});
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/marketplace');
      if (!res.ok) throw new Error('Failed to load integrations');
      const data = await res.json();
      setIntegrations(data.integrations || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIntegrations(); }, [fetchIntegrations]);

  // Check for URL params (after OAuth callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success')) {
      setNotification({ type: 'success', msg: 'Integration connected successfully!' });
      window.history.replaceState({}, '', '/app/integrations');
    }
    if (params.get('error')) {
      setNotification({ type: 'error', msg: `Connection failed: ${params.get('error')}` });
      window.history.replaceState({}, '', '/app/integrations');
    }
  }, []);

  useEffect(() => {
    if (notification) {
      const t = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [notification]);

  async function handleConnect(intg: Integration) {
    if (intg.key === 'quickbooks') {
      // OAuth flow - redirect
      setConnectingKey(intg.key);
      const clientId = process.env.NEXT_PUBLIC_QUICKBOOKS_CLIENT_ID || '';
      const redirectUri = encodeURIComponent(window.location.origin + '/api/integrations/quickbooks/callback');
      const scope = encodeURIComponent('com.intuit.quickbooks.accounting');
      const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=`;
      window.open(authUrl, '_blank', 'width=600,height=700');
      setConnectingKey(null);
      return;
    }

    if (intg.key === 'xero') {
      setConnectingKey(intg.key);
      try {
        const res = await fetch('/api/integrations/xero', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'connect' }),
        });
        const data = await res.json();
        if (data.auth_url) {
          window.open(data.auth_url, '_blank', 'width=600,height=700');
        }
      } catch {
        setNotification({ type: 'error', msg: 'Failed to initiate Xero connection' });
      }
      setConnectingKey(null);
      return;
    }

    if (intg.key === 'sage300') {
      setShowSetup('sage300');
      setSetupForm({});
      return;
    }

    if (intg.key === 'zapier' || intg.key === 'custom_api') {
      window.location.href = intg.key === 'zapier'
        ? '/app/integrations/api-docs'
        : '/app/integrations/api-docs';
      return;
    }

    // Generic connect for others
    setConnectingKey(intg.key);
    try {
      const res = await fetch('/api/integrations/marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: intg.key }),
      });
      if (!res.ok) throw new Error('Connection failed');
      setNotification({ type: 'success', msg: `${intg.name} connection initiated` });
      fetchIntegrations();
    } catch {
      setNotification({ type: 'error', msg: `Failed to connect ${intg.name}` });
    }
    setConnectingKey(null);
  }

  async function handleDisconnect(intg: Integration) {
    if (!confirm(`Disconnect ${intg.name}? This will stop all syncing.`)) return;
    try {
      const endpoint = intg.key === 'sage300' ? '/api/integrations/sage300'
        : intg.key === 'xero' ? '/api/integrations/xero'
        : '/api/integrations/marketplace';
      const body = intg.key === 'sage300' || intg.key === 'xero'
        ? { action: 'disconnect' }
        : { provider: intg.key, settings: { status: 'disconnected' } };

      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setNotification({ type: 'success', msg: `${intg.name} disconnected` });
      fetchIntegrations();
    } catch {
      setNotification({ type: 'error', msg: `Failed to disconnect ${intg.name}` });
    }
  }

  async function handleSyncNow(intg: Integration) {
    if (intg.key !== 'quickbooks') return;
    setSyncing(intg.key);
    try {
      const res = await fetch('/api/integrations/quickbooks/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: intg.settings?.sync_direction === 'pull' ? 'pull' : 'push',
          entities: ['invoices', 'bills', 'customers', 'vendors'],
        }),
      });
      if (!res.ok) throw new Error('Sync failed');
      const data = await res.json();
      setNotification({ type: 'success', msg: `Sync complete: ${JSON.stringify(data.results)}` });
      fetchIntegrations();
    } catch {
      setNotification({ type: 'error', msg: 'Sync failed' });
    }
    setSyncing(null);
  }

  async function handleSageSetup() {
    setConnectingKey('sage300');
    try {
      const res = await fetch('/api/integrations/sage300', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_url: setupForm.api_url,
          username: setupForm.username,
          password: setupForm.password,
          company_id: setupForm.company_id,
        }),
      });
      const data = await res.json();
      if (data.connection_test?.success) {
        setNotification({ type: 'success', msg: 'Sage 300 connected successfully!' });
      } else {
        setNotification({ type: 'error', msg: `Connection test failed: ${data.connection_test?.message}` });
      }
      setShowSetup(null);
      fetchIntegrations();
    } catch {
      setNotification({ type: 'error', msg: 'Failed to connect Sage 300' });
    }
    setConnectingKey(null);
  }

  const filtered = integrations.filter((i) => {
    const matchCat = category === 'all' || i.category === category;
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const connectedCount = integrations.filter((i) => i.connected).length;

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Notification Banner */}
      {notification && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 1000, padding: '14px 24px',
          background: notification.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          border: `1px solid ${notification.type === 'success' ? GREEN : RED}`,
          borderRadius: 10, color: notification.type === 'success' ? GREEN : RED,
          fontSize: 13, fontWeight: 600, backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span>{notification.type === 'success' ? '\u2713' : '\u2717'}</span>
          {notification.msg}
          <button onClick={() => setNotification(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16 }}>{'\u00D7'}</button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: TEXT }}>Integrations</h1>
          <div style={{ fontSize: 13, color: DIM, marginTop: 5 }}>
            {loading ? 'Loading...' : `${connectedCount} connected \u00B7 ${integrations.length} available`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search integrations..."
            style={{
              padding: '9px 14px', background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', width: 240,
            }}
          />
          <Link
            href="/app/integrations/api-docs"
            style={{
              padding: '9px 22px', background: `linear-gradient(135deg,${GOLD},#F0C040)`,
              color: '#0d1117', borderRadius: 8, fontWeight: 800, fontSize: 13, textDecoration: 'none',
            }}
          >
            API Docs
          </Link>
        </div>
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: category === cat.key ? `1px solid ${GOLD}` : `1px solid ${BORDER}`,
              background: category === cat.key ? 'rgba(212,160,23,0.12)' : 'transparent',
              color: category === cat.key ? GOLD : DIM,
              transition: 'all 0.2s',
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', border: `1px solid ${RED}`, borderRadius: 10, color: RED, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
          <div style={{ fontSize: 14 }}>Loading integrations...</div>
        </div>
      )}

      {/* Grid */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 18 }}>
          {filtered.map((intg) => (
            <div
              key={intg.key}
              style={{
                background: CARD,
                border: `1px solid ${intg.connected ? 'rgba(34,197,94,0.3)' : BORDER}`,
                borderRadius: 14,
                padding: 22,
                position: 'relative',
                backdropFilter: 'blur(16px)',
                transition: 'all 0.25s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = intg.connected ? 'rgba(34,197,94,0.5)' : GOLD; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = intg.connected ? 'rgba(34,197,94,0.3)' : BORDER; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
            >
              {/* Header Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                {/* Icon */}
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: `linear-gradient(135deg, ${intg.icon_color}22, ${intg.icon_color}44)`,
                  border: `1px solid ${intg.icon_color}55`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 900, color: intg.icon_color, flexShrink: 0,
                }}>
                  {ICONS[intg.key] || intg.name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{intg.name}</span>
                    {intg.connected && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: 'rgba(34,197,94,0.12)', padding: '2px 8px', borderRadius: 10 }}>
                        Connected
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: CATEGORY_COLORS[intg.category] || DIM,
                    background: `${CATEGORY_COLORS[intg.category] || DIM}18`,
                    padding: '2px 8px', borderRadius: 8, display: 'inline-block', marginTop: 3,
                  }}>
                    {intg.category.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                </div>
              </div>

              {/* Description */}
              <p style={{ margin: '0 0 16px', fontSize: 13, color: DIM, lineHeight: 1.5 }}>
                {intg.description}
              </p>

              {/* Connected Details */}
              {intg.connected && (
                <div style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(34,197,94,0.06)', borderRadius: 8, fontSize: 12, color: DIM }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>Last sync</span>
                    <span style={{ color: TEXT }}>{timeAgo(intg.last_sync_at)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Status</span>
                    <span style={{ color: GREEN }}>Active</span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                {intg.connected ? (
                  <>
                    {intg.key === 'quickbooks' && (
                      <>
                        <Link
                          href="/app/integrations/quickbooks"
                          style={{
                            flex: 1, padding: '8px 0', textAlign: 'center', borderRadius: 8,
                            background: `linear-gradient(135deg,${GOLD},#F0C040)`, color: '#0d1117',
                            fontSize: 12, fontWeight: 700, textDecoration: 'none',
                          }}
                        >
                          Settings
                        </Link>
                        <button
                          onClick={() => handleSyncNow(intg)}
                          disabled={syncing === intg.key}
                          style={{
                            flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
                            background: 'rgba(34,197,94,0.12)', border: `1px solid rgba(34,197,94,0.3)`,
                            color: GREEN, fontSize: 12, fontWeight: 700,
                            opacity: syncing === intg.key ? 0.6 : 1,
                          }}
                        >
                          {syncing === intg.key ? 'Syncing...' : 'Sync Now'}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDisconnect(intg)}
                      style={{
                        padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                        background: 'rgba(239,68,68,0.1)', border: `1px solid rgba(239,68,68,0.3)`,
                        color: RED, fontSize: 12, fontWeight: 600,
                      }}
                    >
                      Disconnect
                    </button>
                  </>
                ) : intg.available ? (
                  <button
                    onClick={() => handleConnect(intg)}
                    disabled={connectingKey === intg.key}
                    style={{
                      flex: 1, padding: '9px 0', borderRadius: 8, cursor: 'pointer',
                      background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none',
                      color: '#0d1117', fontSize: 13, fontWeight: 700,
                      opacity: connectingKey === intg.key ? 0.6 : 1,
                    }}
                  >
                    {connectingKey === intg.key ? 'Connecting...' : 'Connect'}
                  </button>
                ) : (
                  <div style={{
                    flex: 1, padding: '9px 0', textAlign: 'center', borderRadius: 8,
                    background: 'rgba(143,163,192,0.08)', border: `1px solid ${BORDER}`,
                    color: DIM, fontSize: 13, fontWeight: 600,
                  }}>
                    Coming Soon
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>{'\u{1F50C}'}</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>No integrations found</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Try adjusting your search or category filter</div>
        </div>
      )}

      {/* Sage 300 Setup Modal */}
      {showSetup === 'sage300' && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowSetup(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16,
              padding: 32, width: 460, maxWidth: '90vw',
            }}
          >
            <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: TEXT }}>Connect Sage 300</h2>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: DIM }}>Enter your Sage 300 API endpoint and credentials</p>

            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: DIM, display: 'block', marginBottom: 5 }}>API Endpoint URL *</span>
              <input
                value={setupForm.api_url || ''}
                onChange={(e) => setSetupForm({ ...setupForm, api_url: e.target.value })}
                placeholder="https://your-sage300-server.com/api/v1"
                style={{
                  width: '100%', padding: '10px 14px', background: DARK, border: `1px solid ${BORDER}`,
                  borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: DIM, display: 'block', marginBottom: 5 }}>Company ID</span>
              <input
                value={setupForm.company_id || ''}
                onChange={(e) => setSetupForm({ ...setupForm, company_id: e.target.value })}
                placeholder="SAMLTD"
                style={{
                  width: '100%', padding: '10px 14px', background: DARK, border: `1px solid ${BORDER}`,
                  borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              <label>
                <span style={{ fontSize: 12, fontWeight: 600, color: DIM, display: 'block', marginBottom: 5 }}>Username</span>
                <input
                  value={setupForm.username || ''}
                  onChange={(e) => setSetupForm({ ...setupForm, username: e.target.value })}
                  placeholder="admin"
                  style={{
                    width: '100%', padding: '10px 14px', background: DARK, border: `1px solid ${BORDER}`,
                    borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </label>
              <label>
                <span style={{ fontSize: 12, fontWeight: 600, color: DIM, display: 'block', marginBottom: 5 }}>Password</span>
                <input
                  type="password"
                  value={setupForm.password || ''}
                  onChange={(e) => setSetupForm({ ...setupForm, password: e.target.value })}
                  placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                  style={{
                    width: '100%', padding: '10px 14px', background: DARK, border: `1px solid ${BORDER}`,
                    borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSetup(null)}
                style={{
                  padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
                  background: 'transparent', border: `1px solid ${BORDER}`,
                  color: DIM, fontSize: 13, fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSageSetup}
                disabled={!setupForm.api_url || connectingKey === 'sage300'}
                style={{
                  padding: '10px 24px', borderRadius: 8, cursor: 'pointer',
                  background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none',
                  color: '#0d1117', fontSize: 13, fontWeight: 700,
                  opacity: !setupForm.api_url || connectingKey === 'sage300' ? 0.5 : 1,
                }}
              >
                {connectingKey === 'sage300' ? 'Testing...' : 'Test & Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
