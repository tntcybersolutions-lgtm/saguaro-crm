'use client';
/**
 * Login — Pass 4 on the kit. Same flow as before: hash-token confirmation,
 * POST /api/auth/session, then land a sales-only rep on /app/sales.
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { CheckCircle, WarningCircle, Eye, EyeSlash, Lock } from '@phosphor-icons/react';
import { Card, Field, Input, Button } from '@/components/ui/kit';

const CSS = `
.lgPage { min-height: 100vh; background: var(--bg-base); display: flex; flex-direction: column; }
.lgNav { padding: env(safe-area-inset-top, 0px) 24px 0; box-sizing: content-box; height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--border-subtle); }
.lgBrand { text-decoration: none; display: inline-flex; align-items: center; gap: 10px; }
.lgBrand img { height: 36px; width: auto; object-fit: contain; border-radius: 4px; }
.lgBrandName { font-weight: 900; font-size: 15px; letter-spacing: -0.01em; color: var(--text-primary); line-height: 1.15; white-space: nowrap; }
.lgBrandSub { font-size: 12px; color: var(--text-tertiary); letter-spacing: .5px; font-weight: 600; white-space: nowrap; }
.lgNavLink { font-size: var(--fs-sm); color: var(--text-tertiary); text-decoration: none; font-weight: 600; white-space: nowrap; min-height: 44px; display: inline-flex; align-items: center; }
.lgNavLink b { color: var(--link); }
/* A phone keeps the header on one line: the brand drops its second line and
   the trial link drops its lead-in. */
@media (max-width: 480px) { .lgNav { padding-left: 16px; padding-right: 16px; } .lgBrandSub, .lgNavPre { display: none; } }
.lgNavLink b { color: var(--link); }
.lgMain { flex: 1; display: flex; align-items: center; justify-content: center; padding: 32px 16px; }
.lgWrap { width: 100%; max-width: 420px; }
.lgHead { text-align: center; margin-bottom: 24px; }
.lgHead img { height: 56px; width: auto; object-fit: contain; border-radius: 6px; margin-bottom: 14px; }
.lgHead h1 { font-size: var(--fs-title); font-weight: 800; letter-spacing: -0.02em; margin: 0 0 6px; color: var(--title-page); }
.lgHead p { color: var(--text-tertiary); font-size: var(--fs-md); margin: 0; }
.lgForm { display: flex; flex-direction: column; gap: 14px; }
.lgMsg { display: flex; align-items: flex-start; gap: 8px; padding: 10px 14px; border-radius: var(--radius-sm); font-size: var(--fs-sm); margin-bottom: 16px; }
.lgMsg > svg { flex-shrink: 0; margin-top: 1px; }
.lgMsg[data-tone="good"] { background: rgba(74,222,128,.10); border: 1px solid rgba(74,222,128,.3); color: var(--status-ongoing); }
.lgMsg[data-tone="bad"] { background: rgba(248,113,113,.08); border: 1px solid rgba(248,113,113,.35); color: var(--status-overdue); }
.lgPwdWrap { position: relative; }
.lgPwdWrap .k-input { padding-right: 44px; }
.lgPwdToggle { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); }
.lgLabelRow { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.lgLabelRow a { font-size: var(--fs-xs); color: var(--link); text-decoration: none; font-weight: 600; }
.lgRemember { display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; font-size: var(--fs-sm); color: var(--text-secondary); min-height: 32px; }
.lgRemember input { width: 16px; height: 16px; accent-color: var(--brand-primary); cursor: pointer; }
.lgFoot { margin-top: 14px; text-align: center; font-size: var(--fs-sm); color: var(--text-tertiary); }
.lgFoot a { color: var(--link); text-decoration: none; font-weight: 700; }
.lgTrust { margin-top: 20px; display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; font-size: 12px; color: var(--text-tertiary); font-weight: 600; }
.lgTrust span { display: inline-flex; align-items: center; gap: 4px; }
.lgSubmit { width: 100%; justify-content: center; min-height: 44px; }
@media (max-width: 640px) { .lgPage .k-btn, .lgPage .k-input { min-height: 44px; } }
`;

export default function LoginPage(){
  const [form, setForm] = useState({email:'',password:''});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);

  React.useEffect(() => {
    // Handle implicit flow: Supabase puts tokens in the URL hash fragment.
    // The server-side /auth/callback can't read the hash, so it redirects here
    // with ?error=missing_code. We detect the hash tokens and set the session.
    const hash = window.location.hash.slice(1);
    if (hash) {
      const hp = new URLSearchParams(hash);
      const access_token = hp.get('access_token');
      const refresh_token = hp.get('refresh_token');
      const expires_at = hp.get('expires_at');
      if (access_token && refresh_token) {
        setInfo('Confirming your account…');
        fetch('/api/auth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token, refresh_token, expires_at: expires_at ? Number(expires_at) : undefined }),
        }).then(res => {
          if (res.ok) {
            const next = new URLSearchParams(window.location.search).get('next') || '/app';
            window.location.replace(next);
          } else {
            setError('Confirmation failed. Please try signing in or request a new link.');
          }
        }).catch(() => {
          setError('Confirmation failed. Please check your connection and try again.');
        });
        return;
      }
    }

    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    const msg = params.get('message');
    if (err === 'confirmation_failed') setError('The confirmation link expired or was already used. Please request a new one.');
    if (err === 'missing_code') setError('Invalid confirmation link. Please try signing up again.');
    if (msg === 'confirmed') setInfo('Email confirmed. You can now sign in.');
  }, []);

  async function handleLogin(e?: React.FormEvent){
    e?.preventDefault();
    if(!form.email||!form.password){ setError('Email and password are required.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password, remember }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed. Please try again.');
        setLoading(false);
        return;
      }

      // Success. An explicit ?next= (a deep link they were sent to) always wins.
      const explicitNext = new URLSearchParams(window.location.search).get('next');
      if (explicitNext) { window.location.href = explicitNext; return; }

      // Otherwise land a sales-ONLY rep on their own workspace, not the GC's
      // build dashboard (MUST-PASS sales workspace P2). "Sales only" = can sell
      // but holds neither Budget nor Admin — i.e. the Salesperson role, never an
      // owner/admin who also sells (they keep the full dashboard). Permissions
      // decide it, not a role string, so a custom role lands correctly too.
      let dest = '/app';
      try {
        const pr = await fetch('/api/auth/permissions');
        if (pr.ok) {
          const pd = await pr.json();
          const perms = (pd?.permissions ?? {}) as Record<string, string>;
          const held = (c: string) => String(perms[c] ?? 'None') !== 'None';
          if (held('Sales') && !held('Budget') && !held('Admin')) dest = '/app/sales';
        }
      } catch { /* any trouble resolving the role → the normal dashboard */ }
      window.location.href = dest;
    } catch {
      setError('Login failed. Please check your connection and try again.');
    }
    setLoading(false);
  }

  return (
    <div className="lgPage">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {/* Top nav — pushed below the notch / status bar in the iOS app (viewport-fit=cover). */}
      <nav className="lgNav">
        <Link href="/" className="lgBrand" aria-label="Saguaro Control Systems — home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-full.jpg" alt="Saguaro Control Systems" />
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="lgBrandName">Saguaro</span>
            <span className="lgBrandSub">Control Systems</span>
          </span>
        </Link>
        <Link href="/signup" className="lgNavLink"><span className="lgNavPre">No account?&nbsp;</span><b>Start Free Trial →</b></Link>
      </nav>

      <div className="lgMain">
        <div className="lgWrap">
          <div className="lgHead">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-full.jpg" alt="Saguaro Control Systems" />
            <h1>Welcome Back</h1>
            <p>Sign in to your Saguaro account.</p>
          </div>

          <Card>
            {info && <div className="lgMsg" data-tone="good" role="status"><CheckCircle size={15} weight="fill" /><span>{info}</span></div>}
            {error && <div className="lgMsg" data-tone="bad" role="alert"><WarningCircle size={15} weight="fill" /><span>{error}</span></div>}

            <form onSubmit={handleLogin} className="lgForm">
              <Field label="Email Address" required>
                <Input
                  id="login-email"
                  name="email"
                  type="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={e=>setForm(p=>({...p,email:e.target.value}))}
                  autoComplete="username"
                  required
                />
              </Field>

              <Field label="Password" required hint={<span className="lgLabelRow"><span>Press Enter to sign in.</span><Link href="/forgot-password">Forgot Password?</Link></span>}>
                <div className="lgPwdWrap">
                  <Input
                    id="login-password"
                    name="password"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={e=>setForm(p=>({...p,password:e.target.value}))}
                    autoComplete="current-password"
                    required
                  />
                  <div className="lgPwdToggle">
                    <Button type="button" variant="ghost" size="sm" tabIndex={-1} icon={showPwd ? <EyeSlash size={17} /> : <Eye size={17} />} aria-label={showPwd ? 'Hide password' : 'Show password'} onClick={()=>setShowPwd(p=>!p)} />
                  </div>
                </div>
              </Field>

              <label className="lgRemember">
                <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} />
                <span>Remember me on this device</span>
              </label>

              <Button type="submit" variant="primary" className="lgSubmit" disabled={loading}>{loading ? 'Signing in…' : 'Sign In →'}</Button>
            </form>

            <div className="lgFoot">Don't have an account? <Link href="/signup">Start Free Trial</Link></div>
          </Card>

          {/* Trust badges */}
          <div className="lgTrust">
            {['256-Bit SSL','Encrypted at Rest','99.9% Uptime'].map(badge => (
              <span key={badge}><Lock size={12} weight="fill" />{badge}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
