import React from 'react';
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

type Change = { kind: 'New' | 'Improved' | 'Fixed'; text: string };

type Release = {
  version: string;
  date: string;
  tag: string;
  tagColor: string;
  title: string;
  summary: string;
  changes: Change[];
};

const RELEASES: Release[] = [
  {
    version: 'v4.2',
    date: 'June 6, 2026',
    tag: 'Latest',
    tagColor: C.gold,
    title: 'AI Takeoff — Full-Set Blueprint Estimating',
    summary:
      'Drop in an entire plan set and Saguaro reads every sheet. The AI Takeoff engine now detects scale automatically, measures linear feet, square footage, and counts, and maps quantities straight into a bid line by line.',
    changes: [
      { kind: 'New', text: 'AI Takeoff reads multi-page PDF plan sets — walls, slabs, openings, and fixture counts in one pass.' },
      { kind: 'New', text: 'Auto scale detection from the title block, with a one-click calibration override per sheet.' },
      { kind: 'New', text: 'Push measured quantities directly into a bid package — no re-keying into a spreadsheet.' },
      { kind: 'Improved', text: 'Takeoff measurements now snap to detected edges for tighter linear and area accuracy.' },
    ],
  },
  {
    version: 'v4.1',
    date: 'May 19, 2026',
    tag: 'AI Assistant',
    tagColor: C.blue,
    title: 'Meet Sage — Your AI Construction Assistant',
    summary:
      'Sage lives inside every project and answers in plain English. Ask it to draft an RFI, summarize a pay app, find the latest COI for a sub, or flag which lien waivers are still outstanding — and it acts on your live project data.',
    changes: [
      { kind: 'New', text: 'Sage AI assistant available on every project — ask questions about budgets, RFIs, subs, and schedule.' },
      { kind: 'New', text: 'One-line prompts draft RFIs, change orders, and submittal cover letters from project context.' },
      { kind: 'New', text: 'Sage surfaces compliance gaps: expiring insurance, missing lien waivers, and unsigned change orders.' },
      { kind: 'Improved', text: 'Document search now understands intent — "show me the structural revisions" returns the right sheets.' },
    ],
  },
  {
    version: 'v4.0',
    date: 'April 28, 2026',
    tag: 'Field App',
    tagColor: C.green,
    title: 'Saguaro Control Systems — The Mobile App for the Jobsite',
    summary:
      'The field crew finally has a tool built for gloves and sunlight. Saguaro Control Systems puts daily logs, photos, time, and punch lists in everyone\'s pocket — and it keeps working when the cell signal does not.',
    changes: [
      { kind: 'New', text: 'Saguaro Control Systems app for iOS and Android — daily logs, jobsite photos, and punch lists from the field.' },
      { kind: 'New', text: 'Full offline mode — capture logs and photos with no signal and sync automatically when you reconnect.' },
      { kind: 'New', text: 'Photos geotag and timestamp to the right project and cost code on capture.' },
      { kind: 'Improved', text: 'Field updates flow into the office dashboard in real time — no end-of-day data entry.' },
    ],
  },
  {
    version: 'v3.8',
    date: 'April 7, 2026',
    tag: 'Pay Apps',
    tagColor: C.gold,
    title: 'Pay-App Approvals & AIA G702/G703 Automation',
    summary:
      'Progress billing without the spreadsheet gymnastics. Build AIA G702/G703 pay applications from your schedule of values, route them for approval, and let owners and subs sign off through their own portal.',
    changes: [
      { kind: 'New', text: 'Multi-step pay-app approval workflow — PM, accounting, and owner sign-off with a full audit trail.' },
      { kind: 'New', text: 'Auto-generated AIA G702/G703 from the schedule of values, with stored materials and retainage calculated.' },
      { kind: 'New', text: 'Owner & Sub Portals let outside parties review and approve pay apps without a Saguaro login.' },
      { kind: 'Fixed', text: 'Retainage release on the final pay app now reconciles correctly against prior billings.' },
    ],
  },
  {
    version: 'v3.5',
    date: 'March 17, 2026',
    tag: 'Compliance',
    tagColor: C.blue,
    title: 'Lien Waivers & Certified Payroll, All 50 States',
    summary:
      'Stay protected and prevailing-wage compliant without leaving the platform. Generate conditional and unconditional lien waivers with state-specific statutory language, and produce WH-347 certified payroll validated against current Davis-Bacon rates.',
    changes: [
      { kind: 'New', text: 'Lien waiver generator covering all 50 states, with statutory language for AZ, CA, TX, NV, FL, and more.' },
      { kind: 'New', text: 'WH-347 certified payroll generator with DOL Davis-Bacon prevailing-wage validation by trade and county.' },
      { kind: 'Improved', text: 'ACORD 25 insurance tracker now parses uploaded COIs and flags coverage that lapses before substantial completion.' },
      { kind: 'Fixed', text: 'Preliminary notice deadlines now account for the date-first-furnished rules in AZ, CA, and TX.' },
    ],
  },
];

function KindBadge({ kind }: { kind: Change['kind'] }) {
  const dot = { New: C.gold, Improved: C.blue, Fixed: C.green }[kind];
  return (
    <span
      style={{
        flexShrink: 0,
        marginTop: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        fontSize: 10,
        fontWeight: 500,
        color: C.dim,
        background: 'transparent',
        border: `1px solid rgba(255,255,255,0.14)`,
        borderRadius: 6,
        padding: '2px 8px',
        width: 76,
        textAlign: 'center',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />
      {kind}
    </span>
  );
}

export default function ChangelogPage() {
  return (
    <div className="mkt-page" style={{ minHeight: '100vh', background: C.dark, color: C.text, fontFamily: C.font }}>

      {/* Nav */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        height: 64, background: 'rgba(13,17,23,0.9)',
        borderBottom: `1px solid ${C.hairline}`,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', padding: '0 32px', gap: 0,
      }}>
        <style>{`@media (max-width: 768px){ .cl-nav-links{ display:none !important } }`}</style>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0, marginRight: 40 }} aria-label="Saguaro Control Systems — home">
          <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 36, width: 'auto', mixBlendMode: 'screen', objectFit: 'contain' }} />
        </Link>
        <div className="cl-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
          {NAV_LINKS.map(link => (
            <Link key={link.label} href={link.href} style={{ padding: '6px 12px', borderRadius: 6, color: C.dim, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>
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
        <section style={{ textAlign: 'center', padding: '120px 24px 64px', background: 'transparent' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 12, fontWeight: 500, color: C.dim, letterSpacing: 0.3, marginBottom: 28 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, display: 'inline-block' }} />
            Product Changelog
          </div>
          <h1 style={{ fontWeight: 600, lineHeight: 1.15, margin: '0 0 18px', letterSpacing: -0.5 }}>
            What&apos;s New in{' '}
            <span style={{ color: C.text }}>
              Saguaro
            </span>
          </h1>
          <p style={{ fontSize: 'clamp(15px, 2vw, 17px)', color: C.dim, maxWidth: 600, margin: '0 auto', lineHeight: 1.65 }}>
            Every release that ships to your account — AI takeoffs, the Sage assistant, the field app, pay-app approvals, and compliance. Built for general contractors, shipped continuously.
          </p>
        </section>

        {/* Timeline */}
        <section style={{ padding: '0 24px 64px', maxWidth: 860, margin: '0 auto' }}>
          <div style={{ position: 'relative' }}>
            {/* Vertical rail */}
            <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 1, background: C.hairline }} />

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {RELEASES.map((rel, i) => (
                <div key={rel.version} style={{ position: 'relative', paddingLeft: 40, paddingTop: i === 0 ? 0 : 40, paddingBottom: 40, borderTop: i === 0 ? 'none' : `1px solid ${C.hairline}` }}>
                  {/* Node */}
                  <div style={{
                    position: 'absolute', left: 0, top: i === 0 ? 6 : 46,
                    width: 15, height: 15, borderRadius: '50%',
                    background: i === 0 ? C.gold : C.dark,
                    border: `1px solid ${i === 0 ? C.gold : 'rgba(255,255,255,0.14)'}`,
                    boxShadow: 'none',
                  }} />

                  {/* Meta row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{rel.version}</span>
                    <span style={{ width: 3, height: 3, borderRadius: '50%', background: C.dim, display: 'inline-block' }} />
                    <span style={{ fontSize: 13, color: C.dim }}>{rel.date}</span>
                    <span style={{
                      marginLeft: 'auto',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 10, fontWeight: 500,
                      color: C.dim,
                      background: 'transparent',
                      border: `1px solid rgba(255,255,255,0.14)`,
                      borderRadius: 999, padding: '3px 10px',
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: rel.tagColor, display: 'inline-block' }} />
                      {rel.tag}
                    </span>
                  </div>

                  <h2 style={{ fontWeight: 600, margin: '0 0 10px', lineHeight: 1.25, letterSpacing: -0.3 }}>
                    {rel.title}
                  </h2>
                  <p style={{ fontSize: 15, color: C.dim, lineHeight: 1.65, margin: '0 0 22px' }}>
                    {rel.summary}
                  </p>

                  <div style={{ borderTop: `1px solid ${C.hairline}`, paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {rel.changes.map((ch, j) => (
                      <div key={j} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <KindBadge kind={ch.kind} />
                        <span style={{ fontSize: 14, color: C.text, lineHeight: 1.55 }}>{ch.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Older note */}
          <div style={{ textAlign: 'center', marginTop: 36, paddingLeft: 40 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.dim }}>
              <span style={{ width: 24, height: 1, background: C.hairline, display: 'inline-block' }} />
              You&apos;re all caught up — earlier releases archived
              <span style={{ width: 24, height: 1, background: C.hairline, display: 'inline-block' }} />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: '96px 24px 112px', background: 'transparent', borderTop: `1px solid ${C.hairline}`, textAlign: 'center' }}>
          <div style={{ maxWidth: 620, margin: '0 auto' }}>
            <h2 style={{ fontWeight: 600, margin: '0 0 16px', lineHeight: 1.25, letterSpacing: -0.3 }}>
              Get Every New Feature{' '}
              <span style={{ color: C.text }}>the Day It Ships</span>
            </h2>
            <p style={{ fontSize: 16, color: C.dim, margin: '0 0 32px', lineHeight: 1.6 }}>
              AI takeoffs, the Sage assistant, the field app, and pay-app approvals are included on every plan — and updates land automatically. No upgrades to buy, no installs to run.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 36 }}>
              <Link href="/signup" style={{ display: 'inline-block', padding: '12px 28px', background: C.gold, borderRadius: 8, color: '#0A0A00', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
                Start Free Trial — No Credit Card
              </Link>
              <Link href="/features" style={{ display: 'inline-block', padding: '12px 28px', background: 'transparent', border: `1px solid ${C.hairline}`, borderRadius: 8, color: C.text, fontWeight: 500, fontSize: 15, textDecoration: 'none' }}>
                Explore Features
              </Link>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {['30 Days Free', 'Unlimited Users', 'Free Migration', 'Cancel Anytime'].map(pill => (
                <div key={pill} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'transparent', border: `1px solid ${C.hairline}`, borderRadius: 999, fontSize: 12, fontWeight: 500, color: C.dim }}>
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
                { label: 'Pricing', href: '/pricing' }, { label: 'Changelog', href: '/changelog' },
                { label: 'The App', href: '/get-the-app' }, { label: 'Security', href: '/security' },
                { label: 'Privacy', href: '/privacy' }, { label: 'Terms', href: '/terms' },
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
