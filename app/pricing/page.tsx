'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { IntegrationStrip } from '@/components/Integrations';
import MarketingNav from '@/components/MarketingNav';
import { PLANS, PLAN_ADDONS, ONE_TIME_SERVICES, FEATURE_MATRIX, TRIAL_DAYS, PRICE_RANGE, SALES_EMAIL, STARTER, PROFESSIONAL, MAX_ANNUAL_SAVINGS } from '@/lib/plans';
import { ScribbleNote } from '@/components/Scribble';

const C = {
  dark: 'var(--bg-base)',
  gold: 'var(--brand-primary)',
  goldBright: 'var(--brand-primary-strong)',
  text: '#F5F5F7',
  dim: 'var(--text-secondary)',
  border: 'rgba(255,255,255,0.10)',
  hairline: 'rgba(255,255,255,0.08)',
  cardBg: 'rgba(255,255,255,0.02)',
  raised: 'var(--bg-surface)',
  raisedAlt: 'var(--bg-surface-2)',
  green: '#2CFF7A',
  blue: '#FF8A00',
  font: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

const NAV_LINKS = [
  { label: 'Product', href: '/product' },
  { label: 'The App', href: '/get-the-app' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Compare', href: '/compare' },
];

const COMPETITOR_COMPARISON = [
  { name: 'Competitor 1', price: '$3,750–$12,000+/mo', model: 'Per user + modules', migration: false, flatPrice: false },
  { name: 'Competitor 2', price: '$2,500–$8,000+/mo', model: 'Per user + modules', migration: false, flatPrice: false },
  { name: 'Competitor 3', price: '$499–$1,099/mo', model: 'Flat (limited features)', migration: false, flatPrice: true },
  { name: 'Competitor 4', price: '$499–$1,099/mo', model: 'Flat (limited features)', migration: false, flatPrice: true },
  { name: 'Competitor 5', price: '$54–$104/user/mo', model: 'Per user', migration: false, flatPrice: false },
  { name: 'Competitor 6', price: '$49–$299/mo', model: 'Flat (basic features)', migration: false, flatPrice: true },
  { name: 'Saguaro Control Systems', price: `${PRICE_RANGE}`, model: 'Flat, unlimited users', migration: true, flatPrice: true, isSaguaro: true },
];

// QuickBooks add-on pricing renders from lib/plans.ts (the canonical add-on
// list) so the FAQ can never drift from the add-ons grid above it.
const QB_ADDON = PLAN_ADDONS.find((a) => a.name.toLowerCase().includes('quickbooks'));
const QB_PRICE = QB_ADDON ? `${QB_ADDON.price}${QB_ADDON.per ?? ''}` : 'see add-ons above';

const FAQS = [
  { q: 'Is the migration really free?', a: 'Yes, completely free. We migrate your projects, contacts, documents, and history from any platform or spreadsheet-based system. Our team handles everything — you\'ll be live in 1 business day.' },
  { q: 'Is it really unlimited users?', a: 'Yes. One flat license covers every person on your team — PMs, field supers, estimators, accounting, owners — all included at no extra cost. We will never charge you per seat.' },
  { q: `What happens after the ${TRIAL_DAYS}-day free trial?`, a: "You'll be prompted to enter payment info. If you choose not to, your account pauses with data preserved for 30 days before deletion. There are no surprise charges." },
  { q: 'Can I upgrade or downgrade my plan anytime?', a: 'Yes. Upgrade immediately and get prorated credit. Downgrade at the end of your billing cycle. No penalties, no fees.' },
  { q: 'Do you support prevailing wage projects?', a: 'Yes. The WH-347 Certified Payroll generator connects to the DOL Davis-Bacon wage API and validates every worker\'s hourly rate against current prevailing wages for their trade and county.' },
  { q: 'Which states are supported for lien waivers?', a: 'All 50 states. AZ, CA, TX, NV, FL, CO, WA, OR, UT, and NM use state-specific statutory language. All other states use our attorney-reviewed generic form.' },
  { q: 'What is annual billing and how much do I save?', a: `Annual billing locks in your rate for 12 months and saves you up to 13%: Starter drops from $${STARTER.priceMo} to $${STARTER.priceYr}/mo ($${(STARTER.priceMo - STARTER.priceYr) * 12} saved), Professional drops from $${PROFESSIONAL.priceMo} to $${PROFESSIONAL.priceYr}/mo ($${((PROFESSIONAL.priceMo - PROFESSIONAL.priceYr) * 12).toLocaleString()} saved). Billed as one upfront payment.` },
  { q: 'Can I cancel anytime?', a: 'Yes. Cancel anytime from your billing settings. Monthly plans retain access until end of period. Annual plans are non-refundable but can be paused.' },
  { q: 'What is the White Label add-on?', a: 'Your GC firm or software company can use Saguaro under your own brand, domain, and logo. Each of your clients receives their own sandboxed account. Available as an add-on or included in Enterprise.' },
  { q: 'Do you integrate with QuickBooks?', a: `QuickBooks sync is available as an add-on (${QB_PRICE}) or included in Enterprise. Approved pay applications go to QuickBooks Online as invoices to the job owner, and subcontractors as vendors.` },
];

function CheckIcon({ size = 16, color = C.green }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="8" cy="8" r="8" fill={`color-mix(in srgb, ${color} 13%, transparent)`} />
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
    <div className="mkt-page" style={{ minHeight: '100vh', background: C.dark, color: C.text, fontFamily: C.font }}>
      <style>{`@media (max-width: 768px){ .pricing-mnav-links{ display:none !important } }`}</style>

      {/* Nav */}
      {/* One professional nav across every marketing page (fixed, 58px). */}
      <MarketingNav />
      <div style={{ height: 58 }} />

      <div style={{ paddingTop: 0 }}>

        {/* Hero — capped so headline + toggle + first cards fit a 1366x768 viewport */}
        <section style={{ textAlign: 'center', padding: 'clamp(48px, 8vh, 80px) 24px 56px', background: 'transparent' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 12, fontWeight: 500, color: C.dim, letterSpacing: 0.3, marginBottom: 28 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, display: 'inline-block' }} />
            Free Migration Included on All Plans
          </div>

          <h1 className="landing-display" style={{ fontWeight: 800, lineHeight: 1.04, margin: '0 0 18px', letterSpacing: '-0.025em', textWrap: 'balance' as const }}>
            One platform.{' '}
            <span style={{ background: 'linear-gradient(100deg, var(--brand-primary) 6%, var(--brand-primary-strong) 50%, var(--brand-primary) 92%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>
              Your whole team.
            </span>
          </h1>
          <p style={{ fontSize: 'clamp(15px, 2vw, 17px)', color: C.dim, maxWidth: 600, margin: '0 auto 16px', lineHeight: 1.65 }}>
            Flat pricing. No per-seat fees. No module upgrades. Free migration from any platform — we handle it for you.
          </p>

          {/* Competitor savings callout */}
          <div style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 32 }}>
            {['Flat Rate — Never Per-Seat', 'Base Saguaro Radio Free on Every Plan', 'Free Migration from Any Platform'].map(item => (
              <div key={item} style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${C.hairline}`, borderRadius: 999, fontSize: 12, color: C.dim, fontWeight: 500 }}>
                {item}
              </div>
            ))}
          </div>

          {/* Toggle */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: C.cardBg, borderRadius: 999, padding: '5px', border: `1px solid ${C.hairline}`, marginBottom: 16 }}>
            <button onClick={() => setAnnual(false)} style={{ padding: '8px 22px', borderRadius: 999, border: '1px solid transparent', background: !annual ? 'rgba(255,255,255,0.08)' : 'transparent', color: !annual ? C.text : C.dim, fontWeight: 500, fontSize: 14, cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}>
              Monthly
            </button>
            <button onClick={() => setAnnual(true)} style={{ padding: '8px 22px', borderRadius: 999, border: '1px solid transparent', background: annual ? 'rgba(255,255,255,0.08)' : 'transparent', color: annual ? C.text : C.dim, fontWeight: 500, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s, color 0.15s' }}>
              Annual
              <span style={{ fontSize: 11, fontWeight: 500, color: C.dim, background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, padding: '1px 7px', borderRadius: 999 }}>Save up to ${MAX_ANNUAL_SAVINGS.toLocaleString()}/yr</span>
            </button>
          </div>
          <div style={{ fontSize: 13, color: C.dim }}>
            {annual ? 'Billed annually — cancel anytime' : `Switch to annual and save up to $${MAX_ANNUAL_SAVINGS.toLocaleString()}/yr`}
          </div>
        </section>

        {/* Pricing Cards */}
        <section style={{ padding: '0 24px 72px', maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, alignItems: 'start' }}>
            {PLANS.map((plan) => (
              <div key={plan.name} style={{
                background: C.cardBg,
                border: plan.popular ? `1px solid color-mix(in srgb, var(--brand-primary) 45%, transparent)` : `1px solid ${C.hairline}`,
                borderRadius: 14, overflow: 'hidden', position: 'relative',
                marginTop: 0,
                boxShadow: 'none',
              }}>
                {plan.popular && (
                  <div style={{ background: C.gold, textAlign: 'center', padding: '7px 0', fontSize: 11, fontWeight: 600, color: '#0A0A00' }}>
                    Most Popular
                  </div>
                )}
                <div style={{ padding: '30px 28px 28px' }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 2 }}>{plan.name}</div>
                  <div style={{ fontSize: 13, color: C.dim, marginBottom: 6 }}>{plan.tagline}</div>
                  <div style={{ fontSize: 11, color: C.dim, background: 'transparent', border: `1px solid ${C.hairline}`, borderRadius: 999, padding: '3px 10px', display: 'inline-block', marginBottom: 20, fontWeight: 500 }}>
                    {plan.highlight}
                  </div>

                  {plan.priceMo > 0 ? (
                    <div style={{ marginBottom: 28 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 4 }}>
                        <span style={{ fontSize: 40, fontWeight: 600, color: C.text, lineHeight: 1 }}>${annual ? plan.priceYr : plan.priceMo}</span>
                        <span style={{ fontSize: 15, color: C.dim, paddingBottom: 6 }}>/mo</span>
                      </div>
                      {annual ? (
                        <div style={{ fontSize: 12, color: C.dim }}>Billed annually — <span style={{ color: C.dim, fontWeight: 500 }}>save ${(plan.priceMo - plan.priceYr) * 12}/yr</span></div>
                      ) : (
                        <div style={{ fontSize: 12, color: C.dim }}>Or <span style={{ color: C.dim, fontWeight: 500 }}>${plan.priceYr}/mo</span> billed annually</div>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginBottom: 28 }}>
                      <div style={{ fontSize: 28, fontWeight: 600, color: C.text, lineHeight: 1, marginBottom: 6 }}>Call for Quote</div>
                      <div style={{ fontSize: 12, color: C.dim }}>Custom pricing for your scale</div>
                    </div>
                  )}

                  <a href={plan.ctaHref} style={{
                    display: 'block', textAlign: 'center', padding: '12px 0',
                    background: plan.popular ? 'linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover))' : 'transparent',
                    border: plan.popular ? '1px solid transparent' : `1px solid ${C.hairline}`,
                    borderRadius: 8, color: plan.popular ? '#0A0A00' : C.text,
                    fontWeight: plan.popular ? 700 : 600, fontSize: 14, textDecoration: 'none', marginBottom: 28, letterSpacing: 0.2,
                    boxShadow: plan.popular ? '0 4px 14px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)' : 'none',
                  }}>
                    {plan.cta}
                  </a>

                  <div style={{ borderTop: `1px solid ${C.hairline}`, paddingTop: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.dim, marginBottom: 14 }}>
                      {plan.name === 'Enterprise' ? "Everything in Professional, Plus:" : "What's Included:"}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {plan.features.map(f => (
                        <div key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <CheckIcon size={16} color={C.green} />
                          <span style={{ fontSize: 13, color: C.text, lineHeight: 1.45, fontWeight: 400 }}>{f}</span>
                        </div>
                      ))}
                      {plan.notIncluded.map(f => (
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

        {/* Decision helper */}
        <section style={{ padding: '0 24px 72px', maxWidth: 760, margin: '0 auto' }}>
          <div style={{ background: C.cardBg, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '28px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>Not sure? Every plan starts with a free trial — switch anytime.</div>
            <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6, maxWidth: 560 }}>
              {TRIAL_DAYS} days free, no credit card. Upgrades take effect immediately with prorated credit; downgrades apply at the end of your billing cycle.{' '}
              <Link href="/how-to-get-started" style={{ color: C.gold, textDecoration: 'none', fontWeight: 500 }}>See How to Get Started →</Link>
            </div>
          </div>
        </section>

        {/* Migration Banner */}
        <section style={{ padding: '0 24px 72px', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ background: C.cardBg, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '40px 48px', display: 'flex', gap: 48, alignItems: 'center', flexWrap: 'wrap', boxShadow: 'none' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 12 }}>Free Migration — Every Plan</div>
              <h2 style={{ fontWeight: 600, margin: '0 0 12px', lineHeight: 1.25 }}>We move you over. Free.</h2>
              <p style={{ fontSize: 15, color: C.dim, margin: '0 0 24px', lineHeight: 1.65 }}>
                Coming from Procore, Buildertrend, CoConstruct, or a spreadsheet? Our team migrates all your projects, contacts, documents, and history. You do nothing. We handle everything.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {['Projects, contacts & vendors', 'All documents & bid history', 'Pay apps & lien waiver records', 'Team accounts & permissions'].map(item => (
                  <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <CheckIcon size={15} color={C.green} />
                    <span style={{ fontSize: 14, color: C.text }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 44, fontWeight: 600, color: C.text, lineHeight: 1 }}>$0</div>
              <div style={{ fontSize: 14, color: C.dim, textAlign: 'center' }}>Migration Fee<br />(Always Free)</div>
              <Link href="/signup" style={{ padding: '12px 24px', background: C.gold, borderRadius: 8, color: '#0A0A00', fontWeight: 600, fontSize: 14, textDecoration: 'none', textAlign: 'center' }}>
                Start Free Migration
              </Link>
            </div>
          </div>
        </section>

        {/* Add-ons */}
        <section style={{ padding: '0 24px 80px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 16 }}>
              Add-Ons & Upgrades
            </div>
            <h2 style={{ fontWeight: 600, margin: '0 0 12px', letterSpacing: -0.3 }}>Power Up Your Plan</h2>
            <p style={{ fontSize: 16, color: C.dim, maxWidth: 480, margin: '0 auto' }}>Add only what you need. Cancel any add-on anytime.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            {PLAN_ADDONS.map(addon => (
              <div key={addon.name} style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 24px 22px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: C.text, lineHeight: 1.35 }}>
                    {addon.name}
                    {addon.service && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: C.dim, border: `1px solid ${C.hairline}`, borderRadius: 999, padding: '2px 8px', marginLeft: 8, verticalAlign: 'middle' }}>Service</span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ fontSize: 20, fontWeight: 600, color: C.text }}>{addon.price}</span>
                    {addon.per && <span style={{ fontSize: 12, color: C.dim }}>{addon.per}</span>}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6, flex: 1 }}>{addon.description}</div>
                <div style={{ fontSize: 11, color: C.dim, background: 'transparent', border: `1px solid ${C.hairline}`, borderRadius: 6, padding: '4px 10px', alignSelf: 'flex-start' }}>
                  Available for: {addon.available}
                </div>
                <a className="btn-gold" href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(addon.mailSubject)}`} style={{ justifyContent: 'center', textDecoration: 'none', fontSize: 13, marginTop: 4 }}>
                  Add to Plan
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* One-Time Services */}
        <section style={{ padding: '0 24px 80px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 16 }}>
              One-Time Services
            </div>
            <h2 style={{ fontWeight: 600, margin: '0 0 12px', letterSpacing: -0.3 }}>Get Up and Running Fast</h2>
            <p style={{ fontSize: 16, color: C.dim, maxWidth: 480, margin: '0 auto' }}>Optional professional services. Pay once, get set up right.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
            {ONE_TIME_SERVICES.map(service => (
              <div key={service.name} style={{
                background: 'transparent',
                borderTop: `1px solid ${C.hairline}`,
                borderRadius: 0, padding: '24px 4px', position: 'relative',
                boxShadow: 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{service.name}</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: C.text, flexShrink: 0, marginLeft: 12 }}>{service.label}</div>
                </div>
                <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6 }}>{service.description}</div>
                {service.highlight && (
                  <div style={{ marginTop: 16 }}>
                    <Link href="/signup" style={{ display: 'inline-block', padding: '10px 20px', background: C.gold, borderRadius: 8, color: '#0A0A00', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
                      Start Free Migration
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Competitor Price Comparison */}
        <section style={{ padding: '0 24px 80px', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 16 }}>
              How We Stack Up
            </div>
            <h2 style={{ fontWeight: 600, margin: 0, letterSpacing: -0.3 }}>The Construction Software Market — Honestly</h2>
          </div>
          <div style={{ background: C.cardBg, border: `1px solid ${C.hairline}`, borderRadius: 14, overflow: 'hidden', boxShadow: 'none' }}>
           <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxWidth: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.hairline}` }}>
                  {['Platform', 'Monthly Cost', 'Pricing Model', 'Free Migration', 'Flat Price'].map((col, i) => (
                    <th key={col} style={{ padding: '16px 20px', textAlign: i === 0 ? 'left' : 'center', fontSize: 12, fontWeight: 600, color: C.dim }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPETITOR_COMPARISON.map((row, i) => (
                  <tr key={row.name} style={{
                    borderBottom: i < COMPETITOR_COMPARISON.length - 1 ? `1px solid ${C.hairline}` : 'none',
                    background: row.isSaguaro ? 'rgba(255,255,255,0.03)' : 'transparent',
                  }}>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ fontSize: 14, fontWeight: row.isSaguaro ? 600 : 500, color: C.text }}>
                        {row.name}
                        {row.isSaguaro && <span style={{ fontSize: 10, background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 6, padding: '2px 6px', marginLeft: 8, color: C.dim, fontWeight: 500 }}>You</span>}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'center', fontSize: 13, color: C.text, fontWeight: row.isSaguaro ? 600 : 400 }}>{row.price}</td>
                    <td style={{ padding: '14px 20px', textAlign: 'center', fontSize: 12, color: C.dim }}>{row.model}</td>
                    <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        {row.migration ? <CheckIcon size={18} color={C.green} /> : <DashIcon size={18} />}
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
          </div>
        </section>

        {/* Feature Comparison Table */}
        <section style={{ padding: '0 24px 80px', maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 16 }}>
              Full Comparison
            </div>
            <h2 style={{ fontWeight: 600, margin: 0, letterSpacing: -0.3 }}>Everything, Side by Side</h2>
          </div>
          <div style={{ background: C.cardBg, border: `1px solid ${C.hairline}`, borderRadius: 14, overflow: 'hidden', boxShadow: 'none' }}>
           <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxWidth: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.hairline}` }}>
                  <th style={{ padding: '20px 24px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: C.dim, width: '40%' }}>Feature</th>
                  {['Starter', 'Professional', 'Enterprise'].map((col) => (
                    <th key={col} style={{ padding: '20px 16px', textAlign: 'center', fontWeight: 600, fontSize: 13, color: C.text, background: col === 'Professional' ? 'rgba(255,255,255,0.03)' : 'transparent', borderLeft: `1px solid ${C.hairline}`, borderRight: col === 'Professional' ? `1px solid ${C.hairline}` : undefined }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_MATRIX.map((row, i) => (
                  <tr key={row.label} style={{ borderBottom: i < FEATURE_MATRIX.length - 1 ? `1px solid ${C.hairline}` : 'none' }}>
                    <td style={{ padding: '14px 24px', fontSize: 13, color: C.dim, fontWeight: 500 }}>{row.label}</td>
                    {(['starter', 'pro', 'ent'] as const).map((key) => (
                      <td key={key} style={{ padding: '14px 16px', textAlign: 'center', verticalAlign: 'middle', background: key === 'pro' ? 'rgba(255,255,255,0.03)' : 'transparent', borderLeft: `1px solid ${C.hairline}`, borderRight: key === 'pro' ? `1px solid ${C.hairline}` : undefined }}>
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
          </div>
        </section>

        {/* FAQ */}
        <section style={{ padding: '0 24px 80px', maxWidth: 760, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 16 }}>FAQ</div>
            <h2 style={{ fontWeight: 600, margin: 0, letterSpacing: -0.3 }}>Frequently Asked Questions</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {FAQS.map((faq, i) => (
              <div key={i} style={{ borderBottom: i < FAQS.length - 1 ? `1px solid ${C.hairline}` : 'none' }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: '100%', textAlign: 'left', padding: '22px 0', background: 'none', border: 'none', color: C.text, fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, lineHeight: 1.4, fontFamily: C.font }}>
                  <span>{faq.q}</span>
                  <span style={{ flexShrink: 0, width: 28, height: 28, background: openFaq === i ? 'rgba(255,255,255,0.06)' : 'transparent', border: `1px solid ${C.hairline}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text, fontSize: 18, fontWeight: 300 }}>
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

        {/* Trusted integrations */}
        <IntegrationStrip />

        {/* Final CTA */}
        <section style={{ padding: '72px 24px 80px', background: 'transparent', borderTop: `1px solid ${C.hairline}`, textAlign: 'center' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{ fontWeight: 600, margin: '0 0 16px', lineHeight: 1.2, letterSpacing: -0.4 }}>
              Ready to Stop Paying{' '}
              <span style={{ color: C.text }}>Per-Seat Prices?</span>
            </h2>
            <p style={{ fontSize: 16, color: C.dim, margin: '0 0 36px', lineHeight: 1.6 }}>
              {TRIAL_DAYS}-day free trial. Free migration. No credit card required. Your whole team, one flat rate.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
              <Link href="/signup" className="btn-gold" style={{ padding: '12px 28px', fontSize: 15, textDecoration: 'none' }}>
                Start Free Trial — No Credit Card Required
              </Link>
              <Link href="/switch-from-procore" style={{ display: 'inline-block', padding: '12px 28px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 8, color: C.dim, fontWeight: 500, fontSize: 15, textDecoration: 'none' }}>
                Free Migration Guide
              </Link>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[`${TRIAL_DAYS} Days Free`, 'Free Migration', 'Cancel Anytime', 'No Per-Seat Fees', 'Unlimited Users'].map(pill => (
                <div key={pill} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 12, fontWeight: 500, color: C.dim }}>
                  <CheckIcon size={12} color={C.dim} />
                  {pill}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: `1px solid ${C.hairline}`, padding: '48px 32px', background: C.raised }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 32 }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }} aria-label="Saguaro Control Systems — home">
              <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 30, width: 'auto', mixBlendMode: 'screen', objectFit: 'contain' }} />
            </Link>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { label: 'Home', href: '/' }, { label: 'Features', href: '/features' },
                { label: 'Compare', href: '/compare' },
                { label: 'The App', href: '/get-the-app' }, { label: 'Privacy', href: '/privacy' }, { label: 'Terms', href: '/terms' },
              ].map(link => (
                <a key={link.label} href={link.href} style={{ fontSize: 13, color: C.dim, textDecoration: 'none', fontWeight: 500 }}>{link.label}</a>
              ))}
            </div>
            <div style={{ fontSize: 12, color: C.dim, whiteSpace: 'nowrap' }}>&copy; {new Date().getFullYear()} Saguaro Control Systems</div>
          </div>
        </footer>

      </div>
    </div>
  );
}
