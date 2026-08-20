import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('inspection_templates')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) throw error
    return NextResponse.json({ templates: data || [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
