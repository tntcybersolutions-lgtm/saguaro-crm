'use client';
import React from 'react';
import { Cactus } from '@phosphor-icons/react';
const GOLD='var(--brand-primary)',DARK='var(--bg-base)',BORDER='rgba(255,255,255,0.12)',DIM='var(--text-secondary)',TEXT='#FFFFFF';
export default function PrivacyPage(){
  return (
    <div style={{minHeight:'100vh',background:DARK,color:TEXT,fontFamily:'system-ui,sans-serif'}}>
      <nav style={{position:'fixed' as const,top:0,left:0,right:0,zIndex:100,height:56,background:'rgba(20,20,22,.96)',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',padding:'0 32px',backdropFilter:'blur(12px)'}}>
        <a href="/" style={{display:'flex',alignItems:'center',gap:8,textDecoration:'none'}}><Cactus size={22} weight="fill" color={GOLD} /><span style={{fontWeight:800,fontSize:16,color:GOLD}}>Saguaro</span></a>
      </nav>
      <div style={{maxWidth:780,margin:'0 auto',padding:'88px 32px 60px'}}>
        <h1 style={{fontSize:36,fontWeight:900,marginBottom:8}}>Privacy Policy</h1>
        <p style={{color:DIM,marginBottom:40}}>Last updated: September 25, 2026</p>
        {[
          {h:'Information We Collect',b:'We collect: (1) Account information — name, email, company, phone when you sign up. (2) Project data — project details, documents, and files you upload. (3) Usage data — features used, pages visited, actions taken within the app. (4) Payment information — processed by Stripe; we never store full card numbers. (5) Communications — emails and support messages.'},
          /* The mobile app asks the operating system for camera, microphone, photo
             library, calendar and background location. An App Review reviewer
             compares those Info.plist prompts against this policy, and a policy
             that covers only the website is a metadata rejection. Each sentence
             below maps to one permission the app actually requests. */
          {h:'The Saguaro Field Mobile App',b:'The iOS app asks for device permissions only when a feature needs one, and each is used for one purpose. Camera and microphone: capturing jobsite photos and video, punch-list proof, and voice notes you record. Photo library: attaching existing photos to daily logs and punch items, and saving photos you capture back to your library. Location: tagging field entries with the jobsite they were made at, and — only if you turn crew geofencing on — recording arrival and departure at a jobsite while the app is in the background. Calendar: adding project schedule tasks to your own calendar when you ask it to. You can refuse or withdraw any of these in iOS Settings; the rest of the app keeps working. We do not use the microphone, camera or location for anything other than the field record you are creating, and none of it is used for advertising or sold to anyone.'},
          {h:'Deleting Your Account',b:'You can delete your account from inside the app: Me → Delete account, or on the web at saguarocontrol.net under Settings. Deleting it removes your sign-in and your personal profile immediately. If other people are still on your company account, the company’s projects, daily logs, photos and pay applications stay with the company — that work belongs to the business, not to your login. If you are the last person on the account, the whole workspace is scheduled for permanent deletion 30 days later. Records we are legally required to retain, such as certified payroll and lien waivers, are kept until that obligation ends and are not used for any other purpose. Questions: privacy@saguarocontrol.net.'},
          {h:'How We Use Your Information',b:'We use your data to: provide and improve the Service; send transactional emails (account, billing, document notifications); respond to support requests; analyze usage to improve features; comply with legal obligations. We do NOT sell your personal information to third parties. We do NOT use your project data to train AI models.'},
          {h:'Data Storage and Security',b:'All data is encrypted at rest (AES-256) and in transit (TLS 1.3). Hosted on Supabase (AWS us-east-1). We maintain automated backups. Access is restricted to authorized personnel.'},
          {h:'Cookies and Tracking',b:'We use cookies for: authentication (session tokens), preferences, and analytics (Google Analytics 4, PostHog). You can disable non-essential cookies in your browser. We use no advertising trackers.'},
          {h:'Data Retention',b:'Active account data is retained as long as your account is active. After account cancellation, data is retained for 30 days then deleted. You may request immediate deletion at privacy@saguarocontrol.net.'},
          {h:'Your Rights (CCPA/GDPR)',b:'You have the right to: access your personal data; correct inaccurate data; request deletion of your data; export your data in machine-readable format; opt out of marketing emails at any time. To exercise these rights, email privacy@saguarocontrol.net.'},
          {h:'Third-Party Services',b:'We use: Supabase (database), Stripe (payments), Resend (email delivery), Anthropic (AI features), PostHog (product analytics), Google Analytics (web analytics), Vercel (hosting). Each has their own privacy policy.'},
          {h:'Children',b:"Our Service is not directed at children under 13. We do not knowingly collect data from children."},
          {h:'Changes to This Policy',b:'We will notify users of material changes via email and in-app notice 30 days before changes take effect.'},
          {h:'Contact',b:'Privacy questions: privacy@saguarocontrol.net · Saguaro Control Systems · Scottsdale, AZ 85251'},
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
