import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const { data: baselines, error } = await supabase
    .from('schedule_baselines')
    .select('id, name, captured_at, task_snapshot')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .order('captured_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: currentTasks } = await supabase
    .from('schedule_tasks')
    .select('id, title, start_date, end_date, percent_complete, status')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)

  const latest = baselines?.[0]
  const variance: Record<string, unknown>[] = []
  if (latest && currentTasks) {
    const baseTasks = (latest.task_snapshot as Record<string, unknown>[]) || []
    for (const cur of currentTasks) {
      const base = baseTasks.find(b => b.id === cur.id)
      if (!base) continue
      const baseEnd = new Date(String(base.end_date || ''))
      const curEnd = new Date(String(cur.end_date || ''))
      const slippageDays = isFinite(baseEnd.getTime()) && isFinite(curEnd.getTime())
        ? Math.round((curEnd.getTime() - baseEnd.getTime()) / 86400000)
        : 0
      variance.push({
        task_id: cur.id,
        title: cur.title,
        baseline_end: base.end_date,
        current_end: cur.end_date,
        slippage_days: slippageDays,
      })
    }
  }

  return NextResponse.json({ baselines: baselines || [], variance })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId, userId } = auth

  const { projectId, name = `Baseline ${new Date().toLocaleDateString()}` } = await req.json()
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const { data: tasks, error: tasksErr } = await supabase
    .from('schedule_tasks')
    .select('*')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)

  if (tasksErr) return NextResponse.json({ error: tasksErr.message }, { status: 500 })

  const { data, error } = await supabase
    .from('schedule_baselines')
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      name,
      captured_at: new Date().toISOString(),
      captured_by: userId,
      task_snapshot: tasks || [],
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ baseline: data })
}
