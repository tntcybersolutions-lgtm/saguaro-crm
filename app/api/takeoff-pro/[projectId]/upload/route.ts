import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

const VALID_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]
const MAX_SIZE = 50 * 1024 * 1024

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} bytes`
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { projectId } = await params

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!VALID_TYPES.includes(file.type)) {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      if (ext === 'dwg' || ext === 'dxf') {
        return NextResponse.json(
          {
            error: `${ext.toUpperCase()} files are not yet supported. Export as PDF from AutoCAD and upload that instead.`,
          },
          { status: 400 },
        )
      }
      return NextResponse.json(
        {
          error: `Unsupported file type "${file.type || ext}". Accepted: PDF, PNG, JPG, WebP.`,
        },
        { status: 400 },
      )
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        {
          error: `File is too large (${formatSize(file.size)}). Maximum size is ${formatSize(MAX_SIZE)}.`,
        },
        { status: 400 },
      )
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .eq('tenant_id', tenantId)
      .single()
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { data: takeoff, error: takeoffErr } = await supabase
      .from('takeoffs')
      .insert({
        project_id: projectId,
        tenant_id: tenantId,
        name: `Takeoff — ${new Date().toLocaleDateString()}`,
        status: 'uploading',
        file_name: file.name,
        file_size: file.size,
      })
      .select('id')
      .single()

    if (takeoffErr || !takeoff) {
      return NextResponse.json(
        { error: takeoffErr?.message || 'Could not create takeoff' },
        { status: 500 },
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const storagePath = `${projectId}/blueprints/${takeoff.id}/blueprint.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('blueprints')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      })
    if (uploadError) {
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 },
      )
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('blueprints').getPublicUrl(storagePath)

    await supabase
      .from('takeoffs')
      .update({
        file_url: publicUrl,
        file_name: file.name,
        storage_path: storagePath,
        file_type: file.type,
        file_size: file.size,
        status: 'uploaded',
      })
      .eq('id', takeoff.id)
      .eq('tenant_id', tenantId)

    return NextResponse.json({
      takeoffId: takeoff.id,
      fileUrl: publicUrl,
      fileName: file.name,
      fileSize: file.size,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
