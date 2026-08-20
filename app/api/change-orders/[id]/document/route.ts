import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { id } = await params

  const { data: co } = await supabase
    .from('change_orders')
    .select('html_content, title')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (!co?.html_content) return NextResponse.json({ error: 'Not generated' }, { status: 404 })
  return new Response(co.html_content, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
