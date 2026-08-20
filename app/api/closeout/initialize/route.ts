import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

const STANDARD_CLOSEOUT_ITEMS: Array<{ category: string; title: string; required_from: string; sort_order: number }> = [
  // O&M Manuals
  { category: 'om_manuals', title: 'HVAC System O&M Manual',            required_from: 'HVAC Subcontractor',         sort_order: 1 },
  { category: 'om_manuals', title: 'Electrical System O&M Manual',      required_from: 'Electrical Subcontractor',    sort_order: 2 },
  { category: 'om_manuals', title: 'Plumbing System O&M Manual',        required_from: 'Plumbing Subcontractor',      sort_order: 3 },
  { category: 'om_manuals', title: 'Fire Suppression O&M Manual',       required_from: 'Fire Sprinkler Subcontractor',sort_order: 4 },
  // Warranties
  { category: 'warranties', title: 'Roofing Warranty (10-Year)',        required_from: 'Roofing Subcontractor',       sort_order: 10 },
  { category: 'warranties', title: 'HVAC Equipment Warranty',           required_from: 'HVAC Subcontractor',          sort_order: 11 },
  { category: 'warranties', title: 'Contractor 1-Year General Warranty',required_from: 'General Contractor',          sort_order: 12 },
  { category: 'warranties', title: 'Glazing/Window Warranty',           required_from: 'Glass & Glazing Sub',          sort_order: 13 },
  { category: 'warranties', title: 'Flooring Warranty',                 required_from: 'Flooring Subcontractor',      sort_order: 14 },
  // As-Builts
  { category: 'as_builts',  title: 'Architectural As-Built Drawings',   required_from: 'Architect',                   sort_order: 20 },
  { category: 'as_builts',  title: 'MEP As-Built Drawings',             required_from: 'MEP Engineer',                sort_order: 21 },
  { category: 'as_builts',  title: 'Civil/Site As-Built Drawings',      required_from: 'Civil Engineer',              sort_order: 22 },
  { category: 'as_builts',  title: 'Fire Alarm As-Built Drawings',      required_from: 'Fire Alarm Sub',              sort_order: 23 },
  // Certificates
  { category: 'certificates', title: 'Certificate of Occupancy',            required_from: 'Building Department',    sort_order: 30 },
  { category: 'certificates', title: 'Final Building Inspection Sign-Off',  required_from: 'Building Inspector',     sort_order: 31 },
  { category: 'certificates', title: 'Fire Marshal Final Inspection',       required_from: 'Fire Department',        sort_order: 32 },
  { category: 'certificates', title: 'Elevator Inspection Certificate',     required_from: 'State Elevator Inspector',sort_order: 33 },
  // Lien Waivers
  { category: 'lien_waivers', title: 'Final Unconditional Lien Waivers — All Subs', required_from: 'All Subcontractors', sort_order: 40 },
  { category: 'lien_waivers', title: 'Final Unconditional Lien Waiver — Contractor', required_from: 'General Contractor', sort_order: 41 },
  // Attic Stock
  { category: 'attic_stock', title: 'Spare Flooring (2% Attic Stock)',       required_from: 'Flooring Subcontractor',  sort_order: 50 },
  { category: 'attic_stock', title: 'Spare Ceiling Tiles (2% Attic Stock)',  required_from: 'Ceiling Subcontractor',   sort_order: 51 },
  { category: 'attic_stock', title: 'Spare Filters — HVAC',                  required_from: 'HVAC Subcontractor',      sort_order: 52 },
  // Training
  { category: 'training', title: 'Owner/Operator Training — Building Systems', required_from: 'HVAC Subcontractor',    sort_order: 60 },
  { category: 'training', title: 'Fire Alarm System Training',                 required_from: 'Fire Alarm Sub',        sort_order: 61 },
  // Final Submissions
  { category: 'final_submissions', title: 'Final Application for Payment (AIA G702)', required_from: 'General Contractor', sort_order: 70 },
  { category: 'final_submissions', title: 'Completed Punch List',                     required_from: 'General Contractor', sort_order: 71 },
  { category: 'final_submissions', title: 'Commissioning Reports',                    required_from: 'Commissioning Agent', sort_order: 72 },
]

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const { projectId } = await req.json()
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const { data: project } = await supabase
    .from('projects')
    .select('name, building_type, end_date, substantial_completion_date')
    .eq('id', projectId)
    .single()

  // Guard: do not re-initialize if items already exist
  const { count } = await supabase
    .from('closeout_items')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
  if ((count || 0) > 0) {
    return NextResponse.json({ success: true, message: 'Closeout items already exist', existing: count })
  }

  const dueDate = project?.end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Create closeout_packages row (NOT NULL: tenant_id, project_id, package_name)
  const { data: pkg } = await supabase
    .from('closeout_packages')
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      package_name: `${project?.name || 'Project'} — Closeout Package`,
      status: 'active',
      pct_complete: 0,
      modules: {
        om_manuals: 0,
        warranties: 0,
        as_builts: 0,
        certificates: 0,
        lien_waivers: 0,
        attic_stock: 0,
      },
      is_active: true,
    })
    .select('id')
    .single()

  // Insert all standard items into closeout_items
  const items = STANDARD_CLOSEOUT_ITEMS.map((item) => ({
    tenant_id: tenantId,
    project_id: projectId,
    category: item.category,
    title: item.title,
    description: `Required for project closeout — ${item.required_from}`,
    required_from: item.required_from,
    status: 'pending',
    due_date: dueDate,
    reminder_count: 0,
  }))

  const { error: itemsErr } = await supabase.from('closeout_items').insert(items)
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 })

  // AI-augmented building-type-specific additions
  if (project?.building_type) {
    try {
      const client = new Anthropic()
      const aiMsg = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: 'Return ONLY valid JSON array, no markdown.',
        messages: [{
          role: 'user',
          content: `For a ${project.building_type} building construction project, list 3-5 additional closeout items beyond standard. Return JSON: [{"category": "string", "title": "string", "required_from": "string"}]`,
        }],
      })
      const raw = aiMsg.content[0]?.type === 'text'
        ? aiMsg.content[0].text.replace(/```json\n?|\n?```/g, '').trim()
        : '[]'
      const additionalItems = JSON.parse(raw)
      if (Array.isArray(additionalItems) && additionalItems.length > 0) {
        await supabase.from('closeout_items').insert(
          additionalItems.map((item: Record<string, unknown>) => ({
            tenant_id: tenantId,
            project_id: projectId,
            category: String(item.category || 'other'),
            title: String(item.title || 'Closeout Item'),
            required_from: String(item.required_from || ''),
            status: 'pending',
            due_date: dueDate,
            reminder_count: 0,
          })),
        )
      }
    } catch {
      // AI optional — skip if it fails
    }
  }

  return NextResponse.json({ success: true, packageId: pkg?.id, itemsCreated: items.length })
}
