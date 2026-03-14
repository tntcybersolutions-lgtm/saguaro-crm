'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import type { Industry } from '@/lib/industries';

const DARK = '#0d1117';
const GOLD = '#F59E0B';
const GOLD_DARK = '#D4A017';
const TEXT = '#F8FAFC';
const DIM = '#CBD5E1';
const BORDER = '#1E3A5F';
const RAISED = '#0F172A';
const GREEN = '#22c55e';
const RED = '#ef4444';

const OLD_WAY_VS_SAGUARO = [
  ['Manual blueprint takeoff — 4 to 8 hours per bid', 'AI blueprint takeoff — complete estimate in under 60 seconds'],
  ['Paper lien waivers chased at project closeout', 'Digital lien waivers sent, signed, and tracked automatically'],
  ['G702 pay apps filled by hand every month', 'AIA pay apps generated and submitted in 60 seconds'],
  ['Certified payroll done in spreadsheets', 'WH-347 forms auto-generated with live Davis-Bacon rates'],
  ['4 separate tools that don\'t talk to each other', 'One platform: estimating, billing, compliance, field'],
];

const TRUST_PILLS = [
  'No App Store Required',
  'Works Offline',
  'All 50 States',
  'Free for Your Whole Crew',
  'No Credit Card to Start',
];

interface Props {
  industry: Industry;
}

export default function IndustryLandingPage({ industry }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Split headline: last line gets gold gradient, previous lines are white
  const headlineLines = industry.headline.split('\n');
  const headlineBody = headlineLines.slice(0, -1);
  const headlineLast = headlineLines[headlineLines.length - 1];

  return (
    <div style={{ background: DARK, color: TEXT, minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: scrolled ? 'rgba(13,17,23,0.97)' : 'rgba(13,17,23,0.85)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: scrolled ? '1px solid rgba(212,160,23,0.25)' : '1px solid rgba(38,51,71,0.8)',
        transition: 'all 0.3s ease', height: '58px',
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{
          maxWidth: '1200px', margin: '0 auto', padding: '0 24px',
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <img
              src="/logo-full.jpg"
              alt="Saguaro Control Systems"
              style={{ height: '36px', width: 'auto', objectFit: 'contain', borderRadius: '4px', flexShrink: 0 }}
            />
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span style={{
                fontWeight: 700, fontSize: '14px', letterSpacing: '0.1em',
                background: 'linear-gradient(90deg,#D4A017,#F0C040)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>SAGUARO</span>
              <span style={{ fontSize: '7px', color: '#8fa3c0', letterSpacing: '0.25em', fontWeight: 600, textTransform: 'uppercase' }}>Control Systems</span>
            </span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} className="ind-desktop">
            <Link href="/login" style={{
              padding: '7px 18px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px',
              color: 'rgba(255,255,255,0.8)', fontSize: '13px', fontWeight: 400, textDecoration: 'none',
            }}>Log In</Link>
            <Link href="/signup" style={{
              padding: '7px 18px', background: GOLD_DARK, border: 'none', borderRadius: '6px',
              color: '#000', fontSize: '13px', fontWeight: 600, letterSpacing: '0.03em', textDecoration: 'none',
            }}>Free Trial</Link>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="ind-mobile"
            style={{ display: 'none', background: 'none', border: 'none', color: TEXT, fontSize: '22px', cursor: 'pointer', padding: '8px', minWidth: '44px', minHeight: '44px', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Menu"
          >{mobileOpen ? '✕' : '☰'}</button>
        </div>
      </nav>

      {mobileOpen && (
        <div style={{ position: 'fixed', top: '58px', left: 0, right: 0, zIndex: 9998, background: 'rgba(13,17,23,0.99)', borderBottom: `1px solid ${BORDER}`, padding: '16px', backdropFilter: 'blur(12px)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Link href="/login" onClick={() => setMobileOpen(false)} style={{ padding: '13px', textAlign: 'center', border: `1px solid ${BORDER}`, borderRadius: '8px', color: TEXT, textDecoration: 'none', fontWeight: 500 }}>Log In</Link>
            <Link href="/signup" onClick={() => setMobileOpen(false)} style={{ padding: '13px', textAlign: 'center', background: GOLD_DARK, borderRadius: '8px', color: '#000', textDecoration: 'none', fontWeight: 600 }}>Start Free Trial</Link>
          </div>
        </div>
      )}

      <div style={{ height: '58px' }} />

      {/* ── HERO ── */}
      <section style={{
        padding: '80px 24px 72px',
        background: `radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.08) 0%, transparent 65%), ${DARK}`,
        textAlign: 'center',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          {/* Industry badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '28px' }}>
            <div style={{
              padding: '5px 14px', background: 'rgba(245,158,11,0.12)',
              border: '1px solid rgba(245,158,11,0.35)', borderRadius: '100px',
              fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', color: GOLD,
              textTransform: 'uppercase',
            }}>
              {industry.name}
            </div>
          </div>

          <h1 style={{ fontSize: 'clamp(32px, 5.5vw, 56px)', fontWeight: 800, lineHeight: 1.1, margin: '0 0 24px', letterSpacing: '-0.02em' }}>
            {headlineBody.map((line, i) => (
              <span key={i} style={{ display: 'block', color: TEXT }}>{line}</span>
            ))}
            <span style={{
              display: 'block',
              background: 'linear-gradient(90deg, #F59E0B, #FBBF24, #F59E0B)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>{headlineLast}</span>
          </h1>

          <p style={{ fontSize: 'clamp(16px, 2vw, 19px)', color: DIM, lineHeight: 1.7, margin: '0 auto 40px', maxWidth: '680px' }}>
            {industry.subheadline}
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '36px' }}>
            <Link href="/signup" style={{
              padding: '14px 32px',
              background: `linear-gradient(135deg, ${GOLD}, #FBBF24)`,
              borderRadius: '8px', color: '#000', fontWeight: 700, fontSize: '16px',
              textDecoration: 'none', letterSpacing: '0.01em',
              boxShadow: '0 4px 20px rgba(245,158,11,0.35)',
            }}>
              Start Free Trial
            </Link>
            <Link href="/sandbox" style={{
              padding: '14px 32px',
              background: 'transparent',
              border: `1px solid ${BORDER}`,
              borderRadius: '8px', color: TEXT, fontWeight: 600, fontSize: '16px',
              textDecoration: 'none',
            }}>
              Try AI Takeoff →
            </Link>
          </div>

          {/* Trust pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
            {TRUST_PILLS.map(pill => (
              <span key={pill} style={{
                padding: '5px 12px',
                background: 'rgba(30,58,95,0.5)',
                border: `1px solid ${BORDER}`,
                borderRadius: '100px',
                fontSize: '12px', color: DIM, fontWeight: 500,
              }}>
                {pill}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── PAIN POINTS ── */}
      <section style={{ padding: '72px 24px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, margin: '0 0 12px', color: TEXT }}>
              Sound Familiar?
            </h2>
            <p style={{ color: DIM, fontSize: '16px', margin: 0 }}>
              These are the problems {industry.name.toLowerCase()} deal with every week.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {industry.painPoints.map((point, i) => (
              <div key={i} style={{
                padding: '20px 24px',
                background: RAISED,
                border: '1px solid rgba(239,68,68,0.2)',
                borderLeft: '3px solid rgba(239,68,68,0.6)',
                borderRadius: '8px',
                display: 'flex', alignItems: 'flex-start', gap: '14px',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p style={{ margin: 0, color: DIM, fontSize: '15px', lineHeight: 1.5 }}>{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section style={{ padding: '72px 24px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '52px' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, margin: '0 0 12px', color: TEXT }}>
              Everything You Need. Nothing You Don&apos;t.
            </h2>
            <p style={{ color: DIM, fontSize: '16px', margin: 0 }}>
              Built specifically for {industry.name.toLowerCase()}.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            {industry.keyFeatures.map((feature, i) => (
              <div key={i} style={{
                padding: '28px',
                background: RAISED,
                border: `1px solid ${BORDER}`,
                borderRadius: '10px',
                transition: 'border-color 0.2s',
              }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(245,158,11,0.4)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = BORDER}
              >
                {/* Icon circle */}
                <div style={{
                  width: '44px', height: '44px',
                  background: 'rgba(245,158,11,0.12)',
                  border: '1px solid rgba(245,158,11,0.25)',
                  borderRadius: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '16px',
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d={industry.iconPath} />
                  </svg>
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: TEXT, margin: '0 0 8px' }}>{feature.title}</h3>
                <p style={{ fontSize: '14px', color: DIM, lineHeight: 1.6, margin: 0 }}>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL ── */}
      <section style={{ padding: '72px 24px', borderBottom: `1px solid ${BORDER}`, background: RAISED }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', textAlign: 'center' }}>
          {/* 5 stars */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginBottom: '28px' }}>
            {[...Array(5)].map((_, i) => (
              <svg key={i} width="20" height="20" viewBox="0 0 24 24" fill={GOLD} stroke="none">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            ))}
          </div>

          <blockquote style={{
            margin: '0 0 32px',
            padding: '28px 32px',
            background: DARK,
            border: `1px solid ${BORDER}`,
            borderLeft: `4px solid ${GOLD}`,
            borderRadius: '10px',
            textAlign: 'left',
          }}>
            <p style={{ fontSize: 'clamp(16px, 2vw, 19px)', color: TEXT, lineHeight: 1.7, margin: 0, fontStyle: 'italic' }}>
              &ldquo;{industry.testimonialQuote}&rdquo;
            </p>
          </blockquote>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
            {/* Avatar initials */}
            <div style={{
              width: '44px', height: '44px',
              background: `linear-gradient(135deg, ${GOLD_DARK}, ${GOLD})`,
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '16px', color: '#000', flexShrink: 0,
            }}>
              {industry.testimonialName.charAt(0)}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 700, color: TEXT, fontSize: '15px' }}>{industry.testimonialName}</div>
              <div style={{ color: DIM, fontSize: '13px' }}>{industry.testimonialTitle}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── COMPARISON BAR ── */}
      <section style={{ padding: '72px 24px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, margin: '0 0 12px', color: TEXT }}>
              The Old Way vs. With Saguaro
            </h2>
            <p style={{ color: DIM, fontSize: '16px', margin: 0 }}>
              See what changes when you run your business on one platform.
            </p>
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px', padding: '0 4px' }}>
            <div style={{
              padding: '10px 20px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '8px',
              textAlign: 'center',
              fontWeight: 700, fontSize: '14px', color: '#fca5a5', letterSpacing: '0.04em',
            }}>
              THE OLD WAY
            </div>
            <div style={{
              padding: '10px 20px',
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: '8px',
              textAlign: 'center',
              fontWeight: 700, fontSize: '14px', color: '#86efac', letterSpacing: '0.04em',
            }}>
              WITH SAGUARO
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {OLD_WAY_VS_SAGUARO.map(([bad, good], i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{
                  padding: '16px 20px',
                  background: 'rgba(239,68,68,0.05)',
                  border: '1px solid rgba(239,68,68,0.15)',
                  borderRadius: '8px',
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  <span style={{ fontSize: '14px', color: '#fca5a5', lineHeight: 1.5 }}>{bad}</span>
                </div>
                <div style={{
                  padding: '16px 20px',
                  background: 'rgba(34,197,94,0.05)',
                  border: '1px solid rgba(34,197,94,0.15)',
                  borderRadius: '8px',
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span style={{ fontSize: '14px', color: '#86efac', lineHeight: 1.5 }}>{good}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{
        padding: '80px 24px',
        background: `linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(251,191,36,0.06) 50%, rgba(13,17,23,0) 100%)`,
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 800, margin: '0 0 16px', lineHeight: 1.15, color: TEXT }}>
            Ready to Run Your {industry.name} Business Smarter?
          </h2>
          <p style={{ fontSize: '17px', color: DIM, lineHeight: 1.7, margin: '0 0 40px' }}>
            Join {industry.name.toLowerCase()} who have eliminated manual takeoffs, paper lien waivers, and disconnected tools.
            One platform. One price. Start today — no credit card required.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '24px' }}>
            <Link href="/signup" style={{
              padding: '16px 36px',
              background: `linear-gradient(135deg, ${GOLD}, #FBBF24)`,
              borderRadius: '8px', color: '#000', fontWeight: 700, fontSize: '17px',
              textDecoration: 'none', letterSpacing: '0.01em',
              boxShadow: '0 4px 24px rgba(245,158,11,0.4)',
            }}>
              Start Free Trial
            </Link>
            <Link href="/sandbox" style={{
              padding: '16px 36px',
              background: 'transparent',
              border: `1px solid rgba(245,158,11,0.4)`,
              borderRadius: '8px', color: GOLD, fontWeight: 600, fontSize: '17px',
              textDecoration: 'none',
            }}>
              Try AI Takeoff First →
            </Link>
          </div>

          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            Free forever for your field crew. No App Store required.
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: `1px solid ${BORDER}`, padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <Link href="/pricing" style={{ color: DIM, fontSize: '13px', textDecoration: 'none' }}>Pricing</Link>
          <Link href="/compare/procore" style={{ color: DIM, fontSize: '13px', textDecoration: 'none' }}>vs Procore</Link>
          <Link href="/sandbox" style={{ color: DIM, fontSize: '13px', textDecoration: 'none' }}>AI Takeoff Demo</Link>
          <Link href="/field-app" style={{ color: DIM, fontSize: '13px', textDecoration: 'none' }}>Field App</Link>
          <Link href="/privacy" style={{ color: DIM, fontSize: '13px', textDecoration: 'none' }}>Privacy</Link>
          <Link href="/terms" style={{ color: DIM, fontSize: '13px', textDecoration: 'none' }}>Terms</Link>
        </div>
        <p style={{ color: '#475569', fontSize: '12px', margin: 0 }}>
          &copy; {new Date().getFullYear()} Saguaro Control Systems. All rights reserved.
        </p>
      </footer>

      <style>{`
        @media (max-width: 768px) {
          .ind-desktop { display: none !important; }
          .ind-mobile { display: flex !important; }
        }
        @media (max-width: 600px) {
          .comp-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
