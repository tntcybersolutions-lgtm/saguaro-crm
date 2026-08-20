// app/api/validate/duplicate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const { type, field, value, excludeId } = await req.json()

  if (!type || !field || value === undefined) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const TABLE_MAP: Record<string, string> = {
    project: 'projects',
    subcontractor: 'subcontractors',
    employee: 'employees',
    rfi: 'rfis',
  }

  const table = TABLE_MAP[type]
  if (!table) return NextResponse.json({ error: 'Unknown type' }, { status: 400 })

  let query = supabase
    .from(table)
    .select('id')
    .eq('tenant_id', tenantId)
    .ilike(field, value.trim())
    .limit(1)

  if (excludeId) query = query.neq('id', excludeId)

  const { data } = await query

  return NextResponse.json({ isDuplicate: (data || []).length > 0 })
}
