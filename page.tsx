'use client';
import React, { useState } from 'react';
import Link from 'next/link';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a';

export default function SandboxPage() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [trade, setTrade] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/sandbox/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, firstName, lastName, companyName: company, phone, primaryTrade: trade, referralSource: 'website' }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        if (data.accessToken && typeof window !== 'undefined') {
          setTimeout(() => { window.location.href = data.sandboxUrl || '/app'; }, 2000);
        }
      } else {
        setError(data.error || 'Signup failed. Please try again.');
      }
    } catch { setError('Network error. Please try again.'); }
    setLoading(false);
  }

  const TRADES = ['General Contractor','Residential Builder','Commercial GC','Electrical','Plumbing','HVAC/Mechanical','Framing/Carpentry','Concrete','Roofing','Drywall','Other'];

  if (success) {
    return (
      <div style={{ minHeight:'100vh', background:DARK, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div style={{ textAlign:'center', maxWidth:500 }}>
          <div style={{ fontSize:64, marginBottom:20 }}>🎉</div>
          <h1 style={{ fontSize:28, fontWeight:900, color:TEXT, marginBottom:12 }}>Your sandbox is ready!</h1>
          <p style={{ fontSize:15, color:DIM, marginBottom:24 }}>Check your email for your instant access link. Your 14-day free trial has started — no card needed.</p>
          <div style={{ background:RAISED, border:`1px solid ${BORDER}`, borderRadius:10, padding:20, marginBottom:24, fontSize:13, color:DIM }}>
            <div style={{ color:TEXT, fontWeight:700, marginBottom:8 }}>Pre-loaded in your sandbox:</div>
            <div>✅ Complete AI takeoff — 2,400 SF custom home (ran in 47 seconds)</div>
            <div>✅ 5 sample subcontractors with compliance tracking</div>
            <div>✅ Bid intelligence history with win/loss analysis</div>
            <div>✅ 5 free AI runs to try on your own blueprints</div>
          </div>
          <Link href="/app" style={{ display:'inline-block', padding:'14px 32px', background:`linear-gradient(135deg,${GOLD},#F0C040)`, color:'#0d1117', borderRadius:8, fontWeight:800, fontSize:15, textDecoration:'none' }}>
            Enter My Sandbox →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', background:DARK }}>
      {/* Nav */}
      <nav style={{ position:'fixed', top:0, left:0, right:0, height:56, background:'rgba(13,17,23,.96)', borderBottom:`1px solid ${BORDER}`, display:'flex', alignItems:'center', padding:'0 24px', gap:16, zIndex:100 }}>
        <Link href="/" style={{ display:'flex', alignItems:'center', gap:8, textDecoration:'none' }}>
          <span style={{ fontSize:22 }}>🌵</span>
          <span style={{ fontWeight:900, fontSize:16, letterSpacing:2, color:GOLD }}>SAGUARO</span>
        </Link>
        <div style={{ flex:1 }} />
        <Link href="/login" style={{ fontSize:13, color:DIM, textDecoration:'none' }}>Sign in</Link>
      </nav>

      <div style={{ paddingTop:80, display:'flex', minHeight:'100vh' }}>
        {/* Left — value props */}
        <div style={{ flex:1, padding:'40px 48px', display:'flex', flexDirection:'column', justifyContent:'center', borderRight:`1px solid ${BORDER}` }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:3, textTransform:'uppercase' as const, color:GOLD, marginBottom:12 }}>Free 14-Day Sandbox</div>
          <h1 style={{ fontSize:36, fontWeight:900, lineHeight:1.1, color:TEXT, marginBottom:16 }}>
            Blueprint to full project<br/>in <span style={{ color:GOLD }}>47 seconds.</span>
          </h1>
          <p style={{ fontSize:15, color:DIM, marginBottom:32, lineHeight:1.7 }}>
            Upload any blueprint. Claude AI reads every dimension, calculates 200+ materials, builds the full project structure, and sends bid invitations to your subs — automatically.
          </p>

          {[
            { icon:'📐', title:'AI Blueprint Takeoff', sub:'200+ material line items in under 60 seconds' },
            { icon:'🤖', title:'Auto-Build Every Project', sub:'Schedule, budget, contacts, sub-packages — done' },
            { icon:'📧', title:'Bids Sent Automatically', sub:'AI invitation letters to all matching subs' },
            { icon:'🧠', title:'Learns From Every Bid', sub:'Gets smarter with each win and loss' },
            { icon:'📋', title:'All Legal Documents', sub:'AIA G702, lien waivers, bid bonds — auto-filled' },
          ].map(f => (
            <div key={f.title} style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:18 }}>
              <div style={{ width:40, height:40, borderRadius:9, background:'rgba(212,160,23,.1)', border:`1px solid rgba(212,160,23,.2)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>{f.icon}</div>
              <div>
                <div style={{ fontWeight:700, color:TEXT, fontSize:14 }}>{f.title}</div>
                <div style={{ fontSize:12, color:DIM, marginTop:1 }}>{f.sub}</div>
              </div>
            </div>
          ))}

          <div style={{ marginTop:8, padding:'14px 18px', background:'rgba(255,255,255,.03)', borderRadius:8, border:`1px solid ${BORDER}`, fontSize:12, color:DIM }}>
            <strong style={{ color:TEXT }}>Procore:</strong> $449/user/month · 3-week onboarding · No AI takeoff<br/>
            <strong style={{ color:TEXT }}>Buildertrend:</strong> $499/month · Manual estimating · No learning engine<br/>
            <strong style={{ color:GOLD }}>Saguaro:</strong> $449/month · Live in 48 hours · AI does the work
          </div>
        </div>

        {/* Right — signup form */}
        <div style={{ width:480, padding:'40px 40px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
          <h2 style={{ fontSize:22, fontWeight:800, color:TEXT, marginBottom:4 }}>Start your free sandbox</h2>
          <p style={{ fontSize:13, color:DIM, marginBottom:24 }}>No credit card. No onboarding call. Up and running in 2 minutes.</p>

          {error && (
            <div style={{ background:'rgba(192,48,48,.1)', border:'1px solid rgba(192,48,48,.3)', borderRadius:7, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#ff7070' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSignup}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
              {[['First Name', firstName, setFirstName, true],['Last Name', lastName, setLastName, true]].map(([label, val, setter, req]) => (
                <div key={label as string}>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:DIM, textTransform:'uppercase' as const, letterSpacing:.5, marginBottom:5 }}>{label as string}</label>
                  <input value={val as string} onChange={e => (setter as Function)(e.target.value)} required={req as boolean} placeholder={label as string} style={{ width:'100%', padding:'10px 12px', background:RAISED, border:`1px solid ${BORDER}`, borderRadius:7, color:TEXT, fontSize:13, outline:'none' }} />
                </div>
              ))}
            </div>

            {[['Work Email','email',email,setEmail,'your@company.com',true],['Company Name','text',company,setCompany,'ABC Construction',true],['Phone','tel',phone,setPhone,'(555) 000-0000',false]].map(([label,type,val,setter,ph,req]) => (
              <div key={label as string} style={{ marginBottom:12 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:DIM, textTransform:'uppercase' as const, letterSpacing:.5, marginBottom:5 }}>{label as string}</label>
                <input type={type as string} value={val as string} onChange={e => (setter as Function)(e.target.value)} required={req as boolean} placeholder={ph as string} style={{ width:'100%', padding:'10px 12px', background:RAISED, border:`1px solid ${BORDER}`, borderRadius:7, color:TEXT, fontSize:13, outline:'none' }} />
              </div>
            ))}

            <div style={{ marginBottom:24 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:DIM, textTransform:'uppercase' as const, letterSpacing:.5, marginBottom:5 }}>Primary Trade</label>
              <select value={trade} onChange={e => setTrade(e.target.value)} style={{ width:'100%', padding:'10px 12px', background:RAISED, border:`1px solid ${BORDER}`, borderRadius:7, color:trade?TEXT:DIM, fontSize:13, cursor:'pointer' }}>
                <option value="">Select your trade...</option>
                {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <button type="submit" disabled={loading} style={{ width:'100%', padding:14, background:`linear-gradient(135deg,${GOLD},#F0C040)`, border:'none', borderRadius:8, color:'#0d1117', fontSize:15, fontWeight:900, cursor:loading?'not-allowed':'pointer', opacity:loading?.7:1, marginBottom:12 }}>
              {loading ? 'Creating your sandbox…' : '🚀 Start Free Sandbox — No Card Needed'}
            </button>

            <div style={{ fontSize:11, color:'#4a5f7a', textAlign:'center' as const }}>
              By signing up you agree to our{' '}
              <Link href="/terms" style={{ color:DIM }}>Terms</Link> and{' '}
              <Link href="/privacy" style={{ color:DIM }}>Privacy Policy</Link>.
              <br/>Already have an account? <Link href="/login" style={{ color:GOLD, fontWeight:700 }}>Sign in</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
