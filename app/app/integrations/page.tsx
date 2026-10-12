'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { humanError } from '@/lib/errors';
import Link from 'next/link';
import { IntegrationStrip } from '@/components/Integrations';
import { PremiumSurface, ModuleHero, SectionCard, StatStrip, PremiumEmpty, InsightRow, goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle, secondaryButtonStyle } from '@/components/ui/premium';
import { Plugs, MagnifyingGlass } from '@phosphor-icons/react';

const GOLD = 'var(--brand-primary)', DARK = 'var(--bg-surface-2)', CARD = 'var(--bg-surface)', BORDER = 'rgba(255,255,255,0.12)';
const DIM = 'var(--text-secondary)', TEXT = 'var(--text-primary)', GREEN = 'var(--success)', RED = 'var(--danger)';

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
  docusign: 'DS',
  microsoft365: 'MS',
  google_workspace: 'GW',
  dropbox: 'DB',
  box: 'BX',
  zapier: 'ZP',
  custom_api: 'API',
};

const CATEGORY_COLORS: Record<string, string> = {
  accounting: 'var(--success)',
  project_management: 'var(--warning)',
  communication: 'var(--brand-primary)',
  documents: 'var(--brand-primary)',
  storage: 'var(--warning)',
  custom: 'var(--warning)',
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
      // Only what can really be connected: a catalog entry that isn't built yet
      // is not a card with a dead "Coming Soon" button.
      setIntegrations(((data.integrations || []) as Integration[]).filter((i) => i.available || i.connected));
    } catch (e: any) {
      console.error(e); setError(humanError(e, 'Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIntegrations(); }, [fetchIntegrations]);

  // QuickBooks Connect leaves this page for Intuit; Back restores it from the
  // back-forward cache still showing "Connecting…". Reset it.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) setConnectingKey(null); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  // Check for URL params (after OAuth callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success')) {
      setNotification({ type: 'success', msg: 'Integration connected successfully.' });
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
      // OAuth starts on the server (it holds the Intuit keys and sets the CSRF
      // state cookie) and runs in THIS window — the iPhone app is a webview
      // where window.open popups never appear. Intuit returns to the
      // QuickBooks page, which says how it went.
      setConnectingKey(intg.key);
      window.location.href = '/api/integrations/quickbooks?action=connect';
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
        setNotification({ type: 'error', msg: 'Failed to initiate Xero connection.' });
      }
      setConnectingKey(null);
      return;
    }

    if (intg.key === 'sage300') {
      setShowSetup('sage300');
      setSetupForm({});
      return;
    }

    // Zapier runs on Saguaro's signed webhooks (a Zapier "Catch Hook" URL is
    // added as a webhook); the Custom API runs on keys minted in the same hub.
    if (intg.key === 'zapier' || intg.key === 'custom_api') {
      window.location.href = intg.key === 'zapier'
        ? '/app/settings/integrations-hub#webhooks'
        : '/app/settings/integrations-hub#api-keys';
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
      setNotification({ type: 'success', msg: `${intg.name} connection initiated.` });
      fetchIntegrations();
    } catch {
      setNotification({ type: 'error', msg: `Failed to connect ${intg.name}.` });
    }
    setConnectingKey(null);
  }

  async function handleDisconnect(intg: Integration) {
    if (!(await confirmDialog({ title: 'Please confirm', message: `Disconnect ${intg.name}? This will stop all syncing.`, danger: true }))) return;
    try {
      // QuickBooks disconnects through its own route, which revokes the token at Intuit.
      const endpoint = intg.key === 'sage300' ? '/api/integrations/sage300'
        : intg.key === 'xero' ? '/api/integrations/xero'
        : intg.key === 'quickbooks' ? '/api/integrations/quickbooks'
        : '/api/integrations/marketplace';
      const body = intg.key === 'sage300' || intg.key === 'xero' || intg.key === 'quickbooks'
        ? { action: 'disconnect' }
        : { provider: intg.key, settings: { status: 'disconnected' } };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Disconnect failed');
      setNotification({ type: data.warning ? 'error' : 'success', msg: data.message || `${intg.name} disconnected.` });
      fetchIntegrations();
    } catch {
      setNotification({ type: 'error', msg: `Failed to disconnect ${intg.name}.` });
    }
  }

  async function handleSyncNow(intg: Integration) {
    if (intg.key !== 'quickbooks') return;
    setSyncing(intg.key);
    try {
      const res = await fetch('/api/integrations/quickbooks/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Push only: customers (job owners), vendors (subs), invoices (pay apps).
        body: JSON.stringify({ entities: ['customers', 'vendors', 'invoices'] }),
      });
      const data = await res.json().catch(() => ({}));

      // Surface the server's honest state (e.g. "not configured" / "not
      // connected" / "reconnect") instead of a generic message.
      if (!res.ok) {
        setNotification({ type: 'error', msg: data.error || 'Sync failed. Check your QuickBooks connection.' });
        setSyncing(null);
        fetchIntegrations();
        return;
      }

      const c = (data.counts || { created: 0, linked: 0, skipped: 0, failed: 0 }) as { created: number; linked: number; skipped: number; failed: number };
      const firstFailure = ((data.results || []) as { outcome: string; label: string; message?: string }[]).find((r) => r.outcome === 'failed');
      setNotification({
        type: c.failed ? 'error' : 'success',
        msg: c.failed
          ? `Sent ${c.created + c.linked}; ${c.failed} failed${firstFailure ? ` (${firstFailure.label}: ${firstFailure.message})` : ''}. Details on the QuickBooks page.`
          : `Sent ${c.created + c.linked} record${c.created + c.linked === 1 ? '' : 's'} to QuickBooks.`,
      });
      fetchIntegrations();
    } catch {
      setNotification({ type: 'error', msg: 'Sync failed.' });
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
        setNotification({ type: 'success', msg: 'Sage 300 connected successfully.' });
      } else {
        setNotification({ type: 'error', msg: `Connection test failed: ${data.connection_test?.message}` });
      }
      setShowSetup(null);
      fetchIntegrations();
    } catch {
      setNotification({ type: 'error', msg: 'Failed to connect Sage 300.' });
    }
    setConnectingKey(null);
  }

  const filtered = integrations.filter((i) => {
    const matchCat = category === 'all' || i.category === category;
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const connectedCount = integrations.filter((i) => i.connected).length;
  const availableCount = integrations.filter((i) => i.available && !i.connected).length;
  const categoryCount = new Set(integrations.map((i) => i.category)).size;
  const lastSynced = integrations
    .filter((i) => i.connected && i.last_sync_at)
    .sort((a, b) => new Date(b.last_sync_at as string).getTime() - new Date(a.last_sync_at as string).getTime())[0] || null;

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Notification Banner */}
      {notification && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 1000, padding: '14px 24px',
          background: notification.type === 'success' ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
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

      {/* Header \u2014 the imported ModuleHero, finally rendered */}
      <ModuleHero
        eyebrow="Integrations"
        eyebrowIcon={<Plugs size={13} weight="fill" color="var(--text-secondary)" />}
        title="Connect Your"
        accent="Stack"
        subtitle={loading ? 'Loading…' : `${connectedCount} connected \u00B7 ${integrations.length} available across ${categoryCount} categor${categoryCount === 1 ? 'y' : 'ies'}.`}
        actions={<>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search integrations…"
            style={{
              padding: '9px 14px', background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', width: 240,
            }}
          />
          <Link
            href="/app/integrations/api-docs"
            className="k-btn k-btn-secondary"
            style={{ padding: '9px 22px', fontSize: 13, textDecoration: 'none' }}
          >
            API Docs
          </Link>
        </>}
      />

      {/* Marketplace intelligence \u2014 the imported StatStrip, live figures only */}
      {!loading && integrations.length > 0 && (
        <StatStrip items={[
          {href: '/app/integrations',  label: 'Connected', value: String(connectedCount), accent: connectedCount > 0 ? GREEN : undefined, sub: connectedCount > 0 ? 'Live and syncing' : 'None connected yet' },
          {href: '/app/integrations',  label: 'Available Now', value: String(availableCount), sub: 'Ready to connect' },
          {href: '/app/integrations',  label: 'Categories', value: String(categoryCount), sub: 'Accounting to storage' },
          {href: '/app/integrations',  label: 'Last Sync', value: lastSynced ? timeAgo(lastSynced.last_sync_at) : 'Never', sub: lastSynced ? lastSynced.name : 'No syncs recorded' },
        ]} />
      )}

      {/* Supported Integrations Strip */}
      <IntegrationStrip />

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: category === cat.key ? `1px solid ${GOLD}` : `1px solid ${BORDER}`,
              background: category === cat.key ? 'var(--brand-primary-12)' : 'transparent',
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
        <div style={{ padding: 16, background: 'rgba(248,113,113,0.1)', border: `1px solid ${RED}`, borderRadius: 10, color: RED, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
          <div style={{ fontSize: 14 }}>Loading integrations…</div>
        </div>
      )}

      {/* Grid — re-housed into a SectionCard per category */}
      {!loading && filtered.length > 0 && (() => {
        const cats = CATEGORIES.filter((c) => c.key !== 'all');
        const groups = cats
          .map((c) => ({ key: c.key, label: c.label, items: filtered.filter((i) => i.category === c.key) }))
          .filter((g) => g.items.length > 0);
        const knownKeys = new Set(cats.map((c) => c.key));
        const other = filtered.filter((i) => !knownKeys.has(i.category));
        if (other.length > 0) groups.push({ key: 'other', label: 'Other', items: other });
        return groups.map((g) => (
          <SectionCard
            key={g.key}
            title={g.label}
            subtitle={`${g.items.length} integration${g.items.length === 1 ? '' : 's'} · ${g.items.filter((i) => i.connected).length} connected`}
            icon={<Plugs size={17} weight="duotone" color={CATEGORY_COLORS[g.key] || GOLD} />}
            accent={CATEGORY_COLORS[g.key] || GOLD}
            style={{ marginBottom: 18 }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 18 }}>
              {g.items.map((intg) => (
            <div
              key={intg.key}
              style={{
                background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))',
                border: `1px solid ${intg.connected ? 'rgba(74,222,128,0.35)' : intg.available ? 'color-mix(in srgb, var(--brand-primary) 22%, transparent)' : BORDER}`,
                borderRadius: 16,
                padding: 22,
                position: 'relative',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                transition: 'all 0.25s',
              }}
              className="lift"
            >
              {/* Header Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                {/* Icon */}
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: `linear-gradient(135deg, color-mix(in srgb, ${intg.icon_color} 13%, transparent), color-mix(in srgb, ${intg.icon_color} 27%, transparent))`,
                  border: `1px solid color-mix(in srgb, ${intg.icon_color} 33%, transparent)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 900, color: intg.icon_color, flexShrink: 0,
                }}>
                  {ICONS[intg.key] || intg.name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{intg.name}</span>
                    {intg.connected ? (
                      <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>
                        Connected
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)', padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>
                        Available
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 600, color: CATEGORY_COLORS[intg.category] || DIM,
                    background: `color-mix(in srgb, ${CATEGORY_COLORS[intg.category] || DIM} 9%, transparent)`,
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
                <div style={{ marginBottom: 14, padding: '6px 12px', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.18)', borderRadius: 10 }}>
                  <InsightRow label="Last Sync" value={timeAgo(intg.last_sync_at)} />
                  <InsightRow label="Status" value="Active" accent={GREEN} />
                  <InsightRow label="Auth" value={String(intg.auth_type || 'credentials').replace(/_/g, ' ')} />
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
                            flex: 1, padding: '8px 0', textAlign: 'center', borderRadius: 8, minHeight: 44,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: `var(--brand-primary)`, color: 'var(--on-brand)',
                            fontSize: 12, fontWeight: 700, textDecoration: 'none',
                          }}
                        >
                          Settings
                        </Link>
                        <button
                          onClick={() => handleSyncNow(intg)}
                          disabled={syncing === intg.key}
                          style={{
                            flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer', minHeight: 44,
                            background: 'rgba(74,222,128,0.12)', border: `1px solid rgba(74,222,128,0.3)`,
                            color: GREEN, fontSize: 12, fontWeight: 700,
                            opacity: syncing === intg.key ? 0.6 : 1,
                          }}
                        >
                          {syncing === intg.key ? 'Syncing…' : 'Sync Now'}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDisconnect(intg)}
                      style={{
                        padding: '8px 14px', borderRadius: 8, cursor: 'pointer', minHeight: 44,
                        background: 'rgba(248,113,113,0.1)', border: `1px solid rgba(248,113,113,0.3)`,
                        color: RED, fontSize: 12, fontWeight: 600,
                      }}
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleConnect(intg)}
                    disabled={connectingKey === intg.key}
                    className="k-btn k-btn-secondary"
                    style={{
                      flex: 1, justifyContent: 'center', padding: '9px 0', fontSize: 13, minHeight: 44,
                      opacity: connectingKey === intg.key ? 0.6 : 1,
                    }}
                  >
                    {connectingKey === intg.key ? 'Connecting…' : intg.status === 'needs_reconnect' ? 'Reconnect' : 'Connect'}
                  </button>
                )}
              </div>
            </div>
              ))}
            </div>
          </SectionCard>
        ));
      })()}

      {!loading && filtered.length === 0 && (
        <SectionCard flush>
          <PremiumEmpty
            icon={<MagnifyingGlass size={30} weight="duotone" color="var(--text-secondary)" />}
            title={search ? `No integrations match "${search}"` : 'No integrations in this category yet'}
            description="Every connector Saguaro supports lives in this marketplace — accounting (QuickBooks, Sage 300, Xero), documents, storage, plus a full REST API and outbound webhooks for anything custom."
            action={
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button onClick={() => { setSearch(''); setCategory('all'); }} style={ghostButtonStyle} className="pmBtn">Clear Filters</button>
                <Link href="/app/integrations/api-docs" className="pmBtn" style={{ ...secondaryButtonStyle, textDecoration: 'none' }}>Browse the API Docs</Link>
              </div>
            }
          />
        </SectionCard>
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
            <p style={{ margin: '0 0 24px', fontSize: 13, color: DIM }}>Enter your Sage 300 API endpoint and credentials.</p>

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
                  background: `var(--brand-primary)`, border: 'none',
                  color: 'var(--on-brand)', fontSize: 13, fontWeight: 700,
                  opacity: !setupForm.api_url || connectingKey === 'sage300' ? 0.5 : 1,
                }}
              >
                {connectingKey === 'sage300' ? 'Testing…' : 'Test & Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PremiumSurface>
  );
}
