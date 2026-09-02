'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { Blueprint, WifiHigh, UsersThree, PenNib, List, X, Broadcast, Briefcase, ListChecks, Notebook, Files, Receipt, MapPin, CloudSun, Thermometer, WifiSlash, Hand } from '@phosphor-icons/react';
import { IntegrationStrip } from '../components/Integrations';
import PromoTicker from '../components/PromoTicker';
import MarketingFooter, { SocialRow } from '../components/MarketingFooter';
import { ScribbleNote, ScribbleArrow } from '../components/Scribble';
import GetStartedTour from '../components/GetStartedTour';
import { moduleAccent } from '../lib/module-identity';
import { PLANS, TRIAL_DAYS, STARTING_PRICE_FLAT } from '../lib/plans';

/* ── palette ── */
const BG = '#0a0a0a';
const CARD = '#141416';
const GOLD = '#F59E0B';
const GREEN = '#34C759';
const TEXT = '#FFFFFF';
const DIM = '#CBD5E1';

const glass: React.CSSProperties = {
  background: 'rgba(20,20,22,0.65)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 16,
  boxShadow: 'var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,0.06)',
};

/* ── icons (inline SVG) ── */
const Icon = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{d.split('|').map((p, i) => <path key={i} d={p} />)}</svg>
);

const CheckIcon = () => <svg viewBox="0 0 20 20" width={18} height={18} fill={GREEN}><path d="M10 0a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.3 7.7-5 5a1 1 0 0 1-1.4 0l-2-2a1 1 0 1 1 1.4-1.4L8.6 10.6l4.3-4.3a1 1 0 0 1 1.4 1.4z" /></svg>;
const XIcon = () => <svg viewBox="0 0 20 20" width={18} height={18} fill="#EF4444"><circle cx={10} cy={10} r={10} opacity={0.15} /><path d="M7 7l6 6M13 7l-6 6" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" /></svg>;
const PartialIcon = () => <svg viewBox="0 0 20 20" width={18} height={18} fill={GOLD}><circle cx={10} cy={10} r={10} opacity={0.15} /><path d="M6 10h8" stroke={GOLD} strokeWidth={2} strokeLinecap="round" /></svg>;

/* ── nav links (legacy — replaced by dropdown menus) ── */

/* ── module data — real module names, module-identity accents ── */
const FEATURE_MODULES = [
  { key: 'radio', Ic: Broadcast, title: 'Saguaro Radio', desc: 'Push-to-talk for the whole crew, built into the platform — with live English/Spanish translation on every channel.', href: '/get-the-app' },
  { key: 'signal', Ic: WifiHigh, title: 'Signal Studio', desc: 'RF design studio: model wireless coverage on the floor plan and place hardware before anyone pulls cable.', href: '/features' },
  { key: 'takeoff', Ic: Blueprint, title: 'Takeoff Studio', desc: 'Upload the blueprint, measure quantities on the page, and walk out with a priced bid.', href: '/takeoff' },
  { key: 'bids', Ic: Briefcase, title: 'Bid Jackets', desc: 'Every bid packaged with its scope, quantities, and pricing in one jacket.', href: '/bids' },
  { key: 'work', Ic: ListChecks, title: 'My Work', desc: 'One queue for everything assigned to you, routed across every active project.', href: '/features' },
  { key: 'crews', Ic: UsersThree, title: 'Crews', desc: 'Live crew map, dispatch, and who-is-where across your jobsites.', href: '/features' },
  { key: 'tm', Ic: PenNib, title: 'T&M Tickets', desc: 'Time and materials captured in the field and signed on the glass.', href: '/features' },
  { key: 'daily', Ic: Notebook, title: 'Daily Logs', desc: "Auto-filled from the day's clock-ins, photos, tickets, and weather.", href: '/features' },
  { key: 'documents', Ic: Files, title: 'Documents', desc: 'Plans, submittals, and closeout files — versioned and shareable.', href: '/features' },
];

/* ── comparison data — our claims about our own product; competitors anonymized on purpose ── */
type Mark = 'yes' | 'no' | 'partial';
const COMPARISON_ROWS: { feature: string; saguaro: Mark; comp1: Mark; comp2: Mark; notYet?: boolean }[] = [
  { feature: 'Built-in PTT radio with EN/ES translation', saguaro: 'yes', comp1: 'no', comp2: 'no' },
  { feature: 'RF design studio (Signal Studio)', saguaro: 'yes', comp1: 'no', comp2: 'no' },
  { feature: 'AI blueprint takeoff to priced bid', saguaro: 'yes', comp1: 'no', comp2: 'partial' },
  { feature: 'Auto-fill daily logs', saguaro: 'yes', comp1: 'partial', comp2: 'partial' },
  { feature: 'My Work cross-project routing', saguaro: 'yes', comp1: 'no', comp2: 'no' },
  { feature: 'Live crew map', saguaro: 'yes', comp1: 'partial', comp2: 'no' },
  { feature: 'T&M tickets with signatures', saguaro: 'yes', comp1: 'partial', comp2: 'partial' },
  { feature: 'Sub + guest portals', saguaro: 'yes', comp1: 'yes', comp2: 'partial' },
  { feature: 'Offline field app', saguaro: 'yes', comp1: 'partial', comp2: 'partial' },
  { feature: 'Public marketplace / ERP suite', saguaro: 'no', comp1: 'yes', comp2: 'partial', notYet: true },
  { feature: 'Starting price', saguaro: 'yes', comp1: 'no', comp2: 'partial' },
];

const StatusCell = ({ v }: { v: Mark }) =>
  v === 'yes' ? <CheckIcon /> : v === 'partial' ? <PartialIcon /> : <XIcon />;

const PRICE_LABELS: Record<'saguaro' | 'comp1' | 'comp2', { text: string; color: string }> = {
  saguaro: { text: STARTING_PRICE_FLAT, color: GREEN },
  comp1: { text: 'Custom quote', color: '#EF4444' },
  comp2: { text: 'Per-seat', color: GOLD },
};

/* ── pricing data — rendered from the ONE canonical source (lib/plans.ts).
      Never hardcode tier prices or features here. ── */
const HOME_PLANS = PLANS.map(p => ({
  name: p.name,
  price: p.priceMo > 0 ? `$${p.priceMo}` : 'Call for Quote',
  period: p.priceMo > 0 ? '/mo' : '',
  desc: p.blurb,
  features: p.cardFeatures,
  cta: p.cta,
  ctaHref: p.ctaHref,
  highlighted: p.popular,
}));

/* ===========================
   MAIN PAGE COMPONENT
   =========================== */
export default function LandingPage() {
  /* menuOpen state removed — dropdowns handle their own state via IIFE */

  return (
    <div data-landing style={{ background: BG, color: TEXT, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", minHeight: '100vh', overflowX: 'hidden' as const }}>

      {/* ══════════ 1. TOP TICKER ══════════ */}
      <PromoTicker />

      {/* ══════════ 2. NAV ══════════ */}
      {(() => {
        const [mobileOpen, setMobileOpen] = useState(false);
        const links = [
          { label: 'Product', href: '/product' },
          { label: 'The App', href: '/get-the-app' },
          { label: 'Pricing', href: '/pricing' },
          { label: 'Compare', href: '/#compare' },
        ];
        return (
          <nav style={{
            position: 'sticky', top: 0, zIndex: 100,
            background: 'rgba(20,20,22,0.85)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            borderBottom: '1px solid rgba(245, 158, 11,0.12)',
            padding: '0 max(24px, 4vw)', height: 56,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            {/* Logo lockup — full horizontal badge + wordmark artwork */}
            <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }} aria-label="Saguaro Control Systems — home">
              <img src="/logo-horizontal.png" alt="Saguaro Control Systems" height={46} style={{ height: 46, width: 'auto', display: 'block' }} />
            </Link>

            {/* Desktop menu */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} className="desktop-nav">
              {links.map(l => l.label === 'The App' ? (
                /* Marked up the way a super marks up a drawing — the arrow points
                   at it from the left so the annotation fits the 56px nav. */
                <Link key={l.label} href={l.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 10px 8px 6px', textDecoration: 'none' }}>
                  <ScribbleArrow direction="right" width={30} color="#FBBF24" style={{ transform: 'rotate(6deg)', marginBottom: 2 }} />
                  <ScribbleNote color="#FBBF24" size={17} rotate={-3}>{l.label}</ScribbleNote>
                </Link>
              ) : (
                <Link key={l.label} href={l.href} style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 500, padding: '8px 14px', textDecoration: 'none' }}>{l.label}</Link>
              ))}
            </div>

            {/* Right side: compact social row + CTAs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="desktop-nav" style={{ display: 'flex', alignItems: 'center' }}><SocialRow size={15} gap={10} /></span>
              <Link href="/login" style={{ color: '#CBD5E1', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>Log In</Link>
              <Link href="/signup" className="btn-gold" style={{ fontSize: 13, padding: '8px 18px', textDecoration: 'none' }}>Free Trial</Link>

              {/* Mobile hamburger */}
              <button onClick={() => setMobileOpen(!mobileOpen)} style={{ display: 'none', background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', padding: 4 }} className="mobile-menu-btn" aria-label="Menu">
                {mobileOpen ? <X size={24} /> : <List size={24} />}
              </button>
            </div>

            {/* Mobile menu */}
            {mobileOpen && (
              <div style={{ position: 'absolute' as const, top: 56, left: 0, right: 0, background: 'rgba(20,20,22,0.98)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.12)', padding: 8 }}>
                {links.map(l => (
                  <Link key={l.label} href={l.href} onClick={() => setMobileOpen(false)} style={{ display: 'block', padding: '12px 16px', color: '#FFFFFF', fontSize: 15, fontWeight: 600, textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{l.label}</Link>
                ))}
              </div>
            )}
          </nav>
        );
      })()}

      {/* ══════════ 3. HERO ══════════ */}
      <section style={{ maxWidth: 1360, margin: '0 auto', padding: 'clamp(40px, 6vh, 64px) 24px 48px', display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 'clamp(32px, 4vw, 56px)', alignItems: 'center', position: 'relative' as const }} className="hero-grid">
        {/* very subtle ambient warmth — minimal, no stock photo */}
        <div style={{ position: 'absolute' as const, top: -120, right: -40, width: 460, height: 460, background: 'radial-gradient(circle, rgba(245,158,11,0.05) 0%, transparent 68%)', zIndex: 0, pointerEvents: 'none' as const }} />
        {/* left */}
        <div style={{ position: 'relative', zIndex: 1, minWidth: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', color: DIM, fontSize: 10.5, fontWeight: 500, letterSpacing: 0.8, padding: '5px 12px', borderRadius: 999, marginBottom: 24, textTransform: 'uppercase' as const }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: GOLD }} />Construction Management Platform</span>
          {/* Owner's call: bigger, and the heat gradient across the WHOLE phrase.
              className is load-bearing — [data-landing] h1 caps every heading at
              23px with !important, so an inline fontSize alone renders this at
              body size no matter what number is written here. maxWidth went
              460 -> 720 because at 62px the old measure broke it into slivers. */}
          <h1 className="landing-hero heat-shine" style={{ margin: '0 0 20px', maxWidth: 720 }}>Run the job. Talk to the crew. Price the work. One platform.</h1>
          <p style={{ color: DIM, fontSize: 15, fontWeight: 400, lineHeight: 1.7, margin: '0 0 32px', maxWidth: 452 }}>The construction platform with a built-in PTT radio, RF design studio, and blueprint-to-priced-bid takeoff.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            <Link href="/signup" className="btn-gold" style={{ textDecoration: 'none', fontSize: 13.5, padding: '10px 22px' }}>Start free trial <span style={{ fontSize: 15 }}>&rarr;</span></Link>
            <a href="#radio-demo" style={{ color: DIM, textDecoration: 'none', fontWeight: 500, fontSize: 13.5, padding: '10px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Broadcast size={15} weight="duotone" color={GOLD} /> Try the radio
            </a>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 24, fontWeight: 400 }}>Construction management &middot; Project controls &middot; National rollout specialists</div>
        </div>

        {/* "How It Works" anchor target — points to the demo mockup region */}
        <span id="how-it-works" aria-hidden="true" style={{ position: 'absolute' as const, top: 0, scrollMarginTop: 72 }} />
        {/* right — takeoff mockup */}
        <div id="demo" style={{ ...glass, padding: 0, overflow: 'hidden', position: 'relative', zIndex: 1, scrollMarginTop: 72, minWidth: 0, maxWidth: '100%' }} className="hero-mockup">
          {/* browser chrome */}
          <div style={{ background: 'rgba(20,20,22,0.8)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: GOLD }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: GREEN }} />
            <span style={{ flex: 1, background: 'rgba(0,0,0,0.06)', borderRadius: 6, padding: '4px 12px', fontSize: 11, color: DIM, marginLeft: 8 }}>app.saguaro.build/takeoff</span>
          </div>
          {/* mockup content */}
          <div style={{ padding: 20, background: `linear-gradient(135deg, ${BG} 0%, rgba(20,20,22,0.95) 50%, rgba(20,20,22,0.98) 100%)` }}>
            {/* toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>AI Takeoff Results</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <ScribbleNote color="#FBBF24" size={13} rotate={-5} style={{ opacity: .9 }}>read the blueprint</ScribbleNote>
                <ScribbleArrow direction="right" width={30} color="#FBBF24" style={{ transform: 'rotate(4deg)' }} />
                <span style={{ fontSize: 11, color: GOLD, fontWeight: 600, background: 'rgba(245, 158, 11,0.12)', padding: '3px 10px', borderRadius: 12 }}>38s &bull; 47 items</span>
              </span>
            </div>
            {/* table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 1, marginBottom: 2 }}>
              {['Item', 'Qty', 'Unit', 'Cost'].map(h => (
                <div key={h} style={{ fontSize: 10, color: DIM, fontWeight: 600, textTransform: 'uppercase' as const, padding: '6px 8px', background: 'rgba(255,255,255,0.04)' }}>{h}</div>
              ))}
            </div>
            {/* table rows */}
            {[
              ['Concrete Footing', '124', 'CY', '$18,600'],
              ['#5 Rebar', '2,400', 'LF', '$4,320'],
              ['CMU 8" Block', '3,650', 'EA', '$10,950'],
              ['Rigid Insulation', '4,800', 'SF', '$7,200'],
              ['Structural Steel', '48', 'TON', '$96,000'],
            ].map((row, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 1, marginBottom: 1 }}>
                {row.map((cell, j) => (
                  <div key={j} style={{ fontSize: 12, color: j === 3 ? GOLD : j === 0 ? TEXT : DIM, padding: '7px 8px', background: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent', fontWeight: j === 3 ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>{cell}</div>
                ))}
              </div>
            ))}
            {/* total bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, padding: '10px 8px', borderTop: `1px solid rgba(245, 158, 11,0.2)` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>Total Estimate</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <ScribbleNote color="#FBBF24" size={13} rotate={-6} style={{ opacity: .9 }}>no spreadsheet</ScribbleNote>
                <span style={{ fontSize: 14, fontWeight: 800, color: GOLD }}>$137,070</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Integration logos — real vendor marks (react-icons), only for shipped integrations */}
      {/* ══════════ 2. SONORAN — the origin story, front and center ══════════ */}
      {/* Scaled up 24 Aug 2026 on the owner's call: this is the origin story and
          it was reading as a footnote between two louder sections. It now holds
          a screen on its own — hero-scale headline, deeper vertical padding, a
          wider measure and a stronger horizon glow. Every size is a clamp, so
          the phone floor barely moves while the desktop ceiling roughly
          doubles: the headline goes 44px -> 82px only where there is room. */}
      <section style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(72px, 13vh, 136px) 24px clamp(64px, 11vh, 120px)', textAlign: 'center' as const, borderTop: '1px solid rgba(245,158,11,0.20)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {/* desert-heat backdrop: horizon glow, no images */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(92% 78% at 50% 118%, rgba(224,100,78,0.22) 0%, rgba(245,158,11,0.13) 38%, rgba(0,0,0,0) 74%)' }} />
        <div style={{ position: 'relative', maxWidth: 1360, margin: '0 auto' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '8px 20px', borderRadius: 999, border: '1px solid rgba(245,158,11,0.42)', background: 'rgba(245,158,11,0.10)', color: '#F5B84D', fontSize: 13, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' as const, marginBottom: 28 }}>
            <Thermometer size={15} weight="fill" /> Field-proven at 115°
          </span>
          {/* className, not just an inline size: [data-landing] h2 caps every
              heading at 17px with !important, and React cannot write
              !important into a style object — so the inline clamp alone was
              silently losing and this rendered at body size. */}
          <h2 className="landing-display" style={{ fontSize: 'clamp(34px, 6.2vw, 82px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.02, margin: '0 0 20px', textWrap: 'balance' as const }}>
            Born on <span style={{ background: 'linear-gradient(100deg, #E0644E 4%, #F59E0B 42%, #FDE68A 60%, #E0644E 96%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>Sonoran</span> jobsites.
          </h2>
          <p className="landing-lede" style={{ color: '#E4E4E7', fontSize: 'clamp(16px, 2.1vw, 23px)', lineHeight: 1.6, maxWidth: 820, margin: '0 auto 38px' }}>
            Built where summers hit <strong style={{ color: '#F5B84D' }}>115 degrees</strong> and the far corner of the site has no bars.
            The field app assumes gloves, glare, and no signal — because that is where it was raised.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap' as const, gap: 14 }}>
            {[
              { Ic: Hand, label: 'Glove mode' },
              { Ic: WifiSlash, label: 'Offline-first' },
              { Ic: MapPin, label: 'GPS clock-in' },
              { Ic: CloudSun, label: 'Auto weather on logs' },
            ].map(b => (
              <span key={b.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, border: '1px solid rgba(245,158,11,0.34)', background: 'linear-gradient(180deg, rgba(245,158,11,0.12), rgba(245,158,11,0.05))', color: '#F4F4F5', fontSize: 16, fontWeight: 700, padding: '13px 22px', borderRadius: 999, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09)' }}>
                <b.Ic size={19} weight="duotone" color="#F59E0B" />{b.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <IntegrationStrip />

      {/* ══════════ GETTING STARTED — the real first-run flow ══════════ */}
      <GetStartedTour />

      {/* ══════════ 4. MODULE GRID ══════════ */}
      <section id="features" style={{ maxWidth: 1360, margin: '0 auto', padding: '64px 24px' }}>
        <h2 style={{ textAlign: 'center' as const, fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 8 }}>What&apos;s inside</h2>
        <p style={{ textAlign: 'center' as const, color: DIM, fontSize: 14, marginBottom: 40, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>Real module names, listed because they ship — from the radio to the bid.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '44px 48px', maxWidth: 1360, margin: '0 auto' }} className="feature-grid">
          {FEATURE_MODULES.map(f => {
            const a = moduleAccent(f.key);
            return (
              <div key={f.title}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: a.soft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <f.Ic size={20} weight="duotone" color={a.hex} />
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 7, color: TEXT }}>{f.title}</h3>
                <p style={{ fontSize: 13, color: DIM, lineHeight: 1.6, margin: '0 0 10px' }}>{f.desc}</p>
                <Link href={f.href} style={{ fontSize: 12.5, color: GOLD, fontWeight: 500, textDecoration: 'none' }}>Learn more &rarr;</Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* ══════════ 5. RADIO DEMO ══════════ */}
      <section id="radio-demo" style={{ maxWidth: 1360, margin: '0 auto', padding: '0 24px 64px', scrollMarginTop: 72 }}>
        <div style={{ ...glass, padding: '32px 28px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' as const }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245, 158, 11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Broadcast size={24} weight="duotone" color={GOLD} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>Try the radio</h2>
            <p style={{ color: DIM, fontSize: 13.5, margin: 0, lineHeight: 1.6 }}>Saguaro Radio is push-to-talk built into the field app — a channel per project, live English/Spanish translation both ways. Grab the app and key up.</p>
          </div>
          <Link href="/get-the-app" className="btn-gold" style={{ textDecoration: 'none', fontSize: 13.5, padding: '10px 22px', whiteSpace: 'nowrap' as const }}>Get the field app &rarr;</Link>
        </div>
      </section>


      {/* ══════════ 6. COMPARISON TABLE ══════════ */}
      <section id="compare" style={{ maxWidth: 1360, margin: '0 auto', padding: '64px 24px', scrollMarginTop: 72 }}>
        <h2 style={{ textAlign: 'center' as const, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 8 }}>How Saguaro compares</h2>
        <p style={{ textAlign: 'center' as const, color: DIM, fontSize: 14, marginBottom: 32 }}>Feature-for-feature — judge for yourself in the free trial.</p>
        <div style={{ ...glass, overflow: 'hidden', boxShadow: 'var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
          {/* header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
            <div style={{ padding: '14px 20px', fontSize: 12, fontWeight: 600, color: DIM }}>Feature</div>
            <div style={{ padding: '14px 12px', fontSize: 12, fontWeight: 700, color: GOLD, textAlign: 'center' as const }}>Saguaro</div>
            <div style={{ padding: '14px 12px', fontSize: 12, fontWeight: 600, color: DIM, textAlign: 'center' as const }}>Competitor 1</div>
            <div style={{ padding: '14px 12px', fontSize: 12, fontWeight: 600, color: DIM, textAlign: 'center' as const, opacity: 0.6 }}>Competitor 2</div>
          </div>
          {/* rows */}
          {COMPARISON_ROWS.map((r, i) => (
            <React.Fragment key={r.feature}>
              {r.notYet && (
                <div style={{ padding: '10px 20px', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, color: GOLD, borderBottom: '1px solid rgba(255,255,255,0.12)', background: 'rgba(245, 158, 11,0.05)' }}>What we don&apos;t do yet</div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: i < COMPARISON_ROWS.length - 1 ? '1px solid rgba(255,255,255,0.12)' : 'none', background: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent' }}>
                <div style={{ padding: '11px 20px', fontSize: 13, color: TEXT }}>{r.feature}</div>
                {(['saguaro', 'comp1', 'comp2'] as const).map(col => (
                  <div key={col} style={{ padding: '11px 12px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {r.feature === 'Starting price'
                      ? <span style={{ color: PRICE_LABELS[col].color, fontWeight: 600, fontSize: 13 }}>{PRICE_LABELS[col].text}</span>
                      : <StatusCell v={r[col]} />}
                  </div>
                ))}
              </div>
            </React.Fragment>
          ))}
        </div>
        <p style={{ textAlign: 'center' as const, color: DIM, fontSize: 12, marginTop: 14, lineHeight: 1.6 }}>These marks are our claims about our own product — the other columns are anonymized on purpose. Take the trial and score us yourself.</p>
      </section>

      {/* ══════════ 6b. RECEIPTS ══════════ */}
      <section style={{ maxWidth: 1360, margin: '0 auto', padding: '64px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'start' }} className="receipts-grid">
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(245, 158, 11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Receipt size={28} weight="duotone" color={GOLD} />
          </div>
          <div>
            <h2 style={{ fontSize: 'clamp(26px, 3.2vw, 34px)', fontWeight: 800, letterSpacing: '-0.015em', margin: '0 0 12px' }}>It shows you its <span style={{ background: 'linear-gradient(100deg, #F59E0B 6%, #F5B84D 38%, #FDE68A 56%, #F59E0B 92%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>receipts</span></h2>
            <p style={{ color: DIM, fontSize: 14, lineHeight: 1.7, margin: '0 0 12px', maxWidth: 640 }}>Every number Saguaro suggests carries a ledger entry: what it measured on the plan, which catalog line it matched, and what your past corrections taught it. Fix a price once and the next estimate starts from your fix. Open any figure and read exactly where it came from.</p>
            <p style={{ color: TEXT, fontSize: 13.5, fontWeight: 600, margin: 0 }}>Every feature ships with automated live proof.</p>
          </div>
        </div>
      </section>

      {/* ══════════ 7. PRICING ══════════ */}
      <section id="pricing" style={{ maxWidth: 1360, margin: '0 auto', padding: '64px 24px' }}>
        <h2 style={{ textAlign: 'center' as const, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 8 }}>Simple, Transparent Pricing</h2>
        <p style={{ textAlign: 'center' as const, color: DIM, fontSize: 14, marginBottom: 36 }}>No hidden fees. No per-user charges. Cancel anytime.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'stretch' }} className="pricing-grid">
          {HOME_PLANS.map(plan => (
            <div key={plan.name} style={{
              background: 'rgba(255,255,255,0.02)',
              border: plan.highlighted ? '1px solid rgba(245, 158, 11,0.35)' : '1px solid rgba(255,255,255,0.09)',
              borderRadius: 14,
              padding: '28px 24px',
              position: 'relative' as const,
              boxShadow: 'none',
              display: 'flex',
              flexDirection: 'column' as const,
            }}>
              {plan.highlighted && (
                <span style={{ position: 'absolute' as const, top: -11, left: '50%', transform: 'translateX(-50%)', background: GOLD, color: '#000', fontSize: 10, fontWeight: 800, padding: '3px 14px', borderRadius: 10, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Most Popular</span>
              )}
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{plan.name}</h3>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: plan.highlighted ? GOLD : TEXT }}>{plan.price}</span>
                {plan.period && <span style={{ fontSize: 14, color: DIM }}>{plan.period}</span>}
              </div>
              <p style={{ fontSize: 12, color: DIM, marginBottom: 20 }}>{plan.desc}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ fontSize: 13, color: DIM, padding: '5px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg viewBox="0 0 16 16" width={14} height={14} fill={plan.highlighted ? GOLD : GREEN}><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm3.4 6.2-4 4a.7.7 0 0 1-1 0l-1.8-1.8a.7.7 0 1 1 1-1l1.3 1.3 3.5-3.5a.7.7 0 0 1 1 1z" /></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <a href={plan.ctaHref} style={{
                display: 'block',
                textAlign: 'center' as const,
                padding: '11px 0',
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 14,
                textDecoration: 'none',
                ...(plan.highlighted
                  ? { background: GOLD, color: '#000' }
                  : { border: '1px solid rgba(255,255,255,0.12)', color: TEXT }),
              }}>
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ 9. CTA SECTION ══════════ */}
      <section style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(56px, 8vh, 72px) 24px clamp(64px, 9vh, 80px)', textAlign: 'center' as const }}>
        <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 12 }}>Ready to build smarter?</h2>
        <p style={{ color: DIM, fontSize: 14, marginBottom: 28 }}>Every module unlocked for {TRIAL_DAYS} days. Run a real job on it and judge for yourself.</p>
        <Link href="/signup" style={{ background: GOLD, color: '#0a0a0a', textDecoration: 'none', fontWeight: 600, fontSize: 14, padding: '12px 30px', borderRadius: 8, display: 'inline-block' }}>Start your free trial</Link>
        <p style={{ color: DIM, fontSize: 12, marginTop: 14 }}>No credit card required. {TRIAL_DAYS}-day free trial.</p>
      </section>

      {/* ══════════ 10. FOOTER ══════════ */}
      <MarketingFooter />

      {/* ══════════ RESPONSIVE CSS ══════════ */}
      <style>{`
        @keyframes navDropFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .desktop-nav { display: flex !important; }
        .mobile-menu-btn { display: none !important; }
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: block !important; }
          .hero-grid { grid-template-columns: 1fr !important; }
          .hero-mockup { display: none !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .feature-grid { grid-template-columns: 1fr !important; }
          .design-grid { grid-template-columns: 1fr !important; }
          .pricing-grid { grid-template-columns: 1fr !important; }
          .footer-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .receipts-grid { grid-template-columns: 1fr !important; }
          h1 { font-size: 26px !important; }
        }
        @media (max-width: 480px) {
          .stats-grid { grid-template-columns: 1fr !important; }
          .footer-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
