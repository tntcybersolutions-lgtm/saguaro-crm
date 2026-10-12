'use client';
import React, { useState } from 'react';
import Link from 'next/link';

const GOLD = 'var(--brand-primary)';
const DARK = 'var(--bg-base)';
const RAISED = 'var(--bg-surface)';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = 'var(--text-secondary)';
const TEXT = '#FFFFFF';
const GREEN = '#4ADE80';
const RED = '#F87171';

export default function ClientPortalLogin() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    setSent(false);

    try {
      const res = await fetch('/api/portal/client/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
      } else {
        // Secure flow: the portal link is emailed to the address on file —
        // never returned to the browser (prevents account takeover by email).
        setSent(true);
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
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em', background: `var(--brand-primary)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Saguaro</span>
          <span style={{ fontSize: 12, color: DIM, fontWeight: 600 }}>Control Systems</span>
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
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg-surface-2)', border: '1.5px solid var(--brand-primary-35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(74,222,128,0.12)', border: '1.5px solid rgba(74,222,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={24} height={24}>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
              Check Your Email
            </div>
            <div style={{ fontSize: 13, color: DIM, lineHeight: 1.6 }}>
              If an active portal exists for <strong>{email}</strong>, we&apos;ve emailed your secure access link. It can take a minute to arrive.
            </div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 16 }}>
              Didn&apos;t get it? Contact your general contractor for your portal link.
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 8 }}>
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
                background: 'rgba(0,0,0,0.05)',
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
              <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(248,113,113,0.1)', border: `1px solid rgba(248,113,113,0.25)`, borderRadius: 8, fontSize: 13, color: '#fca5a5', lineHeight: 1.5 }}>
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
                background: loading || !email.trim() ? 'color-mix(in srgb, var(--brand-primary) 40%, transparent)' : `var(--brand-primary)`,
                border: 'none',
                borderRadius: 8,
                color: '#101722',
                fontSize: 15,
                fontWeight: 700,
                cursor: loading || !email.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                letterSpacing: '0.02em',
              }}
            >
              {loading ? 'Looking Up Access…' : 'Access My Portal →'}
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
        <Link href="/portals/sub/login" style={{ color: DIM, textDecoration: 'none' }}
          onMouseEnter={e => e.currentTarget.style.color = TEXT}
          onMouseLeave={e => e.currentTarget.style.color = DIM}>
          Subcontractor Portal →
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
