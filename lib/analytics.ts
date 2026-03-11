/**
 * lib/analytics.ts
 * Server-side analytics helper — gracefully logs events.
 * In production, connect PostHog or another analytics provider.
 * Currently logs to console in dev; no-ops in production.
 */

// ─── trackEvent ───────────────────────────────────────────────────────────────

export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
  distinctId?: string,
): void {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Analytics] ${event}`, { distinctId, ...properties });
    }
    // TODO: wire posthog-node when added to package.json
  } catch {
    // fire-and-forget — never throw
  }
}

// ─── trackDocumentGenerated ───────────────────────────────────────────────────

export function trackDocumentGenerated(
  projectId: string,
  docType: string,
  userId?: string,
): void {
  trackEvent(
    'document_generated',
    { project_id: projectId, doc_type: docType },
    userId,
  );
}

// ─── trackPayAppSubmitted ─────────────────────────────────────────────────────

export function trackPayAppSubmitted(
  projectId: string,
  appNumber: number,
  amount: number,
  userId?: string,
): void {
  trackEvent(
    'pay_app_submitted',
    { project_id: projectId, app_number: appNumber, amount },
    userId,
  );
}

// ─── trackUserSignup ──────────────────────────────────────────────────────────

export function trackUserSignup(userId: string, email: string, plan?: string): void {
  trackEvent(
    'user_signup',
    { email, plan: plan ?? 'unknown' },
    userId,
  );
}

// ─── trackPageView ────────────────────────────────────────────────────────────

export function trackPageView(path: string, userId?: string): void {
  trackEvent(
    '$pageview',
    { $current_url: path },
    userId,
  );
}

// ─── track (generic alias for use by document generators) ────────────────────

export type AnalyticsEvent =
  | 'signup' | 'trial_start' | 'trial_converted'
  | 'project_created' | 'pay_app_submitted' | 'pay_app_approved'
  | 'document_generated' | 'takeoff_run' | 'rfi_created'
  | 'lien_waiver_signed' | 'insurance_uploaded' | 'autopilot_scan'
  | 'feature_used';

export function track(
  event: AnalyticsEvent,
  properties?: Record<string, unknown>
): void {
  trackEvent(event, properties);
}
