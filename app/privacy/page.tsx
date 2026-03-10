'use client';
import React from 'react';
const GOLD='#D4A017',DARK='#0d1117',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';
export default function PrivacyPage(){
  return (
    <div style={{minHeight:'100vh',background:DARK,color:TEXT,fontFamily:'system-ui,sans-serif'}}>
      <nav style={{position:'fixed' as const,top:0,left:0,right:0,zIndex:100,height:56,background:'rgba(13,17,23,.96)',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',padding:'0 32px',backdropFilter:'blur(12px)'}}>
        <a href="/" style={{display:'flex',alignItems:'center',gap:8,textDecoration:'none'}}><span style={{fontSize:22}}>🌵</span><span style={{fontWeight:800,fontSize:16,letterSpacing:1,color:GOLD}}>SAGUARO</span></a>
      </nav>
      <div style={{maxWidth:780,margin:'0 auto',padding:'88px 32px 60px'}}>
        <h1 style={{fontSize:36,fontWeight:900,marginBottom:8}}>Privacy Policy</h1>
        <p style={{color:DIM,marginBottom:40}}>Last updated: March 10, 2026</p>
        {[
          {h:'Information We Collect',b:'We collect: (1) Account information — name, email, company, phone when you sign up. (2) Project data — project details, documents, and files you upload. (3) Usage data — features used, pages visited, actions taken within the app. (4) Payment information — processed by Stripe; we never store full card numbers. (5) Communications — emails and support messages.'},
          {h:'How We Use Your Information',b:'We use your data to: provide and improve the Service; send transactional emails (account, billing, document notifications); respond to support requests; analyze usage to improve features; comply with legal obligations. We do NOT sell your personal information to third parties. We do NOT use your project data to train AI models.'},
          {h:'Data Storage and Security',b:'All data is encrypted at rest (AES-256) and in transit (TLS 1.3). Hosted on Supabase (AWS us-east-1). We maintain automated backups. Access is restricted to authorized personnel. We are pursuing SOC2 Type II certification.'},
          {h:'Cookies and Tracking',b:'We use cookies for: authentication (session tokens), preferences, and analytics (Google Analytics 4, PostHog). You can disable non-essential cookies in your browser. We use no advertising trackers.'},
          {h:'Data Retention',b:'Active account data is retained as long as your account is active. After account cancellation, data is retained for 30 days then deleted. You may request immediate deletion at privacy@saguarocrm.com.'},
          {h:'Your Rights (CCPA/GDPR)',b:'You have the right to: access your personal data; correct inaccurate data; request deletion of your data; export your data in machine-readable format; opt out of marketing emails at any time. To exercise these rights, email privacy@saguarocrm.com.'},
          {h:'Third-Party Services',b:'We use: Supabase (database), Stripe (payments), Resend (email delivery), Anthropic (AI features), PostHog (product analytics), Google Analytics (web analytics), Vercel (hosting). Each has their own privacy policy.'},
          {h:'Children',b:"Our Service is not directed at children under 13. We do not knowingly collect data from children."},
          {h:'Changes to This Policy',b:'We will notify users of material changes via email and in-app notice 30 days before changes take effect.'},
          {h:'Contact',b:'Privacy questions: privacy@saguarocrm.com · TNT Cyber Solutions · Scottsdale, AZ 85251'},
        ].map(s=>(
          <div key={s.h} style={{marginBottom:28}}>
            <h2 style={{fontSize:18,fontWeight:700,marginBottom:8,color:TEXT}}>{s.h}</h2>
            <p style={{color:DIM,lineHeight:1.8,margin:0}}>{s.b}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
