'use client';
/**
 * Settings → External Storage. Connect the tenant's own cloud storage (S3-compatible,
 * Egnyte, OneDrive/SharePoint, Dropbox, Google Drive, Box), test/remove connections,
 * and browse+import external files into a project. OAuth providers bounce through the
 * provider's consent screen; keys/token providers use an inline form. Secrets are
 * AES-encrypted server-side and never returned to the browser.
 *
 * Command-center anatomy: ModuleHero, live StatStrip (connections + providers from
 * the API), SectionCards, skeletons, honest empty state.
 */
import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { humanError } from '@/lib/errors';
import { useSearchParams } from 'next/navigation';
import {
  PremiumSurface, ModuleHero, SectionCard, StatStrip, IconChip, Pill,
  goldButtonStyle, ghostButtonStyle,
} from '@/components/ui/premium';
import { CloudArrowUp, X, CheckCircle, WarningCircle, ArrowClockwise, Trash, Gear, CaretDown, CaretRight } from '@phosphor-icons/react';

/* eslint-disable @typescript-eslint/no-explicit-any */

const GOLD = 'var(--brand-primary)';
const GOLD_HI = 'var(--brand-primary-strong)';
const WHITE = '#FFFFFF';
const MUTED = 'rgba(255,255,255,0.62)';
const FAINT = 'rgba(255,255,255,0.42)';
const BORDER = 'rgba(255,255,255,0.08)';
const GREEN = '#22C55E';
const RED = '#EF4444';

const inputStyle: React.CSSProperties = {
  width: '100%', marginTop: 3,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
  border: `1px solid ${BORDER}`, borderRadius: 8, color: WHITE,
  padding: '9px 11px', fontSize: 13.5, outline: 'none', boxSizing: 'border-box',
};

type Field = { key: string; label: string; required?: boolean; placeholder?: string; secret?: boolean };
const FORM_FIELDS: Record<string, Field[]> = {
  s3: [
    { key: 'region', label: 'Region', required: true, placeholder: 'us-east-1 (use "auto" for Cloudflare R2)' },
    { key: 'bucket', label: 'Bucket Name', required: true, placeholder: 'my-company-files' },
    { key: 'endpoint', label: 'Custom Endpoint (S3-Compatible Only)', placeholder: 'https://<acct>.r2.cloudflarestorage.com' },
    { key: 'forcePathStyle', label: 'Force Path-Style (MinIO/Most Non-AWS) — True/False', placeholder: 'false' },
    { key: 'accessKeyId', label: 'Access Key ID', required: true, secret: true },
    { key: 'secretAccessKey', label: 'Secret Access Key', required: true, secret: true },
  ],
  egnyte: [
    { key: 'domain', label: 'Egnyte Domain', required: true, placeholder: 'acme.egnyte.com' },
    { key: 'apiToken', label: 'API Access Token', required: true, secret: true },
  ],
};

/** Pulsing skeleton row (pmSkeleton keyframes ship with PremiumSurface). */
function SkeletonRow({ h = 60 }: { h?: number }) {
  return <div className="pmSkeleton" style={{ height: h, borderRadius: 12, background: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))' }} />;
}

export default function StorageSettingsPage() {
  return (
    <Suspense fallback={
      <PremiumSurface maxWidth={1100}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkeletonRow h={90} /><SkeletonRow /><SkeletonRow />
        </div>
      </PremiumSurface>
    }>
      <StorageSettings />
    </Suspense>
  );
}

function StorageSettings() {
  const qp = useSearchParams();
  const [providers, setProviders] = useState<any[]>([]);
  const [connectors, setConnectors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  const [toast, setToast] = useState<{ m: string; ok: boolean } | null>(null);
  const flash = (m: string, ok = true) => { setToast({ m, ok }); setTimeout(() => setToast(null), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    const [p, c] = await Promise.all([fetch('/api/storage/providers').then((r) => r.json()), fetch('/api/storage/connectors').then((r) => r.json())]);
    setProviders(p.providers ?? []); setConnectors(c.connectors ?? []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const connected = qp.get('connected'); const error = qp.get('error');
    if (connected) { flash(`Connected ${connected}`); window.history.replaceState({}, '', '/app/settings/storage'); }
    if (error) { flash(error, false); window.history.replaceState({}, '', '/app/settings/storage'); }
  }, [qp]);

  const startAdd = (provider: string, auth: string) => {
    if (auth === 'oauth') { window.location.href = `/api/storage/oauth/${provider}/start`; return; }
    setAdding(provider); setForm({});
  };
  const submitForm = async () => {
    const fields = FORM_FIELDS[adding!] || [];
    const config: any = {}; const secret: any = {};
    for (const f of fields) {
      const v = (form[f.key] ?? '').trim();
      if (f.required && !v) { flash(`${f.label} is required`, false); return; }
      if (!v) continue;
      if (f.secret) secret[f.key] = v;
      else config[f.key] = f.key === 'forcePathStyle' ? v === 'true' : v;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/storage/connectors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: adding, config, secret }) });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      flash(`Connected${j.account ? ` — ${j.account}` : ''}`); setAdding(null); load();
    } catch (e: any) { console.error(e); flash(humanError(e, 'Something went wrong. Please try again.'), false); }
    setBusy(false);
  };
  const test = async (id: string) => { const j = await (await fetch(`/api/storage/connectors/${id}/test`, { method: 'POST' })).json(); flash(j.ok ? `Connection OK${j.account ? ` — ${j.account}` : ''}` : (j.error || 'Test failed'), j.ok); load(); };
  const remove = async (id: string, name: string) => { if (!confirm(`Remove "${name}"? Files already imported stay; new access stops.`)) return; await fetch(`/api/storage/connectors/${id}`, { method: 'DELETE' }); flash('Removed'); load(); };
  const saveConfig = async (id: string, config: any) => { const j = await (await fetch(`/api/storage/connectors/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config }) })).json(); if (j.error) flash(j.error, false); else { flash('Saved'); load(); } };

  const oneClick = providers.filter((p) => p.auth === 'oauth');
  const advanced = providers.filter((p) => p.auth !== 'oauth');
  const anyOneClick = oneClick.some((p) => p.available);
  const healthy = connectors.filter((c) => c.connected).length;

  return (
    <PremiumSurface maxWidth={1100}>
      <ModuleHero
        eyebrow="Workspace"
        eyebrowIcon={<CloudArrowUp size={13} weight="fill" color={GOLD} />}
        title="External"
        accent="Storage"
        subtitle="Connect your company cloud. Your team signs in with their own account."
      />

      {/* Live figures — connections and providers come straight from the API. */}
      {!loading && (
        <StatStrip items={[
          {href: '/app/settings/storage', label: 'Connections', value: String(connectors.length), sub: connectors.length ? 'Linked to this workspace' : 'None yet' },
          {href: '/app/settings/storage', label: 'Healthy', value: String(healthy), accent: connectors.length > 0 && healthy < connectors.length ? RED : (healthy > 0 ? GREEN : undefined), sub: connectors.length > 0 && healthy < connectors.length ? `${connectors.length - healthy} need attention` : 'Verified reachable' },
          {href: '/app/settings/storage', label: 'One-Click Providers', value: String(oneClick.filter((p) => p.available).length), sub: `Of ${oneClick.length} sign-in providers` },
          {href: '/app/settings/storage', label: 'Bring Your Own', value: String(advanced.length), sub: 'Key-based options (S3, Egnyte)' },
        ]} />
      )}

      {toast && (
        <div style={{ margin: '0 0 16px', padding: '10px 14px', background: toast.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${toast.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 10, color: toast.ok ? GREEN : RED, fontSize: 13 }}>{toast.m}</div>
      )}

      {/* Existing connections */}
      <SectionCard flat
        title="Connected Storage"
        subtitle={connectors.length ? 'Test, tune, or remove existing connections' : undefined}
        icon={<CloudArrowUp size={17} weight="duotone" color={GOLD} />}
        style={{ marginBottom: 24 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? <><SkeletonRow /><SkeletonRow /></>
            : connectors.length === 0 ? (
              <div style={{ fontSize: 13, color: FAINT, lineHeight: 1.55 }}>
                No storage connected yet. Pick a provider below — once connected, its files show up in every project&apos;s Files tab for browsing and import.
              </div>
            )
              : connectors.map((c) => <ConnectorCard key={c.id} c={c} onTest={() => test(c.id)} onRemove={() => remove(c.id, c.display_name)} onSaveConfig={(cfg) => saveConfig(c.id, cfg)} />)}
        </div>
      </SectionCard>

      {/* One-click OAuth providers — the mainstream, no keys */}
      <SectionCard
        title="Connect in One Click"
        subtitle="Your team signs in with their existing account — no API keys, nothing to paste."
        icon={<CheckCircle size={17} weight="duotone" color={GOLD} />}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
          {loading && <><SkeletonRow h={110} /><SkeletonRow h={110} /><SkeletonRow h={110} /></>}
          {!loading && oneClick.map((p) => (
            <button key={p.id} disabled={!p.available} onClick={() => startAdd(p.id, p.auth)}
              className={p.available ? 'pmHover' : undefined}
              style={{
                textAlign: 'left', fontFamily: 'inherit',
                background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))',
                border: `1px solid ${p.available ? BORDER : 'rgba(255,255,255,0.05)'}`,
                borderRadius: 12, padding: 14, cursor: p.available ? 'pointer' : 'default',
                opacity: p.available ? 1 : 0.5, color: WHITE,
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CloudArrowUp size={18} color={GOLD} weight="fill" /><span style={{ fontWeight: 700, fontSize: 14 }}>{p.label}</span></div>
              <div style={{ color: MUTED, fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>{p.blurb}</div>
              <div style={{ marginTop: 8, fontSize: 11.5, color: p.available ? GOLD_HI : MUTED }}>{p.available ? 'Connect with Sign-In →' : 'Enabling Soon'}</div>
            </button>
          ))}
        </div>
        {!loading && !anyOneClick && <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>One-click providers activate once your Saguaro workspace is configured. Use an advanced option below in the meantime.</div>}

        {/* advanced: self-managed keys (S3 bucket, Egnyte token) */}
        <button onClick={() => setAdvOpen((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: MUTED, marginTop: 22, padding: 0, fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
          {advOpen ? <CaretDown size={14} /> : <CaretRight size={14} />}Advanced — Bring Your Own Bucket
        </button>
        {advOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, marginTop: 12 }}>
            {advanced.map((p) => (
              <button key={p.id} onClick={() => startAdd(p.id, p.auth)}
                className="pmHover"
                style={{
                  textAlign: 'left', fontFamily: 'inherit',
                  background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))',
                  border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, cursor: 'pointer', color: WHITE,
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CloudArrowUp size={18} color={MUTED} weight="fill" /><span style={{ fontWeight: 700, fontSize: 14 }}>{p.label}</span></div>
                <div style={{ color: MUTED, fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>{p.blurb}</div>
                <div style={{ marginTop: 8, fontSize: 11.5, color: GOLD_HI }}>Enter Credentials →</div>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      {adding && (
        <div onClick={() => setAdding(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18, width: 'min(460px,100%)', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <IconChip size={32}><CloudArrowUp size={16} weight="fill" color={GOLD} /></IconChip>
              <div style={{ fontWeight: 800, fontSize: 16, flex: 1, color: WHITE, marginLeft: 10 }}>Connect {providers.find((p) => p.id === adding)?.label}</div>
              <button onClick={() => setAdding(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={19} color={MUTED} /></button>
            </div>
            {(FORM_FIELDS[adding] || []).map((f) => (
              <label key={f.key} style={{ display: 'block', marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, color: MUTED }}>{f.label}{f.required ? ' *' : ''}</span>
                <input type={f.secret ? 'password' : 'text'} autoComplete="off" value={form[f.key] ?? ''} placeholder={f.placeholder}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  style={{ ...inputStyle, fontFamily: f.secret ? 'monospace' : undefined }} />
              </label>
            ))}
            <button onClick={submitForm} disabled={busy} className="pmBtn" style={{ ...goldButtonStyle, width: '100%', marginTop: 6, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Verifying…' : 'Test & Connect'}</button>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>Credentials are encrypted server-side and never shown again. We verify them before saving.</div>
          </div>
        </div>
      )}
    </PremiumSurface>
  );
}

function ConnectorCard({ c, onTest, onRemove, onSaveConfig }: { c: any; onTest: () => void; onRemove: () => void; onSaveConfig: (cfg: any) => void }) {
  const [cfg, setCfg] = useState<any>(c.config || {});
  const needsSite = c.provider === 'sharepoint' && !c.config?.siteId;
  const compactGhost: React.CSSProperties = { ...ghostButtonStyle, padding: '7px 12px', fontSize: 12 };
  return (
    <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))', border: `1px solid ${BORDER}`, borderRadius: 12 }}>
      <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {c.connected ? <CheckCircle size={22} color={GREEN} weight="fill" /> : <WarningCircle size={22} color={RED} weight="fill" />}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 700, color: WHITE, fontSize: 14.5 }}>{c.display_name}</div>
          <div style={{ fontSize: 12, color: c.connected ? MUTED : RED }}>{c.connected ? `Connected${c.last_verified_at ? ` · verified ${new Date(c.last_verified_at).toLocaleDateString()}` : ''}` : (c.last_error || 'Not connected')}</div>
        </div>
        {!c.connected && <Pill tone="red">Attention</Pill>}
        <button onClick={onTest} style={compactGhost} className="pmBtn"><ArrowClockwise size={14} />Test</button>
        <button onClick={onRemove} className="pmBtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: 'rgba(239,68,68,0.12)', color: RED, border: '1px solid rgba(239,68,68,0.35)' }}><Trash size={14} />Remove</button>
      </div>
      {needsSite && (
        <div style={{ padding: '0 14px 14px', display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 220 }}><span style={{ fontSize: 11.5, color: MUTED }}>SharePoint Site ID (Required to Browse)</span>
            <input value={cfg.siteId || ''} onChange={(e) => setCfg({ ...cfg, siteId: e.target.value })} placeholder="contoso.sharepoint.com,<siteGuid>,<webGuid>"
              style={{ ...inputStyle, fontSize: 12.5, padding: '8px 10px' }} /></label>
          <button onClick={() => onSaveConfig(cfg)} className="pmBtn" style={{ ...goldButtonStyle, padding: '8px 14px', fontSize: 12 }}><Gear size={13} />Save</button>
        </div>
      )}
    </div>
  );
}
