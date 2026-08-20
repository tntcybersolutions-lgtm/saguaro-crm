import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { id } = await params

  const body = await req.json().catch(() => ({})) as { email?: string }

  const { data: waiver, error: loadErr } = await supabase.from('lien_waivers')
    .select('id, claimant_email, sent_to_email, claimant_name, token').eq('id', id).eq('tenant_id', tenantId).single()
  if (loadErr || !waiver) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sendTo = body.email || (waiver as { sent_to_email?: string }).sent_to_email || (waiver as { claimant_email?: string }).claimant_email
  if (!sendTo) return NextResponse.json({ error: 'No recipient email on file' }, { status: 400 })

  const { error } = await supabase.from('lien_waivers').update({
    status: 'sent',
    sent_to_email: sendTo,
    sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, sentTo: sendTo, portalToken: (waiver as { token?: string }).token })
}
