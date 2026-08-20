// Called by Vercel Cron daily at 7am MST
// vercel.json: { "crons": [{ "path": "/api/cron/insurance-reminders", "schedule": "0 14 * * *" }] }
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { sendEmail, insuranceReminderHtml } from '@/lib/email/send'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Service role client (bypasses RLS for cron)
  const supabase = createServerClient()

  // Find all insurance certs expiring in next 30 days
  const today = new Date()
  const in30Days = new Date(today.getTime() + 30 * 86400000).toISOString().split('T')[0]
  const yesterday = new Date(today.getTime() - 86400000).toISOString().split('T')[0]

  const { data: expiring } = await supabase
    .from('sub_insurance')
    .select(`
      id, insurance_type, expiration_date, days_until_expiry, status,
      subcontractors!inner(
        company_name, contact_name, contact_email, tenant_id
      )
    `)
    .in('status', ['expiring_soon', 'active'])
    .lte('expiration_date', in30Days)
    .gte('expiration_date', yesterday)

  if (!expiring || expiring.length === 0) {
    return NextResponse.json({ message: 'No expiring certificates found', sent: 0 })
  }

  let sent = 0
  const errors: string[] = []

  for (const cert of expiring) {
    const sub = cert.subcontractors as unknown as {
      company_name: string; contact_name: string
      contact_email: string; tenant_id: string
    }
    if (!sub.contact_email) continue

    // Get tenant settings for GC contact
    const { data: settings } = await supabase
      .from('tenant_settings')
      .select('company_name,company_email,signature_name')
      .eq('tenant_id', sub.tenant_id)
      .maybeSingle()

    const html = insuranceReminderHtml({
      subCompanyName: sub.company_name,
      subContactName: sub.contact_name || 'Project Manager',
      projectName: 'Active Projects',
      insuranceType: cert.insurance_type
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (l: string) => l.toUpperCase()),
      expirationDate: new Date(cert.expiration_date + 'T12:00:00')
        .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      daysUntilExpiry: cert.days_until_expiry || 0,
      gcCompanyName: settings?.company_name || 'General Contractor',
      gcContactName: settings?.signature_name || 'Project Manager',
      gcEmail: settings?.company_email || '',
    })

    const result = await sendEmail({
      to: sub.contact_email,
      subject: `Action Required: Insurance Expiring in ${cert.days_until_expiry} Days — ${sub.company_name}`,
      html,
    })

    if (result) {
      sent++
    } else {
      errors.push(`${sub.company_name}: Send failed`)
    }
  }

  return NextResponse.json({
    message: `Insurance reminders sent: ${sent}/${expiring.length}`,
    sent,
    errors: errors.length > 0 ? errors : undefined,
  })
}
