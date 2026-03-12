'use client';
import React, { useState } from 'react';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#22c55e';

const NAV_LINKS = [
  { label: 'Features',  href: '/#features' },
  { label: 'How It Works', href: '/#demo' },
  { label: 'Pricing',   href: '/pricing' },
  { label: 'Compare',   href: '/compare/procore' },
];

const FEATURES = [
  { icon: '📐', title: 'AI Blueprint Takeoff', desc: 'Upload any PDF blueprint. Claude reads every dimension, calculates all materials, and generates a full bid estimate in under 60 seconds.', pill: 'AI-powered' },
  { icon: '💰', title: 'AIA Pay Applications', desc: 'Generate G702/G703 Continuation Sheets automatically. Submit to owners digitally with one click — no PDFs to fill by hand.', pill: 'G702 / G703' },
  { icon: '🔒', title: 'Lien Waivers — All 50 States', desc: 'Conditional & unconditional, partial & final. AZ, CA, TX statutory language. Send, sign, and track — no paper, no fax.', pill: 'All 50 states' },
  { icon: '🤖', title: 'Autopilot', desc: "Automated RFI routing, change order alerts, insurance expiry reminders, and pay app follow-ups — while you're in the field.", pill: 'Fully automated' },
  { icon: '📋', title: 'Certified Payroll WH-347', desc: 'DOL-compliant weekly reports for prevailing wage projects. Pulls live Davis-Bacon wage rates. Submits directly to agencies.', pill: 'Davis-Bacon' },
  { icon: '🧠', title: 'Bid Intelligence', desc: 'AI scores every bid opportunity 0–100 based on your win history, market conditions, and margin targets. Stop chasing bad bids.', pill: 'Win rate AI' },
  { icon: '📦', title: 'Bid Package Manager', desc: 'Auto-create bid packages from takeoff data. Invite subs by CSI trade division. Track responses in one dashboard.', pill: 'CSI MasterFormat' },
  { icon: '🛡️', title: 'Insurance & Compliance', desc: 'ACORD 25 COI parser, expiry alerts, OSHA 300 log, and sub compliance dashboard. Never let a lapsed COI delay a project.', pill: 'OSHA + COI' },
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
const WORKFLOW_STEPS = [
  { step: 1, icon: '📐', label: 'Upload Blueprint', desc: 'Drop any PDF — floor plan, structural, MEP. Claude reads every dimension automatically.' },
  { step: 2, icon: '🤖', label: 'AI Reads Everything', desc: 'Claude Opus analyzes every dimension, spec, and schedule. Scale detected automatically.' },
  { step: 3, icon: '📊', label: 'Instant Material Takeoff', desc: 'Full CSI-organized material list — 50–200 line items with quantities, waste factors & costs.' },
  { step: 4, icon: '📦', label: 'Bid Package + Sub Invites', desc: 'Auto-create packages by CSI trade division. Subs invited by email in one click.' },
  { step: 5, icon: '💰', label: 'Generate G702 Pay App', desc: 'AIA G702/G703 filled from your SOV and ready to submit to owner digitally.' },
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
          .hero-left h1 { text-align: center !important; font-size: clamp(28px, 8vw, 40px) !important; }
          .hero-left p { text-align: center !important; max-width: 100% !important; }
          .hero-left div[style*="flex-start"] { justify-content: center !important; }
          .hero-left p[style*="text-align: left"] { text-align: center !important; }
          .hero-right { flex: 0 0 100% !important; max-width: 100% !important; display: none !important; }
          .hero-section { padding: 48px 24px 40px !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .testimonials-grid { grid-template-columns: 1fr !important; }
          .demo-layout { flex-direction: column !important; }
          .demo-steps-col { flex-direction: row !important; overflow-x: auto; min-width: unset !important; }
          .demo-screen { min-height: 320px !important; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .demo-screen-inner { animation: fadeInUp .35s ease; }
      `}</style>

      <div style={{ paddingTop: 58 }}>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 48px 64px' }} className="hero-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: 48 }} className="hero-flex">
            {/* Left column */}
            <div style={{ flex: '0 0 55%', maxWidth: '55%' }} className="hero-left">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.4)', borderRadius: 20, padding: '5px 12px', marginBottom: 20 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.12em', textTransform: 'uppercase' }}>AI-Powered Construction Management</span>
              </div>
              <h1 style={{ fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 800, margin: '0 0 16px', lineHeight: 1.1, letterSpacing: '-0.02em', textAlign: 'left' }}>
                The CRM Built<br />
                <span style={{ color: GOLD }}>for Construction</span>
              </h1>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', maxWidth: 480, margin: '0 0 28px', lineHeight: 1.6, textAlign: 'left' }}>
                AI Blueprint Takeoff, AIA Pay Applications, Lien Waivers, Certified Payroll, Bid Intelligence — everything a General Contractor needs to run profitable projects.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                <a href="/signup" style={{ padding: '10px 24px', background: `linear-gradient(135deg,${GOLD},#C8960F)`, border: 'none', borderRadius: 7, color: '#000', fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', textDecoration: 'none', cursor: 'pointer' }}>
                  Start Free Trial — No Card Required
                </a>
                <a href="#demo" style={{ padding: '10px 20px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 7, color: 'rgba(255,255,255,0.75)', fontSize: 13, textDecoration: 'none' }}>
                  ▶ Watch How It Works
                </a>
              </div>
              <p style={{ marginTop: 12, fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em', textAlign: 'left' }}>30-day free trial · No credit card · Cancel anytime</p>
            </div>

            {/* Right column — AI Takeoff UI */}
            <div style={{ flex: '0 0 45%', maxWidth: '45%' }} className="hero-right">
              <div style={{ background: '#111b27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
                {/* Browser chrome */}
                <div style={{ background: '#0a1117', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {['#ff5f57','#febc2e','#28c840'].map(c => <div key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />)}
                  </div>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '3px 8px', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>
                    saguarocontrol.net/app/takeoff/riverside-medical
                  </div>
                </div>
                {/* Takeoff header */}
                <div style={{ padding: '12px 14px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: TEXT }}>AI Blueprint Takeoff</div>
                      <div style={{ fontSize: 9, color: DIM, marginTop: 1 }}>Riverside Medical Pavilion · 48 pages · 24,200 SF</div>
                    </div>
                    <span style={{ fontSize: 9, background: 'rgba(34,197,94,0.12)', color: '#3dd68c', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>✓ COMPLETE</span>
                  </div>
                  {/* AI processing bar */}
                  <div style={{ background: 'rgba(212,160,23,0.07)', border: '1px solid rgba(212,160,23,0.2)', borderRadius: 6, padding: '7px 10px', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 11 }}>🤖</span>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>Claude analyzed 847 dimensions · 5 CSI divisions · <span style={{ color: GOLD, fontWeight: 700 }}>Completed in 41s</span></div>
                  </div>
                </div>
                {/* Material table */}
                <div style={{ padding: '0 14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 52px 36px 54px 62px', gap: '0 6px', padding: '5px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px 6px 0 0' }}>
                    {['CSI','Description','Qty','Unit','Unit $','Total'].map(h => (
                      <div key={h} style={{ fontSize: 8, fontWeight: 700, color: DIM, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: h === 'Total' || h === 'Unit $' || h === 'Qty' ? 'right' : 'left' }}>{h}</div>
                    ))}
                  </div>
                  {TAKEOFF_MATERIALS.map((row, i) => (
                    <div key={row.csi} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 52px 36px 54px 62px', gap: '0 6px', padding: '6px 6px', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ fontSize: 9, color: GOLD, fontFamily: 'monospace', fontWeight: 600 }}>{row.csi}</div>
                      <div style={{ fontSize: 9, color: TEXT, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.desc}</div>
                      <div style={{ fontSize: 9, color: TEXT, textAlign: 'right' }}>{row.qty}</div>
                      <div style={{ fontSize: 9, color: DIM, textAlign: 'right' }}>{row.unit}</div>
                      <div style={{ fontSize: 9, color: DIM, textAlign: 'right' }}>{row.unit_cost}</div>
                      <div style={{ fontSize: 9, color: TEXT, fontWeight: 700, textAlign: 'right' }}>{row.total}</div>
                    </div>
                  ))}
                </div>
                {/* Total row + export */}
                <div style={{ padding: '8px 14px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 6px', background: 'rgba(212,160,23,0.08)', borderRadius: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: GOLD }}>Estimated Material Total</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: GOLD }}>$2,596,252</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div style={{ padding: '7px 10px', background: `linear-gradient(135deg,${GOLD},#C8960F)`, borderRadius: 6, textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#000', cursor: 'pointer' }}>
                      Export Bid Package →
                    </div>
                    <div style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, textAlign: 'center', fontSize: 10, fontWeight: 600, color: TEXT, cursor: 'pointer' }}>
                      Generate G702 Pay App
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

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

        {/* ── How It Works / Try It Now ─────────────────────────────────── */}
        <section id="demo" style={{ padding: '56px 48px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>How It Works</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 8px' }}>From Blueprint to Paid — in One Platform</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', maxWidth: 560, margin: '0 auto 28px' }}>Upload any PDF blueprint. Claude reads every dimension, calculates all materials, and drives the entire project lifecycle.</p>
            <a href="/sandbox" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 32px', background: `linear-gradient(135deg,${GOLD},#C8960F)`, borderRadius: 8, color: '#000', fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', textDecoration: 'none' }}>
              📐 Try Free — Upload Your Blueprint
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{s.icon} {s.label}</div>
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
                  <span style={{ fontSize: 20 }}>{f.icon}</span>
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
            {['✅ 30 days free', '✅ Cancel anytime', '✅ No per-seat fees', '✅ Unlimited users'].map(t => (
              <span key={t} style={{ fontSize: 12, color: DIM }}>{t}</span>
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
              {[['Features', '/#features'], ['How It Works', '/#demo'], ['Pricing', '/pricing'], ['Security', '/security'], ['Compare Procore', '/compare/procore']].map(([l, h]) => (
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
                  <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
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
