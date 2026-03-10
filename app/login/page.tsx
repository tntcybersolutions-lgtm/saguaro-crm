'use client';
import React, { useState } from 'react';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',RED='#ef4444';

export default function LoginPage(){
  const [form, setForm] = useState({email:'',password:''});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(){
    if(!form.email||!form.password){ setError('Email and password required.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});
      const d = await res.json();
      if(d.error){ setError(d.error); setLoading(false); return; }
      // Set auth cookie for middleware
      const expires = d.expiresAt ? new Date(d.expiresAt * 1000).toUTCString() : '';
      document.cookie = `sb-access-token=${d.accessToken}; path=/; expires=${expires}; SameSite=Lax`;
      document.cookie = `sb-refresh-token=${d.refreshToken}; path=/; SameSite=Lax`;
      const next = new URLSearchParams(window.location.search).get('next') || '/app';
      window.location.href = next;
    } catch(e){ setError('Login failed. Please try again.'); }
    setLoading(false);
  }

  const inputStyle = {width:'100%',padding:'11px 14px',background:'rgba(255,255,255,.04)',border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,outline:'none',boxSizing:'border-box' as const};

  return (
    <div style={{minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{width:'100%',maxWidth:400}}>
        <div style={{textAlign:'center' as const,marginBottom:32}}>
          <a href="/" style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:8,marginBottom:24}}>
            <span style={{fontSize:28}}>🌵</span>
            <span style={{fontWeight:900,fontSize:20,color:GOLD,letterSpacing:1}}>SAGUARO</span>
          </a>
          <h1 style={{fontSize:24,fontWeight:800,margin:'0 0 8px',color:TEXT}}>Welcome back</h1>
          <p style={{color:DIM,fontSize:14,margin:0}}>Sign in to your account</p>
        </div>
        <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:14,padding:32}}>
          {error&&<div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:13,color:RED}}>{error}</div>}
          <div style={{display:'flex',flexDirection:'column' as const,gap:14}}>
            <div>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:6}}>Email</label>
              <input type="email" placeholder="you@company.com" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}
                onKeyDown={e=>e.key==='Enter'&&handleLogin()} style={inputStyle}/>
            </div>
            <div>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <label style={{fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5}}>Password</label>
                <a href="/forgot-password" style={{fontSize:11,color:GOLD,textDecoration:'none'}}>Forgot password?</a>
              </div>
              <input type="password" placeholder="••••••••" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))}
                onKeyDown={e=>e.key==='Enter'&&handleLogin()} style={inputStyle}/>
            </div>
            <button onClick={handleLogin} disabled={loading}
              style={{marginTop:8,padding:'13px 0',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:9,color:'#0d1117',fontSize:15,fontWeight:800,cursor:loading?'wait':'pointer',opacity:loading?.7:1}}>
              {loading?'Signing in...':'Sign In →'}
            </button>
          </div>
          <div style={{marginTop:20,textAlign:'center' as const,fontSize:12,color:DIM}}>
            Don't have an account? <a href="/signup" style={{color:GOLD,textDecoration:'none',fontWeight:700}}>Start free trial</a>
          </div>
        </div>
      </div>
    </div>
  );
}
