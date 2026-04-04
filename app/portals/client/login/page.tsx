'use client';
import React, { useState } from 'react';

const GOLD = '#C8960F';
const DARK = '#F8F9FB';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const DIM = '#6B7280';
const TEXT = '#111827';
const GREEN = '#22c55e';
const RED = '#ef4444';

export default function ClientPortalLogin() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState<{ token: string; clientName: string; projectName: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    setFound(null);

    try {
      const res = await fetch('/api/portal/client/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Access not found. Please try again.');
      } else {
        setFound(data);
        // Auto-redirect after 1.5s
        setTimeout(() => {
          window.location.href = `/portals/client/${data.token}`;
        }, 1500);
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: DARK,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: 'system-ui,-apple-system,sans-serif',
    }}>
      {/* Header */}
      <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 40 }}>
        <img src="/logo-full.jpg" alt="Saguaro" style={{ height: 38, borderRadius: 4 }} />
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.1em', background: `linear-gradient(90deg,${GOLD},#F0C040)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SAGUARO</span>
          <span style={{ fontSize: 8, color: DIM, letterSpacing: '0.25em', fontWeight: 600, textTransform: 'uppercase' }}>Control Systems</span>
        </span>
      </a>

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: RAISED,
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        padding: '36px 32px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: `rgba(212,160,23,0.12)`, border: `1.5px solid rgba(212,160,23,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}>
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: TEXT, textAlign: 'center', margin: '0 0 6px' }}>
          Client Portal
        </h1>
        <p style={{ fontSize: 14, color: DIM, textAlign: 'center', margin: '0 0 28px', lineHeight: 1.5 }}>
          View your project status, approve documents, and track financials.
        </p>

        {found ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', border: '1.5px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={24} height={24}>
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
              Welcome back, {found.clientName}!
            </div>
            <div style={{ fontSize: 13, color: DIM, marginBottom: 16 }}>
              {found.projectName}
            </div>
            <div style={{ fontSize: 12, color: DIM }}>Redirecting to your portal…</div>
            <div style={{ marginTop: 16, height: 3, background: BORDER, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: GOLD, borderRadius: 4, animation: 'progress 1.4s linear forwards' }} />
            </div>
            <style>{`@keyframes progress { from { width: 0% } to { width: 100% } }`}</style>
            <a href={`/portals/client/${found.token}`} style={{ display: 'inline-block', marginTop: 12, fontSize: 12, color: GOLD, textDecoration: 'none' }}>
              Click here if not redirected →
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: DIM, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              Your Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoFocus
              style={{
                width: '100%',
                padding: '12px 14px',
                background: '#E2E5EA',
                border: `1px solid ${error ? RED : BORDER}`,
                borderRadius: 8,
                color: TEXT,
                fontSize: 15,
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = GOLD; setError(''); }}
              onBlur={e => { e.currentTarget.style.borderColor = error ? RED : BORDER; }}
            />

            {error && (
              <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(239,68,68,0.1)', border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 8, fontSize: 13, color: '#fca5a5', lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              style={{
                width: '100%',
                marginTop: 16,
                padding: '13px',
                background: loading || !email.trim() ? 'rgba(212,160,23,0.4)' : `linear-gradient(135deg, ${GOLD}, #C8960F)`,
                border: 'none',
                borderRadius: 8,
                color: '#000',
                fontSize: 15,
                fontWeight: 700,
                cursor: loading || !email.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                letterSpacing: '0.02em',
              }}
            >
              {loading ? 'Looking up access…' : 'Access My Portal →'}
            </button>

            <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${BORDER}`, textAlign: 'center', fontSize: 12, color: DIM, lineHeight: 1.6 }}>
              Don&apos;t have access yet?<br />
              Contact your general contractor to request an invitation.
            </div>
          </form>
        )}
      </div>

      {/* Footer links */}
      <div style={{ marginTop: 24, display: 'flex', gap: 20, fontSize: 12, color: DIM }}>
        <a href="/portals/sub/login" style={{ color: DIM, textDecoration: 'none' }}
          onMouseEnter={e => e.currentTarget.style.color = TEXT}
          onMouseLeave={e => e.currentTarget.style.color = DIM}>
          Subcontractor Portal →
        </a>
        <a href="/" style={{ color: DIM, textDecoration: 'none' }}
          onMouseEnter={e => e.currentTarget.style.color = TEXT}
          onMouseLeave={e => e.currentTarget.style.color = DIM}>
          Back to Saguaro
        </a>
      </div>
    </div>
  );
}
