import { NextRequest, NextResponse } from 'next/server'
import { getUser, createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createServerClient()

  try {
    const { data, error } = await db
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || null })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createServerClient()

  try {
    const body = await req.json()
    const allowed = [
      'company_name', 'company_dba', 'license_number', 'license_state',
      'license_expiry', 'ein', 'company_address', 'company_city',
      'company_state', 'company_zip', 'company_phone', 'company_email',
      'company_website', 'logo_url', 'primary_color',
      'default_retainage_pct', 'default_payment_terms',
      'default_bid_validity_days', 'signature_name', 'signature_title',
      'notify_bid_received', 'notify_rfi_overdue',
      'notify_insurance_expiring', 'notify_pay_app_certified',
    ]
    const safe: Record<string, unknown> = {
      tenant_id: user.tenantId,
      updated_at: new Date().toISOString(),
    }
    for (const k of allowed) if (k in body) safe[k] = body[k]

    const { data, error } = await db
      .from('tenant_settings')
      .upsert(safe, { onConflict: 'tenant_id' })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
