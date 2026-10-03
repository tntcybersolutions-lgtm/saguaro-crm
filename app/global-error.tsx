'use client';

/**
 * global-error — the last boundary. It runs only when the ROOT layout itself
 * throws, which is the one failure that produces a genuinely blank document:
 * no layout means no shell, no fonts, no providers, nothing to render into.
 *
 * Because it replaces the root layout it has to supply its own <html> and
 * <body>. It also deliberately imports nothing from the app — not RouteError,
 * not the tokens, not next/link. Whatever just failed took the layout down
 * with it, and a shared import is a second chance to fail on the screen whose
 * whole job is to survive. Everything here is inline and self-contained; the
 * colors are duplicated from the tokens on purpose.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: 'var(--bg-base, #000000)', color: '#FFFFFF', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 620 }}>
            <div style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 16, padding: 32 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand-primary, #FFE600)', marginBottom: 12 }}>
                Saguaro Could Not Start
              </div>
              <h1 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.25, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
                The application failed to load.
              </h1>
              <p style={{ color: '#D4D4D8', fontSize: 14.5, lineHeight: 1.6, margin: '0 0 18px' }}>
                This is not a problem with your data — nothing has been changed
                or lost. Reloading usually clears it.
              </p>

              <div style={{ background: 'rgba(0,0,0,0.42)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, padding: '12px 14px', marginBottom: 22 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#D4D4D8', marginBottom: 6 }}>
                  What Went Wrong
                </div>
                <code style={{ display: 'block', fontSize: 12.5, lineHeight: 1.5, color: '#F4F4F5', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {error?.message || 'No error message was provided.'}
                </code>
                {error?.digest && (
                  <div style={{ fontSize: 11, color: '#A9B4C4', marginTop: 8 }}>
                    Reference: {error.digest} — quote this when reporting it.
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <button
                  onClick={() => reset()}
                  style={{ height: 42, padding: '0 22px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', background: 'var(--brand-primary, #FFE600)', color: '#0A0A00', border: '1px solid var(--brand-primary, #FFE600)' }}
                >
                  Try Again
                </button>
                <a
                  href="/"
                  style={{ display: 'inline-flex', alignItems: 'center', height: 42, padding: '0 22px', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none', background: 'transparent', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.14)' }}
                >
                  Back to Home
                </a>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
