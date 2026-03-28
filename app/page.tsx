'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';

/* ── palette ── */
const BG = '#0F1419';
const CARD = '#1A1F2E';
const GOLD = '#D4A017';
const GREEN = '#22C55E';
const TEXT = '#F0F4FF';
const DIM = '#8B9DB8';

const glass: React.CSSProperties = {
  background: 'rgba(26,31,46,0.7)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 16,
};

/* ── icons (inline SVG) ── */
const Icon = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{d.split('|').map((p, i) => <path key={i} d={p} />)}</svg>
);

const CheckIcon = () => <svg viewBox="0 0 20 20" width={18} height={18} fill={GREEN}><path d="M10 0a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.3 7.7-5 5a1 1 0 0 1-1.4 0l-2-2a1 1 0 1 1 1.4-1.4L8.6 10.6l4.3-4.3a1 1 0 0 1 1.4 1.4z" /></svg>;
const XIcon = () => <svg viewBox="0 0 20 20" width={18} height={18} fill="#EF4444"><circle cx={10} cy={10} r={10} opacity={0.15} /><path d="M7 7l6 6M13 7l-6 6" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" /></svg>;
const PartialIcon = () => <svg viewBox="0 0 20 20" width={18} height={18} fill={GOLD}><circle cx={10} cy={10} r={10} opacity={0.15} /><path d="M6 10h8" stroke={GOLD} strokeWidth={2} strokeLinecap="round" /></svg>;

/* ── nav links ── */
const NAV_LINKS = [
  { label: 'Features', href: '/#features' },
  { label: 'Field App', href: '/field-app' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Compare', href: '/#compare' },
  { label: 'AI Design', href: '/design' },
];

/* ── features data ── */
const FEATURES = [
  {
    icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z|M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
    title: 'AI Blueprint Takeoff',
    desc: 'Upload any PDF blueprint. Sage reads dimensions, calculates materials, and generates a full bid estimate in under 60 seconds.',
  },
  {
    icon: 'M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z',
    title: 'Sage AI Assistant',
    desc: 'Ask Sage anything about your projects. Get instant answers on budgets, schedules, and compliance across every active job.',
  },
  {
    icon: 'M12 1v22|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    title: 'Financial Suite',
    desc: 'AIA G702/G703 pay apps, invoicing, lien waivers for all 50 states, and certified payroll — generated automatically.',
  },
  {
    icon: 'M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01',
    title: 'Field Mobile App',
    desc: 'Native-speed PWA for daily logs, photos, GPS clock-in, punch lists, and inspections. Works offline on any device.',
  },
  {
    icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75',
    title: 'Client & Sub Portals',
    desc: 'Branded owner portal for approvals and sub portal for bids, W-9s, and insurance. White-label your business.',
  },
  {
    icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z|M9 22V12h6v10',
    title: 'Smart Building & Low Volt',
    desc: 'IoT device management, structured cabling, and AV scheduling for technology-forward builds and smart home installs.',
  },
];

/* ── comparison data ── */
const COMPARISON_ROWS: { feature: string; saguaro: 'yes' | 'no' | 'partial'; procore: 'yes' | 'no' | 'partial'; buildertrend: 'yes' | 'no' | 'partial' }[] = [
  { feature: 'AI Blueprint Takeoff', saguaro: 'yes', procore: 'no', buildertrend: 'no' },
  { feature: 'Sage AI Assistant', saguaro: 'yes', procore: 'no', buildertrend: 'no' },
  { feature: 'Bid Package Auto-Generation', saguaro: 'yes', procore: 'partial', buildertrend: 'no' },
  { feature: 'Smart Building Module', saguaro: 'yes', procore: 'no', buildertrend: 'no' },
  { feature: 'Design Studio', saguaro: 'yes', procore: 'no', buildertrend: 'no' },
  { feature: 'Mobile Offline', saguaro: 'yes', procore: 'partial', buildertrend: 'partial' },
  { feature: 'Owner Portal', saguaro: 'yes', procore: 'yes', buildertrend: 'yes' },
  { feature: 'Sub Portal', saguaro: 'yes', procore: 'partial', buildertrend: 'partial' },
  { feature: 'Starting Price', saguaro: 'yes', procore: 'no', buildertrend: 'partial' },
];

const StatusCell = ({ v }: { v: 'yes' | 'no' | 'partial' }) =>
  v === 'yes' ? <CheckIcon /> : v === 'partial' ? <PartialIcon /> : <XIcon />;

const PriceLabel = ({ v }: { v: 'yes' | 'no' | 'partial' }) =>
  v === 'yes' ? <span style={{ color: GREEN, fontWeight: 600, fontSize: 13 }}>$49/mo</span>
    : v === 'partial' ? <span style={{ color: GOLD, fontWeight: 600, fontSize: 13 }}>$399/mo</span>
    : <span style={{ color: '#EF4444', fontWeight: 600, fontSize: 13 }}>$1,000+/mo</span>;

/* ── pricing data ── */
const PLANS = [
  {
    name: 'Starter',
    price: '$49',
    period: '/mo',
    desc: 'Perfect for small GCs getting started',
    features: ['3 active projects', 'AI Takeoff (5/mo)', 'Pay apps & invoicing', 'Lien waivers', 'Mobile field app', 'Email support'],
    cta: 'Start Free Trial',
    highlighted: false,
  },
  {
    name: 'Professional',
    price: '$99',
    period: '/mo',
    desc: 'For growing contractors who need it all',
    features: ['Unlimited projects', 'Unlimited AI Takeoffs', 'Sage AI Assistant', 'Bid package manager', 'Client & sub portals', 'Certified payroll', 'Priority support'],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'For large firms with custom needs',
    features: ['Everything in Professional', 'Dedicated account manager', 'Custom integrations', 'SSO & advanced security', 'On-site training', 'SLA guarantee', 'API access'],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

/* ===========================
   MAIN PAGE COMPONENT
   =========================== */
export default function LandingPage() {
  const [bannerVisible, setBannerVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  /* close mobile menu on resize */
  useEffect(() => {
    const handler = () => { if (window.innerWidth > 768) setMenuOpen(false); };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return (
    <div data-landing style={{ background: BG, color: TEXT, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", minHeight: '100vh', overflowX: 'hidden' as const }}>

      {/* ══════════ 1. TOP BANNER ══════════ */}
      {bannerVisible && (
        <div style={{ background: 'linear-gradient(90deg, rgba(212,160,23,0.12) 0%, rgba(212,160,23,0.05) 100%)', borderBottom: '1px solid rgba(212,160,23,0.2)', padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, position: 'relative' as const }}>
          <span style={{ color: GOLD, fontWeight: 600 }}>Procore users: Switch in 1 day — Free migration included.</span>
          <Link href="/roi-calculator" style={{ color: GOLD, textDecoration: 'underline', fontWeight: 500 }}>Calculate your savings &rarr;</Link>
          <button onClick={() => setBannerVisible(false)} style={{ position: 'absolute' as const, right: 16, background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 18, lineHeight: 1 }} aria-label="Dismiss banner">&times;</button>
        </div>
      )}

      {/* ══════════ 2. NAV ══════════ */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', maxWidth: 1200, margin: '0 auto', position: 'relative' as const }}>
        <Link href="/" style={{ fontWeight: 800, fontSize: 20, letterSpacing: 2, color: TEXT, textDecoration: 'none' }}>SAGUARO</Link>

        {/* desktop links */}
        <div style={{ display: 'flex', gap: 28, alignItems: 'center' }} className="nav-desktop">
          {NAV_LINKS.map(l => (
            <Link key={l.label} href={l.href} style={{ color: DIM, textDecoration: 'none', fontSize: 13, fontWeight: 500, transition: 'color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
              onMouseLeave={e => (e.currentTarget.style.color = DIM)}>
              {l.label}
            </Link>
          ))}
        </div>

        {/* desktop CTAs */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }} className="nav-desktop">
          <Link href="/login" style={{ color: TEXT, textDecoration: 'none', fontSize: 13, fontWeight: 500, padding: '7px 16px', border: `1px solid rgba(255,255,255,0.15)`, borderRadius: 8 }}>Log In</Link>
          <Link href="/signup" style={{ background: GOLD, color: '#000', textDecoration: 'none', fontSize: 13, fontWeight: 700, padding: '7px 20px', borderRadius: 8 }}>Start Free</Link>
        </div>

        {/* mobile hamburger */}
        <button className="nav-mobile-btn" onClick={() => setMenuOpen(!menuOpen)} style={{ display: 'none', background: 'none', border: 'none', color: TEXT, fontSize: 24, cursor: 'pointer' }} aria-label="Menu">
          {menuOpen ? '\u2715' : '\u2630'}
        </button>

        {/* mobile dropdown */}
        {menuOpen && (
          <div style={{ position: 'absolute' as const, top: '100%', left: 0, right: 0, background: CARD, borderBottom: `1px solid rgba(255,255,255,0.06)`, padding: 16, display: 'flex', flexDirection: 'column' as const, gap: 12, zIndex: 50 }}>
            {NAV_LINKS.map(l => (
              <Link key={l.label} href={l.href} onClick={() => setMenuOpen(false)} style={{ color: DIM, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>{l.label}</Link>
            ))}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, display: 'flex', gap: 10 }}>
              <Link href="/login" style={{ color: TEXT, textDecoration: 'none', fontSize: 13, padding: '8px 16px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, flex: 1, textAlign: 'center' as const }}>Log In</Link>
              <Link href="/signup" style={{ background: GOLD, color: '#000', textDecoration: 'none', fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, flex: 1, textAlign: 'center' as const }}>Start Free</Link>
            </div>
          </div>
        )}
      </nav>

      {/* ══════════ 3. HERO ══════════ */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 24px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }} className="hero-grid">
        {/* left */}
        <div>
          <span style={{ display: 'inline-block', background: 'rgba(212,160,23,0.1)', border: '1px solid rgba(212,160,23,0.25)', color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, padding: '5px 12px', borderRadius: 20, marginBottom: 16, textTransform: 'uppercase' as const }}>AI-POWERED CONSTRUCTION CRM</span>
          <h1 style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.2, margin: '0 0 14px', color: TEXT }}>The Smarter CRM Built<br />for General Contractors</h1>
          <p style={{ color: DIM, fontSize: 15, lineHeight: 1.6, margin: '0 0 24px', maxWidth: 440 }}>AI-powered takeoffs that read your blueprints in seconds. Sage, your built-in assistant, handles bids, pay apps, and compliance so you can focus on building.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
            <Link href="/signup" style={{ background: GOLD, color: '#000', textDecoration: 'none', fontWeight: 700, fontSize: 14, padding: '12px 28px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>Start Free Trial <span style={{ fontSize: 16 }}>&rarr;</span></Link>
            <Link href="/#demo" style={{ color: TEXT, textDecoration: 'none', fontWeight: 600, fontSize: 14, padding: '12px 24px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg viewBox="0 0 20 20" width={16} height={16} fill={TEXT}><polygon points="5,3 19,10 5,17" /></svg> Watch Demo
            </Link>
          </div>
        </div>

        {/* right — takeoff mockup */}
        <div style={{ ...glass, padding: 0, overflow: 'hidden' }} className="hero-mockup">
          {/* browser chrome */}
          <div style={{ background: 'rgba(15,20,25,0.8)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: GOLD }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: GREEN }} />
            <span style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '4px 12px', fontSize: 11, color: DIM, marginLeft: 8 }}>app.saguaro.build/takeoff</span>
          </div>
          {/* mockup content */}
          <div style={{ padding: 20, background: `linear-gradient(135deg, ${BG} 0%, rgba(26,31,46,0.9) 100%)` }}>
            {/* toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>AI Takeoff Results</span>
              <span style={{ fontSize: 11, color: GOLD, fontWeight: 600, background: 'rgba(212,160,23,0.12)', padding: '3px 10px', borderRadius: 12 }}>38s &bull; 47 items</span>
            </div>
            {/* table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 1, marginBottom: 2 }}>
              {['Item', 'Qty', 'Unit', 'Cost'].map(h => (
                <div key={h} style={{ fontSize: 10, color: DIM, fontWeight: 600, textTransform: 'uppercase' as const, padding: '6px 8px', background: 'rgba(255,255,255,0.03)' }}>{h}</div>
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
                  <div key={j} style={{ fontSize: 12, color: j === 3 ? GOLD : j === 0 ? TEXT : DIM, padding: '7px 8px', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', fontWeight: j === 3 ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>{cell}</div>
                ))}
              </div>
            ))}
            {/* total bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, padding: '10px 8px', borderTop: `1px solid rgba(212,160,23,0.2)` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>Total Estimate</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: GOLD }}>$137,070</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── social proof bar ── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 48px' }}>
        <p style={{ textAlign: 'center' as const, fontSize: 13, color: DIM, marginBottom: 16 }}>Trusted by <span style={{ color: TEXT, fontWeight: 600 }}>200+ general contractors</span> in Arizona</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }} className="stats-grid">
          {[
            { val: '12,400+', lbl: 'AI Takeoffs Run' },
            { val: '580K+', lbl: 'Line Items Generated' },
            { val: '4.2 hrs', lbl: 'Avg. Time Saved' },
            { val: '8,900+', lbl: 'Blueprints Analyzed' },
          ].map(s => (
            <div key={s.lbl} style={{ ...glass, padding: '16px 20px', textAlign: 'center' as const }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: GOLD }}>{s.val}</div>
              <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════ 4. FEATURE GRID ══════════ */}
      <section id="features" style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 24px' }}>
        <h2 style={{ textAlign: 'center' as const, fontSize: 26, fontWeight: 800, marginBottom: 6 }}>Everything You Need. Nothing You Don&apos;t.</h2>
        <p style={{ textAlign: 'center' as const, color: DIM, fontSize: 14, marginBottom: 36, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>One platform replaces Procore, spreadsheets, and 5 other tools.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }} className="feature-grid">
          {FEATURES.map(f => (
            <div key={f.title} style={{ ...glass, padding: '24px 22px', transition: 'border-color .2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,160,23,0.25)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(212,160,23,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD, marginBottom: 14 }}>
                <Icon d={f.icon} />
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: TEXT }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: DIM, lineHeight: 1.5, margin: '0 0 12px' }}>{f.desc}</p>
              <span style={{ fontSize: 12, color: GOLD, fontWeight: 600, cursor: 'pointer' }}>Learn more &rarr;</span>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ 5. AI DESIGN STUDIO PROMO ══════════ */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ ...glass, padding: 0, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr' }} className="design-grid">
          {/* left copy */}
          <div style={{ padding: '40px 36px' }}>
            <span style={{ display: 'inline-block', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: GREEN, fontSize: 11, fontWeight: 700, letterSpacing: 1, padding: '4px 10px', borderRadius: 16, marginBottom: 14, textTransform: 'uppercase' as const }}>NEW</span>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10, lineHeight: 1.25 }}>Design Your Dream<br />Space with AI</h2>
            <p style={{ color: DIM, fontSize: 14, lineHeight: 1.6, marginBottom: 10 }}>Upload a photo of any room. Our AI generates photorealistic redesigns in seconds. Experiment with styles, materials, and layouts before breaking ground.</p>
            <p style={{ color: DIM, fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>Before &amp; after comparison. Interior and exterior. Residential and commercial.</p>
            <Link href="/design" style={{ background: GREEN, color: '#000', textDecoration: 'none', fontWeight: 700, fontSize: 14, padding: '11px 24px', borderRadius: 10, display: 'inline-block' }}>Try AI Design Studio &mdash; Free</Link>
          </div>
          {/* right mockup — before/after */}
          <div style={{ background: `linear-gradient(135deg, rgba(15,20,25,0.9), rgba(26,31,46,0.8))`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, position: 'relative' as const }}>
            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              {/* before */}
              <div style={{ flex: 1, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '6px 10px', fontSize: 10, fontWeight: 600, color: DIM, textTransform: 'uppercase' as const }}>Before</div>
                <div style={{ height: 140, background: `linear-gradient(135deg, #2a2520, #1a1510)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 60 40" width={80} height={53} fill="none" stroke={DIM} strokeWidth={0.8}>
                    <rect x={5} y={8} width={50} height={28} rx={1} />
                    <rect x={10} y={14} width={14} height={18} rx={0.5} />
                    <rect x={28} y={14} width={22} height={8} rx={0.5} />
                    <rect x={28} y={25} width={22} height={7} rx={0.5} />
                    <line x1={5} y1={36} x2={55} y2={36} />
                  </svg>
                </div>
              </div>
              {/* after */}
              <div style={{ flex: 1, borderRadius: 12, overflow: 'hidden', border: `1px solid rgba(212,160,23,0.2)` }}>
                <div style={{ background: 'rgba(212,160,23,0.08)', padding: '6px 10px', fontSize: 10, fontWeight: 600, color: GOLD, textTransform: 'uppercase' as const }}>After &mdash; AI Generated</div>
                <div style={{ height: 140, background: `linear-gradient(135deg, #1a2520, #0f1a15)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 60 40" width={80} height={53} fill="none">
                    <rect x={5} y={8} width={50} height={28} rx={2} stroke={GOLD} strokeWidth={0.8} />
                    <rect x={10} y={14} width={14} height={18} rx={1} fill="rgba(212,160,23,0.15)" stroke={GOLD} strokeWidth={0.5} />
                    <rect x={28} y={14} width={22} height={8} rx={1} fill="rgba(34,197,94,0.1)" stroke={GREEN} strokeWidth={0.5} />
                    <rect x={28} y={25} width={22} height={7} rx={1} fill="rgba(212,160,23,0.08)" stroke={GOLD} strokeWidth={0.5} />
                    <line x1={5} y1={36} x2={55} y2={36} stroke={GOLD} strokeWidth={0.5} />
                    <circle cx={48} cy={12} r={3} fill={GOLD} opacity={0.3} />
                  </svg>
                </div>
              </div>
            </div>
            {/* slider indicator */}
            <div style={{ position: 'absolute' as const, bottom: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(212,160,23,0.15)', borderRadius: 20, padding: '4px 14px', fontSize: 10, color: GOLD, fontWeight: 600 }}>
              &larr; Drag to Compare &rarr;
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ 6. COMPARISON TABLE ══════════ */}
      <section id="compare" style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px' }}>
        <h2 style={{ textAlign: 'center' as const, fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Why GCs Switch from Procore</h2>
        <p style={{ textAlign: 'center' as const, color: DIM, fontSize: 14, marginBottom: 28 }}>Feature-for-feature comparison — see why 200+ contractors made the switch.</p>
        <div style={{ ...glass, overflow: 'hidden' }}>
          {/* header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ padding: '14px 20px', fontSize: 12, fontWeight: 600, color: DIM }}>Feature</div>
            <div style={{ padding: '14px 12px', fontSize: 12, fontWeight: 700, color: GOLD, textAlign: 'center' as const }}>Saguaro</div>
            <div style={{ padding: '14px 12px', fontSize: 12, fontWeight: 600, color: DIM, textAlign: 'center' as const }}>Procore</div>
            <div style={{ padding: '14px 12px', fontSize: 12, fontWeight: 600, color: DIM, textAlign: 'center' as const }}>Buildertrend</div>
          </div>
          {/* rows */}
          {COMPARISON_ROWS.map((r, i) => (
            <div key={r.feature} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: i < COMPARISON_ROWS.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
              <div style={{ padding: '11px 20px', fontSize: 13, color: TEXT }}>{r.feature}</div>
              <div style={{ padding: '11px 12px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {r.feature === 'Starting Price' ? <PriceLabel v={r.saguaro} /> : <StatusCell v={r.saguaro} />}
              </div>
              <div style={{ padding: '11px 12px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {r.feature === 'Starting Price' ? <PriceLabel v={r.procore} /> : <StatusCell v={r.procore} />}
              </div>
              <div style={{ padding: '11px 12px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {r.feature === 'Starting Price' ? <PriceLabel v={r.buildertrend} /> : <StatusCell v={r.buildertrend} />}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ 7. PRICING ══════════ */}
      <section id="pricing" style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px' }}>
        <h2 style={{ textAlign: 'center' as const, fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Simple, Transparent Pricing</h2>
        <p style={{ textAlign: 'center' as const, color: DIM, fontSize: 14, marginBottom: 32 }}>No hidden fees. No per-user charges. Cancel anytime.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, alignItems: 'stretch' }} className="pricing-grid">
          {PLANS.map(plan => (
            <div key={plan.name} style={{
              ...glass,
              padding: '28px 24px',
              position: 'relative' as const,
              ...(plan.highlighted ? { border: `1px solid rgba(212,160,23,0.35)`, boxShadow: '0 0 40px rgba(212,160,23,0.08)' } : {}),
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
              <Link href={plan.name === 'Enterprise' ? '/contact' : '/signup'} style={{
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
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ 8. TESTIMONIAL ══════════ */}
      <section style={{ maxWidth: 700, margin: '0 auto', padding: '48px 24px', textAlign: 'center' as const }}>
        <div style={{ ...glass, padding: '36px 32px' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: `linear-gradient(135deg, ${GOLD}, rgba(212,160,23,0.6))`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 18, fontWeight: 800, color: '#000' }}>MT</div>
          <blockquote style={{ fontSize: 16, color: TEXT, lineHeight: 1.6, fontStyle: 'italic' as const, margin: '0 0 16px', maxWidth: 540, marginLeft: 'auto', marginRight: 'auto' }}>&ldquo;We switched from Procore six months ago and haven&apos;t looked back. The AI takeoff alone saves our estimator 20 hours a week. At a third of the price, it was a no-brainer.&rdquo;</blockquote>
          <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 2px' }}>Marcus Torres</p>
          <p style={{ color: DIM, fontSize: 12, margin: 0 }}>VP of Operations &mdash; Sonoran Builders, Phoenix AZ</p>
        </div>
      </section>

      {/* ══════════ 9. CTA SECTION ══════════ */}
      <section style={{ maxWidth: 700, margin: '0 auto', padding: '48px 24px', textAlign: 'center' as const }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Ready to Build Smarter?</h2>
        <p style={{ color: DIM, fontSize: 15, marginBottom: 28 }}>Join 200+ general contractors who switched to Saguaro and never looked back.</p>
        <Link href="/signup" style={{ background: GOLD, color: '#000', textDecoration: 'none', fontWeight: 800, fontSize: 16, padding: '14px 40px', borderRadius: 12, display: 'inline-block', boxShadow: '0 4px 24px rgba(212,160,23,0.25)' }}>Start Your Free Trial</Link>
        <p style={{ color: DIM, fontSize: 12, marginTop: 12 }}>No credit card required. 14-day free trial.</p>
      </section>

      {/* ══════════ 10. FOOTER ══════════ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', maxWidth: 1200, margin: '0 auto', padding: '40px 24px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32, marginBottom: 32 }} className="footer-grid">
          {/* product */}
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1, color: TEXT, marginBottom: 14 }}>Product</h4>
            {['AI Takeoff', 'Pay Applications', 'Invoicing', 'Lien Waivers', 'Field App', 'Bid Packages', 'Design Studio'].map(l => (
              <div key={l}><Link href="/#features" style={{ color: DIM, textDecoration: 'none', fontSize: 13, lineHeight: 2 }}>{l}</Link></div>
            ))}
          </div>
          {/* company */}
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1, color: TEXT, marginBottom: 14 }}>Company</h4>
            {['About', 'Careers', 'Contact', 'Partners'].map(l => (
              <div key={l}><Link href={`/${l.toLowerCase()}`} style={{ color: DIM, textDecoration: 'none', fontSize: 13, lineHeight: 2 }}>{l}</Link></div>
            ))}
          </div>
          {/* resources */}
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1, color: TEXT, marginBottom: 14 }}>Resources</h4>
            {['Blog', 'API Docs', 'Help Center', 'Changelog'].map(l => (
              <div key={l}><Link href={`/${l.toLowerCase().replace(' ', '-')}`} style={{ color: DIM, textDecoration: 'none', fontSize: 13, lineHeight: 2 }}>{l}</Link></div>
            ))}
          </div>
          {/* legal */}
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1, color: TEXT, marginBottom: 14 }}>Legal</h4>
            {['Privacy Policy', 'Terms of Service', 'Security'].map(l => (
              <div key={l}><Link href={`/${l.toLowerCase().replace(/ /g, '-')}`} style={{ color: DIM, textDecoration: 'none', fontSize: 13, lineHeight: 2 }}>{l}</Link></div>
            ))}
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 12 }}>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: 2 }}>SAGUARO</span>
          <span style={{ fontSize: 12, color: DIM }}>&copy; {new Date().getFullYear()} Saguaro Technologies Inc. All rights reserved.</span>
        </div>
      </footer>

      {/* ══════════ RESPONSIVE CSS ══════════ */}
      <style>{`
        .nav-desktop { display: flex !important; }
        .nav-mobile-btn { display: none !important; }
        @media (max-width: 768px) {
          .nav-desktop { display: none !important; }
          .nav-mobile-btn { display: block !important; }
          .hero-grid { grid-template-columns: 1fr !important; }
          .hero-mockup { display: none !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .feature-grid { grid-template-columns: 1fr !important; }
          .design-grid { grid-template-columns: 1fr !important; }
          .pricing-grid { grid-template-columns: 1fr !important; }
          .footer-grid { grid-template-columns: repeat(2, 1fr) !important; }
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
