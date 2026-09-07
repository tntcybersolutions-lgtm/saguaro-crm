'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import type { Industry } from '@/lib/industries';

const DARK = '#0a0a0a';
const GOLD = '#F59E0B';
const GOLD_DARK = '#F59E0B';
const TEXT = '#FFFFFF';
const DIM = '#CBD5E1';
const BORDER = 'rgba(255,255,255,0.12)';
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
  'Free Native iOS Field App',
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

  // Split headline into lines; all lines render in white (monochrome)
  const headlineLines = industry.headline.split('\n');
  const headlineBody = headlineLines.slice(0, -1);
  const headlineLast = headlineLines[headlineLines.length - 1];

  return (
    <div style={{ background: DARK, color: TEXT, minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: scrolled ? 'rgba(20,20,22,0.97)' : 'rgba(20,20,22,0.85)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(255,255,255,0.08)',
        transition: 'all 0.3s ease', height: '58px',
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{
          maxWidth: '1200px', margin: '0 auto', padding: '0 24px',
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }} aria-label="Saguaro Control Systems — Construction Management & Project Controls — home">
            <img
              src="/logo-full.jpg"
              alt="Saguaro Control Systems — Construction Management & Project Controls"
              style={{ height: '36px', width: 'auto', objectFit: 'contain', borderRadius: '4px', flexShrink: 0 }}
            />
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span style={{
                fontWeight: 600, fontSize: '14px', letterSpacing: '0.1em', color: TEXT,
              }}>SAGUARO</span>
              <span style={{ fontSize: '7px', color: DIM, letterSpacing: '0.25em', fontWeight: 500, textTransform: 'uppercase' }}>Control Systems</span>
            </span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} className="ind-desktop">
            <Link href="/login" style={{
              padding: '7px 18px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px',
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
        <div style={{ position: 'fixed', top: '58px', left: 0, right: 0, zIndex: 9998, background: 'rgba(20,20,22,0.99)', borderBottom: `1px solid ${BORDER}`, padding: '16px', backdropFilter: 'blur(12px)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Link href="/login" onClick={() => setMobileOpen(false)} style={{ padding: '13px', textAlign: 'center', border: `1px solid ${BORDER}`, borderRadius: '8px', color: TEXT, textDecoration: 'none', fontWeight: 500 }}>Log In</Link>
            <Link href="/signup" onClick={() => setMobileOpen(false)} style={{ padding: '13px', textAlign: 'center', background: GOLD_DARK, borderRadius: '8px', color: '#000', textDecoration: 'none', fontWeight: 600 }}>Start Free Trial</Link>
          </div>
        </div>
      )}

      <div style={{ height: '58px' }} />

      {/* ── HERO ── */}
      <section style={{
        padding: '104px 24px 96px',
        background: DARK,
        textAlign: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          {/* Industry badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '28px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              padding: '5px 14px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.14)', borderRadius: '100px',
              fontSize: '12px', fontWeight: 500, letterSpacing: '0.06em', color: DIM,
              textTransform: 'uppercase',
            }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: GOLD }} />
              {industry.name}
            </div>
          </div>

          <h1 style={{ fontSize: 'clamp(28px, 4vw, 30px)', fontWeight: 600, lineHeight: 1.15, margin: '0 0 24px', letterSpacing: '-0.02em' }}>
            {headlineBody.map((line, i) => (
              <span key={i} style={{ display: 'block', color: TEXT }}>{line}</span>
            ))}
            <span style={{ display: 'block', color: TEXT }}>{headlineLast}</span>
          </h1>

          <p style={{ fontSize: 'clamp(15px, 2vw, 17px)', color: DIM, lineHeight: 1.7, margin: '0 auto 40px', maxWidth: '680px' }}>
            {industry.subheadline}
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '36px' }}>
            <Link href="/signup" style={{
              padding: '10px 22px',
              background: GOLD,
              borderRadius: '8px', color: DARK, fontWeight: 600, fontSize: '15px',
              textDecoration: 'none', letterSpacing: '0.01em',
            }}>
              Start Free Trial
            </Link>
            <Link href="/sandbox" style={{
              padding: '10px 22px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: '8px', color: DIM, fontWeight: 500, fontSize: '15px',
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
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '100px',
                fontSize: '12px', color: DIM, fontWeight: 400,
              }}>
                {pill}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── PAIN POINTS ── */}
      <section style={{ padding: '96px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{ fontSize: 'clamp(20px, 3vw, 22px)', fontWeight: 600, margin: '0 0 12px', color: TEXT }}>
              Sound familiar?
            </h2>
            <p style={{ color: DIM, fontSize: '15px', margin: 0 }}>
              These are the problems {industry.name.toLowerCase()} deal with every week.
            </p>
          </div>

          <div>
            {industry.painPoints.map((point, i) => (
              <div key={i} style={{
                padding: '18px 4px',
                borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'flex-start', gap: '14px',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p style={{ margin: 0, color: DIM, fontSize: '15px', lineHeight: 1.6 }}>{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section style={{ padding: '96px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <h2 style={{ fontSize: 'clamp(20px, 3vw, 22px)', fontWeight: 600, margin: '0 0 12px', color: TEXT }}>
              Everything you need. Nothing you don&apos;t.
            </h2>
            <p style={{ color: DIM, fontSize: '15px', margin: 0 }}>
              Built specifically for {industry.name.toLowerCase()}.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '40px 32px' }}>
            {industry.keyFeatures.map((feature, i) => (
              <div key={i}>
                {/* Icon */}
                <div style={{ marginBottom: '16px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={industry.iconPath} />
                  </svg>
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: TEXT, margin: '0 0 8px' }}>{feature.title}</h3>
                <p style={{ fontSize: '14px', color: DIM, lineHeight: 1.6, margin: 0 }}>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL ── */}
      <section style={{ padding: '96px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', textAlign: 'center' }}>
          {/* 5 stars */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginBottom: '28px' }}>
            {[...Array(5)].map((_, i) => (
              <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,0.55)" stroke="none">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            ))}
          </div>

          <blockquote style={{
            margin: '0 0 32px',
            padding: '28px 32px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '14px',
            textAlign: 'left',
          }}>
            <p style={{ fontSize: 'clamp(16px, 2vw, 18px)', color: TEXT, lineHeight: 1.7, margin: 0 }}>
              &ldquo;{industry.testimonialQuote}&rdquo;
            </p>
          </blockquote>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
            {/* Avatar initials */}
            <div style={{
              width: '40px', height: '40px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 600, fontSize: '15px', color: TEXT, flexShrink: 0,
            }}>
              {industry.testimonialName.charAt(0)}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600, color: TEXT, fontSize: '15px' }}>{industry.testimonialName}</div>
              <div style={{ color: DIM, fontSize: '13px' }}>{industry.testimonialTitle}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── COMPARISON BAR ── */}
      <section style={{ padding: '96px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{ fontSize: 'clamp(20px, 3vw, 22px)', fontWeight: 600, margin: '0 0 12px', color: TEXT }}>
              The old way vs. with Saguaro
            </h2>
            <p style={{ color: DIM, fontSize: '15px', margin: 0 }}>
              See what changes when you run your business on one platform.
            </p>
          </div>

          {/* Column headers */}
          <div className="comp-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '4px', padding: '0 4px' }}>
            <div style={{
              paddingBottom: '10px',
              fontWeight: 500, fontSize: '12px', color: DIM, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              The old way
            </div>
            <div style={{
              paddingBottom: '10px',
              fontWeight: 500, fontSize: '12px', color: DIM, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              With Saguaro
            </div>
          </div>

          <div>
            {OLD_WAY_VS_SAGUARO.map(([bad, good], i) => (
              <div key={i} className="comp-grid" style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px',
                padding: '18px 4px',
                borderTop: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: '2px', opacity: 0.7 }}>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  <span style={{ fontSize: '14px', color: DIM, lineHeight: 1.5 }}>{bad}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: '2px', opacity: 0.8 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span style={{ fontSize: '14px', color: TEXT, lineHeight: 1.5 }}>{good}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{
        padding: '104px 24px',
        background: DARK,
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(22px, 3.5vw, 26px)', fontWeight: 600, margin: '0 0 16px', lineHeight: 1.2, color: TEXT }}>
            Ready to run your {industry.name} business smarter?
          </h2>
          <p style={{ fontSize: '16px', color: DIM, lineHeight: 1.7, margin: '0 0 40px' }}>
            Join {industry.name.toLowerCase()} who have eliminated manual takeoffs, paper lien waivers, and disconnected tools.
            One platform. One price. Start today — no credit card required.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '24px' }}>
            <Link href="/signup" style={{
              padding: '10px 22px',
              background: GOLD,
              borderRadius: '8px', color: DARK, fontWeight: 600, fontSize: '15px',
              textDecoration: 'none', letterSpacing: '0.01em',
            }}>
              Start Free Trial
            </Link>
            <Link href="/sandbox" style={{
              padding: '10px 22px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: '8px', color: DIM, fontWeight: 500, fontSize: '15px',
              textDecoration: 'none',
            }}>
              Try AI Takeoff First →
            </Link>
          </div>

          <p style={{ fontSize: '13px', color: DIM, margin: 0 }}>
            Free forever for your field crew. Native iOS app on TestFlight.
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: `1px solid ${BORDER}`, padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <Link href="/pricing" style={{ color: DIM, fontSize: '13px', textDecoration: 'none' }}>Pricing</Link>
          <Link href="/compare/procore" style={{ color: DIM, fontSize: '13px', textDecoration: 'none' }}>vs Procore</Link>
          <Link href="/sandbox" style={{ color: DIM, fontSize: '13px', textDecoration: 'none' }}>AI Takeoff Demo</Link>
          <Link href="/get-the-app" style={{ color: DIM, fontSize: '13px', textDecoration: 'none' }}>Field App</Link>
          <Link href="/privacy" style={{ color: DIM, fontSize: '13px', textDecoration: 'none' }}>Privacy</Link>
          <Link href="/terms" style={{ color: DIM, fontSize: '13px', textDecoration: 'none' }}>Terms</Link>
        </div>
        <p style={{ color: '#475569', fontSize: '12px', margin: 0 }}>
          &copy; {new Date().getFullYear()} Saguaro Control Systems — Construction Management & Project Controls. All rights reserved.
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
