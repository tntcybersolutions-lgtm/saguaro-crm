'use client';
/**
 * Platform Integrations (super-admin only). Configure each cloud provider's OAuth
 * app ONCE, in-product — paste the client id + secret from the provider's console,
 * and every tenant instantly gets one-click connect. Secrets are AES-encrypted;
 * only the client id is ever shown back. Gated to PLATFORM_ADMIN_EMAILS.
 *
 * Command-center anatomy: ModuleHero, live StatStrip (configured vs pending from
 * the API), SectionCard list, skeletons, honest states.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { humanError } from '@/lib/errors';
import {
  PremiumSurface, ModuleHero, SectionCard, StatStrip, IconChip, Pill,
  goldButtonStyle, ghostButtonStyle,
} from '@/components/ui/premium';
import { ShieldCheck, CheckCircle, WarningCircle, X, Copy, Check, ArrowSquareOut, Trash } from '@phosphor-icons/react';

/* eslint-disable @typescript-eslint/no-explicit-any */

const GOLD = 'var(--brand-primary)';
const WHITE = 'var(--text-primary)';
const MUTED = 'rgba(255,255,255,0.62)';
const BORDER = 'rgba(255,255,255,0.08)';
const GREEN = 'var(--success)';
const RED = 'var(--danger)';

const modalInputStyle: React.CSSProperties = {
  width: '100%', marginTop: 3,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
  border: `1px solid ${BORDER}`, borderRadius: 8, color: WHITE,
  padding: '9px 11px', fontSize: 13.5, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box',
};

/** Pulsing skeleton row (pmSkeleton keyframes ship with PremiumSurface). */
function SkeletonRow({ h = 68 }: { h?: number }) {
  return <div className="pmSkeleton" style={{ height: h, borderRadius: 12, background: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))' }} />;
}

export default function PlatformIntegrationsPage() {
  const [apps, setApps] = useState<any[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<{ clientId: string; clientSecret: string }>({ clientId: '', clientSecret: '' });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ m: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const flash = (m: string, ok = true) => { setToast({ m, ok }); setTimeout(() => setToast(null), 4000); };

  const load = useCallback(async () => {
    const res = await fetch('/api/platform/integrations');
    if (res.status === 403) { setDenied(true); return; }
    const j = await res.json();
    setApps(j.apps ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.clientId.trim() || !form.clientSecret.trim()) { flash('Client ID and secret are both required.', false); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/platform/integrations/${editing.app}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      flash(`${editing.label} connected — live for all tenants`); setEditing(null); setForm({ clientId: '', clientSecret: '' }); load();
    } catch (e: any) { console.error(e); flash(humanError(e, 'Something went wrong. Please try again.'), false); }
    setBusy(false);
  };
  const remove = async (app: any) => { if (!(await confirmDialog({ title: 'Please confirm', message: `Remove ${app.label} credentials? Tenants can't connect it until re-added.`, danger: true }))) return; await fetch(`/api/platform/integrations/${app.app}`, { method: 'DELETE' }); flash('Removed'); load(); };
  const copy = async (text: string, key: string) => { try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500); } catch { /* */ } };

  if (denied) {
    return (
      <PremiumSurface maxWidth={2200}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '72px 24px' }}>
          <IconChip size={64}><ShieldCheck size={30} weight="duotone" color={GOLD} /></IconChip>
          <div style={{ fontSize: 18, fontWeight: 800, color: WHITE, margin: '18px 0 8px' }}>Platform Owners Only</div>
          <div style={{ fontSize: 13.5, color: MUTED, maxWidth: 380, lineHeight: 1.55 }}>
            This page configures OAuth apps for every tenant on the platform and is limited to platform administrator accounts.
          </div>
        </div>
      </PremiumSurface>
    );
  }

  const configured = (apps ?? []).filter((a) => a.configured);
  const pending = (apps ?? []).filter((a) => !a.configured);

  return (
    <PremiumSurface maxWidth={2200}>
      <ModuleHero
        eyebrow="Platform"
        eyebrowIcon={<ShieldCheck size={13} weight="fill" color={GOLD} />}
        title="Platform"
        accent="Integrations"
        subtitle="Configure each provider once. Tenants then connect in one click."
      />

      {/* Live figures — provider states come straight from the API. */}
      {apps !== null && (
        <StatStrip items={[
          {href: '/app/settings/platform-integrations', label: 'Providers', value: String(apps.length), sub: 'Supported OAuth apps' },
          {href: '/app/settings/platform-integrations', label: 'Configured', value: String(configured.length), accent: configured.length > 0 ? GREEN : undefined, sub: 'Live for all tenants' },
          {href: '/app/settings/platform-integrations', label: 'Not Configured', value: String(pending.length), accent: pending.length > 0 ? GOLD : undefined, sub: pending.length ? 'Tenants can’t connect these yet' : 'Everything is live' },
        ]} />
      )}

      {toast && (
        <div style={{ margin: '0 0 16px', padding: '10px 14px', background: toast.ok ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)', border: `1px solid ${toast.ok ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`, borderRadius: 10, color: toast.ok ? GREEN : RED, fontSize: 13 }}>{toast.m}</div>
      )}

      <SectionCard
        title="Provider OAuth Apps"
        subtitle="One provider per row. Set up once, live platform-wide."
        icon={<ShieldCheck size={17} weight="duotone" color={GOLD} />}
      >
        {apps === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SkeletonRow /><SkeletonRow /><SkeletonRow />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {apps.map((a) => (
              <div key={a.app} style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {a.configured ? <CheckCircle size={22} color={GREEN} weight="fill" /> : <WarningCircle size={22} color={MUTED} weight="fill" />}
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontWeight: 700, color: WHITE, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {a.label}
                      {a.configured ? <Pill tone="green">Live</Pill> : <Pill tone="neutral">Not Set Up</Pill>}
                    </div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{a.configured ? `Configured (${a.source})${a.client_id ? ` · ${a.client_id.slice(0, 10)}…` : ''}` : 'Not configured — tenants can’t connect this yet'}</div>
                  </div>
                  <button onClick={() => { setEditing(a); setForm({ clientId: '', clientSecret: '' }); }} className="pmBtn" style={{ ...goldButtonStyle, padding: '8px 16px', fontSize: 12.5 }}>{a.configured ? 'Update' : 'Set Up'}</button>
                  {a.source === 'in-product' && (
                    <button onClick={() => remove(a)} className="pmBtn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '8px 12px', borderRadius: 10, cursor: 'pointer', background: 'rgba(248,113,113,0.12)', color: RED, border: '1px solid rgba(248,113,113,0.35)' }}><Trash size={13} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18, width: 'min(560px,100%)', maxHeight: '92vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}><div style={{ fontWeight: 800, fontSize: 16, flex: 1, color: WHITE }}>{editing.label}</div><button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={19} color={MUTED} /></button></div>

            {/* setup guide */}
            <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, margin: '10px 0 14px' }}>
              <div style={{ fontSize: 12.5, color: WHITE, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>1 · Register the App <a href={editing.portal} target="_blank" rel="noreferrer" style={{ color: GOLD, display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>{editing.portalName}<ArrowSquareOut size={12} /></a></div>
              <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 8 }}>Add these redirect URIs to the app (copy each):</div>
              {editing.redirects.map((r: string) => (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <code style={{ flex: 1, fontSize: 11.5, color: 'var(--success)', wordBreak: 'break-all', fontFamily: 'monospace' }}>{r}</code>
                  <button onClick={() => copy(r, r)} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '3px 7px', cursor: 'pointer', color: MUTED, display: 'inline-flex', gap: 3, alignItems: 'center', fontSize: 11 }}>{copied === r ? <Check size={12} color={GREEN} /> : <Copy size={12} />}</button>
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6 }}>Enables: {editing.providers.join(', ')}.</div>
            </div>

            <div style={{ fontSize: 12.5, color: WHITE, fontWeight: 700, marginBottom: 8 }}>2 · Paste the App Credentials</div>
            <label style={{ display: 'block', marginBottom: 10 }}><span style={{ fontSize: 12.5, color: MUTED }}>Client ID / App Key</span>
              <input value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} autoComplete="off" style={modalInputStyle} /></label>
            <label style={{ display: 'block', marginBottom: 10 }}><span style={{ fontSize: 12.5, color: MUTED }}>Client Secret / App Secret</span>
              <input type="password" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} autoComplete="off" style={modalInputStyle} /></label>
            <button onClick={save} disabled={busy} className="pmBtn" style={{ ...goldButtonStyle, width: '100%', marginTop: 4, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save — Go Live for All Tenants'}</button>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>The secret is AES-encrypted server-side and never shown again. The client ID isn&apos;t a secret.</div>
            <button onClick={() => setEditing(null)} style={{ ...ghostButtonStyle, width: '100%', marginTop: 8, padding: '9px 16px', fontSize: 12.5, boxSizing: 'border-box' }} className="pmBtn">Cancel</button>
          </div>
        </div>
      )}
    </PremiumSurface>
  );
}
