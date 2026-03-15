'use client';

import { useState } from 'react';
import Link from 'next/link';

const DARK = '#0d1117';
const GOLD = '#F59E0B';
const TEXT = '#F8FAFC';
const DIM = '#CBD5E1';
const BORDER = '#1E3A5F';
const RAISED = '#0F172A';
const GREEN = '#22c55e';
const RED = '#ef4444';

const goldGradientText = {
  background: 'linear-gradient(135deg, #F59E0B 0%, #F5D060 50%, #C8960F 100%)',
  WebkitBackgroundClip: 'text' as const,
  WebkitTextFillColor: 'transparent' as const,
  backgroundClip: 'text' as const,
};

function formatCurrency(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function SwitchFromProcorePage() {
  const [teamSize, setTeamSize] = useState(15);
  const [procoreMonthly, setProcoreMonthly] = useState(1850);

  const saguaroMonthlyCost = 299;
  const savings = procoreMonthly - saguaroMonthlyCost;
  const annualSavings = savings * 12;
  const fiveYearSavings = savings * 60;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${DARK}; color: ${TEXT}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .nav-container { display: flex; align-items: center; justify-content: space-between; padding: 0 40px; height: 68px; }
        .nav-links { display: flex; align-items: center; gap: 12px; }
        .pain-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .comparison-table { width: 100%; border-collapse: collapse; }
        .steps-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
        .testimonials-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
        .trust-pills { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin-top: 32px; }
        .calc-inputs { display: flex; gap: 32px; justify-content: center; flex-wrap: wrap; }
        .savings-display { display: flex; gap: 32px; justify-content: center; flex-wrap: wrap; margin-top: 32px; }
        .footer-links { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; }
        @media (max-width: 768px) {
          .nav-container { padding: 0 20px; }
          .nav-links { gap: 8px; }
          .nav-links a:first-child { display: none; }
          .pain-grid { grid-template-columns: 1fr; }
          .steps-grid { grid-template-columns: 1fr 1fr; }
          .testimonials-grid { grid-template-columns: 1fr; }
          .calc-inputs { flex-direction: column; align-items: center; }
          .savings-display { flex-direction: column; align-items: center; }
          .hero-headline { font-size: 2.2rem !important; }
          .hero-sub { font-size: 1rem !important; }
          .section-pad { padding: 60px 20px !important; }
          .comparison-wrapper { overflow-x: auto; }
          .comparison-table th, .comparison-table td { padding: 12px 10px !important; font-size: 0.85rem !important; }
          .step-number-line { display: none; }
        }
        @media (max-width: 480px) {
          .steps-grid { grid-template-columns: 1fr; }
          .hero-ctas { flex-direction: column !important; align-items: center !important; }
        }
        .btn-amber {
          background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
          color: #0d1117;
          font-weight: 700;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .btn-amber:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(245,158,11,0.4); }
        .btn-outline {
          background: transparent;
          color: ${TEXT};
          font-weight: 600;
          border: 1px solid ${BORDER};
          border-radius: 10px;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          transition: border-color 0.15s, background 0.15s;
        }
        .btn-outline:hover { border-color: ${GOLD}; background: rgba(245,158,11,0.07); }
        .pain-card {
          background: ${RAISED};
          border: 1px solid ${BORDER};
          border-radius: 14px;
          padding: 28px;
          transition: transform 0.15s, border-color 0.15s;
        }
        .pain-card:hover { transform: translateY(-3px); border-color: rgba(239,68,68,0.4); }
        .step-card {
          background: ${RAISED};
          border: 1px solid ${BORDER};
          border-radius: 14px;
          padding: 28px 24px;
          text-align: center;
          position: relative;
          transition: transform 0.15s, border-color 0.15s;
        }
        .step-card:hover { transform: translateY(-3px); border-color: rgba(245,158,11,0.4); }
        .testimonial-card {
          background: ${RAISED};
          border: 1px solid ${BORDER};
          border-radius: 14px;
          padding: 28px;
          position: relative;
          transition: transform 0.15s;
        }
        .testimonial-card:hover { transform: translateY(-3px); }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { opacity: 1; }
        .calc-input-field {
          background: #0d1117;
          border: 1px solid ${BORDER};
          border-radius: 8px;
          color: ${TEXT};
          font-size: 1.1rem;
          padding: 12px 16px;
          width: 200px;
          text-align: right;
          outline: none;
          transition: border-color 0.15s;
        }
        .calc-input-field:focus { border-color: ${GOLD}; }
        .comparison-table tr:nth-child(even) td { background: rgba(30,58,95,0.1); }
        .comparison-table tr:hover td { background: rgba(245,158,11,0.04); }
      `}</style>

      {/* ─── STICKY NAV ─── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(13,17,23,0.95)',
        backdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div className="nav-container">
          <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <img src="/logo-full.jpg" alt="Saguaro" style={{ height: 48, mixBlendMode: 'screen' }} />
          </Link>
          <div className="nav-links">
            <Link href="/login" className="btn-outline" style={{ padding: '9px 20px', fontSize: '0.9rem' }}>
              Log In
            </Link>
            <Link href="/signup" className="btn-amber" style={{ padding: '10px 22px', fontSize: '0.9rem' }}>
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section style={{
        position: 'relative',
        background: DARK,
        overflow: 'hidden',
        padding: '100px 40px 80px',
        textAlign: 'center',
      }}>
        {/* Atmospheric glow */}
        <div style={{
          position: 'absolute', top: '10%', left: '50%',
          transform: 'translateX(-50%)',
          width: 700, height: 400,
          background: 'radial-gradient(ellipse, rgba(245,158,11,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: 0, left: '50%',
          transform: 'translateX(-50%)',
          width: 900, height: 200,
          background: 'radial-gradient(ellipse, rgba(245,158,11,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', maxWidth: 800, margin: '0 auto' }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(245,158,11,0.1)',
            border: `1px solid rgba(245,158,11,0.3)`,
            borderRadius: 999, padding: '8px 20px',
            fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em',
            color: GOLD, marginBottom: 32,
          }}>
            🔄 PROCORE MIGRATION — WE&apos;LL HANDLE EVERYTHING
          </div>

          {/* Headline */}
          <h1 className="hero-headline" style={{
            fontSize: '3.4rem', fontWeight: 800, lineHeight: 1.15,
            letterSpacing: '-0.02em', marginBottom: 24,
            ...goldGradientText,
          }}>
            Tired of Procore&apos;s Price Tag?<br />We&apos;ll Move You Over — Free.
          </h1>

          {/* Subheadline */}
          <p className="hero-sub" style={{
            fontSize: '1.2rem', color: DIM, lineHeight: 1.7,
            maxWidth: 620, margin: '0 auto 40px',
          }}>
            Join 500+ GC teams who switched. Keep all your project data. Get up and running in 1 business day. No consultants. No stress.
          </p>

          {/* CTAs */}
          <div className="hero-ctas" style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup" className="btn-amber" style={{ padding: '16px 36px', fontSize: '1.1rem', borderRadius: 12 }}>
              Start Free Trial — No CC Required
            </Link>
            <a href="#comparison" className="btn-outline" style={{ padding: '16px 28px', fontSize: '1rem', borderRadius: 12 }}>
              See What We Offer ↓
            </a>
          </div>

          {/* Trust pills */}
          <div className="trust-pills">
            {['✓ 1-Day Migration', '✓ Free Data Import', '✓ Month-to-Month', '✓ No Contracts'].map((pill) => (
              <span key={pill} style={{
                background: 'rgba(34,197,94,0.1)',
                border: `1px solid rgba(34,197,94,0.25)`,
                borderRadius: 999, padding: '7px 18px',
                fontSize: '0.85rem', fontWeight: 600, color: GREEN,
              }}>
                {pill}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PAIN POINTS ─── */}
      <section className="section-pad" style={{ padding: '80px 40px', background: RAISED }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: 12, color: TEXT }}>
              Why Procore Users Are Switching
            </h2>
            <div style={{ width: 60, height: 4, background: `linear-gradient(90deg, ${GOLD}, #F5D060)`, borderRadius: 2, margin: '0 auto' }} />
            <p style={{ color: DIM, marginTop: 16, fontSize: '1.05rem' }}>
              You&apos;re not alone. These are the complaints we hear every week.
            </p>
          </div>

          <div className="pain-grid">
            {[
              {
                icon: '💸',
                title: 'Per-Seat Pricing That Never Stops',
                body: 'Procore charges per user. Add 5 people to a project? That\'s $500+/mo more. We charge one flat rate for your whole company — forever.',
              },
              {
                icon: '📅',
                title: '6-Month Implementation Hell',
                body: 'Procore\'s average implementation takes 4–6 months and requires a dedicated admin. We go live in 1 day. No consultants. No training contracts.',
              },
              {
                icon: '🤖',
                title: 'No Real AI Features',
                body: 'Procore added AI branding but has no blueprint takeoff, no bid intelligence, no automated workflows. We built AI from day one — it\'s in every module.',
              },
              {
                icon: '📱',
                title: 'App Store Required for Field Crews',
                body: 'Procore requires App Store installation, IT approval, and device management. Our field app installs in 30 seconds — no App Store, no IT ticket.',
              },
              {
                icon: '📄',
                title: 'PDF Lien Waivers Still',
                body: 'Procore still uses PDF lien waivers with manual tracking. We send, sign, and track lien waivers digitally in all 50 states — with auto-reminders.',
              },
              {
                icon: '🏗️',
                title: 'No Certified Payroll',
                body: 'Procore doesn\'t generate WH-347 certified payroll. We generate DOL-compliant reports automatically with live Davis-Bacon wage rates built in.',
              },
            ].map((card) => (
              <div key={card.title} className="pain-card">
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: 'rgba(239,68,68,0.12)',
                    border: `1px solid rgba(239,68,68,0.25)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.2rem', flexShrink: 0,
                  }}>
                    {card.icon}
                  </div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: TEXT, lineHeight: 1.3 }}>
                    {card.title}
                  </h3>
                </div>
                <p style={{ color: DIM, fontSize: '0.92rem', lineHeight: 1.65 }}>{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── COMPARISON TABLE ─── */}
      <section id="comparison" className="section-pad" style={{ padding: '80px 40px', background: DARK }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: 12, color: TEXT }}>
              Saguaro vs. Procore: The Real Numbers
            </h2>
            <div style={{ width: 60, height: 4, background: `linear-gradient(90deg, ${GOLD}, #F5D060)`, borderRadius: 2, margin: '0 auto' }} />
            <p style={{ color: DIM, marginTop: 16, fontSize: '1.05rem' }}>
              No marketing fluff. Just a straight-up feature comparison.
            </p>
          </div>

          <div className="comparison-wrapper" style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
            <table className="comparison-table">
              <thead>
                <tr>
                  <th style={{
                    background: RAISED, padding: '16px 24px',
                    textAlign: 'left', color: DIM, fontWeight: 600,
                    fontSize: '0.85rem', letterSpacing: '0.06em', textTransform: 'uppercase',
                    borderBottom: `1px solid ${BORDER}`,
                  }}>
                    Feature
                  </th>
                  <th style={{
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(245,158,11,0.08) 100%)',
                    padding: '16px 24px', textAlign: 'center',
                    borderBottom: `2px solid ${GOLD}`,
                    borderLeft: `1px solid rgba(245,158,11,0.3)`,
                  }}>
                    <span style={{ ...goldGradientText, fontWeight: 800, fontSize: '1.05rem' }}>Saguaro</span>
                    <div style={{ fontSize: '0.75rem', color: DIM, fontWeight: 500, marginTop: 2 }}>$299/mo flat</div>
                  </th>
                  <th style={{
                    background: 'rgba(30,58,95,0.2)', padding: '16px 24px', textAlign: 'center',
                    borderBottom: `1px solid ${BORDER}`,
                    borderLeft: `1px solid ${BORDER}`,
                    color: DIM, fontWeight: 700, fontSize: '1.05rem',
                  }}>
                    Procore
                    <div style={{ fontSize: '0.75rem', fontWeight: 500, marginTop: 2 }}>$1,850+/mo per seat</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Monthly Cost', '$299 flat (whole team)', '$1,850+ per seat', true, false],
                  ['Setup Time', '1 business day', '4–6 months', true, false],
                  ['AI Blueprint Takeoff', 'Included', 'Not available', true, false],
                  ['Field App', 'Free, no App Store', 'Requires App Store + IT', true, false],
                  ['Lien Waivers (50 states)', 'Digital, included', 'PDF manual only', true, false],
                  ['Certified Payroll WH-347', 'Auto-generated', 'Not included', true, false],
                  ['AIA G702/G703 Pay Apps', 'One-click generate', 'Extra cost add-on', true, false],
                  ['Bid Intelligence AI', 'Win-rate scoring', 'Not available', true, false],
                  ['Contract', 'Month-to-month', 'Annual required', true, false],
                  ['Support', 'Live chat + phone', 'Ticket system', true, false],
                  ['Data Migration Help', 'Free, included', 'Extra cost', true, false],
                ].map(([feature, saguaro, procore, saguaroGood, _]) => (
                  <tr key={feature as string}>
                    <td style={{
                      padding: '15px 24px', borderBottom: `1px solid ${BORDER}`,
                      color: TEXT, fontWeight: 600, fontSize: '0.9rem',
                      background: RAISED,
                    }}>
                      {feature as string}
                    </td>
                    <td style={{
                      padding: '15px 24px', textAlign: 'center',
                      borderBottom: `1px solid rgba(245,158,11,0.15)`,
                      borderLeft: `1px solid rgba(245,158,11,0.2)`,
                      background: 'rgba(245,158,11,0.04)',
                      fontSize: '0.9rem',
                    }}>
                      <span style={{ color: GREEN, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '1rem' }}>✓</span> {saguaro as string}
                      </span>
                    </td>
                    <td style={{
                      padding: '15px 24px', textAlign: 'center',
                      borderBottom: `1px solid ${BORDER}`,
                      borderLeft: `1px solid ${BORDER}`,
                      fontSize: '0.9rem',
                    }}>
                      <span style={{ color: RED, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '1rem' }}>✗</span> {procore as string}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─── MIGRATION STEPS ─── */}
      <section className="section-pad" style={{ padding: '80px 40px', background: RAISED }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: 12, color: TEXT }}>
              Switching Takes 1 Day, Not 6 Months
            </h2>
            <div style={{ width: 60, height: 4, background: `linear-gradient(90deg, ${GOLD}, #F5D060)`, borderRadius: 2, margin: '0 auto' }} />
            <p style={{ color: DIM, marginTop: 16, fontSize: '1.05rem' }}>
              We&apos;ve done this hundreds of times. Here&apos;s exactly how it works.
            </p>
          </div>

          <div style={{ position: 'relative' }}>
            {/* Connector line */}
            <div className="step-number-line" style={{
              position: 'absolute', top: 40, left: '12.5%', right: '12.5%',
              height: 2,
              background: `linear-gradient(90deg, transparent, ${GOLD}, ${GOLD}, ${GOLD}, transparent)`,
              opacity: 0.3, zIndex: 0,
            }} />
            <div className="steps-grid">
              {[
                {
                  n: 1,
                  title: 'Sign Up Free',
                  body: 'Create your account in 2 minutes. No credit card required. No contracts. No commitments.',
                },
                {
                  n: 2,
                  title: 'Export from Procore',
                  body: 'We give you a step-by-step guide to export everything. Takes about 30 minutes. We walk you through it.',
                },
                {
                  n: 3,
                  title: 'We Import It All',
                  body: 'Our team migrates your projects, contacts, and documents. You do nothing. We handle every detail.',
                },
                {
                  n: 4,
                  title: 'Go Live Tomorrow',
                  body: 'Your whole team is up and running with training complete. We stay until you\'re fully confident.',
                },
              ].map((step) => (
                <div key={step.n} className="step-card">
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${GOLD}, #D97706)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 20px',
                    fontWeight: 800, fontSize: '1.3rem', color: DARK,
                    position: 'relative', zIndex: 1,
                    boxShadow: `0 0 20px rgba(245,158,11,0.35)`,
                  }}>
                    {step.n}
                  </div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: TEXT, marginBottom: 12 }}>
                    {step.title}
                  </h3>
                  <p style={{ color: DIM, fontSize: '0.92rem', lineHeight: 1.65 }}>{step.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: 48 }}>
            <Link href="/signup" className="btn-amber" style={{ padding: '14px 32px', fontSize: '1rem', borderRadius: 10 }}>
              Start My Free Migration
            </Link>
          </div>
        </div>
      </section>

      {/* ─── COST CALCULATOR ─── */}
      <section className="section-pad" style={{ padding: '80px 40px', background: DARK }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: 12, color: TEXT }}>
              See Exactly How Much You&apos;ll Save
            </h2>
            <div style={{ width: 60, height: 4, background: `linear-gradient(90deg, ${GOLD}, #F5D060)`, borderRadius: 2, margin: '0 auto' }} />
            <p style={{ color: DIM, marginTop: 16, fontSize: '1.05rem' }}>
              Plug in your numbers. The math will speak for itself.
            </p>
          </div>

          <div style={{
            background: RAISED, border: `1px solid ${BORDER}`,
            borderRadius: 20, padding: '48px 40px',
            boxShadow: '0 0 60px rgba(245,158,11,0.06)',
          }}>
            <div className="calc-inputs">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                <label style={{ color: DIM, fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Your Team Size
                </label>
                <input
                  type="number"
                  className="calc-input-field"
                  value={teamSize}
                  min={1}
                  onChange={(e) => setTeamSize(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <span style={{ color: DIM, fontSize: '0.78rem' }}>users</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                <label style={{ color: DIM, fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Current Procore Cost
                </label>
                <input
                  type="number"
                  className="calc-input-field"
                  value={procoreMonthly}
                  min={0}
                  step={50}
                  onChange={(e) => setProcoreMonthly(Math.max(0, parseInt(e.target.value) || 0))}
                />
                <span style={{ color: DIM, fontSize: '0.78rem' }}>per month</span>
              </div>
            </div>

            {/* Savings display */}
            <div style={{ margin: '40px 0 32px', padding: '28px', background: 'rgba(245,158,11,0.07)', borderRadius: 14, border: `1px solid rgba(245,158,11,0.2)` }}>
              <div style={{ fontSize: '0.85rem', color: DIM, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
                You save
              </div>
              <div style={{
                fontSize: '3.5rem', fontWeight: 900, lineHeight: 1,
                ...goldGradientText,
                marginBottom: 8,
              }}>
                {savings > 0 ? formatCurrency(savings) : '$0'}/month
              </div>
              {savings <= 0 && (
                <div style={{ color: DIM, fontSize: '0.9rem', marginTop: 8 }}>
                  Enter your Procore cost above to see your savings
                </div>
              )}
            </div>

            {savings > 0 && (
              <div className="savings-display">
                <div style={{
                  flex: 1, minWidth: 140,
                  background: 'rgba(34,197,94,0.06)',
                  border: `1px solid rgba(34,197,94,0.2)`,
                  borderRadius: 12, padding: '20px 16px', textAlign: 'center',
                }}>
                  <div style={{ color: GREEN, fontSize: '1.8rem', fontWeight: 800 }}>
                    {formatCurrency(annualSavings)}
                  </div>
                  <div style={{ color: DIM, fontSize: '0.82rem', marginTop: 4 }}>per year</div>
                </div>
                <div style={{
                  flex: 1, minWidth: 140,
                  background: 'rgba(34,197,94,0.06)',
                  border: `1px solid rgba(34,197,94,0.2)`,
                  borderRadius: 12, padding: '20px 16px', textAlign: 'center',
                }}>
                  <div style={{ color: GREEN, fontSize: '1.8rem', fontWeight: 800 }}>
                    {formatCurrency(fiveYearSavings)}
                  </div>
                  <div style={{ color: DIM, fontSize: '0.82rem', marginTop: 4 }}>over 5 years</div>
                </div>
                <div style={{
                  flex: 1, minWidth: 140,
                  background: 'rgba(245,158,11,0.06)',
                  border: `1px solid rgba(245,158,11,0.2)`,
                  borderRadius: 12, padding: '20px 16px', textAlign: 'center',
                }}>
                  <div style={{ ...goldGradientText, fontSize: '1.8rem', fontWeight: 800 }}>
                    {formatCurrency(saguaroMonthlyCost)}
                  </div>
                  <div style={{ color: DIM, fontSize: '0.82rem', marginTop: 4 }}>Saguaro flat rate</div>
                </div>
              </div>
            )}

            <div style={{ marginTop: 36 }}>
              <Link href="/signup" className="btn-amber" style={{ padding: '16px 40px', fontSize: '1.05rem', borderRadius: 12, width: '100%', textAlign: 'center' }}>
                Claim Your Savings — Start Free
              </Link>
              <p style={{ color: DIM, fontSize: '0.78rem', marginTop: 12 }}>
                No credit card. No contracts. Free 30-day trial.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section className="section-pad" style={{ padding: '80px 40px', background: RAISED }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: 12, color: TEXT }}>
              From Procore to Saguaro: Real Stories
            </h2>
            <div style={{ width: 60, height: 4, background: `linear-gradient(90deg, ${GOLD}, #F5D060)`, borderRadius: 2, margin: '0 auto' }} />
            <p style={{ color: DIM, marginTop: 16, fontSize: '1.05rem' }}>
              Hear directly from GC teams who made the move.
            </p>
          </div>

          <div className="testimonials-grid">
            {[
              {
                quote: 'We were paying Procore $2,200/month and had to hire a consultant just to set it up. With Saguaro, I had my whole team running in one afternoon. The AI takeoff alone saves us 4 hours per bid.',
                name: 'David K.',
                title: 'Owner',
                location: 'Denver, CO',
                tag: 'Switched from Procore',
                initials: 'DK',
              },
              {
                quote: 'The certified payroll feature sold me. Procore doesn\'t even offer it. We do 8–10 prevailing wage jobs a year — this saves us $3,000 in admin time every single month.',
                name: 'Marcus T.',
                title: 'Project Manager',
                location: 'Phoenix, AZ',
                tag: 'Prevailing Wage GC',
                initials: 'MT',
              },
              {
                quote: 'I was nervous about switching mid-year. Their migration team moved everything over on a Friday. Monday morning, we were fully running on Saguaro. My crew loves the field app.',
                name: 'Carlos M.',
                title: 'Superintendent',
                location: 'San Antonio, TX',
                tag: 'Mid-Year Migration',
                initials: 'CM',
              },
            ].map((t) => (
              <div key={t.name} className="testimonial-card">
                <div style={{
                  fontSize: '3rem', lineHeight: 1, color: GOLD, opacity: 0.3,
                  fontFamily: 'Georgia, serif', marginBottom: 16,
                }}>
                  &ldquo;
                </div>
                <p style={{ color: TEXT, fontSize: '0.95rem', lineHeight: 1.7, marginBottom: 24, fontStyle: 'italic' }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${GOLD}, #D97706)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '0.9rem', color: DARK, flexShrink: 0,
                  }}>
                    {t.initials}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: TEXT, fontSize: '0.95rem' }}>{t.name}</div>
                    <div style={{ color: DIM, fontSize: '0.82rem' }}>{t.title} · {t.location}</div>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <span style={{
                      background: 'rgba(245,158,11,0.1)',
                      border: `1px solid rgba(245,158,11,0.25)`,
                      borderRadius: 999, padding: '4px 10px',
                      fontSize: '0.72rem', fontWeight: 600, color: GOLD,
                    }}>
                      {t.tag}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section style={{
        background: `linear-gradient(135deg, #1a0f00 0%, #0d1117 40%, #0d1117 60%, #1a0f00 100%)`,
        borderTop: `1px solid rgba(245,158,11,0.2)`,
        borderBottom: `1px solid rgba(245,158,11,0.2)`,
        padding: '90px 40px',
        position: 'relative', overflow: 'hidden',
        textAlign: 'center',
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 800, height: 400,
          background: 'radial-gradient(ellipse, rgba(245,158,11,0.1) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto' }}>
          <h2 style={{ fontSize: '2.6rem', fontWeight: 900, marginBottom: 16, lineHeight: 1.2, ...goldGradientText }}>
            Ready to Make the Switch?
          </h2>
          <p style={{ fontSize: '1.1rem', color: DIM, marginBottom: 40, lineHeight: 1.65 }}>
            Join 500+ GC teams who already did. Free trial, free migration, cancel anytime. We handle every step.
          </p>

          <Link href="/signup" style={{
            display: 'inline-block',
            background: DARK,
            color: GOLD,
            fontWeight: 800,
            fontSize: '1.15rem',
            padding: '18px 44px',
            borderRadius: 12,
            textDecoration: 'none',
            border: `2px solid ${GOLD}`,
            transition: 'all 0.15s',
            boxShadow: `0 0 40px rgba(245,158,11,0.2)`,
          }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = GOLD;
              (e.currentTarget as HTMLAnchorElement).style.color = DARK;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = DARK;
              (e.currentTarget as HTMLAnchorElement).style.color = GOLD;
            }}
          >
            Start Free Trial
          </Link>

          <div className="trust-pills" style={{ marginTop: 36 }}>
            {[
              '✓ Free data migration',
              '✓ 30-day trial',
              '✓ No credit card',
              '✓ Cancel anytime',
              '✓ Live onboarding call',
            ].map((pill) => (
              <span key={pill} style={{
                background: 'rgba(34,197,94,0.08)',
                border: `1px solid rgba(34,197,94,0.2)`,
                borderRadius: 999, padding: '7px 16px',
                fontSize: '0.82rem', fontWeight: 600, color: GREEN,
              }}>
                {pill}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer style={{
        background: RAISED, borderTop: `1px solid ${BORDER}`,
        padding: '40px 40px', textAlign: 'center',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ marginBottom: 24 }}>
            <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
              <img src="/logo-full.jpg" alt="Saguaro" style={{ height: 40, mixBlendMode: 'screen' }} />
            </Link>
          </div>
          <div className="footer-links" style={{ marginBottom: 20 }}>
            {[
              { label: 'Privacy', href: '/privacy' },
              { label: 'Terms', href: '/terms' },
              { label: 'Pricing', href: '/pricing' },
              { label: 'Compare Procore', href: '/compare/procore' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                style={{ color: DIM, textDecoration: 'none', fontSize: '0.88rem', transition: 'color 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = GOLD)}
                onMouseLeave={(e) => (e.currentTarget.style.color = DIM)}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <p style={{ color: '#475569', fontSize: '0.82rem' }}>
            &copy; {new Date().getFullYear()} Saguaro Construction Software. All rights reserved.
          </p>
        </div>
      </footer>
    </>
  );
}
