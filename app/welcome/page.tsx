'use client';
import React, { useEffect, useState } from 'react';

const GOLD  = '#F59E0B';
const DARK = '#F8F9FB';
const RAISED = '#0F172A';
const BORDER = '#1E3A5F';
const DIM   = '#CBD5E1';
const TEXT  = '#F8FAFC';
const GREEN = '#22c55e';

export default function WelcomePage() {
  const [name, setName] = useState('');

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.name) setName(d.name.split(' ')[0]);
    });
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: DARK, color: TEXT, fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", padding: '40px 24px' }}>

      {/* Top accent bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${GOLD}, #FCD34D, ${GREEN}, ${GOLD})` }} />

      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'rgba(34,197,94,0.1)', border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 20, fontSize: 12, fontWeight: 700, color: GREEN, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 24 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN, display: 'inline-block' }} />
          Account Created — 30-Day Free Trial Active
        </div>

        {/* Heading */}
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, margin: '0 0 12px', lineHeight: 1.1, letterSpacing: -0.5 }}>
          {name ? `You're in, ${name}!` : "You're in!"}
        </h1>
        <p style={{ fontSize: 16, color: DIM, margin: '0 0 40px', lineHeight: 1.7 }}>
          Your Saguaro account is live. Here's exactly how to access your platform and get your team set up.
        </p>

        {/* ACCESS CALLOUT — most important box */}
        <div style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(248,249,251,.97) 100%)', border: `1.5px solid rgba(245,158,11,0.4)`, borderRadius: 16, padding: '28px 32px', marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: GOLD, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>How to access your software</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
            Open any browser and go to{' '}
            <a href="/app" style={{ color: GOLD, textDecoration: 'none', borderBottom: `1px solid rgba(245,158,11,0.4)` }}>saguarocontrol.net/app</a>
          </div>
          <p style={{ fontSize: 14, color: DIM, margin: '0 0 20px', lineHeight: 1.65 }}>
            Saguaro is a <strong style={{ color: TEXT }}>web-based platform</strong> — there is nothing to download or install on your computer. Just bookmark this address and log in from any device, any time.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="/app" style={{ padding: '12px 28px', background: `linear-gradient(135deg, ${GOLD}, #D97706)`, borderRadius: 9, color: '#000', fontWeight: 900, fontSize: 14, textDecoration: 'none', boxShadow: `0 4px 20px rgba(245,158,11,0.3)` }}>
              Go to My Dashboard →
            </a>
            <a href="/get-the-app" style={{ padding: '12px 24px', background: '#F3F4F6', border: `1px solid ${BORDER}`, borderRadius: 9, color: TEXT, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              Install on Phone
            </a>
          </div>
        </div>

        {/* 4-step checklist */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Get the most out of your first 10 minutes:</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            {[
              {
                step: '1',
                icon: '🌐',
                title: 'Access your dashboard',
                desc: 'Go to saguarocontrol.net/app in any browser — Chrome, Safari, Edge, Firefox. Log in with your email and password.',
                href: '/app',
                cta: 'Open Dashboard →',
                primary: true,
              },
              {
                step: '2',
                icon: '📐',
                title: 'Upload your first blueprint',
                desc: 'Drop any PDF blueprint and Sage AI reads every dimension and generates a full material takeoff in under 60 seconds.',
                href: '/app/takeoff',
                cta: 'Try AI Takeoff →',
                primary: false,
              },
              {
                step: '3',
                icon: '📱',
                title: 'Install on your phone',
                desc: 'Open saguarocontrol.net on your iPhone or Android, tap the share/menu button, then "Add to Home Screen." No App Store needed.',
                href: '/get-the-app',
                cta: 'See Install Guide →',
                primary: false,
              },
              {
                step: '4',
                icon: '👥',
                title: 'Invite your team',
                desc: 'Add unlimited PMs, supers, estimators, and field crew. Your entire company is included — no per-seat fees ever.',
                href: '/app',
                cta: 'Invite Team →',
                primary: false,
              },
            ].map((item, i) => (
              <div key={i} style={{ background: RAISED, border: `1px solid ${item.primary ? 'rgba(245,158,11,0.3)' : BORDER}`, borderRadius: 14, padding: '22px 22px', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 14, right: 14, width: 24, height: 24, borderRadius: '50%', background: 'rgba(245,158,11,0.1)', border: `1px solid rgba(245,158,11,0.25)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: GOLD }}>
                  {item.step}
                </div>
                <div style={{ fontSize: 26, marginBottom: 12 }}>{item.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontSize: 13, color: DIM, lineHeight: 1.6, marginBottom: 16 }}>{item.desc}</div>
                <a href={item.href} style={{ display: 'inline-block', padding: '8px 16px', background: item.primary ? `linear-gradient(135deg, ${GOLD}, #D97706)` : 'rgba(245,158,11,0.08)', border: item.primary ? 'none' : `1px solid rgba(245,158,11,0.2)`, borderRadius: 7, color: item.primary ? '#000' : GOLD, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                  {item.cta}
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Device access grid */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '24px 28px', marginBottom: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Access Saguaro on any device:</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {[
              { icon: '💻', device: 'Desktop / Laptop', how: 'Open your browser → saguarocontrol.net/app' },
              { icon: '📱', device: 'iPhone / iPad', how: 'Open Safari → Add to Home Screen' },
              { icon: '🤖', device: 'Android', how: 'Open Chrome → Add to Home Screen' },
              { icon: '🖥️', device: 'Tablet', how: 'Any browser → works full screen' },
            ].map((d, i) => (
              <div key={i} style={{ padding: '14px 16px', background: '#FAFBFC', border: `1px solid rgba(30,58,95,0.5)`, borderRadius: 10 }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>{d.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{d.device}</div>
                <div style={{ fontSize: 12, color: DIM, lineHeight: 1.5 }}>{d.how}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Trial info */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 32 }}>
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

        {/* Support */}
        <p style={{ fontSize: 13, color: DIM, textAlign: 'center' }}>
          Questions? Email us at{' '}
          <a href="mailto:support@saguarocontrol.net" style={{ color: GOLD, textDecoration: 'none' }}>support@saguarocontrol.net</a>
          {' '}— we respond within 48 hours.
        </p>

      </div>
    </div>
  );
}
