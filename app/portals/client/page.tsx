'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ClientPortalLanding() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTokenAccess = () => {
    if (!token.trim()) return;
    router.push(`/portals/client/${token.trim()}`);
  };

  const handleEmailAccess = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/portal/client/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        router.push(`/portals/client/${data.token}`);
      } else {
        setError(data.error || 'No portal access found for this email. Contact your contractor.');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 440, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ color: 'var(--brand-primary)', fontWeight: 800, fontSize: 24, letterSpacing: '-0.01em', marginBottom: 8 }}>Saguaro</div>
          <h1 style={{ color: '#FFFFFF', fontSize: 28, fontWeight: 700, margin: '0 0 8px' }}>Owner / Client Portal</h1>
          <p style={{ color: '#D4D4D8', fontSize: 14, margin: 0 }}>View your project progress, budgets, photos, and documents in real time.</p>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 32 }}>
          <div style={{ marginBottom: 24 }}>
            <label style={{ color: '#D4D4D8', fontSize: 12, display: 'block', marginBottom: 8 }}>Access With Your Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleEmailAccess()}
              placeholder="you@example.com"
              style={{ width: '100%', padding: '12px 16px', background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#FFFFFF', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
            <button
              onClick={handleEmailAccess}
              disabled={loading || !email.trim()}
              style={{ width: '100%', marginTop: 12, padding: '12px', background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-hover))', border: 'none', borderRadius: 10, color: '#0A0A00', fontWeight: 700, fontSize: 14, cursor: loading ? 'wait' : 'pointer', opacity: !email.trim() ? 0.5 : 1 }}
            >
              {loading ? 'Checking…' : 'Access My Project'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
            <span style={{ color: '#D4D4D8', fontSize: 12 }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
          </div>

          <div>
            <label style={{ color: '#D4D4D8', fontSize: 12, display: 'block', marginBottom: 8 }}>Enter Access Token</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTokenAccess()}
                placeholder="Paste your token"
                style={{ flex: 1, padding: '12px 16px', background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#FFFFFF', fontSize: 14, outline: 'none' }}
              />
              <button
                onClick={handleTokenAccess}
                disabled={!token.trim()}
                style={{ padding: '12px 20px', background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#FFFFFF', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: !token.trim() ? 0.5 : 1 }}
              >
                Go
              </button>
            </div>
          </div>

          {error && <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 8, color: '#FF3B30', fontSize: 13 }}>{error}</div>}
        </div>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <a href="/" style={{ color: '#D4D4D8', fontSize: 13, textDecoration: 'none' }}>← Back to Saguaro</a>
        </div>
      </div>
    </div>
  );
}
