import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createServerClient()

  const { data: co, error } = await supabase
    .from('change_orders')
    .select('id, title, amount, description, co_number, status, projects(name)')
    .eq('owner_approval_token', token)
    .single()

  if (error || !co) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 404 })

  return NextResponse.json({
    change_order: {
      ...co,
      project_name: (co.projects as unknown as Record<string, string>)?.name || '',
    },
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { action, notes } = await req.json()

  const supabase = await createServerClient()

  const { data: co, error } = await supabase
    .from('change_orders')
    .select('id, tenant_id, status')
    .eq('owner_approval_token', token)
    .single()

  if (error || !co) return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  if (co.status === 'approved' || co.status === 'rejected') {
    return NextResponse.json({ error: 'Already actioned' }, { status: 409 })
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected'
  const { error: updateErr } = await supabase
    .from('change_orders')
    .update({
      status: newStatus,
      owner_approval_notes: notes || null,
      owner_actioned_at: new Date().toISOString(),
    })
    .eq('id', co.id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  return NextResponse.json({ success: true, status: newStatus })
}
