import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const db = await createServerClient()

  const { data: pkg, error } = await db
    .from('bid_packages')
    .select('id, name, description, scope_summary, project_id, tenant_id, bid_due_date, walkthrough_date, sub_portal_enabled, sub_portal_expires_at, projects(name, address)')
    .eq('sub_portal_token', token)
    .single()

  if (error || !pkg) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  if (!pkg.sub_portal_enabled) return NextResponse.json({ error: 'This bid portal has been deactivated' }, { status: 403 })
  if (pkg.sub_portal_expires_at && new Date(pkg.sub_portal_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This bid invitation has expired' }, { status: 410 })
  }

  const project = pkg.projects as unknown as { name?: string; address?: string } | null
  return NextResponse.json({
    package: {
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      scope_summary: pkg.scope_summary,
      bid_due_date: pkg.bid_due_date,
      walkthrough_date: pkg.walkthrough_date,
      project_name: project?.name || '',
      project_address: project?.address || '',
    },
  })
}
