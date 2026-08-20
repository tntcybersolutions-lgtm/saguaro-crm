import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { Resend } from 'resend'

export const runtime = 'nodejs'

const FROM = process.env.EMAIL_FROM || 'Saguaro CRM <noreply@saguarocontrol.net>'

// Token-based public portal: subcontractor signs subcontract via emailed link.
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

  const { data: contract, error: loadErr } = await db
    .from('contracts')
    .select('id, tenant_id, status, signing_token, title, party_name, party_email, amount, contract_amount, project_id, contract_number')
    .eq('signing_token', token)
    .maybeSingle()

  if (loadErr || !contract) return NextResponse.json({ error: 'Token not found' }, { status: 404 })

  const c = contract as {
    id: string; tenant_id: string; status: string;
    title: string | null; party_name: string | null; party_email: string | null;
    amount: number | null; contract_amount: number | null;
    project_id: string | null; contract_number: string | null;
  }
  if (c.status === 'executed') return NextResponse.json({ error: 'Already signed' }, { status: 409 })

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || req.headers.get('x-real-ip')
    || 'unknown'

  const signedAt = new Date().toISOString()

  const { error } = await db.from('contracts').update({
    status: 'executed',
    sub_signed_at: signedAt,
    sub_sign_ip: clientIp,
    signed_by_sub: body.signedName,
    sub_signer_title: body.signerTitle || null,
    sub_signature_url: body.signatureDataUrl || null,
    gc_notified_of_signature_at: signedAt,
    updated_at: signedAt,
  }).eq('id', c.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Dual email — non-blocking
  const key = process.env.RESEND_API_KEY
  if (key) {
    try {
      const resend = new Resend(key)
      const { data: gc } = await db
        .from('tenant_settings')
        .select('company_email, company_name')
        .eq('tenant_id', c.tenant_id)
        .maybeSingle()
      const gcEmail = (gc as { company_email?: string } | null)?.company_email || null
      const gcName = (gc as { company_name?: string } | null)?.company_name || 'General Contractor'

      const amount = c.contract_amount || c.amount || 0
      const contractTitle = c.title || `Subcontract ${c.contract_number || ''}`.trim()

      // Signer confirmation
      if (c.party_email) {
        await resend.emails.send({
          from: FROM,
          to: c.party_email,
          subject: `✅ Subcontract Signed — ${contractTitle}`,
          html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#22C55E;">✅ Subcontract Signed</h2>
  <p>Hi ${c.party_name || 'there'},</p>
  <p>Your subcontract has been signed and is now fully executed with ${gcName}.</p>
  <table style="border-collapse:collapse;margin:14px 0;font-size:14px;">
    <tr><td style="padding:6px 12px;color:#555;">Signed by:</td><td style="padding:6px 12px;font-weight:700;">${body.signedName}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">Signed at:</td><td style="padding:6px 12px;">${new Date(signedAt).toLocaleString()}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">Contract Title:</td><td style="padding:6px 12px;">${contractTitle}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">Contract Amount:</td><td style="padding:6px 12px;">$${Number(amount).toLocaleString()}</td></tr>
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
          subject: `✅ ${c.party_name || 'Subcontractor'} signed Subcontract`,
          html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#22C55E;">✅ Subcontract Signed by Subcontractor</h2>
  <table style="border-collapse:collapse;margin:14px 0;font-size:14px;">
    <tr><td style="padding:6px 12px;color:#555;">Subcontractor:</td><td style="padding:6px 12px;font-weight:700;">${c.party_name || '—'}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">Signed by:</td><td style="padding:6px 12px;">${body.signedName}${body.signerTitle ? ' (' + body.signerTitle + ')' : ''}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">Signed at:</td><td style="padding:6px 12px;">${new Date(signedAt).toLocaleString()}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">Contract:</td><td style="padding:6px 12px;">${contractTitle}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">Amount:</td><td style="padding:6px 12px;">$${Number(amount).toLocaleString()}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">IP address:</td><td style="padding:6px 12px;font-family:monospace;">${clientIp}</td></tr>
  </table>
  <p><a href="https://saguarocontrol.net/app/projects/${c.project_id || ''}/contracts" style="background:#D4A017;color:#000;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700;">Open in Dashboard →</a></p>
</div>`,
        })
      }
    } catch { /* non-blocking */ }
  }

  return NextResponse.json({
    success: true,
    contractId: c.id,
    status: 'executed',
    signedAt,
    partyName: c.party_name,
    contractTitle: c.title,
    amount: c.contract_amount || c.amount || 0,
  })
}
