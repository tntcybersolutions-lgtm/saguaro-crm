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
      .from('safety_incidents')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('incident_date', { ascending: false })

    if (projectId) query = query.eq('project_id', projectId)

    const { data, error } = await query
    if (error) throw error
    // Map real DB columns to the shape the frontend expects
    const incidents = (data || []).map((r: Record<string, unknown>) => {
      const desc = (r.description as string) || ''
      return {
        id: r.id,
        title: (r.title as string) || desc.split(/\.|\n/)[0].slice(0, 80) || 'Incident',
        incident_type: r.incident_type ?? 'near_miss',
        severity: r.severity ?? 'low',
        incident_date: r.incident_date ?? '',
        location: r.location ?? '',
        injured_person: r.employee_name ?? '',
        description: desc,
        root_cause: r.root_cause ?? '',
        immediate_actions: r.corrective_actions ?? '',
        reported_by: r.reported_by ?? '',
        recordable: (r.osha_recordable as boolean) ?? false,
        osha_reportable: (r.osha_reportable_bool as boolean) ?? (r.osha_reportable as boolean) ?? false,
        status: r.status ?? 'open',
        created_at: r.created_at,
      }
    })
    return NextResponse.json({ incidents })
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
    const title: string | undefined = body.title
    const incident_date: string | undefined = body.incident_date
    if (!projectId || !title || !incident_date) {
      return NextResponse.json({ error: 'projectId, title, incident_date required' }, { status: 400 })
    }

    const db = createServerClient()
    // Real DB schema: description is required; uses corrective_actions (not immediate_actions);
    // uses osha_recordable (not recordable); has near_miss flag; no incident_time or injured_person.
    const description = body.description || title
    const { data, error } = await db
      .from('safety_incidents')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        description,
        incident_type: body.incident_type || 'near_miss',
        severity: body.severity || 'low',
        incident_date,
        time_of_incident: body.incident_time || null,
        location: body.location || '',
        injury_type: body.injury_type || null,
        days_away: body.days_away || 0,
        root_cause: body.root_cause || '',
        corrective_actions: body.immediate_actions || body.corrective_actions || '',
        preventive_measures: body.preventive_measures || '',
        reported_by: body.reported_by || '',
        witnesses: body.witnesses || '',
        near_miss: body.incident_type === 'near_miss',
        osha_recordable: body.recordable || false,
        osha_reportable: body.osha_reportable || false,
        first_aid_only: body.incident_type === 'first_aid',
        status: body.status || 'open',
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ incident: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
