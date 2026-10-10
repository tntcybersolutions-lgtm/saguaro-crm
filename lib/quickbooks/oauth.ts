/**
 * QuickBooks OAuth — the pure parts: building the Intuit authorize URL, the
 * CSRF state that rides in an httpOnly cookie, and token-expiry arithmetic.
 * No network, no database: lib/quickbooks/quickbooks.sanity.test.ts pins it.
 */
import { QBO_AUTHORIZE_URL, QBO_SCOPE } from './config';

/** httpOnly cookie that carries the state from Connect to the callback. */
export const QBO_STATE_COOKIE = 'qbo_oauth_state';
/** Ten minutes to sign in at Intuit and pick a company. */
export const QBO_STATE_MAX_AGE_SECONDS = 600;
/** Scoped to the QuickBooks routes; the callback lives under this path. */
export const QBO_STATE_COOKIE_PATH = '/api/integrations/quickbooks';
/** Secure everywhere except plain-http local development. */
export function stateCookieSecure(protocol: string, nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv === 'production' || protocol === 'https:';
}

/** Refresh this long before Intuit's stated expiry so a call never lands on a dead token. */
export const QBO_EXPIRY_SKEW_MS = 5 * 60 * 1000;

const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** 256 bits of randomness, URL-safe. */
export function newOAuthState(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return b64url(bytes);
}

/** The cookie binds the state to the user who pressed Connect. */
export function stateCookieValue(state: string, userId: string): string {
  return `${state}.${userId}`;
}

export function parseStateCookie(raw: string | null | undefined): { state: string; userId: string } | null {
  if (!raw) return null;
  const dot = raw.indexOf('.');
  if (dot <= 0 || dot === raw.length - 1) return null;
  return { state: raw.slice(0, dot), userId: raw.slice(dot + 1) };
}

/** Constant-time string comparison (length is not secret here: it is fixed). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type StateCheck =
  | { ok: true }
  | { ok: false; reason: 'no_cookie' | 'no_state' | 'mismatch' | 'other_user' };

/**
 * The callback's gate. The state Intuit echoes back must equal the one in the
 * cookie, and the signed-in user must be the one who started the connection.
 */
export function checkOAuthState(cookieRaw: string | null | undefined, returnedState: string | null | undefined, sessionUserId: string | null | undefined): StateCheck {
  const c = parseStateCookie(cookieRaw);
  if (!c) return { ok: false, reason: 'no_cookie' };
  if (!returnedState) return { ok: false, reason: 'no_state' };
  if (!safeEqual(c.state, returnedState)) return { ok: false, reason: 'mismatch' };
  if (!sessionUserId || c.userId !== sessionUserId) return { ok: false, reason: 'other_user' };
  return { ok: true };
}

export function buildAuthorizeUrl(p: { clientId: string; redirectUri: string; state: string; scope?: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    response_type: 'code',
    scope: p.scope ?? QBO_SCOPE,
    redirect_uri: p.redirectUri,
    state: p.state,
  });
  return `${QBO_AUTHORIZE_URL}?${q.toString()}`;
}

/** True when the access token is missing, unparseable, or inside the refresh skew. */
export function accessTokenExpired(expiresAt: string | null | undefined, now: number = Date.now(), skewMs = QBO_EXPIRY_SKEW_MS): boolean {
  if (!expiresAt) return true;
  const t = new Date(expiresAt).getTime();
  if (!Number.isFinite(t)) return true;
  return t - skewMs <= now;
}

/** Intuit's token response (authorization_code and refresh_token grants share it). */
export type IntuitTokenGrant = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
  token_type?: string;
};

/**
 * The columns to write from a grant. Intuit ROTATES the refresh token — the
 * one it returns replaces the stored one — so it is always written when given.
 * Returns null when the grant has no access token (nothing usable to store).
 */
export function tokenColumnsFromGrant(grant: IntuitTokenGrant, now: number = Date.now(), previousRefresh?: string | null): {
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string;
} | null {
  if (!grant || typeof grant.access_token !== 'string' || !grant.access_token) return null;
  const secs = Number(grant.expires_in);
  const life = Number.isFinite(secs) && secs > 0 ? secs : 3600;
  return {
    access_token: grant.access_token,
    refresh_token: (typeof grant.refresh_token === 'string' && grant.refresh_token) || previousRefresh || null,
    token_expires_at: new Date(now + life * 1000).toISOString(),
  };
}

/** HTTP Basic credentials for Intuit's token and revoke endpoints. */
export function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

/** A browser navigation (address bar / link / location.href) rather than fetch(). */
export function isNavigation(headers: { get(name: string): string | null }): boolean {
  const mode = headers.get('sec-fetch-mode');
  if (mode) return mode === 'navigate';
  return (headers.get('accept') ?? '').includes('text/html');
}
