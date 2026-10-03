'use client';
import React, { useState } from 'react';
import Link from 'next/link';

const GOLD = 'var(--brand-primary)';
const DARK = 'var(--bg-base)';
const RAISED = 'var(--bg-surface)';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1';
const TEXT = '#FFFFFF';
const GREEN = '#2CFF7A';
const RED = '#FF3B30';
const BLUE = 'var(--brand-primary)';

export default function SubPortalLogin() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState<{ token: string; companyName: string; contactName: string; projectName: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    setFound(null);

    try {
      const res = await fetch('/api/portal/sub/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Access not found. Please try again.');
      } else {
        setFound(data);
        setTimeout(() => {
          window.location.href = `/portals/sub/${data.token}`;
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
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 40 }}>
        <img src="/logo-full.jpg" alt="Saguaro" style={{ height: 38, borderRadius: 4 }} />
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em', background: `linear-gradient(90deg,${GOLD},var(--brand-primary-strong))`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Saguaro</span>
          <span style={{ fontSize: 8, color: DIM, letterSpacing: '-0.01em', fontWeight: 600 }}>Control Systems</span>
        </span>
      </Link>

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
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--brand-primary-12)', border: '1.5px solid var(--brand-primary-35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={26} height={26}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: TEXT, textAlign: 'center', margin: '0 0 6px' }}>
          Subcontractor Portal
        </h1>
        <p style={{ fontSize: 14, color: DIM, textAlign: 'center', margin: '0 0 28px', lineHeight: 1.5 }}>
          Manage bids, submit daily logs, track pay applications, and stay compliant.
        </p>

        {found ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(44,255,122,0.12)', border: '1.5px solid rgba(44,255,122,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={24} height={24}>
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
              Welcome, {found.contactName || found.companyName}!
            </div>
            {found.companyName && found.contactName && (
              <div style={{ fontSize: 13, color: DIM, marginBottom: 4 }}>{found.companyName}</div>
            )}
            <div style={{ fontSize: 13, color: DIM, marginBottom: 16 }}>{found.projectName}</div>
            <div style={{ fontSize: 12, color: DIM }}>Redirecting to your portal…</div>
            <div style={{ marginTop: 16, height: 3, background: BORDER, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: BLUE, borderRadius: 4, animation: 'progress 1.4s linear forwards' }} />
            </div>
            <style>{`@keyframes progress { from { width: 0% } to { width: 100% } }`}</style>
            <Link href={`/portals/sub/${found.token}`} style={{ display: 'inline-block', marginTop: 12, fontSize: 12, color: BLUE, textDecoration: 'none' }}>
              Click Here If Not Redirected →
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 8 }}>
              Your Company Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@yourcompany.com"
              required
              autoFocus
              style={{
                width: '100%',
                padding: '12px 14px',
                background: '#1c1c1e',
                border: `1px solid ${error ? RED : BORDER}`,
                borderRadius: 8,
                color: TEXT,
                fontSize: 15,
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = BLUE; setError(''); }}
              onBlur={e => { e.currentTarget.style.borderColor = error ? RED : BORDER; }}
            />

            {error && (
              <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(255,59,48,0.1)', border: `1px solid rgba(255,59,48,0.25)`, borderRadius: 8, fontSize: 13, color: '#fca5a5', lineHeight: 1.5 }}>
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
                background: loading || !email.trim() ? 'var(--brand-primary-35)' : BLUE,
                border: 'none',
                borderRadius: 8,
                color: '#0A0A00',
                fontSize: 15,
                fontWeight: 700,
                cursor: loading || !email.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                letterSpacing: '0.02em',
              }}
            >
              {loading ? 'Looking up access…' : 'Access My Portal →'}
            </button>

            {/* Have a direct link */}
            <div style={{ marginTop: 16, padding: '12px 14px', background: '#1c1c1e', border: `1px solid ${BORDER}`, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: DIM, marginBottom: 6, fontWeight: 600 }}>Have a Direct Portal Link?</div>
              <div style={{ fontSize: 12, color: DIM, lineHeight: 1.5 }}>
                If your GC sent you a direct URL, click the link in that email instead of entering your email here.
              </div>
            </div>

            <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${BORDER}`, textAlign: 'center', fontSize: 12, color: DIM, lineHeight: 1.6 }}>
              Not registered yet?<br />
              Contact the general contractor who invited you to bid.
            </div>
          </form>
        )}
      </div>

      {/* Footer links */}
      <div style={{ marginTop: 24, display: 'flex', gap: 20, fontSize: 12, color: DIM }}>
        <Link href="/portals/client/login" style={{ color: DIM, textDecoration: 'none' }}
          onMouseEnter={e => e.currentTarget.style.color = TEXT}
          onMouseLeave={e => e.currentTarget.style.color = DIM}>
          Client Portal →
        </Link>
        <Link href="/" style={{ color: DIM, textDecoration: 'none' }}
          onMouseEnter={e => e.currentTarget.style.color = TEXT}
          onMouseLeave={e => e.currentTarget.style.color = DIM}>
          ← Back to Saguaro
        </Link>
      </div>
    </div>
  );
}
