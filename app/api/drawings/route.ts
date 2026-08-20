import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type Row = Record<string, unknown>

const mapOut = (r: Row) => {
  const url = (r.file_url as string) ?? (r.url as string) ?? ''
  const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase()
  const file_type = (r.file_type as string) ?? (['jpg','jpeg','png','webp','gif'].includes(ext) ? 'image' : 'pdf')
  return {
    id: r.id,
    title: r.title ?? r.name ?? '',
    sheet_number: r.sheet_number ?? '',
    discipline: r.discipline ?? 'Architectural',
    revision: (r.revision as string) ?? (r.version as string) ?? '0',
    status: r.status ?? 'current',
    file_url: url,
    file_type,
    created_at: r.created_at,
  }
}

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const projectId = req.nextUrl.searchParams.get('projectId')
    const discipline = req.nextUrl.searchParams.get('discipline')
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

    const db = createServerClient()
    let query = db.from('drawings').select('*').eq('project_id', projectId).eq('tenant_id', user.tenantId).order('sheet_number')
    if (discipline) query = query.eq('discipline', discipline)

    const { data, error } = await query
    if (error) {
      if (/relation .* does not exist/i.test(error.message)) {
        return NextResponse.json({ drawings: [] })
      }
      throw error
    }
    return NextResponse.json({ drawings: (data || []).map(mapOut) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
