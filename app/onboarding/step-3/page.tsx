'use client';
import React, { useState } from 'react';
import SaguaroDatePicker from '../../../components/SaguaroDatePicker';
import { Cactus, Check } from '@phosphor-icons/react';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='var(--text-secondary)',TEXT='#FFFFFF',RED='#F87171',GREEN='#4ADE80';

const STEPS = [
  { num: 1, label: 'Welcome', done: true },
  { num: 2, label: 'Company', done: true },
  { num: 3, label: 'First Project', active: true },
  { num: 4, label: 'Invite Team', done: false },
];

const inputStyle: React.CSSProperties = {
  width:'100%',padding:'11px 14px',background:'rgba(0,0,0,.04)',
  border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,
  outline:'none',boxSizing:'border-box',
};

const labelStyle: React.CSSProperties = {
  display:'block',fontSize:12,fontWeight:700,color:DIM,
  marginBottom:6,
};

export default function OnboardingStep3() {
  const [form, setForm] = useState({
    projectName: '',
    address: '',
    contractAmount: '',
    startDate: '',
    ownerName: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p=>({...p,[k]:e.target.value}));

  async function handleCreate() {
    if(!form.projectName.trim()){ setError('Project name is required.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/projects/create',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          name: form.projectName,
          address: form.address,
          contract_amount: form.contractAmount ? parseFloat(form.contractAmount.replace(/[^0-9.]/g,'')) : null,
          start_date: form.startDate || null,
          owner_name: form.ownerName,
        }),
      });
      /* Same bug as step 2, and worse here: this creates the customer's
         FIRST PROJECT. It used to discard the response and move to step 4
         whatever happened, so a failed create left them with an onboarding
         that claimed success and an account with no project in it. */
      const d = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(d.error || 'We could not create your first project.');
    } catch (e:any) {
      setError(e?.message || 'We could not create your first project. Please try again.');
      setLoading(false);
      return; // stay here rather than advancing past work that did not happen
    }
    window.location.href = '/onboarding/step-4';
  }

  return (
    <div style={{minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',padding:24,fontFamily:'system-ui,sans-serif',color:TEXT}}>
      <div style={{width:'100%',maxWidth:560}}>

        {/* Logo */}
        <div style={{textAlign:'center',marginBottom:36}}>
          <a href="/" style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:8}}>
            <Cactus size={28} weight="fill" color={GOLD} />
            <span style={{fontWeight:900,fontSize:20,color:GOLD}}>Saguaro</span>
          </a>
        </div>

        {/* Step indicator */}
        <div style={{display:'flex',gap:0,marginBottom:36,justifyContent:'center',alignItems:'flex-start'}}>
          {STEPS.map((s,i)=>(
            <React.Fragment key={s.num}>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
                <div style={{
                  width:36,height:36,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:14,fontWeight:800,
                  background: s.done ? GREEN : s.active ? GOLD : 'rgba(0,0,0,.06)',
                  color: (s.done||s.active) ? '#101722' : DIM,
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
            <div style={{fontSize:12,fontWeight:700,color:GOLD,marginBottom:8}}>Step 3 of 4</div>
            <h1 style={{fontSize:26,fontWeight:900,margin:'0 0 6px',color:TEXT}}>Add Your First Project</h1>
            <p style={{color:DIM,fontSize:14,margin:0}}>This project will be your workspace for takeoffs, pay apps, and lien waivers.</p>
          </div>

          {error&&(
            <div style={{background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.3)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:13,color:RED}}>{error}</div>
          )}

          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div>
              <label style={labelStyle}>Project Name *</label>
              <input type="text" placeholder="Mesa Library Expansion" value={form.projectName} onChange={set('projectName')} style={inputStyle}/>
            </div>

            <div>
              <label style={labelStyle}>Project Address</label>
              <input type="text" placeholder="123 Main St, Mesa AZ 85201" value={form.address} onChange={set('address')} style={inputStyle}/>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div>
                <label style={labelStyle}>Contract Amount ($)</label>
                <input type="text" placeholder="2,500,000" value={form.contractAmount} onChange={set('contractAmount')} style={inputStyle}/>
              </div>
              <div>
                <label style={labelStyle}>Start Date</label>
                <SaguaroDatePicker value={form.startDate} onChange={v => setForm(p=>({...p,startDate:v}))} style={{...inputStyle,colorScheme:'light'}}/>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Owner / Client Name</label>
              <input type="text" placeholder="City of Mesa" value={form.ownerName} onChange={set('ownerName')} style={inputStyle}/>
            </div>

            <button
              onClick={handleCreate}
              disabled={loading}
              style={{marginTop:8,padding:'14px 0',background:`linear-gradient(135deg,${GOLD},var(--brand-primary-strong))`,border:'none',borderRadius:10,color:'#101722',fontSize:15,fontWeight:800,cursor:loading?'wait':'pointer',opacity:loading?.7:1}}
            >
              {loading?'Creating Project…':'Add Project and Invite Team →'}
            </button>

            <a
              href="/app"
              style={{display:'block',textAlign:'center',padding:'12px 0',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:10,color:DIM,fontSize:14,fontWeight:600,textDecoration:'none'}}
            >
              Skip for now — go to dashboard
            </a>
          </div>
        </div>

        <div style={{textAlign:'center',marginTop:20,fontSize:12,color:'var(--text-secondary)'}}>
          You can always add projects later from your dashboard.
        </div>
      </div>
    </div>
  );
}
