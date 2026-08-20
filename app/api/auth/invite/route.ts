import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { email, role, tenantId, invitedBy } = await req.json()
  if (!email || !tenantId) return NextResponse.json({ error: 'Missing email or tenantId' }, { status: 400 })

  try {
    // Check not already a member
    const { data: existing } = await supabase
      .from('profiles').select('id').eq('email', email).eq('tenant_id', tenantId).maybeSingle()
    if (existing) return NextResponse.json({ error: 'Already a member' }, { status: 409 })

    // Check not already invited (pending)
    const { data: existingInvite } = await supabase
      .from('invitations').select('id').eq('email', email).eq('tenant_id', tenantId).is('accepted_at', null)
      .gte('expires_at', new Date().toISOString()).maybeSingle()

    let token: string
    if (existingInvite) {
      const { data } = await supabase.from('invitations').select('token').eq('id', existingInvite.id).single()
      token = data?.token
    } else {
      const { data: invite } = await supabase.from('invitations')
        .insert({ tenant_id: tenantId, invited_by: invitedBy, email, role })
        .select('token').single()
      token = invite?.token
    }

    // Get company name and inviter name for email
    const { data: tenant } = await supabase.from('tenants').select('name').eq('id', tenantId).single()
    const { data: inviter } = await supabase.from('profiles').select('full_name').eq('id', invitedBy).single()

    // Send invite email via Resend
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Saguaro CRM <noreply@saguarocrm.com>',
        to: email,
        subject: `${inviter?.full_name || 'Your team'} invited you to ${tenant?.name || 'Saguaro CRM'}`,
        html: `
          <!DOCTYPE html>
          <html><body style="font-family:-apple-system,sans-serif;background:#f8fafc;padding:40px 16px;margin:0;">
          <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
            <div style="background:#0d1117;padding:28px 36px;">
              <h1 style="color:#D4A017;font-size:26px;font-weight:900;margin:0;">Saguaro</h1>
            </div>
            <div style="padding:36px;">
              <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 8px;">You&apos;re invited to join ${tenant?.name || 'a team on Saguaro'}</h2>
              <p style="color:#64748b;font-size:14px;line-height:1.7;margin:0 0 24px;">
                <strong>${inviter?.full_name || 'Your colleague'}</strong> has invited you to collaborate on <strong>${tenant?.name}</strong> using Saguaro Construction Intelligence Platform.
              </p>
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}"
                style="display:block;background:#D4A017;color:#0d1117;text-decoration:none;padding:15px 24px;border-radius:8px;font-weight:800;font-size:15px;text-align:center;margin-bottom:20px;">
                Accept Invitation
              </a>
              <p style="font-size:12px;color:#94a3b8;text-align:center;">
                This invitation expires in 7 days. If you did not expect this, you can ignore this email.
              </p>
            </div>
          </div>
          </body></html>
        `,
      })
    } catch (emailErr: any) {
      console.error('Invite email send failed:', emailErr.message)
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 })
  }
}
