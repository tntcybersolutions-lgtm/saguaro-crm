'use client';
import React, { useState } from 'react';
import { Cactus, Check, Confetti } from '@phosphor-icons/react';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='var(--text-secondary)',TEXT='#FFFFFF',RED='#F87171',GREEN='#4ADE80';

const STEPS = [
  { num: 1, label: 'Welcome', done: true },
  { num: 2, label: 'Company', done: true },
  { num: 3, label: 'First Project', done: true },
  { num: 4, label: 'Invite Team', active: true },
];

const ROLES = ['Admin','Project Manager','Field Supervisor','Estimator','Accounting'];

const inputStyle: React.CSSProperties = {
  flex:1,padding:'11px 14px',background:'rgba(0,0,0,.04)',
  border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,
  outline:'none',
};

const selectStyle: React.CSSProperties = {
  padding:'11px 14px',background:'rgba(0,0,0,.04)',
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
      const res = await fetch('/api/team/invite',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({invites: toSend}),
      });
      const data = await res.json().catch(()=>null) as
        | { error?: string; sent?: number; failed?: number; results?: Array<{email:string;status:string;error?:string;emailed?:boolean}> }
        | null;
      // An invite can exist without its email having gone out — say so by name.
      const unmailed = (data?.results||[]).filter(r=>r.status==='sent' && r.emailed===false).map(r=>r.email);
      if (res.ok && !data?.failed && unmailed.length) {
        setError(`Invites saved, but the email didn't go out to ${unmailed.join(', ')}. Resend them from People → Pending Invites once email is working.`);
      } else if (!res.ok) {
        setError(data?.error || 'Failed to send invites. You can add team members from Settings later.');
      } else if (data?.failed) {
        // Partial batch — name exactly who did NOT get an invite rather than
        // showing a blanket success for work that only partly happened.
        const bad = (data.results||[]).filter(r=>r.status!=='sent').map(r=>r.email).join(', ');
        setError(`${data.sent} invite${data.sent===1?'':'s'} sent. ${data.failed} failed: ${bad}. You can retry those from Settings.`);
      } else {
        setSuccess(true);
      }
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

        {/* Success state */}
        {success ? (
          <div style={{background:RAISED,border:`1px solid rgba(74,222,128,.3)`,borderRadius:16,padding:40,textAlign:'center'}}>
            <div style={{marginBottom:20}}><Confetti size={56} weight="fill" color={GOLD} /></div>
            <h1 style={{fontSize:28,fontWeight:900,margin:'0 0 12px',color:TEXT}}>You're All Set</h1>
            <p style={{color:DIM,fontSize:15,margin:'0 0 8px',lineHeight:1.6}}>
              Invites sent. Your team members will receive an email with instructions to create their account.
            </p>
            <p style={{color:DIM,fontSize:14,margin:'0 0 32px'}}>
              Head to your dashboard to get started.
            </p>
            <a
              href="/app"
              style={{display:'inline-block',padding:'14px 40px',background:`linear-gradient(135deg,${GOLD},var(--brand-primary-strong))`,borderRadius:10,color:'#101722',fontWeight:800,fontSize:15,textDecoration:'none'}}
            >
              Go to Dashboard →
            </a>
          </div>
        ) : (
          <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:16,padding:40}}>
            <div style={{marginBottom:28}}>
              <div style={{fontSize:12,fontWeight:700,color:GOLD,marginBottom:8}}>Step 4 of 4</div>
              <h1 style={{fontSize:26,fontWeight:900,margin:'0 0 6px',color:TEXT}}>Invite Your Team</h1>
              <p style={{color:DIM,fontSize:14,margin:0}}>Everyone gets unlimited access — no extra charge per user.</p>
            </div>

            {error&&(
              <div style={{background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.3)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:13,color:RED}}>{error}</div>
            )}

            <div style={{display:'flex',flexDirection:'column',gap:12,marginBottom:20}}>
              {/* Column headers */}
              <div style={{display:'flex',gap:10}}>
                <div style={{flex:1,fontSize:11,fontWeight:700,color:DIM}}>Email Address</div>
                <div style={{minWidth:160,fontSize:11,fontWeight:700,color:DIM}}>Role</div>
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
                style={{padding:'14px 0',background:`linear-gradient(135deg,${GOLD},var(--brand-primary-strong))`,border:'none',borderRadius:10,color:'#101722',fontSize:15,fontWeight:800,cursor:loading?'wait':'pointer',opacity:loading?.7:1}}
              >
                {loading?'Sending Invites…':'Send Invites'}
              </button>
              <a
                href="/app"
                style={{display:'block',textAlign:'center',padding:'12px 0',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:10,color:DIM,fontSize:14,fontWeight:600,textDecoration:'none'}}
              >
                Skip this step — go to dashboard
              </a>
            </div>

            <div style={{marginTop:24,padding:'12px 16px',background:'color-mix(in srgb, var(--brand-primary) 6%, transparent)',border:'1px solid var(--brand-primary-18)',borderRadius:8,fontSize:12,color:DIM,textAlign:'center'}}>
              You can invite more team members anytime from <strong style={{color:TEXT}}>Settings → Team</strong>.
            </div>
          </div>
        )}

        <div style={{textAlign:'center',marginTop:20,fontSize:12,color:'var(--text-secondary)'}}>
          Questions? <a href="mailto:support@saguarocontrol.net" style={{color:DIM}}>support@saguarocontrol.net</a>
        </div>
      </div>
    </div>
  );
}
