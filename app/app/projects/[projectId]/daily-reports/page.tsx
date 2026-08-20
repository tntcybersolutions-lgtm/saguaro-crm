'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

const BASE = '#0d1117'
const CARD = '#161b22'
const BORDER = '#30363d'
const GOLD = '#C8960F'
const TEXT = '#F0F4FF'
const DIM = '#8BAAC8'
const GREEN = '#22C55E'
const RED = '#EF4444'
const BLUE = '#3B82F6'

interface DailyLog {
  id: string
  log_date: string
  status: string
  superintendent_name: string | null
  crew_count: number | null
  weather: string | null
  high_temp: string | null
  work_performed: string | null
  ai_populated: boolean | null
}

interface ExtractedLog {
  superintendent_name?: string | null
  crew_count?: number
  phase_of_work?: string
  pct_complete_estimate?: number | null
  work_performed?: string
  activities?: string
  weather?: string
  high_temp?: string
  low_temp?: string
  precipitation?: string
  wind_conditions?: string
  delays?: string | null
  delay_type?: string
  delay_hours?: number
  materials_delivered?: string | null
  safety_notes?: string | null
  notes?: string | null
  manpower_detail?: Array<{ trade?: string; company?: string; headcount?: number; hours?: number }>
}

export default function DailyReportsPage() {
  const params = useParams()
  const projectId = params?.projectId as string

  const [logs, setLogs] = useState<DailyLog[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'recording' | 'review'>('list')
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [filledLog, setFilledLog] = useState<ExtractedLog | null>(null)
  const [logId, setLogId] = useState('')
  const [weatherFromApi, setWeatherFromApi] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [saving, setSaving] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/daily-logs/list?project_id=${projectId}`)
      const d = await res.json()
      if (res.ok) setLogs(Array.isArray(d.data) ? d.data : Array.isArray(d) ? d : [])
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { loadLogs() }, [loadLogs])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const [manualMode, setManualMode] = useState(false)

  const startVoiceRecording = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setManualMode(true)
      setRecording(false)
      setTranscript('')
      setInterim('')
      setView('recording')
      setToast({ msg: 'Voice input not supported — type your report below.', type: 'err' })
      return
    }
    setManualMode(false)
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    setRecording(true)
    setTranscript('')
    setInterim('')
    setView('recording')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalText = ''
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += t
        else interimText += t
      }
      if (finalText) setTranscript(prev => prev + finalText)
      setInterim(interimText)
    }
    recognition.onend = () => setRecording(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      setToast({ msg: `Voice error: ${e.error || 'unknown'}`, type: 'err' })
      setRecording(false)
    }
    recognitionRef.current = recognition
    recognition.start()
  }

  const stopAndProcess = async () => {
    try { recognitionRef.current?.stop() } catch { /* noop */ }
    setRecording(false)
    if (!transcript.trim()) {
      setToast({ msg: 'No speech captured — try again', type: 'err' })
      setView('list')
      return
    }
    setProcessing(true)
    try {
      const res = await fetch('/api/daily-logs/ai-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, voiceTranscript: transcript }),
      })
      const data = await res.json()
      if (res.ok) {
        setFilledLog(data.extracted || {})
        setLogId(data.logId || '')
        setWeatherFromApi(!!data.weatherFromApi)
        setView('review')
      } else {
        setToast({ msg: data.error || 'Failed to process', type: 'err' })
        setView('list')
      }
    } catch (e) {
      setToast({ msg: (e as Error).message || 'Network error', type: 'err' })
      setView('list')
    } finally {
      setProcessing(false)
    }
  }

  const cancelRecording = () => {
    try { recognitionRef.current?.stop() } catch { /* noop */ }
    setRecording(false)
    setTranscript('')
    setInterim('')
    setView('list')
  }

  const updateField = (k: keyof ExtractedLog, v: unknown) => {
    setFilledLog(prev => prev ? { ...prev, [k]: v } : prev)
  }

  const approveAndSubmit = async () => {
    if (!logId || !filledLog) return
    setSaving(true)
    try {
      const res = await fetch(`/api/daily-logs/${logId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          superintendent_name: filledLog.superintendent_name || null,
          crew_count: Number(filledLog.crew_count) || 0,
          phase_of_work: filledLog.phase_of_work || '',
          pct_complete_estimate: filledLog.pct_complete_estimate ?? null,
          work_performed: filledLog.work_performed || '',
          activities: filledLog.activities || '',
          weather: filledLog.weather || '',
          high_temp: filledLog.high_temp || '',
          low_temp: filledLog.low_temp || '',
          delays: filledLog.delays || null,
          delay_type: filledLog.delay_type || 'none',
          delay_hours: Number(filledLog.delay_hours) || 0,
          materials_delivered: filledLog.materials_delivered || null,
          safety_notes: filledLog.safety_notes || null,
          notes: filledLog.notes || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Save failed')
      }
      setToast({ msg: 'Daily report submitted successfully', type: 'ok' })
      setView('list')
      setFilledLog(null)
      setLogId('')
      setTranscript('')
      loadLogs()
    } catch (e) {
      setToast({ msg: (e as Error).message || 'Save failed', type: 'err' })
    } finally {
      setSaving(false)
    }
  }

  const statusColor = (s: string) => {
    if (s === 'submitted') return GOLD
    if (s === 'approved') return GREEN
    if (s === 'rejected') return RED
    return DIM
  }

  // ─── LIST VIEW ──────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div style={{ background: BASE, minHeight: '100vh', color: TEXT, padding: 24 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0, color: GOLD }}>Daily Reports</h1>
              <p style={{ color: DIM, margin: '4px 0 0', fontSize: 13 }}>AI-powered field reporting with voice input</p>
            </div>
          </div>

          {/* Voice button */}
          <button
            onClick={startVoiceRecording}
            style={{
              display: 'block',
              width: '100%',
              padding: '22px 28px',
              background: `linear-gradient(135deg, ${GOLD}, #F0C040)`,
              color: '#000',
              border: 'none',
              borderRadius: 16,
              fontSize: 18,
              fontWeight: 900,
              cursor: 'pointer',
              marginBottom: 24,
              boxShadow: '0 6px 22px rgba(200,150,15,.4)',
            }}
          >
            🎙️ Start Voice Report
          </button>

          {loading ? (
            <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>Loading…</div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: 'center', color: DIM, padding: 40, background: CARD, borderRadius: 12, border: `1px solid ${BORDER}` }}>
              No daily reports yet. Tap the button above to start your first voice report.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {logs.map(log => (
                <div key={log.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <strong style={{ color: TEXT, fontSize: 15 }}>{log.log_date}</strong>
                      {log.ai_populated && <span style={{ fontSize: 10, color: BLUE, background: 'rgba(59,130,246,.12)', padding: '2px 6px', borderRadius: 4 }}>AI</span>}
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
                      padding: '3px 9px', borderRadius: 999,
                      background: `${statusColor(log.status)}1F`, color: statusColor(log.status),
                    }}>{log.status}</span>
                  </div>
                  <div style={{ fontSize: 12, color: DIM, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                    <div>Super: {log.superintendent_name || '—'}</div>
                    <div>Crew: {log.crew_count ?? 0}</div>
                    <div>Weather: {log.weather || '—'} {log.high_temp || ''}</div>
                  </div>
                  {log.work_performed && (
                    <div style={{ fontSize: 12, color: DIM, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.work_performed}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {toast && (
          <div style={{
            position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            background: toast.type === 'ok' ? GREEN : RED,
            color: '#fff', padding: '10px 18px', borderRadius: 10, fontWeight: 700, zIndex: 100,
          }}>{toast.msg}</div>
        )}
      </div>
    )
  }

  // ─── RECORDING VIEW ─────────────────────────────────────────────────
  if (view === 'recording') {
    // 20-bar waveform animation. Each bar is given a staggered delay.
    const bars = Array.from({ length: 20 }, (_, i) => i)
    const waveformKeyframes = `
      @keyframes wave-bar-0  { 0%,100% { height: 4px; }  50% { height: 14px; } }
      @keyframes wave-bar-1  { 0%,100% { height: 6px; }  50% { height: 22px; } }
      @keyframes wave-bar-2  { 0%,100% { height: 10px; } 50% { height: 28px; } }
      @keyframes wave-bar-3  { 0%,100% { height: 8px; }  50% { height: 34px; } }
      @keyframes wave-bar-4  { 0%,100% { height: 12px; } 50% { height: 26px; } }
      @keyframes wave-bar-5  { 0%,100% { height: 6px; }  50% { height: 36px; } }
      @keyframes wave-bar-6  { 0%,100% { height: 14px; } 50% { height: 30px; } }
      @keyframes wave-bar-7  { 0%,100% { height: 8px; }  50% { height: 24px; } }
      @keyframes pulse       { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
    `

    return (
      <div style={{ background: BASE, minHeight: '100vh', color: TEXT, padding: 24 }}>
        <style>{waveformKeyframes}</style>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: GOLD, margin: '12px 0 8px' }}>
            {processing ? 'Processing with Sage…' : manualMode ? 'Type Your Report' : recording ? 'Listening…' : 'Ready'}
          </h1>
          <p style={{ color: DIM, fontSize: 13, marginBottom: 20 }}>
            Describe today&apos;s work — crew, activities, weather, delays, materials, safety.
          </p>

          {!manualMode && (
            <div style={{
              width: 120, height: 120, margin: '20px auto 8px', borderRadius: '50%',
              background: recording ? `radial-gradient(${RED}, #8a1a1a)` : `radial-gradient(${GOLD}, #7a5400)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 54, boxShadow: recording ? `0 0 50px ${RED}` : `0 0 40px ${GOLD}`,
              animation: recording ? 'pulse 1.4s ease-in-out infinite' : undefined,
            }}>🎙️</div>
          )}

          {/* Waveform — 20 animated bars while recording */}
          {recording && !manualMode && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 3, height: 42, marginBottom: 18,
            }}>
              {bars.map(i => (
                <div
                  key={i}
                  style={{
                    width: 4,
                    height: 10,
                    background: '#D4A017',
                    borderRadius: 2,
                    animation: `wave-bar-${i % 8} 1.1s ease-in-out infinite`,
                    animationDelay: `${(i * 50) % 800}ms`,
                  }}
                />
              ))}
            </div>
          )}

          {manualMode ? (
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              rows={8}
              placeholder="Crew of 6 today, Acme Plumbing 3 guys, 8 hours each, doing rough-in on level 2. Sunny 92° high…"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                padding: 16, fontSize: 16, color: TEXT, fontFamily: 'inherit',
                minHeight: 180, marginBottom: 20,
              }}
            />
          ) : (
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16,
              minHeight: 160, textAlign: 'left', fontSize: 14, lineHeight: 1.6, color: TEXT,
              marginBottom: 20, whiteSpace: 'pre-wrap',
            }}>
              {transcript || <span style={{ color: DIM }}>Your words appear here as you speak…</span>}
              {interim && <span style={{ color: DIM, fontStyle: 'italic' }}> {interim}</span>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={cancelRecording}
              disabled={processing}
              style={{
                padding: '12px 22px', background: 'transparent', color: DIM,
                border: `1px solid ${BORDER}`, borderRadius: 10, fontWeight: 700,
                cursor: processing ? 'not-allowed' : 'pointer', fontSize: 14,
                minHeight: 44,
              }}
            >Cancel</button>
            <button
              onClick={stopAndProcess}
              disabled={processing || !transcript.trim()}
              style={{
                padding: '12px 28px',
                background: processing || !transcript.trim() ? BORDER : GOLD,
                color: processing || !transcript.trim() ? DIM : '#000',
                border: 'none', borderRadius: 10, fontWeight: 900,
                cursor: processing || !transcript.trim() ? 'not-allowed' : 'pointer', fontSize: 14,
                minHeight: 44,
              }}
            >{processing ? 'Processing…' : manualMode ? 'Generate Report' : 'Done Speaking'}</button>
          </div>
        </div>
      </div>
    )
  }

  // ─── REVIEW VIEW ────────────────────────────────────────────────────
  return (
    <div style={{ background: BASE, minHeight: '100vh', color: TEXT, padding: 24 }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: GOLD, margin: 0 }}>Review Daily Report</h1>
          <button
            onClick={() => { setView('list'); setFilledLog(null) }}
            style={{ background: 'transparent', color: DIM, border: `1px solid ${BORDER}`, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}
          >Cancel</button>
        </div>

        <div style={{
          background: weatherFromApi ? 'rgba(59,130,246,.1)' : 'rgba(200,150,15,.08)',
          border: `1px solid ${weatherFromApi ? BLUE : GOLD}`,
          borderRadius: 8, padding: 10, marginBottom: 16,
          fontSize: 12, color: weatherFromApi ? BLUE : GOLD,
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span>{weatherFromApi ? '🌤' : '📝'}</span>
          <span style={{ fontWeight: 700 }}>
            {weatherFromApi ? 'API · wttr.in' : 'Transcript'}
          </span>
          <span style={{ opacity: 0.8 }}>
            {weatherFromApi
              ? `Weather auto-populated from live API`
              : `Weather pulled from your spoken / typed transcript`}
          </span>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          {field('Superintendent', filledLog?.superintendent_name, v => updateField('superintendent_name', v))}
          {field('Phase of Work', filledLog?.phase_of_work, v => updateField('phase_of_work', v))}
          {row(
            field('Crew Count', filledLog?.crew_count, v => updateField('crew_count', Number(v)), 'number'),
            field('% Complete', filledLog?.pct_complete_estimate, v => updateField('pct_complete_estimate', v === '' ? null : Number(v)), 'number'),
          )}
          {row(
            field('Weather', filledLog?.weather, v => updateField('weather', v)),
            field('High Temp', filledLog?.high_temp, v => updateField('high_temp', v)),
          )}
          {textarea('Work Performed', filledLog?.work_performed, v => updateField('work_performed', v))}
          {textarea('Activities', filledLog?.activities, v => updateField('activities', v))}
          {row(
            field('Delay Type', filledLog?.delay_type, v => updateField('delay_type', v)),
            field('Delay Hours', filledLog?.delay_hours, v => updateField('delay_hours', Number(v)), 'number'),
          )}
          {textarea('Delays', filledLog?.delays ?? '', v => updateField('delays', v))}
          {textarea('Materials Delivered', filledLog?.materials_delivered ?? '', v => updateField('materials_delivered', v))}
          {textarea('Safety Notes', filledLog?.safety_notes ?? '', v => updateField('safety_notes', v))}
          {textarea('Notes', filledLog?.notes ?? '', v => updateField('notes', v))}

          {Array.isArray(filledLog?.manpower_detail) && (filledLog?.manpower_detail?.length ?? 0) > 0 && (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 8 }}>CREW</div>
              {filledLog!.manpower_detail!.map((m, i) => (
                <div key={i} style={{ fontSize: 12, color: TEXT, display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: i < (filledLog!.manpower_detail!.length - 1) ? `1px solid ${BORDER}` : 'none' }}>
                  <span>{m.trade || 'General'} — {m.company || '—'}</span>
                  <span style={{ color: DIM }}>{m.headcount || 1} × {m.hours || 8}h</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={approveAndSubmit}
          disabled={saving}
          style={{
            width: '100%', marginTop: 24,
            padding: '18px',
            background: saving ? BORDER : `linear-gradient(135deg, ${GOLD}, #F0C040)`,
            color: saving ? DIM : '#0d1117',
            border: 'none', borderRadius: 12,
            fontWeight: 900, fontSize: 17,
            cursor: saving ? 'not-allowed' : 'pointer',
            minHeight: 56,
            boxShadow: saving ? 'none' : '0 6px 20px rgba(200,150,15,.35)',
          }}
        >{saving ? 'Saving…' : '✅ Approve & Submit'}</button>

        <div style={{ textAlign: 'center', marginTop: 14, display: 'flex', gap: 16, justifyContent: 'center' }}>
          <button
            onClick={() => { setView('list'); setFilledLog(null) }}
            style={{ background: 'transparent', color: DIM, border: 'none', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}
          >Save as Draft</button>
          <button
            onClick={() => { setFilledLog(null); setTranscript(''); setInterim(''); setView('recording'); setRecording(false); }}
            style={{ background: 'transparent', color: DIM, border: 'none', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}
          >🔄 Re-record</button>
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: toast.type === 'ok' ? GREEN : RED, color: '#fff', padding: '10px 18px', borderRadius: 10, fontWeight: 700, zIndex: 100 }}>{toast.msg}</div>
      )}
    </div>
  )
}

function field(label: string, value: unknown, onChange: (v: string) => void, type: 'text' | 'number' = 'text') {
  return (
    <div>
      <div style={{ fontSize: 11, color: DIM, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <input
        type={type}
        value={value == null ? '' : String(value)}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '10px 12px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14 }}
      />
    </div>
  )
}

function textarea(label: string, value: unknown, onChange: (v: string) => void) {
  return (
    <div>
      <div style={{ fontSize: 11, color: DIM, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <textarea
        value={value == null ? '' : String(value)}
        onChange={e => onChange(e.target.value)}
        rows={3}
        style={{ width: '100%', padding: '10px 12px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
      />
    </div>
  )
}

function row(a: React.ReactNode, b: React.ReactNode) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{a}{b}</div>
}
