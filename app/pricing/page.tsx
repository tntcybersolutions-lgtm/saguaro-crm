'use client';
import React, { useState } from 'react';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#22c55e';

const PLANS = [
  {
    name:'Starter',price_mo:199,price_yr:1990,tagline:'For small GCs getting off spreadsheets',color:'#6b7280',
    features:['Up to 10 active projects','Unlimited users','AI Takeoff (50 pages/mo)','Pay Applications (G702/G703)','Lien Waivers — all states','Basic RFI & Change Orders','Email support'],
    not_included:['Certified Payroll (WH-347)','White Label','API Access','Priority support'],
  },
  {
    name:'Professional',price_mo:399,price_yr:3990,tagline:'For growing GCs managing multiple projects',color:GOLD,popular:true,
    features:['Unlimited active projects','Unlimited users','AI Takeoff (unlimited pages)','All AIA Documents (G702-G706, A310, A312)','All 4 Lien Waiver types — all states','Certified Payroll WH-347 + DOL wage lookup','ACORD 25 Insurance Tracker + COI Parser','OSHA 300 Log','Preliminary Notices (AZ/CA/TX)','Owner & Sub Portals','Autopilot (RFI/CO automation)','Bid Intelligence + Jacket Generator','Priority email + chat support'],
    not_included:['White Label','Custom integrations'],
  },
  {
    name:'Enterprise',price_mo:0,price_yr:0,tagline:'For large GCs, ENR 400 firms, and resellers',color:'#818cf8',
    features:['Everything in Professional','White Label (your brand, your domain)','Unlimited sandbox accounts','Custom API integrations','QuickBooks sync','Dedicated account manager','SLA guarantee (99.9% uptime)','Custom contract & invoicing','SAML SSO','Custom onboarding + training'],
    not_included:[],
  },
];

const FAQS = [
  {q:'Is it really unlimited users?',a:'Yes. One flat license, every person on your team — PMs, field supers, estimators, accounting — all included. We will never charge you per seat.'},
  {q:'What happens after the 30-day free trial?',a:'You\'ll be prompted to enter payment info. If you don\'t, your account pauses (data preserved) for 30 days before deletion. No surprise charges.'},
  {q:'Do you support prevailing wage projects?',a:'Yes. The WH-347 Certified Payroll generator connects to the DOL Davis-Bacon wage API and validates every worker\'s hourly rate against current prevailing wages.'},
  {q:'Which states are supported for lien waivers?',a:'All 50 states. AZ, CA, TX, NV, FL, CO, WA, OR, UT, and NM use state-specific statutory language. All other states use our attorney-reviewed generic form.'},
  {q:'Can I cancel anytime?',a:'Yes. Cancel anytime from your billing settings. You keep access until the end of your billing period. No cancellation fees.'},
  {q:'What is the White Label plan?',a:'Your GC firm or software company can resell Saguaro under your own brand, domain, and logo. Each of your clients gets their own sandboxed account. Contact us for pricing.'},
  {q:'Do you integrate with QuickBooks?',a:'QuickBooks sync is available on Enterprise. Budget line items, pay applications, and change orders can sync bidirectionally.'},
  {q:'Is my data secure?',a:'Data is encrypted at rest and in transit. Hosted on Supabase (Postgres) with row-level security. SOC2 audit in progress. We never sell your data.'},
];

export default function PricingPage(){
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number|null>(null);

  return (
    <div style={{minHeight:'100vh',background:DARK,color:TEXT,fontFamily:'system-ui,sans-serif'}}>
      {/* Nav */}
      <nav style={{position:'fixed' as const,top:0,left:0,right:0,zIndex:100,height:56,background:'rgba(13,17,23,.96)',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',padding:'0 32px',gap:24,backdropFilter:'blur(12px)'}}>
        <a href="/" style={{display:'flex',alignItems:'center',gap:8,textDecoration:'none'}}>
          <span style={{fontSize:22}}>🌵</span>
          <span style={{fontWeight:800,fontSize:16,letterSpacing:1,color:GOLD}}>SAGUARO</span>
          <span style={{fontSize:10,background:GOLD,color:'#0d1117',padding:'1px 6px',borderRadius:4,fontWeight:700}}>CRM</span>
        </a>
        <div style={{flex:1}}/>
        <a href="/login" style={{padding:'7px 16px',background:'rgba(212,160,23,.12)',border:`1px solid rgba(212,160,23,.3)`,borderRadius:7,color:GOLD,fontSize:13,fontWeight:700,textDecoration:'none'}}>Log In</a>
        <a href="/signup" style={{padding:'7px 16px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,textDecoration:'none'}}>Start Free Trial</a>
      </nav>

      <div style={{paddingTop:80}}>
        {/* Header */}
        <div style={{textAlign:'center' as const,padding:'60px 24px 40px'}}>
          <div style={{fontSize:12,fontWeight:700,color:GOLD,textTransform:'uppercase' as const,letterSpacing:2,marginBottom:12}}>Simple, Transparent Pricing</div>
          <h1 style={{fontSize:48,fontWeight:900,margin:'0 0 16px',lineHeight:1.1}}>One License.<br/>Your Whole Team.</h1>
          <p style={{fontSize:18,color:DIM,maxWidth:500,margin:'0 auto 32px',lineHeight:1.6}}>No per-seat fees. No module unlocks. No surprise charges. Just one flat rate for everything.</p>

          {/* Annual toggle */}
          <div style={{display:'inline-flex',alignItems:'center',gap:12,background:RAISED,borderRadius:8,padding:'6px 8px',border:`1px solid ${BORDER}`}}>
            <button onClick={()=>setAnnual(false)} style={{padding:'6px 16px',borderRadius:6,border:'none',background:!annual?GOLD:'transparent',color:!annual?'#0d1117':DIM,fontWeight:700,fontSize:13,cursor:'pointer'}}>Monthly</button>
            <button onClick={()=>setAnnual(true)} style={{padding:'6px 16px',borderRadius:6,border:'none',background:annual?GOLD:'transparent',color:annual?'#0d1117':DIM,fontWeight:700,fontSize:13,cursor:'pointer'}}>Annual</button>
            {annual&&<span style={{fontSize:11,fontWeight:700,color:GREEN,background:'rgba(34,197,94,.1)',padding:'2px 8px',borderRadius:4}}>SAVE 17%</span>}
          </div>
        </div>

        {/* Pricing cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20,maxWidth:1100,margin:'0 auto',padding:'0 24px 60px'}}>
          {PLANS.map(plan=>(
            <div key={plan.name} style={{background:RAISED,border:`2px solid ${plan.popular?plan.color:BORDER}`,borderRadius:14,overflow:'hidden',position:'relative' as const}}>
              {plan.popular&&<div style={{background:`linear-gradient(135deg,${GOLD},#F0C040)`,textAlign:'center' as const,padding:'6px 0',fontSize:11,fontWeight:800,color:'#0d1117',letterSpacing:1}}>MOST POPULAR</div>}
              <div style={{padding:'28px 24px'}}>
                <div style={{color:plan.color,fontWeight:800,fontSize:13,letterSpacing:1,textTransform:'uppercase' as const,marginBottom:6}}>{plan.name}</div>
                <div style={{fontSize:12,color:DIM,marginBottom:20}}>{plan.tagline}</div>
                {plan.price_mo>0?(
                  <div style={{marginBottom:20}}>
                    <span style={{fontSize:42,fontWeight:900,color:TEXT}}>${annual?Math.round(plan.price_yr/12):plan.price_mo}</span>
                    <span style={{fontSize:14,color:DIM}}>/mo</span>
                    {annual&&<div style={{fontSize:12,color:DIM,marginTop:4}}>${plan.price_yr}/year · Save ${(plan.price_mo*12)-plan.price_yr}/yr</div>}
                  </div>
                ):(
                  <div style={{marginBottom:20}}>
                    <span style={{fontSize:30,fontWeight:900,color:TEXT}}>Contact Sales</span>
                    <div style={{fontSize:12,color:DIM,marginTop:4}}>Custom pricing for your scale</div>
                  </div>
                )}
                <a href={plan.name==='Enterprise'?'mailto:sales@saguarocrm.com':'/app/signup'} style={{display:'block',textAlign:'center' as const,padding:'12px 0',background:plan.popular?`linear-gradient(135deg,${GOLD},#F0C040)`:'rgba(255,255,255,.06)',border:`1px solid ${plan.popular?'transparent':BORDER}`,borderRadius:8,color:plan.popular?'#0d1117':TEXT,fontWeight:800,fontSize:14,textDecoration:'none',marginBottom:24}}>
                  {plan.name==='Enterprise'?'Contact Sales':'Start Free Trial'}
                </a>
                <div style={{borderTop:`1px solid ${BORDER}`,paddingTop:20}}>
                  {plan.features.map(f=>(
                    <div key={f} style={{display:'flex',gap:8,alignItems:'flex-start',marginBottom:8,fontSize:13}}>
                      <span style={{color:GREEN,fontSize:14,lineHeight:1.4}}>✓</span>
                      <span style={{color:TEXT,lineHeight:1.4}}>{f}</span>
                    </div>
                  ))}
                  {plan.not_included.map(f=>(
                    <div key={f} style={{display:'flex',gap:8,alignItems:'flex-start',marginBottom:8,fontSize:13,opacity:.4}}>
                      <span style={{color:DIM,fontSize:14,lineHeight:1.4}}>✗</span>
                      <span style={{color:DIM,lineHeight:1.4}}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div style={{maxWidth:720,margin:'0 auto',padding:'0 24px 80px'}}>
          <h2 style={{fontSize:30,fontWeight:800,textAlign:'center' as const,marginBottom:32}}>Frequently Asked Questions</h2>
          {FAQS.map((faq,i)=>(
            <div key={i} style={{borderBottom:`1px solid ${BORDER}`,overflow:'hidden'}}>
              <button onClick={()=>setOpenFaq(openFaq===i?null:i)} style={{width:'100%',textAlign:'left' as const,padding:'18px 0',background:'none',border:'none',color:TEXT,fontSize:15,fontWeight:600,cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                {faq.q}
                <span style={{color:GOLD,fontSize:20,fontWeight:300}}>{openFaq===i?'−':'+'}</span>
              </button>
              {openFaq===i&&<div style={{padding:'0 0 18px',fontSize:14,color:DIM,lineHeight:1.7}}>{faq.a}</div>}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{textAlign:'center' as const,padding:'60px 24px',background:RAISED,borderTop:`1px solid ${BORDER}`}}>
          <h2 style={{fontSize:32,fontWeight:900,marginBottom:12}}>Ready to stop leaving money on the table?</h2>
          <p style={{color:DIM,fontSize:16,marginBottom:28}}>30-day free trial. No credit card required. Cancel anytime.</p>
          <a href="/signup" style={{display:'inline-block',padding:'14px 36px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,borderRadius:10,color:'#0d1117',fontWeight:800,fontSize:16,textDecoration:'none'}}>Start Free Trial →</a>
        </div>
      </div>
    </div>
  );
}
