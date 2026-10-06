'use client';
import React from 'react';
import Link from 'next/link';

/*
 * SOCIAL_LINKS — the owner supplies the real handles/URLs here.
 * Do NOT invent handles.
 *
 * Confirmed with the owner on 24 Aug 2026: Saguaro has no social accounts yet.
 * Every entry below is still the '#' placeholder, and a '#' icon is worse than
 * no icon — it looks live, does nothing when clicked, and reads as a dead site.
 * So SocialRow FILTERS these out and renders nothing at all while they are
 * unset. Replace a '#' with a real profile URL and that icon appears by itself;
 * no other change is needed anywhere.
 *
 * Worth stating plainly, because it came up: these are ordinary outbound links
 * to OUR OWN profiles, opened in a new tab with rel="noopener". They never sign
 * a visitor into anything. Letting a customer connect THEIR social accounts is
 * a different feature entirely and belongs behind the login, never on a public
 * marketing page.
 */
const SOCIAL_LINKS: { name: 'Instagram' | 'Facebook' | 'TikTok' | 'X'; href: string }[] = [
  { name: 'Instagram', href: '#' },
  { name: 'Facebook', href: '#' },
  { name: 'TikTok', href: '#' },
  { name: 'X', href: '#' },
];

/** A link is real once it is not the placeholder and points somewhere. */
const isLive = (href: string) => href.trim() !== '' && href.trim() !== '#';

const DIM = 'var(--text-secondary)';
const TEXT = 'var(--text-primary)';
const GOLD = 'var(--brand-primary)';

/* Accurate brand glyphs (simple-icons paths), true brand colors on the dark ground. */
function SocialGlyph({ name, size }: { name: string; size: number }) {
  if (name === 'Instagram') {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id="sg-ig-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#FEDA75" />
            <stop offset="30%" stopColor="#FA7E1E" />
            <stop offset="55%" stopColor="#D62976" />
            <stop offset="80%" stopColor="#962FBF" />
            <stop offset="100%" stopColor="#4F5BD5" />
          </linearGradient>
        </defs>
        <path fill="url(#sg-ig-grad)" d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z" />
      </svg>
    );
  }
  if (name === 'Facebook') {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    );
  }
  if (name === 'TikTok') {
    const d = 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z';
    return (
      <svg viewBox="-1.5 -1.5 27 27" width={size} height={size} aria-hidden="true">
        <path fill="#25F4EE" d={d} transform="translate(-0.9,-0.9)" />
        <path fill="#FE2C55" d={d} transform="translate(0.9,0.9)" />
        <path fill="var(--text-primary)" d={d} />
      </svg>
    );
  }
  /* X — brand mark is black; white on the dark ground */
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="var(--text-primary)" d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

/* Compact social icon row — footer and header both use this. */
export function SocialRow({ size = 18, gap = 14 }: { size?: number; gap?: number }) {
  const live = SOCIAL_LINKS.filter(s => isLive(s.href));
  // Nothing configured yet — render nothing rather than dead icons.
  if (live.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      {live.map(s => (
        <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={`Saguaro on ${s.name}`} style={{ display: 'inline-flex', lineHeight: 0 }}>
          <SocialGlyph name={s.name} size={size} />
        </a>
      ))}
    </span>
  );
}

const COLUMNS: { head: string; links: { l: string; h: string }[] }[] = [
  {
    head: 'Product',
    links: [
      { l: 'Takeoff Studio', h: '/takeoff' },
      { l: 'All Features', h: '/features' },
      { l: 'Product', h: '/product' },
      { l: 'Field App', h: '/get-the-app' },
      { l: 'Intelligence', h: '/intelligence' },
      { l: 'Pricing', h: '/pricing' },
      { l: 'Compare', h: '/compare' },
    ],
  },
  {
    head: 'Company',
    links: [
      { l: 'About', h: '/about' },
      { l: 'Careers', h: '/careers' },
      { l: 'Contact', h: '/contact' },
      { l: 'Partners', h: '/partners' },
    ],
  },
  {
    head: 'Resources',
    links: [
      { l: 'How It Works', h: '/how-it-works' },
      { l: 'Blog', h: '/blog' },
      { l: 'API Docs', h: '/api-docs' },
      { l: 'Help Center', h: '/help-center' },
      { l: 'Changelog', h: '/changelog' },
      { l: 'ROI Calculator', h: '/roi-calculator' },
    ],
  },
  {
    head: 'Legal',
    links: [
      { l: 'Privacy Policy', h: '/privacy' },
      { l: 'Terms of Service', h: '/terms' },
      { l: 'Security', h: '/security' },
      { l: 'SLA', h: '/sla' },
    ],
  },
];

export default function MarketingFooter() {
  return (
    <footer style={{ borderTop: '1px solid rgba(255,255,255,0.12)', maxWidth: 1200, margin: '0 auto', padding: '40px 24px 24px', color: TEXT }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32, marginBottom: 32 }} className="mf-grid">
        {COLUMNS.map(col => (
          <div key={col.head}>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 14 }}>{col.head}</h4>
            {col.links.map(({ l, h }) => (
              <div key={l}><Link href={h} style={{ color: DIM, textDecoration: 'none', fontSize: 13, lineHeight: 2 }}>{l}</Link></div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 16 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }} aria-label="Saguaro Control Systems — home">
          <img src="/logo-horizontal.png" alt="Saguaro Control Systems" height={30} style={{ height: 30, width: 'auto', display: 'block' }} />
        </Link>
        <SocialRow size={18} gap={16} />
        <span style={{ fontSize: 12, color: DIM }}>&copy; {new Date().getFullYear()} Saguaro Control Systems. All rights reserved. &middot; <span style={{ color: GOLD, fontWeight: 600 }}>Control Every Project. Deliver Every Promise.</span></span>
      </div>
      <style>{`
        @media (max-width: 768px) { .mf-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 480px) { .mf-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </footer>
  );
}
