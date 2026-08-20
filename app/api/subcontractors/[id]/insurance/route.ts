import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('sub_insurance')
      .select('*')
      .eq('subcontractor_id', id)
      .eq('tenant_id', user.tenantId)
      .order('expiration_date', { ascending: true })

    if (error) throw error
    return NextResponse.json({ data: data || [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    if (!body.insurance_type) return NextResponse.json({ error: 'Missing insurance_type' }, { status: 400 })
    if (!body.expiration_date) return NextResponse.json({ error: 'Missing expiration_date' }, { status: 400 })

    const db = createServerClient()
    const { data, error } = await db
      .from('sub_insurance')
      .insert({
        subcontractor_id: id,
        tenant_id: user.tenantId,
        insurance_type: body.insurance_type,
        insurer_name: body.insurer_name || null,
        policy_number: body.policy_number || null,
        effective_date: body.effective_date || null,
        expiration_date: body.expiration_date,
        each_occurrence: body.each_occurrence || null,
        general_aggregate: body.general_aggregate || null,
        additional_insured: body.additional_insured || false,
        certificate_url: body.certificate_url || null,
        certificate_file_name: body.certificate_file_name || null,
        uploaded_by: user.id,
        uploaded_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const certId = body.certId || body.cert_id
    if (!certId) return NextResponse.json({ error: 'Missing certId' }, { status: 400 })

    const db = createServerClient()
    const allowed = [
      'insurer_name', 'policy_number', 'effective_date', 'expiration_date',
      'each_occurrence', 'general_aggregate', 'additional_insured',
      'certificate_url', 'certificate_file_name',
    ]
    const fields: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (body[key] !== undefined) fields[key] = body[key]
    }

    const { error } = await db
      .from('sub_insurance')
      .update(fields)
      .eq('id', certId)
      .eq('subcontractor_id', id)
      .eq('tenant_id', user.tenantId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
