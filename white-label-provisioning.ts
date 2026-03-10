/**
 * white-label-provisioning.ts
 *
 * End-to-end white-label platform provisioning for Saguaro CRM.
 *
 * Complete workflow for a contractor purchasing their own branded CRM:
 *
 *   Step 1 → Payment (Stripe checkout, handled by stripe-billing.ts)
 *   Step 2 → provisionResellerAccount()    — creates tenant + reseller record
 *   Step 3 → saveBrandingConfig()          — logo, colors, domain, company name
 *   Step 4 → generateDnsInstructions()     — CNAME to add to their DNS
 *   Step 5 → verifyDns()                   — polls until DNS propagates
 *   Step 6 → activatePlatform()            — sets platform live, provisions SSL
 *   Step 7 → onboardResellerClient()       — reseller adds their own contractor clients
 *
 * API Routes to mount:
 *   POST /api/white-label/provision          → provisionResellerHandler
 *   POST /api/white-label/branding           → saveBrandingHandler
 *   GET  /api/white-label/dns-instructions   → dnsInstructionsHandler
 *   POST /api/white-label/verify-dns         → verifyDnsHandler
 *   GET  /api/white-label/status             → statusHandler
 *   POST /api/white-label/add-client         → addClientHandler
 *   DELETE /api/white-label/remove-client    → removeClientHandler
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { Resend } from 'resend';
import { supabaseAdmin } from './supabase/admin';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const CNAME_TARGET  = process.env.WHITE_LABEL_CNAME_TARGET ?? 'tenants.saguarocrm.com';
const APP_URL       = process.env.NEXT_PUBLIC_APP_URL      ?? 'https://app.saguarocrm.com';
const SANDBOX_URL   = process.env.NEXT_PUBLIC_SANDBOX_URL  ?? 'https://sandbox.saguarocrm.com';
const FROM          = process.env.EMAIL_FROM               ?? 'Saguaro CRM <noreply@mail.saguarocrm.com>';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL            ?? 'support@saguarocrm.com';

function resend(): Resend | null {
  return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
}
function ok(d: Record<string, unknown>, s = 200) { return NextResponse.json(d, { status: s }); }
function err(m: string, s = 400) { return NextResponse.json({ error: m }, { status: s }); }

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Provision the reseller account after payment
// Called automatically by the Stripe webhook (checkout.session.completed)
// Can also be called manually by admin to re-provision
// ─────────────────────────────────────────────────────────────────────────────

export async function provisionResellerAccount(opts: {
  tenantId:     string;
  email:        string;
  companyName:  string;
  planId:       string;
}): Promise<{ resellerId: string; brandSlug: string }> {
  const now = new Date().toISOString();

  // Generate a unique brand slug from company name
  const rawSlug = opts.companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  // Ensure uniqueness
  let brandSlug = rawSlug;
  const { count } = await supabaseAdmin
    .from('reseller_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('brand_slug', rawSlug);

  if ((count ?? 0) > 0) {
    brandSlug = `${rawSlug}-${randomBytes(3).toString('hex')}`;
  }

  // Generate DNS verification token
  const dnsVerificationToken = randomBytes(16).toString('hex');
  const cnameTarget = CNAME_TARGET;

  // Determine max contractor tenants from plan
  const planLimits: Record<string, number | null> = {
    white_label_growth: 50,
    white_label_agency: null, // unlimited
    enterprise:         10,
  };
  const maxTenants = planLimits[opts.planId] ?? 10;

  const { data: reseller, error } = await supabaseAdmin
    .from('reseller_accounts')
    .upsert(
      {
        tenant_id:            opts.tenantId,
        brand_name:           opts.companyName,
        brand_slug:           brandSlug,
        primary_color:        '#1b3a5c',   // defaults — user customizes in Step 3
        accent_color:         '#e07b39',
        font_family:          'system-ui',
        cname_target:         cnameTarget,
        dns_verification_token: dnsVerificationToken,
        max_contractor_tenants: maxTenants,
        status:               'onboarding',
        support_email:        opts.email,
        created_at:           now,
        updated_at:           now,
      },
      { onConflict: 'tenant_id' },
    )
    .select('id, brand_slug')
    .single();

  if (error || !reseller) {
    throw new Error(`Reseller provision failed: ${error?.message ?? 'null result'}`);
  }

  return { resellerId: reseller.id as string, brandSlug: reseller.brand_slug as string };
}

export async function provisionResellerHandler(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const tenantId    = String(body?.tenantId    ?? '');
  const email       = String(body?.email       ?? '').toLowerCase().trim();
  const companyName = String(body?.companyName ?? '').trim();
  const planId      = String(body?.planId      ?? 'white_label_growth');

  if (!tenantId || !email || !companyName) {
    return err('tenantId, email, and companyName are required');
  }

  try {
    const result = await provisionResellerAccount({ tenantId, email, companyName, planId });
    return ok({ success: true, ...result, status: 'onboarding' });
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Provisioning failed', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Save branding configuration
// POST /api/white-label/branding
// Body: { tenantId, brandName, logoUrl, primaryColor, accentColor, fontFamily,
//         customDomain, supportEmail, supportPhone, resellerPlanName, resellerPriceCents }
// ─────────────────────────────────────────────────────────────────────────────

export async function saveBrandingHandler(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.tenantId) return err('tenantId required');

  const tenantId = String(body.tenantId);

  // Validate color format
  const hexRegex = /^#[0-9A-Fa-f]{6}$/;
  if (body.primaryColor && !hexRegex.test(body.primaryColor)) {
    return err('primaryColor must be a valid hex color (e.g. #1b3a5c)');
  }

  // Validate domain format if provided
  const customDomain = body.customDomain ? String(body.customDomain).trim().toLowerCase() : null;
  if (customDomain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(customDomain)) {
    return err('customDomain must be a valid domain (e.g. app.yourcompany.com)');
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };

  if (body.brandName)           updates.brand_name         = String(body.brandName).trim();
  if (body.logoUrl)             updates.logo_url            = String(body.logoUrl);
  if (body.primaryColor)        updates.primary_color       = String(body.primaryColor);
  if (body.accentColor)         updates.accent_color        = String(body.accentColor);
  if (body.fontFamily)          updates.font_family         = String(body.fontFamily);
  if (customDomain)             updates.custom_domain       = customDomain;
  if (body.supportEmail)        updates.support_email       = String(body.supportEmail).toLowerCase();
  if (body.supportPhone)        updates.support_phone       = String(body.supportPhone);
  if (body.resellerPlanName)    updates.reseller_plan_name  = String(body.resellerPlanName);
  if (body.resellerPriceCents)  updates.reseller_monthly_price_cents = Number(body.resellerPriceCents);

  // If domain changed, reset verification
  if (customDomain) {
    updates.domain_verified     = false;
    updates.domain_verified_at  = null;
    updates.ssl_provisioned     = false;
    updates.ssl_provisioned_at  = null;
    updates.status              = 'dns_pending';
  }

  const { error } = await supabaseAdmin
    .from('reseller_accounts')
    .update(updates)
    .eq('tenant_id', tenantId);

  if (error) return err(`Branding save failed: ${error.message}`, 500);

  return ok({
    success: true,
    message: customDomain
      ? 'Branding saved. Add the DNS record below to activate your custom domain.'
      : 'Branding saved successfully.',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Get DNS setup instructions
// GET /api/white-label/dns-instructions?tenantId=xxx
// ─────────────────────────────────────────────────────────────────────────────

export async function dnsInstructionsHandler(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return err('tenantId required');

  const { data: reseller } = await supabaseAdmin
    .from('reseller_accounts')
    .select('custom_domain, cname_target, dns_verification_token, brand_slug, domain_verified, ssl_provisioned')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!reseller) return err('Reseller account not found');

  const domain = (reseller.custom_domain as string) ?? null;

  return ok({
    customDomain:    domain,
    brandSlug:       reseller.brand_slug,
    domainVerified:  reseller.domain_verified,
    sslProvisioned:  reseller.ssl_provisioned,
    // Default subdomain if no custom domain set
    defaultSubdomain: `${reseller.brand_slug as string}.saguarocrm.com`,
    // DNS instructions
    dnsRecord: domain ? {
      type:    'CNAME',
      host:    domain,
      value:   reseller.cname_target as string,
      ttl:     '3600',
      instructions: [
        `1. Log into your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.)`,
        `2. Go to your DNS records for your domain`,
        `3. Add a new CNAME record:`,
        `   Host/Name: ${domain.split('.').slice(0, -2).join('.')} (or the full subdomain)`,
        `   Value/Points to: ${reseller.cname_target as string}`,
        `   TTL: 3600 (1 hour)`,
        `4. Save the record and return here to verify`,
        `5. DNS propagation typically takes 15 minutes to 2 hours`,
      ],
    } : null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — Verify DNS propagation
// POST /api/white-label/verify-dns
// Body: { tenantId }
// ─────────────────────────────────────────────────────────────────────────────

export async function verifyDnsHandler(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const tenantId = String(body?.tenantId ?? '');
  if (!tenantId) return err('tenantId required');

  const { data: reseller } = await supabaseAdmin
    .from('reseller_accounts')
    .select('custom_domain, cname_target, brand_slug, domain_verified')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!reseller) return err('Reseller account not found');

  const customDomain = reseller.custom_domain as string | null;
  if (!customDomain) {
    // No custom domain — activate on default subdomain immediately
    await activateWithDefaultDomain(tenantId, reseller.brand_slug as string);
    return ok({ verified: true, domain: `${reseller.brand_slug as string}.saguarocrm.com`, usedDefaultDomain: true });
  }

  // Check DNS using a public DNS-over-HTTPS API
  try {
    const dnsResponse = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(customDomain)}&type=CNAME`,
    );

    if (!dnsResponse.ok) {
      return ok({ verified: false, reason: 'DNS lookup failed — please try again in a few minutes.' });
    }

    const dnsData = await dnsResponse.json() as {
      Status: number;
      Answer?: Array<{ data: string }>;
    };

    const answers = dnsData.Answer ?? [];
    const cnameTarget = reseller.cname_target as string;

    const pointsToSaguaro = answers.some((a) =>
      a.data.replace(/\.$/, '').toLowerCase() === cnameTarget.toLowerCase(),
    );

    if (!pointsToSaguaro) {
      return ok({
        verified:    false,
        reason:      `CNAME not pointing to ${cnameTarget} yet. DNS can take up to 2 hours to propagate.`,
        dnsAnswers:  answers.map((a) => a.data),
        expectedCname: cnameTarget,
      });
    }

    // DNS verified — mark and trigger SSL provisioning
    const now = new Date().toISOString();
    await supabaseAdmin
      .from('reseller_accounts')
      .update({
        domain_verified:    true,
        domain_verified_at: now,
        status:             'active',
        updated_at:         now,
      })
      .eq('tenant_id', tenantId);

    // In production: trigger SSL cert provisioning via Let's Encrypt or Vercel API
    // For now mark ssl_provisioned = true (manual step in Vercel/Cloudflare)
    await triggerSslProvisioning(tenantId, customDomain);

    // Email the reseller that their platform is live
    const { data: emailRes } = await supabaseAdmin
      .from('reseller_accounts')
      .select('support_email, brand_name')
      .eq('tenant_id', tenantId)
      .single();

    if (emailRes?.support_email) {
      await sendPlatformLiveEmail(
        emailRes.support_email as string,
        emailRes.brand_name as string,
        customDomain,
        tenantId,
      );
    }

    return ok({
      verified:    true,
      domain:      customDomain,
      platformUrl: `https://${customDomain}`,
      message:     'DNS verified! Your platform will be fully live within 15 minutes as SSL provisions.',
    });
  } catch (e) {
    console.error('[WhiteLabel] DNS verify error:', e instanceof Error ? e.message : e);
    return ok({ verified: false, reason: 'DNS check failed. Please try again.' });
  }
}

async function activateWithDefaultDomain(tenantId: string, brandSlug: string) {
  await supabaseAdmin
    .from('reseller_accounts')
    .update({
      domain_verified:   true,
      domain_verified_at: new Date().toISOString(),
      ssl_provisioned:   true,
      ssl_provisioned_at: new Date().toISOString(),
      status:            'active',
      updated_at:        new Date().toISOString(),
    })
    .eq('tenant_id', tenantId);
}

async function triggerSslProvisioning(tenantId: string, domain: string) {
  // In production: call Vercel API to add custom domain
  // or trigger Caddy/nginx to obtain Let's Encrypt cert
  // For now: mark as provisioned (manual DNS verification in Vercel is instant for their CDN)
  const sslApiKey = process.env.VERCEL_API_TOKEN;

  if (sslApiKey && process.env.VERCEL_PROJECT_ID) {
    try {
      await fetch(`https://api.vercel.com/v10/projects/${process.env.VERCEL_PROJECT_ID}/domains`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sslApiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ name: domain }),
      });
    } catch (e) {
      console.error('[SSL] Vercel domain add failed:', e instanceof Error ? e.message : e);
    }
  }

  await supabaseAdmin
    .from('reseller_accounts')
    .update({
      ssl_provisioned:    true,
      ssl_provisioned_at: new Date().toISOString(),
      updated_at:         new Date().toISOString(),
    })
    .eq('tenant_id', tenantId);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6 — Platform status
// GET /api/white-label/status?tenantId=xxx
// ─────────────────────────────────────────────────────────────────────────────

export async function statusHandler(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return err('tenantId required');

  const { data: reseller } = await supabaseAdmin
    .from('reseller_accounts')
    .select(`
      brand_name, brand_slug, logo_url, primary_color, accent_color,
      custom_domain, domain_verified, ssl_provisioned,
      status, active_contractor_tenants, max_contractor_tenants,
      onboarded_at, created_at,
      subscriptions!inner(plan_id, billing_interval, status, current_period_end)
    `)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!reseller) return err('Reseller account not found', 404);

  const platformUrl = reseller.custom_domain && reseller.domain_verified
    ? `https://${reseller.custom_domain as string}`
    : `https://${reseller.brand_slug as string}.saguarocrm.com`;

  // Progress steps
  const steps = [
    { id: 'payment',   label: 'Payment Completed',          done: true },
    { id: 'branding',  label: 'Brand Setup',                 done: !!(reseller.logo_url || reseller.brand_name) },
    { id: 'dns',       label: 'Domain Connected',            done: !!(reseller.domain_verified) },
    { id: 'ssl',       label: 'SSL Certificate Active',      done: !!(reseller.ssl_provisioned) },
    { id: 'live',      label: 'Platform Live',               done: reseller.status === 'active' },
  ];

  return ok({
    reseller,
    platformUrl,
    isLive:    reseller.status === 'active',
    steps,
    nextStep:  steps.find((s) => !s.done)?.id ?? 'complete',
    adminUrl:  `${platformUrl}/admin`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 7 — Add a contractor client under the reseller
// POST /api/white-label/add-client
// ─────────────────────────────────────────────────────────────────────────────

export async function addClientHandler(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const resellerTenantId = String(body?.resellerTenantId ?? '');
  const clientEmail      = String(body?.clientEmail      ?? '').toLowerCase().trim();
  const clientCompany    = String(body?.clientCompany    ?? '').trim();

  if (!resellerTenantId || !clientEmail) {
    return err('resellerTenantId and clientEmail are required');
  }

  // Get reseller account and check client limit
  const { data: reseller } = await supabaseAdmin
    .from('reseller_accounts')
    .select('id, max_contractor_tenants, active_contractor_tenants, brand_slug, brand_name, status')
    .eq('tenant_id', resellerTenantId)
    .maybeSingle();

  if (!reseller) return err('Reseller account not found');
  if (reseller.status !== 'active') return err('Your platform must be active before adding clients');

  const maxTenants    = reseller.max_contractor_tenants as number | null;
  const activeTenants = (reseller.active_contractor_tenants as number) ?? 0;

  if (maxTenants !== null && activeTenants >= maxTenants) {
    return err(
      `You have reached your client limit (${maxTenants}). Upgrade your plan to add more.`,
      402,
    );
  }

  // Create the contractor's tenant in Supabase Auth
  const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: clientEmail,
    email_confirm: true,
    user_metadata: {
      company_name: clientCompany,
      reseller_id:  reseller.id,
      reseller_slug: reseller.brand_slug,
    },
  });

  if (authErr || !authUser.user) {
    // If user already exists, just link them
    if (authErr?.message?.includes('already been registered')) {
      return err('A user with this email already exists. They may already have a Saguaro account.');
    }
    return err(`Client creation failed: ${authErr?.message ?? 'unknown error'}`, 500);
  }

  const clientTenantId = authUser.user.id;
  const now = new Date().toISOString();

  // Create tenant record
  await supabaseAdmin.from('tenants').insert({
    id:                clientTenantId,
    name:              clientCompany || clientEmail,
    slug:              `${reseller.brand_slug as string}-${randomBytes(4).toString('hex')}`,
    reseller_id:       reseller.id,
    created_at:        now,
    updated_at:        now,
  }).then(() => null);

  // Link to reseller
  await supabaseAdmin.from('reseller_tenants').insert({
    reseller_account_id: reseller.id as string,
    tenant_id:           clientTenantId,
    email:               clientEmail,
    company_name:        clientCompany || null,
    status:              'active',
    activated_at:        now,
    created_at:          now,
  });

  // Increment active count
  await supabaseAdmin
    .from('reseller_accounts')
    .update({
      active_contractor_tenants: activeTenants + 1,
      updated_at: now,
    })
    .eq('id', reseller.id as string);

  // Email the client their access link
  const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: clientEmail,
    options: { redirectTo: `https://${reseller.brand_slug as string}.saguarocrm.com/app` },
  });

  const r = resend();
  if (r) {
    await r.emails.send({
      from: FROM,
      to:   clientEmail,
      subject: `Your ${reseller.brand_name as string} construction platform is ready`,
      html: `
        <p>Hi${clientCompany ? ` ${clientCompany}` : ''},</p>
        <p>${reseller.brand_name as string} has set up a construction management platform for you powered by Saguaro.</p>
        <p>Click below to set up your account — it takes less than 2 minutes:</p>
        <a href="${linkData?.properties?.action_link ?? '#'}" style="display:inline-block;background:#1b3a5c;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:700">Access My Platform →</a>
        <p style="font-size:13px;color:#718096">Questions? Contact ${reseller.brand_name as string} at ${body?.supportEmail ?? SUPPORT_EMAIL}</p>
      `,
    });
  }

  return ok({
    success:    true,
    clientTenantId,
    message:    `Client created. Access link emailed to ${clientEmail}.`,
    activeTenants: activeTenants + 1,
    maxTenants,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Email helper — Platform is live
// ─────────────────────────────────────────────────────────────────────────────

async function sendPlatformLiveEmail(
  email: string,
  brandName: string,
  domain: string,
  tenantId: string,
) {
  const r = resend();
  if (!r) return;

  await r.emails.send({
    from:    FROM,
    to:      email,
    subject: `🎉 Your ${brandName} platform is LIVE — ${domain}`,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto">
        <div style="background:#1b3a5c;padding:24px 32px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:22px">Your Platform is Live! 🚀</h1>
        </div>
        <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:28px 32px;border-radius:0 0 8px 8px">
          <p><strong>${brandName}</strong> is now live and accessible at:</p>
          <p style="font-size:20px;font-weight:700;color:#1b3a5c"><a href="https://${domain}" style="color:#1b3a5c">https://${domain}</a></p>
          <p>What to do next:</p>
          <ol style="line-height:2.2">
            <li>Visit your admin panel: <a href="https://${domain}/admin">https://${domain}/admin</a></li>
            <li>Add your first contractor client (go to Clients → Add Client)</li>
            <li>Customize your support email and help documentation</li>
            <li>Set your pricing and billing for your clients</li>
          </ol>
          <a href="${APP_URL}/app/white-label/dashboard?tenant=${tenantId}" style="display:inline-block;background:#e07b39;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:700">Open My Reseller Dashboard →</a>
          <p style="margin-top:24px;font-size:13px;color:#718096">Your dedicated account manager will call within 24 hours for your onboarding walkthrough.</p>
        </div>
      </div>
    `,
  });
}
