#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

try {
  const envPath = resolve(process.cwd(), '.env.local')
  const contents = readFileSync(envPath, 'utf8')
  for (const line of contents.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
} catch {}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const db = createClient(URL, KEY, { auth: { persistSession: false } })

async function cols(table) {
  // Try empty insert to force column error OR just select one row
  const { data, error } = await db.from(table).select('*').limit(1)
  if (error) {
    console.log(`${table}: ERROR — ${error.message}`)
    return
  }
  if (data && data.length > 0) {
    console.log(`${table}: columns = ${Object.keys(data[0]).join(', ')}`)
  } else {
    console.log(`${table}: EXISTS but empty. Inserting a probe to discover columns...`)
    const { error: err2 } = await db.from(table).insert({}).select().single()
    console.log(`  probe error: ${err2?.message || 'none'}`)
  }
}

const tables = [
  'schedule_tasks', 'schedule_milestones', 'punch_list', 'safety_incidents',
  'safety_talks', 'equipment', 'meetings', 'drawings', 'photos', 'project_files',
  'drawing_markups', 'projects', 'tenants',
]

for (const t of tables) {
  await cols(t)
}

// Find a real tenant and project
const { data: tenants } = await db.from('tenants').select('id, name').limit(3)
console.log('\nTenants:', tenants)
const { data: projects } = await db.from('projects').select('id, name, tenant_id').limit(5)
console.log('Projects:', projects)
