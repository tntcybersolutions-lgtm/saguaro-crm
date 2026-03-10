'use client';
import React, { useState } from 'react';
import Link from 'next/link';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [portal, setPortal] = useState<'internal'|'client'|'sub'>('internal');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, portal }),
      });
      const data = await res.json();
      if (res.ok) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('saguaro_token', data.accessToken);
          window.location.href = data.redirectUrl || '/app';
        }
      } else {
        setError(data.error || 'Invalid email or password');
      }
    } catch { setError('Network error. Please try again.'); }
    setLoading(false);
  }

  const PORTALS = [
    { id: 'internal', label: 'Team Login',   sub: 'GC & Project Team',   icon: '🏗️' },
    { id: 'client',   label: 'Client Portal', sub: 'Project Owner View',  icon: '🏠' },
    { id: 'sub',      label: 'Sub Portal',    sub: 'Subcontractor Access', icon: '🔧' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>

      {/* Logo */}
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 32 }}>
        <span style={{ fontSize: 28 }}>🌵</span>
        <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: 2, color: GOLD }}>SAGUARO</span>
        <span style={{ fontSize: 11, background: GOLD, color: '#0d1117', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>CRM</span>
      </Link>

      <div style={{ width: '100%', maxWidth: 460, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>

        {/* Portal selector */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', background: DARK }}>
          {PORTALS.map(p => (
            <button key={p.id} onClick={() => setPortal(p.id as typeof portal)} style={{ padding: '14px 8px', border: 'none', borderBottom: `2px solid ${portal === p.id ? GOLD : 'transparent'}`, background: portal === p.id ? 'rgba(212,160,23,.08)' : 'transparent', cursor: 'pointer', transition: 'all .15s' }}>
              <div style={{ fontSize: 18, marginBottom: 3 }}>{p.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: portal === p.id ? GOLD : DIM }}>{p.label}</div>
              <div style={{ fontSize: 10, color: '#4a5f7a' }}>{p.sub}</div>
            </button>
          ))}
        </div>

        <div style={{ padding: 32 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: TEXT }}>
            {portal === 'internal' ? 'Sign in to Saguaro' : portal === 'client' ? 'Client Portal' : 'Subcontractor Portal'}
          </h2>
          <p style={{ margin: '0 0 24px', fontSize: 13, color: DIM }}>
            {portal === 'internal' ? 'Access your construction management platform' : portal === 'client' ? 'View project progress, approve invoices, and more' : 'Submit bids, sign waivers, upload insurance'}
          </p>

          {error && (
            <div style={{ background: 'rgba(192,48,48,.1)', border: '1px solid rgba(192,48,48,.3)', borderRadius: 7, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#ff7070' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com" style={{ width: '100%', padding: '11px 14px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, outline: 'none', transition: 'border-color .15s' }} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" style={{ width: '100%', padding: '11px 14px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, outline: 'none' }} />
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '13px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 8, color: '#0d1117', fontSize: 15, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .7 : 1 }}>
              {loading ? 'Signing in…' : `Sign In to ${portal === 'internal' ? 'Dashboard' : portal === 'client' ? 'Client Portal' : 'Sub Portal'}`}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: DIM }}>
            Don&apos;t have an account?{' '}
            <Link href="/sandbox" style={{ color: GOLD, fontWeight: 700, textDecoration: 'none' }}>Start free sandbox →</Link>
          </div>
          <div style={{ marginTop: 8, textAlign: 'center' }}>
            <Link href="/sandbox" style={{ fontSize: 12, color: '#4a5f7a', textDecoration: 'none' }}>Forgot password</Link>
          </div>
        </div>
      </div>

      {/* Demo login hint */}
      <div style={{ marginTop: 20, background: 'rgba(212,160,23,.06)', border: '1px solid rgba(212,160,23,.2)', borderRadius: 8, padding: '12px 20px', fontSize: 12, color: DIM, textAlign: 'center' }}>
        <strong style={{ color: GOLD }}>Demo Mode:</strong> Enter any email/password to preview · No real account needed
        <br />
        <button onClick={() => { setEmail('demo@saguaro.com'); setPassword('demo123'); }} style={{ marginTop: 6, background: 'none', border: 'none', color: GOLD, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
          Use demo credentials
        </button>
      </div>
    </div>
  );
}
