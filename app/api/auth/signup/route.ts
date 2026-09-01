/**
 * POST /api/auth/signup — Self-serve company signup (multi-tenant)
 *
 * End-to-end flow for a brand-new company:
 *   1. Create the Supabase auth user via email signup.
 *      → The `on_auth_user_created` DB trigger (`handle_new_user`) auto-inserts a
 *        `profiles` row with id = user.id and tenant_id = user.id (its default,
 *        since we pass no tenant_id in user metadata).
 *   2. Create the NEW `tenants` row (the company) with id = user.id so it matches
 *      the auto-created profile's tenant_id. This is the row the rest of the app
 *      joins against — without it, the tenant_id on every record would dangle.
 *   3. Promote the owner's `profiles` row: role = 'admin' + company/phone/title.
 *
 * On auto-confirm (email confirmation disabled in Supabase) we set HttpOnly
 * session cookies immediately so the user lands in the app. Otherwise we return
 * { confirmed: false } and the client shows the "check your email" screen.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';

import { apiError } from '@/lib/api-error';
function isConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return !!(url && url !== 'https://demo.supabase.co' && key && !key.includes('placeholder') && !key.startsWith('demo_') && key.length > 20);
}

/** Build a URL-safe slug from a company name. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'company';
}

export async function POST(req: NextRequest) {
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

  const cleanEmail = email.toLowerCase().trim();
  const fullName = (body.name || '').trim() || cleanEmail.split('@')[0];

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

  // 1. Create the auth user. The handle_new_user trigger creates the profile
  //    row with tenant_id defaulting to the new user's id.
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: { full_name: fullName, company_name: company, phone: phone || '', role: role || 'General Contractor', state: state || 'AZ', company_size: size || '1-10' },
      emailRedirectTo: `${appUrl}/auth/callback`,
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already')) {
      return NextResponse.json({ error: 'An account with this email already exists. Please log in instead.' }, { status: 409 });
    }
    return apiError('auth/signup', error, undefined, 400);
  }

  // 2 + 3. Provision the tenant (company) and promote the owner profile.
  //    tenant_id == user.id, matching what handle_new_user set on the profile.
  if (data.user?.id) {
    const tenantId = data.user.id;
    try {
      const admin = createServerClient(); // service-role, typed, bypasses RLS

      // Create the company tenant row (id matches the profile's tenant_id).
      const { error: tenantErr } = await admin.from('tenants').upsert({
        id: tenantId,
        name: company.trim(),
        slug: `${slugify(company)}-${tenantId.slice(0, 8)}`,
        owner_email: cleanEmail,
        plan: 'trial',
        subscription_status: 'trialing',
        onboarding_complete: false,
        onboarding_step: 1,
      }, { onConflict: 'id' });
      if (tenantErr) {
        console.error('[signup] tenant create error:', tenantErr.message);
        // The tenant row is essential — surface a clear error rather than
        // leaving the new user pointing at a non-existent company.
        return NextResponse.json({ error: 'Could not finish creating your company. Please contact support.' }, { status: 500 });
      }

      // Promote the auto-created profile to company owner/admin.
      const { error: profileErr } = await admin.from('profiles').upsert({
        id: tenantId,
        tenant_id: tenantId,
        email: cleanEmail,
        full_name: fullName,
        role: 'admin',
        phone: phone || '',
        title: role || 'General Contractor',
        company: company.trim(),
      }, { onConflict: 'id' });
      if (profileErr) {
        console.error('[signup] profile update error:', profileErr.message);
        // Non-fatal: the trigger already created a usable profile row.
      }
    } catch (err) {
      console.error('[signup] provisioning exception:', err);
      return NextResponse.json({ error: 'Could not finish creating your company. Please contact support.' }, { status: 500 });
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
