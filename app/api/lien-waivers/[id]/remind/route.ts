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

  const { data: waiver, error: loadErr } = await supabase.from('lien_waivers')
    .select('id, sent_to_email, claimant_email, status, reminder_count').eq('id', id).eq('tenant_id', tenantId).single()
  if (loadErr || !waiver) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const w = waiver as { sent_to_email?: string; claimant_email?: string; status?: string; reminder_count?: number }
  if (w.status === 'signed') return NextResponse.json({ error: 'Already signed' }, { status: 409 })

  const sendTo = w.sent_to_email || w.claimant_email
  if (!sendTo) return NextResponse.json({ error: 'No recipient email on file' }, { status: 400 })

  const prior = Number(w.reminder_count || 0)

  const { error } = await supabase.from('lien_waivers').update({
    last_reminder_at: new Date().toISOString(),
    reminder_count: prior + 1,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, sentTo: sendTo, reminderCount: prior + 1 })
}
