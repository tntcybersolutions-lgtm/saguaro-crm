'use client';

/**
 * Error boundary for the whole /field subtree.
 *
 * There was none before this file, anywhere under /field. Any throw fell all
 * the way through to Next's bare error screen: no branding, no explanation, and
 * — the reported complaint — no way back. A superintendent standing on a
 * jobsite got a dead page and had to know to edit the URL.
 *
 * This gives three things the bare screen never did:
 *   1. A way out. "Try again" re-renders the route without a full reload, and
 *      "Back to Field Hub" is always there as the escape hatch.
 *   2. The actual error text, on screen. It is the only way to diagnose a
 *      client-side crash on a device we cannot open a console on — and the
 *      photo failure currently under investigation produces no server-side log
 *      at all, so this is the only place its message can surface.
 *   3. Work protection. It says plainly that queued offline work is still
 *      stored, because the instinct on seeing an error is to assume the photo
 *      or log just taken is gone.
 */

import React from 'react';
import Link from 'next/link';

const BG = '#0a0a0a';
const CARD = '#141416';
const GOLD = '#F59E0B';
const TEXT = '#FFFFFF';
const DIM = '#CBD5E1';

export default function FieldError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Surface it in the device console too, for anyone able to attach one.
    console.error('[field] route error:', error);
  }, [error]);

  const btn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    padding: '0 26px',
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    textDecoration: 'none',
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.14)',
    // Field targets are hit with gloves on — nothing here is a small tap.
    minWidth: 168,
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: BG,
        color: TEXT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div
          style={{
            background: CARD,
            border: '1px solid rgba(245,158,11,0.22)',
            borderRadius: 16,
            padding: 'clamp(22px, 5vw, 34px)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: GOLD, marginBottom: 12 }}>
            Something broke on this screen
          </div>

          <h1 style={{ fontSize: 'clamp(21px, 5vw, 27px)', fontWeight: 700, lineHeight: 1.25, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
            This page could not load.
          </h1>

          <p style={{ color: DIM, fontSize: 15, lineHeight: 1.6, margin: '0 0 18px' }}>
            The rest of the field app is still working — this one screen failed.
            Anything already saved offline is still queued and will upload when
            you reconnect. Nothing has been lost.
          </p>

          {/* The message itself. Without this a crash on a phone is undebuggable. */}
          <div
            style={{
              background: 'rgba(0,0,0,0.45)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 22,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8FA3C0', marginBottom: 6 }}>
              What went wrong
            </div>
            <code style={{ display: 'block', fontSize: 13, lineHeight: 1.5, color: '#F4F4F5', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {error?.message || 'No error message was provided.'}
            </code>
            {error?.digest && (
              <div style={{ fontSize: 11, color: '#8FA3C0', marginTop: 8 }}>
                Reference: {error.digest} — quote this when reporting it.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <button onClick={() => reset()} style={{ ...btn, background: GOLD, color: '#1A1205', border: '1px solid ' + GOLD }}>
              Try again
            </button>
            <Link href="/field" style={{ ...btn, background: 'transparent', color: TEXT }}>
              Back to Field Hub
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
