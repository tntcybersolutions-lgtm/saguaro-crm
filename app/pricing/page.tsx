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
  blue: '#3B82F6',
  font: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Features', href: '/features' },
  { label: 'Field App', href: '/get-the-app' },
  { label: 'Compare', href: '/compare' },
  { label: 'Switch from Procore', href: '/switch-from-procore' },
];

const PLANS = [
  {
    name: 'Starter',
    price_mo: 299,
    price_yr: 249,
    tagline: 'For small GCs getting off spreadsheets',
    popular: false,
    cta: 'Start Free Trial',
    cta_href: '/signup',
    highlight: 'Best for 1–5 person teams',
    features: [
      'Up to 10 active projects',
      'Unlimited users',
      'AI Takeoff — 100 pages/mo',
      'Pay Applications G702/G703',
      'Lien Waivers — all 50 states',
      'Basic RFI & Change Orders',
      'Mobile Field App (Saguaro Field)',
      'Free migration from any platform',
      'Email support (48hr response)',
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
    price_mo: 599,
    price_yr: 499,
    tagline: 'For growing GCs managing multiple projects',
    popular: true,
    cta: 'Start Free Trial',
    cta_href: '/signup',
    highlight: 'Best for 5–50 person teams',
    features: [
      'Unlimited active projects',
      'Unlimited users',
      'Unlimited AI Takeoff pages',
      'All AIA Documents (G702–G706, A310, A312)',
      'All 4 Lien Waiver types — all 50 states',
      'Certified Payroll WH-347 + DOL wage lookup',
      'ACORD 25 Insurance Tracker + COI Parser',
      'OSHA 300 Log',
      'Preliminary Notices AZ/CA/TX',
      'Owner & Sub Portals',
      'Autopilot RFI/CO automation',
      'Bid Intelligence + Jacket Generator',
      'Free migration from any platform',
      'Priority chat + email support (4hr response)',
    ],
    not_included: [
      'White Label your brand/domain',
      'Custom API integrations',
      'SAML SSO',
      'Dedicated account manager',
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
    highlight: 'Custom pricing for 50+ person firms',
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
      'Free migration — we handle everything',
      'Phone support + 1hr response SLA',
    ],
    not_included: [],
  },
];

const ADDONS = [
  {
    name: 'Priority Support',
    price: 99,
    per: 'mo',
    description: 'Live chat + email with 4hr response. Dedicated support agent for your account.',
    icon: '💬',
    available: ['Starter'],
  },
  {
    name: 'Dedicated CSM',
    price: 299,
    per: 'mo',
    description: 'Named Customer Success Manager. Phone support, weekly check-ins, 1hr SLA.',
    icon: '🎯',
    available: ['Starter', 'Professional'],
  },
  {
    name: 'Extra AI Takeoff',
    price: 79,
    per: 'mo',
    description: '500 additional blueprint pages per month. Rolls over unused pages.',
    icon: '📐',
    available: ['Starter'],
  },
  {
    name: 'White Label',
    price: 299,
    per: 'mo',
    description: 'Your own brand, logo, and custom domain. Resell to your clients.',
    icon: '🏷️',
    available: ['Starter', 'Professional'],
  },
  {
    name: 'QuickBooks Sync',
    price: 99,
    per: 'mo',
    description: 'Bidirectional sync of budgets, pay apps, and change orders with QuickBooks.',
    icon: '🔄',
    available: ['Starter', 'Professional'],
  },
  {
    name: 'API Access',
    price: 149,
    per: 'mo',
    description: 'Full REST API + webhooks. Build custom integrations with your tech stack.',
    icon: '⚡',
    available: ['Starter', 'Professional'],
  },
];

const SERVICES = [
  {
    name: 'Free Migration',
    price: 0,
    label: 'FREE',
    description: 'We migrate all your projects, contacts, documents, and history from Procore, Buildertrend, or any platform. Done in 1 business day.',
    highlight: true,
    icon: '🚀',
  },
  {
    name: 'Guided Onboarding',
    price: 499,
    label: '$499',
    description: 'Hands-on 3-hour setup session with a Saguaro specialist. Configure your company, import your templates, and train your team.',
    highlight: false,
    icon: '🎓',
  },
  {
    name: 'Custom Training',
    price: 299,
    label: '$299/session',
    description: '2-hour live training session for your team. Field app, takeoff, pay apps, or any workflow. Remote or on-site (travel extra).',
    highlight: false,
    icon: '📚',
  },
  {
    name: 'Template Build-Out',
    price: 399,
    label: '$399',
    description: 'We build your custom bid templates, pay app headers, lien waiver forms, and company documents — ready on day one.',
    highlight: false,
    icon: '📋',
  },
];

const SUPPORT_TIERS = [
  {
    name: 'Basic',
    price: 'Included',
    color: C.dim,
    features: ['Email support', '48hr response time', 'Help center access', 'Video tutorials'],
    plans: 'All plans',
  },
  {
    name: 'Priority',
    price: '+$99/mo',
    color: C.gold,
    features: ['Live chat + email', '4hr response time', 'Screen share sessions', 'Dedicated support agent'],
    plans: 'Add-on for Starter',
  },
  {
    name: 'Dedicated CSM',
    price: '+$299/mo',
    color: C.blue,
    features: ['Named account manager', 'Phone support', '1hr response SLA', 'Weekly check-ins', 'Quarterly business reviews'],
    plans: 'Add-on for Starter & Pro',
  },
  {
    name: 'Enterprise SLA',
    price: 'Included',
    color: C.green,
    features: ['99.9% uptime SLA', 'Phone + chat + email', '1hr response', 'Dedicated CSM', 'Custom escalation path'],
    plans: 'Enterprise only',
  },
];

const COMPARISON_FEATURES = [
  { label: 'Active Projects', starter: '10', pro: 'Unlimited', ent: 'Unlimited' },
  { label: 'Users / Seats', starter: 'Unlimited', pro: 'Unlimited', ent: 'Unlimited' },
  { label: 'AI Takeoff', starter: '100 pages/mo', pro: 'Unlimited', ent: 'Unlimited' },
  { label: 'Pay Apps G702/G703', starter: true, pro: true, ent: true },
  { label: 'All AIA Documents', starter: false, pro: true, ent: true },
  { label: 'Lien Waivers — all 50 states', starter: true, pro: true, ent: true },
  { label: 'All 4 Lien Waiver types', starter: false, pro: true, ent: true },
  { label: 'Certified Payroll WH-347', starter: false, pro: true, ent: true },
  { label: 'ACORD 25 / COI Parser', starter: false, pro: true, ent: true },
  { label: 'Owner & Sub Portals', starter: false, pro: true, ent: true },
  { label: 'Autopilot RFI/CO', starter: false, pro: true, ent: true },
  { label: 'Preliminary Notices', starter: false, pro: true, ent: true },
  { label: 'Free Migration', starter: true, pro: true, ent: true },
  { label: 'White Label', starter: false, pro: false, ent: true },
  { label: 'Custom API Integrations', starter: false, pro: false, ent: true },
  { label: 'QuickBooks Sync', starter: false, pro: false, ent: true },
  { label: 'SAML SSO', starter: false, pro: false, ent: true },
];

const COMPETITOR_COMPARISON = [
  { name: 'Procore', price: '$3,750–$12,000+/mo', model: 'Per user + modules', migration: false, flatPrice: false },
  { name: 'Autodesk Build', price: '$2,500–$8,000+/mo', model: 'Per user + modules', migration: false, flatPrice: false },
  { name: 'Buildertrend', price: '$499–$1,099/mo', model: 'Flat (limited features)', migration: false, flatPrice: true },
  { name: 'CoConstruct', price: '$499–$1,099/mo', model: 'Flat (limited features)', migration: false, flatPrice: true },
  { name: 'Fieldwire', price: '$54–$104/user/mo', model: 'Per user', migration: false, flatPrice: false },
  { name: 'Contractor Foreman', price: '$49–$299/mo', model: 'Flat (basic features)', migration: false, flatPrice: true },
  { name: 'Saguaro CRM', price: '$299–$599/mo', model: 'Flat, unlimited users', migration: true, flatPrice: true, isSaguaro: true },
];

const FAQS = [
  { q: 'Is the migration really free?', a: 'Yes, completely free. We migrate your projects, contacts, documents, and history from Procore, Buildertrend, CoConstruct, or any spreadsheet-based system. Our team handles everything — you\'ll be live in 1 business day.' },
  { q: 'Is it really unlimited users?', a: 'Yes. One flat license covers every person on your team — PMs, field supers, estimators, accounting, owners — all included at no extra cost. We will never charge you per seat.' },
  { q: 'What happens after the 30-day free trial?', a: "You'll be prompted to enter payment info. If you choose not to, your account pauses with data preserved for 30 days before deletion. There are no surprise charges." },
  { q: 'Can I upgrade or downgrade my plan anytime?', a: 'Yes. Upgrade immediately and get prorated credit. Downgrade at the end of your billing cycle. No penalties, no fees.' },
  { q: 'Do you support prevailing wage projects?', a: 'Yes. The WH-347 Certified Payroll generator connects to the DOL Davis-Bacon wage API and validates every worker\'s hourly rate against current prevailing wages for their trade and county.' },
  { q: 'Which states are supported for lien waivers?', a: 'All 50 states. AZ, CA, TX, NV, FL, CO, WA, OR, UT, and NM use state-specific statutory language. All other states use our attorney-reviewed generic form.' },
  { q: 'What is annual billing and how much do I save?', a: 'Annual billing locks in your rate for 12 months and saves you ~17%: Starter drops from $299 to $249/mo ($600 saved), Professional drops from $599 to $499/mo ($1,200 saved). Billed as one upfront payment.' },
  { q: 'Can I cancel anytime?', a: 'Yes. Cancel anytime from your billing settings. Monthly plans retain access until end of period. Annual plans are non-refundable but can be paused.' },
  { q: 'What is the White Label add-on?', a: 'Your GC firm or software company can use Saguaro under your own brand, domain, and logo. Each of your clients receives their own sandboxed account. Available as an add-on or included in Enterprise.' },
  { q: 'Do you integrate with QuickBooks?', a: 'QuickBooks sync is available as an add-on ($99/mo) or included in Enterprise. Budget line items, pay applications, and change orders sync bidirectionally with your QuickBooks company file.' },
];

function CheckIcon({ size = 16, color = C.green }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="8" cy="8" r="8" fill={`${color}22`} />
      <path d="M4.5 8l2.5 2.5 4-5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
  if (typeof value === 'string') return <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{value}</span>;
  return value ? <CheckIcon size={18} /> : <DashIcon size={18} />;
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div style={{ minHeight: '100vh', background: C.dark, color: C.text, fontFamily: C.font }}>

      {/* Nav */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        height: 64, background: 'rgba(13,17,23,0.9)',
        borderBottom: `1px solid ${C.border}`,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', padding: '0 32px', gap: 0,
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0, marginRight: 40 }}>
          <img src="/logo-full.jpg" alt="Saguaro CRM" style={{ height: 36, width: 'auto', mixBlendMode: 'screen', objectFit: 'contain' }} />
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
          {NAV_LINKS.map(link => (
            <a key={link.label} href={link.href} style={{ padding: '6px 12px', borderRadius: 6, color: C.dim, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>
              {link.label}
            </a>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/login" style={{ padding: '8px 18px', background: 'rgba(245,158,11,0.08)', border: `1px solid rgba(245,158,11,0.25)`, borderRadius: 8, color: C.gold, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Log In</a>
          <a href="/signup" style={{ padding: '8px 18px', background: `linear-gradient(135deg, ${C.gold}, #FCD34D)`, borderRadius: 8, color: '#0d1117', fontSize: 13, fontWeight: 800, textDecoration: 'none', boxShadow: `0 0 20px rgba(245,158,11,0.25)` }}>Free Trial</a>
        </div>
      </nav>

      <div style={{ paddingTop: 64 }}>

        {/* Hero */}
        <section style={{ textAlign: 'center', padding: '88px 24px 64px', background: `radial-gradient(ellipse 900px 500px at 50% 0%, rgba(245,158,11,0.07) 0%, transparent 70%)` }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'rgba(34,197,94,0.1)', border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 20, fontSize: 12, fontWeight: 700, color: C.green, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 24 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
            Free Migration Included on All Plans
          </div>

          <h1 style={{ fontSize: 'clamp(40px, 6vw, 68px)', fontWeight: 900, lineHeight: 1.08, margin: '0 0 20px', letterSpacing: -1.5 }}>
            One Platform.{' '}
            <span style={{ background: `linear-gradient(135deg, ${C.gold}, #FCD34D)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Your Whole Team.
            </span>
          </h1>
          <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', color: C.dim, maxWidth: 600, margin: '0 auto 16px', lineHeight: 1.65 }}>
            Flat pricing. No per-seat fees. No module upgrades. Free migration from Procore, Buildertrend, or any platform — done in 1 day.
          </p>

          {/* Competitor savings callout */}
          <div style={{ display: 'inline-flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 36 }}>
            {[
              { from: 'Procore', save: 'Save $3,150+/mo' },
              { from: 'Buildertrend', save: 'Save $200–$500/mo' },
              { from: 'Autodesk', save: 'Save $1,900+/mo' },
            ].map(item => (
              <div key={item.from} style={{ padding: '6px 14px', background: 'rgba(245,158,11,0.07)', border: `1px solid rgba(245,158,11,0.2)`, borderRadius: 20, fontSize: 12, color: C.gold, fontWeight: 600 }}>
                vs {item.from} — {item.save}
              </div>
            ))}
          </div>

          {/* Toggle */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: C.raised, borderRadius: 10, padding: '4px', border: `1px solid ${C.border}`, marginBottom: 16 }}>
            <button onClick={() => setAnnual(false)} style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: !annual ? 'rgba(245,158,11,0.15)' : 'transparent', color: !annual ? C.gold : C.dim, fontWeight: 700, fontSize: 14, cursor: 'pointer', outline: !annual ? `1px solid rgba(245,158,11,0.3)` : 'none' }}>
              Monthly
            </button>
            <button onClick={() => setAnnual(true)} style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: annual ? 'rgba(245,158,11,0.15)' : 'transparent', color: annual ? C.gold : C.dim, fontWeight: 700, fontSize: 14, cursor: 'pointer', outline: annual ? `1px solid rgba(245,158,11,0.3)` : 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              Annual
              <span style={{ fontSize: 11, fontWeight: 800, color: C.green, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', padding: '1px 7px', borderRadius: 10 }}>SAVE 17%</span>
            </button>
          </div>
          <div style={{ fontSize: 13, color: C.dim }}>
            {annual ? 'Billed annually — cancel anytime' : 'Switch to annual and save up to $1,200/yr'}
          </div>
        </section>

        {/* Pricing Cards */}
        <section style={{ padding: '0 24px 80px', maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, alignItems: 'start' }}>
            {PLANS.map((plan) => (
              <div key={plan.name} style={{
                background: plan.popular ? 'linear-gradient(180deg, #111827 0%, #0F172A 100%)' : C.raised,
                border: `1.5px solid ${plan.popular ? C.gold : C.border}`,
                borderRadius: 16, overflow: 'hidden', position: 'relative',
                boxShadow: plan.popular ? `0 0 0 1px rgba(245,158,11,0.2), 0 24px 48px rgba(0,0,0,0.5), 0 0 80px rgba(245,158,11,0.06)` : '0 4px 24px rgba(0,0,0,0.3)',
              }}>
                {plan.popular && (
                  <div style={{ background: `linear-gradient(90deg, ${C.gold}, #FCD34D)`, textAlign: 'center', padding: '7px 0', fontSize: 11, fontWeight: 800, color: '#0d1117', letterSpacing: 2, textTransform: 'uppercase' }}>
                    Most Popular
                  </div>
                )}
                <div style={{ padding: '30px 28px 28px' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: plan.popular ? C.gold : C.dim, marginBottom: 2 }}>{plan.name}</div>
                  <div style={{ fontSize: 13, color: C.dim, marginBottom: 6 }}>{plan.tagline}</div>
                  <div style={{ fontSize: 11, color: plan.popular ? C.gold : C.dim, background: plan.popular ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${plan.popular ? 'rgba(245,158,11,0.2)' : C.border}`, borderRadius: 6, padding: '3px 10px', display: 'inline-block', marginBottom: 20, fontWeight: 600 }}>
                    {plan.highlight}
                  </div>

                  {plan.price_mo > 0 ? (
                    <div style={{ marginBottom: 28 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 4 }}>
                        <span style={{ fontSize: 52, fontWeight: 900, color: C.text, lineHeight: 1 }}>${annual ? plan.price_yr : plan.price_mo}</span>
                        <span style={{ fontSize: 15, color: C.dim, paddingBottom: 8 }}>/mo</span>
                      </div>
                      {annual ? (
                        <div style={{ fontSize: 12, color: C.dim }}>Billed annually — <span style={{ color: C.green, fontWeight: 600 }}>save ${(plan.price_mo - plan.price_yr) * 12}/yr</span></div>
                      ) : (
                        <div style={{ fontSize: 12, color: C.dim }}>Or <span style={{ color: C.green, fontWeight: 600 }}>${plan.price_yr}/mo</span> billed annually</div>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginBottom: 28 }}>
                      <div style={{ fontSize: 30, fontWeight: 900, color: C.text, lineHeight: 1, marginBottom: 6 }}>Contact Sales</div>
                      <div style={{ fontSize: 12, color: C.dim }}>Custom pricing for your scale</div>
                    </div>
                  )}

                  <a href={plan.cta_href} style={{
                    display: 'block', textAlign: 'center', padding: '13px 0',
                    background: plan.popular ? `linear-gradient(135deg, ${C.gold}, #FCD34D)` : plan.name === 'Enterprise' ? 'transparent' : 'rgba(255,255,255,0.05)',
                    border: plan.popular ? 'none' : `1.5px solid ${plan.name === 'Enterprise' ? C.gold : C.border}`,
                    borderRadius: 9, color: plan.popular ? '#0d1117' : plan.name === 'Enterprise' ? C.gold : C.text,
                    fontWeight: 800, fontSize: 14, textDecoration: 'none', marginBottom: 28, letterSpacing: 0.3,
                    boxShadow: plan.popular ? `0 4px 16px rgba(245,158,11,0.3)` : 'none',
                  }}>
                    {plan.cta}
                  </a>

                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>
                      {plan.name === 'Enterprise' ? "Everything in Professional, plus:" : "What's included:"}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {plan.features.map(f => (
                        <div key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <CheckIcon size={16} color={f.toLowerCase().includes('migration') ? C.gold : C.green} />
                          <span style={{ fontSize: 13, color: f.toLowerCase().includes('migration') ? C.gold : C.text, lineHeight: 1.45, fontWeight: f.toLowerCase().includes('migration') ? 700 : 400 }}>{f}</span>
                        </div>
                      ))}
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

        {/* Migration Banner */}
        <section style={{ padding: '0 24px 80px', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(13,17,23,0) 100%)', border: `1px solid rgba(245,158,11,0.3)`, borderRadius: 16, padding: '40px 48px', display: 'flex', gap: 48, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.gold, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Free Migration — Every Plan</div>
              <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 12px', lineHeight: 1.2 }}>We move you over in 1 day. Free.</h2>
              <p style={{ fontSize: 15, color: C.dim, margin: '0 0 24px', lineHeight: 1.65 }}>
                Coming from Procore, Buildertrend, CoConstruct, or a spreadsheet? Our team migrates all your projects, contacts, documents, and history. You do nothing. We handle everything.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {['Projects, contacts & vendors', 'All documents & bid history', 'Pay apps & lien waiver records', 'Team accounts & permissions'].map(item => (
                  <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <CheckIcon size={15} color={C.gold} />
                    <span style={{ fontSize: 14, color: C.text }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 64, fontWeight: 900, color: C.gold, lineHeight: 1 }}>$0</div>
              <div style={{ fontSize: 14, color: C.dim, textAlign: 'center' }}>Migration fee<br />(always free)</div>
              <a href="/signup" style={{ padding: '14px 28px', background: `linear-gradient(135deg, ${C.gold}, #D97706)`, borderRadius: 9, color: '#000', fontWeight: 800, fontSize: 14, textDecoration: 'none', boxShadow: `0 4px 24px rgba(245,158,11,0.35)`, textAlign: 'center' }}>
                Start Free Migration
              </a>
            </div>
          </div>
        </section>

        {/* Add-ons */}
        <section style={{ padding: '0 24px 96px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'rgba(245,158,11,0.08)', border: `1px solid rgba(245,158,11,0.2)`, borderRadius: 20, fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 }}>
              Add-Ons & Upgrades
            </div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, margin: '0 0 12px', letterSpacing: -0.5 }}>Power up your plan</h2>
            <p style={{ fontSize: 16, color: C.dim, maxWidth: 480, margin: '0 auto' }}>Add only what you need. Cancel any add-on anytime.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            {ADDONS.map(addon => (
              <div key={addon.name} style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>{addon.name}</div>
                    <div style={{ fontSize: 12, color: C.dim }}>{addon.description}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: C.gold }}>${addon.price}</div>
                    <div style={{ fontSize: 11, color: C.dim }}>/{addon.per}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.dim, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', display: 'inline-block' }}>
                  Available for: {addon.available.join(', ')}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Support Tiers */}
        <section style={{ padding: '0 24px 96px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'rgba(59,130,246,0.08)', border: `1px solid rgba(59,130,246,0.2)`, borderRadius: 20, fontSize: 11, fontWeight: 700, color: C.blue, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 }}>
              Support
            </div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, margin: '0 0 12px', letterSpacing: -0.5 }}>Support for every team size</h2>
            <p style={{ fontSize: 16, color: C.dim, maxWidth: 480, margin: '0 auto' }}>Basic support is included on all plans. Upgrade for faster response and a dedicated human.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {SUPPORT_TIERS.map(tier => (
              <div key={tier.name} style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 14, padding: '28px 24px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: tier.color, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>{tier.name}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 4 }}>{tier.price}</div>
                <div style={{ fontSize: 11, color: C.dim, marginBottom: 20 }}>{tier.plans}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tier.features.map(f => (
                    <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <CheckIcon size={14} color={tier.color} />
                      <span style={{ fontSize: 13, color: C.dim }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* One-Time Services */}
        <section style={{ padding: '0 24px 96px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'rgba(34,197,94,0.08)', border: `1px solid rgba(34,197,94,0.2)`, borderRadius: 20, fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 }}>
              One-Time Services
            </div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, margin: '0 0 12px', letterSpacing: -0.5 }}>Get up and running fast</h2>
            <p style={{ fontSize: 16, color: C.dim, maxWidth: 480, margin: '0 auto' }}>Optional professional services. Pay once, get set up right.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
            {SERVICES.map(service => (
              <div key={service.name} style={{
                background: service.highlight ? 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(15,23,42,0) 100%)' : C.raised,
                border: `1.5px solid ${service.highlight ? 'rgba(245,158,11,0.4)' : C.border}`,
                borderRadius: 14, padding: '28px 24px', position: 'relative',
              }}>
                {service.highlight && (
                  <div style={{ position: 'absolute', top: -1, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${C.gold}, #FCD34D)`, borderRadius: '14px 14px 0 0' }} />
                )}
                <div style={{ fontSize: 24, marginBottom: 12 }}>{service.icon}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{service.name}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: service.highlight ? C.gold : C.text, flexShrink: 0, marginLeft: 12 }}>{service.label}</div>
                </div>
                <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6 }}>{service.description}</div>
                {service.highlight && (
                  <div style={{ marginTop: 16 }}>
                    <a href="/signup" style={{ display: 'inline-block', padding: '10px 20px', background: `linear-gradient(135deg, ${C.gold}, #D97706)`, borderRadius: 8, color: '#000', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>
                      Start Free Migration
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Competitor Price Comparison */}
        <section style={{ padding: '0 24px 96px', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'rgba(245,158,11,0.08)', border: `1px solid rgba(245,158,11,0.2)`, borderRadius: 20, fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 }}>
              How We Stack Up
            </div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>The construction software market — honestly</h2>
          </div>
          <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Platform', 'Monthly Cost', 'Pricing Model', 'Free Migration', 'Flat Price'].map((col, i) => (
                    <th key={col} style={{ padding: '16px 20px', textAlign: i === 0 ? 'left' : 'center', fontSize: 12, fontWeight: 700, color: C.dim, letterSpacing: 0.5, textTransform: 'uppercase' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPETITOR_COMPARISON.map((row, i) => (
                  <tr key={row.name} style={{
                    borderBottom: i < COMPETITOR_COMPARISON.length - 1 ? `1px solid rgba(30,58,95,0.5)` : 'none',
                    background: row.isSaguaro ? 'rgba(245,158,11,0.04)' : 'transparent',
                  }}>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ fontSize: 14, fontWeight: row.isSaguaro ? 800 : 600, color: row.isSaguaro ? C.gold : C.text }}>
                        {row.name}
                        {row.isSaguaro && <span style={{ fontSize: 10, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4, padding: '2px 6px', marginLeft: 8, color: C.gold, fontWeight: 700 }}>YOU</span>}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'center', fontSize: 13, color: row.isSaguaro ? C.gold : C.text, fontWeight: row.isSaguaro ? 700 : 400 }}>{row.price}</td>
                    <td style={{ padding: '14px 20px', textAlign: 'center', fontSize: 12, color: C.dim }}>{row.model}</td>
                    <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        {row.migration ? <CheckIcon size={18} color={C.gold} /> : <DashIcon size={18} />}
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        {row.flatPrice ? <CheckIcon size={18} /> : <DashIcon size={18} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Feature Comparison Table */}
        <section style={{ padding: '0 24px 96px', maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'rgba(245,158,11,0.08)', border: `1px solid rgba(245,158,11,0.2)`, borderRadius: 20, fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 }}>
              Full Comparison
            </div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>Everything, side by side</h2>
          </div>
          <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: '20px 24px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: C.dim, width: '40%' }}>Feature</th>
                  {['Starter', 'Professional', 'Enterprise'].map((col) => (
                    <th key={col} style={{ padding: '20px 16px', textAlign: 'center', fontWeight: 800, fontSize: 13, color: col === 'Professional' ? C.gold : C.text, background: col === 'Professional' ? 'rgba(245,158,11,0.05)' : 'transparent', borderLeft: col === 'Professional' ? `1px solid rgba(245,158,11,0.15)` : `1px solid ${C.border}`, borderRight: col === 'Professional' ? `1px solid rgba(245,158,11,0.15)` : undefined }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_FEATURES.map((row, i) => (
                  <tr key={row.label} style={{ borderBottom: i < COMPARISON_FEATURES.length - 1 ? `1px solid rgba(30,58,95,0.5)` : 'none' }}>
                    <td style={{ padding: '14px 24px', fontSize: 13, color: C.dim, fontWeight: 500 }}>{row.label}</td>
                    {(['starter', 'pro', 'ent'] as const).map((key) => (
                      <td key={key} style={{ padding: '14px 16px', textAlign: 'center', verticalAlign: 'middle', background: key === 'pro' ? 'rgba(245,158,11,0.03)' : 'transparent', borderLeft: key === 'pro' ? `1px solid rgba(245,158,11,0.12)` : `1px solid rgba(30,58,95,0.4)`, borderRight: key === 'pro' ? `1px solid rgba(245,158,11,0.12)` : undefined }}>
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

        {/* FAQ */}
        <section style={{ padding: '0 24px 96px', maxWidth: 760, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'rgba(245,158,11,0.08)', border: `1px solid rgba(245,158,11,0.2)`, borderRadius: 20, fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 }}>FAQ</div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>Frequently asked questions</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {FAQS.map((faq, i) => (
              <div key={i} style={{ borderBottom: i < FAQS.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: '100%', textAlign: 'left', padding: '22px 0', background: 'none', border: 'none', color: C.text, fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, lineHeight: 1.4, fontFamily: C.font }}>
                  <span>{faq.q}</span>
                  <span style={{ flexShrink: 0, width: 28, height: 28, background: openFaq === i ? `rgba(245,158,11,0.15)` : 'rgba(255,255,255,0.05)', border: `1px solid ${openFaq === i ? 'rgba(245,158,11,0.4)' : C.border}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.gold, fontSize: 18, fontWeight: 300 }}>
                    {openFaq === i ? '−' : '+'}
                  </span>
                </button>
                {openFaq === i && (
                  <div style={{ padding: '0 0 22px', fontSize: 15, color: C.dim, lineHeight: 1.75, maxWidth: 640 }}>{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section style={{ padding: '96px 24px', background: `linear-gradient(180deg, transparent 0%, rgba(245,158,11,0.04) 50%, transparent 100%)`, borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, margin: '0 0 16px', lineHeight: 1.15, letterSpacing: -0.8 }}>
              Ready to stop paying{' '}
              <span style={{ background: `linear-gradient(135deg, ${C.gold}, #FCD34D)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Procore prices?</span>
            </h2>
            <p style={{ fontSize: 17, color: C.dim, margin: '0 0 36px', lineHeight: 1.6 }}>
              30-day free trial. Free migration. No credit card required. Your whole team, one flat rate.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
              <a href="/signup" style={{ display: 'inline-block', padding: '15px 36px', background: `linear-gradient(135deg, ${C.gold}, #FCD34D)`, borderRadius: 10, color: '#0d1117', fontWeight: 800, fontSize: 16, textDecoration: 'none', boxShadow: `0 4px 24px rgba(245,158,11,0.35)` }}>
                Start Free Trial — No CC Required
              </a>
              <a href="/switch-from-procore" style={{ display: 'inline-block', padding: '15px 36px', background: 'transparent', border: `1.5px solid ${C.border}`, borderRadius: 10, color: C.text, fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>
                Free Migration Guide
              </a>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {['30 days free', 'Free migration', 'Cancel anytime', 'No per-seat fees', 'Unlimited users'].map(pill => (
                <div key={pill} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'rgba(34,197,94,0.07)', border: `1px solid rgba(34,197,94,0.2)`, borderRadius: 20, fontSize: 12, fontWeight: 600, color: C.green }}>
                  <CheckIcon size={12} color={C.green} />
                  {pill}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: `1px solid ${C.border}`, padding: '48px 32px', background: C.raised }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 32 }}>
            <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
              <img src="/logo-full.jpg" alt="Saguaro CRM" style={{ height: 30, width: 'auto', mixBlendMode: 'screen', objectFit: 'contain' }} />
            </a>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { label: 'Home', href: '/' }, { label: 'Features', href: '/features' },
                { label: 'Compare', href: '/compare' }, { label: 'Switch from Procore', href: '/switch-from-procore' },
                { label: 'Field App', href: '/get-the-app' }, { label: 'Privacy', href: '/privacy' }, { label: 'Terms', href: '/terms' },
              ].map(link => (
                <a key={link.label} href={link.href} style={{ fontSize: 13, color: C.dim, textDecoration: 'none', fontWeight: 500 }}>{link.label}</a>
              ))}
            </div>
            <div style={{ fontSize: 12, color: C.dim, whiteSpace: 'nowrap' }}>&copy; {new Date().getFullYear()} Saguaro CRM</div>
          </div>
        </footer>

      </div>
    </div>
  );
}
