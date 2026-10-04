/**
 * GET /api/auth/refresh — Silently refresh an expired access token
 * Called from app layout on mount to keep sessions alive
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function isConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return !!(url && url !== 'https://demo.supabase.co' && key && !key.includes('placeholder') && !key.startsWith('demo_') && key.length > 20);
}

/** Seconds-since-epoch expiry of a JWT, or null when it cannot be read. */
function jwtExpiry(token: string | undefined): number | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: 'Authentication service not configured' }, { status: 503 });
  }

  const refreshToken = req.cookies.get('sb-refresh-token')?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  /* Only rotate when the access token is actually about to expire. This route
     runs on EVERY app-layout mount, and Supabase rotates the refresh token on
     every grant — so each page load minted a new token, and two loads in flight
     at once (a second tab, a phone and a desktop, a double navigation) replayed
     the old one: "refresh_token_already_used", the family revoked, everyone
     signed out. The auth logs showed a rotation every minute before the drops. */
  const accessToken = req.cookies.get('sb-access-token')?.value;
  const exp = jwtExpiry(accessToken);
  if (exp && exp - Math.floor(Date.now() / 1000) > 300) {
    return NextResponse.json({ ok: true, fresh: true });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

  if (error || !data.session) {
    const response = NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 });
    response.cookies.set('sb-access-token', '', { path: '/', maxAge: 0 });
    response.cookies.set('sb-refresh-token', '', { path: '/', maxAge: 0 });
    return response;
  }

  const { access_token, refresh_token, expires_at } = data.session;
  const response = NextResponse.json({ ok: true });
  const base = { path: '/', sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', httpOnly: true };
  response.cookies.set('sb-access-token', access_token, {
    ...base,
    expires: expires_at ? new Date(expires_at * 1000) : undefined,
  });
  response.cookies.set('sb-refresh-token', refresh_token, {
    ...base,
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
