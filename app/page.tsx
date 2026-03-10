'use client';
import React, { useState } from 'react';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#22c55e';

const NAV_LINKS = [
  { label: 'Features',  href: '/#features' },
  { label: 'Pricing',   href: '/pricing' },
  { label: 'Security',  href: '/security' },
  { label: 'Compare',   href: '/compare/procore' },
];

const FEATURES = [
  {
    icon: '📐',
    title: 'AI Blueprint Takeoff',
    desc: 'Upload any PDF blueprint. Claude reads every dimension, calculates all materials, and generates a full bid estimate in under 60 seconds.',
    pill: 'AI-powered',
  },
  {
    icon: '💰',
    title: 'AIA Pay Applications',
    desc: 'Generate G702/G703 Continuation Sheets automatically. Submit to owners digitally with one click — no PDFs to fill by hand.',
    pill: 'G702 / G703',
  },
  {
    icon: '🔒',
    title: 'Lien Waivers — All 50 States',
    desc: 'Conditional & unconditional, partial & final. AZ, CA, TX statutory language. Send, sign, and track — no paper, no fax.',
    pill: 'All 50 states',
  },
  {
    icon: '🤖',
    title: 'Autopilot',
    desc: "Automated RFI routing, change order alerts, insurance expiry reminders, and pay app follow-ups — while you're in the field.",
    pill: 'Fully automated',
  },
  {
    icon: '📋',
    title: 'Certified Payroll WH-347',
    desc: 'DOL-compliant weekly reports for prevailing wage projects. Pulls live Davis-Bacon wage rates. Submits directly to agencies.',
    pill: 'Davis-Bacon',
  },
  {
    icon: '🧠',
    title: 'Bid Intelligence',
    desc: 'AI scores every bid opportunity 0–100 based on your win history, market conditions, and margin targets. Stop chasing bad bids.',
    pill: 'Win rate AI',
  },
  {
    icon: '📦',
    title: 'Bid Package Manager',
    desc: 'Auto-create bid packages from takeoff data. Invite subs by CSI trade division. Track responses in one dashboard.',
    pill: 'CSI MasterFormat',
  },
  {
    icon: '🛡️',
    title: 'Insurance & Compliance',
    desc: 'ACORD 25 COI parser, expiry alerts, OSHA 300 log, and sub compliance dashboard. Never let a lapsed COI delay a project.',
    pill: 'OSHA + COI',
  },
];

const STATS = [
  { value: '4 hrs', label: 'saved per takeoff vs. manual' },
  { value: '$0', label: 'per seat — flat license' },
  { value: '50', label: 'states covered for lien waivers' },
  { value: '60s', label: 'to generate a pay application' },
];

const TESTIMONIALS = [
  {
    quote: "We used to spend half a day doing material takeoffs by hand. Now our estimator uploads the PDF and has numbers in a minute. It changed how we bid.",
    name: "Marcus T.",
    title: "Project Manager — General Contractor, Phoenix AZ",
  },
  {
    quote: "The lien waiver module alone is worth it. We do 30–40 waivers a month across multiple projects. This cut our admin time by 80%.",
    name: "Jennifer R.",
    title: "Operations Director — Specialty Subcontractor, Las Vegas NV",
  },
  {
    quote: "We compared this to Procore and Buildertrend. Saguaro has everything we need at a fraction of the cost, and the AI features are actually useful.",
    name: "David K.",
    title: "Owner — Mid-Size GC, Denver CO",
  },
];

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
      await fetch('/api/leads/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      });
      setContactSent(true);
    } catch { /* non-fatal */ }
    setContactLoading(false);
  }

  return (
    <div style={{ minHeight: '100vh', background: DARK, color: TEXT, fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 56, background: 'rgba(13,17,23,.96)', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 24, backdropFilter: 'blur(12px)' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
          <span style={{ fontSize: 22 }}>🌵</span>
          <span style={{ fontWeight: 900, fontSize: 16, letterSpacing: 1, color: GOLD }}>SAGUARO</span>
          <span style={{ fontSize: 10, background: GOLD, color: '#0d1117', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>CRM</span>
        </a>

        {/* Desktop nav links */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }} className="desktop-nav">
          {NAV_LINKS.map(l => (
            <a key={l.href} href={l.href} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, color: DIM, textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
              onMouseLeave={e => (e.currentTarget.style.color = DIM)}>
              {l.label}
            </a>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a href="/login" className="desktop-nav" style={{ padding: '7px 16px', background: 'rgba(255,255,255,.04)', border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            Log In
          </a>
          <a href="/signup" style={{ padding: '7px 18px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 7, color: '#0d1117', fontSize: 13, fontWeight: 800, textDecoration: 'none', flexShrink: 0 }}>
            Free Trial
          </a>
          {/* Hamburger */}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="mobile-only"
            style={{ display: 'none', background: 'none', border: 'none', color: TEXT, fontSize: 22, cursor: 'pointer', padding: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            aria-label="Menu">
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div style={{ position: 'fixed', top: 56, left: 0, right: 0, zIndex: 99, background: 'rgba(13,17,23,.99)', borderBottom: `1px solid ${BORDER}`, padding: '8px 0', backdropFilter: 'blur(12px)' }}>
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
          .hero-grid { grid-template-columns: 1fr !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .testimonials-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ paddingTop: 56 }}>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section style={{ padding: '80px 24px 60px', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(212,160,23,.1)', border: `1px solid rgba(212,160,23,.3)`, borderRadius: 20, padding: '5px 14px', marginBottom: 24 }}>
            <span style={{ fontSize: 14 }}>🤖</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, letterSpacing: .5 }}>AI-Powered Construction Management</span>
          </div>
          <h1 style={{ fontSize: 'clamp(36px, 6vw, 68px)', fontWeight: 900, margin: '0 0 20px', lineHeight: 1.08, letterSpacing: -1 }}>
            The CRM Built<br />
            <span style={{ background: `linear-gradient(135deg,${GOLD},#F0C040)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              for Construction
            </span>
          </h1>
          <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', color: DIM, maxWidth: 620, margin: '0 auto 36px', lineHeight: 1.65 }}>
            AI Blueprint Takeoff, AIA Pay Applications, Lien Waivers, Certified Payroll, Bid Intelligence — everything a General Contractor needs to run profitable projects.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/signup" style={{ padding: '14px 32px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 10, color: '#0d1117', fontSize: 16, fontWeight: 800, textDecoration: 'none', boxShadow: '0 4px 20px rgba(212,160,23,.3)' }}>
              Start Free Trial — No Card Required
            </a>
            <a href="/login" style={{ padding: '14px 28px', background: 'rgba(255,255,255,.04)', border: `1px solid ${BORDER}`, borderRadius: 10, color: TEXT, fontSize: 16, fontWeight: 700, textDecoration: 'none' }}>
              Sign In →
            </a>
          </div>
          <p style={{ marginTop: 16, fontSize: 12, color: '#4a5f7a' }}>30-day free trial · No credit card · Cancel anytime</p>
        </section>

        {/* ── Stats bar ─────────────────────────────────────────────────── */}
        <section style={{ borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: '32px 24px', background: 'rgba(31,44,62,.4)' }}>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
            {STATS.map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 32, fontWeight: 900, color: GOLD, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: DIM, marginTop: 6, lineHeight: 1.4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <section id="features" style={{ padding: '80px 24px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>Everything You Need</div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, margin: '0 0 16px' }}>One platform. Every project document.</h2>
            <p style={{ fontSize: 16, color: DIM, maxWidth: 540, margin: '0 auto' }}>No more switching between 6 different tools. Saguaro handles the full construction document lifecycle.</p>
          </div>
          <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '24px 22px', transition: 'border-color .2s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,160,23,.4)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 28 }}>{f.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: GOLD, background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.25)', borderRadius: 4, padding: '2px 7px', letterSpacing: .3 }}>{f.pill}</span>
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: TEXT, marginBottom: 8 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: DIM, lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Testimonials ─────────────────────────────────────────────── */}
        <section style={{ padding: '60px 24px 80px', background: 'rgba(31,44,62,.3)', borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ maxWidth: 1060, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 44 }}>
              <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, margin: '0 0 10px' }}>Built by GCs, for GCs</h2>
              <p style={{ color: DIM, fontSize: 15 }}>Real feedback from contractors who switched from legacy software</p>
            </div>
            <div className="testimonials-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
              {TESTIMONIALS.map((t, i) => (
                <div key={i} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '24px 22px' }}>
                  <div style={{ fontSize: 22, color: GOLD, marginBottom: 12 }}>❝</div>
                  <p style={{ fontSize: 14, color: TEXT, lineHeight: 1.7, marginBottom: 16 }}>{t.quote}</p>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{t.title}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA Banner ───────────────────────────────────────────────── */}
        <section style={{ padding: '80px 24px', textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, margin: '0 0 16px', lineHeight: 1.1 }}>
            Ready to run smarter projects?
          </h2>
          <p style={{ fontSize: 16, color: DIM, margin: '0 0 32px', lineHeight: 1.6 }}>
            Start your 30-day free trial. No credit card required. Full access to every feature from day one.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/signup" style={{ padding: '15px 36px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 10, color: '#0d1117', fontSize: 16, fontWeight: 800, textDecoration: 'none', boxShadow: '0 4px 20px rgba(212,160,23,.25)' }}>
              Start Free Trial →
            </a>
            <button onClick={() => setContactModal(true)} style={{ padding: '15px 28px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, color: TEXT, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
              Talk to Sales
            </button>
          </div>
          <div style={{ display: 'flex', gap: 24, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            {['✅ 30 days free', '✅ Cancel anytime', '✅ No per-seat fees', '✅ Unlimited users'].map(t => (
              <span key={t} style={{ fontSize: 13, color: DIM }}>{t}</span>
            ))}
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer style={{ borderTop: `1px solid ${BORDER}`, padding: '40px 24px', background: 'rgba(13,17,23,.8)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 32 }}>
            <div>
              <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>🌵</span>
                <span style={{ fontWeight: 900, fontSize: 15, color: GOLD, letterSpacing: 1 }}>SAGUARO CRM</span>
              </a>
              <p style={{ fontSize: 12, color: DIM, lineHeight: 1.6, margin: 0 }}>AI-powered construction management for general contractors.</p>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: TEXT, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Product</div>
              {[['Features', '/#features'], ['Pricing', '/pricing'], ['Security', '/security'], ['Compare Procore', '/compare/procore'], ['Compare Buildertrend', '/compare/buildertrend']].map(([l, h]) => (
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
              {[['Privacy Policy', '/privacy'], ['Terms of Service', '/terms'], ['SLA', '/sla'], ['Security', '/security']].map(([l, h]) => (
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
