'use client';
import { Component, ErrorInfo, ReactNode } from 'react';

/**
 * ErrorBoundary — catches a render throw inside the signed-in shell.
 *
 * This is the React-level boundary; app/app/error.tsx is the route-level one.
 * Both exist because they catch different things: this one keeps a broken
 * widget from taking down the page around it, while error.tsx catches the
 * cases React cannot see (server components, the layout itself).
 *
 * Two things were wrong with the original and both cost real time:
 *
 *   - It caught the error and threw the message away, rendering only "Please
 *     refresh the page to continue." A client-side crash writes no server log,
 *     so that message was the only evidence and it went in the bin.
 *   - Its one action was window.location.reload(). A reload re-runs the same
 *     render and hits the same throw, so the button looked like it did nothing.
 *     Resetting state first gives the retry an actual chance to succeed, and
 *     "Back to Dashboard" is the escape hatch when it doesn't.
 */

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

const GOLD = 'var(--brand-primary)';
const DIM = 'var(--text-tertiary)';

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const msg = this.state.error?.message;
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 260, padding: '40px 24px' }}>
          <div style={{ width: '100%', maxWidth: 560, background: 'var(--bg-surface)', border: '1px solid var(--brand-primary-25)', borderRadius: 16, padding: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: GOLD, marginBottom: 10 }}>
              Something Broke on This Screen
            </div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 19, marginBottom: 10, letterSpacing: '-0.01em' }}>
              This section could not load.
            </div>
            <div style={{ color: DIM, fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
              The rest of the page is still working. Nothing you had already
              saved has been changed or lost.
            </div>

            {/* The message itself — without it a client crash leaves no trace
                anywhere, since nothing about it reaches the server. */}
            <div style={{ background: 'rgba(0,0,0,0.42)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: DIM, marginBottom: 6 }}>
                What Went Wrong
              </div>
              <code style={{ display: 'block', fontSize: 12.5, lineHeight: 1.5, color: 'var(--c-text)', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {msg || 'No error message was provided.'}
              </code>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {/* Clear the caught error before retrying — a bare reload just
                  re-runs the same render and throws again. */}
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                style={{ height: 40, padding: '0 20px', background: GOLD, border: `1px solid ${GOLD}`, borderRadius: 10, color: 'var(--on-brand)', fontWeight: 700, cursor: 'pointer', fontSize: 13.5 }}
              >
                Try Again
              </button>
              <a
                href="/app"
                style={{ display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 20px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, color: 'var(--text-primary)', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}
              >
                Back to Dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
