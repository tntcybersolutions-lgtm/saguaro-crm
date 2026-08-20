import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type Row = Record<string, unknown>

const dayDiff = (s?: string, e?: string) => {
  if (!s || !e) return 0
  return Math.max(1, Math.ceil((new Date(e).getTime() - new Date(s).getTime()) / 86400000))
}

const mapTask = (r: Row) => ({
  id: r.id,
  title: r.name ?? r.title ?? '',
  phase: r.phase ?? r.trade ?? 'Construction',
  start_date: r.start_date ?? '',
  end_date: r.end_date ?? '',
  duration_days: (r.duration_days as number) ?? dayDiff(r.start_date as string, r.end_date as string),
  percent_complete: (r.pct_complete as number) ?? (r.percent_complete as number) ?? 0,
  status: r.status ?? 'not_started',
  priority: r.priority ?? 'medium',
  assigned_to: r.assigned_to ?? '',
})

const mapMilestone = (r: Row) => ({
  id: r.id,
  title: r.title ?? r.name ?? '',
  date: (r.baseline_date as string) ?? (r.planned_start as string) ?? (r.date as string) ?? '',
  status: r.status ?? 'pending',
  phase: r.phase ?? r.milestone_type ?? 'Construction',
})

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = createServerClient()
    const projectId = req.nextUrl.searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

    const [tasksRes, milestonesRes] = await Promise.all([
      db.from('schedule_tasks').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('start_date', { ascending: true }),
      db.from('schedule_milestones').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('baseline_date', { ascending: true }),
    ])

    return NextResponse.json({
      tasks: (tasksRes.data || []).map(mapTask),
      milestones: (milestonesRes.data || []).map(mapMilestone),
    })
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
    const title: string | undefined = body.title || body.name
    if (!projectId || !title) {
      return NextResponse.json({ error: 'projectId and title required' }, { status: 400 })
    }

    const db = createServerClient()
    const kind = body.type === 'milestone' ? 'milestone' : 'task'

    if (kind === 'milestone') {
      const d = body.start_date || body.date
      const { data, error } = await db.from('schedule_milestones').insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        title,
        name: title,
        milestone_type: body.phase || 'phase',
        baseline_date: d,
        planned_start: d,
        planned_end: d,
        status: body.status || 'pending',
        completion_pct: 0,
      }).select('*').single()
      if (error) throw error
      return NextResponse.json({ task: mapMilestone(data as Row), type: 'milestone' })
    }

    if (!body.start_date || !body.end_date) {
      return NextResponse.json({ error: 'start_date and end_date required for task' }, { status: 400 })
    }

    const { data, error } = await db.from('schedule_tasks').insert({
      tenant_id: user.tenantId,
      project_id: projectId,
      name: title,
      start_date: body.start_date,
      end_date: body.end_date,
      trade: body.phase || body.trade || 'General',
      status: body.status || 'not_started',
    }).select('*').single()
    if (error) throw error
    return NextResponse.json({ task: mapTask(data as Row), type: 'task' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
