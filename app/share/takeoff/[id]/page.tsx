'use client';
/**
 * Public, read-only estimate — what a client / owner sees from a takeoff share link.
 * No auth, no editing; token-gated by /api/takeoff/share/[id]. The estimate deliverable
 * is rendered in an isolated iframe (srcDoc) so its print styles never leak into this page.
 */
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

const GOLD = 'var(--brand-primary)';
const NAVY = '#101722'; // text on gold fills

type Meta = { project: string; company: string; sell: number; lines: number; expiresAt: string; updatedAt: string | null; acceptedAt?: string | null; acceptedBy?: string | null; contractValue?: number | null };

export default function SharedEstimate() {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();
  const [html, setHtml] = useState('');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptName, setAcceptName] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [acceptMsg, setAcceptMsg] = useState('');

  useEffect(() => {
    const id = params?.id, t = sp.get('t'), e = sp.get('e');
    if (!id || !t || !e) { setErr('This estimate link is incomplete.'); setLoading(false); return; }
    fetch(`/api/takeoff/share/${id}?t=${encodeURIComponent(t)}&e=${encodeURIComponent(e)}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setErr(d.error); else { setHtml(d.html); setMeta(d.meta); } })
      .catch((e2) => setErr(e2 instanceof Error ? e2.message : String(e2)))
      .finally(() => setLoading(false));
  }, [params?.id, sp]);

  const printFrame = () => {
    const f = document.getElementById('estimate-frame') as HTMLIFrameElement | null;
    try { f?.contentWindow?.focus(); f?.contentWindow?.print(); } catch { /* pop-up blocked */ }
  };

  const acceptEstimate = async () => {
    const id = params?.id, t = sp.get('t'), e = sp.get('e');
    if (!id || !acceptName.trim()) { setAcceptMsg('Please enter your name.'); return; }
    setAccepting(true); setAcceptMsg('');
    try {
      const res = await fetch(`/api/takeoff/share/${id}?t=${encodeURIComponent(t || '')}&e=${encodeURIComponent(e || '')}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: acceptName.trim() }),
      });
      const d = await res.json();
      if (d.error) { setAcceptMsg(d.error); }
      else {
        setMeta((m) => m ? { ...m, acceptedAt: new Date().toISOString(), acceptedBy: d.acceptedBy, contractValue: d.contractValue } : m);
        setAcceptOpen(false);
      }
    } catch (e2) { setAcceptMsg(e2 instanceof Error ? e2.message : String(e2)); }
    setAccepting(false);
  };

  if (loading) return <Shell><p style={{ color: '#8b949e', margin: 0 }}>Loading estimate…</p></Shell>;
  if (err) return (
    <Shell>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#f0f3f8', marginBottom: 8 }}>Estimate Unavailable</div>
        <p style={{ color: '#8b949e', margin: 0, fontSize: 14, lineHeight: 1.5 }}>{err}</p>
        <p style={{ color: '#6b7280', marginTop: 14, fontSize: 13 }}>Ask the sender for a fresh link.</p>
      </div>
    </Shell>
  );

  const expLabel = meta?.expiresAt ? new Date(meta.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>
      {/* Branded toolbar */}
      <header style={{ position: 'sticky', top: 0, zIndex: 5, background: 'rgba(13,17,23,0.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--border-default)', padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span aria-hidden style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--brand-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: NAVY, fontWeight: 900, fontSize: 15, flexShrink: 0 }}>S</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#f0f3f8', fontWeight: 800, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta?.project || 'Estimate'}</div>
            <div style={{ color: '#8b949e', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta?.company} · read-only estimate</div>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {meta && (
            <div style={{ textAlign: 'right', lineHeight: 1.15 }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 900, fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>${meta.sell.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>{meta.lines} line items{expLabel ? ` · link valid to ${expLabel}` : ''}</div>
            </div>
          )}
          <button onClick={printFrame} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid rgba(255,255,255,0.16)', borderRadius: 9, padding: '9px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#e6edf3', background: 'transparent' }}>
            Print / Save PDF
          </button>
          {meta?.acceptedAt ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: '#4ADE80', border: '1px solid rgba(52,211,153,0.4)', background: 'rgba(52,211,153,0.10)', borderRadius: 9, padding: '8px 13px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              Accepted{meta.acceptedBy ? ` — ${meta.acceptedBy}` : ''}
            </span>
          ) : (
            <button onClick={() => setAcceptOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', borderRadius: 9, padding: '9px 18px', cursor: 'pointer', fontWeight: 800, fontSize: 14, color: NAVY, background: 'var(--brand-primary)' }}>
              Accept Estimate
            </button>
          )}
        </div>
      </header>

      {/* Accept flow — client e-signs (typed name) → promotes sell to contract value */}
      {acceptOpen && !meta?.acceptedAt && (
        <div style={{ borderBottom: '1px solid var(--border-default)', background: 'rgba(13,17,23,0.96)', padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ color: '#e6edf3', fontSize: 14, fontWeight: 700 }}>Accept this estimate at <span style={{ color: 'var(--text-primary)' }}>${(meta?.sell ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>?</div>
          <input value={acceptName} onChange={(ev) => setAcceptName(ev.target.value)} placeholder="Type your full name to sign" style={{ flex: 1, minWidth: 200, background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, color: '#e6edf3', padding: '9px 12px', fontSize: 14 }} />
          <button onClick={acceptEstimate} disabled={accepting || !acceptName.trim()} style={{ border: 'none', borderRadius: 8, padding: '9px 18px', cursor: accepting || !acceptName.trim() ? 'not-allowed' : 'pointer', opacity: accepting || !acceptName.trim() ? 0.6 : 1, fontWeight: 800, fontSize: 14, color: NAVY, background: 'var(--brand-primary)' }}>{accepting ? 'Recording…' : 'Sign & Accept'}</button>
          <button onClick={() => { setAcceptOpen(false); setAcceptMsg(''); }} style={{ border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#9aa6b6', background: 'transparent' }}>Cancel</button>
          {acceptMsg && <div style={{ width: '100%', color: '#f0a24a', fontSize: 13 }}>{acceptMsg}</div>}
          <div style={{ width: '100%', color: '#6b7280', fontSize: 12 }}>Typing your name records a legally-meaningful acceptance (name, timestamp &amp; IP) and sets the contract value. This does not replace a signed contract.</div>
        </div>
      )}

      {/* The estimate deliverable, isolated. flex:1 + minHeight:0 lets it fill whatever space the
          (wrapping, variable-height) header leaves — no hardcoded calc(100vh - 56px) that breaks on mobile. */}
      <iframe id="estimate-frame" title="Estimate" srcDoc={html} style={{ flex: '1 1 auto', width: '100%', border: 'none', background: '#fff', minHeight: 0, height: '70vh' }} />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {children}
    </div>
  );
}
