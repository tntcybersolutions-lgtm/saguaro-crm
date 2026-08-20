import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const { email, reason, confirmed } = await req.json()
  if (!email || !confirmed) return NextResponse.json({ error: 'Email and confirmation required' }, { status: 400 })

  try {
    const db = createServerClient()

    // Find user
    const { data: profile } = await db.from('profiles').select('id, tenant_id').eq('email', email).single()
    if (!profile) return NextResponse.json({ success: true }) // Don't reveal if user exists

    // Log the deletion request
    const { error: upsertError } = await db.from('deletion_requests').upsert({
      email,
      user_id: profile.id,
      tenant_id: profile.tenant_id,
      reason: reason || 'not_provided',
      requested_at: new Date().toISOString(),
      scheduled_deletion_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
    }, { onConflict: 'email' })

    if (upsertError) throw upsertError

    // Send confirmation email
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Saguaro CRM <noreply@saguarocrm.com>',
        to: email,
        subject: 'Data deletion request received — Saguaro CRM',
        html: `
          <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;">
            <h1 style="color:#D4A017;font-size:24px;font-weight:900;margin:0 0 24px;">Saguaro</h1>
            <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 16px;">Data Deletion Request Received</h2>
            <p style="color:#64748b;font-size:14px;line-height:1.7;margin:0 0 16px;">We've received your request to delete the Saguaro account associated with <strong>${email}</strong>.</p>
            <div style="background:#f8fafc;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
              <p style="font-size:13px;color:#374151;margin:0 0 6px;"><strong>Scheduled deletion:</strong> ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}</p>
              <p style="font-size:13px;color:#374151;margin:0;">All account data, projects, documents, and financial records will be permanently deleted.</p>
            </div>
            <p style="font-size:13px;color:#94a3b8;">If you did not make this request, contact us immediately at <a href="mailto:privacy@saguarocrm.com" style="color:#D4A017;">privacy@saguarocrm.com</a></p>
          </div>
        `,
      })
    } catch (emailErr: unknown) {
      console.error('Failed to send deletion confirmation email:', emailErr instanceof Error ? emailErr.message : emailErr)
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
