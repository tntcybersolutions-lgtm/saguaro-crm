'use client';
import React, { useState } from 'react';

const GOLD='#F59E0B',DARK='#F8F9FB',RAISED='#0F172A',BORDER='#1E3A5F',DIM='#CBD5E1',TEXT='#F8FAFC',RED='#ef4444',GREEN='#22c55e';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Create your account',
    desc: 'Fill out the form — takes about 30 seconds. No credit card needed.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
  {
    step: '2',
    title: 'Log in — it\'s ready instantly',
    desc: 'No download. No install. Open your browser, go to saguarocontrol.net, and log in. Your full platform is live.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
      </svg>
    ),
  },
  {
    step: '3',
    title: 'Install on your phone (optional)',
    desc: 'Visit saguarocontrol.net on your iPhone or Android, tap "Add to Home Screen." Done — no App Store needed.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
      </svg>
    ),
  },
  {
    step: '4',
    title: 'Invite your team',
    desc: 'Add unlimited users — PMs, estimators, field crew. Everyone gets access for free.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
];

export default function SignupPage(){
  const [form, setForm] = useState({name:'',email:'',password:'',company:'',phone:'',role:'General Contractor',state:'AZ',size:'1-10'});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  function update(k:string,v:string){ setForm(p=>({...p,[k]:v})); }

  async function handleSubmit(e: React.FormEvent){
    e.preventDefault();
    if(!form.name||!form.email||!form.password||!form.company){ setError('Full name, email, password, and company name are required.'); return; }
    if(form.password.length < 8){ setError('Password must be at least 8 characters.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Signup failed. Please try again.'); setLoading(false); return; }
      if (data.confirmed || data.demo) { window.location.href = '/onboarding/step-1'; return; }
      setSuccess(true);
    } catch {
      setError('Signup failed. Please check your connection and try again.');
    }
    setLoading(false);
  }

  const inputStyle: React.CSSProperties = {width:'100%',padding:'11px 14px',background:'rgba(255,255,255,.04)',border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,outline:'none',boxSizing:'border-box'};
  const selectStyle: React.CSSProperties = {width:'100%',padding:'11px 14px',background:'#0a0f1a',border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:14,outline:'none',boxSizing:'border-box',cursor:'pointer'};
  const labelStyle: React.CSSProperties = {display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:6};

  if(success) return (
    <div style={{minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',padding:24,fontFamily:"system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <div style={{width:'100%',maxWidth:480,textAlign:'center'}}>
        <div style={{width:72,height:72,borderRadius:'50%',background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.3)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 24px',fontSize:32}}>✅</div>
        <h1 style={{fontSize:26,fontWeight:900,color:TEXT,marginBottom:12}}>Check your email</h1>
        <p style={{color:DIM,fontSize:15,lineHeight:1.7,marginBottom:28}}>
          We sent a confirmation link to <strong style={{color:TEXT}}>{form.email}</strong>.<br/>
          Click it to activate your account — then log in at <strong style={{color:GOLD}}>saguarocontrol.net/login</strong>.
        </p>
        <div style={{background:'rgba(34,197,94,.08)',border:'1px solid rgba(34,197,94,.2)',borderRadius:12,padding:'18px 24px',marginBottom:28,textAlign:'left'}}>
          <div style={{fontSize:13,fontWeight:700,color:TEXT,marginBottom:12}}>What happens next:</div>
          {['Click the link in your email to confirm', 'Log in at saguarocontrol.net — no download needed', 'Complete your 5-min company setup', 'Invite your team — unlimited users, always free'].map((t,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:10,marginBottom:8,fontSize:13,color:DIM}}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="rgba(34,197,94,0.15)"/><path d="M4.5 8l2.5 2.5 4-5" stroke={GREEN} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {t}
            </div>
          ))}
        </div>
        <a href="/login" style={{display:'block',padding:'14px',background:`linear-gradient(135deg,${GOLD},#D97706)`,borderRadius:9,color:'#000',fontWeight:900,fontSize:15,textDecoration:'none',marginBottom:16}}>
          Go to Login →
        </a>
        <p style={{fontSize:12,color:DIM}}>Didn't get it? Check spam or <button onClick={()=>setSuccess(false)} style={{background:'none',border:'none',color:GOLD,cursor:'pointer',fontSize:12,fontWeight:700}}>try again</button></p>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:'100vh',background:DARK,fontFamily:"system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>

      {/* Nav */}
      <nav style={{padding:'0 32px',height:60,display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`1px solid ${BORDER}`,position:'sticky',top:0,background:'rgba(248,249,251,.97)',backdropFilter:'blur(12px)',zIndex:50}}>
        <a href="/" style={{textDecoration:'none',display:'flex',alignItems:'center',gap:10}}>
          <img src="/logo-full.jpg" alt="Saguaro" style={{height:34,width:'auto',borderRadius:4}}/>
          <span style={{fontWeight:900,fontSize:15,background:`linear-gradient(90deg,${GOLD},#FCD34D)`,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>SAGUARO</span>
        </a>
        <a href="/login" style={{fontSize:13,color:DIM,textDecoration:'none',fontWeight:600}}>
          Already have an account? <span style={{color:GOLD}}>Log in →</span>
        </a>
      </nav>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',minHeight:'calc(100vh - 60px)',maxWidth:1100,margin:'0 auto',padding:'0 24px',gap:64,alignItems:'start'}}>

        {/* ── LEFT: How it works ── */}
        <div style={{padding:'52px 0 40px',position:'sticky',top:80}}>

          {/* Trial badge */}
          <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'6px 14px',background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.25)',borderRadius:20,fontSize:12,fontWeight:700,color:GREEN,letterSpacing:1,textTransform:'uppercase',marginBottom:28}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:GREEN,display:'inline-block'}}/>
            30-Day Free Trial — No Credit Card
          </div>

          <h1 style={{fontSize:'clamp(26px,3vw,36px)',fontWeight:900,color:TEXT,lineHeight:1.15,marginBottom:12,letterSpacing:-0.5}}>
            The fastest way to run your construction company
          </h1>
          <p style={{fontSize:15,color:DIM,lineHeight:1.7,marginBottom:40}}>
            Saguaro is a <strong style={{color:TEXT}}>web-based platform</strong> — nothing to download or install on a computer. Sign up, log in from any browser, and your whole team is running in minutes.
          </p>

          {/* Steps */}
          <div style={{display:'flex',flexDirection:'column',gap:24,marginBottom:40}}>
            {HOW_IT_WORKS.map((s,i)=>(
              <div key={i} style={{display:'flex',gap:16,alignItems:'flex-start'}}>
                <div style={{width:40,height:40,borderRadius:12,background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {s.icon}
                </div>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:TEXT,marginBottom:3}}>
                    <span style={{color:GOLD,fontSize:11,fontWeight:800,letterSpacing:1,marginRight:6}}>STEP {s.step}</span>
                    {s.title}
                  </div>
                  <div style={{fontSize:13,color:DIM,lineHeight:1.6}}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Trust row */}
          <div style={{display:'flex',flexWrap:'wrap',gap:16}}>
            {['No credit card required','Cancel anytime','Unlimited users included','Free migration from Procore'].map(t=>(
              <div key={t} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:DIM}}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="rgba(34,197,94,0.15)"/><path d="M4.5 8l2.5 2.5 4-5" stroke={GREEN} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {t}
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div style={{marginTop:36,padding:'20px 24px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:12}}>
            <p style={{fontSize:13,color:DIM,lineHeight:1.7,marginBottom:12,fontStyle:'italic'}}>
              "We compared Saguaro to Procore and Buildertrend. Saguaro has everything we need at a fraction of the cost — and the AI features actually work."
            </p>
            <div style={{fontSize:12,fontWeight:700,color:TEXT}}>David K. <span style={{color:DIM,fontWeight:400}}>— Owner, Mid-Size GC, Denver CO</span></div>
          </div>
        </div>

        {/* ── RIGHT: Signup form ── */}
        <div style={{padding:'52px 0 40px'}}>
          <div style={{marginBottom:28}}>
            <h2 style={{fontSize:22,fontWeight:900,color:TEXT,margin:'0 0 6px'}}>Start your free trial</h2>
            <p style={{fontSize:13,color:DIM,margin:0}}>Takes 30 seconds. No credit card required.</p>
          </div>

          <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:14,padding:32}}>
            {error&&(
              <div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:13,color:RED,display:'flex',alignItems:'flex-start',gap:8}}>
                <span>⚠️</span><span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:16}}>
              <div>
                <label style={labelStyle}>Your Full Name *</label>
                <input placeholder="John Smith" value={form.name} onChange={e=>update('name',e.target.value)} required autoComplete="name" style={inputStyle}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
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
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input type="tel" placeholder="(480) 555-0100" value={form.phone} onChange={e=>update('phone',e.target.value)} autoComplete="tel" style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>State</label>
                  <select value={form.state} onChange={e=>update('state',e.target.value)} style={selectStyle}>
                    {US_STATES.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <div>
                  <label style={labelStyle}>Company Type</label>
                  <select value={form.role} onChange={e=>update('role',e.target.value)} style={selectStyle}>
                    {['General Contractor','Electrical','Plumbing','Mechanical / HVAC','Concrete','Roofing','Specialty Contractor','Developer / Owner','Other'].map(r=><option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Team Size</label>
                  <select value={form.size} onChange={e=>update('size',e.target.value)} style={selectStyle}>
                    {['1-10','11-25','26-50','51-100','100+'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <button type="submit" disabled={loading} style={{marginTop:8,padding:'14px 0',background:loading?'rgba(245,158,11,.4)':`linear-gradient(135deg,${GOLD},#D97706)`,border:'none',borderRadius:9,color:'#000',fontSize:15,fontWeight:900,cursor:loading?'not-allowed':'pointer'}}>
                {loading?'Creating your account…':'Start Free Trial →'}
              </button>
            </form>

            {/* What happens next */}
            <div style={{marginTop:20,padding:'14px 18px',background:'#FAFBFC',border:`1px solid rgba(30,58,95,0.5)`,borderRadius:8}}>
              <div style={{fontSize:11,fontWeight:700,color:DIM,letterSpacing:1,textTransform:'uppercase',marginBottom:10}}>After you sign up:</div>
              {['Confirm your email → you\'re in instantly','Log in at saguarocontrol.net — works in any browser','Optional: install on your phone in 30 seconds'].map((t,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:DIM,marginBottom:6}}>
                  <span style={{width:18,height:18,borderRadius:'50%',background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.2)',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:GOLD,flexShrink:0}}>{i+1}</span>
                  {t}
                </div>
              ))}
            </div>

            <div style={{marginTop:16,textAlign:'center',fontSize:12,color:DIM}}>
              Already have an account? <a href="/login" style={{color:GOLD,textDecoration:'none',fontWeight:700}}>Log in →</a>
            </div>
            <div style={{marginTop:8,textAlign:'center',fontSize:11,color:'#4a5f7a'}}>
              By signing up you agree to our <a href="/terms" style={{color:DIM,textDecoration:'none'}}>Terms</a> and <a href="/privacy" style={{color:DIM,textDecoration:'none'}}>Privacy Policy</a>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: stack columns */}
      <style>{`
        @media(max-width:720px){
          div[style*="grid-template-columns: 1fr 1fr"]:first-of-type {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
