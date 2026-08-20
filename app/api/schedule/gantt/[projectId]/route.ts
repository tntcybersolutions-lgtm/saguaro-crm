import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { projectId } = await params

  const { data: milestones, error } = await supabase
    .from('schedule_milestones')
    .select('*')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .order('planned_start', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: project } = await supabase
    .from('projects')
    .select('name, start_date, estimated_completion')
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .single()

  return NextResponse.json({ milestones: milestones || [], project })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId, userId } = auth
  const { projectId } = await params

  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 })
  if (!body.planned_start) return NextResponse.json({ error: 'Missing required field: planned_start' }, { status: 400 })
  if (!body.planned_end) return NextResponse.json({ error: 'Missing required field: planned_end' }, { status: 400 })

  const { data, error } = await supabase
    .from('schedule_milestones')
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      name: body.name,
      description: body.description || null,
      planned_start: body.planned_start,
      planned_end: body.planned_end,
      actual_start: body.actual_start || null,
      actual_end: body.actual_end || null,
      status: body.status || 'not_started',
      completion_pct: body.completion_pct || 0,
      csi_division: body.csi_division || null,
      assigned_to: body.assigned_to || null,
      is_critical_path: body.is_critical_path || false,
      created_by: userId,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
