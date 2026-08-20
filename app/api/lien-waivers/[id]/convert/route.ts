import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'
import crypto from 'crypto'

export const runtime = 'nodejs'

// Convert conditional waiver → unconditional waiver after payment is confirmed.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { id } = await params

  const body = await req.json().catch(() => ({})) as { payment_date?: string; check_number?: string }

  const { data: original, error: loadErr } = await supabase.from('lien_waivers')
    .select('*').eq('id', id).eq('tenant_id', tenantId).single()
  if (loadErr || !original) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const src = original as Record<string, unknown>
  const srcType = String(src.waiver_type || '')
  if (!srcType.startsWith('conditional')) {
    return NextResponse.json({ error: 'Only conditional waivers can be converted' }, { status: 400 })
  }

  const targetType = srcType.replace('conditional', 'unconditional')

  // Clone fields; swap type, reset status to draft, new token.
  const insert: Record<string, unknown> = {
    tenant_id: tenantId,
    project_id: src.project_id,
    pay_application_id: src.pay_application_id ?? null,
    bid_submission_id: src.bid_submission_id ?? null,
    subcontractor_id: src.subcontractor_id ?? null,
    waiver_type: targetType,
    status: 'draft',
    claimant_name: src.claimant_name,
    company_name: src.company_name,
    claimant_email: src.claimant_email,
    sent_to_email: src.sent_to_email,
    contact_name: src.contact_name,
    amount: src.amount,
    through_date: src.through_date,
    state: src.state,
    state_statute: src.state_statute,
    gc_company_name: src.gc_company_name,
    owner_name: src.owner_name,
    project_address: src.project_address,
    token: crypto.randomUUID(),
    is_payment_gate: false,
    retainage_amount: src.retainage_amount,
    notice_required: src.notice_required,
    notarization_required: src.notarization_required,
    statutory_form_required: src.statutory_form_required,
    payment_date: body.payment_date || new Date().toISOString().split('T')[0],
    check_number: body.check_number || src.check_number || null,
    converted_from_id: id,
  }

  const { data: newRow, error } = await supabase.from('lien_waivers').insert(insert).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, newWaiverId: (newRow as { id: string }).id, waiverType: targetType })
}
