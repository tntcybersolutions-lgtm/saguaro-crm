import { NextRequest, NextResponse } from 'next/server'
import { getUser, createServerClient } from '@/lib/supabase-server'
import { sendEmail, bidInviteHtml } from '@/lib/email/send'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createServerClient()

  try {
    const body = await req.json()
    if (!body.emails?.length)
      return NextResponse.json({ error: 'No emails provided' }, { status: 400 })

    // Load bid package + project
    const { data: pkg } = await db
      .from('bid_packages')
      .select(`*, projects!inner(name,city,state,estimated_completion)`)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single()

    if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })

    // Load tenant settings for GC branding
    const { data: settings } = await db
      .from('tenant_settings')
      .select('company_name,company_email,company_phone,signature_name')
      .eq('tenant_id', user.tenantId)
      .maybeSingle()

    const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net'
    const portalUrl = `${origin}/bid/${pkg.sub_portal_token}`

    const bidDueDate = pkg.bid_due_date
      ? new Date(pkg.bid_due_date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        })
      : 'See portal for due date'

    const results: Array<{ email: string; success: boolean; error?: string }> = []

    for (const email of body.emails) {
      const project = pkg.projects as { name: string }
      const html = bidInviteHtml({
        projectName: project.name,
        packageName: pkg.name,
        bidDueDate,
        portalUrl,
        scopeNarrative: pkg.scope_narrative || pkg.name,
        gcCompanyName: settings?.company_name || 'General Contractor',
        gcContactName: settings?.signature_name || 'Project Manager',
        gcContactEmail: settings?.company_email || '',
        gcContactPhone: settings?.company_phone || '',
      })

      const result = await sendEmail({
        to: email,
        subject: `Invitation to Bid — ${pkg.name} — ${project.name}`,
        html,
        replyTo: settings?.company_email,
      })
      results.push({ email, success: !!result, error: result ? undefined : 'Send failed' })
    }

    const successCount = results.filter(r => r.success).length

    // Log invitations sent
    await db.from('bid_packages').update({
      invitations_sent: (pkg.invitations_sent || 0) + successCount,
      last_invitation_at: new Date().toISOString(),
    }).eq('id', id).eq('tenant_id', user.tenantId)

    return NextResponse.json({
      success: successCount > 0,
      sent: successCount,
      failed: results.length - successCount,
      results,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
