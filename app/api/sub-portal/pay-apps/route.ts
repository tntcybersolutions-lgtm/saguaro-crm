import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

async function resolveSubcontractor(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string, email: string | undefined) {
  const { data: byUser } = await supabase
    .from('subcontractors')
    .select('id, tenant_id, company_name')
    .eq('user_id', userId)
    .maybeSingle()
  if (byUser) return byUser as { id: string; tenant_id: string; company_name?: string }
  if (email) {
    const { data: byEmail } = await supabase
      .from('subcontractors')
      .select('id, tenant_id, company_name')
      .eq('email', email)
      .maybeSingle()
    if (byEmail) return byEmail as { id: string; tenant_id: string; company_name?: string }
  }
  return null
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sub = await resolveSubcontractor(supabase, user.id, user.email)
  if (!sub) return NextResponse.json({ pay_apps: [] })

  const { data, error } = await supabase
    .from('pay_applications')
    .select('*')
    .eq('tenant_id', sub.tenant_id)
    .eq('subcontractor_id', sub.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ pay_apps: [], error: error.message })
  return NextResponse.json({ pay_apps: data || [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sub = await resolveSubcontractor(supabase, user.id, user.email)
  if (!sub) return NextResponse.json({ error: 'No subcontractor profile' }, { status: 403 })

  const body = await req.json()
  const { project_id, period_from, period_to, current_payment_due, notes } = body
  if (!project_id || !period_to || current_payment_due == null) {
    return NextResponse.json({ error: 'project_id, period_to, current_payment_due required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('pay_applications')
    .insert({
      tenant_id: sub.tenant_id,
      project_id,
      subcontractor_id: sub.id,
      period_from: period_from || null,
      period_to,
      current_payment_due: Number(current_payment_due),
      notes: notes || '',
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pay_app: data })
}
