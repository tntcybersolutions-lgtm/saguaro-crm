/**
 * sandbox-manager-route.ts
 *
 * Production API handlers for sandbox signup, login, contact,
 * white-label inquiries, and general lead capture.
 *
 * Mount these in your Next.js App Router:
 *
 *   /api/sandbox/signup       → sandboxSignupHandler
 *   /api/sandbox/check        → sandboxCheckHandler
 *   /api/auth/login           → loginHandler
 *   /api/leads/contact        → contactHandler
 *   /api/leads/whitelabel     → whitelabelHandler
 *   /api/leads/demo           → demoRequestHandler
 *
 * All handlers are self-contained — import and export from
 * your app/api/... route.ts files.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

import { supabaseAdmin } from './supabase/admin';
import { SandboxManager } from './sandbox-manager';

// ─────────────────────────────────────────────────────────────────────────────
// Resend client (shared)
// ─────────────────────────────────────────────────────────────────────────────

function resend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM    = process.env.EMAIL_FROM    ?? 'Saguaro CRM <noreply@mail.saguarocrm.com>';
const SALES   = process.env.SALES_EMAIL  ?? 'sales@saguarocrm.com';
const SUPPORT = process.env.SUPPORT_EMAIL ?? 'support@saguarocrm.com';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.saguarocrm.com';
const SANDBOX_URL = process.env.NEXT_PUBLIC_SANDBOX_URL ?? 'https://sandbox.saguarocrm.com';

// ─────────────────────────────────────────────────────────────────────────────
// CORS helper
// ─────────────────────────────────────────────────────────────────────────────

function corsHeaders() {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function ok(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders() });
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: corsHeaders() });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SANDBOX SIGNUP  POST /api/sandbox/signup
// ─────────────────────────────────────────────────────────────────────────────

export async function sandboxSignupHandler(request: NextRequest) {
  if (request.method === 'OPTIONS') return ok({});

  const body = await request.json().catch(() => null);
  if (!body) return err('Invalid JSON body');

  const email = String(body.email ?? '').toLowerCase().trim();
  if (!email || !email.includes('@')) return err('Valid email is required');

  const firstName   = String(body.firstName   ?? '').trim();
  const lastName    = String(body.lastName    ?? '').trim();
  const companyName = String(body.companyName ?? '').trim();
  const phone       = String(body.phone       ?? '').trim();
  const state       = String(body.state       ?? '').trim();
  const primaryTrade = String(body.primaryTrade ?? '').trim();
  const referralSource = String(body.referralSource ?? 'website').trim();

  try {
    const account = await SandboxManager.createSandbox({
      email,
      firstName:    firstName  || undefined,
      lastName:     lastName   || undefined,
      companyName:  companyName || undefined,
      phone:        phone       || undefined,
      primaryTrade: primaryTrade || undefined,
      referralSource,
    });

    // Notify sales team of new sandbox signup
    const r = resend();
    if (r) {
      await r.emails.send({
        from: FROM,
        to:   SALES,
        subject: `🚀 New Sandbox Signup — ${companyName || email}`,
        html: `
          <h2>New Sandbox Signup</h2>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Name:</strong> ${firstName} ${lastName}</p>
          <p><strong>Company:</strong> ${companyName || 'Not provided'}</p>
          <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
          <p><strong>State:</strong> ${state || 'Not provided'}</p>
          <p><strong>Trade:</strong> ${primaryTrade || 'Not provided'}</p>
          <p><strong>Source:</strong> ${referralSource}</p>
          <p><strong>Sandbox expires:</strong> ${account.sandboxExpiresAt}</p>
          <p><strong>Demo project:</strong> ${account.demoProjectId}</p>
          <hr/>
          <p><a href="${APP_URL}/admin/sandboxes/${account.tenantId}">View in Admin</a></p>
        `,
      });
    }

    return ok({
      success: true,
      message: 'Sandbox created! Check your email for instant access.',
      tenantId:           account.tenantId,
      sandboxExpiresAt:   account.sandboxExpiresAt,
      aiRunsRemaining:    account.aiRunsRemaining,
      demoProjectId:      account.demoProjectId,
      demoTakeoffId:      account.demoTakeoffId,
      accessToken:        account.accessToken,
      sandboxUrl: `${SANDBOX_URL}/sandbox/welcome?project=${account.demoProjectId}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Signup failed';

    // Handle duplicate email gracefully
    if (message.includes('already exists')) {
      return err(
        'A sandbox already exists for this email. Check your inbox for your access link, or contact support.',
        409,
      );
    }

    console.error('[SandboxSignup]', message);
    return err('Something went wrong. Please try again or contact support@saguarocrm.com', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SANDBOX STATUS CHECK  GET /api/sandbox/check?email=...
// ─────────────────────────────────────────────────────────────────────────────

export async function sandboxCheckHandler(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email')?.toLowerCase().trim();
  if (!email) return err('email query param required');

  const { data } = await supabaseAdmin
    .from('sandbox_tenants')
    .select('tenant_id, sandbox_expires_at, ai_runs_used, ai_runs_limit, converted_to_paid_at')
    .eq('email', email)
    .maybeSingle();

  if (!data) return ok({ exists: false });

  return ok({
    exists: true,
    expired: new Date(data.sandbox_expires_at as string) < new Date(),
    converted: !!data.converted_to_paid_at,
    aiRunsUsed:    data.ai_runs_used,
    aiRunsLimit:   data.ai_runs_limit,
    aiRunsRemaining: Math.max(0, (data.ai_runs_limit as number) - (data.ai_runs_used as number)),
    sandboxExpiresAt: data.sandbox_expires_at,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. AUTH / LOGIN  POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────

export async function loginHandler(request: NextRequest) {
  if (request.method === 'OPTIONS') return ok({});

  const body = await request.json().catch(() => null);
  if (!body) return err('Invalid JSON body');

  const email    = String(body.email    ?? '').toLowerCase().trim();
  const password = String(body.password ?? '');
  const portal   = String(body.portal   ?? 'internal'); // internal | client | sub

  if (!email || !password) return err('Email and password are required');

  const { data: authData, error: authErr } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (authErr || !authData.session) {
    return err('Invalid email or password. Please try again.', 401);
  }

  // Determine redirect URL based on portal type
  const redirectMap: Record<string, string> = {
    internal: `${APP_URL}/app`,
    client:   `${APP_URL}/client`,
    sub:      `${APP_URL}/sub`,
  };

  return ok({
    success:      true,
    accessToken:  authData.session.access_token,
    refreshToken: authData.session.refresh_token,
    expiresAt:    authData.session.expires_at,
    userId:       authData.user?.id,
    redirectUrl:  redirectMap[portal] ?? redirectMap.internal,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CONTACT / GENERAL LEAD  POST /api/leads/contact
// ─────────────────────────────────────────────────────────────────────────────

export async function contactHandler(request: NextRequest) {
  if (request.method === 'OPTIONS') return ok({});

  const body = await request.json().catch(() => null);
  if (!body) return err('Invalid JSON body');

  const email       = String(body.email       ?? '').toLowerCase().trim();
  const firstName   = String(body.firstName   ?? '').trim();
  const lastName    = String(body.lastName    ?? '').trim();
  const companyName = String(body.companyName ?? '').trim();
  const phone       = String(body.phone       ?? '').trim();
  const message     = String(body.message     ?? '').trim();
  const subject     = String(body.subject     ?? 'Contact Form Submission').trim();

  if (!email || !email.includes('@')) return err('Valid email is required');

  // Save to Supabase leads table (create if not exists)
  await supabaseAdmin.from('leads').insert({
    email,
    first_name:   firstName   || null,
    last_name:    lastName    || null,
    company_name: companyName || null,
    phone:        phone       || null,
    message:      message     || null,
    source:       'contact_form',
    created_at:   new Date().toISOString(),
  }).then(() => null); // non-fatal

  // Email sales team
  const r = resend();
  if (r) {
    await Promise.all([
      // Notify sales
      r.emails.send({
        from: FROM,
        to: SALES,
        subject: `📬 New Contact: ${firstName} ${lastName} — ${companyName || email}`,
        html: `
          <h2>${subject}</h2>
          <p><strong>From:</strong> ${firstName} ${lastName} &lt;${email}&gt;</p>
          <p><strong>Company:</strong> ${companyName || 'Not provided'}</p>
          <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
          <hr/>
          <p>${message || 'No message provided.'}</p>
        `,
      }),
      // Auto-reply to user
      r.emails.send({
        from: FROM,
        to:   email,
        subject: `We received your message — Saguaro CRM`,
        html: `
          <p>Hi ${firstName || 'there'},</p>
          <p>Thanks for reaching out! We'll get back to you within 1 business day.</p>
          <p>In the meantime, you can <a href="${SANDBOX_URL}">start your free sandbox</a> and see
          Saguaro's AI takeoff in action — no credit card required.</p>
          <p>— The Saguaro Team<br/>${SUPPORT}</p>
        `,
      }),
    ]);
  }

  return ok({ success: true, message: "Got it! We'll be in touch within 1 business day." });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. WHITE-LABEL INQUIRY  POST /api/leads/whitelabel
// ─────────────────────────────────────────────────────────────────────────────

export async function whitelabelHandler(request: NextRequest) {
  if (request.method === 'OPTIONS') return ok({});

  const body = await request.json().catch(() => null);
  if (!body) return err('Invalid JSON body');

  const email       = String(body.email       ?? '').toLowerCase().trim();
  const firstName   = String(body.firstName   ?? '').trim();
  const companyName = String(body.companyName ?? '').trim();
  const phone       = String(body.phone       ?? '').trim();
  const domain      = String(body.domain      ?? '').trim();
  const contractors = String(body.contractors ?? '').trim(); // how many they'll serve
  const revenue     = String(body.revenue     ?? '').trim();

  if (!email || !email.includes('@')) return err('Valid email is required');

  await supabaseAdmin.from('leads').insert({
    email,
    first_name:   firstName   || null,
    company_name: companyName || null,
    phone:        phone       || null,
    source:       'whitelabel_inquiry',
    metadata:     { domain, contractors, revenue },
    created_at:   new Date().toISOString(),
  }).then(() => null);

  const r = resend();
  if (r) {
    await Promise.all([
      r.emails.send({
        from: FROM,
        to: SALES,
        subject: `🏷️ White-Label Inquiry — ${companyName || email}`,
        html: `
          <h2>White-Label Platform Inquiry</h2>
          <p><strong>Contact:</strong> ${firstName} &lt;${email}&gt;</p>
          <p><strong>Company:</strong> ${companyName}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Desired Domain:</strong> ${domain || 'Not specified'}</p>
          <p><strong>Contractors to serve:</strong> ${contractors || 'Not specified'}</p>
          <p><strong>Annual revenue:</strong> ${revenue || 'Not specified'}</p>
        `,
      }),
      r.emails.send({
        from: FROM,
        to: email,
        replyTo: SALES,
        subject: 'Your Saguaro White-Label Inquiry',
        html: `
          <p>Hi ${firstName || 'there'},</p>
          <p>Thanks for your interest in Saguaro's white-label platform.
          A member of our enterprise team will contact you within 24 hours to discuss your requirements.</p>
          <p>We'll cover: custom domain setup, branding configuration, pricing for your contractor base,
          and a live walkthrough of the platform.</p>
          <p>— Saguaro Enterprise Team<br/>${SALES}</p>
        `,
      }),
    ]);
  }

  return ok({ success: true, message: "Thanks! Our enterprise team will contact you within 24 hours." });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. DEMO REQUEST  POST /api/leads/demo
// ─────────────────────────────────────────────────────────────────────────────

export async function demoRequestHandler(request: NextRequest) {
  if (request.method === 'OPTIONS') return ok({});

  const body = await request.json().catch(() => null);
  if (!body) return err('Invalid JSON body');

  const email       = String(body.email       ?? '').toLowerCase().trim();
  const firstName   = String(body.firstName   ?? '').trim();
  const companyName = String(body.companyName ?? '').trim();
  const phone       = String(body.phone       ?? '').trim();
  const teamSize    = String(body.teamSize    ?? '').trim();
  const currentTool = String(body.currentTool ?? '').trim(); // Procore, Buildertrend, etc.

  if (!email || !email.includes('@')) return err('Valid email is required');

  await supabaseAdmin.from('leads').insert({
    email,
    first_name:   firstName   || null,
    company_name: companyName || null,
    phone:        phone       || null,
    source:       'demo_request',
    metadata:     { teamSize, currentTool },
    created_at:   new Date().toISOString(),
  }).then(() => null);

  const r = resend();
  if (r) {
    await Promise.all([
      r.emails.send({
        from: FROM,
        to: SALES,
        subject: `📅 Demo Request — ${firstName} at ${companyName || email}`,
        html: `
          <h2>Live Demo Request</h2>
          <p><strong>Contact:</strong> ${firstName} &lt;${email}&gt;</p>
          <p><strong>Company:</strong> ${companyName}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Team size:</strong> ${teamSize}</p>
          <p><strong>Current tool:</strong> ${currentTool || 'Not specified'}</p>
          <p><strong>Action:</strong> Book a 30-min demo call within 24 hours</p>
        `,
      }),
      r.emails.send({
        from: FROM,
        to: email,
        replyTo: SALES,
        subject: 'Your Saguaro Demo is Confirmed',
        html: `
          <p>Hi ${firstName || 'there'},</p>
          <p>Thanks for requesting a Saguaro demo! We'll reach out within 24 hours to schedule your
          30-minute walkthrough.</p>
          <p>We'll show you the AI blueprint takeoff, bid automation, and how Saguaro compares
          ${currentTool ? `to ${currentTool}` : 'to your current workflow'} — live, on your own projects.</p>
          <p>While you wait, <a href="${SANDBOX_URL}">try the free sandbox</a> — no card required.</p>
          <p>— The Saguaro Team<br/>${SALES}</p>
        `,
      }),
    ]);
  }

  return ok({
    success: true,
    message: "Demo request received! We'll be in touch within 24 hours to schedule your walkthrough.",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. REFERRAL SIGNUP  POST /api/leads/referral
// ─────────────────────────────────────────────────────────────────────────────

export async function referralHandler(request: NextRequest) {
  if (request.method === 'OPTIONS') return ok({});

  const body = await request.json().catch(() => null);
  if (!body) return err('Invalid JSON body');

  const referrerEmail = String(body.referrerEmail ?? '').toLowerCase().trim();
  const referreeName  = String(body.referreeName  ?? '').trim();

  if (!referrerEmail || !referrerEmail.includes('@')) return err('Valid referrer email required');

  // Generate a referral code
  const code = `SAG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  await supabaseAdmin.from('referrals').insert({
    referrer_email: referrerEmail,
    referral_code:  code,
    status:         'pending',
    created_at:     new Date().toISOString(),
  }).then(() => null);

  const r = resend();
  if (r) {
    await r.emails.send({
      from: FROM,
      to: referrerEmail,
      subject: 'Your Saguaro Referral Link',
      html: `
        <h2>Your Referral Link is Ready</h2>
        <p>Share this link with other contractors. When they sign up and purchase a license, you earn a discount on your next renewal.</p>
        <p><strong>Your referral link:</strong><br/>
        <a href="${SANDBOX_URL}?ref=${code}">${SANDBOX_URL}?ref=${code}</a></p>
        <p><strong>Discount tiers:</strong></p>
        <ul>
          <li>1 referral = 10% off your renewal</li>
          <li>3 referrals = 25% off your renewal</li>
          <li>5+ referrals = 40% off your renewal</li>
        </ul>
        <p>Track your referrals at <a href="${APP_URL}/referrals">your account dashboard</a>.</p>
        <p>— The Saguaro Team</p>
      `,
    });
  }

  return ok({
    success: true,
    referralCode: code,
    referralUrl: `${SANDBOX_URL}?ref=${code}`,
    discountTiers: [
      { referrals: 1, discount: '10% off renewal' },
      { referrals: 3, discount: '25% off renewal' },
      { referrals: 5, discount: '40% off renewal' },
    ],
    message: 'Referral link created! Check your email.',
  });
}
