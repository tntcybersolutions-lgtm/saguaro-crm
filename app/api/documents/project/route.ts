import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = createServerClient()
    const projectId = req.nextUrl.searchParams.get('projectId')
    const category = req.nextUrl.searchParams.get('category')
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

    let query = db
      .from('project_files')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })

    if (category) query = query.eq('category', category)

    const { data, error } = await query
    if (error) {
      if (/relation .* does not exist/i.test(error.message)) {
        return NextResponse.json({ documents: [] })
      }
      throw error
    }

    // Real schema has no description/version — synthesize by grouping same-named files
    const byName: Record<string, number> = {}
    const docs = (data || []).map((r: Record<string, unknown>) => {
      const fname = (r.file_name as string) || ''
      byName[fname] = (byName[fname] || 0) + 1
      return {
        id: r.id,
        file_name: fname,
        file_url: r.file_url ?? '',
        file_size: r.file_size ?? 0,
        file_type: r.file_type ?? '',
        category: r.category ?? 'other',
        description: (r.folder as string) ?? '',
        version: byName[fname],
        created_at: r.created_at,
      }
    })
    return NextResponse.json({ documents: docs, source: 'project_files' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const projectId = formData.get('projectId') as string | null
    const category = (formData.get('category') as string) || 'other'
    const description = (formData.get('description') as string) || ''

    if (!file || !projectId) {
      return NextResponse.json({ error: 'file and projectId required' }, { status: 400 })
    }

    const db = createServerClient()

    // Ensure bucket exists
    const { error: bucketErr } = await db.storage.getBucket('documents')
    if (bucketErr) {
      await db.storage.createBucket('documents', { public: true })
    }

    const storagePath = `${user.tenantId}/${projectId}/documents/${category}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const bytes = await file.arrayBuffer()

    const { error: uploadError } = await db.storage.from('documents').upload(storagePath, bytes, { contentType: file.type })
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

    const { data: { publicUrl } } = db.storage.from('documents').getPublicUrl(storagePath)

    const { count } = await db
      .from('project_files')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .eq('file_name', file.name)

    const version = (count || 0) + 1

    const { data, error } = await db
      .from('project_files')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        file_name: file.name,
        file_url: publicUrl,
        file_size: file.size,
        file_type: file.type,
        category,
        folder: description,  // description stored as folder label (no description column)
        uploaded_by: user.id,
      })
      .select('*')
      .single()

    if (error) throw error
    const doc = {
      id: data.id,
      file_name: data.file_name,
      file_url: data.file_url,
      file_size: data.file_size,
      file_type: data.file_type,
      category: data.category,
      description: data.folder || '',
      version,
      created_at: data.created_at,
    }
    return NextResponse.json({ document: doc })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
