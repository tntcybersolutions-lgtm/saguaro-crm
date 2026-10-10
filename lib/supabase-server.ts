/**
 * lib/supabase-server.ts
 * Server-side Supabase helpers — service role + user extraction.
 * NEVER import this in client components.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { Database } from './database.types';
import { withDbRetry } from './db-retry-fetch';

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

/** Service-role client — bypasses RLS. Server only. Typed against the live DB schema. */
export function createServerClient(): SupabaseClient<Database> {
  if (_serviceClient) return _serviceClient;
  _serviceClient = createClient<Database>(URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
    // The App Router caches fetch() by default, and supabase-js queries run through
    // fetch — so a parameterless read (e.g. "select * from platform_integrations")
    // gets frozen at its first result. Force no-store so service-role reads are
    // ALWAYS fresh (correct for a data API; avoids stale-empty reads after a write).
    // withDbRetry: a 503 that says the query never started (schema-cache reload
    // after a migration, a pool timeout) is retried for ~3.5 s instead of
    // reaching the user as a 500.
    global: { fetch: withDbRetry((input: any, init?: any) => fetch(input, { ...(init || {}), cache: 'no-store' })) }, // eslint-disable-line @typescript-eslint/no-explicit-any
  });
  return _serviceClient;
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
      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      if (!error && user) {
        return { id: user.id, tenantId: await getTenant(user.id), email: user.email || '' };
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
        return { id: data.user.id, tenantId: await getTenant(data.user.id), email: data.user.email || '' };
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
