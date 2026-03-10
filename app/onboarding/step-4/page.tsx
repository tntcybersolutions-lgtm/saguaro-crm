'use client';
import React, { useState } from 'react';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',RED='#ef4444',GREEN='#22c55e';

const STEPS = [
  { num: 1, label: 'Welcome', done: true },
  { num: 2, label: 'Company', done: true },
  { num: 3, label: 'First Project', done: true },
  { num: 4, label: 'Invite Team', active: true },
];

const ROLES = ['Admin','Project Manager','Field Supervisor','Estimator','Accounting'];

const inputStyle: React.CSSProperties = {
  flex:1,padding:'11px 14px',background:'rgba(255,255,255,.04)',
  border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,
  outline:'none',
};

const selectStyle: React.CSSProperties = {
  padding:'11px 14px',background:'rgba(255,255,255,.04)',
  border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:13,
  outline:'none',minWidth:160,cursor:'pointer',
};

type Invite = { email: string; role: string };

export default function OnboardingStep4() {
  const [invites, setInvites] = useState<Invite[]>([
    {email:'',role:'Project Manager'},
    {email:'',role:'Estimator'},
    {email:'',role:'Field Supervisor'},
  ]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function updateInvite(i: number, field: keyof Invite, val: string) {
    setInvites(prev=>prev.map((inv,idx)=>idx===i?{...inv,[field]:val}:inv));
  }

  async function handleSendInvites() {
    const toSend = invites.filter(inv=>inv.email.trim());
    if(toSend.length===0){ setError('Enter at least one email address to send invites.'); return; }
    const invalid = toSend.find(inv=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inv.email));
    if(invalid){ setError(`"${invalid.email}" doesn't look like a valid email address.`); return; }
    setError('');
    setLoading(true);
    try {
      await fetch('/api/team/invite',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({invites: toSend}),
      });
      setSuccess(true);
    } catch {
      setError('Failed to send invites. You can add team members from Settings later.');
    }
    setLoading(false);
  }

  return (
    <div style={{minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',padding:24,fontFamily:'system-ui,sans-serif',color:TEXT}}>
      <div style={{width:'100%',maxWidth:560}}>

        {/* Logo */}
        <div style={{textAlign:'center',marginBottom:36}}>
          <a href="/" style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:28}}>🌵</span>
            <span style={{fontWeight:900,fontSize:20,color:GOLD,letterSpacing:1}}>SAGUARO</span>
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
                  background: s.done ? GREEN : s.active ? GOLD : 'rgba(255,255,255,.06)',
                  color: (s.done||s.active) ? '#0d1117' : DIM,
                  border:`2px solid ${s.done ? GREEN : s.active ? GOLD : BORDER}`,
                }}>
                  {s.done ? '✓' : s.num}
                </div>
                <span style={{fontSize:11,color:s.active?TEXT:DIM,fontWeight:s.active?700:400}}>{s.label}</span>
              </div>
              {i<STEPS.length-1&&(
                <div style={{flex:1,height:2,background:BORDER,margin:'17px 8px 0'}}/>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Success state */}
        {success ? (
          <div style={{background:RAISED,border:`1px solid rgba(34,197,94,.3)`,borderRadius:16,padding:40,textAlign:'center'}}>
            <div style={{fontSize:56,marginBottom:20}}>🎉</div>
            <h1 style={{fontSize:28,fontWeight:900,margin:'0 0 12px',color:TEXT}}>You're all set!</h1>
            <p style={{color:DIM,fontSize:15,margin:'0 0 8px',lineHeight:1.6}}>
              Invites sent. Your team members will receive an email with instructions to create their account.
            </p>
            <p style={{color:DIM,fontSize:14,margin:'0 0 32px'}}>
              Head to your dashboard to get started.
            </p>
            <a
              href="/app"
              style={{display:'inline-block',padding:'14px 40px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,borderRadius:10,color:'#0d1117',fontWeight:800,fontSize:15,textDecoration:'none'}}
            >
              Go to Dashboard →
            </a>
          </div>
        ) : (
          <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:16,padding:40}}>
            <div style={{marginBottom:28}}>
              <div style={{fontSize:11,fontWeight:700,color:GOLD,textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Step 4 of 4</div>
              <h1 style={{fontSize:26,fontWeight:900,margin:'0 0 6px',color:TEXT}}>Invite Your Team</h1>
              <p style={{color:DIM,fontSize:14,margin:0}}>Everyone gets unlimited access — no extra charge per user.</p>
            </div>

            {error&&(
              <div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:13,color:RED}}>{error}</div>
            )}

            <div style={{display:'flex',flexDirection:'column',gap:12,marginBottom:20}}>
              {/* Column headers */}
              <div style={{display:'flex',gap:10}}>
                <div style={{flex:1,fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5}}>Email Address</div>
                <div style={{minWidth:160,fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5}}>Role</div>
              </div>

              {invites.map((inv,i)=>(
                <div key={i} style={{display:'flex',gap:10,alignItems:'center'}}>
                  <input
                    type="email"
                    placeholder={`teammate${i+1}@yourcompany.com`}
                    value={inv.email}
                    onChange={e=>updateInvite(i,'email',e.target.value)}
                    style={inputStyle}
                  />
                  <select
                    value={inv.role}
                    onChange={e=>updateInvite(i,'role',e.target.value)}
                    style={selectStyle}
                  >
                    {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              ))}

              <button
                onClick={()=>setInvites(p=>[...p,{email:'',role:'Project Manager'}])}
                style={{alignSelf:'flex-start',padding:'7px 14px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:12,fontWeight:600,cursor:'pointer'}}
              >
                + Add another person
              </button>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <button
                onClick={handleSendInvites}
                disabled={loading}
                style={{padding:'14px 0',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:10,color:'#0d1117',fontSize:15,fontWeight:800,cursor:loading?'wait':'pointer',opacity:loading?.7:1}}
              >
                {loading?'Sending Invites...':'Send Invites'}
              </button>
              <a
                href="/app"
                style={{display:'block',textAlign:'center',padding:'12px 0',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:10,color:DIM,fontSize:14,fontWeight:600,textDecoration:'none'}}
              >
                Skip this step — go to dashboard
              </a>
            </div>

            <div style={{marginTop:24,padding:'12px 16px',background:'rgba(212,160,23,.06)',border:'1px solid rgba(212,160,23,.2)',borderRadius:8,fontSize:12,color:DIM,textAlign:'center'}}>
              You can invite more team members anytime from <strong style={{color:TEXT}}>Settings → Team</strong>
            </div>
          </div>
        )}

        <div style={{textAlign:'center',marginTop:20,fontSize:12,color:'#4a5f7a'}}>
          Questions? <a href="mailto:support@saguarocrm.com" style={{color:DIM}}>support@saguarocrm.com</a>
        </div>
      </div>
    </div>
  );
}
