'use client';
import { useState } from 'react';

const TESTFLIGHT = 'https://testflight.apple.com/join/jg7jdtwx';

// Shows Apple's OFFICIAL "Download on the App Store" badge once their real asset
// is dropped at /public/badges/app-store.svg (Apple's marketing resources — their
// exact artwork; recreating it violates their guidelines, so we never fabricate it).
// Until then, a clean TestFlight beta button (the correct CTA during the beta).
export function GetAppBadge() {
  const [noBadge, setNoBadge] = useState(false);
  if (!noBadge) {
    return (
      <a href={TESTFLIGHT} target="_blank" rel="noopener noreferrer" aria-label="Get Saguaro Control Systems for iOS">
        <img
          src="/badges/app-store.svg"
          alt="Download on the App Store"
          style={{ height: 52, width: 'auto', display: 'block' }}
          onError={() => setNoBadge(true)}
        />
      </a>
    );
  }
  return (
    <a
      href={TESTFLIGHT}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--brand-primary)', color: 'var(--on-brand)', textDecoration: 'none', fontWeight: 700, fontSize: 15, padding: '14px 28px', borderRadius: 10, boxShadow: '0 4px 20px var(--brand-primary-35)' }}
    >
      Join the iOS Beta →
    </a>
  );
}
