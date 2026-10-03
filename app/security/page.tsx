import React from 'react';
import Link from 'next/link';
import { Lock, ShieldCheck, Wall, Globe, Flask, Prohibit, Package, Trash } from '@phosphor-icons/react/dist/ssr';
import type { Icon } from '@phosphor-icons/react';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',DIM='#CBD5E1',TEXT='#FFFFFF',GREEN='#2CFF7A',HAIRLINE='rgba(255,255,255,0.08)',CARD='rgba(255,255,255,0.02)';

const NAV = (
  <nav style={{position:'fixed',top:0,left:0,right:0,zIndex:200,height:64,background:'rgba(13,17,23,0.9)',borderBottom:`1px solid ${HAIRLINE}`,display:'flex',alignItems:'center',padding:'0 32px',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)'}}>
    <Link href="/" style={{display:'flex',alignItems:'center',textDecoration:'none',flexShrink:0}} aria-label="Saguaro Control Systems — home">
      <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{height:36,width:'auto',mixBlendMode:'screen',objectFit:'contain'}} />
    </Link>
    <div style={{flex:1}}/>
    <Link href="/login" style={{padding:'8px 16px',background:'transparent',border:`1px solid rgba(255,255,255,0.14)`,borderRadius:8,color:DIM,fontSize:13,fontWeight:500,textDecoration:'none'}}>Log In</Link>
    <Link href="/signup" style={{marginLeft:10,padding:'8px 18px',background:GOLD,borderRadius:8,color:'#0A0A00',fontSize:13,fontWeight:600,textDecoration:'none'}}>Start Free</Link>
  </nav>
);

const FEATURES: { icon: Icon; title: string; desc: string; color: string; border: string }[] = [
  {icon:Lock,title:'256-bit AES Encryption',desc:'All data at rest is encrypted using AES-256, the same standard used by banks and government agencies. Your data is unreadable without your credentials.',color:'rgba(44,255,122,.08)',border:'rgba(44,255,122,.25)'},
  {icon:ShieldCheck,title:'TLS 1.3 in Transit',desc:'Every byte transferred between your browser and our servers is protected with TLS 1.3. We enforce HTTPS everywhere and reject older protocols.',color:'rgba(44,255,122,.08)',border:'rgba(44,255,122,.25)'},
  {icon:Wall,title:'Row-Level Security',desc:'Powered by Supabase RLS policies. Each user can only access their own organization\'s data — enforced at the database layer, not just the application layer.',color:'rgba(44,255,122,.08)',border:'rgba(44,255,122,.25)'},
  {icon:Globe,title:'GDPR Compliant',desc:'We honor data subject rights: access, correction, deletion, and export. Data processing agreements available. EU residents can request their data at any time.',color:'rgba(44,255,122,.08)',border:'rgba(44,255,122,.25)'},
  {icon:Flask,title:'Penetration Testing',desc:'Annual third-party penetration tests are conducted by independent security firms. Findings are remediated within 30 days. Reports available under NDA for Enterprise customers.',color:'rgba(44,255,122,.08)',border:'rgba(44,255,122,.25)'},
];

const INFRA = [
  {label:'Cloud Provider',value:'AWS us-east-1 (via Supabase + Vercel)'},
  {label:'Uptime SLA',value:'99.9% monthly — Enterprise 99.99%'},
  {label:'Automatic Backups',value:'Daily backups with 30-day retention'},
  {label:'Point-in-Time Recovery',value:'Restore to any second in the last 7 days'},
  {label:'CDN & Edge Network',value:'Vercel global edge — <50ms for 95% of users'},
  {label:'Database',value:'PostgreSQL 15 (Supabase managed)'},
];

const DATA: { icon: Icon; title: string; desc: string }[] = [
  {icon:Prohibit,title:'We Never Sell Your Data',desc:'Your project data, documents, and company information are never sold to third parties — ever. Period.'},
  {icon:Package,title:'Data Export Anytime',desc:'Export all your data in machine-readable JSON or CSV format at any time from Settings. No hoops to jump through.'},
  {icon:Trash,title:'30-Day Retention After Cancel',desc:'When you cancel, your data is preserved for 30 days. After that it is permanently deleted. You can also request immediate deletion.'},
];

export default function SecurityPage() {
  return (
    <div className="mkt-page" style={{minHeight:'100vh',background:DARK,color:TEXT,fontFamily:'system-ui,-apple-system,BlinkMacSystemFont,sans-serif'}}>
      <style>{`@media(max-width:640px){.sec-grid{grid-template-columns:1fr !important;}.data-grid{grid-template-columns:1fr !important;}}`}</style>
      {NAV}

      {/* Hero */}
      <div style={{textAlign:'center',padding:'140px 24px 88px',maxWidth:640,margin:'0 auto'}}>
        <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'6px 14px',background:'transparent',border:`1px solid rgba(255,255,255,0.14)`,borderRadius:999,fontSize:12,fontWeight:500,color:DIM,letterSpacing:0.3,marginBottom:28}}>
          <span style={{width:6,height:6,borderRadius:'50%',background:GOLD,display:'inline-block'}} />
          Security & Compliance
        </div>
        <h1 style={{fontSize:'clamp(26px,4vw,30px)',fontWeight:600,margin:'0 0 18px',lineHeight:1.15,letterSpacing:-0.5}}>Enterprise-Grade Security</h1>
        <p style={{fontSize:'clamp(15px,2vw,17px)',color:DIM,maxWidth:540,margin:'0 auto',lineHeight:1.65}}>Your construction data protected at every layer — from the database to your browser.</p>
      </div>

      {/* Feature Grid */}
      <div style={{maxWidth:1100,margin:'0 auto',padding:'0 24px 96px'}}>
        <h2 style={{fontSize:22,fontWeight:600,marginBottom:40,textAlign:'center'}}>Security Features</h2>
        <div className="sec-grid" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:0}}>
          {FEATURES.map((f,i)=>(
            <div key={f.title} style={{padding:'28px',borderTop:`1px solid ${HAIRLINE}`,borderRight:i%3!==2?`1px solid ${HAIRLINE}`:'none'}}>
              <div style={{width:44,height:44,borderRadius:12,background:'rgba(255,255,255,0.03)',border:`1px solid ${HAIRLINE}`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:14}}><f.icon size={20} weight="duotone" color={GOLD} /></div>
              <div style={{fontWeight:600,fontSize:15,color:TEXT,marginBottom:8}}>{f.title}</div>
              <div style={{fontSize:13,color:DIM,lineHeight:1.7}}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Infrastructure */}
      <div style={{borderTop:`1px solid ${HAIRLINE}`,padding:'96px 24px'}}>
        <div style={{maxWidth:900,margin:'0 auto'}}>
          <h2 style={{fontSize:22,fontWeight:600,marginBottom:8,textAlign:'center'}}>Built on Supabase + Vercel</h2>
          <p style={{color:DIM,textAlign:'center',marginBottom:40,fontSize:15,lineHeight:1.65}}>Industry-leading infrastructure so you can focus on building — not on uptime.</p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0,background:CARD,border:`1px solid ${HAIRLINE}`,borderRadius:14,overflow:'hidden'}}>
            {INFRA.map((row,i)=>(
              <div key={row.label} style={{padding:'18px 24px',borderBottom:`1px solid ${HAIRLINE}`,borderRight:i%2===0?`1px solid ${HAIRLINE}`:'none'}}>
                <div style={{fontSize:12,fontWeight:600,color:DIM,marginBottom:4}}>{row.label}</div>
                <div style={{fontWeight:500,color:TEXT,fontSize:14}}>{row.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Data Practices */}
      <div style={{maxWidth:1000,margin:'0 auto',padding:'96px 24px',borderTop:`1px solid ${HAIRLINE}`}}>
        <h2 style={{fontSize:22,fontWeight:600,marginBottom:8,textAlign:'center'}}>Our Data Practices</h2>
        <p style={{color:DIM,textAlign:'center',marginBottom:48,fontSize:15}}>We believe your data belongs to you. Full stop.</p>
        <div className="data-grid" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:0}}>
          {DATA.map((d,i)=>(
            <div key={d.title} style={{padding:'0 28px',borderRight:i<2?`1px solid ${HAIRLINE}`:'none'}}>
              <div style={{width:44,height:44,borderRadius:12,background:'rgba(255,255,255,0.03)',border:`1px solid ${HAIRLINE}`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:14}}><d.icon size={20} weight="duotone" color={GOLD} /></div>
              <div style={{fontWeight:600,fontSize:15,color:TEXT,marginBottom:8}}>{d.title}</div>
              <div style={{fontSize:13,color:DIM,lineHeight:1.7}}>{d.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Responsible Disclosure */}
      <div style={{maxWidth:720,margin:'0 auto',padding:'0 24px 96px'}}>
        <div style={{background:CARD,border:`1px solid ${HAIRLINE}`,borderRadius:14,padding:'28px 32px'}}>
          <div style={{fontWeight:600,fontSize:16,color:TEXT,marginBottom:8}}>Responsible Disclosure</div>
          <p style={{color:DIM,fontSize:14,lineHeight:1.7,margin:'0 0 12px'}}>
            Found a security vulnerability? We take all reports seriously. Please email us at{' '}
            <a href="mailto:security@saguarocontrol.net" style={{color:GOLD,textDecoration:'none',fontWeight:500}}>security@saguarocontrol.net</a>{' '}
            and we will respond within 24 hours. We do not pursue legal action against good-faith researchers.
          </p>
          <div style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:DIM,flexWrap:'wrap'}}>
            <span style={{color:GREEN}}>✓</span> We acknowledge receipt within 24h
            <span style={{marginLeft:12,color:GREEN}}>✓</span> We remediate critical findings within 7 days
            <span style={{marginLeft:12,color:GREEN}}>✓</span> We credit researchers who disclose responsibly
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{textAlign:'center',padding:'112px 24px',borderTop:`1px solid ${HAIRLINE}`}}>
        <h2 style={{fontSize:'clamp(22px,3vw,26px)',fontWeight:600,marginBottom:16,letterSpacing:-0.4}}>Questions About Security?</h2>
        <p style={{color:DIM,fontSize:16,marginBottom:32,lineHeight:1.6}}>Our security team is here to help.</p>
        <a href="mailto:security@saguarocontrol.net" style={{display:'inline-block',padding:'12px 28px',background:GOLD,borderRadius:8,color:'#0A0A00',fontWeight:600,fontSize:15,textDecoration:'none'}}>
          security@saguarocontrol.net
        </a>
        <div style={{marginTop:24,fontSize:13,color:DIM}}>
          Also see: <Link href="/privacy" style={{color:GOLD,textDecoration:'none'}}>Privacy Policy</Link> · <Link href="/terms" style={{color:GOLD,textDecoration:'none'}}>Terms of Service</Link> · <Link href="/sla" style={{color:GOLD,textDecoration:'none'}}>SLA</Link>
        </div>
      </div>
    </div>
  );
}
