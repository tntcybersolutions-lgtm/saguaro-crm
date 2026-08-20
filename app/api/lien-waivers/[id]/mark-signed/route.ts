import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json().catch(() => ({}))
    const db = createServerClient()

    // Load the waiver
    const { data: waiver, error: wErr } = await db
      .from('lien_waivers')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single()

    if (wErr || !waiver) return NextResponse.json({ error: 'Waiver not found' }, { status: 404 })

    // Mark as signed
    const now = new Date().toISOString()
    await db.from('lien_waivers').update({
      status: 'signed',
      signed_at: body.signed_at || now,
      signature_method: body.signature_method || 'in_person',
      updated_at: now,
    }).eq('id', id).eq('tenant_id', user.tenantId)

    // If conditional waiver is signed, auto-create corresponding unconditional (draft)
    const waiverType = waiver.waiver_type as string
    if (waiverType?.startsWith('conditional_')) {
      const unconditionalType = waiverType.replace('conditional_', 'unconditional_')
      await db.from('lien_waivers').insert({
        project_id: waiver.project_id,
        tenant_id: user.tenantId,
        subcontractor_id: waiver.subcontractor_id || waiver.sub_id || null,
        pay_application_id: waiver.pay_application_id || null,
        waiver_type: unconditionalType,
        claimant_name: waiver.claimant_name,
        claimant_email: waiver.claimant_email || null,
        owner_name: waiver.owner_name || null,
        gc_company_name: waiver.gc_company_name || waiver.gc_name || null,
        project_name: waiver.project_name || null,
        project_address: waiver.project_address || null,
        through_date: waiver.through_date,
        amount: waiver.amount || waiver.payment_amount || 0,
        status: 'draft',
        converted_from_id: id,
        created_by: user.id,
      })
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
