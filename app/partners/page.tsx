'use client';
import React, { useState } from 'react';
import Link from 'next/link';

const C = {
  dark: 'var(--bg-base)',
  gold: 'var(--brand-primary)',
  goldBright: 'var(--brand-primary-strong)',
  text: '#F5F5F7',
  dim: '#A1A1AA',
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
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'The App', href: '/get-the-app' },
  { label: 'Compare', href: '/compare' },
];

// ── Integrations ──────────────────────────────────────────────────────────
const INTEGRATIONS = [
  {
    name: 'QuickBooks',
    category: 'Accounting',
    status: 'Live',
    accent: '#2CA01C',
    abbr: 'QB',
    desc: 'Bidirectional sync of budgets, pay applications, and change orders with QuickBooks Online and Desktop. Cost codes map to your chart of accounts so AIA G702/G703 draws post straight to your books.',
    bullets: [
      'Two-way sync of pay apps & change orders',
      'Cost-code to chart-of-accounts mapping',
      'Vendor & customer record matching',
      'Retention and lien-release tracking',
    ],
  },
  {
    name: 'Stripe',
    category: 'Payments',
    status: 'Live',
    accent: '#635BFF',
    abbr: 'S',
    desc: 'Collect owner payments and subcontractor disbursements directly from approved pay applications. ACH and card payments settle against the draw schedule, with receipts attached to the project ledger automatically.',
    bullets: [
      'Owner billing from approved G702 draws',
      'ACH & card payouts to subcontractors',
      'Automated receipts on the project ledger',
      'PCI-compliant — no card data touches Saguaro',
    ],
  },
  {
    name: 'DocuSign',
    category: 'E-Signature',
    status: 'Live',
    accent: '#FFCC22',
    abbr: 'DS',
    desc: 'Send contracts, change orders, and lien waivers for legally binding signature without leaving the project. Executed documents flow back into compliance tracking and the audit trail the moment they are signed.',
    bullets: [
      'Subcontracts & change orders out for signature',
      'Conditional & unconditional lien waivers',
      'Signature status synced to compliance log',
      'Tamper-evident audit trail on every envelope',
    ],
  },
  {
    name: 'Autodesk',
    category: 'Design & BIM',
    status: 'Live',
    accent: '#0696D7',
    abbr: 'AD',
    desc: 'Pull drawing sets and sheet revisions from Autodesk Construction Cloud and Build directly into Saguaro AI Takeoff. When the architect issues a new revision, the takeoff flags affected scopes for re-measure.',
    bullets: [
      'Sheet & revision sync from ACC / Build',
      'Drawings feed Saguaro AI Takeoff',
      'Revision-aware re-measure alerts',
      'RFI references link back to the model',
    ],
  },
  {
    name: 'Procore',
    category: 'Migration',
    status: 'Live',
    accent: '#F47E42',
    abbr: 'PC',
    desc: 'Import every project, contact, document, RFI, and submittal from Procore in a single guided migration. Our team maps your modules to Saguaro and you go live in one business day — at no cost.',
    bullets: [
      'Full project & directory import',
      'RFIs, submittals & daily logs preserved',
      'Document history kept intact',
      'White-glove migration in one business day',
    ],
  },
  {
    name: 'Sage 300 CRE',
    category: 'Accounting',
    status: 'Beta',
    accent: '#00DC8C',
    abbr: 'SG',
    desc: 'Connect Saguaro pay applications and job-cost data to Sage 300 Construction and Real Estate. Job cost, AP, and AR records reconcile against the same draw schedule your field and accounting teams already use.',
    bullets: [
      'Job-cost & commitment sync',
      'AP / AR reconciliation by project',
      'Draw schedule shared across teams',
      'Now in private beta — request access',
    ],
  },
  {
    name: 'Google Drive',
    category: 'Documents',
    status: 'Live',
    accent: '#1FA463',
    abbr: 'GD',
    desc: 'Back project documents, generated AIA forms, and photo logs to a connected Google Drive folder. Files stay organized by project and sync automatically so your records live in two places at once.',
    bullets: [
      'Auto-backup of generated documents',
      'Project-foldered photo & daily logs',
      'Shared-drive support for your org',
      'Two-way file sync',
    ],
  },
  {
    name: 'Open REST API',
    category: 'Developer',
    status: 'Live',
    accent: '#FF8A00',
    abbr: 'API',
    desc: 'A full REST API and webhook system for building custom workflows on top of Saguaro. Read and write projects, pay apps, RFIs, and takeoffs, and subscribe to real-time events from your own stack.',
    bullets: [
      'REST endpoints for every core object',
      'Outbound webhooks on key events',
      'Scoped API keys per integration',
      'OpenAPI spec & sandbox environment',
    ],
  },
];

const STATUS_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  Live: { color: C.green, bg: 'transparent', border: 'rgba(44,255,122,0.30)' },
  Beta: { color: C.dim, bg: 'transparent', border: 'rgba(255,255,255,0.14)' },
};

const CATEGORIES = ['All', 'Accounting', 'Payments', 'E-Signature', 'Design & BIM', 'Documents', 'Migration', 'Developer'];

// ── Partner program tiers ─────────────────────────────────────────────────
const PARTNER_TIERS = [
  {
    name: 'Referral Partner',
    tagline: 'Send us business, earn recurring revenue',
    icon: 'handshake',
    features: [
      '20% recurring commission for 12 months',
      'Co-branded referral links & tracking',
      'No technical work required',
      'Quarterly payouts via Stripe',
    ],
    cta: 'Become a Referral Partner',
    popular: false,
  },
  {
    name: 'Solution Partner',
    tagline: 'Implement & resell under your brand',
    icon: 'layers',
    features: [
      'White-label your brand & domain',
      'Wholesale pricing on every plan',
      'Dedicated partner success manager',
      'Co-marketing & lead sharing',
      'Priority roadmap input',
    ],
    cta: 'Apply as a Solution Partner',
    popular: true,
  },
  {
    name: 'Technology Partner',
    tagline: 'Build an integration on our API',
    icon: 'plug',
    features: [
      'Full REST API & webhook access',
      'Sandbox tenant for development',
      'Listing in the Saguaro directory',
      'Engineering co-build support',
    ],
    cta: 'Build on Saguaro',
    popular: false,
  },
];

// ── How it works ──────────────────────────────────────────────────────────
const STEPS = [
  { step: '1', title: 'Apply', desc: 'Tell us about your firm, your clients, and the construction workflows you serve. Most applications are reviewed within two business days.' },
  { step: '2', title: 'Onboard', desc: 'Get a sandbox tenant, partner pricing, and a dedicated contact. We co-build your integration or set up your white-label workspace.' },
  { step: '3', title: 'Launch', desc: 'Go live with co-marketing support, a directory listing, and tracking links. Your customers migrate from any platform free of charge.' },
  { step: '4', title: 'Grow', desc: 'Earn recurring revenue, share leads, and shape the roadmap. Quarterly business reviews keep the partnership compounding.' },
];

const FAQS = [
  { q: 'How much does it cost to become a partner?', a: 'Nothing. The Saguaro Partner Program is free to join across all three tiers. Referral Partners earn commission, Solution Partners buy at wholesale and set their own retail price, and Technology Partners get free API and sandbox access.' },
  { q: 'Do you really migrate my clients for free?', a: 'Yes. Every customer you bring over gets free white-glove migration from Procore, Buildertrend, CoConstruct, Sage, or spreadsheets. Our team handles projects, contacts, documents, RFIs, and history — usually live in one business day.' },
  { q: 'Can I white-label Saguaro under my own brand?', a: 'Solution Partners can fully white-label the platform with your brand, logo, and custom domain. Each of your clients gets a sandboxed tenant with row-level data isolation, and your team manages them from a single partner console.' },
  { q: 'What does the API support?', a: 'The Open REST API exposes projects, pay applications, RFIs, change orders, takeoffs, contacts, and documents, plus outbound webhooks for real-time events. Technology Partners get scoped API keys, an OpenAPI spec, and a sandbox tenant to build against.' },
  { q: 'How and when are commissions paid?', a: 'Referral Partners earn 20% of subscription revenue for the first 12 months of each referred account, paid quarterly via Stripe. Tracking is fully transparent in your partner dashboard so you always see attributed signups and pending payouts.' },
  { q: 'Is there support for building an integration?', a: 'Yes. Technology Partners get engineering co-build support, a dedicated Slack channel, and a private beta path. Once your integration is live it is listed in the Saguaro integrations directory in front of every customer.' },
];

function CheckIcon({ size = 16, color = C.green }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="8" cy="8" r="8" fill={`color-mix(in srgb, ${color} 13%, transparent)`} />
      <path d="M4.5 8l2.5 2.5 4-5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TierIcon({ name, color }: { name: string; color: string }) {
  const common = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'handshake') {
    return (
      <svg {...common}>
        <path d="M11 17l2 2a1 1 0 0 0 3-3" />
        <path d="M14 14l2.5 2.5a1 1 0 0 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 0 1-1.42 0l-1.06-1.06a1 1 0 0 0-1.41 0L4 12.5" />
        <path d="M21 3l-5 5" />
        <path d="M3 3l5 5" />
      </svg>
    );
  }
  if (name === 'layers') {
    return (
      <svg {...common}>
        <path d="M12 2l9 5-9 5-9-5 9-5z" />
        <path d="M3 12l9 5 9-5" />
        <path d="M3 17l9 5 9-5" />
      </svg>
    );
  }
  // plug
  return (
    <svg {...common}>
      <path d="M9 2v6" />
      <path d="M15 2v6" />
      <path d="M6 8h12v3a6 6 0 0 1-12 0V8z" />
      <path d="M12 17v5" />
    </svg>
  );
}

export default function PartnersPage() {
  const [filter, setFilter] = useState('All');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const shown = filter === 'All' ? INTEGRATIONS : INTEGRATIONS.filter(i => i.category === filter);

  return (
    <div className="mkt-page" style={{ minHeight: '100vh', background: C.dark, color: C.text, fontFamily: C.font }}>
      <style>{`@media (max-width: 768px){ .partners-mnav-links{ display:none !important } }`}</style>

      {/* Nav */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        height: 64, background: 'rgba(13,17,23,0.9)',
        borderBottom: `1px solid ${C.hairline}`,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', padding: '0 32px', gap: 0,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0, marginRight: 40 }} aria-label="Saguaro Control Systems — home">
          <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 36, width: 'auto', mixBlendMode: 'screen', objectFit: 'contain' }} />
        </Link>
        <div className="partners-mnav-links" style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
          {NAV_LINKS.map(link => (
            <Link key={link.label} href={link.href} style={{ padding: '6px 12px', borderRadius: 6, color: C.dim, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>
              {link.label}
            </Link>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/login" style={{ padding: '8px 16px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 8, color: C.dim, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>Log In</Link>
          <Link href="/signup" style={{ padding: '8px 18px', background: C.gold, borderRadius: 8, color: '#0A0A00', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Free Trial</Link>
        </div>
      </nav>

      <div style={{ paddingTop: 64 }}>

        {/* Hero */}
        <section style={{ textAlign: 'center', padding: '120px 24px 72px', background: 'transparent' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 12, fontWeight: 500, color: C.dim, letterSpacing: 0.3, marginBottom: 28 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, display: 'inline-block' }} />
            Saguaro Partner Program
          </div>

          <h1 style={{ fontWeight: 600, lineHeight: 1.15, margin: '0 0 18px', letterSpacing: -0.5 }}>
            Connect the Tools{' '}
            <span style={{ color: C.text }}>
              Your Crews Already Run On
            </span>
          </h1>
          <p style={{ fontSize: 'clamp(15px, 2vw, 17px)', color: C.dim, maxWidth: 620, margin: '0 auto 36px', lineHeight: 1.65 }}>
            Saguaro Control Systems connects to QuickBooks, Stripe, DocuSign, and Autodesk — and the Open API lets anyone build more. Integrate, resell, or refer, and grow alongside the AI-powered construction platform.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup" style={{ display: 'inline-block', padding: '12px 28px', background: C.gold, borderRadius: 8, color: '#0A0A00', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
              Start Free — Connect Your Stack
            </Link>
            <a href="#become-a-partner" style={{ display: 'inline-block', padding: '12px 28px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 8, color: C.dim, fontWeight: 500, fontSize: 15, textDecoration: 'none' }}>
              Become a Partner
            </a>
          </div>
        </section>

        {/* Integrations */}
        <section style={{ padding: '0 24px 96px', maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 16 }}>
              Integrations
            </div>
            <h2 style={{ fontWeight: 600, margin: '0 0 12px', letterSpacing: -0.3 }}>Works with the Tools You Already Use</h2>
            <p style={{ fontSize: 16, color: C.dim, maxWidth: 560, margin: '0 auto' }}>Push pay apps to your books, collect payments, sign documents, and pull drawings — without leaving the project.</p>
          </div>

          {/* Category filter */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 36 }}>
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setFilter(cat)} style={{
                padding: '7px 16px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: C.font,
                background: filter === cat ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: `1px solid ${C.hairline}`,
                color: filter === cat ? C.text : C.dim,
                transition: 'background 0.15s, color 0.15s',
              }}>
                {cat}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 20 }}>
            {shown.map(intg => {
              const s = STATUS_STYLES[intg.status];
              return (
                <div key={intg.name} style={{ background: 'transparent', borderTop: `1px solid ${C.hairline}`, borderRadius: 0, padding: '24px 4px', boxShadow: 'none', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: `${intg.accent}14`, border: `1px solid ${intg.accent}3D`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: intg.abbr.length > 2 ? 13 : 16, color: intg.accent, letterSpacing: 0.5 }}>
                      {intg.abbr}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{intg.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 500, color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 999, padding: '2px 8px' }}>{intg.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>{intg.category}</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, margin: '0 0 18px' }}>{intg.desc}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 'auto' }}>
                    {intg.bullets.map(b => (
                      <div key={b} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <CheckIcon size={15} color={C.green} />
                        <span style={{ fontSize: 13, color: C.text, lineHeight: 1.45 }}>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Partner program tiers */}
        <section id="become-a-partner" style={{ padding: '0 24px 96px', maxWidth: 1160, margin: '0 auto', scrollMarginTop: 80 }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 16 }}>
              Partner Program
            </div>
            <h2 style={{ fontWeight: 600, margin: '0 0 12px', letterSpacing: -0.3 }}>Three Ways to Partner with Saguaro</h2>
            <p style={{ fontSize: 16, color: C.dim, maxWidth: 540, margin: '0 auto' }}>Refer business, resell under your own brand, or build on our API. Free to join — every tier.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, alignItems: 'start' }}>
            {PARTNER_TIERS.map(tier => (
              <div key={tier.name} style={{
                background: C.cardBg,
                border: tier.popular ? `1px solid color-mix(in srgb, var(--brand-primary) 45%, transparent)` : `1px solid ${C.hairline}`,
                borderRadius: 14, overflow: 'hidden', position: 'relative',
                marginTop: 0,
                boxShadow: 'none',
              }}>
                {tier.popular && (
                  <div style={{ background: C.gold, textAlign: 'center', padding: '7px 0', fontSize: 11, fontWeight: 600, color: '#0A0A00' }}>
                    Most Popular
                  </div>
                )}
                <div style={{ padding: '30px 28px 28px' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                    <TierIcon name={tier.icon} color={C.text} />
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 4 }}>{tier.name}</div>
                  <div style={{ fontSize: 13, color: C.dim, marginBottom: 22 }}>{tier.tagline}</div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 26 }}>
                    {tier.features.map(f => (
                      <div key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <CheckIcon size={16} color={C.green} />
                        <span style={{ fontSize: 14, color: C.text, lineHeight: 1.45, fontWeight: 400 }}>{f}</span>
                      </div>
                    ))}
                  </div>

                  <a href="mailto:partners@saguarocontrol.net" style={{
                    display: 'block', textAlign: 'center', padding: '12px 0',
                    background: tier.popular ? C.gold : 'transparent',
                    border: tier.popular ? '1px solid transparent' : `1px solid ${C.hairline}`,
                    borderRadius: 8, color: tier.popular ? '#0A0A00' : C.text,
                    fontWeight: 600, fontSize: 14, textDecoration: 'none', letterSpacing: 0.2,
                    boxShadow: 'none',
                  }}>
                    {tier.cta}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section style={{ padding: '0 24px 96px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ background: 'transparent', border: 'none', borderRadius: 0, padding: 0 }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 8 }}>How It Works</div>
              <h2 style={{ fontSize: 22, fontWeight: 600, color: C.text, margin: 0 }}>From Application to Recurring Revenue</h2>
              <p style={{ fontSize: 14, color: C.dim, margin: '8px 0 0' }}>A straightforward path. Most partners are live within a week.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 0 }}>
              {STEPS.map((s, i, arr) => (
                <div key={s.step} style={{ padding: '0 28px', borderRight: i < arr.length - 1 ? `1px solid ${C.hairline}` : 'none' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 14 }}>
                    {s.step}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Become a partner CTA banner */}
        <section style={{ padding: '0 24px 96px', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ background: C.cardBg, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '40px 48px', display: 'flex', gap: 48, alignItems: 'center', flexWrap: 'wrap', boxShadow: 'none' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 12 }}>Become a Partner</div>
              <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 12px', lineHeight: 1.25 }}>Build a Business on the Construction Platform GCs Love</h2>
              <p style={{ fontSize: 15, color: C.dim, margin: '0 0 24px', lineHeight: 1.65 }}>
                Whether you serve general contractors as a consultant, run a software company, or want to refer the firms in your network, there is a tier for you. Free migration for every customer you bring. Recurring revenue for you.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {['Free to join — no setup fees', 'Wholesale & white-label options', 'Dedicated partner success manager', 'Co-marketing & lead sharing'].map(item => (
                  <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <CheckIcon size={15} color={C.green} />
                    <span style={{ fontSize: 14, color: C.text }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', minWidth: 220 }}>
              <div style={{ fontSize: 44, fontWeight: 600, color: C.text, lineHeight: 1 }}>20%</div>
              <div style={{ fontSize: 14, color: C.dim, textAlign: 'center' }}>Recurring Commission<br />for 12 Months</div>
              <a href="mailto:partners@saguarocontrol.net" style={{ padding: '12px 24px', background: C.gold, borderRadius: 8, color: '#0A0A00', fontWeight: 600, fontSize: 14, textDecoration: 'none', textAlign: 'center' }}>
                Apply to Partner
              </a>
              <Link href="/signup" style={{ fontSize: 13, color: C.gold, textDecoration: 'none', fontWeight: 500 }}>Or Start a Free Trial First →</Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={{ padding: '0 24px 96px', maxWidth: 760, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 16 }}>FAQ</div>
            <h2 style={{ fontWeight: 600, margin: 0, letterSpacing: -0.3 }}>Partner Program Questions</h2>
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
                  <div style={{ padding: '0 0 22px', fontSize: 15, color: C.dim, lineHeight: 1.75, maxWidth: 660 }}>{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section style={{ padding: '112px 24px', background: 'transparent', borderTop: `1px solid ${C.hairline}`, textAlign: 'center' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{ fontWeight: 600, margin: '0 0 16px', lineHeight: 1.2, letterSpacing: -0.4 }}>
              Let&apos;s Build{' '}
              <span style={{ color: C.text }}>Something Together</span>
            </h2>
            <p style={{ fontSize: 16, color: C.dim, margin: '0 0 36px', lineHeight: 1.6 }}>
              Connect your stack on a free trial, or apply to the partner program and grow with the AI-powered construction platform.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
              <Link href="/signup" style={{ display: 'inline-block', padding: '12px 28px', background: C.gold, borderRadius: 8, color: '#0A0A00', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
                Start Free Trial — No CC Required
              </Link>
              <a href="mailto:partners@saguarocontrol.net" style={{ display: 'inline-block', padding: '12px 28px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 8, color: C.dim, fontWeight: 500, fontSize: 15, textDecoration: 'none' }}>
                Contact the Partner Team
              </a>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {['Free to Join', 'Recurring Commission', 'White-Label Ready', 'Open REST API', 'Free Customer Migration'].map(pill => (
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
                { label: 'Pricing', href: '/pricing' }, { label: 'Partners', href: '/partners' },
                { label: 'The App', href: '/get-the-app' }, { label: 'Privacy', href: '/privacy' }, { label: 'Terms', href: '/terms' },
              ].map(link => (
                <Link key={link.label} href={link.href} style={{ fontSize: 13, color: C.dim, textDecoration: 'none', fontWeight: 500 }}>{link.label}</Link>
              ))}
            </div>
            <div style={{ fontSize: 12, color: C.dim, whiteSpace: 'nowrap' }}>&copy; {new Date().getFullYear()} Saguaro Control Systems</div>
          </div>
        </footer>

      </div>
    </div>
  );
}
