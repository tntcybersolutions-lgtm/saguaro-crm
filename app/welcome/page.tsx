'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Globe, Ruler, DeviceMobile, UsersThree, Laptop, AndroidLogo, DeviceTablet } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

const GOLD  = 'var(--brand-primary)';
const DARK  = 'var(--bg-base)';
const HAIR  = 'rgba(255,255,255,0.08)';
const DIM   = 'var(--text-secondary)';
const MUTED = 'var(--text-secondary)';
const TEXT  = '#FFFFFF';
const GREEN = '#2CFF7A';

export default function WelcomePage() {
  const [name, setName] = useState('');

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.name) setName(d.name.split(' ')[0]);
    });
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: DARK, color: TEXT, fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", padding: '56px 24px' }}>

      {/* Top accent bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 2, background: GOLD }} />

      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 20, fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 28 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN, display: 'inline-block' }} />
          Account Created — 30-Day Free Trial Active
        </div>

        {/* Heading */}
        <h1 style={{ fontSize: 'clamp(26px, 3.5vw, 30px)', fontWeight: 600, margin: '0 0 12px', lineHeight: 1.15, letterSpacing: -0.4 }}>
          {name ? `You're In, ${name}` : "You're In"}
        </h1>
        <p style={{ fontSize: 16, color: DIM, margin: '0 0 44px', lineHeight: 1.7 }}>
          Your Saguaro account is live. Here's exactly how to access your platform and get your team set up.
        </p>

        {/* ACCESS CALLOUT — most important box */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${HAIR}`, borderRadius: 14, padding: '28px 32px', marginBottom: 40 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 12 }}>How to Access Your Software</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: TEXT, marginBottom: 8 }}>
            Open any browser and go to{' '}
            <Link href="/app" style={{ color: GOLD, textDecoration: 'none', borderBottom: '1px solid color-mix(in srgb, var(--brand-primary) 40%, transparent)' }}>saguarocontrol.net/app</Link>
          </div>
          <p style={{ fontSize: 14, color: DIM, margin: '0 0 20px', lineHeight: 1.65 }}>
            Saguaro is a <strong style={{ color: TEXT }}>web-based platform</strong> — there is nothing to download or install on your computer. Just bookmark this address and log in from any device, any time.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/app" className="btn-gold" style={{ padding: '10px 22px', fontSize: 14, textDecoration: 'none' }}>
              Go to My Dashboard →
            </Link>
            <Link href="/get-the-app" style={{ padding: '10px 20px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 8, color: DIM, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              Install on Phone
            </Link>
          </div>
        </div>

        {/* 4-step checklist */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 20 }}>Get the Most Out of Your First 10 Minutes</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px 40px' }}>
            {([
              {
                step: '1',
                icon: Globe,
                title: 'Access Your Dashboard',
                desc: 'Go to saguarocontrol.net/app in any browser — Chrome, Safari, Edge, Firefox. Log in with your email and password.',
                href: '/app',
                cta: 'Open Dashboard →',
                primary: true,
              },
              {
                step: '2',
                icon: Ruler,
                title: 'Upload Your First Blueprint',
                desc: 'Drop any PDF blueprint and Sage AI reads every dimension and generates a full material takeoff in under 60 seconds.',
                href: '/app/takeoff',
                cta: 'Try AI Takeoff →',
                primary: false,
              },
              {
                step: '3',
                icon: DeviceMobile,
                title: 'Install on Your Phone',
                desc: 'Download Saguaro Control Systems free from Apple TestFlight on your iPhone or iPad. On Android, open it in Chrome.',
                href: '/get-the-app',
                cta: 'See Install Guide →',
                primary: false,
              },
              {
                step: '4',
                icon: UsersThree,
                title: 'Invite Your Team',
                desc: 'Add unlimited PMs, supers, estimators, and field crew. Your entire company is included — no per-seat fees ever.',
                href: '/app',
                cta: 'Invite Team →',
                primary: false,
              },
            ] as { step: string; icon: Icon; title: string; desc: string; href: string; cta: string; primary: boolean }[]).map((item, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 10 }}>Step {item.step}</div>
                <div style={{ marginBottom: 12 }}><item.icon size={22} weight="duotone" color={GOLD} /></div>
                <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontSize: 13, color: DIM, lineHeight: 1.6, marginBottom: 16 }}>{item.desc}</div>
                {item.primary ? (
                  <a href={item.href} style={{ display: 'inline-block', padding: '10px 20px', background: GOLD, borderRadius: 8, color: '#0A0A00', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
                    {item.cta}
                  </a>
                ) : (
                  <a href={item.href} style={{ display: 'inline-block', color: GOLD, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
                    {item.cta}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Device access grid */}
        <div style={{ marginBottom: 40, paddingTop: 32, borderTop: `1px solid ${HAIR}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 20 }}>Access Saguaro on Any Device</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '20px 28px' }}>
            {([
              { icon: Laptop, device: 'Desktop / Laptop', how: 'Open your browser → saguarocontrol.net/app' },
              { icon: DeviceMobile, device: 'iPhone / iPad', how: 'Download free on TestFlight' },
              { icon: AndroidLogo, device: 'Android', how: 'Open saguarocontrol.net in Chrome' },
              { icon: DeviceTablet, device: 'Tablet', how: 'Any browser → works full screen' },
            ] as { icon: Icon; device: string; how: string }[]).map((d, i) => (
              <div key={i}>
                <div style={{ marginBottom: 8 }}><d.icon size={20} weight="duotone" color={GOLD} /></div>
                <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 4 }}>{d.device}</div>
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
                <circle cx="8" cy="8" r="8" fill="rgba(44,255,122,0.15)" />
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
