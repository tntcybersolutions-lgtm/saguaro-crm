/**
 * QuickBooks Online — the ONE place the Intuit app credentials are read.
 *
 * Before this file the page, the connect route and the callback each read a
 * different set of env names (NEXT_PUBLIC_QUICKBOOKS_CLIENT_ID in the browser,
 * QB_* in the connect route, QUICKBOOKS_* in the callback), so no single set of
 * Vercel variables could ever complete a connection. Everything now reads:
 *
 *   QUICKBOOKS_CLIENT_ID       Intuit app Client ID            (required)
 *   QUICKBOOKS_CLIENT_SECRET   Intuit app Client Secret        (required)
 *   QUICKBOOKS_ENVIRONMENT     'sandbox' | 'production'         (default production)
 *   QUICKBOOKS_REDIRECT_URI    must match the URI registered at Intuit exactly
 *                              (default `${NEXT_PUBLIC_APP_URL || request origin}/api/integrations/quickbooks/callback`)
 *
 * The old QB_CLIENT_ID / QB_CLIENT_SECRET / QB_REDIRECT_URI / QB_SANDBOX names
 * are read only as fallbacks. Nothing here is ever sent to the browser.
 */

export type QboEnvironment = 'sandbox' | 'production';

export type QuickBooksConfig = {
  clientId: string;
  clientSecret: string;
  environment: QboEnvironment;
  /** Accounting API host for the environment (no trailing slash). */
  apiBase: string;
  /** Redirect URI sent to Intuit on authorize AND on code exchange — must be identical. */
  redirectUri: string;
};

type Env = Record<string, string | undefined>;

export const QBO_AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';
export const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
export const QBO_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
export const QBO_SCOPE = 'com.intuit.quickbooks.accounting';
/** Intuit retired minor versions 1–74; 75 is the floor every request names. */
export const QBO_MINOR_VERSION = '75';
export const QBO_CALLBACK_PATH = '/api/integrations/quickbooks/callback';

const first = (...vals: (string | undefined)[]) => {
  for (const v of vals) {
    const t = (v ?? '').trim();
    if (t) return t;
  }
  return '';
};

export function apiBaseFor(environment: QboEnvironment): string {
  return environment === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
}

/** 'sandbox' (or Intuit's own word for it, 'development') → sandbox; anything else → production. */
export function environmentFrom(env: Env = process.env): QboEnvironment {
  const named = (env.QUICKBOOKS_ENVIRONMENT ?? '').trim().toLowerCase();
  if (named === 'sandbox' || named === 'development') return 'sandbox';
  if (named) return 'production';
  return (env.QB_SANDBOX ?? '').trim().toLowerCase() === 'true' ? 'sandbox' : 'production';
}

/** The origin part of an absolute URL, or '' when it is not one. */
function originOf(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : '';
  } catch {
    return ''; // not an absolute URL — the caller falls through to the next source
  }
}

/**
 * The redirect URI: explicit env first, else the app URL, else the origin the
 * request came in on. '' when none of them gives an absolute URL.
 */
export function redirectUriFrom(env: Env = process.env, requestOrigin?: string): string {
  const explicit = first(env.QUICKBOOKS_REDIRECT_URI, env.QB_REDIRECT_URI);
  if (explicit) return explicit;
  const base = originOf(first(env.NEXT_PUBLIC_APP_URL)) || originOf(requestOrigin ?? '');
  return base ? `${base}${QBO_CALLBACK_PATH}` : '';
}

/** True when the server holds an Intuit Client ID and Secret — i.e. Connect can work. */
export function isQuickBooksConfigured(env: Env = process.env): boolean {
  return !!(first(env.QUICKBOOKS_CLIENT_ID, env.QB_CLIENT_ID) && first(env.QUICKBOOKS_CLIENT_SECRET, env.QB_CLIENT_SECRET));
}

/** The full config, or null when QuickBooks is not configured on this server. */
export function quickBooksConfig(requestOrigin?: string, env: Env = process.env): QuickBooksConfig | null {
  const clientId = first(env.QUICKBOOKS_CLIENT_ID, env.QB_CLIENT_ID);
  const clientSecret = first(env.QUICKBOOKS_CLIENT_SECRET, env.QB_CLIENT_SECRET);
  if (!clientId || !clientSecret) return null;
  const environment = environmentFrom(env);
  return {
    clientId,
    clientSecret,
    environment,
    apiBase: apiBaseFor(environment),
    redirectUri: redirectUriFrom(env, requestOrigin),
  };
}

/** What a page may know about the configuration — never the ID or the secret. */
export function publicQuickBooksConfig(env: Env = process.env): { configured: boolean; environment: QboEnvironment } {
  return { configured: isQuickBooksConfigured(env), environment: environmentFrom(env) };
}
