/**
 * POST /api/auth/token — Set session from raw tokens (implicit flow)
 * Used when Supabase returns access_token in the URL hash fragment
 * instead of a ?code= query param (implicit grant flow).
 */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  let body: { access_token?: string; refresh_token?: string; expires_at?: number } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { access_token, refresh_token, expires_at } = body;
  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: 'Missing tokens' }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  const base = {
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  };

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
