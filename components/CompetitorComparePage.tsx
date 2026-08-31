'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import type { Competitor } from '@/lib/competitors';

const DARK = '#0a0a0a';
const GOLD = '#F59E0B';
const TEXT = '#FFFFFF';
const DIM = '#CBD5E1';
const BORDER = 'rgba(255,255,255,0.12)';
const RAISED = '#141416';
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
        background: scrolled ? 'rgba(20,20,22,0.97)' : 'rgba(20,20,22,0.85)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.14)' : `1px solid ${BORDER}`,
        transition: 'all 0.3s ease', height: '58px',
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{
          maxWidth: '1200px', margin: '0 auto', padding: '0 32px',
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }} aria-label="Saguaro Control Systems — home">
            <img
              src="/logo-full.jpg"
              alt="Saguaro Control Systems"
              style={{ height: '36px', width: 'auto', objectFit: 'contain', borderRadius: '4px', flexShrink: 0 }}
            />
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span style={{ fontWeight: 600, fontSize: '14px', letterSpacing: '0.1em', color: TEXT }}>SAGUARO</span>
              <span style={{ fontSize: '7px', color: '#CBD5E1', letterSpacing: '0.25em', fontWeight: 600, textTransform: 'uppercase' }}>Control Systems</span>
            </span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} className="ccp-desktop">
            <Link href="/login" style={{ padding: '7px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '13px', fontWeight: 400, textDecoration: 'none' }}>Log In</Link>
            <Link href="/signup" style={{ padding: '7px 18px', background: '#F59E0B', border: 'none', borderRadius: '6px', color: '#000', fontSize: '13px', fontWeight: 600, letterSpacing: '0.03em', textDecoration: 'none' }}>Free Trial</Link>
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
        <div style={{ position: 'fixed', top: '58px', left: 0, right: 0, zIndex: 9998, background: 'rgba(20,20,22,0.99)', borderBottom: `1px solid ${BORDER}`, padding: '8px 0 16px', backdropFilter: 'blur(12px)' }}>
          <div style={{ padding: '16px' }}>
            <Link href="/login" onClick={() => setMobileOpen(false)}
              style={{ display: 'block', textAlign: 'center', padding: '13px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: '9px', color: TEXT, fontWeight: 600, textDecoration: 'none', fontSize: '15px', marginBottom: '10px' }}>
              Log In
            </Link>
            <Link href="/signup" onClick={() => setMobileOpen(false)}
              style={{ display: 'block', textAlign: 'center', padding: '13px', background: '#F59E0B', borderRadius: '9px', color: '#000', fontWeight: 600, textDecoration: 'none', fontSize: '15px' }}>
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
    row('Starting Price', '$499/mo flat', c.startingPrice, false, true),
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
      'Field App Included Free',
      'Yes — native iOS, free for whole crew',
      c.perSeat ? 'Paid — per-seat field access' : 'Paid platform feature',
      true,
      false,
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
          display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '24px',
          padding: '5px 14px', borderRadius: '99px',
          background: 'transparent', border: '1px solid rgba(255,255,255,0.14)',
          fontSize: '11px', fontWeight: 600, color: DIM, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          <span style={{ width: '5px', height: '5px', borderRadius: '99px', background: GOLD }} />
          Saguaro vs {competitor.name}
        </div>

        <h1 style={{ fontSize: 'clamp(28px,4vw,32px)', fontWeight: 600, lineHeight: 1.15, margin: '0 0 20px', letterSpacing: '-0.02em' }}>
          {headlineLines[0]}
          {headlineLines[1] && (
            <>
              <br />
              <span style={{ color: TEXT }}>
                {headlineLines[1]}
              </span>
            </>
          )}
        </h1>

        <p style={{ fontSize: '16px', color: DIM, lineHeight: 1.65, maxWidth: '620px', margin: '0 auto 36px' }}>
          {competitor.heroSubheadline}
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/signup" style={{
            padding: '11px 24px', background: GOLD,
            borderRadius: '8px', color: DARK, fontWeight: 600, fontSize: '14px',
            textDecoration: 'none',
          }}>
            Start Free Trial
          </Link>
          <a href="#comparison" style={{
            padding: '11px 22px', background: 'transparent',
            border: '1px solid rgba(255,255,255,0.14)', borderRadius: '8px',
            color: DIM, fontWeight: 500, fontSize: '14px', textDecoration: 'none',
          }}>
            See Full Comparison
          </a>
        </div>

        <div style={{ marginTop: '14px', fontSize: '12px', color: DIM }}>
          No credit card required. 30-day free trial. Cancel anytime.
        </div>
      </section>

      {/* ── Win stats bar ─────────────────────────────────────────────────── */}
      <div style={{ background: RAISED, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: '36px 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', textAlign: 'center' }} className="ccp-stats-grid">
          {[
            { value: savings, label: 'vs. per-seat or high-priced plans' },
            { value: '1 day setup', label: `vs. ${competitor.setupTime} for ${competitor.name}` },
            { value: `${aiCount} AI feature${aiCount !== 1 ? 's' : ''}`, label: `${competitor.name} doesn't have` },
          ].map((stat, i) => (
            <div key={i} style={{ padding: '8px 12px' }}>
              <div style={{ fontSize: '19px', fontWeight: 600, color: TEXT, marginBottom: '4px' }}>{stat.value}</div>
              <div style={{ fontSize: '12px', color: DIM, lineHeight: 1.4 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature comparison table ───────────────────────────────────────── */}
      <section id="comparison" style={{ maxWidth: '1040px', margin: '0 auto', padding: '88px 24px' }}>
        <h2 style={{ fontSize: 'clamp(20px,3vw,24px)', fontWeight: 600, textAlign: 'center', marginBottom: '10px', letterSpacing: '-0.01em' }}>
          Saguaro vs {competitor.name}: feature by feature
        </h2>
        <p style={{ color: DIM, textAlign: 'center', marginBottom: '40px', fontSize: '15px' }}>
          {competitor.saguaroAdvantage}
        </p>

        <div className="ccp-compare" style={{ border: `1px solid ${BORDER}`, borderRadius: '14px', overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1.8fr 1fr 1fr',
            background: '#1c1c1e', borderBottom: `1px solid ${BORDER}`,
          }}>
            <div style={{ padding: '18px 24px', fontSize: '12px', fontWeight: 600, color: DIM, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Feature
            </div>
            <div style={{
              padding: '18px 24px', borderLeft: `1px solid ${BORDER}`, textAlign: 'center',
              background: 'rgba(255,255,255,0.03)',
            }}>
              <div style={{ fontWeight: 600, fontSize: '15px', color: TEXT, letterSpacing: '0.04em' }}>SAGUARO</div>
            </div>
            <div style={{ padding: '18px 24px', borderLeft: `1px solid ${BORDER}`, textAlign: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: '15px', color: DIM }}>{competitor.name}</div>
            </div>
          </div>

          {rows.map((row, i) => (
            <div
              key={row.feature}
              style={{
                display: 'grid', gridTemplateColumns: '1.8fr 1fr 1fr',
                borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : 'none',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.04)',
              }}
            >
              <div style={{ padding: '15px 24px', fontSize: '13px', fontWeight: 600, color: TEXT, display: 'flex', alignItems: 'center' }}>
                {row.feature}
              </div>

              {/* Saguaro cell */}
              <div style={{
                padding: '15px 20px', borderLeft: `1px solid ${BORDER}`,
                background: row.saguaroWins ? 'rgba(34,197,94,0.04)' : 'transparent',
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
      <section style={{ background: RAISED, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: '88px 24px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(20px,3vw,22px)', fontWeight: 600, textAlign: 'center', marginBottom: '10px' }}>
            Where {competitor.name} falls short
          </h2>
          <p style={{ color: DIM, textAlign: 'center', marginBottom: '40px', fontSize: '15px' }}>
            {competitor.name} is best for: {competitor.bestFor}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {competitor.weaknesses.map((weakness, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '14px',
                  padding: '18px 0',
                  borderTop: i > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                }}
              >
                <div style={{ marginTop: '1px' }}>
                  <Warning />
                </div>
                <span style={{ fontSize: '14px', color: DIM, lineHeight: 1.6 }}>{weakness}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Migration CTA ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: '800px', margin: '0 auto', padding: '88px 24px' }}>
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px', padding: '48px 40px', textAlign: 'center',
        }}>
          <h2 style={{ fontSize: 'clamp(20px,3vw,22px)', fontWeight: 600, marginBottom: '12px' }}>
            Ready to switch from {competitor.name}?
          </h2>
          <p style={{ color: DIM, fontSize: '15px', lineHeight: 1.65, marginBottom: '12px', maxWidth: '560px', margin: '0 auto 12px' }}>
            We offer free data migration from {competitor.name}. Our onboarding team will move your projects, contacts, and documents — no data left behind.
          </p>
          <p style={{ color: DIM, fontSize: '13px', marginBottom: '32px' }}>
            We handle the full migration for you.
          </p>
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href={migrationLink} style={{
              padding: '11px 24px', background: GOLD,
              borderRadius: '8px', color: DARK, fontWeight: 600, fontSize: '14px',
              textDecoration: 'none',
            }}>
              Start Free Migration
            </Link>
            <Link href="/signup" style={{
              padding: '11px 22px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.14)', borderRadius: '8px',
              color: DIM, fontWeight: 500, fontSize: '14px', textDecoration: 'none',
            }}>
              Try Free First
            </Link>
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section style={{
        background: RAISED,
        borderTop: `1px solid ${BORDER}`, padding: '96px 24px', textAlign: 'center',
      }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(22px,3vw,28px)', fontWeight: 600, marginBottom: '14px', letterSpacing: '-0.02em' }}>
            The smarter platform for serious GCs.
          </h2>
          <p style={{ color: DIM, fontSize: '16px', marginBottom: '8px', lineHeight: 1.6 }}>
            AI takeoff. Lien waivers. Certified payroll. Field app. All in one platform, flat price.
          </p>
          <p style={{ color: DIM, fontSize: '13px', marginBottom: '36px' }}>
            30-day free trial. No credit card required.
          </p>
          <Link href="/signup" style={{
            display: 'inline-block', padding: '12px 28px',
            background: GOLD,
            borderRadius: '8px', color: DARK, fontWeight: 600, fontSize: '15px',
            textDecoration: 'none',
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
            <span style={{ fontWeight: 600, fontSize: '14px', color: TEXT, letterSpacing: '0.08em' }}>SAGUARO</span>
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
        @media (max-width: 640px) {
          .ccp-compare > div {
            grid-template-columns: 1fr !important;
          }
          .ccp-compare > div > div:nth-child(2),
          .ccp-compare > div > div:nth-child(3) {
            border-left: none !important;
            border-top: 1px solid ${BORDER};
          }
        }
      `}</style>
    </div>
  );
}
