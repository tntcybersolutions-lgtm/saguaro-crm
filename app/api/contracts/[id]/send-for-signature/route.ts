import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { id } = await params

  const { data: contract } = await supabase.from('contracts')
    .select('*').eq('id', id).eq('tenant_id', tenantId).single()
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const recipientEmail = contract.party_email || contract.counterparty_email
  if (!recipientEmail) {
    return NextResponse.json({ error: 'No email address on file for this subcontractor' }, { status: 400 })
  }

  const { data: gc } = await supabase.from('tenant_settings')
    .select('company_name, company_email').eq('tenant_id', tenantId).maybeSingle()

  const host = req.headers.get('host') || 'saguarocontrol.net'
  const proto = host.includes('localhost') ? 'http' : 'https'
  const portalUrl = `${proto}://${host}/portals/contract/${contract.signing_token}`
  const gcName = gc?.company_name || 'General Contractor'

  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${gcName} <noreply@saguarocontrol.net>`,
        to: [recipientEmail],
        subject: `Subcontract Agreement for Your Review and Signature — ${contract.title}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#1a1a2e;padding:20px;text-align:center">
              <h2 style="color:#D4A017;margin:0">🌵 ${gcName}</h2>
            </div>
            <div style="padding:24px;background:#fff;border:1px solid #ddd">
              <p>Dear ${contract.party_name || 'Subcontractor'},</p>
              <p style="margin-top:12px">Please review and sign the subcontract agreement for the following work:</p>
              <div style="margin:20px 0;padding:16px;background:#f7f7f7;border-radius:8px">
                <table style="width:100%;border-collapse:collapse">
                  <tr><td style="color:#666;font-size:12px;padding:4px 0">Contract:</td><td style="font-weight:700">${contract.title}</td></tr>
                  <tr><td style="color:#666;font-size:12px;padding:4px 0">Trade:</td><td>${contract.trade || '—'}</td></tr>
                  <tr><td style="color:#666;font-size:12px;padding:4px 0">Amount:</td><td style="font-weight:700;color:#D4A017">$${Number(contract.amount || 0).toLocaleString()}</td></tr>
                  <tr><td style="color:#666;font-size:12px;padding:4px 0">Retainage:</td><td>${contract.retainage_pct || 10}%</td></tr>
                </table>
              </div>
              <div style="text-align:center;margin:24px 0">
                <a href="${portalUrl}" style="background:#D4A017;color:#000;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:900;font-size:15px;display:inline-block">
                  Review &amp; Sign Subcontract →
                </a>
              </div>
              <p style="font-size:11px;color:#999">
                This link is unique to you. No account required. Click the button to review the full contract and sign electronically.
              </p>
            </div>
          </div>`,
      }),
    })
  }

  const nowIso = new Date().toISOString()
  await supabase.from('contracts').update({
    status: 'sent',
    sent_at: nowIso,
    sent_for_signature_at: nowIso,
    updated_at: nowIso,
  }).eq('id', id).eq('tenant_id', tenantId)

  return NextResponse.json({ success: true, portalUrl, sentTo: recipientEmail })
}
