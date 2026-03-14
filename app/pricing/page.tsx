'use client';
import React, { useState } from 'react';

const C = {
  dark: '#0d1117',
  gold: '#F59E0B',
  text: '#F8FAFC',
  dim: '#CBD5E1',
  border: '#1E3A5F',
  raised: '#0F172A',
  green: '#22c55e',
  font: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Features', href: '/features' },
  { label: 'Field App', href: '/field' },
  { label: 'Compare', href: '/compare' },
  { label: 'How It Works', href: '/how-it-works' },
];

const PLANS = [
  {
    name: 'Starter',
    price_mo: 199,
    price_yr: 166,
    tagline: 'For small GCs getting off spreadsheets',
    popular: false,
    cta: 'Start Free Trial',
    cta_href: '/signup',
    features: [
      'Up to 10 active projects',
      'Unlimited users',
      'AI Takeoff — 50 pages/mo',
      'Pay Applications G702/G703',
      'Lien Waivers — all 50 states',
      'Basic RFI & Change Orders',
      'Mobile Field App (Saguaro Field)',
      'Email support',
    ],
    not_included: [
      'Certified Payroll WH-347',
      'ACORD 25 Insurance Tracker',
      'Owner & Sub Portals',
      'Bid Intelligence',
      'White Label',
      'API Integrations',
    ],
  },
  {
    name: 'Professional',
    price_mo: 399,
    price_yr: 332,
    tagline: 'For growing GCs managing multiple projects',
    popular: true,
    cta: 'Start Free Trial',
    cta_href: '/signup',
    features: [
      'Unlimited active projects',
      'Unlimited users',
      'Unlimited AI Takeoff pages',
      'All AIA Documents (G702-G706, A310, A312)',
      'All 4 Lien Waiver types — all 50 states',
      'Certified Payroll WH-347 + DOL wage lookup',
      'ACORD 25 Insurance Tracker + COI Parser',
      'OSHA 300 Log',
      'Preliminary Notices AZ/CA/TX',
      'Owner & Sub Portals',
      'Autopilot RFI/CO automation',
      'Bid Intelligence + Jacket Generator',
      'Priority email + chat support',
    ],
    not_included: [
      'White Label your brand/domain',
      'Custom API integrations',
      'SAML SSO',
    ],
  },
  {
    name: 'Enterprise',
    price_mo: 0,
    price_yr: 0,
    tagline: 'For ENR 400 firms, large GCs & resellers',
    popular: false,
    cta: 'Contact Sales',
    cta_href: 'mailto:sales@saguarocontrol.net',
    features: [
      'Everything in Professional',
      'White Label your brand/domain',
      'Unlimited sandbox accounts',
      'Custom API integrations',
      'QuickBooks sync',
      'Dedicated account manager',
      'SLA — 99.9% uptime guarantee',
      'Custom contract & invoicing',
      'SAML SSO',
      'Custom onboarding + training',
    ],
    not_included: [],
  },
];

const COMPARISON_FEATURES = [
  { label: 'Active Projects', starter: '10', pro: 'Unlimited', ent: 'Unlimited' },
  { label: 'Users / Seats', starter: 'Unlimited', pro: 'Unlimited', ent: 'Unlimited' },
  { label: 'AI Takeoff', starter: '50 pages/mo', pro: 'Unlimited', ent: 'Unlimited' },
  { label: 'Pay Apps G702/G703', starter: true, pro: true, ent: true },
  { label: 'All AIA Documents', starter: false, pro: true, ent: true },
  { label: 'Lien Waivers — all 50 states', starter: true, pro: true, ent: true },
  { label: 'All 4 Lien Waiver types', starter: false, pro: true, ent: true },
  { label: 'Certified Payroll WH-347', starter: false, pro: true, ent: true },
  { label: 'ACORD 25 / COI Parser', starter: false, pro: true, ent: true },
  { label: 'Owner & Sub Portals', starter: false, pro: true, ent: true },
  { label: 'Autopilot RFI/CO', starter: false, pro: true, ent: true },
  { label: 'Preliminary Notices', starter: false, pro: true, ent: true },
  { label: 'White Label', starter: false, pro: false, ent: true },
  { label: 'Custom API Integrations', starter: false, pro: false, ent: true },
  { label: 'SAML SSO', starter: false, pro: false, ent: true },
];

const FAQS = [
  {
    q: 'Is it really unlimited users?',
    a: 'Yes. One flat license covers every person on your team — PMs, field supers, estimators, accounting — all included at no extra cost. We will never charge you per seat.',
  },
  {
    q: 'What happens after the 30-day free trial?',
    a: "You'll be prompted to enter payment info. If you choose not to, your account pauses with data preserved for 30 days before deletion. There are no surprise charges.",
  },
  {
    q: 'Do you support prevailing wage projects?',
    a: 'Yes. The WH-347 Certified Payroll generator connects to the DOL Davis-Bacon wage API and validates every worker\'s hourly rate against current prevailing wages for their trade and county.',
  },
  {
    q: 'Which states are supported for lien waivers?',
    a: 'All 50 states. AZ, CA, TX, NV, FL, CO, WA, OR, UT, and NM use state-specific statutory language. All other states use our attorney-reviewed generic form.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel anytime from your billing settings. You retain access until the end of your current billing period. There are no cancellation fees.',
  },
  {
    q: 'What is the White Label plan?',
    a: 'Your GC firm or software company can resell Saguaro under your own brand, domain, and logo. Each of your clients receives their own sandboxed account. Contact us for custom pricing.',
  },
  {
    q: 'Do you integrate with QuickBooks?',
    a: 'QuickBooks sync is available on Enterprise. Budget line items, pay applications, and change orders sync bidirectionally with your QuickBooks company file.',
  },
  {
    q: 'Is my data secure?',
    a: 'All data is encrypted at rest and in transit. Hosted on Supabase with row-level security enforced on every query. SOC 2 audit in progress. We never sell or share your data.',
  },
];

function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="8" cy="8" r="8" fill="rgba(34,197,94,0.15)" />
      <path d="M4.5 8l2.5 2.5 4-5" stroke={C.green} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="8" cy="8" r="8" fill="rgba(203,213,225,0.07)" />
      <path d="M5 8h6" stroke="#475569" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ComparisonCell({ value }: { value: boolean | string }) {
  if (typeof value === 'string') {
    return <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{value}</span>;
  }
  return value ? <CheckIcon size={18} /> : <DashIcon size={18} />;
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: C.dark, color: C.text, fontFamily: C.font }}>

      {/* ── Fixed Nav ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        height: 64, background: 'rgba(13,17,23,0.85)',
        borderBottom: `1px solid ${C.border}`,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center',
        padding: '0 32px', gap: 0,
      }}>
        {/* Logo */}
        <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0, marginRight: 40 }}>
          <img
            src="/logo-full.jpg"
            alt="Saguaro CRM"
            style={{ height: 36, width: 'auto', mixBlendMode: 'screen', objectFit: 'contain' }}
          />
        </a>

        {/* Nav Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
          {NAV_LINKS.map(link => (
            <a
              key={link.label}
              href={link.href}
              style={{
                padding: '6px 12px', borderRadius: 6,
                color: C.dim, fontSize: 14, fontWeight: 500,
                textDecoration: 'none', transition: 'color .15s',
                letterSpacing: 0.1,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.dim)}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Auth Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/login" style={{
            padding: '8px 18px',
            background: 'rgba(245,158,11,0.08)',
            border: `1px solid rgba(245,158,11,0.25)`,
            borderRadius: 8, color: C.gold,
            fontSize: 13, fontWeight: 700,
            textDecoration: 'none', letterSpacing: 0.2,
          }}>
            Log In
          </a>
          <a href="/signup" style={{
            padding: '8px 18px',
            background: `linear-gradient(135deg, ${C.gold}, #FCD34D)`,
            borderRadius: 8, color: '#0d1117',
            fontSize: 13, fontWeight: 800,
            textDecoration: 'none', letterSpacing: 0.2,
            boxShadow: `0 0 20px rgba(245,158,11,0.25)`,
          }}>
            Free Trial
          </a>
        </div>
      </nav>

      {/* ── Page Body ── */}
      <div style={{ paddingTop: 64 }}>

        {/* ── Hero Section ── */}
        <section style={{
          textAlign: 'center', padding: '88px 24px 64px',
          background: `radial-gradient(ellipse 900px 500px at 50% 0%, rgba(245,158,11,0.07) 0%, transparent 70%)`,
        }}>
          <div style={{
            display: 'inline-block',
            padding: '5px 14px',
            background: 'rgba(245,158,11,0.1)',
            border: `1px solid rgba(245,158,11,0.3)`,
            borderRadius: 20,
            fontSize: 12, fontWeight: 700, color: C.gold,
            letterSpacing: 1.5, textTransform: 'uppercase',
            marginBottom: 24,
          }}>
            Simple, Transparent Pricing
          </div>

          <h1 style={{
            fontSize: 'clamp(40px, 6vw, 68px)',
            fontWeight: 900, lineHeight: 1.08,
            margin: '0 0 20px', letterSpacing: -1.5,
          }}>
            One Platform.{' '}
            <span style={{
              background: `linear-gradient(135deg, ${C.gold}, #FCD34D)`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Your Whole Team.
            </span>
          </h1>

          <p style={{
            fontSize: 'clamp(16px, 2vw, 20px)',
            color: C.dim, maxWidth: 560,
            margin: '0 auto 36px', lineHeight: 1.65, fontWeight: 400,
          }}>
            Flat pricing. No per-seat fees. No module upgrades. No surprise charges.
            Every feature included — from day one.
          </p>

          {/* Monthly / Annual Toggle */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: C.raised, borderRadius: 10,
            padding: '4px', border: `1px solid ${C.border}`,
            marginBottom: 40,
          }}>
            <button
              onClick={() => setAnnual(false)}
              style={{
                padding: '8px 22px', borderRadius: 7, border: 'none',
                background: !annual ? 'rgba(245,158,11,0.15)' : 'transparent',
                color: !annual ? C.gold : C.dim,
                fontWeight: 700, fontSize: 14, cursor: 'pointer',
                transition: 'all .2s',
                outline: !annual ? `1px solid rgba(245,158,11,0.3)` : 'none',
              }}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              style={{
                padding: '8px 22px', borderRadius: 7, border: 'none',
                background: annual ? 'rgba(245,158,11,0.15)' : 'transparent',
                color: annual ? C.gold : C.dim,
                fontWeight: 700, fontSize: 14, cursor: 'pointer',
                transition: 'all .2s',
                outline: annual ? `1px solid rgba(245,158,11,0.3)` : 'none',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              Annual
              <span style={{
                fontSize: 11, fontWeight: 800, color: C.green,
                background: 'rgba(34,197,94,0.12)',
                border: '1px solid rgba(34,197,94,0.25)',
                padding: '1px 7px', borderRadius: 10,
              }}>
                SAVE 17%
              </span>
            </button>
          </div>

          {/* Trust Stats */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap' }}>
            {[
              { stat: '500+', label: 'GC teams active' },
              { stat: '30-day', label: 'free trial' },
              { stat: 'No credit card', label: 'required' },
            ].map(item => (
              <div key={item.stat} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{item.stat}</div>
                <div style={{ fontSize: 12, color: C.dim, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.8 }}>{item.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pricing Cards ── */}
        <section style={{ padding: '0 24px 80px', maxWidth: 1160, margin: '0 auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 24, alignItems: 'start',
          }}>
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                style={{
                  background: plan.popular
                    ? 'linear-gradient(180deg, #111827 0%, #0F172A 100%)'
                    : C.raised,
                  border: `1.5px solid ${plan.popular ? C.gold : C.border}`,
                  borderRadius: 16,
                  overflow: 'hidden',
                  position: 'relative',
                  boxShadow: plan.popular
                    ? `0 0 0 1px rgba(245,158,11,0.2), 0 24px 48px rgba(0,0,0,0.5), 0 0 80px rgba(245,158,11,0.06)`
                    : '0 4px 24px rgba(0,0,0,0.3)',
                }}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <div style={{
                    background: `linear-gradient(90deg, ${C.gold}, #FCD34D)`,
                    textAlign: 'center', padding: '7px 0',
                    fontSize: 11, fontWeight: 800, color: '#0d1117',
                    letterSpacing: 2, textTransform: 'uppercase',
                  }}>
                    Most Popular
                  </div>
                )}

                <div style={{ padding: '30px 28px 28px' }}>
                  {/* Plan Name */}
                  <div style={{
                    fontSize: 11, fontWeight: 800, letterSpacing: 2,
                    textTransform: 'uppercase',
                    color: plan.popular ? C.gold : C.dim,
                    marginBottom: 4,
                  }}>
                    {plan.name}
                  </div>

                  {/* Tagline */}
                  <div style={{ fontSize: 13, color: C.dim, marginBottom: 24, lineHeight: 1.5 }}>
                    {plan.tagline}
                  </div>

                  {/* Price */}
                  {plan.price_mo > 0 ? (
                    <div style={{ marginBottom: 28 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 4 }}>
                        <span style={{ fontSize: 52, fontWeight: 900, color: C.text, lineHeight: 1 }}>
                          ${annual ? plan.price_yr : plan.price_mo}
                        </span>
                        <span style={{ fontSize: 15, color: C.dim, paddingBottom: 8 }}>/mo</span>
                      </div>
                      {annual ? (
                        <div style={{ fontSize: 12, color: C.dim }}>
                          Billed annually &mdash;{' '}
                          <span style={{ color: C.green, fontWeight: 600 }}>
                            save ${(plan.price_mo - plan.price_yr) * 12}/yr
                          </span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: C.dim }}>
                          Or{' '}
                          <span style={{ color: C.green, fontWeight: 600 }}>${plan.price_yr}/mo</span>
                          {' '}billed annually
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginBottom: 28 }}>
                      <div style={{ fontSize: 30, fontWeight: 900, color: C.text, lineHeight: 1, marginBottom: 6 }}>
                        Contact Sales
                      </div>
                      <div style={{ fontSize: 12, color: C.dim }}>Custom pricing for your scale</div>
                    </div>
                  )}

                  {/* CTA */}
                  <a
                    href={plan.cta_href}
                    style={{
                      display: 'block', textAlign: 'center',
                      padding: '13px 0',
                      background: plan.popular
                        ? `linear-gradient(135deg, ${C.gold}, #FCD34D)`
                        : plan.name === 'Enterprise'
                        ? 'transparent'
                        : 'rgba(255,255,255,0.05)',
                      border: plan.popular
                        ? 'none'
                        : `1.5px solid ${plan.name === 'Enterprise' ? C.gold : C.border}`,
                      borderRadius: 9,
                      color: plan.popular ? '#0d1117' : plan.name === 'Enterprise' ? C.gold : C.text,
                      fontWeight: 800, fontSize: 14,
                      textDecoration: 'none',
                      marginBottom: 28,
                      letterSpacing: 0.3,
                      boxShadow: plan.popular ? `0 4px 16px rgba(245,158,11,0.3)` : 'none',
                    }}
                  >
                    {plan.cta}
                  </a>

                  {/* Divider */}
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>
                      {plan.name === 'Enterprise' ? 'Everything in Professional, plus:' : "What's included:"}
                    </div>

                    {/* Included Features */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {plan.features.map(f => (
                        <div key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <CheckIcon size={16} />
                          <span style={{ fontSize: 13, color: C.text, lineHeight: 1.45 }}>{f}</span>
                        </div>
                      ))}

                      {/* Not Included */}
                      {plan.not_included.map(f => (
                        <div key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', opacity: 0.38 }}>
                          <DashIcon size={16} />
                          <span style={{ fontSize: 13, color: C.dim, lineHeight: 1.45 }}>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Feature Comparison Table ── */}
        <section style={{ padding: '0 24px 96px', maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{
              display: 'inline-block', padding: '5px 14px',
              background: 'rgba(245,158,11,0.08)',
              border: `1px solid rgba(245,158,11,0.2)`,
              borderRadius: 20, fontSize: 11, fontWeight: 700,
              color: C.gold, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16,
            }}>
              Full Comparison
            </div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
              Everything, side by side
            </h2>
          </div>

          <div style={{
            background: C.raised, border: `1px solid ${C.border}`,
            borderRadius: 16, overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              {/* Header */}
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: '20px 24px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: C.dim, width: '40%' }}>
                    Feature
                  </th>
                  {['Starter', 'Professional', 'Enterprise'].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: '20px 16px', textAlign: 'center',
                        fontWeight: 800, fontSize: 13,
                        color: col === 'Professional' ? C.gold : C.text,
                        background: col === 'Professional' ? 'rgba(245,158,11,0.05)' : 'transparent',
                        borderLeft: col === 'Professional' ? `1px solid rgba(245,158,11,0.15)` : `1px solid ${C.border}`,
                        borderRight: col === 'Professional' ? `1px solid rgba(245,158,11,0.15)` : undefined,
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_FEATURES.map((row, i) => (
                  <tr
                    key={row.label}
                    style={{ borderBottom: i < COMPARISON_FEATURES.length - 1 ? `1px solid rgba(30,58,95,0.5)` : 'none' }}
                  >
                    <td style={{ padding: '14px 24px', fontSize: 13, color: C.dim, fontWeight: 500 }}>
                      {row.label}
                    </td>
                    {(['starter', 'pro', 'ent'] as const).map((key) => (
                      <td
                        key={key}
                        style={{
                          padding: '14px 16px', textAlign: 'center',
                          verticalAlign: 'middle',
                          background: key === 'pro' ? 'rgba(245,158,11,0.03)' : 'transparent',
                          borderLeft: key === 'pro' ? `1px solid rgba(245,158,11,0.12)` : `1px solid rgba(30,58,95,0.4)`,
                          borderRight: key === 'pro' ? `1px solid rgba(245,158,11,0.12)` : undefined,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <ComparisonCell value={row[key]} />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Why Flat Pricing ── */}
        <section style={{
          padding: '96px 24px',
          background: `linear-gradient(180deg, transparent 0%, rgba(15,23,42,0.6) 50%, transparent 100%)`,
          borderTop: `1px solid ${C.border}`,
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <div style={{
                display: 'inline-block', padding: '5px 14px',
                background: 'rgba(245,158,11,0.08)',
                border: `1px solid rgba(245,158,11,0.2)`,
                borderRadius: 20, fontSize: 11, fontWeight: 700,
                color: C.gold, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16,
              }}>
                Our Philosophy
              </div>
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, margin: '0 0 12px', letterSpacing: -0.5 }}>
                Why flat pricing?
              </h2>
              <p style={{ fontSize: 16, color: C.dim, maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
                Most construction software vendors punish growth. We built Saguaro differently.
              </p>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 24,
            }}>
              {[
                {
                  title: 'No per-seat fees. Ever.',
                  body: 'Add your whole team — field supers, PMs, estimators, accounting, owners — without ever watching the bill climb. Your license covers everyone.',
                  icon: (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke={C.gold} strokeWidth="2" strokeLinecap="round" />
                      <circle cx="9" cy="7" r="4" stroke={C.gold} strokeWidth="2" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke={C.gold} strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  ),
                },
                {
                  title: 'Month-to-month. No annual lock-in.',
                  body: 'Pay monthly and cancel anytime. Annual billing is available if you want the discount, but we never require it. Your business, your terms.',
                  icon: (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="4" width="18" height="18" rx="2" stroke={C.gold} strokeWidth="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" stroke={C.gold} strokeWidth="2" strokeLinecap="round" />
                      <path d="M9 16l2 2 4-4" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ),
                },
                {
                  title: 'Everything included. No module upgrades.',
                  body: 'Every document, every workflow, every compliance tool — all included in your plan. We will never lock a feature behind a separate module fee.',
                  icon: (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M9 12l2 2 4-4" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ),
                },
              ].map(card => (
                <div
                  key={card.title}
                  style={{
                    background: C.raised,
                    border: `1px solid ${C.border}`,
                    borderRadius: 14, padding: '32px 28px',
                  }}
                >
                  <div style={{
                    width: 52, height: 52,
                    background: 'rgba(245,158,11,0.08)',
                    border: `1px solid rgba(245,158,11,0.2)`,
                    borderRadius: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 20,
                  }}>
                    {card.icon}
                  </div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 10px', color: C.text, lineHeight: 1.3 }}>
                    {card.title}
                  </h3>
                  <p style={{ fontSize: 14, color: C.dim, margin: 0, lineHeight: 1.65 }}>
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Testimonials ── */}
        <section style={{ padding: '96px 24px', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{
              display: 'inline-block', padding: '5px 14px',
              background: 'rgba(245,158,11,0.08)',
              border: `1px solid rgba(245,158,11,0.2)`,
              borderRadius: 20, fontSize: 11, fontWeight: 700,
              color: C.gold, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16,
            }}>
              From the Field
            </div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
              GCs who made the switch
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 24,
          }}>
            {[
              {
                quote: "We were paying $340 per seat on our old platform. With Saguaro, we added 14 team members and our bill didn't change by a single dollar. That alone paid for the platform three times over.",
                name: 'Marcus T.',
                title: 'President, Tier 1 General Contracting',
                location: 'Phoenix, AZ',
                initials: 'MT',
              },
              {
                quote: "The pay app and lien waiver tools alone are worth the price. We closed out a $4.2M school project without touching a Word document. Everything generated, signed, and filed through Saguaro.",
                name: 'Rachel S.',
                title: 'Project Executive, Desert Build Group',
                location: 'Tucson, AZ',
                initials: 'RS',
              },
            ].map(t => (
              <div
                key={t.name}
                style={{
                  background: C.raised,
                  border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: '32px 28px',
                }}
              >
                {/* Stars */}
                <div style={{ display: 'flex', gap: 3, marginBottom: 20 }}>
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} width="16" height="16" viewBox="0 0 16 16" fill={C.gold}>
                      <path d="M8 1l1.8 3.6L14 5.6l-3 2.9.7 4.1L8 10.5l-3.7 2.1.7-4.1-3-2.9 4.2-.6z" />
                    </svg>
                  ))}
                </div>

                <blockquote style={{
                  margin: '0 0 28px', padding: 0,
                  fontSize: 15, color: C.text,
                  lineHeight: 1.7, fontStyle: 'italic',
                  borderLeft: `3px solid rgba(245,158,11,0.3)`,
                  paddingLeft: 16,
                }}>
                  "{t.quote}"
                </blockquote>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${C.gold}, #FCD34D)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 14, color: '#0d1117', flexShrink: 0,
                  }}>
                    {t.initials}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: C.dim }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: C.dim, marginTop: 1 }}>{t.location}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ── */}
        <section style={{
          padding: '0 24px 96px',
          maxWidth: 760, margin: '0 auto',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{
              display: 'inline-block', padding: '5px 14px',
              background: 'rgba(245,158,11,0.08)',
              border: `1px solid rgba(245,158,11,0.2)`,
              borderRadius: 20, fontSize: 11, fontWeight: 700,
              color: C.gold, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16,
            }}>
              FAQ
            </div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
              Frequently asked questions
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {FAQS.map((faq, i) => (
              <div
                key={i}
                style={{
                  borderBottom: i < FAQS.length - 1 ? `1px solid ${C.border}` : 'none',
                }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '22px 0',
                    background: 'none', border: 'none',
                    color: C.text, fontSize: 16, fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: 16, lineHeight: 1.4,
                    fontFamily: C.font,
                  }}
                >
                  <span>{faq.q}</span>
                  <span style={{
                    flexShrink: 0,
                    width: 28, height: 28,
                    background: openFaq === i ? `rgba(245,158,11,0.15)` : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${openFaq === i ? 'rgba(245,158,11,0.4)' : C.border}`,
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: C.gold, fontSize: 18, fontWeight: 300,
                    transition: 'all .2s',
                  }}>
                    {openFaq === i ? '−' : '+'}
                  </span>
                </button>
                {openFaq === i && (
                  <div style={{
                    padding: '0 0 22px',
                    fontSize: 15, color: C.dim, lineHeight: 1.75,
                    maxWidth: 640,
                  }}>
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section style={{
          padding: '96px 24px',
          background: `linear-gradient(180deg, transparent 0%, rgba(245,158,11,0.04) 50%, transparent 100%)`,
          borderTop: `1px solid ${C.border}`,
          textAlign: 'center',
        }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{
              fontSize: 'clamp(28px, 4vw, 44px)',
              fontWeight: 900, margin: '0 0 16px',
              lineHeight: 1.15, letterSpacing: -0.8,
            }}>
              Ready to stop leaving{' '}
              <span style={{
                background: `linear-gradient(135deg, ${C.gold}, #FCD34D)`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                money on the table?
              </span>
            </h2>
            <p style={{ fontSize: 17, color: C.dim, margin: '0 0 36px', lineHeight: 1.6 }}>
              Start your 30-day free trial. No credit card required.
              Cancel anytime. Your whole team, one flat rate.
            </p>

            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
              <a href="/signup" style={{
                display: 'inline-block', padding: '15px 36px',
                background: `linear-gradient(135deg, ${C.gold}, #FCD34D)`,
                borderRadius: 10, color: '#0d1117',
                fontWeight: 800, fontSize: 16,
                textDecoration: 'none', letterSpacing: 0.2,
                boxShadow: `0 4px 24px rgba(245,158,11,0.35)`,
              }}>
                Start Free Trial &rarr;
              </a>
              <a href="mailto:sales@saguarocontrol.net" style={{
                display: 'inline-block', padding: '15px 36px',
                background: 'transparent',
                border: `1.5px solid ${C.border}`,
                borderRadius: 10, color: C.text,
                fontWeight: 700, fontSize: 16,
                textDecoration: 'none', letterSpacing: 0.2,
              }}>
                Talk to Sales
              </a>
            </div>

            {/* Trust Pills */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {['30 days free', 'Cancel anytime', 'No per-seat fees', 'Unlimited users'].map(pill => (
                <div key={pill} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px',
                  background: 'rgba(34,197,94,0.07)',
                  border: `1px solid rgba(34,197,94,0.2)`,
                  borderRadius: 20,
                  fontSize: 12, fontWeight: 600, color: C.green,
                }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="6" fill="rgba(34,197,94,0.2)" />
                    <path d="M3.5 6l1.8 1.8 3-3.6" stroke={C.green} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {pill}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer style={{
          borderTop: `1px solid ${C.border}`,
          padding: '48px 32px',
          background: C.raised,
        }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              alignItems: 'center', gap: 32,
              flexWrap: 'wrap',
            }}>
              {/* Logo */}
              <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
                <img
                  src="/logo-full.jpg"
                  alt="Saguaro CRM"
                  style={{ height: 30, width: 'auto', mixBlendMode: 'screen', objectFit: 'contain' }}
                />
              </a>

              {/* Links */}
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
                {[
                  { label: 'Home', href: '/' },
                  { label: 'Features', href: '/features' },
                  { label: 'Field App', href: '/field' },
                  { label: 'Compare', href: '/compare' },
                  { label: 'How It Works', href: '/how-it-works' },
                  { label: 'Privacy', href: '/privacy' },
                  { label: 'Terms', href: '/terms' },
                ].map(link => (
                  <a key={link.label} href={link.href} style={{ fontSize: 13, color: C.dim, textDecoration: 'none', fontWeight: 500 }}>
                    {link.label}
                  </a>
                ))}
              </div>

              {/* Copyright */}
              <div style={{ fontSize: 12, color: C.dim, whiteSpace: 'nowrap' }}>
                &copy; {new Date().getFullYear()} Saguaro CRM
              </div>
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}
