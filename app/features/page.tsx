import React from 'react';
import Link from 'next/link';
import { IntegrationStrip } from '@/components/Integrations';
import MarketingNav from '@/components/MarketingNav';
import { TRIAL_DAYS } from '@/lib/plans';

const C = {
  dark: '#0a0a0a',
  gold: '#F59E0B',
  goldBright: '#FBBF24',
  text: '#FFFFFF',
  dim: '#CBD5E1',
  border: 'rgba(255,255,255,0.08)',
  raised: '#141416',
  raisedAlt: '#141416',
  green: '#22C55E',
  blue: '#6366F1',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,system-ui,sans-serif",
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

type Feature = {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
};

const FEATURES: Feature[] = [
  {
    eyebrow: 'Preconstruction',
    title: 'AI Blueprint Takeoff',
    description:
      'Upload your PDF plan set and Saguaro reads it the way an estimator does. The AI identifies walls, doors, fixtures, and assemblies across every sheet, then returns measured quantities you can drop straight into a bid. What used to take a half-day with a scale wheel now takes minutes, and every count is traceable back to the page it came from.',
    bullets: [
      'Reads multi-page architectural, structural, and MEP plan sets',
      'Auto-generates linear, area, and count quantities by trade',
      'Scale detection and manual override on any measurement',
      'Exports takeoff line items directly into a bid or estimate',
    ],
  },
  {
    eyebrow: 'AI Assistant',
    title: 'Sage AI Assistant',
    description:
      'Sage is the assistant that actually knows your jobs. Ask it anything about a project — open RFIs, the latest change order total, who signed the last pay app — and it answers from your live data. It also drafts the paperwork for you: hand it a question from the field and it writes a clean RFI; describe a scope change and it produces a change order ready for review.',
    bullets: [
      'Natural-language answers grounded in your real project data',
      'Drafts RFIs, change orders, and email responses on request',
      'Summarizes daily logs, submittals, and budget movement',
      'Surfaces overdue items and risks before they become problems',
    ],
  },
  {
    eyebrow: 'Estimating',
    title: 'Bid Management & Intelligence',
    description:
      'Run your whole bid process in one place — from inviting subs to leveling their numbers. Saguaro tracks every invitation, bid, and decline, then helps you compare apples to apples across trades. Bid Intelligence flags coverage gaps, outlier pricing, and scope holes so you submit with confidence instead of guesswork.',
    bullets: [
      'Invite subs, track responses, and chase non-responders automatically',
      'Side-by-side bid leveling with scope-gap detection',
      'Bid jacket generation with cover sheets and scope letters',
      'Historical cost data to sanity-check new numbers',
    ],
  },
  {
    eyebrow: 'Billing',
    title: 'Pay Applications (G702/G703)',
    description:
      'Generate AIA-style G702 and G703 pay applications without rebuilding a spreadsheet every month. Saguaro carries your schedule of values forward, calculates retainage and stored materials, and keeps a running record of prior billings. Send them to the owner for signature and the whole approval trail lives in one place.',
    bullets: [
      'Full G702 / G703 continuation sheets from your schedule of values',
      'Automatic retainage, stored materials, and prior-billing math',
      'Owner e-signature and an auditable approval history',
      'Roll up billing across every active project in one view',
    ],
  },
  {
    eyebrow: 'Project Controls',
    title: 'RFIs & Change Orders',
    description:
      'Keep cost and schedule impacts from slipping through the cracks. Log RFIs against the right drawing and spec, route them to the design team, and track every response with a clock running. When a change is needed, turn the answer into a change order in a click and watch it flow into the budget and pay app automatically.',
    bullets: [
      'RFIs linked to drawings, specs, and responsible parties',
      'Ball-in-court tracking with due dates and aging',
      'Convert an RFI response into a change order instantly',
      'Change orders update the budget and schedule of values',
    ],
  },
  {
    eyebrow: 'Field',
    title: 'Daily Logs & Field App (Saguaro Control Systems — Construction Management & Project Controls)',
    description:
      'Saguaro Control Systems — Construction Management & Project Controls puts the jobsite in your crew\'s pocket. Supers log manpower, weather, deliveries, and progress photos in seconds — with GPS stamps that confirm they were on site. The app works fully offline in the field and syncs the moment a signal comes back, so a dead zone never means a lost log.',
    bullets: [
      'One-tap daily logs with weather, manpower, and photo attachments',
      'GPS-stamped entries and time-clock for accurate field records',
      'Full offline mode that syncs automatically when reconnected',
      'Available on iPhone and Android — no per-device fees',
    ],
  },
  {
    eyebrow: 'Closeout',
    title: 'Punch Lists & Inspections',
    description:
      'Walk the job with your phone and build the punch list as you go. Pin items to a location, attach a photo, and assign them to the responsible sub. Inspections follow the same flow — run a checklist, capture deficiencies, and track every item to verified completion so closeout never drags.',
    bullets: [
      'Photo-pinned punch items assigned to subs with due dates',
      'Reusable inspection checklists for quality and pre-installation',
      'Real-time open/closed status across every trade',
      'Sign-off trail that documents verified completion',
    ],
  },
  {
    eyebrow: 'Safety',
    title: 'Safety (Incidents, Toolbox Talks, JHA)',
    description:
      'Run a safety program your insurer and OSHA will respect. Document incidents and near-misses the moment they happen, deliver and record toolbox talks, and build Job Hazard Analyses for high-risk tasks. Everything is logged, timestamped, and ready to produce when someone asks for proof.',
    bullets: [
      'Incident and near-miss reporting with photos and witnesses',
      'Toolbox talk library with crew sign-in tracking',
      'Job Hazard Analysis (JHA) builder for high-risk work',
      'Feeds the OSHA 300 log automatically',
    ],
  },
  {
    eyebrow: 'Compliance',
    title: 'Submittals & Compliance',
    description:
      'Stay ahead of the paperwork that stalls jobs and holds payments. Track submittals through review, monitor every subcontractor\'s certificate of insurance against your requirements, and collect lien waivers tied to each pay application. Saguaro warns you before a COI lapses so an expired policy never catches you off guard.',
    bullets: [
      'Submittal logs with revision tracking and review status',
      'Certificate of insurance (COI) tracking with expiration alerts',
      'Lien waivers for all 50 states tied to each payment',
      'Compliance dashboard for every sub on every project',
    ],
  },
  {
    eyebrow: 'Stakeholders',
    title: 'Owner & Subcontractor Portals',
    description:
      'Give owners and subs their own secure window into the work — without handing them the keys. Owners review and approve pay applications and change orders from a clean portal. Subs submit invoices, sign waivers, and upload insurance documents themselves, which means less chasing for your team and a faster path to getting paid.',
    bullets: [
      'Owner portal for pay app and change order review and approval',
      'Subcontractor portal for invoices, waivers, and COI uploads',
      'Scoped permissions so each party sees only what it should',
      'Automatic notifications when action is needed',
    ],
  },
  {
    eyebrow: 'Insights',
    title: 'Financials & Reporting',
    description:
      'See where every project really stands. Saguaro tracks budgets, commitments, and actuals in real time, projecting cost-to-complete and flagging jobs that are drifting. Roll the numbers up across your whole portfolio for a true picture of margin, cash flow, and exposure — no month-end spreadsheet marathon required.',
    bullets: [
      'Live budget, commitment, and cost-to-complete tracking',
      'Cash-flow and projected-margin reporting per project',
      'Portfolio roll-ups across every active job',
      'Exportable reports for owners, lenders, and accounting',
    ],
  },
];

const REPLACES = [
  'Procore',
  'Stacks of Spreadsheets',
  'Bluebeam (takeoff)',
  'Standalone Bid Software',
  'DocuSign for Waivers',
  'A Separate Field App',
  'Manual COI Trackers',
];

function CheckIcon({ size = 16, color = C.green }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
      <circle cx="8" cy="8" r="8" fill={`${color}22`} />
      <path d="M4.5 8l2.5 2.5 4-5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function FeaturesPage() {
  return (
    <div className="mkt-page" style={{ minHeight: '100vh', background: C.dark, color: C.text, fontFamily: C.font }}>

      <style>{`@media (max-width: 768px){ .features-mnav-links{ display:none !important } }`}</style>

      {/* Nav */}
      {/* One professional nav across every marketing page (fixed, 58px). */}
      <MarketingNav />
      <div style={{ height: 58 }} />

      <div style={{ paddingTop: 64 }}>

        {/* Hero */}
        <section style={{ textAlign: 'center', padding: '120px 24px 80px', background: `radial-gradient(ellipse 900px 500px at 50% 0%, rgba(245, 158, 11,0.04) 0%, transparent 70%)` }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: C.dim, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 28 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold }} />
            The Complete Platform
          </div>
          <h1 style={{ fontWeight: 800, lineHeight: 1.12, margin: '0 0 20px', letterSpacing: '-0.02em', maxWidth: 820, marginInline: 'auto' }}>
            Everything you need to run the job —{' '}
            in <span style={SHINE}>one platform</span>
          </h1>
          <p style={{ fontSize: 15, fontWeight: 400, color: C.dim, maxWidth: 600, margin: '0 auto 32px', lineHeight: 1.7 }}>
            AI-powered estimating, bidding, billing, field reporting, and compliance — built for general contractors who are tired of stitching together a dozen disconnected tools. One login. Your whole company.
          </p>
          <Link href="/signup" style={{ display: 'inline-block', padding: '12px 26px', background: C.gold, borderRadius: 8, color: '#0a0a0a', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
            Start Free Trial — No Credit Card →
          </Link>
          <div style={{ marginTop: 14, fontSize: 12.5, color: 'rgba(255,255,255,0.45)' }}>{TRIAL_DAYS} days free · Unlimited users · Free migration</div>
        </section>

        {/* Feature sections */}
        <section style={{ padding: '40px 24px 48px', maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {FEATURES.map((f, i) => (
              <div key={f.title} style={{
                borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
                padding: i === 0 ? '0 0 52px' : '52px 0',
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                gap: 48,
                alignItems: 'start',
              }}>
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 500, color: C.dim, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold }} />
                    {f.eyebrow}
                  </div>
                  <h2 style={{ fontWeight: 600, margin: '0 0 14px', lineHeight: 1.25, letterSpacing: '-0.02em' }}>{f.title}</h2>
                  <p style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.7, margin: 0 }}>{f.description}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {f.bullets.map(b => (
                    <div key={b} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <CheckIcon size={18} color={C.dim} />
                      <span style={{ fontSize: 14, color: C.text, lineHeight: 1.5 }}>{b}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Replaces strip */}
        <section style={{ padding: '0 24px 96px', maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 14, padding: '56px 44px', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 500, color: C.dim, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold }} />
              One Platform Replaces
            </div>
            <h2 style={{ fontWeight: 600, margin: '0 0 28px', lineHeight: 1.25, letterSpacing: '-0.02em' }}>
              Cancel the stack. Run it all in Saguaro.
            </h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              {REPLACES.map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 999, fontSize: 14, color: C.dim, fontWeight: 500 }}>
                  <span style={{ color: '#EF4444', fontWeight: 600, fontSize: 15, lineHeight: 1 }}>&times;</span>
                  {item}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 14, color: C.dim, margin: '28px auto 0', maxWidth: 560, lineHeight: 1.65 }}>
              Stop paying for and reconciling seven tools that don’t talk to each other. Saguaro is one flat subscription with every module included — and we migrate you over for free.
            </p>
          </div>
        </section>

        {/* Final CTA */}
        <section style={{ padding: '100px 24px', background: C.raised, borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{ fontWeight: 800, margin: '0 0 16px', lineHeight: 1.15, letterSpacing: '-0.02em' }}>
              See every feature on{' '}
              <span style={SHINE}>your own jobs</span>.
            </h2>
            <p style={{ fontSize: 15, color: C.dim, margin: '0 0 36px', lineHeight: 1.7 }}>
              Spin up a free account and run a real project through Saguaro today. {TRIAL_DAYS} days free, free migration, no credit card required.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
              <Link href="/signup" style={{ display: 'inline-block', padding: '12px 26px', background: C.gold, borderRadius: 8, color: '#0a0a0a', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
                Start Free Trial — No CC Required
              </Link>
              <Link href="/compare" style={{ display: 'inline-block', padding: '12px 26px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 8, color: C.dim, fontWeight: 500, fontSize: 14, textDecoration: 'none' }}>
                Compare to Procore
              </Link>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[`${TRIAL_DAYS} days free`, 'Free migration', 'Cancel anytime', 'Unlimited users'].map(pill => (
                <div key={pill} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 20, fontSize: 12, fontWeight: 500, color: C.dim }}>
                  <CheckIcon size={12} color={C.dim} />
                  {pill}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trusted integrations */}
        <IntegrationStrip />

        {/* Footer */}
        <footer style={{ borderTop: `1px solid ${C.border}`, padding: '48px 32px', background: C.raised }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 32 }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }} aria-label="Saguaro Control Systems — Construction Management & Project Controls — home">
              <img src="/logo-full.jpg" alt="Saguaro Control Systems — Construction Management & Project Controls" style={{ height: 30, width: 'auto', mixBlendMode: 'screen', objectFit: 'contain' }} />
            </Link>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { label: 'Home', href: '/' }, { label: 'Features', href: '/features' },
                { label: 'Compare', href: '/compare' },
                { label: 'The App', href: '/get-the-app' }, { label: 'Privacy', href: '/privacy' }, { label: 'Terms', href: '/terms' },
              ].map(link => (
                <Link key={link.label} href={link.href} style={{ fontSize: 13, color: C.dim, textDecoration: 'none', fontWeight: 500 }}>{link.label}</Link>
              ))}
            </div>
            <div style={{ fontSize: 12, color: C.dim, whiteSpace: 'nowrap' }}>&copy; {new Date().getFullYear()} Saguaro Control Systems — Construction Management & Project Controls</div>
          </div>
        </footer>

      </div>
    </div>
  );
}
