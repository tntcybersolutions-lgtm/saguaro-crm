import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { Resend } from 'resend'

export const runtime = 'nodejs'

const FROM = process.env.EMAIL_FROM || 'Saguaro CRM <noreply@saguarocontrol.net>'

// Token-based public portal: subcontractor signs lien waiver via emailed link.
// No user session — the token itself authenticates.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 8) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    signedName?: string
    signerTitle?: string
    signatureDataUrl?: string
  }

  if (!body.signedName) return NextResponse.json({ error: 'signedName required' }, { status: 400 })

  const db = createServerClient()

  const { data: waiver, error: loadErr } = await db.from('lien_waivers')
    .select('id, tenant_id, status, waiver_type, token, claimant_name, claimant_email, amount, payment_amount, through_date, project_id')
    .eq('token', token)
    .maybeSingle()
  if (loadErr || !waiver) return NextResponse.json({ error: 'Token not found' }, { status: 404 })

  const w = waiver as {
    id: string; tenant_id: string; status: string;
    waiver_type: string; claimant_name: string | null;
    claimant_email: string | null; amount: number | null;
    payment_amount: number | null; through_date: string | null;
    project_id: string | null;
  }
  if (w.status === 'signed') return NextResponse.json({ error: 'Already signed' }, { status: 409 })

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || req.headers.get('x-real-ip')
    || 'unknown'

  const signedAt = new Date().toISOString()

  const { error } = await db.from('lien_waivers').update({
    status: 'signed',
    signed_at: signedAt,
    signed_name: body.signedName,
    signer_title: body.signerTitle || null,
    signature_data_url: body.signatureDataUrl || null,
    updated_at: signedAt,
  }).eq('id', w.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire two emails (non-blocking). Any failure must not prevent the signature from being recorded.
  const key = process.env.RESEND_API_KEY
  if (key) {
    try {
      const resend = new Resend(key)

      // Lookup GC email from tenant_settings
      const { data: gc } = await db
        .from('tenant_settings')
        .select('company_email, company_name')
        .eq('tenant_id', w.tenant_id)
        .maybeSingle()
      const gcEmail = (gc as { company_email?: string } | null)?.company_email || null
      const gcName = (gc as { company_name?: string } | null)?.company_name || 'General Contractor'

      const amount = w.payment_amount || w.amount || 0
      const docType = (w.waiver_type || 'lien_waiver').replace(/_/g, ' ')

      // Signer confirmation
      if (w.claimant_email) {
        await resend.emails.send({
          from: FROM,
          to: w.claimant_email,
          subject: `✅ Lien Waiver Signed — ${docType}`,
          html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#22C55E;">✅ Lien Waiver Signed</h2>
  <p>Hi ${w.claimant_name || 'there'},</p>
  <p>Your <strong>${docType}</strong> has been signed and recorded with ${gcName}.</p>
  <table style="border-collapse:collapse;margin:14px 0;font-size:14px;">
    <tr><td style="padding:6px 12px;color:#555;">Signed by:</td><td style="padding:6px 12px;font-weight:700;">${body.signedName}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">Signed at:</td><td style="padding:6px 12px;">${new Date(signedAt).toLocaleString()}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">Amount:</td><td style="padding:6px 12px;">$${Number(amount).toLocaleString()}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">Through:</td><td style="padding:6px 12px;">${w.through_date || '—'}</td></tr>
  </table>
  <p style="color:#666;font-size:12px;">Powered by Saguaro Construction Intelligence Platform</p>
</div>`,
        })
      }

      // GC notification
      if (gcEmail) {
        await resend.emails.send({
          from: FROM,
          to: gcEmail,
          subject: `✅ ${w.claimant_name || 'Subcontractor'} signed ${docType}`,
          html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#22C55E;">✅ Lien Waiver Signed by Subcontractor</h2>
  <p>A subcontractor signed a lien waiver in the Saguaro portal.</p>
  <table style="border-collapse:collapse;margin:14px 0;font-size:14px;">
    <tr><td style="padding:6px 12px;color:#555;">Subcontractor:</td><td style="padding:6px 12px;font-weight:700;">${w.claimant_name || '—'}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">Signed by:</td><td style="padding:6px 12px;">${body.signedName}${body.signerTitle ? ' (' + body.signerTitle + ')' : ''}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">Signed at:</td><td style="padding:6px 12px;">${new Date(signedAt).toLocaleString()}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">Waiver Type:</td><td style="padding:6px 12px;">${docType}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">Amount:</td><td style="padding:6px 12px;">$${Number(amount).toLocaleString()}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">IP address:</td><td style="padding:6px 12px;font-family:monospace;">${clientIp}</td></tr>
  </table>
  <p><a href="https://saguarocontrol.net/app/projects/${w.project_id || ''}/lien-waivers" style="background:#D4A017;color:#000;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700;">Open in Dashboard →</a></p>
</div>`,
        })
      }
    } catch { /* email failure must not block the signature */ }
  }

  return NextResponse.json({
    success: true,
    waiverId: w.id,
    signedAt,
    claimantName: w.claimant_name,
    amount: w.payment_amount || w.amount || 0,
    waiverType: w.waiver_type,
  })
}
