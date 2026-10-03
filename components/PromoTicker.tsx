'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

// Rolling promo ticker — rotates through benefit-only messages.
// NO time/performance guarantees (e.g. "switch in 1 day") to avoid advertising liability.
const MESSAGES: { text: string; cta: string; href: string }[] = [
  { text: 'Free migration from any platform or spreadsheet', cta: 'See How', href: '/switch-from-procore' },
  { text: 'One flat price · unlimited users · no per-seat fees', cta: 'View Pricing', href: '/pricing' },
  { text: 'AI takeoff reads your blueprints and builds the estimate', cta: 'See the Platform', href: '/features' },
  { text: 'Native iOS field app — included free for your whole crew', cta: 'Get the App', href: '/get-the-app' },
];

const GOLD = 'var(--brand-primary)';
const ROTATE_MS = 5000;

export default function PromoTicker() {
  const [visible, setVisible] = useState(true);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (MESSAGES.length < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % MESSAGES.length), ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  if (!visible) return null;
  const m = MESSAGES[i];

  return (
    <div
      style={{
        background: 'color-mix(in srgb, var(--brand-primary) 5%, transparent)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '9px 44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        fontSize: 13,
        lineHeight: 1.3,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* keyed span re-mounts on index change → replays the fade/slide */}
      <span
        key={i}
        className="promo-ticker-msg"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.82)', fontWeight: 400 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: GOLD, flexShrink: 0 }} />
          {m.text}
        </span>
        <Link href={m.href} style={{ color: GOLD, fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          {m.cta} &rarr;
        </Link>
      </span>

      <button
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: 4 }}
      >
        &times;
      </button>

      <style>{`
        @keyframes promoTickerIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .promo-ticker-msg { animation: promoTickerIn .45s ease; }
        @media (prefers-reduced-motion: reduce) { .promo-ticker-msg { animation: none; } }
        @media (max-width: 600px) { .promo-ticker-msg { font-size: 12px; } }
      `}</style>
    </div>
  );
}
