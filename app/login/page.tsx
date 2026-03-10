'use client';
import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',RED='#ef4444';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const HAS_SUPABASE = !!(SUPABASE_URL && SUPABASE_URL !== 'https://demo.supabase.co' && SUPABASE_KEY);

function getSupabase() {
  return createClient(SUPABASE_URL!, SUPABASE_KEY!);
}

export default function LoginPage(){
  const [form, setForm] = useState({email:'',password:''});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e?: React.FormEvent){
    e?.preventDefault();
    if(!form.email||!form.password){ setError('Email and password are required.'); return; }
    setLoading(true); setError('');
    try {
      // Demo mode — Supabase not configured, go straight to the app
      if (!HAS_SUPABASE) {
        const next = new URLSearchParams(window.location.search).get('next') || '/app';
        window.location.href = next;
        return;
      }
      const supabase = getSupabase();
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: form.email.toLowerCase().trim(),
        password: form.password,
      });
      if (authErr || !data.session) {
        setError('Invalid email or password. Please try again.');
        setLoading(false);
        return;
      }
      // Set cookie so middleware can verify auth on /app/* routes
      const { access_token, refresh_token, expires_at } = data.session;
      const exp = expires_at ? new Date(expires_at * 1000).toUTCString() : '';
      document.cookie = `sb-access-token=${access_token}; path=/; expires=${exp}; SameSite=Lax`;
      document.cookie = `sb-refresh-token=${refresh_token}; path=/; SameSite=Lax`;
      const next = new URLSearchParams(window.location.search).get('next') || '/app';
      window.location.href = next;
    } catch(e){
      setError('Login failed. Please check your connection and try again.');
    }
    setLoading(false);
  }

  const inputStyle = {width:'100%',padding:'11px 14px',background:'rgba(255,255,255,.04)',border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,outline:'none',boxSizing:'border-box' as const,transition:'border-color .15s'};
  const labelStyle = {display:'block' as const,fontSize:11,fontWeight:700 as const,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:6};

  return (
    <div style={{minHeight:'100vh',background:DARK,display:'flex',flexDirection:'column'}}>
      {/* Top nav bar */}
      <nav style={{padding:'0 24px',height:56,display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`1px solid ${BORDER}`}}>
        <a href="/" style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:22}}>🌵</span>
          <span style={{fontWeight:900,fontSize:16,color:GOLD,letterSpacing:1}}>SAGUARO</span>
        </a>
        <a href="/signup" style={{fontSize:13,color:DIM,textDecoration:'none',fontWeight:600}}>No account? <span style={{color:GOLD}}>Start free trial →</span></a>
      </nav>

      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'32px 24px'}}>
        <div style={{width:'100%',maxWidth:400}}>
          <div style={{textAlign:'center' as const,marginBottom:28}}>
            <h1 style={{fontSize:24,fontWeight:800,margin:'0 0 8px',color:TEXT}}>Welcome back</h1>
            <p style={{color:DIM,fontSize:14,margin:0}}>Sign in to your Saguaro account</p>
          </div>

          <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:14,padding:32}}>
            {error&&(
              <div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:13,color:RED,display:'flex',alignItems:'flex-start',gap:8}}>
                <span>⚠️</span><span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} style={{display:'flex',flexDirection:'column' as const,gap:14}}>
              <div>
                <label style={labelStyle}>Email</label>
                <input type="email" placeholder="you@company.com" value={form.email}
                  onChange={e=>setForm(p=>({...p,email:e.target.value}))}
                  autoComplete="email" required style={inputStyle}/>
              </div>
              <div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                  <label style={{...labelStyle,marginBottom:0}}>Password</label>
                  <a href="/forgot-password" style={{fontSize:11,color:GOLD,textDecoration:'none',fontWeight:600}}>Forgot password?</a>
                </div>
                <input type="password" placeholder="••••••••" value={form.password}
                  onChange={e=>setForm(p=>({...p,password:e.target.value}))}
                  autoComplete="current-password" required style={inputStyle}/>
              </div>
              <button type="submit" disabled={loading}
                style={{marginTop:8,padding:'13px 0',background:loading?'rgba(212,160,23,.5)':`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:9,color:'#0d1117',fontSize:15,fontWeight:800,cursor:loading?'not-allowed':'pointer',transition:'opacity .15s'}}>
                {loading?'Signing in…':'Sign In →'}
              </button>
            </form>

            <div style={{marginTop:20,textAlign:'center' as const,fontSize:12,color:DIM}}>
              Don't have an account? <a href="/signup" style={{color:GOLD,textDecoration:'none',fontWeight:700}}>Start free trial</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
