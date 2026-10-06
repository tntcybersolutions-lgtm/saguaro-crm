'use client';

/**
 * RouteError — the panel every route-level error boundary renders.
 *
 * The takeoff page went black and there was no way to tell, from the screen,
 * whether it had crashed, hung, or simply not loaded. That ambiguity is the
 * real defect: a blank page tells the GC nothing, tells support nothing, and
 * leaves "is my work gone?" unanswered.
 *
 * Only /field had an error boundary. Everything else — the whole signed-in app
 * and the marketing site — fell through to a bare screen. One panel, used by
 * every boundary, so a failure looks the same and reads the same wherever it
 * happens:
 *
 *   1. A way out that is not the browser's back button — reset() re-renders
 *      the route without a reload, and there is always a labeled way home.
 *   2. The error text on screen. A client-side crash writes no server log, so
 *      this is frequently the only place the cause is ever visible.
 *   3. The digest, quoted as a reference, so a support call has something to
 *      search for instead of "it broke".
 *
 * `inShell` is the one real variant: under /app the sidebar and header are
 * still mounted around this, so the panel sits in the content column rather
 * than centring itself in the viewport.
 */

import React from 'react';
import Link from 'next/link';

const CARD = 'var(--bg-surface)';
const GOLD = 'var(--brand-primary)';
const TEXT = 'var(--text-primary)';
const DIM = 'var(--text-tertiary)';

export default function RouteError({
  error,
  reset,
  homeHref,
  homeLabel,
  scope,
  inShell = false,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref: string;
  homeLabel: string;
  scope: string;
  inShell?: boolean;
}) {
  React.useEffect(() => {
    console.error(`[${scope}] route error:`, error);
  }, [error, scope]);

  const btn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 42,
    padding: '0 22px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 700,
    textDecoration: 'none',
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.14)',
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: inShell ? 'flex-start' : 'center',
        justifyContent: 'center',
        minHeight: inShell ? 'auto' : '100vh',
        padding: inShell ? '48px 28px' : 24,
        background: inShell ? 'transparent' : '#0d1117',
        color: TEXT,
      }}
    >
      <div style={{ width: '100%', maxWidth: 620 }}>
        <div
          style={{
            background: CARD,
            border: '1px solid var(--brand-primary-25)',
            borderRadius: 16,
            padding: 'clamp(22px, 4vw, 32px)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: GOLD,
              marginBottom: 12,
            }}
          >
            Something Broke on This Screen
          </div>

          <h1 style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 700, lineHeight: 1.25, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
            This page could not load.
          </h1>

          <p style={{ color: DIM, fontSize: 14.5, lineHeight: 1.6, margin: '0 0 18px' }}>
            The rest of the platform is still running — this one screen failed.
            Nothing you had already saved has been changed or lost.
          </p>

          <div
            style={{
              background: 'rgba(0,0,0,0.42)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 22,
            }}
          >
            <div style={{ fontSize: 10.5, fontWeight: 700, color: DIM, marginBottom: 6 }}>
              What Went Wrong
            </div>
            <code
              style={{
                display: 'block',
                fontSize: 12.5,
                lineHeight: 1.5,
                color: '#F4F4F5',
                wordBreak: 'break-word',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              {error?.message || 'No error message was provided.'}
            </code>
            {error?.digest && (
              <div style={{ fontSize: 11, color: DIM, marginTop: 8 }}>
                Reference: {error.digest} — quote this when reporting it.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <button onClick={() => reset()} style={{ ...btn, background: GOLD, color: 'var(--on-brand)', border: `1px solid ${GOLD}` }}>
              Try Again
            </button>
            <Link href={homeHref} style={{ ...btn, background: 'transparent', color: TEXT }}>
              {homeLabel}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
