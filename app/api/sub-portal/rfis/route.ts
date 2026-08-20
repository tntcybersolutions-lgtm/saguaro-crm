import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

async function resolveSubcontractor(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string, email: string | undefined) {
  const { data: byUser } = await supabase
    .from('subcontractors')
    .select('id, tenant_id, company_name, email')
    .eq('user_id', userId)
    .maybeSingle()
  if (byUser) return byUser as { id: string; tenant_id: string; company_name?: string; email?: string }
  if (email) {
    const { data: byEmail } = await supabase
      .from('subcontractors')
      .select('id, tenant_id, company_name, email')
      .eq('email', email)
      .maybeSingle()
    if (byEmail) return byEmail as { id: string; tenant_id: string; company_name?: string; email?: string }
  }
  return null
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sub = await resolveSubcontractor(supabase, user.id, user.email)
  if (!sub) return NextResponse.json({ rfis: [] })

  const { data, error } = await supabase
    .from('rfis')
    .select('*')
    .eq('tenant_id', sub.tenant_id)
    .or(`assigned_to_subcontractor_id.eq.${sub.id},assigned_to_email.eq.${sub.email || ''}`)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ rfis: [], error: error.message })
  return NextResponse.json({ rfis: data || [] })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sub = await resolveSubcontractor(supabase, user.id, user.email)
  if (!sub) return NextResponse.json({ error: 'No subcontractor profile' }, { status: 403 })

  const body = await req.json()
  const { rfi_id, response, status } = body
  if (!rfi_id || !response) {
    return NextResponse.json({ error: 'rfi_id and response required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('rfis')
    .update({
      response,
      response_by: user.email,
      responded_at: new Date().toISOString(),
      status: status || 'answered',
    })
    .eq('id', rfi_id)
    .eq('tenant_id', sub.tenant_id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rfi: data })
}
