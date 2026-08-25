'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';

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
  { label: 'Home', href: '/' },
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Field App', href: '/get-the-app' },
  { label: 'Compare', href: '/compare' },
];

const SUPPORT_EMAIL = 'support@saguarocontrol.net';
const SALES_EMAIL = 'sales@saguarocontrol.net';
const SECURITY_EMAIL = 'security@saguarocontrol.net';

const CHANNELS = [
  {
    icon: '💬',
    title: 'Sales & Demos',
    desc: 'Want a walkthrough of AI takeoffs, Sage AI, or the field app? Talk to a real estimator who uses Saguaro every day.',
    line: SALES_EMAIL,
    href: `mailto:${SALES_EMAIL}`,
    accent: C.gold,
  },
  {
    icon: '🛟',
    title: 'Customer Support',
    desc: 'Already on Saguaro? Reach our support team for help with pay apps, lien waivers, RFIs, or anything in your account.',
    line: SUPPORT_EMAIL,
    href: `mailto:${SUPPORT_EMAIL}`,
    accent: C.green,
  },
  {
    icon: '🔐',
    title: 'Security & Compliance',
    desc: 'Vendor security reviews, SOC 2 questionnaires, DPAs, or responsible disclosure of a vulnerability.',
    line: SECURITY_EMAIL,
    href: `mailto:${SECURITY_EMAIL}`,
    accent: C.blue,
  },
];

const REASONS = [
  { label: 'I want a product demo', value: 'Demo request' },
  { label: 'Pricing & plans', value: 'Pricing question' },
  { label: 'Migrating from Procore / Buildertrend', value: 'Migration help' },
  { label: 'Technical support', value: 'Support request' },
  { label: 'Partnership / reseller / white label', value: 'Partnership' },
  { label: 'Something else', value: 'General inquiry' },
];

const FAQS = [
  {
    q: 'How fast will I hear back?',
    a: 'Sales and demo requests get a reply within one business hour during US working hours. Support tickets are answered within 4 hours on Professional and Enterprise plans, 48 hours on Starter.',
  },
  {
    q: 'Do you offer live demos?',
    a: 'Yes. Pick "I want a product demo" below and we will schedule a 30-minute screen share where we run an AI takeoff on your real plans, generate a G702/G703 pay app, and answer every question.',
  },
  {
    q: 'I am switching from another platform. Can you help?',
    a: 'Absolutely — free migration is included on every plan. We move your projects, contacts, documents, bids, and history from Procore, Buildertrend, CoConstruct, or spreadsheets in about one business day.',
  },
];

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: 'rgba(255,255,255,0.03)',
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  color: C.text,
  fontSize: 14,
  fontFamily: C.font,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: C.dim,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  marginBottom: 7,
};

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', company: '', reason: REASONS[0].value, message: '' });

  /* Preselect the enquiry from ?reason=. Settings deep-links here for Free
   * Migration, Guided Onboarding and Contact Support — without this, three
   * different rows would all land on the same blank form and the user would
   * have to restate why they came. Only a value that is actually one of
   * REASONS is accepted, so the URL cannot inject an arbitrary subject. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const wanted = new URLSearchParams(window.location.search).get('reason');
    if (!wanted) return;
    const match = REASONS.find(r => r.value.toLowerCase() === wanted.toLowerCase());
    if (match) setForm(f => ({ ...f, reason: match.value }));
  }, []);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [focused, setFocused] = useState<string | null>(null);

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  function buildMailto() {
    const subject = `[${form.reason}] from ${form.name || 'Saguaro website'}`;
    const body = [
      `Name: ${form.name}`,
      `Email: ${form.email}`,
      `Company: ${form.company}`,
      `Reason: ${form.reason}`,
      '',
      form.message,
    ].join('\n');
    return `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');

    // Submit to the real lead-capture handler (saves to the leads table +
    // emails sales). Field names are mapped to what /api/leads/contact expects.
    // If that ever errors, gracefully fall back to a mailto draft.
    const [firstName, ...rest] = (form.name || '').trim().split(/\s+/);
    try {
      const res = await fetch('/api/leads/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          firstName: firstName || '',
          lastName: rest.join(' '),
          companyName: form.company,
          message: form.message,
          subject: form.reason,
        }),
      });
      if (res.ok) {
        setStatus('sent');
        return;
      }
      throw new Error(`Bad status ${res.status}`);
    } catch {
      // No contact API deployed (or it errored) — open the user's mail client as a fallback.
      if (typeof window !== 'undefined') {
        window.location.href = buildMailto();
      }
      setStatus('sent');
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.dark, color: C.text, fontFamily: C.font }}>

      <style>{`@media (max-width: 768px){ .contact-mnav-links{ display:none !important } }`}</style>

      {/* Nav */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        height: 64, background: 'rgba(13,17,23,0.9)',
        borderBottom: `1px solid ${C.hairline}`,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', padding: '0 32px', gap: 0,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0, marginRight: 40 }}>
          <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 36, width: 'auto', mixBlendMode: 'screen', objectFit: 'contain' }} />
        </Link>
        <div className="contact-mnav-links" style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
          {NAV_LINKS.map(link => (
            <a key={link.label} href={link.href} style={{ padding: '6px 12px', borderRadius: 6, color: C.dim, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>
              {link.label}
            </a>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/login" style={{ padding: '8px 16px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 8, color: C.dim, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>Log In</Link>
          <Link href="/signup" style={{ padding: '8px 18px', background: C.gold, borderRadius: 8, color: '#0B0B0F', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Free Trial</Link>
        </div>
      </nav>

      <div style={{ paddingTop: 64 }}>

        {/* Hero */}
        <section style={{ textAlign: 'center', padding: '120px 24px 72px', background: 'transparent' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 12, fontWeight: 500, color: C.dim, letterSpacing: 0.3, marginBottom: 28 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, display: 'inline-block' }} />
            Real humans · 1-hour sales response
          </div>
          <h1 style={{ fontSize: 'clamp(26px, 4vw, 30px)', fontWeight: 600, lineHeight: 1.15, margin: '0 0 18px', letterSpacing: -0.5 }}>
            Talk to the{' '}
            <span style={{ color: C.text }}>
              Saguaro team.
            </span>
          </h1>
          <p style={{ fontSize: 'clamp(15px, 2vw, 17px)', color: C.dim, maxWidth: 600, margin: '0 auto', lineHeight: 1.65 }}>
            Questions about AI takeoffs, the Sage AI assistant, pay apps, or migrating off Procore? Send a note and a real person who knows construction will get back to you.
          </p>
        </section>

        {/* Channels */}
        <section style={{ padding: '0 24px 80px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 0 }}>
            {CHANNELS.map((ch, i, arr) => (
              <a key={ch.title} href={ch.href} style={{ textDecoration: 'none', background: 'transparent', borderTop: `1px solid ${C.hairline}`, padding: '26px 28px 26px 4px', display: 'block', marginRight: i < arr.length - 1 ? 24 : 0 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 16 }}>
                  {ch.icon}
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>{ch.title}</div>
                <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6, marginBottom: 16 }}>{ch.desc}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.gold }}>{ch.line} &rarr;</div>
              </a>
            ))}
          </div>
        </section>

        {/* Form + side info */}
        <section style={{ padding: '0 24px 96px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 32, alignItems: 'start' }}>

            {/* Form card */}
            <div style={{ background: C.cardBg, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '36px 36px', boxShadow: 'none' }}>
              {status === 'sent' ? (
                <div style={{ textAlign: 'center', padding: '32px 8px' }}>
                  <div style={{ width: 64, height: 64, margin: '0 auto 20px', borderRadius: '50%', background: 'rgba(34,197,94,0.12)', border: `1px solid rgba(34,197,94,0.35)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12.5l4.5 4.5L19 7" stroke={C.green} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 10px' }}>Message on its way</h2>
                  <p style={{ fontSize: 15, color: C.dim, lineHeight: 1.65, maxWidth: 380, margin: '0 auto 24px' }}>
                    Thanks{form.name ? `, ${form.name.split(' ')[0]}` : ''}. We received your note and a real person from our team will reply shortly. If your mail client opened, just hit send to confirm.
                  </p>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Link href="/signup" style={{ display: 'inline-block', padding: '12px 26px', background: C.gold, borderRadius: 8, color: '#0B0B0F', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
                      Start Free Trial &rarr;
                    </Link>
                    <button onClick={() => { setForm({ name: '', email: '', company: '', reason: REASONS[0].value, message: '' }); setStatus('idle'); }} style={{ padding: '12px 26px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 8, color: C.dim, fontWeight: 500, fontSize: 14, cursor: 'pointer', fontFamily: C.font }}>
                      Send another
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 6px' }}>Send us a message</h2>
                  <p style={{ fontSize: 14, color: C.dim, margin: '0 0 28px', lineHeight: 1.6 }}>
                    Fill this out and we will route it to the right person. No bots, no phone tree.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
                    <div>
                      <label style={labelStyle} htmlFor="name">Full name</label>
                      <input id="name" required value={form.name} onChange={update('name')}
                        onFocus={() => setFocused('name')} onBlur={() => setFocused(null)}
                        placeholder="Jordan Vega" autoComplete="name"
                        style={{ ...fieldStyle, borderColor: focused === 'name' ? C.gold : C.border }} />
                    </div>
                    <div>
                      <label style={labelStyle} htmlFor="email">Work email</label>
                      <input id="email" type="email" required value={form.email} onChange={update('email')}
                        onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                        placeholder="you@yourcompany.com" autoComplete="email"
                        style={{ ...fieldStyle, borderColor: focused === 'email' ? C.gold : C.border }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
                    <div>
                      <label style={labelStyle} htmlFor="company">Company</label>
                      <input id="company" value={form.company} onChange={update('company')}
                        onFocus={() => setFocused('company')} onBlur={() => setFocused(null)}
                        placeholder="Vega Construction LLC" autoComplete="organization"
                        style={{ ...fieldStyle, borderColor: focused === 'company' ? C.gold : C.border }} />
                    </div>
                    <div>
                      <label style={labelStyle} htmlFor="reason">How can we help?</label>
                      <select id="reason" value={form.reason} onChange={update('reason')}
                        onFocus={() => setFocused('reason')} onBlur={() => setFocused(null)}
                        style={{ ...fieldStyle, borderColor: focused === 'reason' ? C.gold : C.border, appearance: 'none', cursor: 'pointer' }}>
                        {REASONS.map(r => (
                          <option key={r.value} value={r.value} style={{ background: C.raisedAlt, color: C.text }}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: 24 }}>
                    <label style={labelStyle} htmlFor="message">Message</label>
                    <textarea id="message" required value={form.message} onChange={update('message')}
                      onFocus={() => setFocused('message')} onBlur={() => setFocused(null)}
                      placeholder="Tell us about your team, your current software, and what you're hoping to fix. The more detail, the faster we can help."
                      rows={6}
                      style={{ ...fieldStyle, resize: 'vertical', minHeight: 130, lineHeight: 1.6, borderColor: focused === 'message' ? C.gold : C.border }} />
                  </div>

                  <button type="submit" disabled={status === 'sending'} style={{
                    width: '100%', padding: '14px 0',
                    background: C.gold,
                    border: 'none', borderRadius: 8, color: '#0B0B0F',
                    fontWeight: 600, fontSize: 15, cursor: status === 'sending' ? 'default' : 'pointer',
                    opacity: status === 'sending' ? 0.7 : 1, fontFamily: C.font,
                    boxShadow: 'none', letterSpacing: 0.2,
                  }}>
                    {status === 'sending' ? 'Sending…' : 'Send message'}
                  </button>

                  <p style={{ fontSize: 12, color: C.dim, textAlign: 'center', margin: '14px 0 0', lineHeight: 1.6 }}>
                    Prefer email? Write us directly at{' '}
                    <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: C.gold, textDecoration: 'none', fontWeight: 600 }}>{SUPPORT_EMAIL}</a>.
                    We never share your information.
                  </p>
                </form>
              )}
            </div>

            {/* Side info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ background: C.cardBg, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '28px 26px' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: C.dim, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Skip the wait</div>
                <h3 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 10px', lineHeight: 1.25 }}>Start free, no sales call required</h3>
                <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.65, margin: '0 0 20px' }}>
                  You do not have to talk to anyone to try Saguaro. Spin up your account, run an AI takeoff, and invite your whole team — free for 30 days, no credit card.
                </p>
                <Link href="/signup" style={{ display: 'inline-block', padding: '12px 24px', background: C.gold, borderRadius: 8, color: '#0B0B0F', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
                  Create your account &rarr;
                </Link>
              </div>

              <div style={{ background: C.cardBg, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '26px 26px' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: C.dim, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 }}>What to expect</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    'Sales & demos: reply within 1 business hour',
                    'Support tickets: 4-hour SLA on Pro & Enterprise',
                    'Free migration scoped on your first call',
                    'Built and supported in the United States',
                  ].map(item => (
                    <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                        <circle cx="8" cy="8" r="8" fill="rgba(34,197,94,0.13)" />
                        <path d="M4.5 8l2.5 2.5 4-5" stroke={C.green} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: C.cardBg, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '24px 26px' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: C.dim, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Headquarters</div>
                <div style={{ fontSize: 14, color: C.text, fontWeight: 600, marginBottom: 4 }}>Saguaro Control Systems</div>
                <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6 }}>Phoenix, Arizona · Remote-first team<br />Serving general contractors across all 50 states</div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={{ padding: '0 24px 112px', maxWidth: 760, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'inline-block', padding: '5px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 11, fontWeight: 500, color: C.dim, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 }}>Before you write</div>
            <h2 style={{ fontSize: 'clamp(20px, 3vw, 22px)', fontWeight: 600, margin: 0, letterSpacing: -0.3 }}>Quick answers</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {FAQS.map((faq, i) => (
              <div key={faq.q} style={{ borderBottom: i < FAQS.length - 1 ? `1px solid ${C.hairline}` : 'none', padding: '22px 0' }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>{faq.q}</div>
                <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.7 }}>{faq.a}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section style={{ padding: '112px 24px', background: 'transparent', borderTop: `1px solid ${C.hairline}`, textAlign: 'center' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 26px)', fontWeight: 600, margin: '0 0 16px', lineHeight: 1.2, letterSpacing: -0.4 }}>
              Don&rsquo;t wait on us to{' '}
              <span style={{ color: C.text }}>get started.</span>
            </h2>
            <p style={{ fontSize: 16, color: C.dim, margin: '0 0 36px', lineHeight: 1.6 }}>
              30-day free trial. Free migration from any platform. No credit card. Your whole team, one flat rate.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
              <Link href="/signup" style={{ display: 'inline-block', padding: '12px 28px', background: C.gold, borderRadius: 8, color: '#0B0B0F', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
                Start Free Trial &rarr;
              </Link>
              <Link href="/pricing" style={{ display: 'inline-block', padding: '12px 28px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 8, color: C.dim, fontWeight: 500, fontSize: 15, textDecoration: 'none' }}>
                See Pricing
              </Link>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {['30 days free', 'Free migration', 'No credit card', 'Unlimited users'].map(pill => (
                <div key={pill} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, fontSize: 12, fontWeight: 500, color: C.dim }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="8" fill="rgba(255,255,255,0.08)" />
                    <path d="M4.5 8l2.5 2.5 4-5" stroke={C.dim} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {pill}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: `1px solid ${C.hairline}`, padding: '48px 32px', background: C.raised }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 32 }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
              <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 30, width: 'auto', mixBlendMode: 'screen', objectFit: 'contain' }} />
            </Link>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { label: 'Home', href: '/' }, { label: 'Features', href: '/features' },
                { label: 'Pricing', href: '/pricing' }, { label: 'Compare', href: '/compare' },
                { label: 'Field App', href: '/get-the-app' }, { label: 'Security', href: '/security' },
                { label: 'Privacy', href: '/privacy' }, { label: 'Terms', href: '/terms' },
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
