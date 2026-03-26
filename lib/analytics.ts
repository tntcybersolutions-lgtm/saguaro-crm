/**
 * lib/analytics.ts
 * Server-side analytics via PostHog.
 * Captures events server-side for reliability — no ad-blockers, no client JS required.
 *
 * Set POSTHOG_API_KEY and POSTHOG_HOST in your environment:
 *   POSTHOG_API_KEY=phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   POSTHOG_HOST=https://us.i.posthog.com   (or https://eu.i.posthog.com)
 */

import { PostHog } from 'posthog-node';

let _client: PostHog | null = null;

function getClient(): PostHog | null {
  if (_client) return _client;

  const apiKey = process.env.POSTHOG_API_KEY;
  const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!apiKey) {
    if (process.env.NODE_ENV !== 'production') {
      // Silent in dev — just log to console
    }
    return null;
  }

  _client = new PostHog(apiKey, {
    host,
    flushAt: 20,
    flushInterval: 10_000,
  });

  // Flush on process exit
  process.on('beforeExit', () => {
    _client?.shutdown();
  });

  return _client;
}

// ─── trackEvent ───────────────────────────────────────────────────────────────

export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
  distinctId?: string,
): void {
  try {
    const client = getClient();
    const id = distinctId || 'anonymous';

    if (client) {
      client.capture({
        distinctId: id,
        event,
        properties: {
          ...properties,
          $lib: 'saguaro-crm-server',
        },
      });
    }

    // Also log in development for debugging
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Analytics] ${event}`, { distinctId: id, ...properties });
    }
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
  const client = getClient();
  if (client) {
    // Identify the user in PostHog
    client.identify({
      distinctId: userId,
      properties: {
        email,
        plan: plan ?? 'trial',
        signed_up_at: new Date().toISOString(),
      },
    });
  }
  trackEvent(
    'user_signup',
    { email, plan: plan ?? 'trial' },
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
