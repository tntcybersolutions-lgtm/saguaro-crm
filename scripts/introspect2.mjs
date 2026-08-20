#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
} catch {}

const tables = ['submittals','project_files','pay_applications','change_orders','schedule_of_values','budget_lines','contracts','rfis']
const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/?apikey=${process.env.SUPABASE_SERVICE_ROLE_KEY}`, {
  headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }
})
const spec = await res.json()
const defs = spec.definitions || {}
for (const t of tables) {
  const d = defs[t]
  if (!d) { console.log(`${t}: NOT FOUND`); continue }
  const required = d.required || []
  console.log(`\n=== ${t} ===`)
  for (const [col, meta] of Object.entries(d.properties || {})) {
    const req = required.includes(col) ? ' REQUIRED' : ''
    console.log(`  ${col}: ${meta.type || meta.format || '?'}${req}`)
  }
}
