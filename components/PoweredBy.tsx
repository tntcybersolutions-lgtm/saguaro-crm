'use client';

/**
 * "Powered by Saguaro" — the one place the name appears once white-label is on.
 *
 * A tenant who has branded the platform is entitled to have it read as their
 * system: their logo, their colours, their company name on the documents. This
 * is the single exception, and it is deliberately small and quiet — a line in
 * the footer, not a badge on the chrome.
 *
 * A tenant can switch it off entirely from Settings → Branding. When they do,
 * the Saguaro name appears nowhere their customers can see. That is the deal
 * being sold, so honouring it completely matters more than the credit does.
 */

import React from 'react';
import { useWhiteLabel } from './WhiteLabelProvider';

export default function PoweredBy({ style }: { style?: React.CSSProperties }) {
  const wl = useWhiteLabel();

  /* Nothing to credit when the product is unbranded — it is plainly Saguaro
     already, and a "powered by" under our own logo reads as an oversight. */
  if (!wl.whiteLabelEnabled) return null;
  if (wl.showSaguaroCredit === false) return null;

  return (
    <div
      style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '18px 16px 22px', fontSize: 11, letterSpacing: '0.02em',
        color: 'var(--sg-text-faint, rgba(255,255,255,0.34))',
        ...style,
      }}
    >
      <span>
        Powered by{' '}
        <a
          href="https://saguarocontrol.net/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}
        >
          Saguaro
        </a>
      </span>
    </div>
  );
}
