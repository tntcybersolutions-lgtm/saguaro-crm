/**
 * lib/supabase-server.ts
 * Server-side Supabase helpers — service role + user extraction.
 * NEVER import this in client components.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { Database } from './database.types';
import { withDbRetry } from './db-retry-fetch';
import { loadViewerScope, fetchWithScope, isUnrestricted, type ViewerScope } from './viewer-scope';

const _URL     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const _ANON    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const _SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!_URL || !_ANON || !_SERVICE) {
  throw new Error(
    'Missing required Supabase environment variables: ' +
    [!_URL && 'NEXT_PUBLIC_SUPABASE_URL', !_ANON && 'NEXT_PUBLIC_SUPABASE_ANON_KEY', !_SERVICE && 'SUPABASE_SERVICE_ROLE_KEY']
      .filter(Boolean).join(', ')
  );
}

const URL: string     = _URL;
const ANON: string    = _ANON;
const SERVICE: string = _SERVICE;

let _serviceClient: SupabaseClient<Database> | null = null;

/** Set by middleware.ts on every /api request: the API request's own method. */
export const REQUEST_METHOD_HEADER = 'x-saguaro-method';

/**
 * The signed-in person of the request this database call is part of, and that
 * request's method. Only a session getUser() has already VERIFIED for this
 * request counts (the cache below) — never an unchecked token. Outside a
 * request (scripts, tests, cron), or before getUser() ran, there is none.
 */
async function requestContext(): Promise<{ user: CachedUser | null; method: string | null }> {
  try {
    const { headers } = await import('next/headers');
    const h = headers();
    const method = h.get(REQUEST_METHOD_HEADER);
    const raw = h.get('authorization')?.replace('Bearer ', '').trim();
    const cookie = h.get('cookie') || '';
    const fromCookie = (name: string) => {
      const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
      return m ? decodeURIComponent(m[1]) : undefined;
    };
    const candidates = [
      raw && isJWT(raw) ? raw : undefined,
      fromCookie('sb-access-token'),
      fromCookie('sb-jddfvugsaosvgllbkzch-auth-token'),
      fromCookie('sb-refresh-token'),
    ].filter(Boolean) as string[];
    for (const token of candidates) {
      const key = await tokenKey(token);
      const hit = userCache.get(key) || actorCache.get(key);
      if (hit && hit.until > Date.now()) return { user: hit.user, method };
    }
    return { user: null, method };
  } catch {
    /* not inside a request */
    return { user: null, method: null };
  }
}

/**
 * Who is making this write — for the change history.
 *
 * The server writes with the service role, so the database cannot tell which
 * person saved an RFI or a budget line. Every write (any method but GET/HEAD)
 * carries an `x-actor-id` header naming the signed-in user of the request; the
 * database's history trigger (record_item_history) reads it.
 */
function withActor<T extends { method?: string; headers?: HeadersInit }>(init: T, user: CachedUser | null): T {
  const method = String(init.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || !user) return init;
  const merged = new Headers(init.headers);
  merged.set('x-actor-id', user.id);
  return { ...init, headers: merged };
}

/* ── viewer scope (lib/viewer-scope): closed jobs, money and rates ──────────
   Looked up once per person per 30 s per server instance; an admin's lookup
   is one profiles read and then nothing is ever rewritten for them. */
const SCOPE_TTL_MS = 30_000;
const scopeCache = new Map<string, { scope: ViewerScope; until: number }>();
const scopeInflight = new Map<string, Promise<ViewerScope>>();

async function scopeFor(user: CachedUser): Promise<ViewerScope> {
  const key = `${user.tenantId}:${user.id}`;
  const hit = scopeCache.get(key);
  if (hit && hit.until > Date.now()) return hit.scope;
  const running = scopeInflight.get(key);
  if (running) return running;
  const p = loadViewerScope(createUnscopedServerClient(), user.id, user.tenantId)
    .then((scope) => {
      if (scopeCache.size > USER_CACHE_MAX) scopeCache.clear();
      scopeCache.set(key, { scope, until: Date.now() + SCOPE_TTL_MS });
      return scope;
    })
    .finally(() => { scopeInflight.delete(key); });
  scopeInflight.set(key, p);
  return p;
}

/** Forget a person's scope on this instance — after their access was changed here. */
export function forgetViewerScope(userId?: string): void {
  if (!userId) { scopeCache.clear(); return; }
  scopeCache.forEach((_v, k) => { if (k.endsWith(`:${userId}`)) scopeCache.delete(k); });
}

/**
 * The service client's fetch: no-store, the history actor, and the viewer's
 * scope. A failed scope lookup refuses the read rather than serving it
 * unscoped.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function serverFetch(input: any, init?: any): Promise<Response> {
  const ctx = await requestContext();
  const base = withActor({ ...(init || {}), cache: 'no-store' }, ctx.user);
  if (!ctx.user || typeof input !== 'string') return fetch(input, base);
  let scope: ViewerScope;
  try {
    scope = await scopeFor(ctx.user);
  } catch (e) {
    console.error('[supabase-server] viewer scope', e);
    return new Response(JSON.stringify({ message: 'access check failed', code: 'SCOPE' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
  if (isUnrestricted(scope)) return fetch(input, base);
  return fetchWithScope((u, i) => fetch(u, i), input, base, scope, ctx.method);
}

/** Service-role client — bypasses RLS, applies the viewer's scope. Server only. */
export function createServerClient(): SupabaseClient<Database> {
  if (_serviceClient) return _serviceClient;
  _serviceClient = createClient<Database>(URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
    // The App Router caches fetch() by default, and supabase-js queries run through
    // fetch — so a parameterless read gets frozen at its first result. Force
    // no-store so service-role reads are ALWAYS fresh. withDbRetry: a 503 that
    // says the query never started is retried for ~3.5 s instead of reaching
    // the user as a 500.
    global: { fetch: withDbRetry(serverFetch) },
  });
  return _serviceClient;
}

let _unscopedClient: SupabaseClient<Database> | null = null;

/**
 * Service-role client WITHOUT the viewer's scope — for the permission
 * machinery only (lib/permissions guard, lib/viewer-scope lookup), which must
 * see a closed job to refuse it with a 403. Never hand its rows to a person.
 */
export function createUnscopedServerClient(): SupabaseClient<Database> {
  if (_unscopedClient) return _unscopedClient;
  _unscopedClient = createClient<Database>(URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global: { fetch: withDbRetry(async (input: any, init?: any) => fetch(input, { ...(init || {}), cache: 'no-store' })) },
  });
  return _unscopedClient;
}

/** Browser-safe anon client */
export function createBrowserClient(): SupabaseClient<Database> {
  return createClient<Database>(URL, ANON);
}

/** Returns true if string looks like a JWT (3 base64url segments). */
function isJWT(s: string): boolean {
  return typeof s === 'string' && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(s.trim());
}

/** Look up tenant_id for a given auth user id. Falls back to user.id. */
async function getTenant(userId: string): Promise<string> {
  const admin = createServerClient();
  const { data } = await admin
    .from('profiles')
    .select('tenant_id')
    .eq('id', userId)
    .single();
  return (data as any)?.tenant_id || userId;
}

/**
 * Verified-session cache (per server instance).
 *
 * Every /api call used to make two back-to-back trips before doing its real
 * work: Supabase Auth to verify the token, then profiles for the tenant. A page
 * fires 2–8 of these on every tap, so that was 150–300ms of waiting per call,
 * every call, for an answer that does not change between taps.
 *
 * A token that Supabase Auth has verified is remembered for at most 60 seconds
 * and never past its own expiry. Only verified results are stored; a failed or
 * unknown token always goes to Supabase Auth. Keyed by a SHA-256 of the token,
 * so the raw token is never held as a map key.
 */
type CachedUser = { id: string; tenantId: string; email: string };
const USER_CACHE_TTL_MS = 60_000;
const USER_CACHE_MAX = 1000;
const userCache = new Map<string, { user: CachedUser; until: number }>();
/** Users signed in through a refresh this instance verified, keyed by that refresh token (history actor only). */
const actorCache = new Map<string, { user: CachedUser; until: number }>();

async function tokenKey(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The token's own expiry in ms (no signature check — used only to bound the cache). */
function tokenExpiryMs(token: string): number {
  try {
    const part = token.split('.')[1] || '';
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const exp = JSON.parse(json)?.exp;
    return typeof exp === 'number' ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/** The token's subject (user id), unverified — used only to start the tenant lookup early. */
function tokenSubject(token: string): string | null {
  try {
    const part = token.split('.')[1] || '';
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const sub = JSON.parse(json)?.sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}

function rememberUser(key: string, token: string, user: CachedUser) {
  const until = Math.min(Date.now() + USER_CACHE_TTL_MS, tokenExpiryMs(token) - 5_000);
  if (until <= Date.now()) return;
  if (userCache.size >= USER_CACHE_MAX) {
    const now = Date.now();
    userCache.forEach((v, k) => { if (v.until <= now) userCache.delete(k); });
    if (userCache.size >= USER_CACHE_MAX) {
      const oldest = userCache.keys().next().value;
      if (oldest !== undefined) userCache.delete(oldest);
    }
  }
  userCache.set(key, { user, until });
}

/**
 * Extract authenticated user from a request.
 * Token priority: Authorization header → sb-access-token cookie → Supabase default cookie.
 * If the access token is expired, falls back to sb-refresh-token automatically.
 *
 * Pass `res` to have fresh cookies written back when a refresh occurs.
 * Returns { id, tenantId, email } or null.
 */
export async function getUser(
  req?: NextRequest,
  res?: NextResponse,
): Promise<{ id: string; tenantId: string; email: string } | null> {
  try {
    let accessToken: string | undefined;
    let refreshToken: string | undefined;

    if (req) {
      const rawAuth = req.headers.get('authorization')?.replace('Bearer ', '').trim();
      accessToken =
        (rawAuth && isJWT(rawAuth) ? rawAuth : undefined) ||
        req.cookies.get('sb-access-token')?.value ||
        req.cookies.get('sb-jddfvugsaosvgllbkzch-auth-token')?.value ||
        undefined;
      refreshToken = req.cookies.get('sb-refresh-token')?.value;
    }

    if (!accessToken && !refreshToken) return null;

    const supabase = createClient(URL, ANON, { auth: { persistSession: false } });

    // Try access token
    if (accessToken) {
      const key = await tokenKey(accessToken);
      const hit = userCache.get(key);
      if (hit && hit.until > Date.now()) return hit.user;
      if (hit) userCache.delete(key);

      // Start the tenant lookup alongside the token check (one round trip, not
      // two). Its answer is used only if Supabase Auth confirms the same user.
      const sub = tokenSubject(accessToken);
      const tenantP = sub ? getTenant(sub).catch(() => null) : null;
      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      if (!error && user) {
        const early = sub === user.id && tenantP ? await tenantP : null;
        const verified = { id: user.id, tenantId: early || (await getTenant(user.id)), email: user.email || '' };
        rememberUser(key, accessToken, verified);
        return verified;
      }
    }

    // Access token invalid or expired — try refresh
    if (refreshToken) {
      const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (!error && data?.session && data.user) {
        // Write refreshed cookies back to the response if provided
        if (res) {
          const cookieOpts = { path: '/', sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', httpOnly: true };
          res.cookies.set('sb-access-token', data.session.access_token, {
            ...cookieOpts,
            expires: data.session.expires_at ? new Date(data.session.expires_at * 1000) : undefined,
          });
          res.cookies.set('sb-refresh-token', data.session.refresh_token, {
            ...cookieOpts,
            maxAge: 60 * 60 * 24 * 365,
          });
        }
        const refreshed = { id: data.user.id, tenantId: await getTenant(data.user.id), email: data.user.email || '' };
        if (actorCache.size > USER_CACHE_MAX) actorCache.clear();
        actorCache.set(await tokenKey(refreshToken), { user: refreshed, until: Date.now() + 10 * 60_000 });
        return refreshed;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/** Get tenant_id for the current user. */
export async function getTenantId(req?: NextRequest): Promise<string | null> {
  const user = await getUser(req);
  return user?.tenantId ?? null;
}

/** Supabase admin client — alias for createServerClient. */
export const supabaseAdmin = createServerClient();
