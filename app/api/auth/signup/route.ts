import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../supabase/admin';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.saguarocrm.com';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': APP_URL,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders() });
  }

  const email    = String(body.email    ?? '').toLowerCase().trim();
  const password = String(body.password ?? '').trim();
  const company  = String(body.company  ?? '').trim();
  const phone    = String(body.phone    ?? '').trim();
  const role     = String(body.role     ?? 'General Contractor').trim();
  const state    = String(body.state    ?? '').trim();
  const size     = String(body.size     ?? '').trim();

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400, headers: corsHeaders() });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400, headers: corsHeaders() });
  }
  if (!company) {
    return NextResponse.json({ error: 'Company name is required' }, { status: 400, headers: corsHeaders() });
  }

  // Create Supabase auth user
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // auto-confirm so they can log in immediately
    user_metadata: {
      company_name: company,
      phone,
      role,
      state,
      company_size: size,
    },
  });

  if (authErr || !authData.user) {
    const msg = authErr?.message ?? 'Signup failed';
    if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) {
      return NextResponse.json({ error: 'An account with this email already exists. Please log in.' }, { status: 409, headers: corsHeaders() });
    }
    return NextResponse.json({ error: msg }, { status: 400, headers: corsHeaders() });
  }

  // Insert tenant profile
  const tenantId = authData.user.id;
  await supabaseAdmin.from('tenants').insert({
    id: tenantId,
    company_name: company,
    phone: phone || null,
    role,
    state: state || null,
    company_size: size || null,
    plan: 'trial',
    trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
  }).then(() => null); // non-fatal if tenants table doesn't exist yet

  // Sign in to get session tokens
  const { data: sessionData, error: sessionErr } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (sessionErr || !sessionData.session) {
    // Account created but couldn't auto-login — redirect to login
    return NextResponse.json({
      success: true,
      message: 'Account created! Please log in.',
      redirectUrl: `${APP_URL}/login`,
    }, { headers: corsHeaders() });
  }

  return NextResponse.json({
    success: true,
    message: 'Account created successfully!',
    accessToken:  sessionData.session.access_token,
    refreshToken: sessionData.session.refresh_token,
    expiresAt:    sessionData.session.expires_at,
    userId:       authData.user.id,
    redirectUrl:  `${APP_URL}/onboarding/step-1`,
  }, { headers: corsHeaders() });
}
