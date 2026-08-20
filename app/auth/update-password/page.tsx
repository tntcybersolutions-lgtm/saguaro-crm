'use client';
/**
 * app/auth/update-password/page.tsx
 *
 * Branded password-reset form. Reached from /auth/callback after the user
 * clicks the email link from Supabase. By the time we get here, the HttpOnly
 * auth cookies are set so supabase.auth.updateUser({ password }) will work.
 *
 * On success, redirect to /app.
 */
import React, { useState, useEffect } from 'react';

const GOLD = '#D4A017';
const DARK = '#0d1117';
const CARD = '#161b22';
const BORDER = '#30363d';
const DIM = '#8B9DB8';
const TEXT = '#e6edf3';
const RED = '#ef4444';
const GREEN = '#22c55e';

export default function UpdatePasswordPage() {
  const [mounted, setMounted] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // /auth/callback set HttpOnly session cookies before redirecting here,
      // so the server-side reset-password route can update the user using
      // supabase.auth.updateUser({ password }) with that session.
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'Failed to update password. Please try again.');
        setLoading(false);
        return;
      }

      setDone(true);
      setTimeout(() => { window.location.href = '/app'; }, 1400);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '13px 46px 13px 16px',
    background: '#0d1117',
    border: `1px solid ${BORDER}`,
    borderRadius: 10, color: TEXT, fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', flexDirection: 'column', fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <nav style={{ padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', borderBottom: `1px solid ${BORDER}`, background: 'rgba(22,27,34,.8)', backdropFilter: 'blur(12px)' }}>
        <a href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 900, fontSize: 16, color: GOLD, letterSpacing: 1 }}>SAGUARO</span>
          <span style={{ fontSize: 11, color: DIM, fontWeight: 600 }}>Control Systems</span>
        </a>
      </nav>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginBottom: 10 }}>Password updated</h1>
              <p style={{ color: DIM, fontSize: 14, lineHeight: 1.6 }}>
                Redirecting you to your dashboard…
              </p>
            </div>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px', color: TEXT }}>Set a new password</h1>
                <p style={{ color: DIM, fontSize: 14, margin: 0 }}>
                  Choose a strong password you haven&apos;t used before.
                </p>
              </div>

              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '36px 32px', boxShadow: '0 12px 40px rgba(0,0,0,.4), 0 0 0 1px rgba(212,160,23,.06)' }}>
                {!mounted ? <div style={{ padding: '40px 0', textAlign: 'center', color: DIM }}>Loading...</div> : <>

                {error && (
                  <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: RED }}>
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>
                      New Password
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPwd ? 'text' : 'password'}
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        autoFocus
                        style={inputStyle}
                      />
                      <button type="button" onClick={() => setShowPwd(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: DIM, fontSize: 11, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: .5 }}>
                        {showPwd ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>
                      Confirm Password
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        placeholder="Type your new password again"
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        style={inputStyle}
                      />
                      <button type="button" onClick={() => setShowConfirm(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: DIM, fontSize: 11, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: .5 }}>
                        {showConfirm ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      padding: '14px',
                      background: loading ? 'rgba(212,160,23,.4)' : `linear-gradient(135deg,#B8860B,${GOLD},#C8960F)`,
                      border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, color: '#fff',
                      fontSize: 15, fontWeight: 800, letterSpacing: .3,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      boxShadow: loading ? 'none' : '0 4px 20px rgba(212,160,23,.2), inset 0 1px 0 rgba(255,255,255,.1)',
                    }}
                  >
                    {loading ? 'Updating…' : 'Update Password →'}
                  </button>
                </form>

                <div style={{ marginTop: 18, textAlign: 'center', fontSize: 12, color: DIM }}>
                  Remembered it?{' '}
                  <a href="/login" style={{ color: GOLD, textDecoration: 'none', fontWeight: 700 }}>Sign in</a>
                </div>
                </>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
