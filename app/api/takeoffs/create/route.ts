import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('tenant_id').eq('id', user.id).single()
    if (!profile?.tenant_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const tenantId = profile.tenant_id
    const body = await req.json()
    const { projectId, name, fileName, fileSizeBytes } = body

    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    if (!fileName)  return NextResponse.json({ error: 'fileName required' }, { status: 400 })

    // Verify project belongs to tenant
    const { data: project } = await supabase
      .from('projects').select('id, name, address, state, project_type, type')
      .eq('id', projectId).eq('tenant_id', tenantId).single()
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    // Create takeoff record
    const { data: takeoff, error } = await supabase
      .from('takeoffs')
      .insert({
        project_id:      projectId,
        tenant_id:       tenantId,
        name:            name || `Takeoff — ${new Date().toLocaleDateString()}`,
        status:          'uploading',
        file_name:       fileName,
        file_size_bytes: fileSizeBytes || null,
      })
      .select('id')
      .single()

    if (error || !takeoff) {
      return NextResponse.json({ error: error?.message || 'Insert failed' }, { status: 500 })
    }

    // Generate signed upload URL
    const storagePath = `${tenantId}/takeoffs/${takeoff.id}/${fileName}`
    const { data: uploadData, error: urlErr } = await supabase
      .storage
      .from('takeoffs')
      .createSignedUploadUrl(storagePath)

    if (urlErr || !uploadData) {
      return NextResponse.json({ error: `Storage URL failed: ${urlErr?.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: {
        takeoffId:   takeoff.id,
        uploadUrl:   uploadData.signedUrl,
        storagePath,
        token:       uploadData.token,
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : 'Failed') }, { status: 500 })
  }
}
