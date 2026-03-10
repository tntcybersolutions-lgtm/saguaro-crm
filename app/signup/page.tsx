'use client';
import React, { useState } from 'react';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',RED='#ef4444';

export default function SignupPage(){
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({email:'',password:'',company:'',phone:'',role:'General Contractor',state:'AZ',size:'1-10'});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function update(k:string,v:string){ setForm(p=>({...p,[k]:v})); }

  async function handleSubmit(){
    if(!form.email||!form.password||!form.company){ setError('Email, password, and company name are required.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});
      const d = await res.json();
      if(d.error){ setError(d.error); setLoading(false); return; }
      if(d.accessToken){
        const expires = d.expiresAt ? new Date(d.expiresAt * 1000).toUTCString() : '';
        document.cookie = `sb-access-token=${d.accessToken}; path=/; expires=${expires}; SameSite=Lax`;
        document.cookie = `sb-refresh-token=${d.refreshToken}; path=/; SameSite=Lax`;
      }
      window.location.href = '/onboarding/step-1';
    } catch(e){ setError('Signup failed. Please try again.'); }
    setLoading(false);
  }

  const inputStyle = {width:'100%',padding:'10px 14px',background:'rgba(255,255,255,.04)',border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,outline:'none',boxSizing:'border-box' as const};
  const labelStyle = {display:'block' as const,fontSize:11,fontWeight:700 as const,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:6};

  return (
    <div style={{minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{width:'100%',maxWidth:460}}>
        <div style={{textAlign:'center' as const,marginBottom:32}}>
          <a href="/" style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:8,marginBottom:24}}>
            <span style={{fontSize:28}}>🌵</span>
            <span style={{fontWeight:900,fontSize:20,color:GOLD,letterSpacing:1}}>SAGUARO</span>
          </a>
          <h1 style={{fontSize:26,fontWeight:800,margin:'0 0 8px',color:TEXT}}>Start your free trial</h1>
          <p style={{color:DIM,fontSize:14,margin:0}}>30 days free · No credit card · Cancel anytime</p>
        </div>

        <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:14,padding:32}}>
          {error&&<div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:13,color:RED}}>{error}</div>}

          <div style={{display:'flex',flexDirection:'column' as const,gap:16}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div>
                <label style={labelStyle}>Work Email *</label>
                <input type="email" placeholder="you@company.com" value={form.email} onChange={e=>update('email',e.target.value)} style={inputStyle}/>
              </div>
              <div>
                <label style={labelStyle}>Password *</label>
                <input type="password" placeholder="8+ characters" value={form.password} onChange={e=>update('password',e.target.value)} style={inputStyle}/>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Company Name *</label>
              <input placeholder="Acme Construction LLC" value={form.company} onChange={e=>update('company',e.target.value)} style={inputStyle}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div>
                <label style={labelStyle}>Phone</label>
                <input type="tel" placeholder="(480) 555-0100" value={form.phone} onChange={e=>update('phone',e.target.value)} style={inputStyle}/>
              </div>
              <div>
                <label style={labelStyle}>State</label>
                <select value={form.state} onChange={e=>update('state',e.target.value)} style={{...inputStyle}}>
                  {['AZ','CA','TX','NV','CO','FL','WA','OR','UT','NM','OTHER'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div>
                <label style={labelStyle}>Company Type</label>
                <select value={form.role} onChange={e=>update('role',e.target.value)} style={{...inputStyle}}>
                  {['General Contractor','Electrical','Plumbing','Mechanical / HVAC','Concrete','Roofing','Specialty Contractor','Developer / Owner','Other'].map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Team Size</label>
                <select value={form.size} onChange={e=>update('size',e.target.value)} style={{...inputStyle}}>
                  {['1-10','11-25','26-50','51-100','100+'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <button onClick={handleSubmit} disabled={loading}
              style={{marginTop:8,padding:'13px 0',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:9,color:'#0d1117',fontSize:15,fontWeight:800,cursor:loading?'wait':'pointer',opacity:loading?.7:1}}>
              {loading?'Creating your account...':'Start Free Trial →'}
            </button>
          </div>

          <div style={{marginTop:20,textAlign:'center' as const,fontSize:12,color:DIM}}>
            Already have an account? <a href="/login" style={{color:GOLD,textDecoration:'none',fontWeight:700}}>Log in</a>
          </div>
          <div style={{marginTop:12,textAlign:'center' as const,fontSize:11,color:'#4a5f7a'}}>
            By signing up you agree to our <a href="/terms" style={{color:DIM}}>Terms of Service</a> and <a href="/privacy" style={{color:DIM}}>Privacy Policy</a>
          </div>
        </div>
      </div>
    </div>
  );
}
