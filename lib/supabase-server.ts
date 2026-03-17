/**
 * lib/supabase-server.ts
 * Server-side Supabase helpers — service role + user extraction
 * NEVER import this in client components
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

const _URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const _ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const _SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!_URL || !_ANON || !_SERVICE) {
  throw new Error(
    'Missing required Supabase environment variables: ' +
    [!_URL && 'NEXT_PUBLIC_SUPABASE_URL', !_ANON && 'NEXT_PUBLIC_SUPABASE_ANON_KEY', !_SERVICE && 'SUPABASE_SERVICE_ROLE_KEY']
      .filter(Boolean).join(', ')
  );
}

const URL: string = _URL;
const ANON: string = _ANON;
const SERVICE: string = _SERVICE;

let _serviceClient: SupabaseClient | null = null;

/** Service-role client — bypasses RLS. Server only. */
export function createServerClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;
  _serviceClient = createClient(URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _serviceClient;
}

/** Browser-safe anon client (for use in server components with user session) */
export function createBrowserClient(): SupabaseClient {
  return createClient(URL, ANON);
}

/** Extract authenticated user from cookie-based session.
 *  Returns { id (auth uid), tenantId, email } — always use tenantId for DB queries. */
export async function getUser(req?: NextRequest): Promise<{ id: string; tenantId: string; email: string } | null> {
  try {
    // Extract JWT from cookie or Authorization header
    let token: string | undefined;
    if (req) {
      const rawAuth = req.headers.get('authorization')?.replace('Bearer ', '');
      // Only use the Authorization header if it looks like a real JWT (has dots)
      const headerToken = rawAuth && rawAuth.includes('.') && rawAuth !== 'undefined' ? rawAuth : undefined;
      token =
        headerToken ||
        req.cookies.get('sb-jddfvugsaosvgllbkzch-auth-token')?.value ||
        req.cookies.get('sb-access-token')?.value ||
        undefined;
    }
    if (!token) return null;

    // Validate JWT directly — works without a persisted session
    const supabase = createClient(URL, ANON, {
      auth: { persistSession: false },
    });
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;

    // Look up tenant_id from user_profiles (may differ from auth uid)
    const admin = createServerClient();
    const { data: profile } = await admin
      .from('user_profiles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    const tenantId = (profile as any)?.tenant_id || user.id;
    return { id: user.id, tenantId, email: user.email || '' };
  } catch {
    return null;
  }
}

/** Get tenant_id for the current user */
export async function getTenantId(req?: NextRequest): Promise<string | null> {
  const user = await getUser(req);
  return user?.tenantId ?? null;
}

/** Supabase admin — alias for createServerClient */
export const supabaseAdmin = createServerClient();
