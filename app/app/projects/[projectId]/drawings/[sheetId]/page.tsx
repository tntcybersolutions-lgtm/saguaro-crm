'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'

/* ═══ Types ═══ */
type Tool = 'select' | 'pan' | 'pen' | 'line' | 'rect' | 'circle' | 'text' | 'pin' | 'cloud' | 'arrow'
type MarkupColor = '#F85149' | '#F0B429' | '#3DD68C' | '#4299E1' | '#9F7AEA' | '#fff' | '#000'

interface MarkupObject {
  id: string
  type: string
  color: string
  lineWidth: number
  path?: { x: number; y: number }[]
  x1?: number; y1?: number; x2?: number; y2?: number
  isArrow?: boolean
  x?: number; y?: number; w?: number; h?: number
  cx?: number; cy?: number; rx?: number; ry?: number
  text?: string; fontSize?: number
  filled?: boolean
}

interface RFIPin {
  id: string
  rfi_id: string
  x_pct: number
  y_pct: number
  rfis: { rfi_number: string; subject: string; status: string; priority: string } | null
}

interface Revision {
  id: string
  revision_number: string
  file_url: string
  file_name: string
  issued_date: string | null
  change_description: string | null
  is_current: boolean
}

interface RFIEntry {
  id: string
  rfi_number: string
  subject: string
  status: string
}

/* ═══ Tool palette ═══ */
const TOOLS: Array<{ id: Tool; icon: string; label: string }> = [
  { id: 'pan', icon: '\u270B', label: 'Pan' },
  { id: 'select', icon: '\u2196', label: 'Select' },
  { id: 'pen', icon: '\u270F', label: 'Pen' },
  { id: 'line', icon: '\u2571', label: 'Line' },
  { id: 'rect', icon: '\u25AD', label: 'Rectangle' },
  { id: 'circle', icon: '\u25CB', label: 'Circle' },
  { id: 'cloud', icon: '\u2601', label: 'Cloud' },
  { id: 'arrow', icon: '\u2192', label: 'Arrow' },
  { id: 'text', icon: 'T', label: 'Text' },
  { id: 'pin', icon: '\uD83D\uDCCD', label: 'RFI Pin' },
]

const COLORS: MarkupColor[] = ['#F85149', '#F0B429', '#3DD68C', '#4299E1', '#9F7AEA', '#fff', '#000']

/* ═══ Page component ═══ */
export default function DrawingMarkupPage() {
  const { projectId, sheetId } = useParams<{ projectId: string; sheetId: string }>()
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [sheet, setSheet] = useState<{ id: string; sheet_number: string; sheet_title: string; file_url: string } | null>(null)
  const [tool, setTool] = useState<Tool>('pan')
  const [color, setColor] = useState<MarkupColor>('#F85149')
  const [lineWidth, setLineWidth] = useState(2)
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [markups, setMarkups] = useState<MarkupObject[]>([])
  const [rfiPins, setRfiPins] = useState<RFIPin[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [rfis, setRfis] = useState<RFIEntry[]>([])
  const [pdfDoc, setPdfDoc] = useState<unknown>(null)
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(true)
  const [showRevisions, setShowRevisions] = useState(false)
  const [showPins, setShowPins] = useState(true)
  const [selectedPin, setSelectedPin] = useState<RFIPin | null>(null)
  const [selectedRFIForPin, setSelectedRFIForPin] = useState('')
  const [showRevisionModal, setShowRevisionModal] = useState(false)
  const [revForm, setRevForm] = useState({
    revision_number: '', file_url: '', file_name: '', issued_date: '', change_description: '',
  })

  const isDrawing = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const currentPath = useRef<{ x: number; y: number }[]>([])
  const startPos = useRef({ x: 0, y: 0 })
  const panStart = useRef({ x: 0, y: 0 })
  const panOffsetStart = useRef({ x: 0, y: 0 })

  /* ─── Load PDF.js dynamically ─── */
  useEffect(() => {
    const win = window as unknown as Record<string, unknown>
    if (typeof window !== 'undefined' && !win.pdfjsLib) {
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
      script.onload = () => {
        const lib = (window as unknown as Record<string, unknown>).pdfjsLib as Record<string, unknown>
        if (lib) {
          ;(lib.GlobalWorkerOptions as Record<string, unknown>).workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
        }
      }
      document.head.appendChild(script)
    }
  }, [])

  /* ─── Load sheet + markup + pins + revisions + RFI list ─── */
  useEffect(() => {
    if (!sheetId || !projectId) return
    Promise.all([
      fetch(`/api/drawings/list?projectId=${projectId}&currentOnly=true`).then(r => r.json()),
      fetch(`/api/drawings/markup/${sheetId}`).then(r => r.json()),
      fetch(`/api/drawings/rfi-pins/${sheetId}`).then(r => r.json()),
      fetch(`/api/drawings/revision-history/${sheetId}`).then(r => r.json()),
      fetch(`/api/rfis?projectId=${projectId}&status=open`).then(r => r.json()),
    ]).then(([sheetsRes, markup, pins, revs, rfiList]) => {
      const allSheets = Array.isArray(sheetsRes) ? sheetsRes : sheetsRes.data || []
      const s = allSheets.find((sh: Record<string, unknown>) => sh.id === sheetId) || null
      setSheet(s as typeof sheet)
      setMarkups((markup?.markup_data as MarkupObject[]) || [])
      setRfiPins((Array.isArray(pins) ? pins : []) as RFIPin[])
      setRevisions((Array.isArray(revs) ? revs : []) as Revision[])
      const rfiArr = Array.isArray(rfiList) ? rfiList : rfiList.data || []
      setRfis(rfiArr as RFIEntry[])
      if (s && (s as Record<string, string>).file_url) {
        loadPDF((s as Record<string, string>).file_url)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId, projectId])

  /* ─── PDF / Image loading ─── */
  const loadPDF = async (url: string) => {
    const pdfjsLib = (window as unknown as Record<string, unknown>).pdfjsLib as Record<string, unknown> | undefined
    if (!pdfjsLib) {
      setTimeout(() => loadPDF(url), 500)
      return
    }
    try {
      const getDoc = pdfjsLib.getDocument as (src: string) => { promise: Promise<unknown> }
      const doc = await getDoc(url).promise as { numPages: number; getPage: (n: number) => Promise<unknown> }
      setPdfDoc(doc)
      setNumPages(doc.numPages)
      renderPage(doc, 1)
    } catch {
      renderImage(url)
    }
  }

  const renderPage = async (
    doc: { getPage: (n: number) => Promise<unknown> },
    page: number
  ) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const pdfPage = await doc.getPage(page) as {
      getViewport: (opts: { scale: number }) => { width: number; height: number }
      render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> }
    }
    const viewport = pdfPage.getViewport({ scale: 1.5 })
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    await pdfPage.render({ canvasContext: ctx, viewport }).promise
    redrawMarkups()
  }

  const renderImage = (url: string) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      redrawMarkups()
    }
    img.src = url
  }

  /* ─── Coordinate helpers ─── */
  const getCanvasCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left - panOffset.x) / zoom,
      y: (e.clientY - rect.top - panOffset.y) / zoom,
    }
  }

  /* ─── Redraw markups on overlay canvas ─── */
  const redrawMarkups = useCallback(() => {
    const overlay = overlayRef.current
    if (!overlay || !canvasRef.current) return
    overlay.width = canvasRef.current.width
    overlay.height = canvasRef.current.height
    const ctx = overlay.getContext('2d')!
    ctx.clearRect(0, 0, overlay.width, overlay.height)

    for (const m of markups) {
      ctx.strokeStyle = m.color || '#F85149'
      ctx.fillStyle = m.color || '#F85149'
      ctx.lineWidth = m.lineWidth || 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      if (m.type === 'pen' && m.path && m.path.length > 1) {
        ctx.beginPath()
        ctx.moveTo(m.path[0].x, m.path[0].y)
        for (let i = 1; i < m.path.length; i++) {
          ctx.lineTo(m.path[i].x, m.path[i].y)
        }
        ctx.stroke()
      } else if (m.type === 'line') {
        ctx.beginPath()
        ctx.moveTo(m.x1!, m.y1!)
        ctx.lineTo(m.x2!, m.y2!)
        ctx.stroke()
        if (m.isArrow) {
          const angle = Math.atan2(m.y2! - m.y1!, m.x2! - m.x1!)
          const headLen = 15
          ctx.beginPath()
          ctx.moveTo(m.x2!, m.y2!)
          ctx.lineTo(
            m.x2! - headLen * Math.cos(angle - Math.PI / 6),
            m.y2! - headLen * Math.sin(angle - Math.PI / 6)
          )
          ctx.moveTo(m.x2!, m.y2!)
          ctx.lineTo(
            m.x2! - headLen * Math.cos(angle + Math.PI / 6),
            m.y2! - headLen * Math.sin(angle + Math.PI / 6)
          )
          ctx.stroke()
        }
      } else if (m.type === 'rect') {
        ctx.beginPath()
        ctx.strokeRect(m.x!, m.y!, m.w!, m.h!)
        if (m.filled) {
          ctx.globalAlpha = 0.15
          ctx.fillRect(m.x!, m.y!, m.w!, m.h!)
          ctx.globalAlpha = 1
        }
      } else if (m.type === 'circle') {
        ctx.beginPath()
        ctx.ellipse(m.cx!, m.cy!, Math.abs(m.rx!), Math.abs(m.ry!), 0, 0, Math.PI * 2)
        ctx.stroke()
      } else if (m.type === 'cloud') {
        const { x: cx, y: cy, w: cw, h: ch } = m as { x: number; y: number; w: number; h: number }
        const bumpR = 12
        ctx.beginPath()
        for (let bx = cx; bx < cx + cw; bx += bumpR * 2) {
          ctx.arc(Math.min(bx + bumpR, cx + cw), cy, bumpR, Math.PI, 0)
        }
        for (let by = cy; by < cy + ch; by += bumpR * 2) {
          ctx.arc(cx + cw, Math.min(by + bumpR, cy + ch), bumpR, -Math.PI / 2, Math.PI / 2)
        }
        for (let bx = cx + cw; bx > cx; bx -= bumpR * 2) {
          ctx.arc(Math.max(bx - bumpR, cx), cy + ch, bumpR, 0, Math.PI)
        }
        for (let by = cy + ch; by > cy; by -= bumpR * 2) {
          ctx.arc(cx, Math.max(by - bumpR, cy), bumpR, Math.PI / 2, -Math.PI / 2)
        }
        ctx.closePath()
        ctx.stroke()
      } else if (m.type === 'text') {
        ctx.font = `${m.fontSize || 14}px sans-serif`
        ctx.fillText(m.text || '', m.x!, m.y!)
      }
    }
  }, [markups])

  useEffect(() => { redrawMarkups() }, [markups, redrawMarkups])

  /* ─── Mouse handlers for drawing ─── */
  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getCanvasCoords(e)

    if (tool === 'pan') {
      isDrawing.current = true
      panStart.current = { x: e.clientX, y: e.clientY }
      panOffsetStart.current = { ...panOffset }
      return
    }

    if (tool === 'pin') {
      const canvas = canvasRef.current!
      const xPct = pos.x / canvas.width
      const yPct = pos.y / canvas.height
      if (selectedRFIForPin) {
        fetch(`/api/drawings/rfi-pins/${sheetId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rfi_id: selectedRFIForPin, x_pct: xPct, y_pct: yPct }),
        })
          .then(r => r.json())
          .then(pin => {
            const rfi = rfis.find(r2 => r2.id === selectedRFIForPin)
            setRfiPins(prev => [
              ...prev,
              { ...pin, rfis: rfi ? { rfi_number: rfi.rfi_number, subject: rfi.subject, status: rfi.status, priority: '' } : null },
            ])
            setSelectedRFIForPin('')
          })
      }
      return
    }

    isDrawing.current = true
    startPos.current = pos
    lastPos.current = pos
    currentPath.current = [pos]
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing.current) return
    const pos = getCanvasCoords(e)

    if (tool === 'pan') {
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      setPanOffset({ x: panOffsetStart.current.x + dx, y: panOffsetStart.current.y + dy })
      return
    }

    if (tool === 'pen') {
      currentPath.current.push(pos)
      const overlay = overlayRef.current
      if (overlay) {
        const ctx = overlay.getContext('2d')!
        ctx.strokeStyle = color
        ctx.lineWidth = lineWidth
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(lastPos.current.x, lastPos.current.y)
        ctx.lineTo(pos.x, pos.y)
        ctx.stroke()
      }
    }
    lastPos.current = pos
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDrawing.current) return
    isDrawing.current = false
    const pos = getCanvasCoords(e)

    if (tool === 'pen' && currentPath.current.length > 1) {
      setMarkups(prev => [...prev, {
        id: Date.now().toString(), type: 'pen', path: [...currentPath.current], color, lineWidth,
      }])
      setSaved(false)
    } else if (tool === 'line' || tool === 'arrow') {
      setMarkups(prev => [...prev, {
        id: Date.now().toString(), type: 'line',
        x1: startPos.current.x, y1: startPos.current.y, x2: pos.x, y2: pos.y,
        color, lineWidth, isArrow: tool === 'arrow',
      }])
      setSaved(false)
    } else if (tool === 'rect') {
      setMarkups(prev => [...prev, {
        id: Date.now().toString(), type: 'rect',
        x: Math.min(startPos.current.x, pos.x), y: Math.min(startPos.current.y, pos.y),
        w: Math.abs(pos.x - startPos.current.x), h: Math.abs(pos.y - startPos.current.y),
        color, lineWidth,
      }])
      setSaved(false)
    } else if (tool === 'circle') {
      setMarkups(prev => [...prev, {
        id: Date.now().toString(), type: 'circle',
        cx: (startPos.current.x + pos.x) / 2, cy: (startPos.current.y + pos.y) / 2,
        rx: Math.abs(pos.x - startPos.current.x) / 2, ry: Math.abs(pos.y - startPos.current.y) / 2,
        color, lineWidth,
      }])
      setSaved(false)
    } else if (tool === 'cloud') {
      setMarkups(prev => [...prev, {
        id: Date.now().toString(), type: 'cloud',
        x: Math.min(startPos.current.x, pos.x), y: Math.min(startPos.current.y, pos.y),
        w: Math.abs(pos.x - startPos.current.x), h: Math.abs(pos.y - startPos.current.y),
        color, lineWidth,
      }])
      setSaved(false)
    }
    currentPath.current = []
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (tool !== 'text') return
    const pos = getCanvasCoords(e)
    const text = window.prompt('Enter annotation text:')
    if (!text) return
    setMarkups(prev => [...prev, {
      id: Date.now().toString(), type: 'text', x: pos.x, y: pos.y, text, color, fontSize: 14, lineWidth: 1,
    }])
    setSaved(false)
  }

  /* ─── Actions ─── */
  const undo = () => {
    setMarkups(prev => prev.slice(0, -1))
    setSaved(false)
  }

  const clearAll = () => {
    if (!window.confirm('Clear all markups? This cannot be undone.')) return
    setMarkups([])
    setSaved(false)
  }

  const saveMarkups = async () => {
    setSaving(true)
    try {
      await fetch(`/api/drawings/markup/${sheetId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markup_data: markups }),
      })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const exportWithMarkups = () => {
    const canvas = canvasRef.current!
    const overlay = overlayRef.current!
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = canvas.width
    exportCanvas.height = canvas.height
    const ctx = exportCanvas.getContext('2d')!
    ctx.drawImage(canvas, 0, 0)
    ctx.drawImage(overlay, 0, 0)
    if (showPins) {
      rfiPins.forEach(pin => {
        const x = pin.x_pct * canvas.width
        const y = pin.y_pct * canvas.height
        ctx.fillStyle = '#F85149'
        ctx.beginPath()
        ctx.arc(x, y, 12, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 10px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`R${pin.rfis?.rfi_number || '?'}`, x, y + 4)
      })
    }
    const link = document.createElement('a')
    link.download = `${sheet?.sheet_number || 'drawing'}-markup.png`
    link.href = exportCanvas.toDataURL('image/png')
    link.click()
  }

  /* ─── PDF page navigation ─── */
  const goToPage = (newPage: number) => {
    if (newPage < 1 || newPage > numPages) return
    setPageNum(newPage)
    if (pdfDoc) {
      renderPage(
        pdfDoc as { getPage: (n: number) => Promise<unknown> },
        newPage
      )
    }
  }

  /* ─── Revision submit ─── */
  const submitRevision = () => {
    fetch(`/api/drawings/revision-history/${sheetId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(revForm),
    })
      .then(r => r.json())
      .then(rev => {
        setRevisions(prev => [rev, ...prev.map(r2 => ({ ...r2, is_current: false }))])
        setShowRevisionModal(false)
        setRevForm({ revision_number: '', file_url: '', file_name: '', issued_date: '', change_description: '' })
      })
  }

  /* ─── Styles ─── */
  const containerStyle: React.CSSProperties = {
    display: 'flex', height: '100vh', background: '#0d1117', overflow: 'hidden',
  }
  const toolbarStyle: React.CSSProperties = {
    width: 56, background: '#161b22', borderRight: '1px solid #30363d',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '12px 0', gap: 4, overflowY: 'auto',
  }
  const toolBtnStyle = (active: boolean): React.CSSProperties => ({
    width: 40, height: 40, borderRadius: 8,
    border: active ? '2px solid #D4A017' : '1px solid transparent',
    background: active ? 'rgba(212,160,23,.15)' : 'transparent',
    color: active ? '#D4A017' : '#8b949e',
    fontSize: 16, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  })
  const topBtnStyle: React.CSSProperties = {
    background: '#21262d', border: '1px solid #30363d', color: '#e6edf3',
    borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11,
  }
  const modalInputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', background: '#0d1117',
    border: '1px solid #30363d', borderRadius: 6, color: '#e6edf3',
    fontSize: 13, boxSizing: 'border-box',
  }

  /* ═══ RENDER ═══ */
  return (
    <div style={containerStyle}>
      {/* ─── Left toolbar ─── */}
      <div style={toolbarStyle}>
        {TOOLS.map(t => (
          <button key={t.id} title={t.label} onClick={() => setTool(t.id)} style={toolBtnStyle(tool === t.id)}>
            {t.icon}
          </button>
        ))}
        <div style={{ width: 32, height: 1, background: '#30363d', margin: '8px 0' }} />
        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)} style={{
            width: 24, height: 24, borderRadius: '50%', background: c,
            border: color === c ? '3px solid #fff' : '1px solid #30363d',
            cursor: 'pointer', margin: 2,
          }} />
        ))}
        <div style={{ width: 32, height: 1, background: '#30363d', margin: '8px 0' }} />
        {[1, 2, 4, 6].map(w => (
          <button key={w} onClick={() => setLineWidth(w)} title={`${w}px`} style={{
            width: 40, height: 28, borderRadius: 6,
            border: lineWidth === w ? '2px solid #D4A017' : '1px solid #30363d',
            background: 'transparent', color: '#8b949e', fontSize: 11, cursor: 'pointer',
          }}>{w}px</button>
        ))}
      </div>

      {/* ─── Main canvas area ─── */}
      <div
        ref={containerRef}
        style={{
          flex: 1, overflow: 'hidden', position: 'relative',
          cursor: tool === 'pan' ? 'grab' : 'crosshair',
        }}
      >
        {/* Top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 48,
          background: 'rgba(13,17,23,.9)', borderBottom: '1px solid #30363d',
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, zIndex: 10,
        }}>
          <button onClick={() => router.back()} style={{
            background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 18,
          }}>\u2190</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#e6edf3' }}>
            {sheet?.sheet_number} \u2014 {sheet?.sheet_title}
          </span>
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: saved ? '#3DD68C' : '#F0B429', marginRight: 8, alignSelf: 'center' }}>
              {saved ? '\u2713 Saved' : '\u25CF Unsaved'}
            </span>
            <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} style={topBtnStyle}>\u2212</button>
            <span style={{ fontSize: 12, color: '#8b949e', padding: '4px 8px', alignSelf: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} style={topBtnStyle}>+</button>
            <button onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }) }} style={{ ...topBtnStyle, color: '#8b949e' }}>Reset</button>
            <button onClick={undo} style={{ ...topBtnStyle, color: '#8b949e' }}>Undo</button>
            <button onClick={clearAll} style={{ ...topBtnStyle, color: '#F85149' }}>Clear</button>
            <button onClick={() => setShowPins(v => !v)} style={{
              ...topBtnStyle,
              background: showPins ? 'rgba(248,81,73,.15)' : '#21262d',
              border: `1px solid ${showPins ? '#F85149' : '#30363d'}`,
              color: showPins ? '#F85149' : '#8b949e',
            }}>RFI Pins</button>
            <button onClick={() => setShowRevisions(v => !v)} style={{ ...topBtnStyle, color: '#8b949e' }}>
              Revisions ({revisions.length})
            </button>
            <button
              onClick={saveMarkups}
              disabled={saving || saved}
              style={{
                background: saved ? '#21262d' : '#D4A017',
                border: 'none', color: saved ? '#8b949e' : '#0d1117',
                borderRadius: 6, padding: '4px 14px',
                cursor: saving ? 'wait' : 'pointer', fontSize: 12, fontWeight: 700,
              }}
            >{saving ? '...' : 'Save'}</button>
            <button onClick={exportWithMarkups} style={topBtnStyle}>Export PNG</button>
          </div>
        </div>

        {/* PDF page controls */}
        {numPages > 1 && (
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(22,27,34,.9)', border: '1px solid #30363d', borderRadius: 8,
            padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 10, zIndex: 10,
          }}>
            <button onClick={() => goToPage(pageNum - 1)} style={{
              background: 'transparent', border: 'none', color: '#e6edf3', cursor: 'pointer',
            }}>\u25C0</button>
            <span style={{ fontSize: 13, color: '#e6edf3' }}>Page {pageNum} of {numPages}</span>
            <button onClick={() => goToPage(pageNum + 1)} style={{
              background: 'transparent', border: 'none', color: '#e6edf3', cursor: 'pointer',
            }}>\u25B6</button>
          </div>
        )}

        {/* Canvas layers */}
        <div style={{ position: 'absolute', top: 48, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
          <div style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            transformOrigin: '0 0', position: 'relative', display: 'inline-block',
          }}>
            <canvas ref={canvasRef} style={{ display: 'block' }} />
            <canvas ref={overlayRef} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />

            {/* RFI Pins layer */}
            {showPins && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                {rfiPins.map(pin => {
                  const canvas = canvasRef.current
                  if (!canvas) return null
                  const xPos = pin.x_pct * canvas.width
                  const yPos = pin.y_pct * canvas.height
                  const isOpen = selectedPin?.id === pin.id
                  return (
                    <div key={pin.id}
                      onClick={(ev) => { ev.stopPropagation(); setSelectedPin(isOpen ? null : pin) }}
                      style={{ position: 'absolute', left: xPos - 14, top: yPos - 28, pointerEvents: 'all', cursor: 'pointer' }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: '50% 50% 50% 0',
                        transform: 'rotate(-45deg)',
                        background: pin.rfis?.status === 'closed' ? '#3DD68C' : '#F85149',
                        border: '2px solid #fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,.4)',
                      }}>
                        <span style={{ transform: 'rotate(45deg)', fontSize: 9, fontWeight: 800, color: '#fff' }}>
                          R{pin.rfis?.rfi_number || '?'}
                        </span>
                      </div>
                      {isOpen && (
                        <div style={{
                          position: 'absolute', left: 32, top: -4, background: '#161b22',
                          border: '1px solid #30363d', borderRadius: 8, padding: '10px 14px',
                          minWidth: 200, zIndex: 20, pointerEvents: 'all',
                          boxShadow: '0 4px 16px rgba(0,0,0,.5)',
                        }}>
                          <p style={{ fontSize: 11, color: '#8b949e', margin: '0 0 4px', textTransform: 'uppercase', fontWeight: 700 }}>
                            RFI #{pin.rfis?.rfi_number}
                          </p>
                          <p style={{ fontSize: 13, color: '#e6edf3', margin: '0 0 8px', fontWeight: 700 }}>
                            {pin.rfis?.subject}
                          </p>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <a href={`/app/projects/${projectId}/rfis/${pin.rfi_id}`}
                              style={{ fontSize: 11, color: '#D4A017', textDecoration: 'none' }}>
                              Open RFI \u2192
                            </a>
                            <button
                              onClick={() => {
                                fetch(`/api/drawings/rfi-pins/${sheetId}?pinId=${pin.id}`, { method: 'DELETE' })
                                setRfiPins(p => p.filter(x => x.id !== pin.id))
                                setSelectedPin(null)
                              }}
                              style={{ fontSize: 11, color: '#F85149', background: 'transparent', border: 'none', cursor: 'pointer' }}
                            >Remove</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Drawing interaction overlay */}
            <div
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onDoubleClick={handleDoubleClick}
            />
          </div>
        </div>
      </div>

      {/* ─── Right panel ─── */}
      {(showRevisions || tool === 'pin') && (
        <div style={{
          width: 280, background: '#161b22', borderLeft: '1px solid #30363d',
          padding: 16, overflowY: 'auto',
        }}>
          {tool === 'pin' && (
            <div style={{ marginBottom: showRevisions ? 24 : 0 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e6edf3', margin: '0 0 12px' }}>
                Place RFI Pin
              </h3>
              <p style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
                Select an RFI then click on the drawing to place a pin.
              </p>
              <select
                value={selectedRFIForPin}
                onChange={e => setSelectedRFIForPin(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', background: '#0d1117',
                  border: '1px solid #30363d', borderRadius: 8, color: '#e6edf3', fontSize: 13, marginBottom: 8,
                }}
              >
                <option value="">Select RFI...</option>
                {rfis.map(r => (
                  <option key={r.id} value={r.id}>
                    #{r.rfi_number} \u2014 {(r.subject || '').slice(0, 40)}
                  </option>
                ))}
              </select>
              {selectedRFIForPin && (
                <p style={{ fontSize: 11, color: '#3DD68C' }}>
                  Click anywhere on the drawing to place the pin
                </p>
              )}
            </div>
          )}

          {showRevisions && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e6edf3', margin: 0 }}>Revision History</h3>
                <button onClick={() => setShowRevisionModal(true)} style={{
                  background: '#D4A017', color: '#0d1117', border: 'none', borderRadius: 6,
                  padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}>+ New Rev</button>
              </div>
              {revisions.map(rev => (
                <div key={rev.id} style={{
                  background: '#0d1117',
                  border: `1px solid ${rev.is_current ? '#D4A017' : '#30363d'}`,
                  borderRadius: 8, padding: '10px 12px', marginBottom: 8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3' }}>Rev {rev.revision_number}</span>
                    {rev.is_current && <span style={{ fontSize: 10, color: '#D4A017', fontWeight: 700 }}>CURRENT</span>}
                  </div>
                  {rev.issued_date && (
                    <p style={{ fontSize: 11, color: '#8b949e', margin: '0 0 4px' }}>
                      Issued: {new Date(rev.issued_date).toLocaleDateString()}
                    </p>
                  )}
                  {rev.change_description && (
                    <p style={{ fontSize: 11, color: '#8b949e', margin: 0, lineHeight: 1.5 }}>
                      {rev.change_description}
                    </p>
                  )}
                  {!rev.is_current && (
                    <button onClick={() => loadPDF(rev.file_url)} style={{
                      fontSize: 11, color: '#4299E1', background: 'transparent',
                      border: 'none', cursor: 'pointer', marginTop: 4,
                    }}>View this revision</button>
                  )}
                </div>
              ))}
              {revisions.length === 0 && (
                <p style={{ fontSize: 12, color: '#6e7681' }}>No revisions yet.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── New Revision Modal ─── */}
      {showRevisionModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            background: '#161b22', border: '1px solid #30363d',
            borderRadius: 12, padding: 28, width: 440,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 20 }}>
              Issue New Drawing Revision
            </h3>
            {([
              { label: 'Revision Number', key: 'revision_number' as const, placeholder: '3, A, B, C...' },
              { label: 'File URL (upload to storage first)', key: 'file_url' as const, placeholder: 'https://...' },
              { label: 'File Name', key: 'file_name' as const, placeholder: 'A101-Rev3.pdf' },
              { label: 'Issued Date', key: 'issued_date' as const, placeholder: '', inputType: 'date' },
              { label: 'Change Description', key: 'change_description' as const, placeholder: 'What changed?' },
            ]).map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#8b949e', display: 'block', marginBottom: 4 }}>
                  {f.label}
                </label>
                <input
                  type={f.inputType || 'text'}
                  value={revForm[f.key]}
                  placeholder={f.placeholder}
                  onChange={e => setRevForm(v => ({ ...v, [f.key]: e.target.value }))}
                  style={modalInputStyle}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setShowRevisionModal(false)} style={{
                background: 'transparent', border: '1px solid #30363d', color: '#8b949e',
                borderRadius: 6, padding: '8px 16px', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={submitRevision} style={{
                background: '#D4A017', color: '#0d1117', border: 'none',
                borderRadius: 6, padding: '8px 16px', fontWeight: 700, cursor: 'pointer',
              }}>Issue Revision</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
