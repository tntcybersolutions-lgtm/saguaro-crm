'use client';
import React, { useState } from 'react';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#22c55e';

const NAV_LINKS = [
  { label: 'Features',  href: '/#features' },
  { label: 'Field App', href: '/field-app' },
  { label: 'Get the App', href: '/get-the-app' },
  { label: 'How It Works', href: '/#demo' },
  { label: 'Pricing',   href: '/pricing' },
  { label: 'Compare',   href: '/compare/procore' },
];

const FEATURES: { icon: React.ReactNode; title: string; desc: string; pill: string }[] = [
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><rect x={2} y={2} width={20} height={20} rx={2}/><path d="M2 9h20M9 2v20"/></svg>, title: 'AI Blueprint Takeoff', desc: 'Upload any PDF blueprint. Claude reads every dimension, calculates all materials, and generates a full bid estimate in under 60 seconds.', pill: 'AI-powered' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={12} y1={1} x2={12} y2={23}/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, title: 'AIA Pay Applications', desc: 'Generate G702/G703 Continuation Sheets automatically. Submit to owners digitally with one click — no PDFs to fill by hand.', pill: 'G702 / G703' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><rect x={3} y={11} width={18} height={11} rx={2} ry={2}/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>, title: 'Lien Waivers — All 50 States', desc: 'Conditional & unconditional, partial & final. AZ, CA, TX statutory language. Send, sign, and track — no paper, no fax.', pill: 'All 50 states' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, title: 'Autopilot', desc: "Automated RFI routing, change order alerts, insurance expiry reminders, and pay app follow-ups — while you're in the field.", pill: 'Fully automated' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1={16} y1={13} x2={8} y2={13}/><line x1={16} y1={17} x2={8} y2={17}/><polyline points="10 9 9 9 8 9"/></svg>, title: 'Certified Payroll WH-347', desc: 'DOL-compliant weekly reports for prevailing wage projects. Pulls live Davis-Bacon wage rates. Submits directly to agencies.', pill: 'Davis-Bacon' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={18} y1={20} x2={18} y2={10}/><line x1={12} y1={20} x2={12} y2={4}/><line x1={6} y1={20} x2={6} y2={14}/></svg>, title: 'Bid Intelligence', desc: 'AI scores every bid opportunity 0–100 based on your win history, market conditions, and margin targets. Stop chasing bad bids.', pill: 'Win rate AI' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>, title: 'Bid Package Manager', desc: 'Auto-create bid packages from takeoff data. Invite subs by CSI trade division. Track responses in one dashboard.', pill: 'CSI MasterFormat' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, title: 'Insurance & Compliance', desc: 'ACORD 25 COI parser, expiry alerts, OSHA 300 log, and sub compliance dashboard. Never let a lapsed COI delay a project.', pill: 'OSHA + COI' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><rect x={5} y={2} width={14} height={20} rx={2} ry={2}/><line x1={12} y1={18} x2={12.01} y2={18}/></svg>, title: 'Mobile Field App', desc: 'Give your crew a native-speed PWA — daily logs, photos, GPS clock-in, punch lists, RFIs, and inspections. Works offline. No App Store required.', pill: 'iOS · Android · No App Store' },
];

const STATS = [
  { value: '4 hrs', label: 'saved per takeoff vs. manual' },
  { value: '$0', label: 'per seat — flat license' },
  { value: '50', label: 'states covered for lien waivers' },
  { value: '60s', label: 'to generate a pay application' },
];

const TESTIMONIALS = [
  { quote: "We used to spend half a day doing material takeoffs by hand. Now our estimator uploads the PDF and has numbers in a minute. It changed how we bid.", name: "Marcus T.", title: "Project Manager — General Contractor, Phoenix AZ" },
  { quote: "The lien waiver module alone is worth it. We do 30–40 waivers a month across multiple projects. This cut our admin time by 80%.", name: "Jennifer R.", title: "Operations Director — Specialty Subcontractor, Las Vegas NV" },
  { quote: "We compared this to Procore and Buildertrend. Saguaro has everything we need at a fraction of the cost, and the AI features are actually useful.", name: "David K.", title: "Owner — Mid-Size GC, Denver CO" },
];

// ── Workflow steps (for display only — real system at /sandbox) ───────────────
const WORKFLOW_STEPS: { step: number; icon: React.ReactNode; label: string; desc: string }[] = [
  { step: 1, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><rect x={2} y={2} width={20} height={20} rx={2}/><path d="M2 9h20M9 2v20"/></svg>, label: 'Upload Blueprint', desc: 'Drop any PDF — floor plan, structural, MEP. Claude reads every dimension automatically.' },
  { step: 2, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, label: 'AI Reads Everything', desc: 'Claude Opus analyzes every dimension, spec, and schedule. Scale detected automatically.' },
  { step: 3, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><line x1={18} y1={20} x2={18} y2={10}/><line x1={12} y1={20} x2={12} y2={4}/><line x1={6} y1={20} x2={6} y2={14}/></svg>, label: 'Instant Material Takeoff', desc: 'Full CSI-organized material list — 50–200 line items with quantities, waste factors & costs.' },
  { step: 4, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>, label: 'Bid Package + Sub Invites', desc: 'Auto-create packages by CSI trade division. Subs invited by email in one click.' },
  { step: 5, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><line x1={12} y1={1} x2={12} y2={23}/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, label: 'Generate G702 Pay App', desc: 'AIA G702/G703 filled from your SOV and ready to submit to owner digitally.' },
];

const TAKEOFF_MATERIALS = [
  { csi: '03 30 00', desc: 'Cast-in-Place Concrete', qty: '14,200', unit: 'CY', unit_cost: '$142', total: '$2,016,400' },
  { csi: '03 20 00', desc: 'Concrete Reinforcing', qty: '48,600', unit: 'LB', unit_cost: '$0.82', total: '$39,852' },
  { csi: '04 20 00', desc: 'Concrete Masonry — CMU', qty: '8,400', unit: 'SF', unit_cost: '$18', total: '$151,200' },
  { csi: '05 12 00', desc: 'Structural Steel Framing', qty: '112,000', unit: 'LB', unit_cost: '$1.65', total: '$184,800' },
  { csi: '07 50 00', desc: 'Membrane Roofing — TPO', qty: '24,000', unit: 'SF', unit_cost: '$8.50', total: '$204,000' },
];


// ── Main Component ────────────────────────────────────────────────────────────

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [contactModal, setContactModal] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', company: '', message: '' });
  const [contactSent, setContactSent] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  async function submitContact(e: React.FormEvent) {
    e.preventDefault();
    setContactLoading(true);
    try {
      await fetch('/api/leads/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contactForm) });
      setContactSent(true);
    } catch { /* non-fatal */ }
    setContactLoading(false);
  }

  return (
    <div style={{ minHeight: '100vh', background: DARK, color: TEXT, fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 58, background: 'rgba(13,17,23,.96)', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', padding: '0 48px', gap: 24, backdropFilter: 'blur(12px)' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
          <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 36, width: 'auto', objectFit: 'contain', borderRadius: 4, flexShrink: 0 }} />
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.1em', background: `linear-gradient(90deg,${GOLD},#F0C040)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SAGUARO</span>
            <span style={{ fontSize: 7, color: DIM, letterSpacing: '0.25em', fontWeight: 600, textTransform: 'uppercase' }}>Control Systems</span>
          </span>
        </a>
        <div style={{ display: 'flex', gap: 28 }} className="desktop-nav">
          {NAV_LINKS.map(l => (
            <a key={l.href} href={l.href} style={{ fontSize: 13, fontWeight: 400, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.65)', textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,1)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.65)')}>
              {l.label}
            </a>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a href="/login" className="desktop-nav" style={{ padding: '7px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 400, textDecoration: 'none' }}>Log In</a>
          <a href="/signup" style={{ padding: '7px 18px', background: GOLD, border: 'none', borderRadius: 6, color: '#000', fontSize: 13, fontWeight: 600, letterSpacing: '0.03em', textDecoration: 'none', flexShrink: 0 }}>Free Trial</a>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="mobile-only"
            style={{ display: 'none', background: 'none', border: 'none', color: TEXT, fontSize: 22, cursor: 'pointer', padding: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            aria-label="Menu">
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div style={{ position: 'fixed', top: 58, left: 0, right: 0, zIndex: 99, background: 'rgba(13,17,23,.99)', borderBottom: `1px solid ${BORDER}`, padding: '8px 0', backdropFilter: 'blur(12px)' }}>
          {[...NAV_LINKS, { label: 'Log In', href: '/login' }].map(l => (
            <a key={l.href} href={l.href} onClick={() => setMobileMenuOpen(false)}
              style={{ display: 'block', padding: '14px 24px', fontSize: 15, fontWeight: 600, color: TEXT, textDecoration: 'none', borderBottom: `1px solid rgba(38,51,71,.5)` }}>
              {l.label}
            </a>
          ))}
          <div style={{ padding: 16 }}>
            <a href="/signup" style={{ display: 'block', textAlign: 'center', padding: '13px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, borderRadius: 9, color: '#0d1117', fontWeight: 800, textDecoration: 'none' }}>
              Start Free Trial →
            </a>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-only { display: flex !important; }
          .hero-flex { flex-direction: column !important; }
          .hero-left { flex: 0 0 100% !important; max-width: 100% !important; text-align: center !important; }
          .hero-left h1 { text-align: center !important; font-size: clamp(32px, 9vw, 48px) !important; }
          .hero-left p { text-align: center !important; max-width: 100% !important; }
          .hero-cta-row { justify-content: center !important; }
          .hero-trust { justify-content: center !important; }
          .hero-right { flex: 0 0 100% !important; max-width: 100% !important; display: none !important; }
          .hero-section { padding: 56px 24px 48px !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .testimonials-grid { grid-template-columns: 1fr !important; }
          .demo-layout { flex-direction: column !important; }
          .demo-steps-col { flex-direction: row !important; overflow-x: auto; min-width: unset !important; }
          .demo-screen { min-height: 320px !important; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .hero-animate { animation: fadeInUp .6s ease both; }
        .hero-animate-delay { animation: fadeInUp .6s ease .15s both; }
        .hero-animate-panel { animation: fadeInUp .7s ease .1s both; }
        .demo-screen-inner { animation: fadeInUp .35s ease; }
        .cta-primary:hover { opacity: 0.9; transform: translateY(-1px); transition: all .15s ease; }
        .cta-secondary:hover { border-color: rgba(255,255,255,0.4) !important; color: #fff !important; transition: all .15s ease; }
      `}</style>

      <div style={{ paddingTop: 58 }}>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section style={{ position: 'relative', overflow: 'hidden' }} className="hero-section">

          {/* Atmospheric background */}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 60% at 15% 50%, rgba(212,160,23,0.07) 0%, transparent 65%), radial-gradient(ellipse 50% 50% at 85% 30%, rgba(37,99,235,0.06) 0%, transparent 60%)', pointerEvents: 'none' }} />
          {/* Subtle grid texture */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize: '64px 64px', pointerEvents: 'none', maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)' }} />

          <div style={{ maxWidth: 1140, margin: '0 auto', padding: '88px 48px 80px', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 56 }} className="hero-flex">

              {/* ── Left column ── */}
              <div style={{ flex: '0 0 52%', maxWidth: '52%' }} className="hero-left">

                {/* Badge */}
                <div className="hero-animate" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.35)', borderRadius: 24, padding: '5px 14px 5px 8px', marginBottom: 24 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: 'rgba(212,160,23,0.2)', fontSize: 10 }}>✦</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.1em', textTransform: 'uppercase' }}>AI-Powered Construction CRM</span>
                </div>

                {/* Headline */}
                <h1 className="hero-animate" style={{ fontSize: 'clamp(36px, 4.2vw, 58px)', fontWeight: 900, margin: '0 0 20px', lineHeight: 1.06, letterSpacing: '-0.03em', textAlign: 'left' }}>
                  The CRM Built<br />
                  <span style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #F5D060 50%, #C8960F 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>for General Contractors</span>
                </h1>

                {/* Subheadline */}
                <p className="hero-animate-delay" style={{ fontSize: 16, color: 'rgba(255,255,255,0.58)', maxWidth: 460, margin: '0 0 32px', lineHeight: 1.65, textAlign: 'left' }}>
                  AI Blueprint Takeoff, AIA Pay Applications, Lien Waivers, Certified Payroll &amp; Bid Intelligence — everything a GC needs to run profitable projects, in one platform.
                </p>

                {/* CTA row */}
                <div className="hero-cta-row hero-animate-delay" style={{ display: 'flex', gap: 12, justifyContent: 'flex-start', flexWrap: 'wrap', marginBottom: 20 }}>
                  <a href="/signup" className="cta-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 28px', background: `linear-gradient(135deg,${GOLD},#C8960F)`, border: 'none', borderRadius: 8, color: '#000', fontSize: 14, fontWeight: 800, letterSpacing: '0.02em', textDecoration: 'none', boxShadow: `0 4px 24px rgba(212,160,23,0.35)` }}>
                    Start Free Trial
                    <span style={{ fontSize: 16 }}>→</span>
                  </a>
                  <a href="#demo" className="cta-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 22px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.72)', fontSize: 14, textDecoration: 'none' }}>
                    <span style={{ fontSize: 12 }}>▶</span> How It Works
                  </a>
                </div>

                {/* Trust row */}
                <div className="hero-trust hero-animate-delay" style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                  {[
                    { icon: '✓', label: 'No credit card required' },
                    { icon: '✓', label: '30-day free trial' },
                    { icon: '✓', label: 'Cancel anytime' },
                  ].map(t => (
                    <span key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>
                      <span style={{ color: GOLD, fontWeight: 700, fontSize: 11 }}>{t.icon}</span>
                      {t.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* ── Right column — Product screenshot ── */}
              <div style={{ flex: '0 0 48%', maxWidth: '48%', position: 'relative' }} className="hero-right">
                {/* Glow behind panel */}
                <div style={{ position: 'absolute', inset: -24, background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(212,160,23,0.12) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(20px)' }} />

                <div className="hero-animate-panel" style={{ position: 'relative', background: 'linear-gradient(160deg, #141e2e 0%, #0d1520 100%)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(212,160,23,0.08), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
                  {/* Browser chrome */}
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {['#ff5f57','#febc2e','#28c840'].map(c => <div key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: 0.85 }} />)}
                    </div>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 5, padding: '3px 10px', fontSize: 10, color: 'rgba(255,255,255,0.28)', marginLeft: 6, fontFamily: 'monospace' }}>
                      saguarocontrol.net/app/takeoff
                    </div>
                  </div>

                  {/* Takeoff header */}
                  <div style={{ padding: '14px 16px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: TEXT, letterSpacing: '-0.01em' }}>AI Blueprint Takeoff</div>
                        <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>Riverside Medical Pavilion · 48 pages · 24,200 SF</div>
                      </div>
                      <span style={{ fontSize: 9, background: 'rgba(34,197,94,0.12)', color: '#3dd68c', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 5, padding: '3px 8px', fontWeight: 700, letterSpacing: '0.05em' }}>✓ COMPLETE</span>
                    </div>
                    {/* AI bar */}
                    <div style={{ background: 'rgba(212,160,23,0.06)', border: '1px solid rgba(212,160,23,0.18)', borderRadius: 7, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ color: GOLD, display: 'flex' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', lineHeight: 1.45 }}>
                        Claude analyzed 847 dimensions · 5 CSI divisions · <span style={{ color: GOLD, fontWeight: 700 }}>Completed in 41s</span>
                      </div>
                    </div>
                  </div>

                  {/* Material table */}
                  <div style={{ padding: '0 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '68px 1fr 52px 36px 54px 62px', gap: '0 6px', padding: '6px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px 6px 0 0' }}>
                      {['CSI','Description','Qty','Unit','Unit $','Total'].map(h => (
                        <div key={h} style={{ fontSize: 8, fontWeight: 700, color: DIM, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: h === 'Total' || h === 'Unit $' || h === 'Qty' ? 'right' : 'left' }}>{h}</div>
                      ))}
                    </div>
                    {TAKEOFF_MATERIALS.map((row, i) => (
                      <div key={row.csi} style={{ display: 'grid', gridTemplateColumns: '68px 1fr 52px 36px 54px 62px', gap: '0 6px', padding: '6px 6px', background: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.035)' }}>
                        <div style={{ fontSize: 9, color: GOLD, fontFamily: 'monospace', fontWeight: 700 }}>{row.csi}</div>
                        <div style={{ fontSize: 9, color: TEXT, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.desc}</div>
                        <div style={{ fontSize: 9, color: TEXT, textAlign: 'right' }}>{row.qty}</div>
                        <div style={{ fontSize: 9, color: DIM, textAlign: 'right' }}>{row.unit}</div>
                        <div style={{ fontSize: 9, color: DIM, textAlign: 'right' }}>{row.unit_cost}</div>
                        <div style={{ fontSize: 9, color: '#3dd68c', fontWeight: 700, textAlign: 'right' }}>{row.total}</div>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div style={{ padding: '10px 16px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.15)', borderRadius: 7, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: GOLD }}>Estimated Material Total</span>
                      <span style={{ fontSize: 14, fontWeight: 900, color: GOLD }}>$2,596,252</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                      <div style={{ padding: '8px 10px', background: `linear-gradient(135deg,${GOLD},#C8960F)`, borderRadius: 6, textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#000' }}>
                        Export Bid Package →
                      </div>
                      <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, textAlign: 'center', fontSize: 10, fontWeight: 600, color: TEXT }}>
                        Generate G702 Pay App
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ── Social proof strip ───────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ maxWidth: 1140, margin: '0 auto', padding: '14px 48px', display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>Trusted by GCs across the Southwest</span>
            {[
              { v: '500+', l: 'Projects managed' },
              { v: '$2B+', l: 'In contract value tracked' },
              { v: '50 states', l: 'Lien waiver coverage' },
              { v: '60 sec', l: 'Avg. AI takeoff time' },
            ].map((s, i) => (
              <React.Fragment key={s.l}>
                {i > 0 && <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.08)' }} />}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>{s.v}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{s.l}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── Stats bar ─────────────────────────────────────────────────── */}
        <section style={{ borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)' }}>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', maxWidth: 1100, margin: '0 auto', padding: '28px 48px', textAlign: 'center' }}>
            {STATS.map((s, i) => (
              <div key={s.label} style={{ borderRight: i < STATS.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none', padding: '0 24px' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: GOLD, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4, lineHeight: 1.4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Mobile Field App Section ─────────────────────────────────── */}
        <section id="field-app" style={{ background: 'rgba(212,160,23,0.04)', borderTop: '1px solid rgba(212,160,23,0.15)', borderBottom: '1px solid rgba(212,160,23,0.15)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 64, flexWrap: 'wrap' }}>

            {/* Left: phone mockup */}
            <div style={{ flex: '0 0 320px', maxWidth: 320, margin: '0 auto', position: 'relative' }}>
              {/* Glow */}
              <div style={{ position: 'absolute', inset: -32, background: 'radial-gradient(ellipse 80% 60% at 50% 55%, rgba(212,160,23,0.15) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(18px)' }} />

              {/* Phone shell */}
              <div style={{ position: 'relative', background: 'linear-gradient(160deg, #141e2e 0%, #0d1520 100%)', border: '2px solid rgba(255,255,255,0.12)', borderRadius: 36, padding: '12px 8px', boxShadow: '0 40px 100px rgba(0,0,0,.7), 0 0 0 1px rgba(212,160,23,0.08)' }}>
                {/* Notch */}
                <div style={{ width: 80, height: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 4, margin: '0 auto 10px' }} />

                {/* Screen content — Field home */}
                <div style={{ background: '#09111A', borderRadius: 24, overflow: 'hidden', padding: '14px 12px' }}>
                  {/* Header bar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(212,160,23,0.2)', border: '1px solid rgba(212,160,23,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD, fontWeight: 900, fontSize: 8, letterSpacing: '-0.5px' }}>SG</div>
                      <div>
                        <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: 1, color: GOLD }}>SAGUARO</div>
                        <div style={{ fontSize: 6, color: DIM, letterSpacing: 0.5 }}>FIELD</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 7, color: GREEN, fontWeight: 700 }}>● Online</div>
                  </div>

                  {/* Action grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                    {([
                      { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>, label: 'Daily Log', color: '#3B82F6', rgb: '59,130,246' },
                      { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx={12} cy={13} r={4}/></svg>, label: 'Photos', color: GOLD, rgb: '212,160,23' },
                      { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><circle cx={12} cy={12} r={10}/><polyline points="12 6 12 12 16 14"/></svg>, label: 'Clock In', color: GREEN, rgb: '34,197,94' },
                      { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>, label: 'Punch List', color: '#8B5CF6', rgb: '139,92,246' },
                    ] as { icon: React.ReactNode; label: string; color: string; rgb: string }[]).map(a => (
                      <div key={a.label} style={{ background: `rgba(${a.rgb},.08)`, border: `1px solid rgba(${a.rgb},.2)`, borderRadius: 10, padding: '8px 6px', textAlign: 'center' as const }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2, color: a.color }}>{a.icon}</div>
                        <div style={{ fontSize: 7, fontWeight: 700, color: TEXT }}>{a.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Open RFIs mini card */}
                  <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '7px 8px', marginBottom: 6 }}>
                    <div style={{ fontSize: 7, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4 }}>Open RFIs</div>
                    {['Footing depth clarification', 'MEP coordination — Level 2'].map(r => (
                      <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: GOLD, flexShrink: 0 }} />
                        <div style={{ fontSize: 7, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{r}</div>
                      </div>
                    ))}
                  </div>

                  {/* GPS clock bar */}
                  <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: GREEN, display: 'flex' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={10} height={10}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx={12} cy={10} r={3}/></svg></span>
                    <div style={{ fontSize: 7, color: GREEN, fontWeight: 700 }}>Clocked in · 7:02 AM · GPS verified</div>
                  </div>
                </div>

                {/* Home bar */}
                <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '10px auto 0' }} />
              </div>
            </div>

            {/* Right: copy */}
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.35)', borderRadius: 24, padding: '5px 14px 5px 8px', marginBottom: 20 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: 'rgba(212,160,23,0.2)', color: GOLD }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={10} height={10}><rect x={5} y={2} width={14} height={20} rx={2} ry={2}/><line x1={12} y1={18} x2={12.01} y2={18}/></svg></span>
                <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Mobile Field App</span>
              </div>

              <h2 style={{ fontSize: 'clamp(24px, 3vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 14px', lineHeight: 1.08 }}>
                Your crew's office<br />
                <span style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #F5D060 50%, #C8960F 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>is their phone</span>
              </h2>

              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.58)', margin: '0 0 28px', lineHeight: 1.65, maxWidth: 460 }}>
                Saguaro Field gives your crew everything they need in the field — daily logs, photos, GPS clock-in, punch lists, RFIs, and safety inspections. Works offline on any device. No App Store. No extra license fees.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12, marginBottom: 32 }}>
                {([
                  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M1.05 12A11 11 0 0 1 23 12"/><path d="M5 12a7 7 0 0 1 14 0"/><path d="M9 12a3 3 0 0 1 6 0"/><line x1={12} y1={12} x2={12.01} y2={12}/></svg>, title: 'Works 100% Offline', desc: 'Log work, clock in, and submit photos with zero signal. Syncs automatically when you reconnect.' },
                  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx={12} cy={10} r={3}/></svg>, title: 'GPS Time Tracking', desc: 'Clock in with verified GPS coordinates. Foremen see the whole crew in real time.' },
                  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, title: 'AI Field Assistant', desc: 'Ask Sage anything about the project — plans, schedules, specs, contacts — while standing on the slab.' },
                  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1={12} y1={15} x2={12} y2={3}/></svg>, title: 'No App Store Needed', desc: 'Install directly from your browser on iOS, Android, iPad, or Desktop. Nothing to download or update.' },
                ] as { icon: React.ReactNode; title: string; desc: string }[]).map(f => (
                  <div key={f.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(212,160,23,0.1)', border: '1px solid rgba(212,160,23,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD, flexShrink: 0 }}>{f.icon}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 2 }}>{f.title}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.48)', lineHeight: 1.5 }}>{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a href="/field-app" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: `linear-gradient(135deg,${GOLD},#C8960F)`, borderRadius: 8, color: '#000', fontSize: 13, fontWeight: 800, letterSpacing: '0.02em', textDecoration: 'none', boxShadow: `0 4px 20px rgba(212,160,23,0.3)` }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><rect x={5} y={2} width={14} height={20} rx={2} ry={2}/><line x1={12} y1={18} x2={12.01} y2={18}/></svg>
                  See Field App Features →
                </a>
                <a href="/get-the-app" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: 'rgba(212,160,23,0.1)', border: `1px solid rgba(212,160,23,0.35)`, borderRadius: 8, color: GOLD, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1={12} y1={15} x2={12} y2={3}/></svg>
                  Get the App
                </a>
                <a href="/field" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.72)', fontSize: 13, textDecoration: 'none' }}>
                  Open Field App
                </a>
              </div>

              <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                {['✓ iOS & Android', '✓ Works Offline', '✓ Free with any plan', '✓ No App Store'].map(t => (
                  <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
                    <span style={{ color: GOLD, fontWeight: 700 }}>{t.slice(0,1)}</span>{t.slice(1)}
                  </span>
                ))}
              </div>
            </div>

          </div>
          </div>
        </section>

        {/* ── How It Works / Try It Now ─────────────────────────────────── */}
        <section id="demo" style={{ padding: '56px 48px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>How It Works</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 8px' }}>From Blueprint to Paid — in One Platform</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', maxWidth: 560, margin: '0 auto 28px' }}>Upload any PDF blueprint. Claude reads every dimension, calculates all materials, and drives the entire project lifecycle.</p>
            <a href="/sandbox" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 32px', background: `linear-gradient(135deg,${GOLD},#C8960F)`, borderRadius: 8, color: '#000', fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', textDecoration: 'none' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><rect x={2} y={2} width={20} height={20} rx={2}/><path d="M2 9h20M9 2v20"/></svg>
              Try Free — Upload Your Blueprint
            </a>
            <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>5 free AI runs · No credit card · Results in under 60 seconds</div>
          </div>

          <div className="demo-layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {WORKFLOW_STEPS.map((s) => (
              <div key={s.step} style={{ display: 'flex', gap: 14, padding: '18px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: `rgba(212,160,23,0.12)`, border: `1px solid rgba(212,160,23,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, fontWeight: 800, color: GOLD }}>
                  {s.step}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: GOLD, display: 'flex' }}>{s.icon}</span>{s.label}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.55 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 36, background: 'rgba(212,160,23,0.06)', border: '1px solid rgba(212,160,23,0.2)', borderRadius: 12, padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Ready to run your first AI takeoff?</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Create a free sandbox account — includes 5 AI blueprint runs on your actual blueprints.</div>
            </div>
            <a href="/sandbox" style={{ padding: '11px 28px', background: `linear-gradient(135deg,${GOLD},#C8960F)`, borderRadius: 8, color: '#000', fontSize: 13, fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Start Free Sandbox →
            </a>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <section id="features" style={{ padding: '56px 48px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Everything You Need</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 8px' }}>One platform. Every project document.</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', maxWidth: 540, margin: '0 auto' }}>No more switching between 6 different tools. Saguaro handles the full construction document lifecycle.</p>
          </div>
          <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '20px 22px', transition: 'border-color .2s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,160,23,.4)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ color: GOLD, display: 'flex' }}>{f.icon}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: GOLD, background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.25)', borderRadius: 10, padding: '2px 8px', letterSpacing: '0.1em', marginBottom: 8 }}>{f.pill}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: '0.01em', color: TEXT, marginBottom: 6 }}>{f.title}</div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Testimonials ─────────────────────────────────────────────── */}
        <section style={{ borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(31,44,62,.3)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 48px' }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <h2 style={{ fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 8px' }}>Built by GCs, for GCs</h2>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: 0 }}>Real feedback from contractors who switched from legacy software</p>
            </div>
            <div className="testimonials-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
              {TESTIMONIALS.map((t, i) => (
                <div key={i} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '20px 22px' }}>
                  <div style={{ fontSize: 28, color: 'rgba(212,160,23,0.4)', marginBottom: 10 }}>❝</div>
                  <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 14 }}>{t.quote}</p>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{t.title}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA Banner ───────────────────────────────────────────────── */}
        <section style={{ padding: '56px 48px', textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 12px', lineHeight: 1.1 }}>
            Ready to run smarter projects?
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: '0 0 24px', lineHeight: 1.6 }}>
            Start your 30-day free trial. No credit card required. Full access to every feature from day one.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/signup" style={{ padding: '10px 24px', background: `linear-gradient(135deg,${GOLD},#C8960F)`, border: 'none', borderRadius: 7, color: '#000', fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', textDecoration: 'none' }}>
              Start Free Trial →
            </a>
            <button onClick={() => setContactModal(true)} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 7, color: 'rgba(255,255,255,0.75)', fontSize: 13, cursor: 'pointer' }}>
              Talk to Sales
            </button>
          </div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
            {['30 days free', 'Cancel anytime', 'No per-seat fees', 'Unlimited users'].map(t => (
              <span key={t} style={{ fontSize: 12, color: DIM, display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={11} height={11} style={{ color: GOLD }}><polyline points="20 6 9 17 4 12"/></svg>{t}
              </span>
            ))}
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer style={{ borderTop: `1px solid ${BORDER}`, padding: '40px 24px', background: 'rgba(13,17,23,.8)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 32 }}>
            <div>
              <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 12 }}>
                <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 36, width: 'auto', objectFit: 'contain', borderRadius: 4 }} />
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                  <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: 1, background: `linear-gradient(90deg,${GOLD},#F0C040)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SAGUARO</span>
                  <span style={{ fontSize: 10, color: DIM, letterSpacing: .5, fontWeight: 600 }}>Control Systems</span>
                </span>
              </a>
              <p style={{ fontSize: 12, color: DIM, lineHeight: 1.6, margin: 0 }}>AI-powered construction management for general contractors.</p>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: TEXT, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Product</div>
              {[['Features', '/#features'], ['Field App', '/field-app'], ['How It Works', '/#demo'], ['Pricing', '/pricing'], ['Security', '/security'], ['Compare Procore', '/compare/procore']].map(([l, h]) => (
                <a key={h} href={h} style={{ display: 'block', fontSize: 13, color: DIM, textDecoration: 'none', marginBottom: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
                  onMouseLeave={e => (e.currentTarget.style.color = DIM)}>{l}</a>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: TEXT, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Account</div>
              {[['Sign Up', '/signup'], ['Log In', '/login'], ['Forgot Password', '/forgot-password']].map(([l, h]) => (
                <a key={h} href={h} style={{ display: 'block', fontSize: 13, color: DIM, textDecoration: 'none', marginBottom: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
                  onMouseLeave={e => (e.currentTarget.style.color = DIM)}>{l}</a>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: TEXT, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Legal</div>
              {[['Privacy Policy', '/privacy'], ['Terms of Service', '/terms'], ['Security', '/security']].map(([l, h]) => (
                <a key={h} href={h} style={{ display: 'block', fontSize: 13, color: DIM, textDecoration: 'none', marginBottom: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
                  onMouseLeave={e => (e.currentTarget.style.color = DIM)}>{l}</a>
              ))}
              <button onClick={() => setContactModal(true)} style={{ display: 'block', background: 'none', border: 'none', fontSize: 13, color: DIM, cursor: 'pointer', padding: 0, marginTop: 8, textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
                onMouseLeave={e => (e.currentTarget.style.color = DIM)}>Contact Us</button>
            </div>
          </div>
          <div style={{ maxWidth: 1100, margin: '32px auto 0', paddingTop: 24, borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontSize: 12, color: '#4a5f7a' }}>© {new Date().getFullYear()} Saguaro CRM. All rights reserved.</span>
            <span style={{ fontSize: 12, color: '#4a5f7a' }}>Built for General Contractors by construction professionals.</span>
          </div>
        </footer>
      </div>

      {/* ── Contact Modal ─────────────────────────────────────────────── */}
      {contactModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setContactModal(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, width: '100%', maxWidth: 480, boxShadow: '0 30px 80px rgba(0,0,0,.6)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: TEXT }}>Talk to Sales</div>
              <button onClick={() => setContactModal(false)} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '2px 6px', borderRadius: 4 }} aria-label="Close">×</button>
            </div>
            <div style={{ padding: 24 }}>
              {contactSent ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <div style={{ marginBottom: 12, color: GREEN, display: 'flex', justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={44} height={44}><polyline points="20 6 9 17 4 12"/></svg></div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: TEXT, marginBottom: 8 }}>Message sent!</div>
                  <div style={{ fontSize: 13, color: DIM }}>We'll be in touch within 1 business day.</div>
                  <button onClick={() => { setContactModal(false); setContactSent(false); }} style={{ marginTop: 20, padding: '10px 24px', background: GOLD, border: 'none', borderRadius: 8, color: '#0d1117', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Done</button>
                </div>
              ) : (
                <form onSubmit={submitContact} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[['Name', 'name', 'text', 'Your name'], ['Work Email', 'email', 'email', 'you@company.com'], ['Company', 'company', 'text', 'Acme Construction LLC']].map(([label, key, type, placeholder]) => (
                    <div key={key}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 6 }}>{label}</label>
                      <input type={type} placeholder={placeholder} value={(contactForm as Record<string, string>)[key]} required
                        onChange={e => setContactForm(p => ({ ...p, [key]: e.target.value }))}
                        style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,.04)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
                    </div>
                  ))}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 6 }}>Message</label>
                    <textarea placeholder="Tell us about your team size and what you're looking to solve..." value={contactForm.message}
                      onChange={e => setContactForm(p => ({ ...p, message: e.target.value }))} rows={3} required
                      style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,.04)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
                  </div>
                  <button type="submit" disabled={contactLoading} style={{ padding: '12px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 9, color: '#0d1117', fontWeight: 800, fontSize: 14, cursor: contactLoading ? 'not-allowed' : 'pointer' }}>
                    {contactLoading ? 'Sending…' : 'Send Message →'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
