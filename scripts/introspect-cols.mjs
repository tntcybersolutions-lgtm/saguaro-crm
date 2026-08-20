#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

try {
  const envPath = resolve(process.cwd(), '.env.local')
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
} catch {}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const tables = ['schedule_tasks','safety_incidents','safety_talks','equipment','meetings','drawings','photos','drawing_markups']

// Fallback: fetch PostgREST OpenAPI
try {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/?apikey=${process.env.SUPABASE_SERVICE_ROLE_KEY}`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }
  })
  const spec = await res.json()
  const defs = spec.definitions || spec.components?.schemas || {}
  for (const t of tables) {
    const d = defs[t]
    if (!d) { console.log(`${t}: not in spec`); continue }
    const props = d.properties || {}
    const required = d.required || []
    console.log(`\n=== ${t} ===`)
    for (const [col, meta] of Object.entries(props)) {
      const req = required.includes(col) ? ' REQUIRED' : ''
      console.log(`  ${col}: ${meta.type || meta.format || '?'}${req}`)
    }
  }
} catch (e) {
  console.log('openapi error:', e.message)
}
