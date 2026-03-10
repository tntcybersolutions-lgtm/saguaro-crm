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
  {feature:'Starting Price',saguaro:'$49/mo',bt:'$199/mo',saguaroWin:true,note:'Buildertrend pricing increases with features'},
  {feature:'Primary Market',saguaro:'Commercial GC',bt:'Residential / Remodel',saguaroWin:false,note:'Different tools built for different workflows'},
  {feature:'AI Autopilot',saguaro:'✓ Included',bt:'✗ Not available',saguaroWin:true,note:'Automated RFI/CO workflow intelligence'},
  {feature:'AIA Pay App Generator',saguaro:'✓ G702/G703',bt:'Custom invoicing only',saguaroWin:true,note:'Buildertrend uses homeowner-style billing, not AIA forms'},
  {feature:'Lien Waiver Automation',saguaro:'✓ All 50 states',bt:'Limited',saguaroWin:true,note:'Saguaro generates statutory-language lien waivers automatically'},
  {feature:'Certified Payroll WH-347',saguaro:'✓ DOL API integration',bt:'✗ Not available',saguaroWin:true,note:'Required for all federally-funded projects'},
  {feature:'AI Takeoff',saguaro:'✓ Blueprint PDF → quantities',bt:'✗ Not available',saguaroWin:true,note:''},
  {feature:'Preliminary Notices',saguaro:'✓ AZ, CA, TX, NV, FL',bt:'✗ Not available',saguaroWin:true,note:'Critical for preserving lien rights'},
  {feature:'Bid Intelligence',saguaro:'✓ AI bid scoring',bt:'Basic bid tracking',saguaroWin:true,note:''},
  {feature:'Contract Required',saguaro:'Month-to-month',bt:'Annual required',saguaroWin:true,note:''},
  {feature:'Mobile App',saguaro:'✓',bt:'✓',saguaroWin:false,note:'Both offer mobile apps'},
  {feature:'Client Portal',saguaro:'✓ Owner + Sub portals',bt:'✓ Homeowner portal',saguaroWin:false,note:'Different audiences'},
];

const DEEP_DIVE = [
  {
    title:'Built for Commercial GCs — Not Homebuilders',
    icon:'🏗️',
    saguaro:'Saguaro is purpose-built for commercial general contractors: prevailing wage, AIA documents, certified payroll, subcontractor compliance, preliminary notices, and lien rights. Every feature is designed for the GC that wins commercial bids.',
    bt:'Buildertrend is excellent for residential builders and remodelers — homeowner budgets, selection sheets, warranty tracking. If your work is commercial, you will constantly work around what Buildertrend doesn\'t support.',
  },
  {
    title:'Pay App Generation That Actually Works',
    icon:'📄',
    saguaro:'Saguaro generates legally-compliant G702/G703 AIA pay applications in seconds, with automatic schedule of values, stored value history, and one-click PDF submission to owners. The entire billing workflow — from schedule of values to lien waiver release — is automated.',
    bt:'Buildertrend\'s billing module is designed for homeowner invoicing, not AIA-format pay applications. Commercial teams using Buildertrend still generate G702/G703 manually in Excel or external tools — adding hours of admin per billing cycle.',
  },
  {
    title:'Lien Waiver Automation That Protects Your Business',
    icon:'🔒',
    saguaro:'Automatically generate conditional and unconditional lien waivers when pay apps are approved. State-specific statutory language for AZ, CA, TX, NV, FL, CO, WA, OR, UT, and NM. Bulk generation for all subs on a project. Electronic signature integration.',
    bt:'Buildertrend has limited lien waiver functionality focused on residential workflows. Commercial GCs managing dozens of subcontractors across multiple states need a dedicated lien waiver system — which is exactly what Saguaro provides.',
  },
];

export default function CompareBuilderTrendPage() {
  return (
    <div style={{minHeight:'100vh',background:DARK,color:TEXT,fontFamily:'system-ui,sans-serif'}}>
      {NAV}

      {/* Hero */}
      <div style={{paddingTop:80,textAlign:'center',padding:'100px 24px 60px'}}>
        <div style={{fontSize:12,fontWeight:700,color:GOLD,textTransform:'uppercase',letterSpacing:2,marginBottom:14}}>Saguaro vs Buildertrend</div>
        <h1 style={{fontSize:52,fontWeight:900,margin:'0 0 16px',lineHeight:1.1}}>Commercial Power.<br/>Residential Price.</h1>
        <p style={{fontSize:18,color:DIM,maxWidth:600,margin:'0 auto 32px',lineHeight:1.6}}>
          Buildertrend is great for homebuilders. Saguaro is built for commercial GCs who need AIA documents, certified payroll, lien automation, and AI — at a price that makes sense.
        </p>
        <div style={{display:'inline-flex',gap:16,alignItems:'center'}}>
          <a href="/signup" style={{padding:'14px 32px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,borderRadius:9,color:'#0d1117',fontWeight:800,fontSize:15,textDecoration:'none'}}>Try Saguaro Free →</a>
          <a href="/pricing" style={{padding:'14px 28px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:9,color:TEXT,fontWeight:700,fontSize:14,textDecoration:'none'}}>See Pricing</a>
        </div>
        <div style={{marginTop:16,fontSize:12,color:DIM}}>No credit card required. 30-day free trial.</div>
      </div>

      {/* Market Callout */}
      <div style={{maxWidth:900,margin:'0 auto',padding:'0 24px 40px'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div style={{background:'rgba(212,160,23,.08)',border:`1px solid rgba(212,160,23,.3)`,borderRadius:12,padding:'20px 24px',textAlign:'center'}}>
            <div style={{fontSize:22,marginBottom:8}}>🌵</div>
            <div style={{fontWeight:800,color:GOLD,fontSize:14,marginBottom:4}}>Saguaro is built for...</div>
            <div style={{fontSize:13,color:DIM,lineHeight:1.6}}>Commercial GCs, public works, government contracts, prevailing wage projects, ENR-track firms, and any team managing subcontractors with AIA billing requirements.</div>
          </div>
          <div style={{background:'rgba(255,255,255,.03)',border:`1px solid ${BORDER}`,borderRadius:12,padding:'20px 24px',textAlign:'center'}}>
            <div style={{fontSize:22,marginBottom:8}}>🏠</div>
            <div style={{fontWeight:800,color:DIM,fontSize:14,marginBottom:4}}>Buildertrend is built for...</div>
            <div style={{fontSize:13,color:DIM,lineHeight:1.6}}>Residential homebuilders, custom home builders, remodelers, and renovation contractors who primarily work directly with homeowners on private projects.</div>
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div style={{maxWidth:1000,margin:'0 auto',padding:'0 24px 80px'}}>
        <div style={{border:`1px solid ${BORDER}`,borderRadius:14,overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',background:'#0d1117',borderBottom:`1px solid ${BORDER}`}}>
            <div style={{padding:'18px 24px',fontWeight:700,fontSize:13,color:DIM,textTransform:'uppercase',letterSpacing:.5}}>Feature</div>
            <div style={{padding:'18px 24px',textAlign:'center',borderLeft:`1px solid ${BORDER}`}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                <span style={{fontSize:18}}>🌵</span>
                <span style={{fontWeight:800,fontSize:16,color:GOLD}}>Saguaro</span>
              </div>
            </div>
            <div style={{padding:'18px 24px',textAlign:'center',borderLeft:`1px solid ${BORDER}`}}>
              <div style={{fontWeight:800,fontSize:16,color:DIM}}>Buildertrend</div>
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
                <span style={{color:row.bt.startsWith('✗')?RED:DIM,fontSize:13}}>{row.bt}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Deep Dive */}
      <div style={{background:RAISED,borderTop:`1px solid ${BORDER}`,borderBottom:`1px solid ${BORDER}`,padding:'60px 24px'}}>
        <div style={{maxWidth:1000,margin:'0 auto'}}>
          <h2 style={{fontSize:32,fontWeight:900,textAlign:'center',marginBottom:12}}>The Commercial GC Advantage</h2>
          <p style={{color:DIM,textAlign:'center',marginBottom:48,fontSize:15}}>Where the difference becomes clear for commercial work.</p>
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
                    <div style={{fontWeight:800,color:DIM,fontSize:14,textTransform:'uppercase',letterSpacing:.5}}>Buildertrend</div>
                  </div>
                  <div style={{fontSize:16,fontWeight:800,color:DIM,marginBottom:10}}>{d.title}</div>
                  <div style={{fontSize:13,color:DIM,lineHeight:1.75}}>{d.bt}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quote */}
      <div style={{maxWidth:720,margin:'60px auto',padding:'0 24px'}}>
        <div style={{background:RAISED,border:`1px solid rgba(212,160,23,.25)`,borderRadius:14,padding:'32px 36px',textAlign:'center'}}>
          <div style={{fontSize:28,color:GOLD,marginBottom:16}}>"</div>
          <p style={{fontSize:17,color:TEXT,lineHeight:1.7,fontStyle:'italic',margin:'0 0 20px'}}>
            We tried Buildertrend for 6 months. Great for our residential division. Completely wrong for the commercial side — we still had to do pay apps and lien waivers manually. Saguaro solved that in the first week.
          </p>
          <div style={{fontSize:13,color:DIM}}>— GC with both residential and commercial divisions, Tucson AZ</div>
        </div>
      </div>

      {/* Final CTA */}
      <div style={{textAlign:'center',padding:'60px 24px',background:RAISED,borderTop:`1px solid ${BORDER}`}}>
        <h2 style={{fontSize:36,fontWeight:900,marginBottom:12}}>Built for the way commercial GCs actually work.</h2>
        <p style={{color:DIM,fontSize:16,marginBottom:8}}>30-day free trial. No credit card. Cancel anytime.</p>
        <p style={{color:DIM,fontSize:13,marginBottom:32}}>We'll help you get set up in under a day.</p>
        <a href="/signup" style={{display:'inline-block',padding:'15px 40px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,borderRadius:10,color:'#0d1117',fontWeight:800,fontSize:16,textDecoration:'none'}}>Try Saguaro Free →</a>
        <div style={{marginTop:20,fontSize:13,color:DIM}}>
          Also compare: <a href="/compare/procore" style={{color:GOLD,textDecoration:'none'}}>Saguaro vs Procore</a>
        </div>
      </div>
    </div>
  );
}
