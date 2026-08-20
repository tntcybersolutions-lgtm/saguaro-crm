import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const { projectId, owner_name, owner_email } = await req.json()
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const { data: existing } = await supabase
    .from('owner_portal_tokens')
    .select('token')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({
      token: existing.token,
      url: `${process.env.NEXT_PUBLIC_APP_URL}/portals/owner-dashboard/${existing.token}`,
      reused: true,
    })
  }

  const token = crypto.randomBytes(32).toString('hex')

  const { data, error } = await supabase
    .from('owner_portal_tokens')
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      token,
      owner_name: owner_name || null,
      owner_email: owner_email || null,
      is_active: true,
    })
    .select('token')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    token: data.token,
    url: `${process.env.NEXT_PUBLIC_APP_URL}/portals/owner-dashboard/${data.token}`,
    reused: false,
  })
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const { data, error } = await supabase
    .from('owner_portal_tokens')
    .select('token, owner_name, owner_email, view_count, last_viewed_at, is_active, created_at')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tokens = (data || []).map(t => ({
    ...t,
    url: `${process.env.NEXT_PUBLIC_APP_URL}/portals/owner-dashboard/${t.token}`,
  }))

  return NextResponse.json({ tokens })
}
