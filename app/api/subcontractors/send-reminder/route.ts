import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/email/send'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { subcontractorId, insuranceType } = body
    if (!subcontractorId) return NextResponse.json({ error: 'Missing subcontractorId' }, { status: 400 })

    const db = createServerClient()

    // Load sub
    const { data: sub, error: subErr } = await db
      .from('subcontractors')
      .select('id, company_name, contact_email, email, contact_name')
      .eq('id', subcontractorId)
      .eq('tenant_id', user.tenantId)
      .single()

    if (subErr || !sub) return NextResponse.json({ error: 'Subcontractor not found' }, { status: 404 })

    const recipientEmail = sub.contact_email || sub.email
    if (!recipientEmail) return NextResponse.json({ error: 'No email on file for this subcontractor' }, { status: 400 })

    // Load insurance cert if specific type requested
    let certInfo = ''
    if (insuranceType) {
      const { data: cert } = await db
        .from('sub_insurance')
        .select('insurance_type, expiration_date, policy_number, insurer_name')
        .eq('subcontractor_id', subcontractorId)
        .eq('insurance_type', insuranceType)
        .eq('tenant_id', user.tenantId)
        .order('expiration_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cert) {
        const typeLabel = insuranceType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        certInfo = `
          <tr><td style="padding:6px 0;color:#666;">Policy Type:</td><td style="padding:6px 0;font-weight:600;">${typeLabel}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Policy #:</td><td style="padding:6px 0;">${cert.policy_number || 'On file'}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Insurer:</td><td style="padding:6px 0;">${cert.insurer_name || 'On file'}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Expiration:</td><td style="padding:6px 0;font-weight:700;color:#c03030;">${cert.expiration_date}</td></tr>
        `
      }
    }

    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#0D1116;padding:24px 32px;border-radius:8px 8px 0 0;">
    <span style="color:#D5A017;font-size:22px;font-weight:700;letter-spacing:1px;">SAGUARO</span>
    <span style="color:#ffffff;font-size:14px;margin-left:8px;opacity:0.7;">Insurance Renewal Required</span>
  </div>
  <div style="background:#ffffff;padding:32px;border:1px solid #e2e5ea;border-top:none;border-radius:0 0 8px 8px;">
    <h1 style="color:#0D1116;font-size:20px;margin:0 0 8px 0;">Insurance Certificate Required</h1>
    <p style="font-size:14px;color:#333;line-height:1.6;">
      Dear ${sub.contact_name || sub.company_name},
    </p>
    <p style="font-size:14px;color:#333;line-height:1.6;">
      Our records indicate that your insurance coverage is expiring or has expired.
      An updated Certificate of Insurance (COI) is required to continue work on active projects.
    </p>
    <div style="background:#f8f9fa;border-radius:6px;padding:16px;margin:16px 0;">
      <table style="width:100%;font-size:14px;color:#333;">
        <tr><td style="padding:6px 0;color:#666;width:140px;">Company:</td><td style="padding:6px 0;font-weight:600;">${sub.company_name}</td></tr>
        ${certInfo}
      </table>
    </div>
    <p style="font-size:14px;color:#333;line-height:1.6;"><strong>What you need to provide:</strong></p>
    <ul style="font-size:14px;color:#333;line-height:1.8;">
      <li>Updated Certificate of Insurance (COI)</li>
      <li>Our company listed as Additional Insured</li>
      <li>Coverage meeting project minimum requirements</li>
    </ul>
    <p style="font-size:14px;color:#333;line-height:1.6;">
      Please reply to this email with your updated COI or contact us at your earliest convenience.
    </p>
    <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:12px;margin:16px 0;font-size:13px;color:#856404;">
      <strong>Important:</strong> Subcontractors without verified insurance coverage cannot work on any active projects.
    </div>
    <p style="font-size:13px;color:#666;margin-top:24px;border-top:1px solid #e2e5ea;padding-top:16px;">
      This notice was sent via Saguaro CRM. If you have questions, reply to this email.
    </p>
  </div>
</div>`

    const typeLabel = insuranceType
      ? insuranceType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : 'Coverage'

    await sendEmail({
      to: recipientEmail,
      subject: `Insurance Renewal Required — ${sub.company_name} — ${typeLabel}`,
      html,
      replyTo: user.email,
    })

    // Update reminder tracking
    if (insuranceType) {
      await db
        .from('sub_insurance')
        .update({
          last_reminder_sent_at: new Date().toISOString(),
          reminders_sent_count: 1,
        })
        .eq('subcontractor_id', subcontractorId)
        .eq('insurance_type', insuranceType)
        .eq('tenant_id', user.tenantId)
    }

    return NextResponse.json({ success: true, sent_to: recipientEmail })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
