import React from 'react';
import Link from 'next/link';

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
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'The App', href: '/get-the-app' },
  { label: 'Compare', href: '/compare' },
];

const FEATURED = {
  category: 'AI in Construction',
  title: 'How AI Takeoffs Cut Estimating Time from Days to Minutes',
  excerpt:
    'Manual quantity takeoffs are the single biggest bottleneck in preconstruction. We break down how Saguaro reads a PDF plan set, counts fixtures, measures linear footage, and calculates square footage automatically — and what that means for win rates when you can turn around three bids in the time it used to take to do one.',
  date: 'June 9, 2026',
  read: '8 min read',
  href: '/signup',
  tag: 'AI Takeoff',
};

const POSTS = [
  {
    category: 'Field Operations',
    title: 'Meet Sage: The AI Assistant That Lives Inside Your Project',
    excerpt:
      'Sage answers questions about your schedule, drafts RFIs from a photo, summarizes the day\'s field reports, and flags budget overruns before they become change orders. Here is how an AI copilot trained on construction workflows actually changes a PM\'s day.',
    date: 'June 2, 2026',
    read: '6 min read',
    href: '/signup',
    tag: 'Sage AI',
    accent: C.gold,
  },
  {
    category: 'Compliance',
    title: 'Lien Waivers, WH-347, and ACORD 25 — Without the Paper Chase',
    excerpt:
      'Conditional vs. unconditional, progress vs. final — lien waiver rules differ in all 50 states. We walk through how Saguaro generates statutory-correct waivers, validates certified payroll against Davis-Bacon rates, and tracks insurance expirations so you never release a payment against a lapsed COI.',
    date: 'May 26, 2026',
    read: '7 min read',
    href: '/signup',
    tag: 'Compliance',
    accent: C.green,
  },
  {
    category: 'Estimating',
    title: 'Bid Smarter: Turning Historical Data into Sharper Numbers',
    excerpt:
      'Every bid you submit teaches the system something. We explain how Saguaro\'s bid intelligence surfaces your real unit costs, builds a polished bid jacket in minutes, and helps you spot the scope gaps that quietly erode margin on fixed-price work.',
    date: 'May 19, 2026',
    read: '5 min read',
    href: '/signup',
    tag: 'Bid Intelligence',
    accent: C.blue,
  },
  {
    category: 'Cash Flow',
    title: 'Faster Pay Apps: G702/G703 That Owners Actually Approve',
    excerpt:
      'Slow draws kill subcontractors. We look at how generating AIA G702/G703 pay applications straight from your schedule of values — with built-in retainage math and an owner portal for one-click approval — shortens the gap between work performed and cash in the door.',
    date: 'May 12, 2026',
    read: '6 min read',
    href: '/signup',
    tag: 'Pay Apps',
    accent: C.gold,
  },
];

function ArrowIcon({ color = C.gold, size = 16 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3 8h9M8.5 4l4 4-4 4" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function BlogPage() {
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
        <style>{`@media (max-width: 768px){ .blog-mnav-links{ display:none !important } }`}</style>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0, marginRight: 40 }} aria-label="Saguaro Control Systems — home">
          <img src="/logo-full.jpg" alt="Saguaro Control Systems" style={{ height: 36, width: 'auto', mixBlendMode: 'screen', objectFit: 'contain' }} />
        </Link>
        <div className="blog-mnav-links" style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
          {NAV_LINKS.map(link => (
            <a key={link.label} href={link.href} style={{ padding: '6px 12px', borderRadius: 6, color: C.dim, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>
              {link.label}
            </a>
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
            The Saguaro Blog
          </div>
          <h1 style={{ fontWeight: 600, lineHeight: 1.15, margin: '0 0 18px', letterSpacing: -0.5 }}>
            Building the Future of{' '}
            <span style={{ color: C.text }}>
              Construction Tech
            </span>
          </h1>
          <p style={{ fontSize: 'clamp(15px, 2vw, 17px)', color: C.dim, maxWidth: 600, margin: '0 auto', lineHeight: 1.65 }}>
            Field notes on AI takeoffs, the Sage assistant, bids, pay apps, RFIs, and the compliance grind — written for the people who actually run the job.
          </p>
        </section>

        {/* Featured Post */}
        <section style={{ padding: '0 24px 64px', maxWidth: 1100, margin: '0 auto' }}>
          <a href={FEATURED.href} style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{
              background: C.cardBg,
              border: `1px solid ${C.hairline}`,
              borderRadius: 14, padding: '40px 44px', boxShadow: 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.dim }}>Featured</span>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.dim, display: 'inline-block' }} />
                <span style={{ fontSize: 12, color: C.dim }}>{FEATURED.category}</span>
                <span style={{ fontSize: 11, color: C.dim, background: 'transparent', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 999, padding: '2px 10px', fontWeight: 500 }}>{FEATURED.tag}</span>
              </div>
              <h2 style={{ fontWeight: 600, lineHeight: 1.25, margin: '0 0 16px', letterSpacing: -0.4, color: C.text, maxWidth: 760 }}>
                {FEATURED.title}
              </h2>
              <p style={{ fontSize: 15, color: C.dim, lineHeight: 1.7, margin: '0 0 24px', maxWidth: 760 }}>
                {FEATURED.excerpt}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 13, color: C.dim }}>{FEATURED.date}</span>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.dim, display: 'inline-block' }} />
                  <span style={{ fontSize: 13, color: C.dim }}>{FEATURED.read}</span>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 600, color: C.gold }}>
                  Read Article <ArrowIcon />
                </span>
              </div>
            </div>
          </a>
        </section>

        {/* Post Grid */}
        <section style={{ padding: '0 24px 80px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0, color: C.text }}>Latest Articles</h2>
            <span style={{ fontSize: 13, color: C.dim }}>Insights from the Saguaro Control Systems team</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 0 }}>
            {POSTS.map(post => (
              <a key={post.title} href={post.href} style={{ textDecoration: 'none', display: 'block' }}>
                <article style={{
                  background: 'transparent', borderTop: `1px solid ${C.hairline}`, borderRadius: 0,
                  padding: '28px 26px 28px 0', height: '100%', boxSizing: 'border-box',
                  display: 'flex', flexDirection: 'column', boxShadow: 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: post.accent, display: 'inline-block' }} />
                    <span style={{ fontSize: 11, fontWeight: 500, color: C.dim }}>{post.category}</span>
                  </div>
                  <h3 style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.35, margin: '0 0 12px', color: C.text, letterSpacing: -0.2 }}>
                    {post.title}
                  </h3>
                  <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.65, margin: '0 0 22px', flex: 1 }}>
                    {post.excerpt}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 18, borderTop: `1px solid ${C.hairline}`, gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: C.dim }}>{post.date}</span>
                      <span style={{ width: 3, height: 3, borderRadius: '50%', background: C.dim, display: 'inline-block' }} />
                      <span style={{ fontSize: 12, color: C.dim }}>{post.read}</span>
                    </div>
                    <ArrowIcon color={C.dim} size={15} />
                  </div>
                </article>
              </a>
            ))}
          </div>

          {/* More coming soon */}
          <div style={{ marginTop: 40, textAlign: 'center', padding: '40px 24px 0', borderTop: `1px solid ${C.hairline}` }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>More Stories on the Way</div>
            <p style={{ fontSize: 14, color: C.dim, margin: 0, lineHeight: 1.6 }}>
              We publish new construction-tech deep dives every couple of weeks. Start a free trial and we will email you when the next one drops.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: '112px 24px', background: 'transparent', borderTop: `1px solid ${C.hairline}`, textAlign: 'center' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{ fontWeight: 600, margin: '0 0 16px', lineHeight: 1.2, letterSpacing: -0.4 }}>
              Stop reading about it.{' '}
              <span style={{ color: C.text }}>Run a real bid.</span>
            </h2>
            <p style={{ fontSize: 16, color: C.dim, margin: '0 0 36px', lineHeight: 1.6 }}>
              AI takeoffs, the Sage assistant, pay apps, RFIs, and 50-state compliance — all in one platform. 30-day free trial, free migration, no credit card.
            </p>
            <Link href="/signup" style={{ display: 'inline-block', padding: '12px 28px', background: C.gold, borderRadius: 8, color: '#0A0A00', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
              Start Free Trial — No Credit Card
            </Link>
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
                { label: 'Pricing', href: '/pricing' }, { label: 'Blog', href: '/blog' },
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
