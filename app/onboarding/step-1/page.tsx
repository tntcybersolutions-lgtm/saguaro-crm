'use client';
import React, { useState } from 'react';
import { Cactus, Confetti, Ruler, FileText, Lock, Robot, Lightbulb } from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';

/** A Phosphor icon component, stored rather than rendered so each call site
 *  picks its own size and weight. */
type IconCmp = PhosphorIcon;

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='var(--text-secondary)',TEXT='#FFFFFF';

const STEPS = [
  { num: 1, label: 'Welcome', active: true },
  { num: 2, label: 'First Project', active: false },
  { num: 3, label: 'Invite Team', active: false },
];

const FEATURES: { icon: IconCmp; title: string; desc: string }[] = [
  { icon: Ruler, title: 'AI Blueprint Takeoff', desc: 'Upload any PDF blueprint — Claude reads every dimension and calculates all materials automatically.' },
  { icon: FileText, title: 'AIA Pay Applications', desc: 'Generate G702/G703 PDFs in seconds. Submit to owners with one click.' },
  { icon: Lock, title: 'Lien Waivers', desc: 'State-specific forms for all 50 states. AZ, CA, TX statutory language included.' },
  { icon: Robot, title: 'Autopilot', desc: 'Automated RFI routing, change order tracking, and insurance expiry alerts.' },
];

export default function OnboardingStep1() {
  const [loading, setLoading] = useState(false);

  // Named createDemoProject until now, which it never did — it only navigates.
  // The button label ("Go to Dashboard") was always honest; the identifier was not.
  async function goToDashboard() {
    setLoading(true);
    window.location.href = '/app';
  }

  return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 640 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <a href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Cactus size={32} weight="fill" color="var(--text-secondary)" />
            <span style={{ fontWeight: 900, fontSize: 22, color: 'var(--text-primary)' }}>Saguaro</span>
          </a>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 40, justifyContent: 'center' }}>
          {STEPS.map((s, i) => (
            <React.Fragment key={s.num}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, background: s.active ? GOLD : 'rgba(255,255,255,.08)', color: s.active ? '#101722' : DIM, border: `2px solid ${s.active ? GOLD : BORDER}` }}>
                  {s.num}
                </div>
                <span style={{ fontSize: 12, color: s.active ? TEXT : DIM, fontWeight: s.active ? 700 : 400 }}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 2, background: BORDER, margin: '17px 8px 0' }} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Card */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 40 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ marginBottom: 16 }}><Confetti size={48} weight="fill" color="var(--text-secondary)" /></div>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 10px', color: TEXT }}>Welcome to Saguaro</h1>
            <p style={{ color: DIM, fontSize: 15, margin: 0, lineHeight: 1.6 }}>
              You're all set. Your 30-day free trial starts now — no credit card required.
            </p>
          </div>

          {/* Feature highlights */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 32 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background: '#1c1c1e', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ marginBottom: 8 }}><f.icon size={24} weight="duotone" color="var(--text-secondary)" /></div>
                <div style={{ fontWeight: 700, fontSize: 13, color: TEXT, marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: DIM, lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={goToDashboard}
              disabled={loading}
              style={{ padding: '14px 0', background: `linear-gradient(135deg,${GOLD},var(--brand-primary-strong))`, border: 'none', borderRadius: 10, color: '#101722', fontSize: 16, fontWeight: 800, cursor: loading ? 'wait' : 'pointer', opacity: loading ? .7 : 1 }}
            >
              {loading ? 'Loading your dashboard…' : 'Go to Dashboard →'}
            </button>
            <a
              href="/app/projects/new"
              style={{ display: 'block', textAlign: 'center', padding: '13px 0', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, color: TEXT, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}
            >
              + Create Your First Project
            </a>
          </div>

          <div style={{ marginTop: 24, padding: 16, background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 12, color: DIM, textAlign: 'center' }}>
            <Lightbulb size={14} weight="fill" color="var(--text-secondary)" style={{ verticalAlign: 'middle' }} /> <strong style={{ color: TEXT }}>Pro Tip:</strong> Start with the AI Takeoff — upload any blueprint PDF and see it calculate every material automatically in under 60 seconds.
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-secondary)' }}>
          Need help? <a href="mailto:support@saguarocontrol.net" style={{ color: DIM }}>support@saguarocontrol.net</a>
        </div>
      </div>
    </div>
  );
}
