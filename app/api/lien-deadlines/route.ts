import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const projectId = req.nextUrl.searchParams.get('projectId')
  const isCritical = req.nextUrl.searchParams.get('critical')
  const status = req.nextUrl.searchParams.get('status')

  let q = supabase.from('lien_deadlines').select('*').eq('tenant_id', tenantId)
  if (projectId) q = q.eq('project_id', projectId)
  if (isCritical === 'true') q = q.eq('is_critical', true)
  if (status) q = q.eq('status', status)

  const { data, error } = await q.order('due_date', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ lienDeadlines: data || [] })
}
