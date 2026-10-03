'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { CheckCircle, WarningCircle, Eye, EyeSlash, Check, Lock } from '@phosphor-icons/react';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='#D4D4D8',TEXT='#FFFFFF',RED='#FF3B30';

export default function LoginPage(){
  const [form, setForm] = useState({email:'',password:''});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [focused, setFocused] = useState<string|null>(null);

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

  const inputStyle = (field: string): React.CSSProperties => ({
    width:'100%',
    padding:'10px 13px',
    paddingRight: field === 'password' ? 44 : 13,
    background:'#1c1c1e',
    border:`1px solid ${focused === field ? GOLD : BORDER}`,
    borderRadius:8,
    color:TEXT,
    fontSize:14,
    outline:'none',
    boxSizing:'border-box',
    transition:'border-color .2s, box-shadow .2s',
    boxShadow: focused === field ? '0 0 0 3px var(--brand-primary-12)' : 'none',
  });
  const labelStyle: React.CSSProperties = {display:'block',fontSize:12,fontWeight:700,color:DIM,marginBottom:6};

  return (
    <div style={{minHeight:'100vh',background:DARK,display:'flex',flexDirection:'column'}}>
      {/* Top nav */}
      {/* Pushed below the notch / status bar in the iOS app (viewport-fit=cover). */}
      <nav style={{padding:'env(safe-area-inset-top, 0px) 24px 0',boxSizing:'content-box',height:56,display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`1px solid ${BORDER}`}}>
        <Link href="/" style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:10}} aria-label="Saguaro Control Systems — home">
          <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{height:36,width:'auto',objectFit:'contain',borderRadius:4}} />
          <span style={{display:'flex',flexDirection:'column',lineHeight:1.15}}>
            <span style={{fontWeight:900,fontSize:15,letterSpacing:'-0.01em',background:`linear-gradient(90deg,${GOLD},var(--brand-primary-strong))`,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Saguaro</span>
            <span style={{fontSize:10,color:DIM,letterSpacing:.5,fontWeight:600}}>Control Systems</span>
          </span>
        </Link>
        <Link href="/signup" style={{fontSize:13,color:DIM,textDecoration:'none',fontWeight:600}}>No account? <span style={{color:GOLD}}>Start Free Trial →</span></Link>
      </nav>

      {/* Main content */}
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'32px 24px'}}>
        <div style={{width:'100%',maxWidth:420}}>
          {/* Header */}
          <div style={{textAlign:'center',marginBottom:28}}>
            <div style={{display:'flex',justifyContent:'center',marginBottom:16}}>
              <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{height:56,width:'auto',objectFit:'contain',borderRadius:6}} />
            </div>
            <h1 style={{fontSize:22,fontWeight:700,letterSpacing:'-0.02em',margin:'0 0 6px',color:TEXT}}>Welcome Back</h1>
            <p style={{color:DIM,fontSize:14,margin:0}}>Sign in to your Saguaro account.</p>
          </div>

          {/* Card */}
          <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:'var(--radius-lg)',padding:'32px 28px',boxShadow:'var(--shadow-lg)'}}>
            {info&&(
              <div style={{background:'rgba(44,255,122,.1)',border:'1px solid rgba(44,255,122,.3)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:13,color:'#2CFF7A',display:'flex',alignItems:'flex-start',gap:8}}>
                <CheckCircle size={15} weight="fill" style={{flexShrink:0,marginTop:1}} /><span>{info}</span>
              </div>
            )}
            {error&&(
              <div style={{background:'rgba(255,59,48,.1)',border:'1px solid rgba(255,59,48,.3)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:13,color:RED,display:'flex',alignItems:'flex-start',gap:8}}>
                <WarningCircle size={15} weight="fill" style={{flexShrink:0,marginTop:1}} /><span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} style={{display:'flex',flexDirection:'column',gap:16}}>
              {/* Email */}
              <div>
                <label htmlFor="login-email" style={labelStyle}>Email Address</label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={e=>setForm(p=>({...p,email:e.target.value}))}
                  onFocus={()=>setFocused('email')}
                  onBlur={()=>setFocused(null)}
                  autoComplete="username"
                  required
                  style={inputStyle('email')}
                />
              </div>

              {/* Password */}
              <div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                  <label htmlFor="login-password" style={{...labelStyle,marginBottom:0}}>Password</label>
                  <Link href="/forgot-password" style={{fontSize:11,color:GOLD,textDecoration:'none',fontWeight:600}}>Forgot Password?</Link>
                </div>
                <div style={{position:'relative'}}>
                  <input
                    id="login-password"
                    name="password"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={e=>setForm(p=>({...p,password:e.target.value}))}
                    onFocus={()=>setFocused('password')}
                    onBlur={()=>setFocused(null)}
                    autoComplete="current-password"
                    required
                    style={inputStyle('password')}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={()=>setShowPwd(p=>!p)}
                    style={{
                      position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',
                      background:'none',border:'none',color:DIM,cursor:'pointer',
                      fontSize:16,padding:'4px 6px',lineHeight:1,
                      transition:'color .15s',
                    }}
                    onMouseEnter={e=>(e.currentTarget.style.color=TEXT)}
                    onMouseLeave={e=>(e.currentTarget.style.color=DIM)}
                    aria-label={showPwd ? 'Hide password' : 'Show password'}
                  >
                    {showPwd ? <EyeSlash size={17} weight="regular" /> : <Eye size={17} weight="regular" />}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',userSelect:'none'}}>
                <div
                  onClick={()=>setRemember(p=>!p)}
                  style={{
                    width:16,height:16,borderRadius:4,
                    border:`1.5px solid ${remember ? GOLD : BORDER}`,
                    background: remember ? GOLD : 'transparent',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    transition:'all .15s',cursor:'pointer',flexShrink:0,
                  }}
                >
                  {remember && <Check size={11} weight="bold" color="#0A0A00" />}
                </div>
                <span style={{fontSize:12,color:DIM,fontWeight:500}}>Remember me on this device</span>
              </label>

              {/* Submit */}
              <button type="submit" disabled={loading}
                style={{
                  marginTop:4,padding:'11px 0',
                  background:loading?'color-mix(in srgb, var(--brand-primary) 50%, transparent)':'linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover))',
                  border:'none',borderRadius:'var(--radius-md)',color:'#0A0A00',fontSize:14,fontWeight:700,letterSpacing:'0.01em',
                  cursor:loading?'not-allowed':'pointer',transition:'background .18s, box-shadow .18s, transform .12s',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                  boxShadow:loading?'none':'0 4px 14px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)',
                }}
              >
                {loading && (
                  <span style={{
                    display:'inline-block',width:16,height:16,
                    border:'2px solid #E5E5EA',borderTopColor:'var(--brand-primary)',
                    borderRadius:'50%',animation:'spin .6s linear infinite',
                  }}/>
                )}
                {loading?'Signing in…':'Sign In →'}
              </button>
            </form>

            {/* Hint */}
            <div style={{marginTop:12,textAlign:'center',fontSize:11,color:'rgba(203,213,225,0.6)'}}>
              Press Enter to sign in.
            </div>

            <div style={{marginTop:16,textAlign:'center',fontSize:12,color:DIM}}>
              Don't have an account? <Link href="/signup" style={{color:GOLD,textDecoration:'none',fontWeight:700}}>Start Free Trial</Link>
            </div>
          </div>

          {/* Trust badges */}
          <div style={{marginTop:20,textAlign:'center',display:'flex',justifyContent:'center',gap:20,flexWrap:'wrap'}}>
            {['256-Bit SSL','Encrypted at Rest','99.9% Uptime'].map(badge => (
              <span key={badge} style={{fontSize:10,color:'rgba(203,213,225,0.6)',fontWeight:600}}>
                <Lock size={10} weight="fill" style={{verticalAlign:-1,marginRight:4}} />{badge}
              </span>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
