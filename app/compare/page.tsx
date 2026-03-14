import type { Metadata } from 'next';
import Image from 'next/image';
import { COMPETITORS } from '@/lib/competitors';

export const metadata: Metadata = {
  title: 'Saguaro vs Every Construction Software — Full Comparisons',
  description: 'See how Saguaro CRM compares to Procore, Buildertrend, CoConstruct, Fieldwire, Autodesk Build, Contractor Foreman, Jobber, JobNimbus, and more.',
  openGraph: {
    title: 'Saguaro vs Every Construction Software',
    description: 'Full feature and price comparisons against every major competitor.',
  },
  alternates: { canonical: 'https://saguarocontrol.net/compare' },
};

const DARK = '#0d1117';
const GOLD = '#F59E0B';
const TEXT = '#F8FAFC';
const DIM = '#CBD5E1';
const BORDER = '#1E3A5F';
const RAISED = '#0F172A';
const GREEN = '#22c55e';

export default function ComparePage() {
  const competitors = Object.values(COMPETITORS);

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
        <section style={{ maxWidth: 900, margin: '0 auto', padding: '80px 32px 56px', textAlign: 'center' }}>
          <div style={{
            display: 'inline-block', background: 'rgba(245,158,11,0.12)',
            border: `1px solid rgba(245,158,11,0.3)`, borderRadius: 20,
            padding: '5px 16px', fontSize: 12, fontWeight: 700,
            color: GOLD, letterSpacing: '0.08em', textTransform: 'uppercase',
            marginBottom: 24,
          }}>
            Head-to-Head Comparisons
          </div>
          <h1 style={{ fontSize: 'clamp(36px, 6vw, 60px)', fontWeight: 800, lineHeight: 1.1, margin: '0 0 24px' }}>
            Saguaro vs. Every Construction
            <br />
            <span style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #FBBF24 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Software Tool — Compared
            </span>
          </h1>
          <p style={{ fontSize: 20, color: DIM, maxWidth: 640, margin: '0 auto 40px', lineHeight: 1.6 }}>
            We don&apos;t hide from comparisons. See exactly how we stack up against every major competitor.
          </p>
        </section>

        {/* PROCORE FEATURED CARD */}
        <div style={{ maxWidth: 900, margin: '0 auto 56px', padding: '0 32px' }}>
          <a
            href="/compare/procore"
            style={{
              display: 'block', textDecoration: 'none',
              background: RAISED,
              border: `2px solid ${GOLD}`,
              borderRadius: 16,
              padding: '36px 40px',
              boxShadow: `0 0 48px rgba(245,158,11,0.18)`,
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'rgba(245,158,11,0.15)', border: `1px solid rgba(245,158,11,0.4)`,
                  borderRadius: 12, padding: '3px 12px', fontSize: 11, fontWeight: 700,
                  color: GOLD, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16,
                }}>
                  Most Popular Comparison
                </div>
                <h2 style={{ fontSize: 28, fontWeight: 800, color: TEXT, margin: '0 0 8px' }}>
                  Saguaro vs. Procore
                </h2>
                <p style={{ fontSize: 16, color: DIM, margin: '0 0 24px', lineHeight: 1.5 }}>
                  Procore starts at $375–600/mo+ per seat with a 3–6 month implementation. Saguaro is $199/mo flat for your whole team, live today.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {['AI Takeoff Included', 'Lien Waivers All 50 States', 'Certified Payroll WH-347', 'Flat Rate Pricing', 'Go Live Today'].map((feat) => (
                    <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: GREEN }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {feat}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 16, flexShrink: 0,
              }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, color: DIM, marginBottom: 4 }}>Saguaro starting price</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: GOLD }}>$199/mo</div>
                  <div style={{ fontSize: 13, color: DIM }}>vs Procore $375–600+/mo per seat</div>
                </div>
                <div style={{
                  background: GOLD, color: '#000', fontWeight: 700, fontSize: 15,
                  padding: '12px 28px', borderRadius: 10,
                }}>
                  See Full Comparison
                </div>
              </div>
            </div>
          </a>
        </div>

        {/* COMPETITOR GRID */}
        <div style={{ maxWidth: 1100, margin: '0 auto 80px', padding: '0 32px' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: '0 0 32px', textAlign: 'center' }}>
            All Competitors
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 20,
          }}>
            {competitors.map((comp) => (
              <a
                key={comp.slug}
                href={`/compare/${comp.slug}`}
                style={{
                  display: 'block', textDecoration: 'none',
                  background: RAISED,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 12,
                  padding: '28px 28px 24px',
                  transition: 'border-color 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: 0 }}>
                    Saguaro vs. {comp.name}
                  </h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
                  <span style={{ fontSize: 13, color: DIM }}>Their price:</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#f87171' }}>{comp.startingPrice}</span>
                  {comp.perSeat && (
                    <span style={{ fontSize: 11, color: DIM, background: 'rgba(248,113,113,0.1)', borderRadius: 6, padding: '1px 8px' }}>per seat</span>
                  )}
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: DIM, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                    #1 Weakness
                  </div>
                  <p style={{ fontSize: 14, color: DIM, margin: 0, lineHeight: 1.5 }}>
                    {comp.weaknesses[0]}
                  </p>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  color: GOLD, fontSize: 14, fontWeight: 600,
                }}>
                  See Comparison
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
          borderBottom: `1px solid ${BORDER}`,
          padding: '64px 32px',
          textAlign: 'center',
        }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: TEXT, margin: '0 0 16px' }}>
              Ready to see why GCs are switching?
            </h2>
            <p style={{ fontSize: 18, color: DIM, margin: '0 0 36px', lineHeight: 1.6 }}>
              Start free — no credit card required. Go live today, not in 3 months.
            </p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a
                href="/signup"
                style={{
                  background: GOLD, color: '#000', fontWeight: 700, fontSize: 16,
                  padding: '14px 36px', borderRadius: 10, textDecoration: 'none',
                }}
              >
                Start Free Trial
              </a>
              <a
                href="/sandbox"
                style={{
                  background: 'transparent', color: TEXT, fontWeight: 600, fontSize: 16,
                  padding: '14px 36px', borderRadius: 10, textDecoration: 'none',
                  border: `1px solid ${BORDER}`,
                }}
              >
                Explore the Sandbox
              </a>
            </div>
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
