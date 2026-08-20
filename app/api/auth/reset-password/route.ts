/**
 * POST /api/auth/reset-password
 *
 * Server-side password update using the HttpOnly session cookie.
 * Called from /reset-password after the user has been authenticated
 * via the recovery link (either ?code= or hash fragment flow).
 *
 * The session is already in the sb-access-token HttpOnly cookie —
 * we re-hydrate it via the refresh_token cookie and call updateUser.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const IS_PROD = process.env.NODE_ENV === 'production';

function isConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return !!(url && url !== 'https://demo.supabase.co' && key && !key.includes('placeholder') && !key.startsWith('demo_') && key.length > 20);
}

export async function POST(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: 'Authentication service not configured' }, { status: 503 });
  }

  let body: { password?: string } = {};
  try {
    body = await req.json();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, {status: 400});
  }

  const { password } = body;

  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  // Get the access token from the HttpOnly cookie
  const accessToken = req.cookies.get('sb-access-token')?.value;
  const refreshToken = req.cookies.get('sb-refresh-token')?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json(
      { error: 'No active session. Please click the reset link in your email again.' },
      { status: 401 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false },
      global: {
        headers: {
          // Pass the access token so Supabase knows who is updating the password
          Authorization: `Bearer ${accessToken}`,
        },
      },
    }
  );

  // If access token is present, use it directly
  // If expired, try to refresh first
  let finalAccessToken = accessToken;

  if (!accessToken && refreshToken) {
    const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (refreshErr || !refreshData.session) {
      return NextResponse.json(
        { error: 'Your reset link has expired. Please request a new password reset.' },
        { status: 401 }
      );
    }
    finalAccessToken = refreshData.session.access_token;
  }

  // Update password using the admin/service approach with the access token
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: { Authorization: `Bearer ${finalAccessToken}` },
      },
    }
  );

  const { error: updateError } = await adminClient.auth.updateUser({ password });

  if (updateError) {
    const msg = updateError.message.toLowerCase();
    if (msg.includes('expired') || msg.includes('invalid') || msg.includes('jwt')) {
      return NextResponse.json(
        { error: 'Your reset link has expired. Please request a new password reset.' },
        { status: 401 }
      );
    }
    if (msg.includes('same password') || msg.includes('different')) {
      return NextResponse.json(
        { error: 'Please choose a different password than your current one.' },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  // Clear all session cookies — force user to log in fresh with new password
  const response = NextResponse.json({ ok: true });

  const clearOpts = { path: '/', maxAge: 0 };
  response.cookies.set('sb-access-token', '', clearOpts);
  response.cookies.set('sb-refresh-token', '', clearOpts);
  response.cookies.set('saguaro_trial_expires', '', clearOpts);

  return response;
}
