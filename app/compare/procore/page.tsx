import React from 'react';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#22c55e',RED='#ef4444';

const NAV = (
  <nav style={{position:'fixed',top:0,left:0,right:0,zIndex:100,height:56,background:'rgba(13,17,23,.96)',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',padding:'0 32px',gap:24,backdropFilter:'blur(12px)'}}>
    <a href="/" style={{display:'flex',alignItems:'center',gap:8,textDecoration:'none'}}>
      <span style={{fontSize:22}}>🌵</span>
      <span style={{fontWeight:800,fontSize:16,letterSpacing:1,color:GOLD}}>SAGUARO</span>
      <span style={{fontSize:10,background:GOLD,color:'#0d1117',padding:'1px 6px',borderRadius:4,fontWeight:700}}>CRM</span>
    </a>
    <div style={{flex:1}}/>
    <a href="/login" style={{padding:'7px 16px',background:'rgba(212,160,23,.12)',border:`1px solid rgba(212,160,23,.3)`,borderRadius:7,color:GOLD,fontSize:13,fontWeight:700,textDecoration:'none'}}>Log In</a>
    <a href="/signup" style={{padding:'7px 16px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,textDecoration:'none'}}>Start Free</a>
  </nav>
);

const ROWS = [
  {feature:'Starting Price',saguaro:'$49/mo',procore:'$375/mo',saguaroWin:true,note:'Procore pricing requires annual contract'},
  {feature:'Setup Time',saguaro:'< 1 day',procore:'3–6 months',saguaroWin:true,note:'Procore requires dedicated implementation team'},
  {feature:'AI Autopilot',saguaro:'✓ Included',procore:'✗ Not available',saguaroWin:true,note:'Saguaro automates RFI routing, CO tracking, and alerts'},
  {feature:'Built-in Doc Generator',saguaro:'✓ Included',procore:'Limited',saguaroWin:true,note:'G702/G703, lien waivers, WH-347 all built in'},
  {feature:'Takeoff Tool',saguaro:'✓ AI-powered',procore:'Add-on ($$$)',saguaroWin:true,note:'Procore takeoff is a separate paid module'},
  {feature:'Contract Required',saguaro:'Month-to-month',procore:'Annual required',saguaroWin:true,note:'Cancel Saguaro anytime with no penalty'},
  {feature:'Support',saguaro:'Email + Chat',procore:'Enterprise only',saguaroWin:true,note:'Procore support tiers can exceed $1,000/mo'},
  {feature:'Mobile App',saguaro:'✓',procore:'✓',saguaroWin:false,note:'Both offer mobile apps'},
  {feature:'Lien Waivers (all 50 states)',saguaro:'✓ Included',procore:'Add-on',saguaroWin:true,note:''},
  {feature:'Certified Payroll WH-347',saguaro:'✓ Included',procore:'✗ Not available',saguaroWin:true,note:''},
  {feature:'Per-seat pricing',saguaro:'✗ Flat rate',procore:'✓ Per user',saguaroWin:true,note:'Procore charges per user — costs grow with your team'},
];

const DEEP_DIVE = [
  {
    title:'AI That Actually Works on Job Sites',
    icon:'🤖',
    saguaro:'Saguaro\'s Autopilot uses Claude AI to read every RFI and suggest responses based on your project specs, flag change order triggers in emails, and alert you when a sub\'s insurance expires — before it becomes a problem.',
    procore:'Procore has limited AI capabilities and no automated document workflow intelligence. AI features are in early access and only available on certain tiers.',
  },
  {
    title:'Document Generation at the Speed of Construction',
    icon:'📄',
    saguaro:'Generate G702/G703 pay apps, AIA A310/A312 bonds, lien waivers for all 50 states, WH-347 certified payroll, preliminary notices, and ACORD 25 insurance certificates — all in seconds, all included in your plan.',
    procore:'Procore requires integrations, third-party vendors, or manual PDF uploads for most document types. Certified payroll and lien waivers require separate tools or add-ons.',
  },
  {
    title:'Pricing That Scales With You — Not Against You',
    icon:'💰',
    saguaro:'One flat monthly rate. Add 50 users, 50 projects — same price. Month-to-month. Cancel anytime. Start free with no credit card. Starter at $49/mo, Professional at $399/mo.',
    procore:'Procore pricing starts at $375/month and scales by user count and project count. Annual contracts are required. Total cost of ownership for a mid-size GC can exceed $60,000/year.',
  },
];

export default function CompareProcorePage() {
  return (
    <div style={{minHeight:'100vh',background:DARK,color:TEXT,fontFamily:'system-ui,sans-serif'}}>
      {NAV}

      {/* Hero */}
      <div style={{paddingTop:80,textAlign:'center',padding:'100px 24px 60px'}}>
        <div style={{fontSize:12,fontWeight:700,color:GOLD,textTransform:'uppercase',letterSpacing:2,marginBottom:14}}>Saguaro vs Procore</div>
        <h1 style={{fontSize:52,fontWeight:900,margin:'0 0 16px',lineHeight:1.1}}>Enterprise Power.<br/>Without Enterprise Complexity.</h1>
        <p style={{fontSize:18,color:DIM,maxWidth:580,margin:'0 auto 32px',lineHeight:1.6}}>
          Procore is the industry giant built for ENR 400 firms. Saguaro is built for the GC that wants to run tight, move fast, and keep margins high.
        </p>
        <div style={{display:'inline-flex',gap:16,alignItems:'center'}}>
          <a href="/signup" style={{padding:'14px 32px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,borderRadius:9,color:'#0d1117',fontWeight:800,fontSize:15,textDecoration:'none'}}>Try Saguaro Free →</a>
          <a href="/pricing" style={{padding:'14px 28px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:9,color:TEXT,fontWeight:700,fontSize:14,textDecoration:'none'}}>See Pricing</a>
        </div>
        <div style={{marginTop:16,fontSize:12,color:DIM}}>No credit card required. 30-day free trial.</div>
      </div>

      {/* Comparison Table */}
      <div style={{maxWidth:1000,margin:'0 auto',padding:'0 24px 80px'}}>
        <div style={{border:`1px solid ${BORDER}`,borderRadius:14,overflow:'hidden'}}>
          {/* Table header */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',background:'#0d1117',borderBottom:`1px solid ${BORDER}`}}>
            <div style={{padding:'18px 24px',fontWeight:700,fontSize:13,color:DIM,textTransform:'uppercase',letterSpacing:.5}}>Feature</div>
            <div style={{padding:'18px 24px',textAlign:'center',borderLeft:`1px solid ${BORDER}`}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                <span style={{fontSize:18}}>🌵</span>
                <span style={{fontWeight:800,fontSize:16,color:GOLD}}>Saguaro</span>
              </div>
            </div>
            <div style={{padding:'18px 24px',textAlign:'center',borderLeft:`1px solid ${BORDER}`}}>
              <div style={{fontWeight:800,fontSize:16,color:DIM}}>Procore</div>
            </div>
          </div>

          {ROWS.map((row,i)=>(
            <div key={row.feature} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',borderBottom:i<ROWS.length-1?`1px solid ${BORDER}`:'none',background:i%2===0?'transparent':'rgba(255,255,255,.01)'}}>
              <div style={{padding:'16px 24px'}}>
                <div style={{fontWeight:600,color:TEXT,fontSize:13}}>{row.feature}</div>
                {row.note&&<div style={{fontSize:11,color:DIM,marginTop:3}}>{row.note}</div>}
              </div>
              <div style={{padding:'16px 24px',borderLeft:`1px solid ${BORDER}`,textAlign:'center',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                {row.saguaroWin&&<span style={{color:GREEN,fontSize:14}}>★</span>}
                <span style={{color:row.saguaroWin?GREEN:TEXT,fontWeight:row.saguaroWin?700:400,fontSize:13}}>{row.saguaro}</span>
              </div>
              <div style={{padding:'16px 24px',borderLeft:`1px solid ${BORDER}`,textAlign:'center',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span style={{color:row.procore.startsWith('✗')?RED:DIM,fontSize:13}}>{row.procore}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Deep Dive Sections */}
      <div style={{background:RAISED,borderTop:`1px solid ${BORDER}`,borderBottom:`1px solid ${BORDER}`,padding:'60px 24px'}}>
        <div style={{maxWidth:1000,margin:'0 auto'}}>
          <h2 style={{fontSize:32,fontWeight:900,textAlign:'center',marginBottom:12}}>Where Saguaro Wins</h2>
          <p style={{color:DIM,textAlign:'center',marginBottom:48,fontSize:15}}>A deeper look at the features that matter most on the job.</p>
          <div style={{display:'flex',flexDirection:'column',gap:40}}>
            {DEEP_DIVE.map(d=>(
              <div key={d.title} style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24,alignItems:'start'}}>
                <div style={{background:'rgba(212,160,23,.06)',border:`1px solid rgba(212,160,23,.25)`,borderRadius:12,padding:'24px 26px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                    <span style={{fontSize:24}}>{d.icon}</span>
                    <div style={{fontWeight:800,color:GOLD,fontSize:14,textTransform:'uppercase',letterSpacing:.5}}>Saguaro</div>
                  </div>
                  <div style={{fontSize:16,fontWeight:800,color:TEXT,marginBottom:10}}>{d.title}</div>
                  <div style={{fontSize:13,color:DIM,lineHeight:1.75}}>{d.saguaro}</div>
                </div>
                <div style={{background:'rgba(255,255,255,.02)',border:`1px solid ${BORDER}`,borderRadius:12,padding:'24px 26px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                    <span style={{fontSize:24}}>{d.icon}</span>
                    <div style={{fontWeight:800,color:DIM,fontSize:14,textTransform:'uppercase',letterSpacing:.5}}>Procore</div>
                  </div>
                  <div style={{fontSize:16,fontWeight:800,color:DIM,marginBottom:10}}>{d.title}</div>
                  <div style={{fontSize:13,color:DIM,lineHeight:1.75}}>{d.procore}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quote / Social proof */}
      <div style={{maxWidth:720,margin:'60px auto',padding:'0 24px'}}>
        <div style={{background:RAISED,border:`1px solid rgba(212,160,23,.25)`,borderRadius:14,padding:'32px 36px',textAlign:'center'}}>
          <div style={{fontSize:28,color:GOLD,marginBottom:16}}>"</div>
          <p style={{fontSize:17,color:TEXT,lineHeight:1.7,fontStyle:'italic',margin:'0 0 20px'}}>
            We were paying $1,800/month for Procore and still doing lien waivers in Word. Switched to Saguaro and cut our admin time by 60% in the first week.
          </p>
          <div style={{fontSize:13,color:DIM}}>— General Contractor, Phoenix AZ · 45 employees</div>
        </div>
      </div>

      {/* Final CTA */}
      <div style={{textAlign:'center',padding:'60px 24px',background:RAISED,borderTop:`1px solid ${BORDER}`}}>
        <h2 style={{fontSize:36,fontWeight:900,marginBottom:12}}>Ready to make the switch?</h2>
        <p style={{color:DIM,fontSize:16,marginBottom:8}}>Start your free trial today. No credit card. No annual contract. No sales call required.</p>
        <p style={{color:DIM,fontSize:13,marginBottom:32}}>We'll even help you migrate your data from Procore.</p>
        <a href="/signup" style={{display:'inline-block',padding:'15px 40px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,borderRadius:10,color:'#0d1117',fontWeight:800,fontSize:16,textDecoration:'none'}}>Try Saguaro Free →</a>
        <div style={{marginTop:20,fontSize:13,color:DIM}}>
          Also compare: <a href="/compare/buildertrend" style={{color:GOLD,textDecoration:'none'}}>Saguaro vs Buildertrend</a>
        </div>
      </div>
    </div>
  );
}
