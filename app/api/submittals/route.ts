import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type Row = Record<string, unknown>

const mapOut = (r: Row) => ({
  id: r.id,
  submittal_number: r.submittal_number ?? '',
  title: r.title ?? '',
  spec_section: r.spec_section ?? '',
  type: r.submittal_type ?? r.type ?? 'Shop Drawing',
  status: r.status ?? 'draft',
  submitted_by: r.submitted_by ?? '',
  due_date: r.due_date ?? '',
  description: r.description ?? '',
  revision: (r.revision_number as number) ?? 0,
  review_notes: r.reviewer_notes ?? r.review_comments ?? '',
  created_at: r.created_at,
})

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = createServerClient()
    const projectId = req.nextUrl.searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

    const { data, error } = await db
      .from('submittals')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ submittals: (data || []).map(mapOut) })
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
    if (!projectId || !body.title) {
      return NextResponse.json({ error: 'projectId and title required' }, { status: 400 })
    }

    const db = createServerClient()

    let submittal_number: string | null = body.submittal_number || null
    if (!submittal_number) {
      const { count } = await db
        .from('submittals')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
      submittal_number = `SUB-${String((count || 0) + 1).padStart(3, '0')}`
    }

    const { data, error } = await db
      .from('submittals')
      .insert({
        tenant_id: user.tenantId,
        created_by: user.id,
        project_id: projectId,
        title: body.title,
        submittal_number,
        spec_section: body.spec_section || null,
        drawing_reference: body.drawing_reference || null,
        submittal_type: body.type || body.submittal_type || 'Shop Drawing',
        description: body.description || null,
        submitted_by: body.submitted_by || null,
        submitted_to: body.submitted_to || null,
        due_date: body.due_date || null,
        status: body.status || 'draft',
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ submittal: mapOut(data as Row) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
