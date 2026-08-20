import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'
import crypto from 'crypto'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { id } = await params

  const { owner_email, owner_name } = await req.json()

  const { data: co, error } = await supabase
    .from('change_orders')
    .select('*, projects(name, address)')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (error || !co) return NextResponse.json({ error: 'Change order not found' }, { status: 404 })

  const token = crypto.randomBytes(32).toString('hex')

  await supabase.from('change_orders').update({
    status: 'submitted',
    owner_approval_token: token,
    sent_to_owner_at: new Date().toISOString(),
    owner_email: owner_email || co.owner_email,
  }).eq('id', id).eq('tenant_id', tenantId)

  const approvalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/portals/co-approval/${token}`

  if (process.env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Saguaro Control <noreply@saguarocontrol.net>',
        to: owner_email,
        subject: `Change Order ${co.co_number ? `#${co.co_number}` : ''} Requires Your Approval — ${(co.projects as Record<string, string>)?.name}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2>Change Order Approval Request</h2>
            <p>Dear ${owner_name || 'Project Owner'},</p>
            <p>A change order has been submitted for your review and approval on <strong>${(co.projects as Record<string, string>)?.name}</strong>.</p>
            <table style="border-collapse:collapse;width:100%;margin:20px 0;">
              <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Title</td><td style="padding:8px;border:1px solid #ddd;">${co.title}</td></tr>
              <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Amount</td><td style="padding:8px;border:1px solid #ddd;">$${Number(co.amount || 0).toLocaleString()}</td></tr>
              <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Reason</td><td style="padding:8px;border:1px solid #ddd;">${co.description || co.reason || ''}</td></tr>
            </table>
            <a href="${approvalUrl}" style="display:inline-block;background:#D4A017;color:#000;padding:14px 28px;border-radius:8px;font-weight:bold;text-decoration:none;font-size:16px;">
              Review &amp; Approve Change Order →
            </a>
            <p style="color:#888;font-size:12px;margin-top:20px;">This link is unique to you and expires in 30 days.</p>
          </div>
        `,
      }),
    })
  }

  return NextResponse.json({ success: true, approval_url: approvalUrl, token })
}
