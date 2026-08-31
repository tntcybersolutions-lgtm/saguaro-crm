'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import MarketingNav from '@/components/MarketingNav';
import { TRIAL_DAYS } from '@/lib/plans';

const C = {
  dark: '#0B0B0F',
  gold: '#F59E0B',
  goldBright: '#FBBF24',
  text: '#F5F5F7',
  dim: '#A1A1AA',
  border: 'rgba(255,255,255,0.10)',
  hairline: 'rgba(255,255,255,0.08)',
  cardBg: 'rgba(255,255,255,0.02)',
  raised: '#131318',
  raisedAlt: '#1A1A21',
  green: '#22C55E',
  blue: '#6366F1',
  font: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

const NAV_LINKS = [
  { label: 'Product', href: '/product' },
  { label: 'The App', href: '/get-the-app' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Compare', href: '/compare' },
];

/* House display treatment — gold text-shine on ONE key word per heading. */
const SHINE: React.CSSProperties = {
  background: 'linear-gradient(100deg, #F59E0B 6%, #F5B84D 38%, #FDE68A 56%, #F59E0B 92%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
};

const STEPS = [
  {
    title: 'Import your project & plans',
    lead: 'Spin up a new project in seconds, then drag in your plan sets. Saguaro AI Takeoff reads your PDFs page by page — measuring areas, counting fixtures, and pulling dimensions automatically.',
    points: [
      'Upload full plan sets (PDF, DWG) — no manual page splitting',
      'AI Takeoff reads scales and measures linear feet, square feet & counts',
      'Every sheet, RFI, and submittal lives under one project record',
    ],
  },
  {
    title: 'Build bids & estimates',
    lead: 'Turn takeoff quantities into a priced estimate without rekeying. Sage AI assembles line items from your cost catalog, and Bid Intelligence flags scope gaps and risky allowances before you send.',
    points: [
      'Sage AI drafts line items from takeoff quantities + your unit costs',
      'Bid Intelligence benchmarks your numbers and catches missing scope',
      'Generate a branded bid jacket and send to the owner in a click',
    ],
  },
  {
    title: 'Run the field',
    lead: 'Your crews carry the Saguaro Control Systems app on iPhone or Android. Daily logs, jobsite photos, punch lists, and safety inspections are captured on site — and it all works offline when signal drops.',
    points: [
      'Daily logs, photos, and weather captured from the jobsite',
      'Punch lists and safety / toolbox-talk forms with sign-off',
      'Works fully offline — syncs the moment you regain a connection',
    ],
  },
  {
    title: 'Manage the money',
    lead: 'Run the financial side of every job from the same record. Generate AIA pay applications, route change orders and RFIs for approval, and track subcontractor compliance so nothing slips through the cracks.',
    points: [
      'AIA G702 / G703 pay applications with continuation sheets',
      'Change orders & RFIs with a clear approval trail',
      'COI and compliance tracking — expiring certs flagged before they lapse',
    ],
  },
  {
    title: 'Collaborate through portals',
    lead: 'Give owners and subcontractors their own secure portal instead of an endless email thread. They see exactly what they need — approvals, draws, documents — and every action is logged against the project.',
    points: [
      'Owner portal for pay-app approvals and project visibility',
      'Sub portal for documents, lien waivers, and insurance uploads',
      'Branded, permissioned access — no extra seat licenses required',
    ],
  },
  {
    title: 'Close out & report',
    lead: 'Wrap the job cleanly and keep the records. Assemble closeout packages, capture final lien waivers, and pull profitability and production reports across every project from one dashboard.',
    points: [
      'Closeout packages: warranties, O&M manuals, as-builts in one bundle',
      'Final unconditional lien waivers — statutory language for all 50 states',
      'Portfolio dashboards: budget vs. actual, production, and margin by job',
    ],
  },
];

const MIGRATION_POINTS = [
  'Projects, contacts, vendors & subs',
  'Documents, drawings & bid history',
  'Pay apps, change orders & lien waiver records',
  'Team accounts, roles & permissions',
];

const FAQS = [
  {
    q: 'How long does it take to get up and running?',
    a: 'Most teams are live the same day. Sign up, run the 5-minute company setup wizard, and invite your team. If you are migrating from another platform, our team moves your data over in 1 business day — you keep working in the meantime.',
  },
  {
    q: 'Does the Saguaro Control Systems app really work offline?',
    a: 'Yes. Daily logs, photos, punch items, and safety forms are all captured on-device. When the crew is in a basement, a remote site, or a dead zone, everything is stored locally and syncs automatically the moment a connection returns.',
  },
  {
    q: 'Do I need to do my own takeoff before I can bid?',
    a: 'No. Upload your plan PDFs and AI Takeoff reads them for you — measuring areas, counting fixtures, and pulling dimensions. You review and adjust the quantities, then Sage AI turns them into a priced estimate from your cost catalog.',
  },
  {
    q: 'Can owners and subcontractors access the platform?',
    a: 'Yes, through secure portals. Owners get a portal for pay-app approvals and project visibility; subs get one for documents, lien waivers, and insurance. Portal access does not consume a user seat — Saguaro includes unlimited users on every plan.',
  },
];

function CheckIcon({ size = 16, color = C.green }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
      <circle cx="8" cy="8" r="8" fill={`${color}22`} />
      <path d="M4.5 8l2.5 2.5 4-5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function HowItWorksPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div style={{ minHeight: '100vh', background: C.dark, color: C.text, fontFamily: C.font }}>

      {/* Nav */}
      {/* One professional nav across every marketing page (fixed, 58px). */}
      <MarketingNav />
      <div style={{ height: 58 }} />

      <div style={{ paddingTop: 64 }}>

        {/* Hero */}
        <section style={{ textAlign: 'center', padding: '120px 24px 72px', background: 'transparent' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 12, fontWeight: 500, color: C.dim, letterSpacing: 0.3, marginBottom: 28 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, display: 'inline-block' }} />
            How it works
          </div>
          <h1 style={{ fontSize: 'clamp(30px, 4.6vw, 44px)', fontWeight: 800, lineHeight: 1.12, margin: '0 0 18px', letterSpacing: '-0.02em' }}>
            From blueprint to closeout{' '}
            in <span style={SHINE}>one platform</span>.
          </h1>
          <p style={{ fontSize: 'clamp(15px, 2vw, 17px)', color: C.dim, maxWidth: 620, margin: '0 auto 36px', lineHeight: 1.65 }}>
            Saguaro Control Systems runs the whole job — AI takeoff, bidding, the field app, pay apps, owner and sub portals, and closeout — so your team works in one system instead of a dozen disconnected tools.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup" style={{ display: 'inline-block', padding: '12px 28px', background: C.gold, borderRadius: 8, color: '#0B0B0F', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
              Start Free Trial — No Credit Card
            </Link>
            <Link href="/features" style={{ display: 'inline-block', padding: '12px 28px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 8, color: C.dim, fontWeight: 500, fontSize: 15, textDecoration: 'none' }}>
              Explore Features
            </Link>
          </div>
        </section>

        {/* Steps */}
        <section style={{ padding: '0 24px 96px', maxWidth: 860, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: C.dim, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 }}>
              The Workflow
            </div>
            <h2 style={{ fontSize: 'clamp(20px, 3vw, 22px)', fontWeight: 600, margin: '0 0 12px', letterSpacing: -0.3 }}>Six steps, one source of truth</h2>
            <p style={{ fontSize: 16, color: C.dim, maxWidth: 540, margin: '0 auto', lineHeight: 1.6 }}>
              Every stage of the project hands off cleanly to the next — no exporting, no rekeying, no lost paperwork.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {STEPS.map((step, i) => (
              <div key={step.title} style={{ display: 'flex', gap: 24, alignItems: 'flex-start', padding: '32px 0', borderBottom: i < STEPS.length - 1 ? `1px solid ${C.hairline}` : 'none' }}>
                <div style={{ flexShrink: 0, width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, color: C.text }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: C.dim, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Step {i + 1}</div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, color: C.text, margin: '0 0 10px', letterSpacing: -0.2 }}>{step.title}</h3>
                  <p style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.7, margin: '0 0 16px' }}>{step.lead}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {step.points.map(p => (
                      <div key={p} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <CheckIcon size={16} color={C.green} />
                        <span style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Migration section */}
        <section style={{ padding: '0 24px 96px', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ background: C.cardBg, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '40px 48px', display: 'flex', gap: 48, alignItems: 'center', flexWrap: 'wrap', boxShadow: 'none' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: C.dim, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Coming from Procore?</div>
              <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 12px', lineHeight: 1.25 }}>We handle your migration. You do the heavy lifting on the job site.</h2>
              <p style={{ fontSize: 15, color: C.dim, margin: '0 0 24px', lineHeight: 1.65 }}>
                Switching platforms shouldn&apos;t mean losing months of history. Our team migrates everything from Procore, Buildertrend, CoConstruct, or a stack of spreadsheets — and you keep working the entire time. You go live the next business day.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {MIGRATION_POINTS.map(item => (
                  <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <CheckIcon size={15} color={C.green} />
                    <span style={{ fontSize: 14, color: C.text }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 44, fontWeight: 600, color: C.text, lineHeight: 1 }}>1</div>
              <div style={{ fontSize: 14, color: C.dim, textAlign: 'center' }}>business day<br />to go live</div>
              <Link href="/signup" style={{ padding: '12px 24px', background: C.gold, borderRadius: 8, color: '#0B0B0F', fontWeight: 600, fontSize: 14, textDecoration: 'none', textAlign: 'center' }}>
                Start Your Migration
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={{ padding: '0 24px 112px', maxWidth: 760, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: C.dim, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 }}>FAQ</div>
            <h2 style={{ fontSize: 'clamp(20px, 3vw, 22px)', fontWeight: 600, margin: 0, letterSpacing: -0.3 }}>Common questions</h2>
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

        {/* Final CTA */}
        <section style={{ padding: '112px 24px', background: 'transparent', borderTop: `1px solid ${C.hairline}`, textAlign: 'center' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 32px)', fontWeight: 800, margin: '0 0 16px', lineHeight: 1.15, letterSpacing: '-0.02em' }}>
              See your <span style={SHINE}>whole job</span> in{' '}
              one platform.
            </h2>
            <p style={{ fontSize: 16, color: C.dim, margin: '0 0 36px', lineHeight: 1.6 }}>
              {TRIAL_DAYS}-day free trial. Free migration. No credit card required. Your whole team, one flat rate.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
              <Link href="/signup" style={{ display: 'inline-block', padding: '12px 28px', background: C.gold, borderRadius: 8, color: '#0B0B0F', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
                Start Free Trial — No CC Required
              </Link>
              <Link href="/pricing" style={{ display: 'inline-block', padding: '12px 28px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 8, color: C.dim, fontWeight: 500, fontSize: 15, textDecoration: 'none' }}>
                View Pricing
              </Link>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[`${TRIAL_DAYS} days free`, 'Free migration', 'Cancel anytime', 'No per-seat fees', 'Unlimited users'].map(pill => (
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
