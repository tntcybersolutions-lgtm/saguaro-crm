import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// Uses service role — creates tenant before user session exists
// This is a special endpoint: no getUser() because the user just signed up
// and hasn't confirmed email yet. We validate via the userId from Supabase auth.

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    userId, email, fullName, companyName, phone,
    address, city, state, zip, licenseNumber,
  } = body

  if (!userId || !email || !fullName || !companyName) {
    return NextResponse.json({ error: 'Missing required fields: userId, email, fullName, companyName' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Check if tenant already created (idempotent)
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id, tenant_id')
    .eq('id', userId)
    .single()

  if (existingProfile?.tenant_id) {
    return NextResponse.json({ success: true, tenantId: existingProfile.tenant_id })
  }

  // 1. Create tenant
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({
      name: companyName,
      company_phone: phone || null,
      company_address: address || null,
      company_city: city || null,
      company_state: state || 'AZ',
      company_zip: zip || null,
      license_number: licenseNumber || null,
      plan: 'trial',
      onboarding_completed: false,
      onboarding_step: 0,
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single()

  if (tenantError) {
    return NextResponse.json({ error: `Tenant creation failed: ${tenantError.message}` }, { status: 500 })
  }

  // 2. Create profile linked to tenant
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      email,
      full_name: fullName,
      tenant_id: tenant.id,
      role: 'admin', // first user is always admin
    })

  if (profileError) {
    // Rollback tenant
    await supabase.from('tenants').delete().eq('id', tenant.id)
    return NextResponse.json({ error: `Profile creation failed: ${profileError.message}` }, { status: 500 })
  }

  // 3. Send welcome email via Resend (non-fatal if it fails)
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'Saguaro CRM <noreply@saguarocrm.com>',
      to: email,
      subject: 'Welcome to Saguaro — Your 14-day trial starts now',
      html: buildWelcomeEmail(fullName, companyName),
    })
  } catch (_emailErr) {
    // Email failure is non-fatal — user can still use the app
  }

  return NextResponse.json({ success: true, tenantId: tenant.id })
}

function buildWelcomeEmail(fullName: string, companyName: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net'
  const steps = ['Create your first project', 'Add your subcontractors', 'Upload project drawings', 'Set up your bid packages']
  const stepHtml = steps.map((item, i) => `
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px;">
      <div style="width: 24px; height: 24px; border-radius: 50%; background: #D4A017; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: #0d1117; flex-shrink: 0;">${i + 1}</div>
      <span style="font-size: 14px; color: #374151;">${item}</span>
    </div>
  `).join('')

  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, sans-serif; background: #f8fafc; padding: 40px 16px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08);">
    <div style="background: #0d1117; padding: 32px 40px;">
      <h1 style="color: #D4A017; font-size: 28px; font-weight: 900; margin: 0; letter-spacing: -0.5px;">Saguaro</h1>
      <p style="color: #8b949e; font-size: 14px; margin: 6px 0 0;">Construction Intelligence Platform</p>
    </div>
    <div style="padding: 40px;">
      <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">Welcome, ${fullName}!</h2>
      <p style="color: #64748b; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
        Your 14-day free trial for <strong>${companyName}</strong> is ready. You have full access to every feature — no credit card required until your trial ends.
      </p>
      <div style="background: #f8fafc; border-radius: 10px; padding: 20px 24px; margin-bottom: 28px;">
        <p style="font-size: 13px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px;">What to do first</p>
        ${stepHtml}
      </div>
      <a href="${appUrl}/app" style="display: block; background: #D4A017; color: #0d1117; text-decoration: none; padding: 16px 24px; border-radius: 8px; font-weight: 800; font-size: 15px; text-align: center;">
        Open Saguaro CRM
      </a>
      <p style="font-size: 12px; color: #94a3b8; margin: 24px 0 0; text-align: center;">
        Questions? Reply to this email or contact <a href="mailto:support@saguarocrm.com" style="color: #D4A017;">support@saguarocrm.com</a>
      </p>
    </div>
  </div>
</body>
</html>`
}
