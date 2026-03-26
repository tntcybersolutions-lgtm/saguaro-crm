/**
 * POST /api/auth/signup — Server-side signup
 * Creates Supabase user and sets HttpOnly session cookies if auto-confirmed
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authLimiter } from '@/lib/rate-limit';

function isConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return !!(url && url !== 'https://demo.supabase.co' && key && !key.includes('placeholder') && !key.startsWith('demo_') && key.length > 20);
}

export async function POST(req: NextRequest) {
  const limited = authLimiter.check(req);
  if (limited) return limited;

  if (!isConfigured()) {
    return NextResponse.json({ error: 'Authentication service not configured' }, { status: 503 });
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

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

  // Create tenant + user_profile using service role key (bypasses RLS)
  if (data.user?.id) {
    try {
      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
      );
      const slug = company.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50);
      const { data: tenant, error: tenantError } = await adminClient
        .from('tenants')
        .insert({ name: company, slug: `${slug}-${Date.now()}`, plan: 'trial' })
        .select()
        .single();

      if (tenantError || !tenant) {
        console.error('[signup] tenant creation failed:', tenantError);
        // Clean up the auth user since tenant creation failed
        await adminClient.auth.admin.deleteUser(data.user!.id);
        return NextResponse.json(
          { error: 'Account setup failed. Please try again.' },
          { status: 500 }
        );
      }

      const { error: profileError } = await adminClient.from('user_profiles').insert({
        tenant_id: tenant.id,
        user_id: data.user.id,
        email: email.toLowerCase().trim(),
        full_name: body.name || '',
        role: 'admin',
        phone: phone || '',
        title: role || 'General Contractor',
      });

      if (profileError) {
        console.error('[signup] user profile creation failed:', profileError);
        // Clean up tenant and auth user
        await adminClient.from('tenants').delete().eq('id', tenant.id);
        await adminClient.auth.admin.deleteUser(data.user!.id);
        return NextResponse.json(
          { error: 'Account setup failed. Please try again.' },
          { status: 500 }
        );
      }
    } catch (err) {
      console.error('[signup] tenant creation error:', err);
      // Clean up the auth user since setup failed
      try {
        const cleanupClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { auth: { persistSession: false } }
        );
        await cleanupClient.auth.admin.deleteUser(data.user!.id);
      } catch (cleanupErr) {
        console.error('[signup] cleanup failed:', cleanupErr);
      }
      return NextResponse.json(
        { error: 'Account setup failed. Please try again.' },
        { status: 500 }
      );
    }
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
