'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { F } from '@/lib/field-tokens';

const glass: React.CSSProperties = { background: F.card, border: `1px solid ${F.border}`, borderRadius: 16 };

function timeLeft(expiresAt: string): { text: string; urgent: boolean; expired: boolean } {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return { text: 'Expired', urgent: false, expired: true };
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const urgent = diff < 3600000;
  if (hrs > 24) return { text: `${Math.floor(hrs / 24)}d ${hrs % 24}h`, urgent: false, expired: false };
  if (hrs > 0) return { text: `${hrs}h ${mins}m`, urgent, expired: false };
  return { text: `${mins}m`, urgent: true, expired: false };
}

function formatExpiry(expiresAt: string): string {
  const d = new Date(expiresAt);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

export default function MyAccessPage() {
  const router = useRouter();
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);

  const fetchTokens = () => {
    fetch('/api/network/tokens/my-tokens')
      .then(r => r.json())
      .then(d => { setTokens(d.tokens || []); setLoading(false); })
      .catch(() => {
        // Fallback to legacy endpoint
        fetch('/api/network/access-tokens?userId=me')
          .then(r => r.json())
          .then(d => { setTokens(d.tokens || []); setLoading(false); })
          .catch(() => setLoading(false));
      });
  };

  useEffect(() => { fetchTokens(); }, []);

  // Refresh countdown every 30s
  useEffect(() => {
    const id = setInterval(() => setTokens(t => [...t]), 30000);
    return () => clearInterval(id);
  }, []);

  const requestNewLink = async (token: any) => {
    const projectName = token.project_name || 'the project';
    const connName = token.network_connections?.name || 'network';
    setRequesting(token.id);
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'network_access_request',
          title: 'Network Access Request',
          body: `Requesting a new network access link for ${connName} on ${projectName}`,
        }),
      });
    } catch { /* best effort */ }
    setTimeout(() => setRequesting(null), 3000);
  };

  const active = tokens.filter(t => {
    const status = t.status || 'active';
    return status === 'active' && new Date(t.expires_at) > new Date();
  });

  const expired = tokens.filter(t => {
    const status = t.status || 'active';
    return status !== 'active' || new Date(t.expires_at) <= new Date();
  });

  return (
    <div style={{ padding: '16px 14px', maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: F.text, margin: '0 0 4px' }}>My Network Access</h1>
      <p style={{ fontSize: 13, color: F.dim, margin: '0 0 20px' }}>Your active network credentials and access links</p>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: F.dim }}>
          <div style={{ width: 28, height: 28, border: '3px solid rgba(200,150,15,.2)', borderTopColor: F.gold, borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 12px' }} />
          Loading your access...
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {!loading && tokens.length === 0 && (
        <div style={{ ...glass, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{'\uD83D\uDCF6'}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: F.text, marginBottom: 8 }}>No Active Network Access</div>
          <div style={{ fontSize: 13, color: F.dim, lineHeight: 1.6, marginBottom: 20 }}>
            Your project manager will send you{'\n'}a WiFi access link when you need it.
          </div>
          <a href="/field" style={{
            display: 'inline-block', padding: '12px 24px', background: F.raised,
            border: `1px solid ${F.border}`, borderRadius: 10, color: F.dim,
            fontSize: 13, fontWeight: 600, textDecoration: 'none',
          }}>Back to Field App</a>
        </div>
      )}

      {active.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: F.dim, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 10 }}>
            Active ({active.length})
          </div>
          {active.map(t => {
            const tl = timeLeft(t.expires_at);
            const conn = t.network_connections;
            return (
              <div key={t.id} style={{ ...glass, padding: 16, marginBottom: 12 }}>
                {/* Urgent warning */}
                {tl.urgent && (
                  <div style={{
                    background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)',
                    borderRadius: 8, padding: '8px 12px', marginBottom: 12, display: 'flex',
                    alignItems: 'center', gap: 8, animation: 'pulse 2s ease-in-out infinite',
                  }}>
                    <span>{'\u26A0\uFE0F'}</span>
                    <span style={{ fontSize: 12, color: F.amber, fontWeight: 700 }}>Expiring in {tl.text}!</span>
                  </div>
                )}
                <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}`}</style>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: F.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {'\uD83D\uDCF6'} {conn?.name || 'Network'}
                      {conn?.frequency && <span style={{ fontSize: 10, color: F.dim, fontWeight: 600 }}>({conn.frequency}/{conn.security_type || 'WPA2'})</span>}
                    </div>
                    <div style={{ fontSize: 12, color: F.dim, marginTop: 2 }}>
                      {t.project_name || conn?.ssid || ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 8, fontWeight: 700,
                      background: tl.urgent ? 'rgba(245,158,11,.12)' : F.greenBg,
                      color: tl.urgent ? F.amber : F.green,
                    }}>
                      {'\u25CF'} {tl.text}
                    </div>
                  </div>
                </div>

                {/* Status row */}
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: F.dim, marginBottom: 12 }}>
                  <span>Status: <strong style={{ color: F.green }}>{'\u25CF'} Active</strong></span>
                  <span>Expires: <strong style={{ color: F.text }}>{formatExpiry(t.expires_at)}</strong></span>
                </div>

                {/* Connect button */}
                <button onClick={() => router.push(`/field/network/connect?token=${t.token}`)} style={{
                  width: '100%', padding: '14px', minHeight: 48,
                  background: `linear-gradient(135deg, #B8860B, ${F.gold})`,
                  border: 'none', borderRadius: 12, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
                }}>
                  Tap to Connect {'\u2192'}
                </button>
              </div>
            );
          })}
        </>
      )}

      {expired.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: F.dim, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 10, marginTop: 24 }}>
            Expired ({expired.length})
          </div>
          {expired.slice(0, 5).map(t => {
            const conn = t.network_connections;
            return (
              <div key={t.id} style={{ ...glass, padding: 14, marginBottom: 8, opacity: 0.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: F.dim }}>{conn?.name || 'Network'}</div>
                    <div style={{ fontSize: 11, color: F.faint }}>Expired {new Date(t.expires_at).toLocaleDateString()}</div>
                  </div>
                  <button onClick={() => requestNewLink(t)} disabled={requesting === t.id} style={{
                    padding: '8px 12px', background: F.surface, border: `1px solid ${F.border}`,
                    borderRadius: 8, color: requesting === t.id ? F.green : F.gold, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}>
                    {requesting === t.id ? '\u2713 Requested' : 'Request New Link'}
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
