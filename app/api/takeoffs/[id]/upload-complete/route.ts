import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { extractTakeoffFromPDF } from '@/lib/takeoff-engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for large plan sets

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('tenant_id').eq('id', user.id).single()
    if (!profile?.tenant_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const tenantId = profile.tenant_id
    const body = await req.json()
    const { storagePath } = body

    // Load takeoff + project
    const { data: takeoff } = await supabase
      .from('takeoffs')
      .select('*, projects(id, name, address, state, project_type, type, square_footage)')
      .eq('id', params.id).eq('tenant_id', tenantId).single()

    if (!takeoff) return NextResponse.json({ error: 'Takeoff not found' }, { status: 404 })

    const project = takeoff.projects as Record<string, unknown>

    // Update file path
    await supabase.from('takeoffs').update({
      file_storage_path: storagePath,
      status: 'processing',
      processing_started_at: new Date().toISOString(),
    }).eq('id', params.id).eq('tenant_id', tenantId)

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })

    // Fire async extraction — do NOT await, returns immediately
    // SSE stream route handles progress
    extractTakeoffFromPDF(
      supabase,
      params.id,
      tenantId,
      String(project?.id || takeoff.project_id),
      storagePath,
      {
        name:          String(project?.name || 'Project'),
        state:         project?.state ? String(project.state) : 'Arizona',
        type:          String(project?.project_type || project?.type || 'Commercial'),
        square_footage: project?.square_footage ? Number(project.square_footage) : null,
      },
      apiKey,
      async (message: string, pct: number) => {
        // Update progress in DB so SSE stream can read it
        await supabase.from('takeoffs').update({
          progress_pct: pct,
          pages_processed: Math.round(pct / 8), // rough estimate
        }).eq('id', params.id).eq('tenant_id', tenantId)
        console.log(`[takeoff ${params.id}] ${pct}% — ${message}`)
      }
    ).catch(err => console.error('[upload-complete] extraction error:', err))

    return NextResponse.json({
      success: true,
      message: 'Extraction started — connect to stream endpoint for live progress',
      data: { takeoffId: params.id, streamUrl: `/api/takeoffs/${params.id}/stream` },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : 'Failed') }, { status: 500 })
  }
}
