'use client';
import React, { useEffect, useState } from 'react';

const GOLD  = '#F59E0B';
const DARK  = '#0d1117';
const RAISED = '#0F172A';
const BORDER = '#1E3A5F';
const DIM   = '#CBD5E1';
const TEXT  = '#F8FAFC';
const GREEN = '#22c55e';

const STEPS = [
  { icon: '📐', title: 'Upload your first blueprint', desc: 'Drop any PDF blueprint and Sage AI reads every dimension in 41 seconds.', href: '/app/takeoff', cta: 'Try AI Takeoff →' },
  { icon: '👥', title: 'Invite your team', desc: 'Add unlimited PMs, supers, estimators, and field crew — all included in your plan.', href: '/app', cta: 'Go to Dashboard →' },
  { icon: '📱', title: 'Install the field app', desc: 'Get Saguaro Field on your phone. No app store — installs from your browser in 30 seconds.', href: '/get-the-app', cta: 'Install Now →' },
  { icon: '📄', title: 'Generate your first pay app', desc: 'Create an AIA G702/G703 application for payment in under 2 minutes.', href: '/app/projects', cta: 'Start a Project →' },
];

export default function WelcomePage() {
  const [name, setName] = useState('');

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.name) setName(d.name.split(' ')[0]);
    });
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: DARK, color: TEXT, fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>

      {/* Confetti-style top accent */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${GOLD}, #FCD34D, ${GREEN}, ${GOLD})` }} />

      <div style={{ maxWidth: 680, width: '100%', textAlign: 'center' }}>

        {/* Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'rgba(34,197,94,0.1)', border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 20, fontSize: 12, fontWeight: 700, color: GREEN, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 24 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN, display: 'inline-block' }} />
          30-Day Free Trial Active
        </div>

        {/* Heading */}
        <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 900, margin: '0 0 16px', lineHeight: 1.1, letterSpacing: -1 }}>
          {name ? `Welcome to Saguaro, ${name}!` : 'Welcome to Saguaro!'}
        </h1>
        <p style={{ fontSize: 18, color: DIM, margin: '0 0 48px', lineHeight: 1.65 }}>
          You're all set. Your account is live and your 30-day free trial has started.<br />
          Here's how to get the most out of it in the next 10 minutes:
        </p>

        {/* Steps */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 40, textAlign: 'left' }}>
          {STEPS.map((step, i) => (
            <div key={i} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '24px 22px', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 16, right: 16, width: 24, height: 24, borderRadius: '50%', background: 'rgba(245,158,11,0.12)', border: `1px solid rgba(245,158,11,0.25)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: GOLD }}>
                {i + 1}
              </div>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{step.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 6 }}>{step.title}</div>
              <div style={{ fontSize: 13, color: DIM, lineHeight: 1.6, marginBottom: 16 }}>{step.desc}</div>
              <a href={step.href} style={{ display: 'inline-block', padding: '8px 16px', background: 'rgba(245,158,11,0.1)', border: `1px solid rgba(245,158,11,0.25)`, borderRadius: 7, color: GOLD, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                {step.cta}
              </a>
            </div>
          ))}
        </div>

        {/* Primary CTA */}
        <a href="/app" style={{ display: 'inline-block', padding: '16px 48px', background: `linear-gradient(135deg, ${GOLD}, #D97706)`, borderRadius: 10, color: '#000', fontWeight: 900, fontSize: 17, textDecoration: 'none', boxShadow: `0 8px 32px rgba(245,158,11,0.35)`, marginBottom: 24 }}>
          Go to My Dashboard →
        </a>

        {/* Trial info */}
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
          {['30 days free', 'No credit card yet', 'Cancel anytime', 'Free migration included'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: DIM }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="8" fill="rgba(34,197,94,0.15)" />
                <path d="M4.5 8l2.5 2.5 4-5" stroke={GREEN} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t}
            </div>
          ))}
        </div>

        {/* Support line */}
        <p style={{ fontSize: 13, color: DIM }}>
          Questions? Chat with Sage AI in the app, or email us at{' '}
          <a href="mailto:support@saguarocontrol.net" style={{ color: GOLD, textDecoration: 'none' }}>support@saguarocontrol.net</a>
        </p>
      </div>
    </div>
  );
}
