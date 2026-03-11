/**
 * app/auth/callback/route.ts
 *
 * Handles Supabase email confirmation links.
 * Supabase redirects here after user clicks the confirmation email:
 *   https://yoursite.com/auth/callback?code=XXXX
 *
 * This exchanges the code for a session and sets auth cookies,
 * then redirects the user into the app.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/app';

  // If no code, redirect to login with error
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.session) {
      console.error('Auth callback error:', error?.message);
      return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
    }

    const { access_token, refresh_token, expires_at } = data.session;

    // Set auth cookies and redirect to app
    const response = NextResponse.redirect(`${origin}${next}`);
    const exp = expires_at ? new Date(expires_at * 1000).toUTCString() : '';

    response.cookies.set('sb-access-token', access_token, {
      path: '/',
      expires: expires_at ? new Date(expires_at * 1000) : undefined,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    response.cookies.set('sb-refresh-token', refresh_token, {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (err) {
    console.error('Auth callback exception:', err);
    return NextResponse.redirect(`${origin}/login?error=server_error`);
  }
}
