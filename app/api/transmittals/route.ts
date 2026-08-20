import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = createServerClient()
    const projectId = req.nextUrl.searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

    const { data, error } = await db
      .from('transmittals')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('transmittal_date', { ascending: false })

    if (error) throw error
    return NextResponse.json({ transmittals: data || [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const projectId: string | undefined = body.project_id || body.projectId
    if (!projectId || !body.subject) {
      return NextResponse.json({ error: 'projectId and subject required' }, { status: 400 })
    }

    const db = createServerClient()

    // Auto-number transmittal
    const { count } = await db
      .from('transmittals')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
    const transmittal_number = body.transmittal_number || `TRX-${String((count || 0) + 1).padStart(3, '0')}`

    const { data, error } = await db
      .from('transmittals')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        created_by: user.id,
        transmittal_number,
        subject: body.subject,
        transmittal_date: body.transmittal_date || new Date().toISOString().slice(0, 10),
        recipient: body.recipient || '',
        recipient_email: body.recipient_email || null,
        purpose: body.purpose || 'For Information',
        reference_documents: body.reference_documents || [],
        notes: body.notes || '',
        status: body.status || 'draft',
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ transmittal: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
