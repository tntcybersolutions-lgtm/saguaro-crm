'use client';
import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',RED='#ef4444';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

export default function ResetPasswordPage(){
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent){
    e.preventDefault();
    if(password.length < 8){ setError('Password must be at least 8 characters.'); return; }
    if(password !== confirm){ setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      const supabase = getSupabase();
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if(updateErr){ setError(updateErr.message); setLoading(false); return; }
      setDone(true);
      setTimeout(()=>{ window.location.href = '/app'; }, 2000);
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
          {done ? (
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:52,marginBottom:16}}>✅</div>
              <h1 style={{fontSize:22,fontWeight:800,color:TEXT,marginBottom:10}}>Password updated</h1>
              <p style={{color:DIM,fontSize:14}}>Redirecting you to the app…</p>
            </div>
          ) : (
            <>
              <div style={{textAlign:'center',marginBottom:28}}>
                <h1 style={{fontSize:24,fontWeight:800,margin:'0 0 8px',color:TEXT}}>Set new password</h1>
                <p style={{color:DIM,fontSize:14,margin:0}}>Choose a strong password for your account</p>
              </div>
              <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:14,padding:32}}>
                {error&&<div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:13,color:RED}}>⚠️ {error}</div>}
                <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:14}}>
                  <div>
                    <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:6}}>New Password</label>
                    <input type="password" placeholder="8+ characters" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="new-password" style={inputStyle}/>
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:6}}>Confirm Password</label>
                    <input type="password" placeholder="Repeat password" value={confirm} onChange={e=>setConfirm(e.target.value)} required autoComplete="new-password" style={inputStyle}/>
                  </div>
                  <button type="submit" disabled={loading} style={{padding:'13px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:9,color:'#0d1117',fontSize:15,fontWeight:800,cursor:loading?'not-allowed':'pointer'}}>
                    {loading?'Updating…':'Update Password →'}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
