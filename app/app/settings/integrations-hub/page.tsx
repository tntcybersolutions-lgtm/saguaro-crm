'use client';
/**
 * Settings → Integration Hub. A marketplace of first-class integrations plus
 * self-serve developer tooling: personal API keys (one-time secret reveal) and
 * outbound webhooks (signed delivery, per-event subscriptions, live test).
 * All secrets live only in the DB — the API key's full value is shown exactly
 * once at creation and never returned again.
 *
 * Command-center anatomy: ModuleHero, live StatStrip (keys/webhooks from the
 * API), SectionCards, skeletons, honest empty states. Every marketplace card
 * goes somewhere real — QuickBooks and Cloud Storage connect in-product,
 * Zapier runs on the signed webhooks below. Nothing dead ships here.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { humanError } from '@/lib/errors';
import Link from 'next/link';
import {
  PremiumSurface, ModuleHero, SectionCard, StatStrip, IconChip, Pill,
  goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle,
} from '@/components/ui/premium';
import {
  Plugs, Key, Plus, Copy, Check, Trash, Broadcast, ArrowSquareOut,
  Warning, LinkSimple, X, BookOpen,
} from '@phosphor-icons/react';
import { WEBHOOK_EVENT_NAMES } from '@/lib/webhook-events';

/* eslint-disable @typescript-eslint/no-explicit-any */

const GOLD = 'var(--brand-primary)';
const GOLD_HI = 'var(--brand-primary-strong)';
const WHITE = 'var(--text-primary)';
const MUTED = 'rgba(255,255,255,0.62)';
const FAINT = 'var(--text-secondary)';
const BORDER = 'rgba(255,255,255,0.08)';
const GREEN = 'var(--success)';
const RED = 'var(--danger)';

type MarketState = 'connect' | 'request';
type Market = { key: string; name: string; desc: string; state: MarketState; href: string };

// Every entry here is LIVE: 'connect' links to a working in-product flow,
// 'request' opens a real support line. Integrations without a backend
// (Slack, Teams, Autodesk) are intentionally absent — no dead cards.
const MARKETPLACE: Market[] = [
  { key: 'quickbooks', name: 'QuickBooks Online', desc: 'Send approved pay apps to QuickBooks as invoices, and your subs as vendors.', state: 'connect', href: '/app/integrations/quickbooks' },
  { key: 'storage', name: 'Cloud Storage', desc: 'Connect S3, OneDrive, SharePoint, Egnyte, Dropbox, Google Drive, or Box.', state: 'connect', href: '/app/settings/storage' },
  { key: 'zapier', name: 'Zapier', desc: 'Paste a Zapier "Catch Hook" URL as a webhook below and Saguaro events start your Zaps.', state: 'connect', href: '#webhooks' },
];

// Subscribe only to events Saguaro actually emits (single source of truth:
// lib/webhook-events.ts) so registered webhooks fire instead of showing "Never fired".
const WEBHOOK_EVENTS = WEBHOOK_EVENT_NAMES;

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 10,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
  border: `1px solid ${BORDER}`,
  color: WHITE,
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10.5, fontWeight: 800,
  color: MUTED, marginBottom: 6,
};

/** Pulsing skeleton row (pmSkeleton keyframes ship with PremiumSurface). */
function SkeletonRow({ h = 52 }: { h?: number }) {
  return <div className="pmSkeleton" style={{ height: h, borderRadius: 10, background: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))' }} />;
}

export default function IntegrationsHubPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [hooks, setHooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // QuickBooks is listed only when this server can actually connect it (the
  // Intuit keys are set) or the company is already connected — the same rule
  // as /app/integrations. Hidden until the marketplace says so.
  const [qbListed, setQbListed] = useState(false);

  // API key create
  const [keyName, setKeyName] = useState('');
  const [keyScopes, setKeyScopes] = useState<string[]>(['read']);
  const [creatingKey, setCreatingKey] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Webhook create
  const [showHookForm, setShowHookForm] = useState(false);
  const [hookName, setHookName] = useState('');
  const [hookUrl, setHookUrl] = useState('');
  const [hookEvents, setHookEvents] = useState<string[]>([]);
  const [savingHook, setSavingHook] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const [toast, setToast] = useState<{ m: string; ok: boolean } | null>(null);
  const flash = (m: string, ok = true) => { setToast({ m, ok }); setTimeout(() => setToast(null), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [k, w] = await Promise.all([
        fetch('/api/integrations/api-keys').then((r) => r.json()),
        fetch('/api/integrations/webhooks').then((r) => r.json()),
      ]);
      setKeys(k.keys ?? []);
      setHooks(w.webhooks ?? []);
    } catch {
      flash('Couldn’t load integrations.', false);
    }
    try {
      const res = await fetch('/api/integrations/marketplace');
      const m = await res.json();
      if (!res.ok) throw new Error(m.error || 'marketplace failed');
      const qb = (m.integrations ?? []).find((i: any) => i.key === 'quickbooks');
      setQbListed(!!qb && (qb.available || qb.connected));
    } catch (e) {
      console.error('[integrations-hub] marketplace', e);
      setQbListed(false);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggleScope = (s: string) =>
    setKeyScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const toggleEvent = (e: string) =>
    setHookEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));

  const createKey = async () => {
    if (!keyName.trim()) { flash('Name the key first.', false); return; }
    setCreatingKey(true);
    try {
      const res = await fetch('/api/integrations/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: keyName.trim(), scopes: keyScopes.length ? keyScopes : ['read'] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      setRevealed(data.secret);
      setCopied(false);
      setKeyName('');
      setKeyScopes(['read']);
      await load();
    } catch (e: any) {
      console.error(e); flash(humanError(e, 'Create failed. Please try again.'), false);
    }
    setCreatingKey(false);
  };

  const revokeKey = async (id: string) => {
    try {
      const res = await fetch(`/api/integrations/api-keys/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      flash('Key revoked.');
      await load();
    } catch { flash('Revoke failed.', false); }
  };

  const createHook = async () => {
    if (!hookName.trim()) { flash('Name the webhook.', false); return; }
    if (!hookUrl.trim()) { flash('Endpoint URL is required.', false); return; }
    if (hookEvents.length === 0) { flash('Pick at least one event.', false); return; }
    setSavingHook(true);
    try {
      const res = await fetch('/api/integrations/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: hookName.trim(), url: hookUrl.trim(), events: hookEvents }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      flash('Webhook added.');
      setShowHookForm(false);
      setHookName(''); setHookUrl(''); setHookEvents([]);
      await load();
    } catch (e: any) {
      console.error(e); flash(humanError(e, 'Create failed. Please try again.'), false);
    }
    setSavingHook(false);
  };

  const toggleHookActive = async (h: any) => {
    try {
      const res = await fetch(`/api/integrations/webhooks/${h.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !h.active }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch { flash('Update failed.', false); }
  };

  const deleteHook = async (id: string) => {
    try {
      const res = await fetch(`/api/integrations/webhooks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      flash('Webhook deleted.');
      await load();
    } catch { flash('Delete failed.', false); }
  };

  const testHook = async (id: string) => {
    setTesting(id);
    try {
      const res = await fetch(`/api/integrations/webhooks/${id}/test`, { method: 'POST' });
      const data = await res.json();
      flash(data.success ? `Test delivered (HTTP ${data.status})` : `Test failed (${data.status || 'no response'})`, !!data.success);
      await load();
    } catch { flash('Test failed.', false); }
    setTesting(null);
  };

  const copyKey = () => {
    if (!revealed) return;
    navigator.clipboard?.writeText(revealed);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusTone = (s: number | null): 'green' | 'red' | 'neutral' => {
    if (s == null) return 'neutral';
    if (s >= 200 && s < 300) return 'green';
    return 'red';
  };

  const market = MARKETPLACE.filter((m) => m.key !== 'quickbooks' || qbListed);
  const liveKeys = keys.filter((k) => !k.revoked_at);
  const activeHooks = hooks.filter((h) => h.active);

  const compactGhost: React.CSSProperties = { ...ghostButtonStyle, padding: '7px 12px', fontSize: 12 };
  const compactDanger: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '7px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700,
    background: 'rgba(248,113,113,0.12)', color: RED, border: '1px solid rgba(248,113,113,0.35)',
  };

  return (
    <PremiumSurface maxWidth={2200}>
      <ModuleHero
        eyebrow="Workspace"
        eyebrowIcon={<Plugs size={13} weight="fill" color={GOLD} />}
        title="Integration"
        accent="Hub"
        subtitle="Connect your tools, or build with API keys and webhooks."
        actions={
          <Link href="/app/integrations/api-docs" style={goldOutlineButtonStyle} className="pmBtn">
            <BookOpen size={15} weight="bold" /> API Docs
          </Link>
        }
      />

      {/* Live figures — keys and webhooks come straight from the API. */}
      {!loading && (
        <StatStrip items={[
          {href: '/app/settings/integrations-hub', label: 'Marketplace', value: String(market.length), sub: 'Live integrations' },
          {href: '/app/settings/integrations-hub', label: 'Active API Keys', value: String(liveKeys.length), sub: keys.length > liveKeys.length ? `${keys.length - liveKeys.length} revoked` : 'None revoked' },
          {href: '/app/settings/integrations-hub', label: 'Webhooks', value: String(hooks.length), sub: hooks.length ? `${activeHooks.length} active` : 'None configured' },
          {href: '/app/settings/integrations-hub', label: 'Events Emitted', value: String(WEBHOOK_EVENTS.length), sub: 'Subscribable event types' },
        ]} />
      )}

      {/* Marketplace */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
          marginBottom: 28,
        }}
      >
        {market.map((m) => (
          <SectionCard key={m.key} bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <IconChip size={40}><Plugs size={20} color={GOLD} weight="duotone" /></IconChip>
              <div style={{ fontSize: 15, fontWeight: 700, color: WHITE }}>{m.name}</div>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.5, flex: 1 }}>{m.desc}</p>
            <div style={{ marginTop: 6 }}>
              {m.state === 'connect' ? (
                <Link href={m.href} style={{ ...goldButtonStyle, width: '100%', padding: '9px 16px', fontSize: 12.5, boxSizing: 'border-box' }} className="pmBtn">
                  <LinkSimple size={14} weight="bold" /> Connect
                </Link>
              ) : (
                <a href={m.href} style={{ ...ghostButtonStyle, width: '100%', padding: '9px 16px', fontSize: 12.5, boxSizing: 'border-box' }} className="pmBtn">
                  <ArrowSquareOut size={14} weight="bold" /> Request Access
                </a>
              )}
            </div>
          </SectionCard>
        ))}
      </div>

      {/* API Keys */}
      <div id="api-keys" style={{ scrollMarginTop: 72 }} />
      <SectionCard
        title="API Keys"
        subtitle="REST API keys. The full key is shown once and never again."
        icon={<Key size={17} color={GOLD} weight="duotone" />}
        style={{ marginBottom: 24 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* One-time reveal */}
          {revealed && (
            <div style={{ border: '1px solid var(--brand-primary-35)', background: 'var(--brand-primary-12)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Warning size={16} color={GOLD} weight="fill" />
                <span style={{ fontSize: 13, fontWeight: 700, color: GOLD_HI }}>Copy this key now — you won&apos;t see it again</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={{ flex: 1, minWidth: 200, fontFamily: 'monospace', fontSize: 13, color: WHITE, background: 'rgba(255,255,255,0.05)', padding: '10px 12px', borderRadius: 8, wordBreak: 'break-all' }}>
                  {revealed}
                </code>
                <button onClick={copyKey} style={compactGhost} className="pmBtn">
                  {copied ? <><Check size={14} weight="bold" /> Copied</> : <><Copy size={14} weight="bold" /> Copy</>}
                </button>
                <button onClick={() => setRevealed(null)} style={compactGhost} className="pmBtn"><X size={14} weight="bold" /></button>
              </div>
            </div>
          )}

          {/* Create form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))', borderRadius: 12, border: `1px solid ${BORDER}` }}>
            <div>
              <label style={labelStyle}>Key Name</label>
              <input style={inputStyle} placeholder="e.g. Reporting pipeline" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Scopes</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['read', 'write', 'admin'].map((s) => {
                  const on = keyScopes.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleScope(s)}
                      className="pmTile"
                      style={{
                        padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        border: `1px solid ${on ? 'var(--brand-primary-35)' : BORDER}`,
                        background: on ? 'var(--brand-primary-12)' : 'rgba(255,255,255,0.04)',
                        color: on ? GOLD_HI : MUTED,
                      }}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <button onClick={createKey} disabled={creatingKey} className="pmBtn" style={{ ...goldButtonStyle, padding: '9px 16px', fontSize: 12.5, cursor: creatingKey ? 'not-allowed' : 'pointer', opacity: creatingKey ? 0.6 : 1 }}>
                <Plus size={14} weight="bold" /> {creatingKey ? 'Creating…' : 'Create API Key'}
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loading && <><SkeletonRow /><SkeletonRow /></>}
            {!loading && keys.length === 0 && (
              <div style={{ fontSize: 13, color: FAINT, lineHeight: 1.5 }}>
                No API keys yet. Create one above to call the Saguaro REST API — see the API Docs for endpoints and auth.
              </div>
            )}
            {!loading && keys.map((k) => (
              <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))', borderRadius: 10, border: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: WHITE }}>{k.name}</div>
                  <div style={{ fontSize: 12, color: FAINT, fontFamily: 'monospace', marginTop: 2 }}>{k.key_prefix}••••••••</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(k.scopes ?? []).map((s: string) => <Pill key={s} tone="neutral">{s.charAt(0).toUpperCase() + s.slice(1)}</Pill>)}
                </div>
                {k.revoked_at
                  ? <Pill tone="red">Revoked</Pill>
                  : <button onClick={() => revokeKey(k.id)} style={compactDanger} className="pmBtn"><Trash size={14} weight="bold" /> Revoke</button>}
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Outbound Webhooks */}
      <div id="webhooks" style={{ scrollMarginTop: 72 }} />
      <SectionCard
        title="Outbound Webhooks"
        subtitle={<>Saguaro POSTs a JSON event to your URL with an <code style={{ fontFamily: 'monospace', color: WHITE }}>X-Saguaro-Signature</code> HMAC-SHA256 header you can verify with the endpoint&apos;s secret.</>}
        icon={<Broadcast size={17} color={GOLD} weight="duotone" />}
        action={
          <button onClick={() => setShowHookForm((v) => !v)} style={compactGhost} className="pmBtn">
            <Plus size={14} weight="bold" /> Add endpoint
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {showHookForm && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))', borderRadius: 12, border: `1px solid ${BORDER}` }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input style={inputStyle} placeholder="e.g. Ops notifier" value={hookName} onChange={(e) => setHookName(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Endpoint URL</label>
                <input style={inputStyle} placeholder="https://example.com/webhooks/saguaro" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Events</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {WEBHOOK_EVENTS.map((e) => {
                    const on = hookEvents.includes(e);
                    return (
                      <button
                        key={e}
                        onClick={() => toggleEvent(e)}
                        className="pmTile"
                        style={{
                          padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          border: `1px solid ${on ? 'var(--brand-primary-35)' : BORDER}`,
                          background: on ? 'var(--brand-primary-12)' : 'rgba(255,255,255,0.04)',
                          color: on ? GOLD_HI : MUTED, fontFamily: 'monospace',
                        }}
                      >
                        {e}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={createHook} disabled={savingHook} className="pmBtn" style={{ ...goldButtonStyle, padding: '9px 16px', fontSize: 12.5, cursor: savingHook ? 'not-allowed' : 'pointer', opacity: savingHook ? 0.6 : 1 }}>
                  {savingHook ? 'Saving…' : 'Add Webhook'}
                </button>
                <button onClick={() => setShowHookForm(false)} style={compactGhost} className="pmBtn">Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loading && <><SkeletonRow h={84} /><SkeletonRow h={84} /></>}
            {!loading && hooks.length === 0 && (
              <div style={{ fontSize: 13, color: FAINT, lineHeight: 1.5 }}>
                No webhooks configured. Add an endpoint above and Saguaro will start delivering signed events the moment they happen.
              </div>
            )}
            {!loading && hooks.map((h) => (
              <div key={h.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))', borderRadius: 10, border: `1px solid ${BORDER}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: WHITE }}>{h.name}</div>
                    <div style={{ fontSize: 12, color: FAINT, wordBreak: 'break-all', marginTop: 2 }}>{h.url}</div>
                  </div>
                  <Pill tone={h.active ? 'green' : 'neutral'}>{h.active ? 'Active' : 'Paused'}</Pill>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(h.events ?? []).map((e: string) => (
                    <span key={e} style={{ fontSize: 11, fontFamily: 'monospace', color: MUTED, background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 6, border: `1px solid ${BORDER}` }}>{e}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {h.last_status != null
                    ? <Pill tone={statusTone(h.last_status)}>Last: HTTP {h.last_status}</Pill>
                    : <span style={{ fontSize: 12, color: FAINT }}>Never Fired</span>}
                  {h.last_fired_at && <span style={{ fontSize: 12, color: FAINT }}>{new Date(h.last_fired_at).toLocaleString()}</span>}
                  <div style={{ flex: 1 }} />
                  <button onClick={() => testHook(h.id)} disabled={testing === h.id} style={{ ...compactGhost, opacity: testing === h.id ? 0.6 : 1 }} className="pmBtn">
                    {testing === h.id ? 'Testing…' : 'Test'}
                  </button>
                  <button onClick={() => toggleHookActive(h)} style={compactGhost} className="pmBtn">
                    {h.active ? 'Pause' : 'Activate'}
                  </button>
                  <button onClick={() => deleteHook(h.id)} style={compactDanger} className="pmBtn"><Trash size={14} weight="bold" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.ok ? GREEN : RED, color: '#0B0B0C', padding: '12px 20px',
          borderRadius: 10, fontSize: 14, fontWeight: 700, zIndex: 1000,
          border: '1px solid rgba(255,255,255,0.25)',
        }}>
          {toast.m}
        </div>
      )}
    </PremiumSurface>
  );
}
