'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { Cactus, EnvelopeOpen, Warning } from '@phosphor-icons/react';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='var(--text-secondary)',TEXT='#FFFFFF',RED='#FF3B30',GREEN='#2CFF7A';

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

  const inputStyle = {width:'100%',padding:'11px 14px',background:'#1c1c1e',border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,outline:'none',boxSizing:'border-box' as const};

  return (
    <div style={{minHeight:'100vh',background:DARK,display:'flex',flexDirection:'column'}}>
      <nav style={{padding:'0 24px',height:56,display:'flex',alignItems:'center',borderBottom:`1px solid ${BORDER}`}}>
        <Link href="/" style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:8}}>
          <Cactus size={22} weight="fill" color={GOLD} />
          <span style={{fontWeight:900,fontSize:16,color:GOLD}}>Saguaro</span>
        </Link>
      </nav>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'32px 24px'}}>
        <div style={{width:'100%',maxWidth:400}}>
          {sent ? (
            <div style={{textAlign:'center'}}>
              <div style={{marginBottom:16}}><EnvelopeOpen size={52} weight="duotone" color={GOLD} /></div>
              <h1 style={{fontSize:22,fontWeight:800,color:TEXT,marginBottom:10}}>Check Your Email</h1>
              <p style={{color:DIM,fontSize:14,lineHeight:1.6,marginBottom:24}}>We sent a password reset link to <strong style={{color:TEXT}}>{email}</strong>.</p>
              <Link href="/login" style={{display:'block',padding:'12px',background:`linear-gradient(135deg,${GOLD},var(--brand-primary-strong))`,borderRadius:9,color:'#0A0A00',fontWeight:800,fontSize:14,textDecoration:'none',textAlign:'center'}}>Back to Login</Link>
            </div>
          ) : (
            <>
              <div style={{textAlign:'center',marginBottom:28}}>
                <h1 style={{fontSize:24,fontWeight:800,margin:'0 0 8px',color:TEXT}}>Reset Your Password</h1>
                <p style={{color:DIM,fontSize:14,margin:0}}>Enter your email and we'll send a reset link.</p>
              </div>
              <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:14,padding:32}}>
                {error&&<div style={{background:'rgba(255,59,48,.1)',border:'1px solid rgba(255,59,48,.3)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:13,color:RED}}><Warning size={14} weight="fill" style={{verticalAlign:'middle'}} /> {error}</div>}
                <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:14}}>
                  <div>
                    <label style={{display:'block',fontSize:12,fontWeight:700,color:DIM,marginBottom:6}}>Work Email</label>
                    <input type="email" placeholder="you@company.com" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" style={inputStyle}/>
                  </div>
                  <button type="submit" disabled={loading} style={{padding:'13px',background:`linear-gradient(135deg,${GOLD},var(--brand-primary-strong))`,border:'none',borderRadius:9,color:'#0A0A00',fontSize:15,fontWeight:800,cursor:loading?'not-allowed':'pointer'}}>
                    {loading?'Sending…':'Send Reset Link →'}
                  </button>
                </form>
                <div style={{marginTop:18,textAlign:'center',fontSize:12,color:DIM}}>
                  Remember it? <Link href="/login" style={{color:GOLD,textDecoration:'none',fontWeight:700}}>Sign In</Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
