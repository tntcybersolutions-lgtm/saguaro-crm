import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type Row = Record<string, unknown>

const toArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === 'string' && v.trim()) return v.split(/\r?\n/).filter(Boolean)
  return []
}

const mapOut = (r: Row) => ({
  id: r.id,
  title: r.title ?? '',
  meeting_type: r.meeting_type ?? 'OAC',
  meeting_date: r.meeting_date ?? '',
  location: r.location ?? '',
  chair: r.facilitator_name ?? r.chair ?? '',
  attendees: toArray(r.distributed_to ?? r.attendees ?? []),
  agenda_items: toArray(r.agenda ?? r.agenda_items ?? []),
  notes: r.notes ?? r.minutes_text ?? '',
  action_items: Array.isArray(r.related_change_orders)
    ? (r.related_change_orders as unknown[])
    : Array.isArray(r.action_items)
      ? (r.action_items as unknown[])
      : [],
  status: r.status ?? 'complete',
  created_at: r.created_at,
})

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const projectId = req.nextUrl.searchParams.get('projectId')
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    }

    const db = createServerClient()
    const { data, error } = await db
      .from('meetings')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('meeting_date', { ascending: false })

    if (error) {
      if (/relation .* does not exist/i.test(error.message)) {
        return NextResponse.json({ meetings: [], note: 'meetings table not provisioned' })
      }
      throw error
    }
    return NextResponse.json({ meetings: (data || []).map(mapOut) })
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
    const { title, meeting_type, meeting_date, location, chair, attendees, agenda_items, notes, action_items } = body

    if (!projectId || !title || !meeting_date) {
      return NextResponse.json({ error: 'projectId, title, meeting_date required' }, { status: 400 })
    }

    const db = createServerClient()
    const { data, error } = await db
      .from('meetings')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        title,
        meeting_type: meeting_type || 'OAC',
        meeting_date,
        location: location || '',
        facilitator_name: chair || '',
        agenda: Array.isArray(agenda_items) ? agenda_items.join('\n') : String(agenda_items || ''),
        notes: notes || '',
        distributed_to: attendees || [],
        related_change_orders: action_items || [],
        status: 'complete',
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ meeting: mapOut(data as Row) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
