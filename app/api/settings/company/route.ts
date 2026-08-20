import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const { data } = await supabase
    .from('tenant_settings')
    .select(
      'company_name, company_address, company_city, company_state, company_zip, company_phone, license_number, logo_url, signature_name, signature_title',
    )
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return NextResponse.json({ data: data || {} })
}
