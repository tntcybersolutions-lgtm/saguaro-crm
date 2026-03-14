import type { Metadata } from 'next';
import Image from 'next/image';
import { INDUSTRIES } from '@/lib/industries';

export const metadata: Metadata = {
  title: 'Construction Software by Industry | Saguaro CRM',
  description: 'Purpose-built for every type of contractor: general contractors, residential remodelers, commercial GCs, roofing contractors, specialty subcontractors.',
};

const DARK = '#0d1117';
const GOLD = '#F59E0B';
const TEXT = '#F8FAFC';
const DIM = '#CBD5E1';
const BORDER = '#1E3A5F';
const RAISED = '#0F172A';

export default function IndustryIndexPage() {
  return (
    <div style={{ minHeight: '100vh', background: DARK, color: TEXT, fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 64, background: 'rgba(13,17,23,0.9)',
        borderBottom: `1px solid ${BORDER}`,
        backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center',
        padding: '0 32px', gap: 32,
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 }}>
          <Image
            src="/logo-full.jpg"
            alt="Saguaro"
            width={132}
            height={44}
            style={{ height: 44, width: 'auto', mixBlendMode: 'screen', objectFit: 'contain' }}
          />
        </a>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {[
            { label: 'Features', href: '/#features' },
            { label: 'Pricing', href: '/pricing' },
            { label: 'Field App', href: '/field-app' },
            { label: 'Compare', href: '/compare' },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              style={{ color: DIM, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}
            >
              {link.label}
            </a>
          ))}
          <a
            href="/signup"
            style={{
              background: GOLD, color: '#000', fontSize: 14, fontWeight: 700,
              padding: '8px 20px', borderRadius: 8, textDecoration: 'none',
              letterSpacing: 0.2,
            }}
          >
            Start Free Trial
          </a>
        </div>
      </nav>

      {/* HERO */}
      <div style={{ paddingTop: 64 }}>
        <section style={{ maxWidth: 800, margin: '0 auto', padding: '80px 32px 60px', textAlign: 'center' }}>
          <div style={{
            display: 'inline-block', background: 'rgba(245,158,11,0.12)',
            border: `1px solid rgba(245,158,11,0.3)`, borderRadius: 20,
            padding: '5px 16px', fontSize: 12, fontWeight: 700,
            color: GOLD, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
            marginBottom: 24,
          }}>
            By Industry
          </div>
          <h1 style={{ fontSize: 'clamp(36px, 6vw, 56px)', fontWeight: 800, lineHeight: 1.1, margin: '0 0 24px' }}>
            Built for Every Type of{' '}
            <span style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #FBBF24 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Contractor
            </span>
          </h1>
          <p style={{ fontSize: 20, color: DIM, maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
            Saguaro adapts to how your trade works. Pick your industry to see how.
          </p>
        </section>

        {/* INDUSTRY GRID */}
        <div style={{ maxWidth: 1100, margin: '0 auto 80px', padding: '0 32px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 20,
          }}>
            {INDUSTRIES.map((industry) => (
              <a
                key={industry.slug}
                href={`/industry/${industry.slug}`}
                style={{
                  display: 'block', textDecoration: 'none',
                  background: RAISED,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 14,
                  padding: '32px 28px',
                  transition: 'border-color 0.15s ease, transform 0.15s ease',
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: 'rgba(245,158,11,0.12)',
                  border: `1px solid rgba(245,158,11,0.25)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 20,
                }}>
                  <svg
                    width="22" height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={GOLD}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={industry.iconPath} />
                  </svg>
                </div>

                <h2 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: '0 0 10px' }}>
                  {industry.name}
                </h2>
                <p style={{ fontSize: 14, color: DIM, margin: '0 0 24px', lineHeight: 1.6 }}>
                  {industry.subheadline}
                </p>

                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  color: GOLD, fontSize: 14, fontWeight: 600,
                }}>
                  Explore
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* CTA SECTION */}
        <section style={{
          background: RAISED,
          borderTop: `1px solid ${BORDER}`,
          padding: '64px 32px',
          textAlign: 'center',
        }}>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <h2 style={{ fontSize: 30, fontWeight: 800, color: TEXT, margin: '0 0 16px' }}>
              Start Your Free Trial
            </h2>
            <p style={{ fontSize: 17, color: DIM, margin: '0 0 32px', lineHeight: 1.6 }}>
              No credit card required. Get your whole team on board today.
            </p>
            <a
              href="/signup"
              style={{
                display: 'inline-block',
                background: GOLD, color: '#000', fontWeight: 700, fontSize: 16,
                padding: '14px 40px', borderRadius: 10, textDecoration: 'none',
              }}
            >
              Start Free Trial
            </a>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ padding: '40px 32px', textAlign: 'center', borderTop: `1px solid ${BORDER}` }}>
          <p style={{ fontSize: 13, color: DIM, margin: 0 }}>
            &copy; {new Date().getFullYear()} Saguaro Control Systems. All rights reserved.
            {' '}&middot;{' '}
            <a href="/privacy" style={{ color: DIM, textDecoration: 'none' }}>Privacy</a>
            {' '}&middot;{' '}
            <a href="/terms" style={{ color: DIM, textDecoration: 'none' }}>Terms</a>
          </p>
        </footer>
      </div>
    </div>
  );
}
