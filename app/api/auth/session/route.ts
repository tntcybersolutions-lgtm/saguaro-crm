/**
 * POST /api/auth/session — Server-side login
 * Sets HttpOnly cookies so tokens are never accessible via JavaScript
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function isConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return !!(url && url !== 'https://demo.supabase.co' && key && !key.includes('placeholder') && !key.startsWith('demo_') && key.length > 20);
}

export async function POST(req: NextRequest) {
  // Demo mode — no Supabase configured
  if (!isConfigured()) {
    return NextResponse.json({ ok: true, demo: true });
  }

  let body: { email?: string; password?: string } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
    password,
  });

  if (error || !data.session) {
    const msg = error?.message?.toLowerCase() || '';
    if (msg.includes('not confirmed')) {
      return NextResponse.json({ error: 'Please confirm your email before signing in. Check your inbox.' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  const { access_token, refresh_token, expires_at } = data.session;
  const response = NextResponse.json({
    ok: true,
    user: { id: data.user.id, email: data.user.email },
  });

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
