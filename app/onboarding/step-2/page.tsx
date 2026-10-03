'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { Cactus, Check } from '@phosphor-icons/react';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='#CBD5E1',TEXT='#FFFFFF',RED='#ef4444',GREEN='#22c55e';

const STEPS = [
  { num: 1, label: 'Welcome', done: true },
  { num: 2, label: 'Company', active: true },
  { num: 3, label: 'First Project', done: false },
  { num: 4, label: 'Invite Team', done: false },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const inputStyle: React.CSSProperties = {
  width:'100%',padding:'11px 14px',background:'#1c1c1e',
  border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,
  outline:'none',boxSizing:'border-box',
};
const selectStyle: React.CSSProperties = {
  ...inputStyle, background:'#1c1c1e', cursor:'pointer',
};

const labelStyle: React.CSSProperties = {
  display:'block',fontSize:12,fontWeight:700,color:DIM,
  marginBottom:6,
};

export default function OnboardingStep2() {
  const [form, setForm] = useState({
    companyName: '',
    licenseNumber: '',
    state: '',
    companyType: '',
    employees: '',
    annualVolume: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) =>
    setForm(p=>({...p,[k]:e.target.value}));

  async function handleNext() {
    if(!form.companyName.trim()){ setError('Company name is required.'); return; }
    if(!form.state){ setError('Please select your state.'); return; }
    if(!form.companyType){ setError('Please select your company type.'); return; }
    setError('');
    setLoading(true);
    /* This used to `await fetch(...)` inside `try {} catch {}` and then
       navigate UNCONDITIONALLY. Two things were wrong with that, and the
       second is worse than the first:
         - a thrown network error was swallowed silently
         - a 500 does not throw at all, so the catch never even ran; the
           company details simply vanished and the customer was marched to
           step 3 believing they were saved
       This is the first thing a new customer types into the product. */
    try {
      const res = await fetch('/api/onboarding/company',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(form),
      });
      if(!res.ok){
        const d = await res.json().catch(()=>({}));
        throw new Error(d.error || 'We could not save your company details.');
      }
    } catch (e:any) {
      setError(e?.message || 'We could not save your company details. Please try again.');
      setLoading(false);
      return; // stay on this step — do not pretend it saved
    }
    window.location.href = '/onboarding/step-3';
  }

  return (
    <div style={{minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',padding:24,fontFamily:'system-ui,sans-serif',color:TEXT}}>
      <div style={{width:'100%',maxWidth:560}}>

        {/* Logo */}
        <div style={{textAlign:'center',marginBottom:36}}>
          <Link href="/" style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:8}}>
            <Cactus size={28} weight="fill" color={GOLD} />
            <span style={{fontWeight:900,fontSize:20,color:GOLD}}>Saguaro</span>
          </Link>
        </div>

        {/* Step indicator */}
        <div style={{display:'flex',gap:0,marginBottom:36,justifyContent:'center',alignItems:'flex-start'}}>
          {STEPS.map((s,i)=>(
            <React.Fragment key={s.num}>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
                <div style={{
                  width:36,height:36,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:14,fontWeight:800,
                  background: s.done ? GREEN : s.active ? GOLD : 'rgba(255,255,255,.08)',
                  color: (s.done||s.active) ? '#0A0A00' : DIM,
                  border:`2px solid ${s.done ? GREEN : s.active ? GOLD : BORDER}`,
                }}>
                  {s.done ? <Check size={16} weight="bold" /> : s.num}
                </div>
                <span style={{fontSize:11,color:s.active?TEXT:DIM,fontWeight:s.active?700:400}}>{s.label}</span>
              </div>
              {i<STEPS.length-1&&(
                <div style={{flex:1,height:2,background:BORDER,margin:'17px 8px 0'}}/>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Card */}
        <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:16,padding:40}}>
          <div style={{marginBottom:28}}>
            <div style={{fontSize:12,fontWeight:700,color:GOLD,marginBottom:8}}>Step 2 of 4</div>
            <h1 style={{fontSize:26,fontWeight:900,margin:'0 0 6px',color:TEXT}}>Set Up Your Company</h1>
            <p style={{color:DIM,fontSize:14,margin:0}}>This information personalizes your documents and reports.</p>
          </div>

          {error&&(
            <div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:13,color:RED}}>{error}</div>
          )}

          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div>
              <label style={labelStyle}>Company Name *</label>
              <input type="text" placeholder="Acme Construction LLC" value={form.companyName} onChange={set('companyName')} style={inputStyle}/>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div>
                <label style={labelStyle}>Contractor License #</label>
                <input type="text" placeholder="ROC 123456" value={form.licenseNumber} onChange={set('licenseNumber')} style={inputStyle}/>
              </div>
              <div>
                <label style={labelStyle}>State *</label>
                <select value={form.state} onChange={set('state')} style={selectStyle}>
                  <option value="">Select state…</option>
                  {US_STATES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Company Type *</label>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
                {['General Contractor','Subcontractor','Owner / Developer','Design-Build'].map(type=>(
                  <button
                    key={type}
                    onClick={()=>setForm(p=>({...p,companyType:type}))}
                    style={{padding:'10px 8px',background:form.companyType===type?'var(--brand-primary-18)':'#1c1c1e',border:`1px solid ${form.companyType===type?'color-mix(in srgb, var(--brand-primary) 50%, transparent)':BORDER}`,borderRadius:8,color:form.companyType===type?GOLD:DIM,fontSize:11,fontWeight:form.companyType===type?700:400,cursor:'pointer',textAlign:'center',lineHeight:1.4}}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div>
                <label style={labelStyle}>Number of Employees</label>
                <select value={form.employees} onChange={set('employees')} style={selectStyle}>
                  <option value="">Select…</option>
                  <option value="1-10">1–10</option>
                  <option value="11-50">11–50</option>
                  <option value="51-200">51–200</option>
                  <option value="200+">200+</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Annual Volume</label>
                <select value={form.annualVolume} onChange={set('annualVolume')} style={selectStyle}>
                  <option value="">Select…</option>
                  <option value="0-1M">Under $1M</option>
                  <option value="1M-10M">$1M – $10M</option>
                  <option value="10M+">$10M+</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleNext}
              disabled={loading}
              style={{marginTop:8,padding:'14px 0',background:`linear-gradient(135deg,${GOLD},var(--brand-primary-strong))`,border:'none',borderRadius:10,color:'#0A0A00',fontSize:15,fontWeight:800,cursor:loading?'wait':'pointer',opacity:loading?.7:1}}
            >
              {loading?'Saving…':'Continue to First Project →'}
            </button>
          </div>
        </div>

        <div style={{textAlign:'center',marginTop:20,fontSize:12,color:'#CBD5E1'}}>
          <Link href="/app" style={{color:DIM,textDecoration:'none'}}>Skip Setup — Go to Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
