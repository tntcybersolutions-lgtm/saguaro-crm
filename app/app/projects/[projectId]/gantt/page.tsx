'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Milestone = {
  id: string; name: string; planned_start: string; planned_end: string
  actual_start?: string; actual_end?: string; status: string
  completion_pct: number; csi_division?: string; is_critical_path: boolean
}

const STATUS_COLORS: Record<string, string> = {
  not_started: '#30363d',
  in_progress: '#4299E1',
  completed: '#3DD68C',
  delayed: '#F85149',
  on_hold: '#F0B429',
}

export default function GanttPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [project, setProject] = useState<{ name?: string; start_date?: string; estimated_completion?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [viewStart, setViewStart] = useState<Date>(new Date())
  const [viewDays, setViewDays] = useState(90)
  const [form, setForm] = useState({ name: '', planned_start: '', planned_end: '', csi_division: '', is_critical_path: false, status: 'not_started', completion_pct: 0 })

  const ROW_H = 36
  const LABEL_W = 220
  const HEADER_H = 50
  const DAY_W = 28

  useEffect(() => {
    fetch(`/api/schedule/gantt/${projectId}`)
      .then(r => r.json())
      .then(d => {
        setMilestones(d.milestones || [])
        setProject(d.project)
        if (d.project?.start_date) setViewStart(new Date(d.project.start_date))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [projectId])

  useEffect(() => { if (!loading) drawGantt() }, [milestones, viewStart, viewDays, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const drawGantt = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const width = LABEL_W + viewDays * DAY_W
    const height = HEADER_H + milestones.length * ROW_H + ROW_H

    canvas.width = width
    canvas.height = height
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'

    // Background
    ctx.fillStyle = '#0d1117'
    ctx.fillRect(0, 0, width, height)

    // Header bar
    ctx.fillStyle = '#161b22'
    ctx.fillRect(0, 0, width, HEADER_H)
    ctx.fillRect(0, 0, LABEL_W, height)

    // Month labels + day numbers
    let lastMonth = -1
    for (let d = 0; d < viewDays; d++) {
      const date = new Date(viewStart)
      date.setDate(date.getDate() + d)
      const x = LABEL_W + d * DAY_W
      const month = date.getMonth()

      if (month !== lastMonth) {
        ctx.fillStyle = '#e6edf3'
        ctx.font = 'bold 11px sans-serif'
        ctx.fillText(date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), x + 4, 18)
        ctx.strokeStyle = '#30363d'
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
        lastMonth = month
      }

      ctx.fillStyle = '#6e7681'
      ctx.font = '9px sans-serif'
      ctx.fillText(String(date.getDate()), x + DAY_W / 2 - 5, 38)

      // Weekend shading
      if (date.getDay() === 0 || date.getDay() === 6) {
        ctx.fillStyle = 'rgba(255,255,255,.03)'
        ctx.fillRect(x, HEADER_H, DAY_W, height - HEADER_H)
      }
    }

    // Today line
    const today = new Date()
    const todayOffset = Math.floor((today.getTime() - viewStart.getTime()) / (1000 * 60 * 60 * 24))
    if (todayOffset >= 0 && todayOffset < viewDays) {
      const tx = LABEL_W + todayOffset * DAY_W
      ctx.strokeStyle = '#D4A017'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(tx, 0)
      ctx.lineTo(tx, height)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#D4A017'
      ctx.font = 'bold 10px sans-serif'
      ctx.fillText('TODAY', tx + 4, 12)
    }

    // Draw rows
    milestones.forEach((ms, i) => {
      const y = HEADER_H + i * ROW_H

      // Alternating row background
      ctx.fillStyle = i % 2 === 0 ? '#0d1117' : '#111722'
      ctx.fillRect(0, y, width, ROW_H)

      // Label text
      ctx.fillStyle = ms.is_critical_path ? '#F85149' : '#e6edf3'
      ctx.font = `${ms.is_critical_path ? 'bold' : 'normal'} 11px sans-serif`
      const label = ms.name.length > 24 ? ms.name.slice(0, 24) + '\u2026' : ms.name
      ctx.fillText(label, 10, y + ROW_H / 2 + 4)

      // CSI division badge
      if (ms.csi_division) {
        ctx.fillStyle = '#21262d'
        ctx.fillRect(LABEL_W - 36, y + 6, 32, 18)
        ctx.fillStyle = '#8b949e'
        ctx.font = '9px sans-serif'
        ctx.fillText(ms.csi_division.padStart(2, '0'), LABEL_W - 28, y + 18)
      }

      // Draw Gantt bar
      if (ms.planned_start && ms.planned_end) {
        const start = new Date(ms.planned_start)
        const end = new Date(ms.planned_end)
        const startOffset = Math.floor((start.getTime() - viewStart.getTime()) / (1000 * 60 * 60 * 24))
        const endOffset = Math.ceil((end.getTime() - viewStart.getTime()) / (1000 * 60 * 60 * 24))
        const barX = LABEL_W + startOffset * DAY_W
        const barW = Math.max((endOffset - startOffset) * DAY_W, DAY_W)
        const barY = y + 6
        const barH = ROW_H - 12

        // Planned bar background
        ctx.fillStyle = '#21262d'
        ctx.beginPath()
        ctx.roundRect(barX, barY, barW, barH, 4)
        ctx.fill()

        // Progress fill
        const pct = (ms.completion_pct || 0) / 100
        if (pct > 0) {
          ctx.fillStyle = STATUS_COLORS[ms.status] || '#4299E1'
          ctx.beginPath()
          ctx.roundRect(barX, barY, barW * pct, barH, 4)
          ctx.fill()
        }

        // Critical path border
        if (ms.is_critical_path) {
          ctx.strokeStyle = '#F85149'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.roundRect(barX, barY, barW, barH, 4)
          ctx.stroke()
        }

        // Percentage label inside bar
        if (barW > 40) {
          ctx.fillStyle = '#fff'
          ctx.font = 'bold 10px sans-serif'
          ctx.fillText(`${ms.completion_pct || 0}%`, barX + 6, y + ROW_H / 2 + 4)
        }

        // Actual start marker (if differs from planned)
        if (ms.actual_start && ms.actual_start !== ms.planned_start) {
          const aStart = new Date(ms.actual_start)
          const aOffset = Math.floor((aStart.getTime() - viewStart.getTime()) / (1000 * 60 * 60 * 24))
          const ax = LABEL_W + aOffset * DAY_W
          ctx.strokeStyle = '#F0B429'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(ax, barY)
          ctx.lineTo(ax, barY + barH)
          ctx.stroke()
        }
      }

      // Row divider
      ctx.strokeStyle = '#21262d'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, y + ROW_H)
      ctx.lineTo(width, y + ROW_H)
      ctx.stroke()
    })

    // Label column divider
    ctx.strokeStyle = '#30363d'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(LABEL_W, 0)
    ctx.lineTo(LABEL_W, height)
    ctx.stroke()

    // Header label
    ctx.fillStyle = '#8b949e'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText('TASK / MILESTONE', 10, 20)
  }

  const exportGanttPDF = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const legendHtml = Object.entries(STATUS_COLORS).map(([status, color]) =>
      `<div class="leg-item"><div class="leg-dot" style="background:${color}"></div>${status.replace(/_/g, ' ')}</div>`
    ).join('')
    const exportHtml = `<!DOCTYPE html>
<html><head>
<title>Gantt Chart - ${project?.name || 'Project'}</title>
<style>
  @page { size: landscape; margin: 0.5in; }
  body { font-family: Arial, sans-serif; margin: 0; }
  .header { display: flex; justify-content: space-between; margin-bottom: 12px; }
  .title { font-size: 16pt; font-weight: bold; }
  .sub { font-size: 10pt; color: #555; }
  img { max-width: 100%; }
  .legend { display: flex; gap: 20px; margin-top: 12px; font-size: 9pt; }
  .leg-item { display: flex; align-items: center; gap: 6px; }
  .leg-dot { width: 14px; height: 14px; border-radius: 3px; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="title">Project Schedule - ${project?.name || 'Gantt Chart'}</div>
    <div class="sub">Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} - ${milestones.length} tasks</div>
  </div>
</div>
<img src="${canvas.toDataURL('image/png')}" />
<div class="legend">
  ${legendHtml}
  <div class="leg-item"><div class="leg-dot" style="background:#F85149;border:2px solid #F85149"></div>Critical Path</div>
</div>
<script>window.onload = () => window.print()</script>
</body></html>`
    const win = window.open('', '_blank')
    if (win) { win.document.write(exportHtml); win.document.close() }
  }

  const addMilestone = async () => {
    if (!form.name || !form.planned_start || !form.planned_end) return
    const res = await fetch(`/api/schedule/gantt/${projectId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) return
    const newMs = await res.json()
    setMilestones(prev => [...prev, newMs].sort((a, b) => a.planned_start.localeCompare(b.planned_start)))
    setShowAdd(false)
    setForm({ name: '', planned_start: '', planned_end: '', csi_division: '', is_critical_path: false, status: 'not_started', completion_pct: 0 })
  }

  const completedCount = milestones.filter(m => m.status === 'completed').length
  const delayedCount = milestones.filter(m => m.status === 'delayed').length
  const criticalCount = milestones.filter(m => m.is_critical_path).length

  return (
    <div style={{ padding: '24px 32px', background: '#0d1117', minHeight: '100vh', color: '#e6edf3' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: 0 }}>Gantt Chart</h1>
          <p style={{ color: '#8b949e', fontSize: 14, margin: '4px 0 0' }}>{project?.name} &mdash; {milestones.length} tasks</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => router.push(`/app/projects/${projectId}/schedule`)} style={{ background: '#21262d', border: '1px solid #30363d', color: '#8b949e', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>&larr; Schedule</button>
          <select value={viewDays} onChange={e => setViewDays(Number(e.target.value))} style={{ padding: '8px 12px', background: '#21262d', border: '1px solid #30363d', borderRadius: 8, color: '#e6edf3', fontSize: 13 }}>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
            <option value={180}>6 months</option>
            <option value={365}>1 year</option>
          </select>
          <button onClick={() => setShowAdd(true)} style={{ background: '#21262d', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>+ Task</button>
          <button onClick={exportGanttPDF} style={{ background: '#D4A017', color: '#0d1117', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Export PDF</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Tasks', val: milestones.length, color: '#e6edf3' },
          { label: 'Completed', val: completedCount, color: '#3DD68C' },
          { label: 'Delayed', val: delayedCount, color: delayedCount > 0 ? '#F85149' : '#3DD68C' },
          { label: 'Critical Path', val: criticalCount, color: criticalCount > 0 ? '#F85149' : '#8b949e' },
        ].map(k => (
          <div key={k.label} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Gantt canvas */}
      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 10, overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>Loading schedule...</div>
        ) : milestones.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#128197;</div>
            <p style={{ color: '#8b949e', marginBottom: 16 }}>No tasks yet. Add your first task to start building the schedule.</p>
            <button onClick={() => setShowAdd(true)} style={{ background: '#D4A017', color: '#0d1117', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}>+ Add Task</button>
          </div>
        ) : (
          <canvas ref={canvasRef} style={{ display: 'block', cursor: 'default' }} />
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
            <span style={{ fontSize: 11, color: '#8b949e', textTransform: 'capitalize' }}>{status.replace(/_/g, ' ')}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: '#F85149', border: '2px solid #F85149' }} />
          <span style={{ fontSize: 11, color: '#8b949e' }}>Critical Path</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, height: 2, background: '#D4A017' }} />
          <span style={{ fontSize: 11, color: '#D4A017' }}>Today</span>
        </div>
      </div>

      {/* Add Task Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 28, width: 480 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 20 }}>Add Gantt Task</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#8b949e', display: 'block', marginBottom: 4 }}>Task Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Concrete Foundation - Zone A"
                  style={{ width: '100%', padding: '9px 12px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 7, color: '#e6edf3', fontSize: 13, boxSizing: 'border-box' as const }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#8b949e', display: 'block', marginBottom: 4 }}>Start Date *</label>
                  <input type="date" value={form.planned_start} onChange={e => setForm(f => ({ ...f, planned_start: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 7, color: '#e6edf3', fontSize: 13, boxSizing: 'border-box' as const }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#8b949e', display: 'block', marginBottom: 4 }}>End Date *</label>
                  <input type="date" value={form.planned_end} onChange={e => setForm(f => ({ ...f, planned_end: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 7, color: '#e6edf3', fontSize: 13, boxSizing: 'border-box' as const }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#8b949e', display: 'block', marginBottom: 4 }}>CSI Division</label>
                  <input value={form.csi_division} onChange={e => setForm(f => ({ ...f, csi_division: e.target.value }))} placeholder="03, 05, 26..."
                    style={{ width: '100%', padding: '9px 12px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 7, color: '#e6edf3', fontSize: 13, boxSizing: 'border-box' as const }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#8b949e', display: 'block', marginBottom: 4 }}>% Complete</label>
                  <input type="number" min={0} max={100} value={form.completion_pct} onChange={e => setForm(f => ({ ...f, completion_pct: Number(e.target.value) }))}
                    style={{ width: '100%', padding: '9px 12px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 7, color: '#e6edf3', fontSize: 13, boxSizing: 'border-box' as const }} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_critical_path} onChange={e => setForm(f => ({ ...f, is_critical_path: e.target.checked }))} />
                <span style={{ fontSize: 13, color: '#F85149', fontWeight: 600 }}>Mark as Critical Path</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowAdd(false)} style={{ background: 'transparent', border: '1px solid #30363d', color: '#8b949e', borderRadius: 7, padding: '8px 16px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={addMilestone} disabled={!form.name || !form.planned_start || !form.planned_end}
                style={{ background: form.name ? '#D4A017' : '#21262d', color: form.name ? '#0d1117' : '#6e7681', border: 'none', borderRadius: 7, padding: '8px 16px', fontWeight: 700, cursor: form.name ? 'pointer' : 'not-allowed' }}>
                Add Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
