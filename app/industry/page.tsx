import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { INDUSTRIES } from '@/lib/industries';

export const metadata: Metadata = {
  title: 'Construction Software by Industry | Saguaro Control Systems',
  description: 'Purpose-built for every type of contractor: general contractors, residential remodelers, commercial GCs, roofing contractors, specialty subcontractors.',
};

const DARK = 'var(--bg-base)';
const ON_GOLD = '#0A0A00';
const GOLD = 'var(--brand-primary)';
const TEXT = '#FFFFFF';
const DIM = 'var(--text-secondary)';
const HAIRLINE = 'rgba(255,255,255,0.08)';
const CARD = 'rgba(255,255,255,0.02)';

export default function IndustryIndexPage() {
  return (
    <div style={{ minHeight: '100vh', background: DARK, color: TEXT, fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 64, background: 'rgba(20,20,22,0.9)',
        borderBottom: `1px solid ${HAIRLINE}`,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center',
        padding: '0 32px', gap: 32,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 }}>
          <Image
            src="/logo-full.jpg"
            alt="Saguaro"
            width={132}
            height={44}
            style={{ height: 44, width: 'auto', objectFit: 'contain' }}
          />
        </Link>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {[
            { label: 'Features', href: '/#features' },
            { label: 'Pricing', href: '/pricing' },
            { label: 'Field App', href: '/field-app' },
            { label: 'Compare', href: '/compare' },
          ].map((link) => (
            <Link
              key={link.label}
              href={link.href}
              style={{ color: DIM, fontSize: 14, fontWeight: 400, textDecoration: 'none' }}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/signup"
            style={{
              background: GOLD, color: ON_GOLD, fontSize: 13, fontWeight: 600,
              padding: '8px 18px', borderRadius: 8, textDecoration: 'none',
            }}
          >
            Free Trial
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <div style={{ paddingTop: 64 }}>
        <section style={{ maxWidth: 800, margin: '0 auto', padding: '104px 32px 64px', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'transparent',
            border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999,
            padding: '6px 14px', fontSize: 12, fontWeight: 500,
            color: DIM,
            marginBottom: 28,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
            By Industry
          </div>
          <h1 style={{ fontSize: 'clamp(26px, 4vw, 30px)', fontWeight: 600, lineHeight: 1.15, letterSpacing: -0.5, margin: '0 0 18px' }}>
            Built for Every Type of{' '}
            <span style={{ color: TEXT }}>
              Contractor
            </span>
          </h1>
          <p style={{ fontSize: 17, color: DIM, maxWidth: 560, margin: '0 auto', lineHeight: 1.65 }}>
            Saguaro adapts to how your trade works. Pick your industry to see how.
          </p>
        </section>

        {/* INDUSTRY GRID */}
        <div style={{ maxWidth: 1100, margin: '0 auto 104px', padding: '0 32px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 20,
          }}>
            {INDUSTRIES.map((industry) => (
              <Link
                key={industry.slug}
                href={`/industry/${industry.slug}`}
                style={{
                  display: 'block', textDecoration: 'none',
                  background: CARD,
                  border: `1px solid ${HAIRLINE}`,
                  borderRadius: 14,
                  padding: '30px 28px',
                  transition: 'border-color 0.15s ease',
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${HAIRLINE}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 20,
                }}>
                  <svg
                    width="22" height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={DIM}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={industry.iconPath} />
                  </svg>
                </div>

                <h2 style={{ fontSize: 16, fontWeight: 600, color: TEXT, margin: '0 0 10px' }}>
                  {industry.name}
                </h2>
                <p style={{ fontSize: 14, color: DIM, margin: '0 0 24px', lineHeight: 1.6 }}>
                  {industry.subheadline}
                </p>

                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  color: GOLD, fontSize: 14, fontWeight: 500,
                }}>
                  Explore
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* CTA SECTION */}
        <section style={{
          background: 'transparent',
          borderTop: `1px solid ${HAIRLINE}`,
          padding: '112px 32px',
          textAlign: 'center',
        }}>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 26px)', fontWeight: 600, color: TEXT, letterSpacing: -0.4, margin: '0 0 16px' }}>
              Start Your Free Trial
            </h2>
            <p style={{ fontSize: 16, color: DIM, margin: '0 0 32px', lineHeight: 1.6 }}>
              No credit card required. Get your whole team on board today.
            </p>
            <Link
              href="/signup"
              style={{
                display: 'inline-block',
                background: GOLD, color: ON_GOLD, fontWeight: 600, fontSize: 15,
                padding: '12px 28px', borderRadius: 8, textDecoration: 'none',
              }}
            >
              Start Free Trial
            </Link>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ padding: '40px 32px', textAlign: 'center', borderTop: `1px solid ${HAIRLINE}` }}>
          <p style={{ fontSize: 13, color: DIM, margin: 0 }}>
            &copy; {new Date().getFullYear()} Saguaro Control Systems. All rights reserved.
            {' '}&middot;{' '}
            <Link href="/privacy" style={{ color: DIM, textDecoration: 'none' }}>Privacy</Link>
            {' '}&middot;{' '}
            <Link href="/terms" style={{ color: DIM, textDecoration: 'none' }}>Terms</Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
