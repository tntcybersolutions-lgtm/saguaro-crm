'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import MarketingNav from '@/components/MarketingNav';

const C = {
  dark: 'var(--bg-base)',
  gold: 'var(--brand-primary)',
  goldBright: 'var(--brand-primary-strong)',
  text: '#F5F5F7',
  dim: 'var(--text-secondary)',
  border: 'rgba(255,255,255,0.10)',
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

/* House display treatment — gold text-shine on ONE key word per heading. */
const SHINE: React.CSSProperties = {
  background: 'linear-gradient(100deg, var(--brand-primary) 6%, var(--brand-primary-strong) 50%, var(--brand-primary) 92%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
};

const VALUES = [
  {
    title: 'Ship for the Field, Not the Boardroom',
    desc: 'Our users are estimators, project managers, and field supers — people standing in the mud at 6am, not in a procurement committee. Every feature has to earn its place on a phone screen in the sun.',
  },
  {
    title: 'AI That Does the Work, Not the Talking',
    desc: 'Sage, our AI assistant, reads blueprints, runs takeoffs, drafts RFIs, and parses COIs. We build AI that removes hours of manual work — not chatbots that summarize what the user already knows.',
  },
  {
    title: 'One Flat Price, One Honest Pitch',
    desc: 'We replaced per-seat fees and module upsells with one flat rate and unlimited users. We hold ourselves to the same standard internally: no politics, no hidden agendas, say the real thing.',
  },
  {
    title: 'Small Team, Real Ownership',
    desc: 'You own surfaces end to end — design, code, ship, talk to the GC who uses it. We are deliberately small, so the work you do is visible in the product within days, not quarters.',
  },
];

const PERKS = [
  { title: 'Fully Remote', desc: 'Work from anywhere in the US. We are async-first with a few overlap hours for the team.' },
  { title: 'Competitive Equity', desc: 'Meaningful early-stage equity for every full-time hire. You build it, you own a piece of it.' },
  { title: 'Health, Dental & Vision', desc: 'Full medical, dental, and vision coverage for you and your dependents.' },
  { title: 'Real Hardware Budget', desc: 'A new laptop, the monitors you want, and a stipend for your home office setup.' },
  { title: 'Learning Budget', desc: 'Annual budget for courses, books, conferences, and anything that makes you sharper.' },
  { title: 'Flexible PTO', desc: 'Take the time you need. We measure output, not hours in a seat.' },
];

const ROLES = [
  {
    title: 'Senior Full-Stack Engineer',
    team: 'Engineering',
    location: 'Remote (US)',
    type: 'Full-Time',
    desc: 'Own product surfaces end to end across our Next.js + Supabase stack — from AI takeoff and the Sage assistant to pay apps, RFIs, and the native iOS field app. You ship to production daily.',
    tags: ['Next.js', 'TypeScript', 'Supabase', 'Postgres'],
  },
  {
    title: 'AI / ML Engineer — Document Intelligence',
    team: 'Engineering',
    location: 'Remote (US)',
    type: 'Full-Time',
    desc: 'Build the models behind AI takeoff, COI/ACORD 25 parsing, and Sage. You will work on blueprint vision, structured extraction from construction PDFs, and LLM pipelines that have to be right the first time.',
    tags: ['Python', 'LLMs', 'Computer Vision', 'PDF Parsing'],
  },
  {
    title: 'Product Designer',
    team: 'Design',
    location: 'Remote (US)',
    type: 'Full-Time',
    desc: 'Design dense, data-heavy workflows that have to feel simple — pay app schedules of values, lien waiver flows, and a field app used in gloves and sunlight. You will own the design system end to end.',
    tags: ['Figma', 'Design Systems', 'Mobile / iOS'],
  },
  {
    title: 'Founding Account Executive',
    team: 'Go-to-Market',
    location: 'Remote (US) · AZ preferred',
    type: 'Full-Time',
    desc: 'Sell to GCs switching off legacy construction platforms and spreadsheets. You will own the full cycle — demo, migration story, close — and feed what you learn straight back into the roadmap.',
    tags: ['SaaS Sales', 'Construction', 'Full-cycle'],
  },
  {
    title: 'Customer Success Lead',
    team: 'Customer',
    location: 'Remote (US)',
    type: 'Full-Time',
    desc: 'Be the human behind our white-glove migration. Onboard new GCs, run training sessions, build the playbook, and make sure every customer is live and winning bids within their first week.',
    tags: ['Onboarding', 'Construction', 'Migrations'],
  },
];

const HIRING_STEPS = [
  { step: '1', title: 'Intro Call', desc: 'A 30-minute conversation with the founder about your background, what you want, and what we are building.' },
  { step: '2', title: 'Craft Conversation', desc: 'A focused working session on a real problem from our domain — no whiteboard trivia, no take-home that eats your weekend.' },
  { step: '3', title: 'Meet the Team', desc: 'Talk with the people you would work alongside every day. You interview us as much as we interview you.' },
  { step: '4', title: 'Offer', desc: 'Fast, transparent offer with clear comp and equity. We move in days, not weeks.' },
];

function CheckIcon({ size = 16, color = C.green }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="8" cy="8" r="8" fill={`color-mix(in srgb, ${color} 13%, transparent)`} />
      <path d="M4.5 8l2.5 2.5 4-5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function CareersPage() {
  // Toggle to false to show the "no open roles" state instead of the roles list.
  const [hasOpenRoles] = useState(true);

  return (
    <div className="mkt-page" style={{ minHeight: '100vh', background: C.dark, color: C.text, fontFamily: C.font }}>

      {/* Nav */}
      {/* One professional nav across every marketing page (fixed, 58px). */}
      <MarketingNav />
      <div style={{ height: 58 }} />

      <div style={{ paddingTop: 64 }}>

        {/* Hero */}
        <section style={{ textAlign: 'center', padding: '112px 24px 80px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 28 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold }} />
            Careers at Saguaro
          </div>
          <h1 style={{ fontWeight: 800, lineHeight: 1.12, margin: '0 0 20px', letterSpacing: '-0.02em' }}>
            Build the Software <span style={SHINE}>Construction</span> Runs On
          </h1>
          <p style={{ fontSize: 'clamp(15px, 2vw, 17px)', color: C.dim, maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.65 }}>
            We are a small, remote team building the AI-powered platform that runs takeoffs, bids, pay apps, RFIs, and compliance for general contractors. Real product, real users, real ownership.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#open-roles" style={{ display: 'inline-block', padding: '10px 22px', background: C.gold, borderRadius: 8, color: '#0A0A00', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              See Open Roles
            </a>
            <a href="mailto:careers@saguarocontrol.net" style={{ display: 'inline-block', padding: '10px 22px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 8, color: C.dim, fontWeight: 500, fontSize: 14, textDecoration: 'none' }}>
              Email Us Directly
            </a>
          </div>
        </section>

        {/* Culture / Values */}
        <section style={{ padding: '0 24px 120px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 18 }}>
              How We Work
            </div>
            <h2 style={{ fontWeight: 600, margin: '0 0 12px', letterSpacing: -0.3 }}>What We Care About</h2>
            <p style={{ fontSize: 15, color: C.dim, maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
              Saguaro replaces five tools and a stack of paperwork for general contractors. The way we build reflects who we build for.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '40px 56px' }}>
            {VALUES.map(v => (
              <div key={v.title}>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 10, lineHeight: 1.35 }}>{v.title}</div>
                <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.7 }}>{v.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Perks */}
        <section style={{ padding: '0 24px 120px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 56 }}>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 10 }}>Benefits</div>
              <h2 style={{ fontWeight: 600, color: C.text, margin: 0 }}>Taken Care of, So You Can Do Your Best Work</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px 40px' }}>
              {PERKS.map(p => (
                <div key={p.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <CheckIcon size={18} color={C.text} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>{p.title}</div>
                    <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6 }}>{p.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Open Roles */}
        <section id="open-roles" style={{ padding: '0 24px 96px', maxWidth: 1000, margin: '0 auto', scrollMarginTop: 88 }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 18 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.green }} />
              Open Roles
            </div>
            <h2 style={{ fontWeight: 600, margin: '0 0 12px', letterSpacing: -0.3 }}>Come Build with Us</h2>
            <p style={{ fontSize: 15, color: C.dim, maxWidth: 480, margin: '0 auto' }}>
              {hasOpenRoles ? 'All roles are fully remote within the US. Apply by email — a real person reads every one.' : "We're not actively hiring right now, but great people are always worth a conversation."}
            </p>
          </div>

          {hasOpenRoles ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {ROLES.map(role => (
                <div key={role.title} style={{ borderTop: `1px solid ${C.border}`, padding: '28px 4px', display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 280 }}>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10, fontSize: 11, color: C.dim }}>
                      <span style={{ fontWeight: 600, color: C.text }}>{role.team}</span>
                      <span>{role.location}</span>
                      <span>{role.type}</span>
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 8, lineHeight: 1.3 }}>{role.title}</div>
                    <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.65, marginBottom: 14 }}>{role.desc}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {role.tags.map(tag => (
                        <span key={tag} style={{ fontSize: 11, fontWeight: 500, color: C.dim, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 9px' }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                  <a
                    href={`mailto:careers@saguarocontrol.net?subject=${encodeURIComponent('Application: ' + role.title)}`}
                    style={{ flexShrink: 0, alignSelf: 'center', color: C.gold, fontWeight: 600, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap' }}
                  >
                    Apply →
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 14, padding: '56px 40px', textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 12 }}>No Open Roles Right Now</div>
              <p style={{ fontSize: 15, color: C.dim, lineHeight: 1.7, margin: '0 0 28px' }}>
                We hire deliberately and we are between openings at the moment. If you are an engineer, designer, or builder who wants to work on AI for construction, send us a note anyway — we keep great people in mind and reach out when a role opens.
              </p>
              <a href="mailto:careers@saguarocontrol.net?subject=Introduction" style={{ display: 'inline-block', padding: '10px 22px', background: C.gold, borderRadius: 8, color: '#0A0A00', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
                careers@saguarocontrol.net
              </a>
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: 40, fontSize: 14, color: C.dim }}>
            Don't see your role? We're always glad to hear from exceptional people.{' '}
            <a href="mailto:careers@saguarocontrol.net?subject=Introduction" style={{ color: C.gold, textDecoration: 'none', fontWeight: 600 }}>Introduce Yourself →</a>
          </div>
        </section>

        {/* Hiring Process */}
        <section style={{ padding: '0 24px 120px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 56 }}>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: C.dim, marginBottom: 10 }}>The Process</div>
              <h2 style={{ fontWeight: 600, color: C.text, margin: 0 }}>Hiring, the Way It Should Be</h2>
              <p style={{ fontSize: 14, color: C.dim, margin: '12px auto 0', maxWidth: 520, lineHeight: 1.6 }}>
                No endless loops, no trick questions. Four focused steps, usually wrapped in under two weeks.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 0 }}>
              {HIRING_STEPS.map((s, i, arr) => (
                <div key={s.step} style={{ padding: '0 28px', borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 500, color: C.text, marginBottom: 16 }}>
                    {s.step}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section style={{ padding: '112px 24px', borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{ fontWeight: 800, margin: '0 0 16px', lineHeight: 1.15, letterSpacing: '-0.02em' }}>
              Want to See What You'd Be <span style={SHINE}>Building</span>?
            </h2>
            <p style={{ fontSize: 16, color: C.dim, margin: '0 0 36px', lineHeight: 1.6 }}>
              The best way to understand Saguaro is to use it. Spin up a free account and explore AI takeoff, Sage, pay apps, and the field app firsthand.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/signup" style={{ display: 'inline-block', padding: '10px 22px', background: C.gold, borderRadius: 8, color: '#0A0A00', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
                Try the Product Free
              </Link>
              <a href="mailto:careers@saguarocontrol.net" style={{ display: 'inline-block', padding: '10px 22px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 8, color: C.dim, fontWeight: 500, fontSize: 14, textDecoration: 'none' }}>
                careers@saguarocontrol.net
              </a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: `1px solid ${C.border}`, padding: '48px 32px', background: C.raised }}>
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
