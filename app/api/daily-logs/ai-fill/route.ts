import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const { projectId, voiceTranscript, logDate } = await req.json()
  if (!projectId || !voiceTranscript) {
    return NextResponse.json({ error: 'projectId and voiceTranscript required' }, { status: 400 })
  }

  const today = logDate || new Date().toISOString().split('T')[0]

  const { data: project } = await supabase
    .from('projects')
    .select('name, address, city, state, building_type')
    .eq('id', projectId)
    .single()

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const { data: yesterdayLog } = await supabase
    .from('daily_logs')
    .select('manpower_detail, crew_count, superintendent_name, phase_of_work')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .eq('log_date', yesterday.toISOString().split('T')[0])
    .maybeSingle()

  let weatherData: Record<string, unknown> | null = null
  const locationQuery = project?.city
    ? `${project.city},${project.state}`
    : project?.address || 'Phoenix,AZ'
  try {
    const wttrRes = await fetch(
      `https://wttr.in/${encodeURIComponent(locationQuery)}?format=j1`,
      { signal: AbortSignal.timeout(5000) },
    )
    if (wttrRes.ok) {
      const wttr = await wttrRes.json()
      const current = wttr.current_condition?.[0]
      if (current) {
        weatherData = {
          temp_f: current.temp_F,
          conditions: current.weatherDesc?.[0]?.value || 'Clear',
          wind_mph: current.windspeedMiles,
          humidity: current.humidity,
          feels_like_f: current.FeelsLikeF,
        }
      }
    }
  } catch {
    console.log('[AI-FILL] Weather API unavailable, using transcript data')
  }

  const client = new Anthropic()

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `You are a construction daily report assistant. Extract structured data from a superintendent's voice note.
Return ONLY valid JSON matching the exact structure requested. No markdown, no explanation.`,
    messages: [{
      role: 'user',
      content: `Extract daily report data from this superintendent's voice note for ${project?.name || 'Project'} on ${today}.

VOICE TRANSCRIPT:
"${voiceTranscript}"

LIVE WEATHER (from API, use these values):
${weatherData ? `Temperature: ${weatherData.temp_f}°F, Conditions: ${weatherData.conditions}, Wind: ${weatherData.wind_mph} mph, Humidity: ${weatherData.humidity}%` : 'Not available — extract from transcript if mentioned'}

YESTERDAY'S CREW (use as default if not mentioned in transcript):
${yesterdayLog?.manpower_detail ? JSON.stringify(yesterdayLog.manpower_detail) : 'None — first day on site'}

Return this exact JSON structure:
{
  "superintendent_name": "string or null",
  "crew_count": number,
  "phase_of_work": "string describing current phase",
  "pct_complete_estimate": number (0-100) or null,
  "work_performed": "detailed paragraph of work done today",
  "activities": "bullet summary of key activities",
  "weather": "sunny|cloudy|rainy|stormy|clear",
  "high_temp": "string like '95°F'",
  "low_temp": "string like '72°F'",
  "precipitation": "none|light_rain|heavy_rain|snow",
  "wind_conditions": "calm|breezy|windy|severe",
  "delays": "description of any delays or null",
  "delay_type": "weather|material|labor|equipment|design|owner|none",
  "delay_hours": number (0 if no delays),
  "work_stopped": boolean,
  "work_stopped_reason": "string or null",
  "materials_delivered": "description of materials received or null",
  "equipment": "equipment on site summary or null",
  "safety_notes": "any safety observations or null",
  "incidents": "any incidents or null",
  "visitors": "any visitors mentioned or null",
  "notes": "any other notes worth capturing",
  "manpower_detail": [{"trade": "string", "company": "string", "headcount": number, "hours": number}]
}`,
    }],
  })

  const raw = msg.content[0]?.type === 'text' ? msg.content[0].text.replace(/```json\n?|\n?```/g, '').trim() : '{}'
  let extracted: Record<string, unknown> = {}
  try { extracted = JSON.parse(raw) } catch { /* use empty object */ }

  if (weatherData) {
    extracted.high_temp = extracted.high_temp || `${weatherData.temp_f}°F`
    if (!extracted.weather) {
      const cond = String(weatherData.conditions || '').toLowerCase()
      extracted.weather = cond.includes('rain') ? 'rainy' : cond.includes('cloud') ? 'cloudy' : 'sunny'
    }
  }

  const manpowerDetail = Array.isArray(extracted.manpower_detail) ? extracted.manpower_detail : []

  const logInsert: Record<string, unknown> = {
    tenant_id: tenantId,
    project_id: projectId,
    log_date: today,
    status: 'draft',
    ai_populated: true,
    ai_populated_at: new Date().toISOString(),
    voice_transcript: voiceTranscript,
    weather_source: weatherData ? 'api' : 'transcript',
    weather_api_data: weatherData || {},
    superintendent_name: extracted.superintendent_name || yesterdayLog?.superintendent_name || null,
    crew_count: Number(extracted.crew_count) || 0,
    manpower_count: Number(extracted.crew_count) || 0,
    manpower_detail: manpowerDetail.length > 0 ? manpowerDetail : (yesterdayLog?.manpower_detail || []),
    phase_of_work: String(extracted.phase_of_work || yesterdayLog?.phase_of_work || ''),
    pct_complete_estimate: extracted.pct_complete_estimate != null ? Number(extracted.pct_complete_estimate) : null,
    work_performed: String(extracted.work_performed || ''),
    activities: String(extracted.activities || ''),
    weather: String(extracted.weather || ''),
    high_temp: String(extracted.high_temp || ''),
    low_temp: String(extracted.low_temp || ''),
    precipitation: String(extracted.precipitation || 'none'),
    wind_conditions: String(extracted.wind_conditions || 'calm'),
    delays: extracted.delays ? String(extracted.delays) : null,
    delay_type: String(extracted.delay_type || 'none'),
    delay_hours: Number(extracted.delay_hours) || 0,
    work_stopped: Boolean(extracted.work_stopped),
    work_stopped_reason: extracted.work_stopped_reason ? String(extracted.work_stopped_reason) : null,
    materials_delivered: extracted.materials_delivered ? String(extracted.materials_delivered) : null,
    equipment: extracted.equipment ? String(extracted.equipment) : null,
    safety_notes: extracted.safety_notes ? String(extracted.safety_notes) : null,
    incidents: extracted.incidents ? String(extracted.incidents) : null,
    visitors: extracted.visitors ? String(extracted.visitors) : null,
    notes: extracted.notes ? String(extracted.notes) : null,
  }

  const { data: existing } = await supabase
    .from('daily_logs')
    .select('id')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .eq('log_date', today)
    .eq('status', 'draft')
    .maybeSingle()

  let logId: string
  if (existing?.id) {
    await supabase.from('daily_logs').update(logInsert).eq('tenant_id', tenantId).eq('id', existing.id)
    logId = existing.id
  } else {
    const { data: newLog, error: logErr } = await supabase
      .from('daily_logs')
      .insert(logInsert)
      .select('id')
      .single()
    if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 })
    logId = newLog!.id
  }

  if (manpowerDetail.length > 0 && logId) {
    await supabase.from('daily_log_crew').delete().eq('daily_log_id', logId)
    await supabase.from('daily_log_crew').insert(
      manpowerDetail.map((m: Record<string, unknown>) => ({
        daily_log_id: logId,
        trade: String(m.trade || 'General'),
        company: String(m.company || ''),
        headcount: Number(m.headcount) || 1,
        hours: Number(m.hours) || 8,
      })),
    )
  }

  if (logId) {
    await supabase.from('daily_log_weather').delete().eq('daily_log_id', logId)
    await supabase.from('daily_log_weather').insert({
      daily_log_id: logId,
      time_of_day: 'morning',
      temperature_f: weatherData ? Number(weatherData.temp_f) : null,
      conditions: extracted.weather ? String(extracted.weather) : null,
      wind_speed_mph: weatherData ? Number(weatherData.wind_mph) : null,
      humidity_pct: weatherData ? Number(weatherData.humidity) : null,
      precipitation: String(extracted.precipitation || 'none'),
      work_impact: extracted.delay_type === 'weather' ? 'delayed' : 'none',
    })
  }

  return NextResponse.json({
    success: true,
    logId,
    extracted,
    weatherFromApi: weatherData !== null,
    crewFromYesterday: manpowerDetail.length === 0 && !!yesterdayLog?.manpower_detail,
  })
}
