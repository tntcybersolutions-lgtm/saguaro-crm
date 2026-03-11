/**
 * POST /api/auth/signup — Server-side signup
 * Creates Supabase user and sets HttpOnly session cookies if auto-confirmed
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function isConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return !!(url && url !== 'https://demo.supabase.co' && key && !key.includes('placeholder') && !key.startsWith('demo_') && key.length > 20);
}

export async function POST(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ ok: true, demo: true, confirmed: true });
  }

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { email, password, company, phone, role, state, size } = body;
  if (!email || !password || !company) {
    return NextResponse.json({ error: 'Email, password, and company name are required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://saguaro-crm-rho.vercel.app';

  const { data, error } = await supabase.auth.signUp({
    email: email.toLowerCase().trim(),
    password,
    options: {
      data: { company_name: company, phone: phone || '', role: role || 'General Contractor', state: state || 'AZ', company_size: size || '1-10' },
      emailRedirectTo: `${appUrl}/auth/callback`,
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already')) {
      return NextResponse.json({ error: 'An account with this email already exists. Please log in instead.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Auto-confirmed (email confirmation disabled in Supabase) — set session immediately
  if (data.session) {
    const { access_token, refresh_token, expires_at } = data.session;
    const response = NextResponse.json({ ok: true, confirmed: true });
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

  // Email confirmation required
  return NextResponse.json({ ok: true, confirmed: false });
}
