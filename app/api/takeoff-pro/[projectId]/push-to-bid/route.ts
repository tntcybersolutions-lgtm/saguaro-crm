import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CSI_TITLES: Record<string, string> = {
  '03': 'Concrete',
  '04': 'Masonry',
  '05': 'Metals',
  '06': 'Carpentry & Framing',
  '07': 'Waterproofing & Insulation',
  '08': 'Doors, Frames & Hardware',
  '09': 'Drywall, Tile & Painting',
  '21': 'Fire Suppression',
  '22': 'Plumbing',
  '23': 'HVAC & Mechanical',
  '26': 'Electrical',
  '27': 'Low Voltage & Data',
  '31': 'Site Work & Earthwork',
  '32': 'Paving & Landscaping',
  '33': 'Utilities',
}

interface LineItem {
  csi_division: string | null
  csi_code: string | null
  description: string | null
  quantity: number | null
  unit: string | null
  adjusted_quantity: number | null
  unit_material_cost: number | null
  unit_labor_cost: number | null
  total_material: number | null
  total_labor: number | null
  total_equipment: number | null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId, userId } = auth
  const { projectId } = await params

  const { takeoffId, selectedDivisions } = (await req.json()) as {
    takeoffId?: string
    selectedDivisions?: string[] | null
  }
  if (!takeoffId) {
    return NextResponse.json({ error: 'takeoffId required' }, { status: 400 })
  }

  const { data: takeoff } = await supabase
    .from('takeoffs')
    .select('id, projects(name, address)')
    .eq('id', takeoffId)
    .eq('tenant_id', tenantId)
    .single()
  if (!takeoff) {
    return NextResponse.json({ error: 'Takeoff not found' }, { status: 404 })
  }

  const { data: items } = await supabase
    .from('takeoff_line_items')
    .select('*')
    .eq('takeoff_id', takeoffId)
    .eq('tenant_id', tenantId)
    .order('csi_division')

  const lineItems: LineItem[] = (items as LineItem[] | null) || []
  const projectName =
    (takeoff.projects as { name?: string } | null)?.name || 'Project'

  const grouped: Record<string, LineItem[]> = {}
  for (const item of lineItems) {
    const div = (item.csi_division || '01').slice(0, 2)
    if (selectedDivisions && !selectedDivisions.includes(div)) continue
    if (!grouped[div]) grouped[div] = []
    grouped[div].push(item)
  }

  const { count } = await supabase
    .from('bid_packages')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)

  const createdPackages: Array<{ id: string; name: string; value: number }> = []
  let pkgNum = (count || 0) + 1

  for (const [div, divItems] of Object.entries(grouped)) {
    const tradeName = CSI_TITLES[div] || `Division ${div}`
    const scopeValue = divItems.reduce(
      (s, i) =>
        s +
        (Number(i.total_material) || 0) +
        (Number(i.total_labor) || 0) +
        (Number(i.total_equipment) || 0),
      0,
    )

    if (scopeValue < 100) continue

    const scopeLines = divItems
      .map(
        (i) =>
          `• ${i.description}: ${Number(i.adjusted_quantity ?? i.quantity ?? 0).toLocaleString()} ${i.unit ?? ''} @ $${Number(i.unit_material_cost || 0).toFixed(2)}/${i.unit ?? ''} mat + $${Number(i.unit_labor_cost || 0).toFixed(2)}/${i.unit ?? ''} labor`,
      )
      .join('\n')

    const packageNumber = String(pkgNum).padStart(3, '0')

    console.log(
      '[PUSH-TO-BID] Creating package for division',
      div,
      'trade:',
      tradeName,
      'takeoffId:',
      takeoffId,
      'value:',
      scopeValue,
    )

    const { data: pkg, error: insertError } = await supabase
      .from('bid_packages')
      .insert({
        tenant_id: tenantId,
        project_id: projectId,
        package_number: packageNumber,
        name: `${tradeName} — Pkg ${packageNumber}`,
        trade: tradeName,
        csi_division: div,
        csi_codes: divItems.map((i) => i.csi_code).filter(Boolean),
        description: 'AI-generated bid package from takeoff analysis',
        scope_of_work: scopeLines,
        scope_narrative: `This package covers all ${tradeName.toLowerCase()} scope for ${projectName}. Quantities and materials are derived from AI blueprint analysis and should be verified by the bidding contractor.`,
        budget_estimate: scopeValue,
        estimated_value: scopeValue,
        status: 'draft',
        takeoff_id: takeoffId,
        takeoff_division_data: divItems,
        ai_generated: true,
        ai_generated_at: new Date().toISOString(),
        ai_model_used: 'claude-sonnet-4-20250514',
        created_by: userId,
      })
      .select()
      .single()

    if (insertError) {
      console.error(
        '[PUSH-TO-BID] Insert failed for division',
        div,
        ':',
        insertError.message,
      )
    }

    if (pkg) {
      console.log(
        '[PUSH-TO-BID] Created package',
        pkg.id,
        'takeoff_id saved as:',
        pkg.takeoff_id,
      )
      createdPackages.push({
        id: pkg.id as string,
        name: pkg.name as string,
        value: scopeValue,
      })
      pkgNum++
    }
  }

  if (createdPackages[0]) {
    await supabase
      .from('takeoffs')
      .update({ bid_package_id: createdPackages[0].id })
      .eq('id', takeoffId)
      .eq('tenant_id', tenantId)
  }

  // ── AUTO-GENERATE FULL BID JACKET FOR ALL CREATED PACKAGES ─────────
  // Fire and don't await — jacket generation is async and takes ~60 seconds.
  // The client polls bid_packages.jacket_sections to detect completion.
  if (createdPackages.length > 0) {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net'
    fetch(`${baseUrl}/api/takeoff-pro/${projectId}/generate-full-jacket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: req.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        takeoffId,
        bidPackageIds: createdPackages.map((p) => p.id),
      }),
    }).catch((err) => console.error('[push-to-bid] jacket gen error:', err))
  }

  return NextResponse.json({
    success: true,
    packages_created: createdPackages.length,
    packages: createdPackages,
    jacket_generating: createdPackages.length > 0,
  })
}
