#!/usr/bin/env node
// Seed demo data — round 2: submittals, financial, drawings, photos, documents, RFIs.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
} catch {}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const TENANT = '692d8793-4d9f-4c43-a935-bf56cc637553'
const PROJECT = 'b8ab7fd9-0cc9-443f-b0c8-d8855dc99c3d'

async function seed(table, rows, label) {
  const { data, error } = await db.from(table).insert(rows).select('id')
  if (error) { console.log(`  [${label}] skipped: ${error.message}`); return 0 }
  console.log(`  [${label}] inserted ${data?.length || 0}`)
  return data?.length || 0
}

console.log(`Seed v2: tenant=${TENANT} project=${PROJECT}\n`)

// Submittals
await seed('submittals', [
  { tenant_id: TENANT, project_id: PROJECT, submittal_number: 'SUB-001', title: 'Structural Steel Shop Drawings', spec_section: '05 12 00', submittal_type: 'Shop Drawing', submitted_by: 'Iron Works LLC', trade: 'Structural', status: 'under_review', priority: 'high', due_date: '2026-04-22', revision_number: 0, description: 'Shop drawings for primary steel members and connections.' },
  { tenant_id: TENANT, project_id: PROJECT, submittal_number: 'SUB-002', title: 'HVAC Equipment Data', spec_section: '23 00 00', submittal_type: 'Product Data', submitted_by: 'Valley Mechanical', trade: 'HVAC', status: 'approved', priority: 'medium', due_date: '2026-04-10', revision_number: 0, description: 'Equipment submittal for RTUs and VAV boxes.' },
  { tenant_id: TENANT, project_id: PROJECT, submittal_number: 'SUB-003', title: 'Concrete Mix Design', spec_section: '03 30 00', submittal_type: 'Test Report', submitted_by: 'Rocky Mountain Concrete', trade: 'Concrete', status: 'approved', priority: 'high', due_date: '2026-03-20', revision_number: 1, description: '4500 PSI mix design with fly ash.' },
  { tenant_id: TENANT, project_id: PROJECT, submittal_number: 'SUB-004', title: 'Exterior Brick Sample', spec_section: '04 20 00', submittal_type: 'Sample', submitted_by: 'Desert Masonry', trade: 'Masonry', status: 'submitted', priority: 'medium', due_date: '2026-05-01', revision_number: 0, description: 'Physical sample for owner approval.' },
  { tenant_id: TENANT, project_id: PROJECT, submittal_number: 'SUB-005', title: 'Fire Sprinkler Hydraulic Calcs', spec_section: '21 13 00', submittal_type: 'Test Report', submitted_by: 'Southwest Fire', trade: 'Fire Protection', status: 'revise_and_resubmit', priority: 'high', due_date: '2026-04-15', revision_number: 1, description: 'Initial calcs rejected — insufficient flow at zone 3.', reviewer_notes: 'Increase riser size at zone 3; resubmit with revised calcs.' },
], 'submittals')

// Schedule of Values (for Financials page)
const sovLines = [
  { description: 'Site Mobilization & GCs', scheduled_value: 125000, prev_completed: 125000, this_period: 0 },
  { description: 'Earthwork & Excavation', scheduled_value: 280000, prev_completed: 280000, this_period: 0 },
  { description: 'Foundation Concrete', scheduled_value: 450000, prev_completed: 200000, this_period: 160000 },
  { description: 'Structural Steel', scheduled_value: 620000, prev_completed: 0, this_period: 0 },
  { description: 'MEP Rough-In', scheduled_value: 540000, prev_completed: 0, this_period: 0 },
  { description: 'Exterior Envelope', scheduled_value: 380000, prev_completed: 0, this_period: 0 },
  { description: 'Interior Finishes', scheduled_value: 310000, prev_completed: 0, this_period: 0 },
  { description: 'Bond & Insurance', scheduled_value: 45000, prev_completed: 45000, this_period: 0 },
].map((l, i) => {
  const total_completed = l.prev_completed + l.this_period
  return {
    tenant_id: TENANT, project_id: PROJECT,
    line_number: i + 1,
    description: l.description,
    scheduled_value: l.scheduled_value,
    prev_completed: l.prev_completed,
    this_period: l.this_period,
    stored_materials: 0,
    total_completed,
    percent_complete: l.scheduled_value > 0 ? (total_completed / l.scheduled_value) * 100 : 0,
    balance_to_finish: l.scheduled_value - total_completed,
    retainage: total_completed * 0.1,
  }
})
await seed('schedule_of_values', sovLines, 'schedule_of_values')

// Pay Applications
const contractSum = 2750000
await seed('pay_applications', [
  { tenant_id: TENANT, project_id: PROJECT, app_number: 1, period_from: '2026-03-01', period_to: '2026-03-31', status: 'certified', current_payment_due: 590000, total_retainage: 65000, original_contract_sum: contractSum, contract_sum_to_date: contractSum, submitted_at: '2026-04-01T00:00:00Z', certified_at: '2026-04-05T00:00:00Z' },
  { tenant_id: TENANT, project_id: PROJECT, app_number: 2, period_from: '2026-04-01', period_to: '2026-04-30', status: 'submitted', current_payment_due: 144000, total_retainage: 16000, original_contract_sum: contractSum, contract_sum_to_date: contractSum, submitted_at: '2026-05-01T00:00:00Z' },
], 'pay_applications')

// Change Orders
await seed('change_orders', [
  { tenant_id: TENANT, project_id: PROJECT, co_number: 1, title: 'Owner-directed concrete upgrade to 5000 PSI', amount: 28000, status: 'approved', description: 'Owner requested concrete PSI upgrade for parking deck.', created_at: '2026-03-22T00:00:00Z' },
  { tenant_id: TENANT, project_id: PROJECT, co_number: 2, title: 'Additional rebar per RFI-007', amount: 42500, status: 'approved', description: 'Engineer-directed additional rebar at perimeter footings.', created_at: '2026-04-02T00:00:00Z' },
  { tenant_id: TENANT, project_id: PROJECT, co_number: 3, title: 'Relocated east door per owner', amount: 8400, status: 'submitted', description: 'Owner change request to relocate east service door.', created_at: '2026-04-12T00:00:00Z' },
  { tenant_id: TENANT, project_id: PROJECT, co_number: 4, title: 'MEP coordination clash resolution', amount: 15600, status: 'pending', description: 'Coordination changes at mezzanine level.', created_at: '2026-04-18T00:00:00Z' },
], 'change_orders')

// Budget lines (for Financials page completeness)
await seed('budget_lines', [
  { tenant_id: TENANT, project_id: PROJECT, cost_code: '01-000', description: 'General Conditions', division: '01', category: 'indirect', original_budget: 175000, revised_budget: 175000, actual: 62000 },
  { tenant_id: TENANT, project_id: PROJECT, cost_code: '03-300', description: 'Cast-in-Place Concrete', division: '03', category: 'direct', original_budget: 450000, revised_budget: 478000, actual: 360000 },
  { tenant_id: TENANT, project_id: PROJECT, cost_code: '05-120', description: 'Structural Steel', division: '05', category: 'direct', original_budget: 620000, revised_budget: 620000, actual: 0 },
  { tenant_id: TENANT, project_id: PROJECT, cost_code: '23-000', description: 'HVAC', division: '23', category: 'direct', original_budget: 310000, revised_budget: 325600, actual: 0 },
], 'budget_lines')

// RFIs (for context — Sage can reference them)
await seed('rfis', [
  { tenant_id: TENANT, project_id: PROJECT, rfi_number: 'RFI-011', subject: 'Clarification on Grid Line B-3 beam elevation', question: 'Detail 5/S-201 shows elevation 124\'-6" but Section B shows 124\'-8". Please clarify.', status: 'open', priority: 'high', due_date: '2026-04-22', submitted_by: 'Chad Derocher' },
  { tenant_id: TENANT, project_id: PROJECT, rfi_number: 'RFI-012', subject: 'Waterproofing at planter boxes', question: 'Spec section 07 13 26 not called out on planter box detail 4/A-401. Is Henry 790-11 acceptable?', status: 'open', priority: 'medium', due_date: '2026-04-22', submitted_by: 'Chad Derocher' },
  { tenant_id: TENANT, project_id: PROJECT, rfi_number: 'RFI-013', subject: 'Exterior light fixture EL-3 discontinued', question: 'Manufacturer confirmed EL-3 discontinued. Proposing LightCorp model L-2200 as substitute. OK?', status: 'open', priority: 'low', due_date: '2026-04-22', submitted_by: 'Chad Derocher' },
], 'rfis')

// Drawings (with placeholder URL — real uploads would replace later)
const PLACEHOLDER = 'https://placehold.co/1100x850/16213e/d4a017/pdf?text=Drawing'
await seed('drawings', [
  { tenant_id: TENANT, project_id: PROJECT, name: 'Cover Sheet & Index', url: PLACEHOLDER + '+G-001', sheet_number: 'G-001', discipline: 'Architectural', version: '0', status: 'current' },
  { tenant_id: TENANT, project_id: PROJECT, name: 'Site Plan', url: PLACEHOLDER + '+C-100', sheet_number: 'C-100', discipline: 'Civil', version: '0', status: 'current' },
  { tenant_id: TENANT, project_id: PROJECT, name: 'Foundation Plan', url: PLACEHOLDER + '+S-100', sheet_number: 'S-100', discipline: 'Structural', version: '1', status: 'current' },
  { tenant_id: TENANT, project_id: PROJECT, name: 'Floor Plan - Level 1', url: PLACEHOLDER + '+A-101', sheet_number: 'A-101', discipline: 'Architectural', version: '0', status: 'current' },
  { tenant_id: TENANT, project_id: PROJECT, name: 'Floor Plan - Level 2', url: PLACEHOLDER + '+A-102', sheet_number: 'A-102', discipline: 'Architectural', version: '0', status: 'current' },
  { tenant_id: TENANT, project_id: PROJECT, name: 'Electrical Power Plan', url: PLACEHOLDER + '+E-201', sheet_number: 'E-201', discipline: 'Electrical', version: '0', status: 'current' },
  { tenant_id: TENANT, project_id: PROJECT, name: 'Plumbing Riser Diagram', url: PLACEHOLDER + '+P-301', sheet_number: 'P-301', discipline: 'Plumbing', version: '0', status: 'current' },
  { tenant_id: TENANT, project_id: PROJECT, name: 'HVAC Plan Level 1', url: PLACEHOLDER + '+M-101', sheet_number: 'M-101', discipline: 'MEP', version: '0', status: 'current' },
], 'drawings')

// Photos (placeholder images)
const photoUrls = [
  'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800',
  'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800',
  'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800',
  'https://images.unsplash.com/photo-1590736969955-71cc94901144?w=800',
  'https://images.unsplash.com/photo-1581094271901-8022df4466f9?w=800',
  'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=800',
]
await seed('photos', photoUrls.map((u, i) => ({
  tenant_id: TENANT, project_id: PROJECT,
  url: u,
  filename: `progress-${String(i + 1).padStart(3, '0')}.jpg`,
  mime_type: 'image/jpeg',
  file_size: 250000,
  caption: [
    'Site mobilization complete — trailer, fencing, signage in place',
    'Foundation excavation — east footings',
    'Rebar tied for foundation pour, grid B-C',
    'Concrete pour in progress — first lift complete',
    'Finished foundation, awaiting steel erection',
    'Panoramic view of site from north entrance',
  ][i],
  album: ['2026-03-05', '2026-03-20', '2026-04-01', '2026-04-10', '2026-04-18', '2026-04-19'][i],
  taken_at: ['2026-03-05', '2026-03-20', '2026-04-01', '2026-04-10', '2026-04-18', '2026-04-19'][i] + 'T14:30:00Z',
  category: 'Progress',
  tags: ['site', 'progress'],
})), 'photos')

// Project Files
await seed('project_files', [
  { tenant_id: TENANT, project_id: PROJECT, file_name: 'AIA A101 Owner-Contractor Agreement.pdf', file_url: 'https://example.com/files/a101.pdf', file_size: 380000, file_type: 'application/pdf', category: 'contracts' },
  { tenant_id: TENANT, project_id: PROJECT, file_name: 'Building Permit - BP-2026-0421.pdf', file_url: 'https://example.com/files/permit.pdf', file_size: 220000, file_type: 'application/pdf', category: 'permits' },
  { tenant_id: TENANT, project_id: PROJECT, file_name: 'Certificate of Insurance.pdf', file_url: 'https://example.com/files/coi.pdf', file_size: 180000, file_type: 'application/pdf', category: 'insurance' },
  { tenant_id: TENANT, project_id: PROJECT, file_name: 'Geotechnical Report - Mesa Commerce.pdf', file_url: 'https://example.com/files/geotech.pdf', file_size: 4200000, file_type: 'application/pdf', category: 'reports' },
  { tenant_id: TENANT, project_id: PROJECT, file_name: 'Soils Test Results - April.pdf', file_url: 'https://example.com/files/soils.pdf', file_size: 780000, file_type: 'application/pdf', category: 'reports' },
  { tenant_id: TENANT, project_id: PROJECT, file_name: 'Owner RFP Response.pdf', file_url: 'https://example.com/files/rfp.pdf', file_size: 1500000, file_type: 'application/pdf', category: 'correspondence' },
], 'project_files')

console.log('\nSeed v2 complete.')
