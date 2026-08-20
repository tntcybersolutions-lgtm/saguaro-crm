import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  await supabase.from('qbo_connections').update({ status: 'disconnected' }).eq('tenant_id', tenantId)
  return NextResponse.json({ success: true })
}
