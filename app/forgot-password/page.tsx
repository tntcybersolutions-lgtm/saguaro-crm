'use client';
import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',RED='#ef4444',GREEN='#22c55e';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

export default function ForgotPasswordPage(){
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent){
    e.preventDefault();
    if(!email){ setError('Email is required.'); return; }
    setLoading(true); setError('');
    try {
      const supabase = getSupabase();
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if(resetErr){ setError(resetErr.message); setLoading(false); return; }
      setSent(true);
    } catch { setError('Something went wrong. Please try again.'); }
    setLoading(false);
  }

  const inputStyle = {width:'100%',padding:'11px 14px',background:'rgba(255,255,255,.04)',border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,outline:'none',boxSizing:'border-box' as const};

  return (
    <div style={{minHeight:'100vh',background:DARK,display:'flex',flexDirection:'column'}}>
      <nav style={{padding:'0 24px',height:56,display:'flex',alignItems:'center',borderBottom:`1px solid ${BORDER}`}}>
        <a href="/" style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:22}}>🌵</span>
          <span style={{fontWeight:900,fontSize:16,color:GOLD,letterSpacing:1}}>SAGUARO</span>
        </a>
      </nav>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'32px 24px'}}>
        <div style={{width:'100%',maxWidth:400}}>
          {sent ? (
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:52,marginBottom:16}}>📬</div>
              <h1 style={{fontSize:22,fontWeight:800,color:TEXT,marginBottom:10}}>Check your email</h1>
              <p style={{color:DIM,fontSize:14,lineHeight:1.6,marginBottom:24}}>We sent a password reset link to <strong style={{color:TEXT}}>{email}</strong>.</p>
              <a href="/login" style={{display:'block',padding:'12px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,borderRadius:9,color:'#0d1117',fontWeight:800,fontSize:14,textDecoration:'none',textAlign:'center'}}>Back to Login</a>
            </div>
          ) : (
            <>
              <div style={{textAlign:'center',marginBottom:28}}>
                <h1 style={{fontSize:24,fontWeight:800,margin:'0 0 8px',color:TEXT}}>Reset your password</h1>
                <p style={{color:DIM,fontSize:14,margin:0}}>Enter your email and we'll send a reset link</p>
              </div>
              <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:14,padding:32}}>
                {error&&<div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:13,color:RED}}>⚠️ {error}</div>}
                <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:14}}>
                  <div>
                    <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:6}}>Work Email</label>
                    <input type="email" placeholder="you@company.com" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" style={inputStyle}/>
                  </div>
                  <button type="submit" disabled={loading} style={{padding:'13px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:9,color:'#0d1117',fontSize:15,fontWeight:800,cursor:loading?'not-allowed':'pointer'}}>
                    {loading?'Sending…':'Send Reset Link →'}
                  </button>
                </form>
                <div style={{marginTop:18,textAlign:'center',fontSize:12,color:DIM}}>
                  Remember it? <a href="/login" style={{color:GOLD,textDecoration:'none',fontWeight:700}}>Sign in</a>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
