'use client';
import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',RED='#ef4444',GREEN='#22c55e';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const HAS_SUPABASE = !!(SUPABASE_URL && SUPABASE_URL !== 'https://demo.supabase.co' && SUPABASE_KEY);

function getSupabase() {
  return createClient(SUPABASE_URL!, SUPABASE_KEY!);
}

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

export default function SignupPage(){
  const [form, setForm] = useState({email:'',password:'',company:'',phone:'',role:'General Contractor',state:'AZ',size:'1-10'});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  function update(k:string,v:string){ setForm(p=>({...p,[k]:v})); }

  async function handleSubmit(e: React.FormEvent){
    e.preventDefault();
    if(!form.email||!form.password||!form.company){ setError('Email, password, and company name are required.'); return; }
    if(form.password.length < 8){ setError('Password must be at least 8 characters.'); return; }
    setLoading(true); setError('');
    try {
      // Demo mode — Supabase not configured, go straight to the app
      if (!HAS_SUPABASE) {
        window.location.href = '/app';
        return;
      }
      const supabase = getSupabase();
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: form.email.toLowerCase().trim(),
        password: form.password,
        options: {
          data: {
            company_name: form.company,
            phone: form.phone,
            role: form.role,
            state: form.state,
            company_size: form.size,
          },
        },
      });
      if (signUpErr) {
        if (signUpErr.message.toLowerCase().includes('already registered') || signUpErr.message.toLowerCase().includes('already exists') || signUpErr.message.toLowerCase().includes('user already')) {
          setError('An account with this email already exists. Please log in instead.');
        } else {
          setError(signUpErr.message);
        }
        setLoading(false);
        return;
      }
      // If session exists, user is auto-confirmed — set cookie and go to app
      if (data.session) {
        const { access_token, refresh_token, expires_at } = data.session;
        const exp = expires_at ? new Date(expires_at * 1000).toUTCString() : '';
        document.cookie = `sb-access-token=${access_token}; path=/; expires=${exp}; SameSite=Lax`;
        document.cookie = `sb-refresh-token=${refresh_token}; path=/; SameSite=Lax`;
        window.location.href = '/app';
        return;
      }
      // Otherwise email confirmation required
      setSuccess(true);
    } catch(e){
      setError('Signup failed. Please check your connection and try again.');
    }
    setLoading(false);
  }

  const inputStyle = {width:'100%',padding:'11px 14px',background:'rgba(255,255,255,.04)',border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,outline:'none',boxSizing:'border-box' as const,transition:'border-color .15s'};
  const labelStyle = {display:'block' as const,fontSize:11,fontWeight:700 as const,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:6};

  if(success) return (
    <div style={{minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{width:'100%',maxWidth:420,textAlign:'center'}}>
        <div style={{fontSize:56,marginBottom:20}}>📬</div>
        <h1 style={{fontSize:24,fontWeight:800,color:TEXT,marginBottom:12}}>Check your email</h1>
        <p style={{color:DIM,fontSize:15,lineHeight:1.6,marginBottom:24}}>
          We sent a confirmation link to <strong style={{color:TEXT}}>{form.email}</strong>.<br/>
          Click it to activate your account and start your free trial.
        </p>
        <div style={{background:'rgba(34,197,94,.08)',border:'1px solid rgba(34,197,94,.25)',borderRadius:10,padding:'16px 20px',marginBottom:24}}>
          <div style={{fontSize:13,color:GREEN}}>✅ 30-day free trial · No credit card required · Cancel anytime</div>
        </div>
        <a href="/login" style={{display:'block',padding:'12px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,borderRadius:9,color:'#0d1117',fontWeight:800,fontSize:14,textDecoration:'none'}}>
          Go to Login →
        </a>
        <p style={{marginTop:16,fontSize:12,color:DIM}}>Didn't get it? Check spam or <button onClick={()=>setSuccess(false)} style={{background:'none',border:'none',color:GOLD,cursor:'pointer',fontSize:12,fontWeight:700}}>try again</button></p>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:'100vh',background:DARK,display:'flex',flexDirection:'column'}}>
      {/* Top nav bar */}
      <nav style={{padding:'0 24px',height:56,display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`1px solid ${BORDER}`}}>
        <a href="/" style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:22}}>🌵</span>
          <span style={{fontWeight:900,fontSize:16,color:GOLD,letterSpacing:1}}>SAGUARO</span>
        </a>
        <a href="/login" style={{fontSize:13,color:DIM,textDecoration:'none',fontWeight:600}}>Already have an account? <span style={{color:GOLD}}>Sign in →</span></a>
      </nav>

      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'32px 24px'}}>
        <div style={{width:'100%',maxWidth:480}}>
          <div style={{textAlign:'center' as const,marginBottom:28}}>
            <h1 style={{fontSize:26,fontWeight:800,margin:'0 0 8px',color:TEXT}}>Start your free trial</h1>
            <p style={{color:DIM,fontSize:14,margin:0}}>30 days free · No credit card · Cancel anytime</p>
          </div>

          <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:14,padding:32}}>
            {error&&(
              <div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:13,color:RED,display:'flex',alignItems:'flex-start',gap:8}}>
                <span>⚠️</span><span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column' as const,gap:16}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',gap:14}}>
                <div>
                  <label style={labelStyle}>Work Email *</label>
                  <input type="email" placeholder="you@company.com" value={form.email} onChange={e=>update('email',e.target.value)} required autoComplete="email" style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>Password *</label>
                  <input type="password" placeholder="8+ characters" value={form.password} onChange={e=>update('password',e.target.value)} required autoComplete="new-password" style={inputStyle}/>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Company Name *</label>
                <input placeholder="Acme Construction LLC" value={form.company} onChange={e=>update('company',e.target.value)} required style={inputStyle}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',gap:14}}>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input type="tel" placeholder="(480) 555-0100" value={form.phone} onChange={e=>update('phone',e.target.value)} autoComplete="tel" style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>State</label>
                  <select value={form.state} onChange={e=>update('state',e.target.value)} style={{...inputStyle}}>
                    {US_STATES.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',gap:14}}>
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

              <button type="submit" disabled={loading}
                style={{marginTop:8,padding:'13px 0',background:loading?'rgba(212,160,23,.5)':`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:9,color:'#0d1117',fontSize:15,fontWeight:800,cursor:loading?'not-allowed':'pointer',transition:'opacity .15s'}}>
                {loading?'Creating your account…':'Start Free Trial →'}
              </button>
            </form>

            <div style={{marginTop:20,textAlign:'center' as const,fontSize:12,color:DIM}}>
              Already have an account? <a href="/login" style={{color:GOLD,textDecoration:'none',fontWeight:700}}>Log in</a>
            </div>
            <div style={{marginTop:10,textAlign:'center' as const,fontSize:11,color:'#4a5f7a'}}>
              By signing up you agree to our <a href="/terms" style={{color:DIM,textDecoration:'none'}}>Terms of Service</a> and <a href="/privacy" style={{color:DIM,textDecoration:'none'}}>Privacy Policy</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
