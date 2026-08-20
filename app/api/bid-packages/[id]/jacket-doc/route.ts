import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { id } = await params

  const { searchParams } = new URL(req.url)
  const docId = searchParams.get('doc')

  const { data: pkg, error } = await supabase
    .from('bid_packages')
    .select('jacket_sections, name, jacket_generated_at, jacket_version')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (error || !pkg) {
    return NextResponse.json(
      { error: 'Bid package not found' },
      { status: 404 },
    )
  }

  const p = pkg as {
    name?: string
    jacket_generated_at?: string | null
    jacket_version?: number
    jacket_sections?: unknown
  }

  const raw = p.jacket_sections

  if (!raw) {
    if (!docId) {
      return NextResponse.json({
        package_name: p.name || '',
        generated_at: null,
        version: p.jacket_version || 0,
        documents: [],
        status: 'not_generated',
        message:
          'Bid jacket has not been generated yet. Go to Takeoff → Push to Bid to generate.',
      })
    }
    return NextResponse.json(
      {
        error: 'Bid jacket not generated yet',
        status: 'not_generated',
      },
      { status: 404 },
    )
  }

  const sections: Record<string, string> =
    typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, string>)
      : {}

  if (Object.keys(sections).length === 0) {
    if (!docId) {
      return NextResponse.json({
        package_name: p.name || '',
        generated_at: p.jacket_generated_at || null,
        version: p.jacket_version || 0,
        documents: [],
        status: 'empty',
        message:
          'Bid jacket generation ran but produced no documents. Please regenerate.',
      })
    }
    return NextResponse.json(
      {
        error: 'No documents found in bid jacket. Please regenerate.',
        status: 'empty',
      },
      { status: 404 },
    )
  }

  if (docId) {
    const html = sections[docId]
    if (!html) {
      return NextResponse.json(
        {
          error: `Document '${docId}' not found`,
          available: Object.keys(sections),
        },
        { status: 404 },
      )
    }
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  return NextResponse.json({
    package_name: p.name || '',
    generated_at: p.jacket_generated_at || null,
    version: p.jacket_version || 0,
    status: 'ready',
    documents: Object.keys(sections).map((key) => ({
      id: key,
      title: key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase()),
      url: `/api/bid-packages/${id}/jacket-doc?doc=${key}`,
    })),
  })
}
