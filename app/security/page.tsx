import React from 'react';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#22c55e';

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

const FEATURES = [
  {icon:'🔐',title:'SOC 2 Type II',desc:'Audit in progress. We follow SOC 2 security, availability, and confidentiality trust principles. Expected certification Q3 2026.',color:'rgba(212,160,23,.15)',border:'rgba(212,160,23,.3)'},
  {icon:'🔒',title:'256-bit AES Encryption',desc:'All data at rest is encrypted using AES-256, the same standard used by banks and government agencies. Your data is unreadable without your credentials.',color:'rgba(34,197,94,.08)',border:'rgba(34,197,94,.25)'},
  {icon:'🛡️',title:'TLS 1.3 in Transit',desc:'Every byte transferred between your browser and our servers is protected with TLS 1.3. We enforce HTTPS everywhere and reject older protocols.',color:'rgba(34,197,94,.08)',border:'rgba(34,197,94,.25)'},
  {icon:'🧱',title:'Row-Level Security',desc:'Powered by Supabase RLS policies. Each user can only access their own organization\'s data — enforced at the database layer, not just the application layer.',color:'rgba(34,197,94,.08)',border:'rgba(34,197,94,.25)'},
  {icon:'🌍',title:'GDPR Compliant',desc:'We honor data subject rights: access, correction, deletion, and export. Data processing agreements available. EU residents can request their data at any time.',color:'rgba(34,197,94,.08)',border:'rgba(34,197,94,.25)'},
  {icon:'🧪',title:'Penetration Testing',desc:'Annual third-party penetration tests are conducted by independent security firms. Findings are remediated within 30 days. Reports available under NDA for Enterprise customers.',color:'rgba(34,197,94,.08)',border:'rgba(34,197,94,.25)'},
];

const INFRA = [
  {label:'Cloud Provider',value:'AWS us-east-1 (via Supabase + Vercel)'},
  {label:'Uptime SLA',value:'99.9% monthly — Enterprise 99.99%'},
  {label:'Automatic Backups',value:'Daily backups with 30-day retention'},
  {label:'Point-in-Time Recovery',value:'Restore to any second in the last 7 days'},
  {label:'CDN & Edge Network',value:'Vercel global edge — <50ms for 95% of users'},
  {label:'Database',value:'PostgreSQL 15 (Supabase managed)'},
];

const DATA = [
  {icon:'🚫',title:'We Never Sell Your Data',desc:'Your project data, documents, and company information are never sold to third parties — ever. Period.'},
  {icon:'📦',title:'Data Export Anytime',desc:'Export all your data in machine-readable JSON or CSV format at any time from Settings. No hoops to jump through.'},
  {icon:'🗑️',title:'30-Day Retention After Cancel',desc:'When you cancel, your data is preserved for 30 days. After that it is permanently deleted. You can also request immediate deletion.'},
];

export default function SecurityPage() {
  return (
    <div style={{minHeight:'100vh',background:DARK,color:TEXT,fontFamily:'system-ui,sans-serif'}}>
      {NAV}

      {/* Hero */}
      <div style={{paddingTop:120,textAlign:'center',padding:'120px 24px 80px'}}>
        <div style={{fontSize:12,fontWeight:700,color:GOLD,textTransform:'uppercase',letterSpacing:2,marginBottom:14}}>Security & Compliance</div>
        <h1 style={{fontSize:52,fontWeight:900,margin:'0 0 16px',lineHeight:1.1}}>Enterprise-Grade Security</h1>
        <p style={{fontSize:20,color:DIM,maxWidth:540,margin:'0 auto',lineHeight:1.6}}>Your construction data protected at every layer — from the database to your browser.</p>
      </div>

      {/* Feature Grid */}
      <div style={{maxWidth:1100,margin:'0 auto',padding:'0 24px 80px'}}>
        <h2 style={{fontSize:28,fontWeight:800,marginBottom:32,textAlign:'center'}}>Security Features</h2>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20}}>
          {FEATURES.map(f=>(
            <div key={f.title} style={{background:f.color,border:`1px solid ${f.border}`,borderRadius:12,padding:'24px 22px'}}>
              <div style={{fontSize:32,marginBottom:12}}>{f.icon}</div>
              <div style={{fontWeight:800,fontSize:15,color:TEXT,marginBottom:8}}>{f.title}</div>
              <div style={{fontSize:13,color:DIM,lineHeight:1.7}}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Infrastructure */}
      <div style={{background:RAISED,borderTop:`1px solid ${BORDER}`,borderBottom:`1px solid ${BORDER}`,padding:'60px 24px'}}>
        <div style={{maxWidth:900,margin:'0 auto'}}>
          <h2 style={{fontSize:28,fontWeight:800,marginBottom:8,textAlign:'center'}}>Built on Supabase + Vercel</h2>
          <p style={{color:DIM,textAlign:'center',marginBottom:40,fontSize:15}}>Industry-leading infrastructure so you can focus on building — not on uptime.</p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>
            {INFRA.map((row,i)=>(
              <div key={row.label} style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,borderRight:i%2===0?`1px solid ${BORDER}`:'none',background:i%4<2?'rgba(255,255,255,.01)':'transparent'}}>
                <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:.5,color:DIM,marginBottom:4}}>{row.label}</div>
                <div style={{fontWeight:600,color:TEXT,fontSize:14}}>{row.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Data Practices */}
      <div style={{maxWidth:900,margin:'0 auto',padding:'60px 24px 80px'}}>
        <h2 style={{fontSize:28,fontWeight:800,marginBottom:8,textAlign:'center'}}>Our Data Practices</h2>
        <p style={{color:DIM,textAlign:'center',marginBottom:40,fontSize:15}}>We believe your data belongs to you. Full stop.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20}}>
          {DATA.map(d=>(
            <div key={d.title} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:12,padding:'28px 24px',textAlign:'center'}}>
              <div style={{fontSize:36,marginBottom:14}}>{d.icon}</div>
              <div style={{fontWeight:800,fontSize:15,color:TEXT,marginBottom:8}}>{d.title}</div>
              <div style={{fontSize:13,color:DIM,lineHeight:1.7}}>{d.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Responsible Disclosure */}
      <div style={{maxWidth:720,margin:'0 auto',padding:'0 24px 60px'}}>
        <div style={{background:'rgba(212,160,23,.06)',border:`1px solid rgba(212,160,23,.25)`,borderRadius:12,padding:'28px 32px'}}>
          <div style={{fontWeight:800,fontSize:16,color:TEXT,marginBottom:8}}>Responsible Disclosure</div>
          <p style={{color:DIM,fontSize:14,lineHeight:1.7,margin:'0 0 12px'}}>
            Found a security vulnerability? We take all reports seriously. Please email us at{' '}
            <a href="mailto:security@saguarocrm.com" style={{color:GOLD,textDecoration:'none',fontWeight:700}}>security@saguarocrm.com</a>{' '}
            and we will respond within 24 hours. We do not pursue legal action against good-faith researchers.
          </p>
          <div style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:DIM}}>
            <span style={{color:GREEN}}>✓</span> We acknowledge receipt within 24h
            <span style={{marginLeft:12,color:GREEN}}>✓</span> We remediate critical findings within 7 days
            <span style={{marginLeft:12,color:GREEN}}>✓</span> We credit researchers who disclose responsibly
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{textAlign:'center',padding:'60px 24px',background:RAISED,borderTop:`1px solid ${BORDER}`}}>
        <h2 style={{fontSize:28,fontWeight:900,marginBottom:12}}>Questions about security?</h2>
        <p style={{color:DIM,fontSize:16,marginBottom:20}}>Our security team is here to help.</p>
        <a href="mailto:security@saguarocrm.com" style={{display:'inline-block',padding:'13px 32px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,borderRadius:9,color:'#0d1117',fontWeight:800,fontSize:15,textDecoration:'none'}}>
          security@saguarocrm.com
        </a>
        <div style={{marginTop:20,fontSize:13,color:DIM}}>
          Also see: <a href="/privacy" style={{color:GOLD,textDecoration:'none'}}>Privacy Policy</a> · <a href="/terms" style={{color:GOLD,textDecoration:'none'}}>Terms of Service</a> · <a href="/sla" style={{color:GOLD,textDecoration:'none'}}>SLA</a>
        </div>
      </div>
    </div>
  );
}
