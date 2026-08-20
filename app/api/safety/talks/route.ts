import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type Row = Record<string, unknown>

// Map DB row to frontend-expected Talk shape
const mapOut = (r: Row) => {
  const conductedAt = (r.conducted_at as string) || (r.talk_date as string) || null
  const talk_date = conductedAt ? String(conductedAt).split('T')[0] : (r.date as string) || ''
  const attendance = Array.isArray(r.attendance) ? r.attendance : []
  const attendee_count =
    (typeof r.attendee_count === 'number' && r.attendee_count) ||
    attendance.length ||
    0
  return {
    id: r.id,
    topic: r.title ?? r.topic ?? '',
    conducted_by: r.conducted_by_name ?? r.conducted_by ?? '',
    attendee_count,
    talk_date,
    notes: r.content ?? r.notes ?? '',
    created_at: r.created_at,
  }
}

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = createServerClient()
    const projectId = req.nextUrl.searchParams.get('projectId')

    let query = db.from('safety_talks').select('*').eq('tenant_id', user.tenantId)
    if (projectId) query = query.eq('project_id', projectId)

    const { data, error } = await query
    if (error) {
      if (/relation .* does not exist/i.test(error.message)) {
        return NextResponse.json({ talks: [], note: 'safety_talks table not provisioned' })
      }
      throw error
    }
    const talks = (data || []).map(mapOut).sort((a, b) => (b.talk_date || '').localeCompare(a.talk_date || ''))
    return NextResponse.json({ talks })
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
    const projectId: string | undefined = body.projectId || body.project_id
    const { topic, attendee_count, talk_date, notes } = body

    if (!projectId || !topic) {
      return NextResponse.json({ error: 'projectId and topic required' }, { status: 400 })
    }

    const db = createServerClient()
    const { data, error } = await db
      .from('safety_talks')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        title: topic,
        content: notes || topic,
        conducted_at: talk_date ? `${talk_date}T08:00:00Z` : new Date().toISOString(),
        attendance: attendee_count ? Array.from({ length: parseInt(String(attendee_count)) || 0 }, (_, i) => ({ n: i + 1 })) : [],
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ talk: mapOut(data as Row) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
