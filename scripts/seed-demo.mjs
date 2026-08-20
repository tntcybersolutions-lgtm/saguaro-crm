#!/usr/bin/env node
// Seed demo data for Beat Procore modules.
// Real tenant + project ids (discovered via introspection).

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
} catch {}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('Missing env'); process.exit(1) }
const db = createClient(URL, KEY, { auth: { persistSession: false } })

const TENANT = '692d8793-4d9f-4c43-a935-bf56cc637553'
const PROJECT = 'b8ab7fd9-0cc9-443f-b0c8-d8855dc99c3d'

async function seed(table, rows, label) {
  const { data, error } = await db.from(table).insert(rows).select('id')
  if (error) { console.log(`  [${label}] skipped: ${error.message}`); return 0 }
  console.log(`  [${label}] inserted ${data?.length || 0}`)
  return data?.length || 0
}

console.log(`Seeding: tenant=${TENANT} project=${PROJECT}\n`)

await seed('schedule_tasks', [
  { tenant_id: TENANT, project_id: PROJECT, name: 'Site Mobilization', start_date: '2026-03-01', end_date: '2026-03-14', status: 'complete', trade: 'General' },
  { tenant_id: TENANT, project_id: PROJECT, name: 'Foundation Excavation', start_date: '2026-03-15', end_date: '2026-04-05', status: 'complete', trade: 'Concrete' },
  { tenant_id: TENANT, project_id: PROJECT, name: 'Foundation Pour', start_date: '2026-04-06', end_date: '2026-04-19', status: 'in_progress', trade: 'Concrete' },
  { tenant_id: TENANT, project_id: PROJECT, name: 'Structural Steel Erection', start_date: '2026-04-20', end_date: '2026-05-15', status: 'not_started', trade: 'Steel' },
  { tenant_id: TENANT, project_id: PROJECT, name: 'MEP Rough-In', start_date: '2026-05-16', end_date: '2026-06-20', status: 'not_started', trade: 'MEP' },
  { tenant_id: TENANT, project_id: PROJECT, name: 'Exterior Envelope', start_date: '2026-06-01', end_date: '2026-07-01', status: 'not_started', trade: 'Envelope' },
  { tenant_id: TENANT, project_id: PROJECT, name: 'Interior Drywall', start_date: '2026-06-20', end_date: '2026-07-20', status: 'not_started', trade: 'Drywall' },
  { tenant_id: TENANT, project_id: PROJECT, name: 'Finishes & Flooring', start_date: '2026-07-21', end_date: '2026-08-31', status: 'not_started', trade: 'Finishes' },
  { tenant_id: TENANT, project_id: PROJECT, name: 'Punch List & Closeout', start_date: '2026-09-01', end_date: '2026-09-20', status: 'not_started', trade: 'General' },
], 'schedule_tasks')

await seed('schedule_milestones', [
  { tenant_id: TENANT, project_id: PROJECT, title: 'NTP Issued', name: 'NTP Issued', milestone_type: 'contract', baseline_date: '2026-03-01', planned_start: '2026-03-01', planned_end: '2026-03-01', status: 'complete', completion_pct: 100 },
  { tenant_id: TENANT, project_id: PROJECT, title: 'Foundation Complete', name: 'Foundation Complete', milestone_type: 'phase', baseline_date: '2026-04-19', planned_start: '2026-04-19', planned_end: '2026-04-19', status: 'pending', completion_pct: 0 },
  { tenant_id: TENANT, project_id: PROJECT, title: 'Steel Topped Out', name: 'Steel Topped Out', milestone_type: 'phase', baseline_date: '2026-05-15', planned_start: '2026-05-15', planned_end: '2026-05-15', status: 'pending', completion_pct: 0 },
  { tenant_id: TENANT, project_id: PROJECT, title: 'Dry-In / Weather Tight', name: 'Dry-In / Weather Tight', milestone_type: 'phase', baseline_date: '2026-07-01', planned_start: '2026-07-01', planned_end: '2026-07-01', status: 'pending', completion_pct: 0 },
  { tenant_id: TENANT, project_id: PROJECT, title: 'Certificate of Occupancy', name: 'Certificate of Occupancy', milestone_type: 'closeout', baseline_date: '2026-09-20', planned_start: '2026-09-20', planned_end: '2026-09-20', status: 'pending', completion_pct: 0 },
], 'schedule_milestones')

await seed('punch_list', [
  { tenant_id: TENANT, project_id: PROJECT, item_number: 1, title: 'Touch-up paint on north wall', description: 'Multiple scuffs on Level 2 north corridor wall', location: 'Level 2, North Corridor', trade: 'Painting', assigned_to: 'Southwest Painting', due_date: '2026-04-25', priority: 'medium', status: 'open' },
  { tenant_id: TENANT, project_id: PROJECT, item_number: 2, title: 'HVAC diffuser loose at Grid B-4', description: 'Supply air diffuser rattling', location: 'Level 1, Conference Room', trade: 'HVAC', assigned_to: 'Valley Mechanical', due_date: '2026-04-22', priority: 'high', status: 'in_progress' },
  { tenant_id: TENANT, project_id: PROJECT, item_number: 3, title: 'Exterior caulking missing at east windows', description: '6 window locations on east elevation', location: 'East Elevation', trade: 'General', assigned_to: 'Desert Glass Co.', due_date: '2026-04-28', priority: 'high', status: 'open' },
  { tenant_id: TENANT, project_id: PROJECT, item_number: 4, title: 'Stair handrail loose at Level 3', description: 'Safety issue', location: 'Stair 2, Level 3', trade: 'General', assigned_to: 'Iron Works LLC', due_date: '2026-04-21', priority: 'high', status: 'open' },
  { tenant_id: TENANT, project_id: PROJECT, item_number: 5, title: 'Light switch cover missing Suite 210', description: 'Blank plate needed', location: 'Suite 210', trade: 'Electrical', assigned_to: 'Sunstate Electric', due_date: '2026-04-30', priority: 'low', status: 'open' },
  { tenant_id: TENANT, project_id: PROJECT, item_number: 6, title: 'Carpet seam separation Room 104', description: 'Carpet lifting at doorway', location: 'Room 104', trade: 'Flooring', assigned_to: 'AZ Flooring Pros', due_date: '2026-04-26', priority: 'medium', status: 'open' },
], 'punch_list')

await seed('safety_incidents', [
  { tenant_id: TENANT, project_id: PROJECT, description: 'Material bundle nearly fell from elevated platform. Operator caught it before impact. No injuries.', severity: 'medium', incident_date: '2026-04-10', location: 'Level 2 Deck', reported_by: 'Marcus Johnson', incident_type: 'near_miss', near_miss: true, osha_recordable: false, status: 'open', root_cause: 'Inadequate securing of material before lift', corrective_actions: 'Lifted materials secured; crew briefed on tie-off requirements' },
  { tenant_id: TENANT, project_id: PROJECT, description: 'Worker received minor laceration on right hand while cutting rebar. Treated on-site.', severity: 'low', incident_date: '2026-04-15', location: 'Foundation Area', reported_by: 'Site Foreman', incident_type: 'first_aid', first_aid_only: true, osha_recordable: false, status: 'closed', root_cause: 'Improper tool use, no gloves', corrective_actions: 'Gloves mandatory for rebar operations' },
], 'safety_incidents')

await seed('safety_talks', [
  { tenant_id: TENANT, project_id: PROJECT, title: 'Fall Protection', content: 'Reviewed 100% tie-off policy above 6 ft. Demonstrated proper harness inspection.', conducted_at: '2026-04-14T08:00:00Z' },
  { tenant_id: TENANT, project_id: PROJECT, title: 'Struck-By Hazards', content: 'Covered exclusion zones, hard hat requirements, and spotter responsibilities.', conducted_at: '2026-04-07T08:00:00Z' },
  { tenant_id: TENANT, project_id: PROJECT, title: 'Heat Illness Prevention', content: 'Reviewed hydration, rest breaks, and signs of heat exhaustion. Arizona heat protocol activated.', conducted_at: '2026-03-31T08:00:00Z' },
], 'safety_talks')

await seed('equipment', [
  { tenant_id: TENANT, project_id: PROJECT, name: '50-Ton Grove Crane', equipment_type: 'Crane', make: 'Grove', model: 'GMK3055', year: 2021, serial_number: 'GMK-21-48291', status: 'in_use', location: 'Mesa Commerce Center Site' },
  { tenant_id: TENANT, name: 'Cat 320 Excavator', equipment_type: 'Excavator', make: 'Caterpillar', model: '320D', year: 2019, serial_number: 'CAT-319-00843', status: 'available', location: 'Company Yard' },
  { tenant_id: TENANT, project_id: PROJECT, name: 'Skid Steer #2', equipment_type: 'Skid Steer', make: 'Bobcat', model: 'S650', year: 2020, serial_number: 'BOB-S650-7743', status: 'in_use', location: 'Mesa Commerce Center Site' },
  { tenant_id: TENANT, name: 'Man Lift 40ft', equipment_type: 'Scissor Lift', make: 'JLG', model: '4069LE', year: 2022, serial_number: 'JLG-4069-1122', status: 'available', location: 'Company Yard' },
  { tenant_id: TENANT, project_id: PROJECT, name: 'Generator 60KW', equipment_type: 'Generator', make: 'Generac', model: 'SG060', year: 2020, serial_number: 'GEN-060-5512', status: 'in_use', location: 'Mesa Commerce Center Site' },
], 'equipment')

await seed('meetings', [
  {
    tenant_id: TENANT, project_id: PROJECT, meeting_number: 4, meeting_type: 'OAC',
    title: 'OAC Meeting #4 — Mesa Commerce Center',
    meeting_date: '2026-04-14', location: 'Project Site Trailer', facilitator_name: 'Chad Derocher',
    agenda: '1. Schedule update\n2. CO-003 discussion\n3. RFI log\n4. Safety report\n5. 2-week look-ahead',
    notes: 'Schedule reviewed — foundation pour is 80% complete. CO-003 for additional rebar approved at $42,500.',
    minutes_text: 'Foundation pour 80% complete. CO-003 approved: $42,500. 3 open RFIs need architect response by April 22.',
    distributed_to: ['chad@tnt.com', 'mark@owner.com', 'sarah@architect.com'],
    status: 'complete',
  },
], 'meetings')

console.log('\nSeed complete.')
