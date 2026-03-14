'use client';
import Link from 'next/link';
import { City } from '@/lib/cities';

// ── Design tokens ─────────────────────────────────────────────────────────────
const DARK = '#0d1117';
const GOLD = '#F59E0B';
const TEXT = '#F8FAFC';
const DIM = '#CBD5E1';
const BORDER = '#1E3A5F';
const RAISED = '#0F172A';
const GREEN = '#22c55e';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isUnionHeavy(city: City) {
  return ['chicago-il', 'seattle-wa', 'minneapolis-mn'].includes(city.slug);
}

function isCA(city: City) { return city.stateAbbr === 'CA'; }
function isTX(city: City) { return city.stateAbbr === 'TX'; }

function getLienStat(city: City): string {
  if (isCA(city)) return 'CA-compliant lien waivers built in';
  if (isTX(city)) return 'TX statutory lien waivers in seconds';
  return 'All 50-state lien waivers included';
}

function getUnionStat(city: City): string {
  if (isUnionHeavy(city)) return 'Certified payroll for union projects';
  return 'Certified payroll WH-347 included';
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const IconBlueprint = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
    <rect x={2} y={2} width={20} height={20} rx={2} /><path d="M2 9h20M9 2v20" />
  </svg>
);
const IconDollar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
    <line x1={12} y1={1} x2={12} y2={23} /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);
const IconLock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
    <rect x={3} y={11} width={18} height={11} rx={2} ry={2} /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IconPayroll = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" /><line x1={16} y1={13} x2={8} y2={13} /><line x1={16} y1={17} x2={8} y2={17} />
  </svg>
);
const IconMobile = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
    <rect x={5} y={2} width={14} height={20} rx={2} ry={2} /><line x1={12} y1={18} x2={12.01} y2={18} />
  </svg>
);
const IconChart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
    <line x1={18} y1={20} x2={18} y2={10} /><line x1={12} y1={20} x2={12} y2={4} /><line x1={6} y1={20} x2={6} y2={14} />
  </svg>
);
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconX = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
    <line x1={18} y1={6} x2={6} y2={18} /><line x1={6} y1={6} x2={18} y2={18} />
  </svg>
);

// ── Feature card data ─────────────────────────────────────────────────────────

interface Feature {
  icon: React.ReactNode;
  title: (city: City) => string;
  desc: (city: City) => string;
  pill: string;
}

const FEATURES: Feature[] = [
  {
    icon: <IconBlueprint />,
    title: () => 'AI Blueprint Takeoff',
    desc: (city) => `Upload any PDF blueprint. Sage reads every dimension, calculates all materials, and generates a full bid estimate in under 60 seconds — faster than any ${city.name} estimator working by hand.`,
    pill: 'AI-powered',
  },
  {
    icon: <IconDollar />,
    title: () => 'AIA Pay Applications G702/G703',
    desc: () => 'Generate G702/G703 Continuation Sheets automatically. Submit to owners digitally with one click — no PDFs to fill by hand.',
    pill: 'G702 / G703',
  },
  {
    icon: <IconLock />,
    title: (city) => `Lien Waivers — ${city.state}-Compliant`,
    desc: (city) => `Conditional & unconditional, partial & final. ${city.state} statutory language baked in. Send, sign, and track — no paper, no fax, no compliance gaps.`,
    pill: 'All 50 states',
  },
  {
    icon: <IconPayroll />,
    title: () => 'Certified Payroll WH-347',
    desc: () => 'DOL-compliant weekly reports for prevailing wage projects. Pulls live Davis-Bacon wage rates. Submits directly to agencies.',
    pill: 'Davis-Bacon',
  },
  {
    icon: <IconMobile />,
    title: (city) => `Mobile Field App — Works on ${city.name} Job Sites`,
    desc: (city) => `Give your ${city.name} crew a native-speed PWA — daily logs, photos, GPS clock-in, punch lists, RFIs, and inspections. Works fully offline. No App Store required.`,
    pill: 'iOS · Android · Offline',
  },
  {
    icon: <IconChart />,
    title: () => 'Bid Intelligence AI',
    desc: (city) => `AI scores every bid opportunity 0–100 based on your win history, ${city.name} market conditions, and margin targets. Stop chasing bad bids.`,
    pill: 'Win rate AI',
  },
];

// ── Comparison rows ───────────────────────────────────────────────────────────

const COMPARISON_ROWS = (city: City) => [
  { feature: 'Blueprint takeoff', manual: '4–8 hours', saguaro: '41 seconds' },
  { feature: 'Lien waivers', manual: 'Word/PDF manual', saguaro: `Digital, ${city.state}-compliant` },
  { feature: 'AIA pay apps', manual: '1–2 hours per app', saguaro: '60 seconds' },
  { feature: 'Field logs', manual: 'Paper forms', saguaro: 'Mobile app, offline-capable' },
  { feature: 'Bid tracking', manual: 'Spreadsheet', saguaro: 'AI win-rate scoring' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function CityLandingPage({ city }: { city: City }) {
  const lienStat = getLienStat(city);
  const unionStat = getUnionStat(city);

  // JSON-LD schema
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'Saguaro CRM',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, iOS, Android',
        description: `Construction management software for general contractors in ${city.name}, ${city.state}. AI blueprint takeoff, lien waivers, certified payroll, field app.`,
        url: `https://saguarocontrol.net/local/${city.slug}`,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          description: '30-day free trial, no credit card required',
        },
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.9',
          reviewCount: '312',
        },
        featureList: [
          'AI Blueprint Takeoff',
          'AIA Pay Applications G702/G703',
          'Lien Waivers All 50 States',
          'Certified Payroll WH-347',
          'Mobile Field App',
          'Bid Intelligence AI',
        ],
      },
      {
        '@type': 'LocalBusiness',
        name: `Saguaro CRM — ${city.name} Construction Software`,
        description: `Construction management software serving general contractors in ${city.name}, ${city.state}.`,
        url: `https://saguarocontrol.net/local/${city.slug}`,
        areaServed: {
          '@type': 'City',
          name: city.name,
          containedInPlace: {
            '@type': 'State',
            name: city.state,
          },
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: city.latitude,
          longitude: city.longitude,
        },
        telephone: '+1-800-555-0100',
        priceRange: '$$',
        sameAs: [
          'https://saguarocontrol.net',
        ],
      },
    ],
  };

  return (
    <>
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div style={{ background: DARK, minHeight: '100vh', color: TEXT, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>

        {/* ── Nav ─────────────────────────────────────────────────────────── */}
        <nav style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: 'rgba(13,17,23,0.97)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${BORDER}`, height: '58px',
          display: 'flex', alignItems: 'center',
        }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
              <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: '34px', width: 'auto', objectFit: 'contain', borderRadius: '4px' }} />
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '0.1em', background: 'linear-gradient(90deg,#D4A017,#F0C040)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SAGUARO</span>
                <span style={{ fontSize: '7px', color: '#8fa3c0', letterSpacing: '0.25em', fontWeight: 600, textTransform: 'uppercase' }}>Control Systems</span>
              </span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Link href="/login" style={{ padding: '7px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '13px', fontWeight: 400, textDecoration: 'none' }}>
                Log In
              </Link>
              <Link href="/signup" style={{ padding: '7px 16px', background: '#D4A017', border: 'none', borderRadius: '6px', color: '#000', fontSize: '13px', fontWeight: 700, letterSpacing: '0.03em', textDecoration: 'none' }}>
                Free Trial
              </Link>
            </div>
          </div>
        </nav>

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '72px 24px 56px' }}>
          {/* Badge */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)',
              borderRadius: '999px', padding: '6px 16px',
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: GOLD, textTransform: 'uppercase',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: GOLD, display: 'inline-block', flexShrink: 0 }} />
              Serving {city.name.toUpperCase()}, {city.stateAbbr} Contractors
            </span>
          </div>

          {/* Headline */}
          <h1 style={{ textAlign: 'center', fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, lineHeight: 1.1, margin: '0 0 20px', letterSpacing: '-0.02em' }}>
            The Construction CRM Built for{' '}
            <br />
            <span style={{ background: `linear-gradient(90deg, ${GOLD}, #fcd34d)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {city.name} General Contractors
            </span>
          </h1>

          {/* Subheadline */}
          <p style={{ textAlign: 'center', fontSize: 'clamp(15px, 2vw, 18px)', color: DIM, maxWidth: '720px', margin: '0 auto 36px', lineHeight: 1.65 }}>
            AI blueprint takeoff, AIA pay apps, lien waivers under {city.state} law, certified payroll, and a free mobile field app — everything {city.name} GCs need to outbid and outbuild the competition.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
            <Link href="/signup" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '14px 28px', background: `linear-gradient(135deg, #D4A017, ${GOLD})`,
              borderRadius: '8px', color: '#000', fontWeight: 700, fontSize: '15px',
              textDecoration: 'none', letterSpacing: '0.02em',
              boxShadow: '0 4px 24px rgba(212,160,23,0.35)',
            }}>
              Start Free Trial
            </Link>
            <Link href="/sandbox" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '14px 28px', background: 'transparent',
              border: `1px solid ${BORDER}`, borderRadius: '8px',
              color: TEXT, fontWeight: 600, fontSize: '15px', textDecoration: 'none',
            }}>
              Try AI Takeoff Free
            </Link>
          </div>

          {/* Trust line */}
          <p style={{ textAlign: 'center', fontSize: '12px', color: '#64748b', margin: '0 0 40px', letterSpacing: '0.04em' }}>
            30-day free trial &middot; No credit card &middot; Month-to-month &middot; Cancel anytime
          </p>

          {/* Local market note */}
          <div style={{
            maxWidth: '720px', margin: '0 auto',
            background: RAISED, border: `1px solid ${BORDER}`,
            borderLeft: `3px solid ${GOLD}`, borderRadius: '8px',
            padding: '16px 20px',
            display: 'flex', gap: '12px', alignItems: 'flex-start',
          }}>
            <span style={{ color: GOLD, fontSize: '18px', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}>&#9432;</span>
            <p style={{ margin: 0, fontSize: '14px', color: DIM, lineHeight: 1.6 }}>
              <strong style={{ color: TEXT }}>{city.name} Market:</strong>{' '}{city.constructionNotes}
            </p>
          </div>
        </section>

        {/* ── Local context bar ────────────────────────────────────────────── */}
        <section style={{ background: RAISED, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 24px' }}>
            <h2 style={{ textAlign: 'center', fontSize: '13px', fontWeight: 700, letterSpacing: '0.12em', color: GOLD, textTransform: 'uppercase', marginBottom: '32px' }}>
              Why {city.name} GCs Choose Saguaro
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
              {[
                { label: lienStat, sub: `Built for ${city.state} statutory requirements` },
                { label: `AI Takeoff in 41 seconds`, sub: 'Any PDF — floor plan, structural, MEP' },
                { label: `Flat pricing — your whole ${city.name} team`, sub: 'No per-seat fees, no surprises' },
                { label: `Mobile field app works on ${city.name} job sites offline`, sub: 'GPS clock-in, daily logs, no signal needed' },
                { label: unionStat, sub: 'DOL WH-347, Davis-Bacon wage rates' },
              ].map((item, i) => (
                <div key={i} style={{
                  background: DARK, border: `1px solid ${BORDER}`, borderRadius: '10px',
                  padding: '20px', display: 'flex', flexDirection: 'column', gap: '6px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: GREEN, flexShrink: 0 }}><IconCheck /></span>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: TEXT, lineHeight: 1.3 }}>{item.label}</span>
                  </div>
                  <p style={{ margin: '0 0 0 24px', fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>{item.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────────── */}
        <section id="features" style={{ maxWidth: '1100px', margin: '0 auto', padding: '72px 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', color: GOLD, textTransform: 'uppercase', marginBottom: '12px' }}>
              Everything in one platform
            </p>
            <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
              Built for {city.name} GCs
            </h2>
            <p style={{ color: DIM, fontSize: '16px', marginTop: '12px', maxWidth: '540px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
              Every tool a general contractor in {city.name} needs — from first bid to final lien waiver.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{
                background: RAISED, border: `1px solid ${BORDER}`,
                borderRadius: '12px', padding: '28px',
                transition: 'border-color 0.2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '10px',
                    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: GOLD, flexShrink: 0,
                  }}>
                    {f.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: TEXT }}>{f.title(city)}</h3>
                      <span style={{
                        fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                        background: 'rgba(245,158,11,0.15)', color: GOLD,
                        borderRadius: '4px', padding: '2px 7px',
                      }}>{f.pill}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', color: DIM, lineHeight: 1.65 }}>{f.desc(city)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Comparison table ─────────────────────────────────────────────── */}
        <section style={{ background: RAISED, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ maxWidth: '860px', margin: '0 auto', padding: '72px 24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
              <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', color: GOLD, textTransform: 'uppercase', marginBottom: '12px' }}>
                The honest comparison
              </p>
              <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                How Saguaro Compares for {city.name} GCs
              </h2>
            </div>

            <div style={{ borderRadius: '12px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: '#0a0f18', padding: '14px 20px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Feature</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'center' }}>Manual / Excel</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: GOLD, letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'center' }}>Saguaro CRM</span>
              </div>

              {COMPARISON_ROWS(city).map((row, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                  padding: '16px 20px',
                  borderTop: `1px solid ${BORDER}`,
                  background: i % 2 === 0 ? DARK : 'rgba(15,23,42,0.6)',
                  alignItems: 'center',
                }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: TEXT }}>{row.feature}</span>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <IconX />
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>{row.manual}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <IconCheck />
                    <span style={{ fontSize: '13px', color: GREEN, fontWeight: 600 }}>{row.saguaro}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section style={{ maxWidth: '860px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', color: GOLD, textTransform: 'uppercase', marginBottom: '16px' }}>
            Ready to get started?
          </p>
          <h2 style={{ fontSize: 'clamp(26px, 4.5vw, 40px)', fontWeight: 800, margin: '0 0 16px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Start Free — Built for {city.name}, {city.state} GCs
          </h2>
          <p style={{ color: DIM, fontSize: '16px', maxWidth: '520px', margin: '0 auto 36px', lineHeight: 1.65 }}>
            Join contractors in {city.name} using Saguaro to win more bids, get paid faster, and stay compliant under {city.state} law.
          </p>
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
            <Link href="/signup" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '15px 32px', background: `linear-gradient(135deg, #D4A017, ${GOLD})`,
              borderRadius: '8px', color: '#000', fontWeight: 700, fontSize: '15px',
              textDecoration: 'none', letterSpacing: '0.02em',
              boxShadow: '0 4px 28px rgba(212,160,23,0.4)',
            }}>
              Start Free Trial
            </Link>
            <Link href="/sandbox" style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '15px 28px', background: 'transparent',
              border: `1px solid ${BORDER}`, borderRadius: '8px',
              color: TEXT, fontWeight: 600, fontSize: '15px', textDecoration: 'none',
            }}>
              Try AI Takeoff Free &rarr;
            </Link>
          </div>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
            30-day free trial &middot; No credit card &middot; Month-to-month &middot; Cancel anytime
          </p>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer style={{ borderTop: `1px solid ${BORDER}`, background: '#080c11' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
              <img src="/logo-full.jpg" alt="Saguaro" style={{ height: '28px', width: 'auto', borderRadius: '3px' }} />
              <span style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.1em', background: 'linear-gradient(90deg,#D4A017,#F0C040)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SAGUARO</span>
            </Link>
            <nav style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { label: 'Features', href: '/#features' },
                { label: 'Pricing', href: '/pricing' },
                { label: 'Field App', href: '/field-app' },
                { label: 'Compare Procore', href: '/compare/procore' },
                { label: 'ROI Calculator', href: '/roi-calculator' },
                { label: 'Privacy', href: '/privacy' },
                { label: 'Terms', href: '/terms' },
              ].map(link => (
                <Link key={link.href} href={link.href} style={{ fontSize: '12px', color: '#64748b', textDecoration: 'none' }}>
                  {link.label}
                </Link>
              ))}
            </nav>
            <p style={{ margin: 0, fontSize: '11px', color: '#3d4f63', textAlign: 'center' }}>
              &copy; {new Date().getFullYear()} Saguaro Control Systems. Construction management software for {city.name}, {city.state} general contractors.
            </p>
          </div>
        </footer>

      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 640px) {
          section { padding-left: 16px !important; padding-right: 16px !important; }
        }
      `}</style>
    </>
  );
}
