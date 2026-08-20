import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = createServerClient()
    const projectId = req.nextUrl.searchParams.get('projectId')

    let query = db
      .from('inspections')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })

    if (projectId) query = query.eq('project_id', projectId)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ inspections: data || [] })
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
    if (!projectId || !body.inspection_type) {
      return NextResponse.json({ error: 'projectId and inspection_type required' }, { status: 400 })
    }

    const db = createServerClient()
    const { data, error } = await db
      .from('inspections')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        created_by: user.id,
        inspection_type: body.inspection_type,
        template_id: body.template_id || null,
        scheduled_date: body.scheduled_date || null,
        inspector_name: body.inspector_name || '',
        location: body.location || '',
        status: body.status || 'scheduled',
        notes: body.notes || '',
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ inspection: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
