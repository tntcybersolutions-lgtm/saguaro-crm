import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { COMPETITORS } from '@/lib/competitors';
import { IntegrationStrip } from '@/components/Integrations';
import MarketingNav from '@/components/MarketingNav';
import { STARTING_PRICE_MO, STARTING_PRICE_FLAT } from '@/lib/plans';

export const metadata: Metadata = {
  title: 'Saguaro vs Every Construction Software — Full Comparisons',
  description: 'See how Saguaro Control Systems compares to Procore, Buildertrend, CoConstruct, Fieldwire, Autodesk Build, Contractor Foreman, Jobber, JobNimbus, and more.',
  openGraph: {
    title: 'Saguaro vs Every Construction Software',
    description: 'Full feature and price comparisons against every major competitor.',
  },
  alternates: { canonical: 'https://saguarocontrol.net/compare' },
};

const DARK = 'var(--bg-base)';
const ON_GOLD = '#0A0A00';
const GOLD = 'var(--brand-primary)';
const TEXT = '#FFFFFF';
const DIM = '#CBD5E1';
const BORDER = 'rgba(255,255,255,0.08)';
const PILL = 'rgba(255,255,255,0.14)';
const CARD = 'rgba(255,255,255,0.02)';
const GREEN = '#22c55e';

/* House display treatment — gold text-shine on ONE key word per heading. */
const SHINE: CSSProperties = {
  background: 'linear-gradient(100deg, var(--brand-primary) 6%, var(--brand-primary-strong) 50%, var(--brand-primary) 92%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
};

export default function ComparePage() {
  const competitors = Object.values(COMPETITORS);

  return (
    <div className="mkt-page" style={{ minHeight: '100vh', background: DARK, color: TEXT, fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* NAV */}
      {/* One professional nav across every marketing page (fixed, 58px). */}
      <MarketingNav />
      <div style={{ height: 58 }} />

      {/* HERO */}
      <div style={{ paddingTop: 64 }}>
        <section style={{ maxWidth: 900, margin: '0 auto', padding: '80px 32px 56px', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent',
            border: `1px solid ${PILL}`, borderRadius: 999,
            padding: '6px 14px', fontSize: 12, fontWeight: 500,
            color: DIM,
            marginBottom: 28,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
            Head-to-Head Comparisons
          </div>
          <h1 style={{ fontWeight: 800, lineHeight: 1.12, margin: '0 0 18px', letterSpacing: '-0.02em' }}>
            Saguaro vs. Every Construction
            <br />
            Software Tool — <span style={SHINE}>Compared</span>
          </h1>
          <p style={{ fontSize: 'clamp(15px, 2vw, 17px)', color: DIM, maxWidth: 600, margin: '0 auto 40px', lineHeight: 1.65 }}>
            We don&apos;t hide from comparisons. See exactly how we stack up against every major competitor.
          </p>
        </section>

        {/* PROCORE FEATURED CARD */}
        <div style={{ maxWidth: 900, margin: '0 auto 56px', padding: '0 32px' }}>
          <Link
            href="/compare/procore"
            style={{
              display: 'block', textDecoration: 'none',
              background: CARD,
              border: `1px solid color-mix(in srgb, var(--brand-primary) 45%, transparent)`,
              borderRadius: 14,
              padding: '36px 40px',
              boxShadow: 'none',
              transition: 'border-color 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'transparent', border: `1px solid ${PILL}`,
                  borderRadius: 999, padding: '5px 12px', fontSize: 11, fontWeight: 500,
                  color: DIM, marginBottom: 16,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
                  Most Popular Comparison
                </div>
                <h2 style={{ fontWeight: 600, color: TEXT, margin: '0 0 8px' }}>
                  Saguaro vs. Procore
                </h2>
                <p style={{ fontSize: 16, color: DIM, margin: '0 0 24px', lineHeight: 1.5 }}>
                  Procore starts at $375–600/mo+ per seat with a 3–6 month implementation. Saguaro is {STARTING_PRICE_FLAT} for your whole team, live today.
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
                  <div style={{ fontSize: 13, color: DIM, marginBottom: 4 }}>Saguaro Starting Price</div>
                  <div style={{ fontSize: 32, fontWeight: 600, color: TEXT }}>{STARTING_PRICE_MO}</div>
                  <div style={{ fontSize: 13, color: DIM }}>vs Procore $375–600+/mo per seat</div>
                </div>
                <div style={{
                  background: GOLD, color: ON_GOLD, fontWeight: 600, fontSize: 14,
                  padding: '12px 28px', borderRadius: 8,
                }}>
                  See Full Comparison
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* COMPETITOR GRID */}
        <div style={{ maxWidth: 1100, margin: '0 auto 80px', padding: '0 32px' }}>
          <h2 style={{ fontWeight: 600, color: TEXT, margin: '0 0 32px', textAlign: 'center', letterSpacing: -0.3 }}>
            All Competitors
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '4px 32px',
          }}>
            {competitors.map((comp) => (
              <Link
                key={comp.slug}
                href={`/compare/${comp.slug}`}
                style={{
                  display: 'block', textDecoration: 'none',
                  background: 'transparent',
                  borderTop: `1px solid ${BORDER}`,
                  borderRadius: 0,
                  padding: '24px 4px 22px',
                  transition: 'opacity 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: TEXT, margin: 0 }}>
                    Saguaro vs. {comp.name}
                  </h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
                  <span style={{ fontSize: 13, color: DIM }}>Their Price:</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#f87171' }}>{comp.startingPrice}</span>
                  {comp.perSeat && (
                    <span style={{ fontSize: 11, color: DIM, background: 'rgba(248,113,113,0.1)', borderRadius: 6, padding: '1px 8px' }}>Per Seat</span>
                  )}
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: DIM, marginBottom: 8 }}>
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
              </Link>
            ))}
          </div>
        </div>

        {/* CTA SECTION */}
        <section style={{
          background: 'transparent',
          borderTop: `1px solid ${BORDER}`,
          padding: '112px 32px',
          textAlign: 'center',
        }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{ fontWeight: 800, color: TEXT, margin: '0 0 16px', lineHeight: 1.15, letterSpacing: '-0.02em' }}>
              Ready to See Why GCs Are <span style={SHINE}>Switching</span>?
            </h2>
            <p style={{ fontSize: 16, color: DIM, margin: '0 0 36px', lineHeight: 1.6 }}>
              Start free — no credit card required. Go live today, not in 3 months.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link
                href="/signup"
                style={{
                  background: GOLD, color: ON_GOLD, fontWeight: 600, fontSize: 15,
                  padding: '12px 28px', borderRadius: 8, textDecoration: 'none',
                }}
              >
                Start Free Trial
              </Link>
              <Link
                href="/sandbox"
                style={{
                  background: 'transparent', color: DIM, fontWeight: 500, fontSize: 15,
                  padding: '12px 28px', borderRadius: 8, textDecoration: 'none',
                  border: `1px solid ${PILL}`,
                }}
              >
                Explore the Sandbox
              </Link>
            </div>
          </div>
        </section>

        {/* TRUSTED INTEGRATIONS */}
        <IntegrationStrip />

        {/* FOOTER */}
        <footer style={{ padding: '40px 32px', textAlign: 'center', borderTop: `1px solid ${BORDER}` }}>
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
