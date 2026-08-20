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
      .from('punch_list')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('item_number', { ascending: true })

    if (error) throw error

    const items = data || []
    const now = Date.now()
    const stats = {
      total: items.length,
      open: items.filter(i => i.status === 'open').length,
      in_progress: items.filter(i => i.status === 'in_progress').length,
      complete: items.filter(i => i.status === 'complete').length,
      overdue: items.filter(i => i.due_date && new Date(i.due_date).getTime() < now && i.status !== 'complete').length,
    }

    return NextResponse.json({ items, stats })
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

    // Auto-increment item_number per project
    const { data: maxRow } = await db
      .from('punch_list')
      .select('item_number')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('item_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextItemNumber = ((maxRow?.item_number as number) || 0) + 1

    const { data, error } = await db
      .from('punch_list')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        item_number: nextItemNumber,
        title: body.title,
        description: body.description || '',
        location: body.location || '',
        trade: body.trade || 'General',
        assigned_to: body.assigned_to || '',
        due_date: body.due_date || null,
        priority: body.priority || 'medium',
        status: body.status || 'open',
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ item: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
