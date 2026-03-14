'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import type { Competitor } from '@/lib/competitors';

const DARK = '#0d1117';
const GOLD = '#F59E0B';
const TEXT = '#F8FAFC';
const DIM = '#CBD5E1';
const BORDER = '#1E3A5F';
const RAISED = '#0F172A';
const GREEN = '#22c55e';
const RED = '#ef4444';

// ─── Nav ────────────────────────────────────────────────────────────────────

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: scrolled ? 'rgba(13,17,23,0.97)' : 'rgba(13,17,23,0.85)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: scrolled ? '1px solid rgba(245,158,11,0.25)' : `1px solid ${BORDER}`,
        transition: 'all 0.3s ease', height: '58px',
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{
          maxWidth: '1200px', margin: '0 auto', padding: '0 32px',
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <img
              src="/logo-full.jpg"
              alt="Saguaro Control Systems"
              style={{ height: '36px', width: 'auto', objectFit: 'contain', borderRadius: '4px', flexShrink: 0 }}
            />
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '0.1em', background: 'linear-gradient(90deg,#D4A017,#F0C040)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SAGUARO</span>
              <span style={{ fontSize: '7px', color: '#8fa3c0', letterSpacing: '0.25em', fontWeight: 600, textTransform: 'uppercase' }}>Control Systems</span>
            </span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} className="ccp-desktop">
            <Link href="/login" style={{ padding: '7px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '13px', fontWeight: 400, textDecoration: 'none' }}>Log In</Link>
            <Link href="/signup" style={{ padding: '7px 18px', background: '#D4A017', border: 'none', borderRadius: '6px', color: '#000', fontSize: '13px', fontWeight: 600, letterSpacing: '0.03em', textDecoration: 'none' }}>Free Trial</Link>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="ccp-mobile"
            style={{ display: 'none', background: 'none', border: 'none', color: TEXT, fontSize: '22px', cursor: 'pointer', padding: '8px', minWidth: '44px', minHeight: '44px', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Menu"
          >
            {mobileOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div style={{ position: 'fixed', top: '58px', left: 0, right: 0, zIndex: 9998, background: 'rgba(13,17,23,0.99)', borderBottom: `1px solid ${BORDER}`, padding: '8px 0 16px', backdropFilter: 'blur(12px)' }}>
          <div style={{ padding: '16px' }}>
            <Link href="/login" onClick={() => setMobileOpen(false)}
              style={{ display: 'block', textAlign: 'center', padding: '13px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: '9px', color: TEXT, fontWeight: 600, textDecoration: 'none', fontSize: '15px', marginBottom: '10px' }}>
              Log In
            </Link>
            <Link href="/signup" onClick={() => setMobileOpen(false)}
              style={{ display: 'block', textAlign: 'center', padding: '13px', background: '#D4A017', borderRadius: '9px', color: '#000', fontWeight: 600, textDecoration: 'none', fontSize: '15px' }}>
              Start Free Trial
            </Link>
          </div>
        </div>
      )}

      <div style={{ height: '58px' }} />
    </>
  );
}

// ─── Check / X icons ────────────────────────────────────────────────────────

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="9" cy="9" r="9" fill={GREEN} fillOpacity="0.15" />
      <path d="M5 9.5l3 3 5-6" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="9" cy="9" r="9" fill={RED} fillOpacity="0.12" />
      <path d="M6 6l6 6M12 6l-6 6" stroke={RED} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Warning() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
      <path d="M10 2L18.66 17H1.34L10 2z" fill={RED} fillOpacity="0.15" stroke={RED} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 8v4" stroke={RED} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="14.5" r="0.75" fill={RED} />
    </svg>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function countAIFeatures(c: Competitor): number {
  let n = 0;
  if (!c.hasAITakeoff) n++;
  if (!c.hasBidIntelligence) n++;
  return n;
}

function formatSavings(c: Competitor): string {
  if (c.perSeat) return 'Up to 80% lower cost';
  const price = parseFloat(c.startingPrice.replace(/[^0-9.]/g, ''));
  if (!isNaN(price) && price > 199) {
    const diff = Math.round((price - 199) * 12);
    return `Save $${diff.toLocaleString()}/yr vs ${c.name}`;
  }
  return `More features, lower cost than ${c.name}`;
}

// ─── Comparison table rows ───────────────────────────────────────────────────

interface TableRow {
  feature: string;
  saguaroValue: string;
  competitorValue: string;
  saguaroWins: boolean;
  tie: boolean;
}

function buildRows(c: Competitor): TableRow[] {
  const row = (
    feature: string,
    saguaroValue: string,
    competitorValue: string,
    saguaroWins: boolean,
    tie = false,
  ): TableRow => ({ feature, saguaroValue, competitorValue, saguaroWins, tie });

  return [
    row('Starting Price', '$199/mo flat', c.startingPrice, false, true),
    row('Contract Required', 'Month-to-month', c.annualRequired ? 'Annual required' : 'Month-to-month', c.annualRequired, !c.annualRequired),
    row('Setup Time', '< 1 day', c.setupTime, true),
    row('Per-Seat Pricing', 'No — flat rate', c.perSeat ? 'Yes — costs grow with team' : 'No', c.perSeat, !c.perSeat),
    row('AI Blueprint Takeoff', 'Included', c.hasAITakeoff ? 'Included' : 'Not available', !c.hasAITakeoff, c.hasAITakeoff),
    row('Lien Waivers (50 states)', 'Included', c.hasLienWaivers ? 'Included' : 'Not available', !c.hasLienWaivers, c.hasLienWaivers),
    row('Certified Payroll WH-347', 'Included', c.hasCertifiedPayroll ? 'Included' : 'Not available', !c.hasCertifiedPayroll, c.hasCertifiedPayroll),
    row(
      'Mobile Field App (offline)',
      'Full offline mode',
      c.hasOfflineMode ? 'Limited offline' : 'Requires signal',
      !c.hasOfflineMode,
      false,
    ),
    row(
      'No App Store Required',
      'Yes — PWA, no install',
      c.appStoreRequired ? 'App Store required' : 'No App Store',
      c.appStoreRequired,
      !c.appStoreRequired,
    ),
    row('Bid Intelligence AI', 'Included', c.hasBidIntelligence ? 'Included' : 'Not available', !c.hasBidIntelligence, c.hasBidIntelligence),
    row('Client Portal', 'Included', c.hasClientPortal ? 'Included' : 'Not available', !c.hasClientPortal, c.hasClientPortal),
    row('Sub Portal', 'Included', c.hasSubPortal ? 'Included' : 'Not available', !c.hasSubPortal, c.hasSubPortal),
  ];
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function CompetitorComparePage({ competitor }: { competitor: Competitor }) {
  const [headlineLines] = useState(() => competitor.heroHeadline.split('\n'));
  const rows = buildRows(competitor);
  const aiCount = countAIFeatures(competitor);
  const savings = formatSavings(competitor);

  const migrationLink = competitor.slug === 'procore' ? '/switch-from-procore' : '/signup';

  return (
    <div style={{ minHeight: '100vh', background: DARK, color: TEXT, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Nav />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ textAlign: 'center', padding: '72px 24px 64px', maxWidth: '860px', margin: '0 auto' }}>
        <div style={{
          display: 'inline-block', marginBottom: '20px',
          padding: '5px 16px', borderRadius: '99px',
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
          fontSize: '11px', fontWeight: 700, color: GOLD, letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>
          SAGUARO VS {competitor.name.toUpperCase()}
        </div>

        <h1 style={{ fontSize: 'clamp(32px,5vw,54px)', fontWeight: 900, lineHeight: 1.1, margin: '0 0 20px', letterSpacing: '-0.02em' }}>
          {headlineLines[0]}
          {headlineLines[1] && (
            <>
              <br />
              <span style={{ background: `linear-gradient(135deg, ${GOLD}, #FCD34D)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {headlineLines[1]}
              </span>
            </>
          )}
        </h1>

        <p style={{ fontSize: '18px', color: DIM, lineHeight: 1.65, maxWidth: '660px', margin: '0 auto 36px' }}>
          {competitor.heroSubheadline}
        </p>

        <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/signup" style={{
            padding: '14px 34px', background: `linear-gradient(135deg, ${GOLD}, #FCD34D)`,
            borderRadius: '9px', color: '#000', fontWeight: 700, fontSize: '15px',
            textDecoration: 'none', letterSpacing: '0.02em',
          }}>
            Start Free Trial
          </Link>
          <a href="#comparison" style={{
            padding: '14px 28px', background: 'transparent',
            border: `1px solid ${BORDER}`, borderRadius: '9px',
            color: TEXT, fontWeight: 500, fontSize: '14px', textDecoration: 'none',
          }}>
            See Full Comparison
          </a>
        </div>

        <div style={{ marginTop: '14px', fontSize: '12px', color: DIM }}>
          No credit card required. 30-day free trial. Cancel anytime.
        </div>
      </section>

      {/* ── Win stats bar ─────────────────────────────────────────────────── */}
      <div style={{ background: RAISED, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: '28px 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', textAlign: 'center' }} className="ccp-stats-grid">
          {[
            { value: savings, label: 'vs. per-seat or high-priced plans' },
            { value: '1 day setup', label: `vs. ${competitor.setupTime} for ${competitor.name}` },
            { value: `${aiCount} AI feature${aiCount !== 1 ? 's' : ''}`, label: `${competitor.name} doesn't have` },
          ].map((stat, i) => (
            <div key={i} style={{ padding: '8px 12px' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: GOLD, marginBottom: '4px' }}>{stat.value}</div>
              <div style={{ fontSize: '12px', color: DIM, lineHeight: 1.4 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature comparison table ───────────────────────────────────────── */}
      <section id="comparison" style={{ maxWidth: '1040px', margin: '0 auto', padding: '72px 24px' }}>
        <h2 style={{ fontSize: 'clamp(24px,3.5vw,38px)', fontWeight: 900, textAlign: 'center', marginBottom: '10px', letterSpacing: '-0.01em' }}>
          Saguaro vs {competitor.name}: Feature by Feature
        </h2>
        <p style={{ color: DIM, textAlign: 'center', marginBottom: '40px', fontSize: '15px' }}>
          {competitor.saguaroAdvantage}
        </p>

        <div style={{ border: `1px solid ${BORDER}`, borderRadius: '14px', overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1.8fr 1fr 1fr',
            background: '#070d14', borderBottom: `1px solid ${BORDER}`,
          }}>
            <div style={{ padding: '18px 24px', fontSize: '12px', fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Feature
            </div>
            <div style={{
              padding: '18px 24px', borderLeft: `1px solid ${BORDER}`, textAlign: 'center',
              background: 'rgba(245,158,11,0.06)',
              boxShadow: 'inset 0 0 0 1px rgba(245,158,11,0.12)',
            }}>
              <div style={{ fontWeight: 800, fontSize: '15px', color: GOLD, letterSpacing: '0.04em' }}>SAGUARO</div>
            </div>
            <div style={{ padding: '18px 24px', borderLeft: `1px solid ${BORDER}`, textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '15px', color: DIM }}>{competitor.name}</div>
            </div>
          </div>

          {rows.map((row, i) => (
            <div
              key={row.feature}
              style={{
                display: 'grid', gridTemplateColumns: '1.8fr 1fr 1fr',
                borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : 'none',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
              }}
            >
              <div style={{ padding: '15px 24px', fontSize: '13px', fontWeight: 600, color: TEXT, display: 'flex', alignItems: 'center' }}>
                {row.feature}
              </div>

              {/* Saguaro cell */}
              <div style={{
                padding: '15px 20px', borderLeft: `1px solid ${BORDER}`,
                background: row.saguaroWins ? 'rgba(34,197,94,0.04)' : 'rgba(245,158,11,0.04)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}>
                {row.saguaroWins && <Check />}
                <span style={{
                  fontSize: '13px', fontWeight: row.saguaroWins ? 600 : 400,
                  color: row.saguaroWins ? GREEN : TEXT,
                  textAlign: 'center',
                }}>
                  {row.saguaroValue}
                </span>
              </div>

              {/* Competitor cell */}
              <div style={{
                padding: '15px 20px', borderLeft: `1px solid ${BORDER}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}>
                {row.saguaroWins && <Cross />}
                <span style={{
                  fontSize: '13px',
                  color: row.tie ? DIM : row.saguaroWins ? RED : DIM,
                  textAlign: 'center',
                }}>
                  {row.competitorValue}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Competitor weaknesses ─────────────────────────────────────────── */}
      <section style={{ background: RAISED, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: '72px 24px' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(22px,3vw,34px)', fontWeight: 900, textAlign: 'center', marginBottom: '10px' }}>
            Where {competitor.name} Falls Short
          </h2>
          <p style={{ color: DIM, textAlign: 'center', marginBottom: '40px', fontSize: '15px' }}>
            {competitor.name} is best for: {competitor.bestFor}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {competitor.weaknesses.map((weakness, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '14px',
                  background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)',
                  borderRadius: '10px', padding: '18px 20px',
                }}
              >
                <div style={{ marginTop: '1px' }}>
                  <Warning />
                </div>
                <span style={{ fontSize: '14px', color: TEXT, lineHeight: 1.6 }}>{weakness}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Migration CTA ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: '800px', margin: '0 auto', padding: '72px 24px' }}>
        <div style={{
          background: RAISED, border: `1px solid ${BORDER}`,
          borderRadius: '16px', padding: '48px 40px', textAlign: 'center',
        }}>
          <h2 style={{ fontSize: 'clamp(22px,3vw,32px)', fontWeight: 900, marginBottom: '12px' }}>
            Ready to Switch from {competitor.name}?
          </h2>
          <p style={{ color: DIM, fontSize: '15px', lineHeight: 1.65, marginBottom: '12px', maxWidth: '560px', margin: '0 auto 12px' }}>
            We offer free data migration from {competitor.name}. Our onboarding team will move your projects, contacts, and documents — no data left behind.
          </p>
          <p style={{ color: DIM, fontSize: '13px', marginBottom: '32px' }}>
            Average migration time: under 24 hours.
          </p>
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href={migrationLink} style={{
              padding: '14px 32px', background: `linear-gradient(135deg, ${GOLD}, #FCD34D)`,
              borderRadius: '9px', color: '#000', fontWeight: 700, fontSize: '15px',
              textDecoration: 'none',
            }}>
              Start Free Migration
            </Link>
            <Link href="/signup" style={{
              padding: '14px 26px', background: 'transparent',
              border: `1px solid ${BORDER}`, borderRadius: '9px',
              color: TEXT, fontWeight: 500, fontSize: '14px', textDecoration: 'none',
            }}>
              Try Free First
            </Link>
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section style={{
        background: `linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.04) 100%)`,
        borderTop: `1px solid rgba(245,158,11,0.2)`, padding: '80px 24px', textAlign: 'center',
      }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(26px,4vw,42px)', fontWeight: 900, marginBottom: '14px', letterSpacing: '-0.02em' }}>
            The smarter platform for serious GCs.
          </h2>
          <p style={{ color: DIM, fontSize: '16px', marginBottom: '8px', lineHeight: 1.6 }}>
            AI takeoff. Lien waivers. Certified payroll. Field app. All in one platform, flat price.
          </p>
          <p style={{ color: DIM, fontSize: '13px', marginBottom: '36px' }}>
            30-day free trial. No credit card required.
          </p>
          <Link href="/signup" style={{
            display: 'inline-block', padding: '16px 44px',
            background: `linear-gradient(135deg, ${GOLD}, #FCD34D)`,
            borderRadius: '10px', color: '#000', fontWeight: 800, fontSize: '16px',
            textDecoration: 'none', letterSpacing: '0.02em',
          }}>
            Start Free Trial — No CC Required
          </Link>
          <div style={{ marginTop: '20px', fontSize: '13px', color: DIM }}>
            Also compare:{' '}
            <Link href="/compare/procore" style={{ color: GOLD, textDecoration: 'none' }}>Saguaro vs Procore</Link>
            {competitor.slug !== 'buildertrend' && (
              <>{' · '}<Link href="/compare/buildertrend" style={{ color: GOLD, textDecoration: 'none' }}>vs Buildertrend</Link></>
            )}
            {competitor.slug !== 'fieldwire' && (
              <>{' · '}<Link href="/compare/fieldwire" style={{ color: GOLD, textDecoration: 'none' }}>vs Fieldwire</Link></>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer style={{ background: DARK, borderTop: `1px solid ${BORDER}`, padding: '32px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <span style={{ fontWeight: 800, fontSize: '14px', color: GOLD, letterSpacing: '0.08em' }}>SAGUARO</span>
            <span style={{ fontSize: '11px', color: DIM }}>Control Systems</span>
          </Link>
          <div style={{ fontSize: '12px', color: DIM }}>
            &copy; {new Date().getFullYear()} Saguaro Control Systems. All rights reserved.
          </div>
          <div style={{ display: 'flex', gap: '20px' }}>
            {[
              { label: 'Privacy', href: '/privacy' },
              { label: 'Terms', href: '/terms' },
              { label: 'Pricing', href: '/pricing' },
              { label: 'Sign Up', href: '/signup' },
            ].map(link => (
              <Link key={link.href} href={link.href} style={{ fontSize: '12px', color: DIM, textDecoration: 'none' }}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>

      <style>{`
        @media (max-width: 768px) {
          .ccp-desktop { display: none !important; }
          .ccp-mobile { display: flex !important; }
          .ccp-stats-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 600px) {
          #comparison > div:last-child > div {
            grid-template-columns: 1fr !important;
          }
          #comparison > div:last-child > div > div:nth-child(2),
          #comparison > div:last-child > div > div:nth-child(3) {
            border-left: none !important;
            border-top: 1px solid ${BORDER};
          }
        }
      `}</style>
    </div>
  );
}
