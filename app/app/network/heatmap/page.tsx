'use client'
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'

// ─── Theme tokens ──────────────────────────────────────────────────────────────
const GOLD = '#D4A017', DARK = '#0d1117', CARD = '#161b22', BORDER = '#30363d'
const DIM = '#8b949e', TEXT = '#e6edf3', HOVER = '#1c2129'

// ─── Types ─────────────────────────────────────────────────────────────────────
interface APData {
  id: string; label: string; x_pct: number; y_pct: number
  vendor: string; model: string; ap_status: 'planned' | 'installed' | 'active' | 'offline'
  ssid: string; frequency: '2.4GHz' | '5GHz' | '6GHz' | 'Dual'
  channel_5g: number; channel_2g: number; tx_power_dbm: number; antenna_gain_dbi: number
  mounting: string; height_ft: number; floor: number
  poe_switch_port: string; cable_run_ft: number; ip_address: string; mac_address: string
  notes: string; installation_notes: string
  connected_clients: number; throughput_mbps: number; cpu_pct: number; memory_pct: number
  last_seen: string
}

interface WallSegment {
  id: string; x1_pct: number; y1_pct: number; x2_pct: number; y2_pct: number
  material: string; attenuation_db: number
}

interface SurveyPoint {
  id: string; x_pct: number; y_pct: number; rssi_dbm: number
}

interface HeatmapData {
  id: string; name: string; project_id: string | null
  floor_plan_url: string | null; floor_plan_width: number; floor_plan_height: number
  ap_placements: APData[]; walls: WallSegment[]; survey_points: SurveyPoint[]
  coverage_percent: number; dead_zones: number
  scale_px_per_ft?: number
}

interface ClientData {
  hostname: string; mac: string; ip: string; rssi_dbm: number
  tx_rate_mbps: number; rx_rate_mbps: number; frequency: string; channel: number
  data_usage_mb: number; connected_seconds: number; device_type: string
}

interface DeadZone {
  id: string; centroid: { x: number; y: number }; pixels: { x: number; y: number }[]
  area_sqft: number; label: string
}

type Tool = 'select' | 'addAP' | 'moveAP' | 'drawWall' | 'eraseWall' | 'survey' | 'calibrate'

// ─── Constants ─────────────────────────────────────────────────────────────────
const WALL_ATTENUATION: Record<string, number> = {
  drywall: 3, wood: 5, brick: 10, concrete: 15, glass: 2, metal: 25
}

const VENDOR_COLORS: Record<string, string> = {
  Ubiquiti: '#0066cc', Cisco: '#049fd9', Meraki: '#049fd9', SonicWall: '#ff6600',
  CheckPoint: '#cc0000', Netgear: '#cc0000', Fortinet: '#ee3124',
  'HPE Aruba': '#ff8300', Ruckus: '#007dc6', 'TP-Link': '#1eb3e0', Default: '#6e7681'
}

const STATUS_COLORS: Record<string, string> = {
  planned: '#484f58', installed: '#388bfd', active: '#2ea043', offline: '#f85149', error: '#d29922'
}

const VENDOR_MODELS: Record<string, string[]> = {
  Ubiquiti: ['U6 Pro', 'U6 LR', 'U6 Mesh', 'U6 Lite', 'UDM Pro', 'U6 Enterprise'],
  Cisco: ['MR36', 'MR46', 'MR76', 'MR56', 'C9120AXI'],
  Meraki: ['MR36', 'MR46', 'MR76', 'MR56'],
  SonicWall: ['SonicWave 641', 'SonicWave 621', 'SonicWave 681'],
  Fortinet: ['FAP-431G', 'FAP-231G', 'FAP-233G'],
  'HPE Aruba': ['AP-515', 'AP-535', 'AP-555', 'AP-635'],
  Ruckus: ['R850', 'R750', 'R650', 'R550'],
  'TP-Link': ['EAP670', 'EAP660 HD', 'EAP610'],
}

const CHANNELS_5G = [36,40,44,48,52,100,104,108,112,116,120,124,128,132,136,140,149,153,157,161,165]
const CHANNELS_2G = [1,2,3,4,5,6,7,8,9,10,11]
const TX_POWER_OPTIONS = [6,8,10,12,14,16,17,18,19,20,21,22,23]

// ─── Signal Physics ────────────────────────────────────────────────────────────
function calculateRSSI(
  txPowerDbm: number, antennaGainDbi: number, frequencyMHz: number,
  distanceFt: number, wallAttenuationDb: number
): number {
  if (distanceFt <= 0.1) return txPowerDbm + antennaGainDbi
  const distanceM = distanceFt * 0.3048
  const pathLossDb = 20 * Math.log10(distanceM) + 20 * Math.log10(frequencyMHz) + 32.44
  return txPowerDbm + antennaGainDbi - pathLossDb - wallAttenuationDb
}

function lineSegmentsIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): boolean {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(denom) < 1e-10) return false
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

function calculateWallAttenuation(
  x1_pct: number, y1_pct: number, x2_pct: number, y2_pct: number, walls: WallSegment[]
): number {
  let total = 0
  for (const w of walls) {
    if (lineSegmentsIntersect(x1_pct, y1_pct, x2_pct, y2_pct,
      w.x1_pct, w.y1_pct, w.x2_pct, w.y2_pct)) {
      total += w.attenuation_db
    }
  }
  return total
}

// ─── Heat Map Renderer ─────────────────────────────────────────────────────────
function renderHeatmap(
  canvas: HTMLCanvasElement, aps: APData[], walls: WallSegment[],
  surveyPoints: SurveyPoint[], scalePxPerFt: number, threshold: number, opacity: number
): { coveragePct: number } {
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  const step = 6
  let covered = 0, total = 0

  for (let px = 0; px < W; px += step) {
    for (let py = 0; py < H; py += step) {
      total++
      let bestRSSI = -120

      for (const ap of aps) {
        if (ap.ap_status === 'planned') continue
        const apX = ap.x_pct * W, apY = ap.y_pct * H
        const distPx = Math.sqrt((px - apX) ** 2 + (py - apY) ** 2)
        const distFt = distPx / scalePxPerFt
        const freqMHz = ap.frequency === '2.4GHz' ? 2437 : ap.frequency === '6GHz' ? 6000 : 5500
        const wallAtten = calculateWallAttenuation(px / W, py / H, ap.x_pct, ap.y_pct, walls)
        const rssi = calculateRSSI(ap.tx_power_dbm, ap.antenna_gain_dbi, freqMHz, Math.max(distFt, 0.1), wallAtten)
        if (rssi > bestRSSI) bestRSSI = rssi
      }

      for (const sp of surveyPoints) {
        const spX = sp.x_pct * W, spY = sp.y_pct * H
        const dist = Math.sqrt((px - spX) ** 2 + (py - spY) ** 2)
        if (dist < 50) {
          const w = 1 - dist / 50
          bestRSSI = bestRSSI * (1 - w) + sp.rssi_dbm * w
        }
      }

      if (bestRSSI >= threshold) covered++

      let color: string
      if (bestRSSI >= -50) color = 'rgba(0,200,80,0.75)'
      else if (bestRSSI >= -60) color = 'rgba(80,200,0,0.70)'
      else if (bestRSSI >= -67) color = 'rgba(200,200,0,0.65)'
      else if (bestRSSI >= -75) color = 'rgba(255,140,0,0.65)'
      else if (bestRSSI >= -82) color = 'rgba(220,60,0,0.70)'
      else color = 'rgba(120,0,0,0.80)'

      ctx.fillStyle = color
      ctx.fillRect(px - 1, py - 1, step + 2, step + 2)
    }
  }

  canvas.style.opacity = String(opacity)
  return { coveragePct: total > 0 ? (covered / total) * 100 : 0 }
}

// ─── AP Renderer ───────────────────────────────────────────────────────────────
function renderAPs(
  canvas: HTMLCanvasElement, aps: APData[], selectedId: string | null,
  hoveredId: string | null, scalePxPerFt: number
) {
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)

  for (const ap of aps) {
    const cx = ap.x_pct * W, cy = ap.y_pct * H
    const isSelected = ap.id === selectedId
    const isHovered = ap.id === hoveredId

    // Coverage radius ring (selected only)
    if (isSelected) {
      const freqMHz = ap.frequency === '2.4GHz' ? 2437 : ap.frequency === '6GHz' ? 6000 : 5500
      // Inverse FSPL: distance where RSSI = -75
      const targetRSSI = -75
      const maxPathLoss = ap.tx_power_dbm + ap.antenna_gain_dbi - targetRSSI
      const distanceM = Math.pow(10, (maxPathLoss - 32.44 - 20 * Math.log10(freqMHz)) / 20)
      const distanceFt = distanceM / 0.3048
      const radiusPx = distanceFt * scalePxPerFt
      ctx.beginPath()
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2)
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = 'rgba(212,160,23,0.5)'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Status ring
    ctx.beginPath()
    ctx.arc(cx, cy, 18, 0, Math.PI * 2)
    ctx.strokeStyle = STATUS_COLORS[ap.ap_status] || '#484f58'
    ctx.lineWidth = 3
    ctx.stroke()

    // Vendor circle
    ctx.beginPath()
    ctx.arc(cx, cy, 14, 0, Math.PI * 2)
    ctx.fillStyle = VENDOR_COLORS[ap.vendor] || VENDOR_COLORS.Default
    ctx.fill()

    // WiFi symbol (3 arcs + dot)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    for (let i = 0; i < 3; i++) {
      const r = 4 + i * 3
      ctx.beginPath()
      ctx.arc(cx, cy + 2, r, -Math.PI * 0.75, -Math.PI * 0.25)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(cx, cy + 2, 1.5, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()

    // Status dot bottom-right
    ctx.beginPath()
    ctx.arc(cx + 12, cy + 12, 5, 0, Math.PI * 2)
    ctx.fillStyle = STATUS_COLORS[ap.ap_status] || '#484f58'
    ctx.fill()
    ctx.strokeStyle = DARK
    ctx.lineWidth = 2
    ctx.stroke()

    // Label above
    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif'
    const labelW = ctx.measureText(ap.label).width + 12
    ctx.fillStyle = 'rgba(13,17,23,0.85)'
    const rx = cx - labelW / 2, ry = cy - 34
    ctx.beginPath()
    ctx.roundRect(rx, ry, labelW, 18, 9)
    ctx.fill()
    ctx.fillStyle = TEXT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ap.label, cx, ry + 9)

    // Client count bubble (active with clients > 0)
    if (ap.ap_status === 'active' && ap.connected_clients > 0) {
      const bx = cx - 14, by = cy - 14
      ctx.beginPath()
      ctx.arc(bx, by, 9, 0, Math.PI * 2)
      ctx.fillStyle = ap.connected_clients <= 15 ? '#2ea043' : ap.connected_clients <= 30 ? '#d29922' : '#f85149'
      ctx.fill()
      ctx.font = 'bold 8px -apple-system, sans-serif'
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(ap.connected_clients), bx, by)
    }

    // Frequency badge (hover/selected)
    if (isHovered || isSelected) {
      const freq = ap.frequency
      const badgeBg = freq === '2.4GHz' ? '#8b5cf6' : freq === '6GHz' ? '#059669' : '#2563eb'
      ctx.font = '9px -apple-system, sans-serif'
      const fw = ctx.measureText(freq).width + 8
      ctx.fillStyle = badgeBg
      ctx.beginPath()
      ctx.roundRect(cx - fw / 2, cy + 22, fw, 14, 4)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(freq, cx, cy + 29)
    }
  }
  ctx.textAlign = 'start'
  ctx.textBaseline = 'alphabetic'
}

// ─── Legend for Export ──────────────────────────────────────────────────────────
function drawLegend(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const lx = 10, ly = H - 140, lw = 168, lh = 130
  ctx.fillStyle = 'rgba(13,17,23,0.88)'
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(lx, ly, lw, lh, 6)
  else ctx.rect(lx, ly, lw, lh)
  ctx.fill()
  ctx.strokeStyle = '#30363d'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillStyle = '#e6edf3'
  ctx.textAlign = 'left'
  ctx.fillText('Signal Strength', lx + 8, ly + 18)
  const items = [
    { color: '#00c850', label: 'Excellent  \u2265 \u221250 dBm' },
    { color: '#50c800', label: 'Very Good  \u2265 \u221260 dBm' },
    { color: '#c8c800', label: 'Good        \u2265 \u221267 dBm' },
    { color: '#ff8c00', label: 'Fair          \u2265 \u221275 dBm' },
    { color: '#dc3c00', label: 'Poor         \u2265 \u221282 dBm' },
    { color: '#780000', label: 'Dead Zone' },
  ]
  items.forEach((item, i) => {
    ctx.fillStyle = item.color
    ctx.fillRect(lx + 8, ly + 26 + i * 16, 12, 12)
    ctx.font = '10px -apple-system, sans-serif'
    ctx.fillStyle = '#8b949e'
    ctx.fillText(item.label, lx + 26, ly + 36 + i * 16)
  })
}

// ─── Unified pointer helper ───────────────────────────────────────────────────
function getCanvasPoint(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const source = 'touches' in e ? e.touches[0] : e
  return {
    x: (source.clientX - rect.left) * scaleX,
    y: (source.clientY - rect.top) * scaleY,
    xPct: (source.clientX - rect.left) / rect.width,
    yPct: (source.clientY - rect.top) / rect.height,
  }
}

// ─── Default AP factory ────────────────────────────────────────────────────────
function createDefaultAP(xPct: number, yPct: number, index: number): APData {
  return {
    id: crypto.randomUUID(), label: `AP-${String(index).padStart(2, '0')}`,
    x_pct: xPct, y_pct: yPct, vendor: 'Ubiquiti', model: 'U6 Pro',
    ap_status: 'planned', ssid: '', frequency: '5GHz',
    channel_5g: 36, channel_2g: 1, tx_power_dbm: 20, antenna_gain_dbi: 3.0,
    mounting: 'ceiling', height_ft: 10, floor: 1,
    poe_switch_port: '', cable_run_ft: 0, ip_address: '', mac_address: '',
    notes: '', installation_notes: '',
    connected_clients: 0, throughput_mbps: 0, cpu_pct: 0, memory_pct: 0, last_seen: ''
  }
}

// ─── Install step generators ───────────────────────────────────────────────────
function getInstallSteps(ap: APData): string[] {
  if (ap.vendor === 'Ubiquiti') return [
    'Mount bracket on ceiling (lag screws into joist)',
    `Run Cat6 from PoE switch port ${ap.poe_switch_port || '[TBD]'}`,
    `Label cable at both ends: ${ap.label}`,
    'Connect Cat6 to AP \u2014 LED pulses white while booting',
    'Adopt in UniFi controller \u2192 Devices \u2192 Pending Adoption',
    `Set AP name to ${ap.label} in controller`,
    'Verify LED solid white = active and adopted',
    'Test WiFi at 50ft \u2014 confirm signal \u2265 -65dBm'
  ]
  if (ap.vendor === 'Cisco' || ap.vendor === 'Meraki') return [
    'Mount AP to ceiling with provided bracket',
    `Run Cat6 to PoE switch port ${ap.poe_switch_port || '[TBD]'}`,
    'Connect cable \u2014 LED cycles through colors while claiming',
    'Log into dashboard.meraki.com',
    'Navigate to Network \u2192 Wireless \u2192 Access points',
    'Find AP by serial number \u2014 click Configure',
    `Name AP ${ap.label}`,
    'Verify green LED = connected to Meraki cloud'
  ]
  return [
    'Mount AP at designated location',
    `Run Cat6 from PoE switch port ${ap.poe_switch_port || '[TBD]'}`,
    `Label cable: ${ap.label}`,
    'Connect cable and verify power LED',
    'Configure via vendor management console',
    'Verify connectivity and run signal test'
  ]
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function WiFiHeatMapPage() {
  // ─── State ─────────────────────────────────────────────────────────────────
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null)
  const [aps, setAps] = useState<APData[]>([])
  const [walls, setWalls] = useState<WallSegment[]>([])
  const [surveyPoints, setSurveyPoints] = useState<SurveyPoint[]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [selectedAP, setSelectedAP] = useState<string | null>(null)
  const [hoveredAP, setHoveredAP] = useState<string | null>(null)
  const [panelTab, setPanelTab] = useState<'details' | 'install' | 'clients'>('details')
  const [showPanel, setShowPanel] = useState(false)
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.7)
  const [coverageThreshold, setCoverageThreshold] = useState(-75)
  const [coveragePct, setCoveragePct] = useState(0)
  const [scalePxPerFt, setScalePxPerFt] = useState(5)
  const [floorPlanImage, setFloorPlanImage] = useState<HTMLImageElement | null>(null)
  const [canvasWidth, setCanvasWidth] = useState(1200)
  const [canvasHeight, setCanvasHeight] = useState(700)
  const [mapName, setMapName] = useState('New Heat Map')
  const [editingName, setEditingName] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [creatingNew, setCreatingNew] = useState(false)

  // Tool state
  const [drawWallStart, setDrawWallStart] = useState<{ x: number; y: number } | null>(null)
  const [wallMaterial, setWallMaterial] = useState('drywall')
  const [movingAP, setMovingAP] = useState<string | null>(null)
  const [calibrationStep, setCalibrationStep] = useState(0)
  const [calibrationPoints, setCalibrationPoints] = useState<{ x: number; y: number }[]>([])
  const [showSurveyInput, setShowSurveyInput] = useState(false)
  const [surveyInputPos, setSurveyInputPos] = useState({ xPct: 0, yPct: 0 })
  const [surveyRSSI, setSurveyRSSI] = useState(-60)
  const [showWallTypePopup, setShowWallTypePopup] = useState(false)
  const [pendingWall, setPendingWall] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [calibrationFeetInput, setCalibrationFeetInput] = useState('')
  const [showCalibrationInput, setShowCalibrationInput] = useState(false)

  // Add AP form
  const [showAddAPForm, setShowAddAPForm] = useState(false)
  const [newAPData, setNewAPData] = useState<APData>(createDefaultAP(0.5, 0.5, 1))

  // Dead zones
  const [deadZones, setDeadZones] = useState<DeadZone[]>([])
  const [showDeadZones, setShowDeadZones] = useState(false)
  const [ghostAPs, setGhostAPs] = useState<{ x: number; y: number }[]>([])

  // Clients
  const [clients, setClients] = useState<ClientData[]>([])

  // Install state
  const [installChecks, setInstallChecks] = useState<Record<string, boolean[]>>({})

  // Refs
  const floorCanvasRef = useRef<HTMLCanvasElement>(null)
  const heatmapCanvasRef = useRef<HTMLCanvasElement>(null)
  const apCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const renderTimeout = useRef<ReturnType<typeof setTimeout>>()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const projectId = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('projectId') || ''
  }, [])

  // ─── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/network/heatmaps?project_id=${projectId}`)
        const json = await res.json()
        const list = json.data || json.surveys || []
        if (list.length > 0) {
          const h = list[0] as HeatmapData
          setHeatmap(h)
          setMapName(h.name)
          setAps(h.ap_placements || [])
          setWalls(h.walls || [])
          setSurveyPoints(h.survey_points || [])
          if (h.scale_px_per_ft) setScalePxPerFt(h.scale_px_per_ft)
          if (h.floor_plan_url) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = h.floor_plan_url
            img.onload = () => setFloorPlanImage(img)
          }
        }
      } catch { /* first visit — no data yet */ }
      setLoading(false)
    }
    load()
  }, [projectId])

  // ─── Canvas sizing ─────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width)
        const h = Math.max(500, Math.floor(window.innerHeight - 130))
        setCanvasWidth(w)
        setCanvasHeight(h)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // ─── Floor plan render ─────────────────────────────────────────────────────
  const renderFloorPlan = useCallback(() => {
    const canvas = floorCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Background
    ctx.fillStyle = '#1a1f2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Floor plan image
    if (floorPlanImage) {
      ctx.drawImage(floorPlanImage, 0, 0, canvas.width, canvas.height)
    } else {
      // Grid
      ctx.strokeStyle = 'rgba(48,54,61,0.3)'
      ctx.lineWidth = 0.5
      for (let x = 0; x < canvas.width; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke() }
      for (let y = 0; y < canvas.height; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke() }
    }

    // Wall segments
    for (const w of walls) {
      ctx.beginPath()
      ctx.moveTo(w.x1_pct * canvas.width, w.y1_pct * canvas.height)
      ctx.lineTo(w.x2_pct * canvas.width, w.y2_pct * canvas.height)
      const matColor = w.material === 'concrete' ? '#ef4444' : w.material === 'metal' ? '#8b5cf6'
        : w.material === 'brick' ? '#f97316' : w.material === 'glass' ? '#06b6d4'
        : w.material === 'wood' ? '#a3e635' : '#94a3b8'
      ctx.strokeStyle = matColor
      ctx.lineWidth = w.material === 'metal' || w.material === 'concrete' ? 4 : 3
      ctx.stroke()
    }

    // Draw wall preview
    if (drawWallStart && tool === 'drawWall') {
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(drawWallStart.x, drawWallStart.y)
      // Preview line will be drawn on mouse move
      ctx.setLineDash([])
    }

    // Survey points
    for (const sp of surveyPoints) {
      const sx = sp.x_pct * canvas.width, sy = sp.y_pct * canvas.height
      ctx.beginPath()
      ctx.arc(sx, sy, 6, 0, Math.PI * 2)
      ctx.fillStyle = sp.rssi_dbm >= -50 ? '#00c850' : sp.rssi_dbm >= -67 ? '#c8c800'
        : sp.rssi_dbm >= -75 ? '#ff8c00' : '#dc3c00'
      ctx.fill()
      ctx.strokeStyle = DARK
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.font = '9px -apple-system, sans-serif'
      ctx.fillStyle = TEXT
      ctx.textAlign = 'center'
      ctx.fillText(`${sp.rssi_dbm}`, sx, sy - 10)
    }
    ctx.textAlign = 'start'

    // Ghost APs for dead zone suggestions
    if (showDeadZones) {
      for (const g of ghostAPs) {
        ctx.beginPath()
        ctx.arc(g.x * canvas.width, g.y * canvas.height, 18, 0, Math.PI * 2)
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.setLineDash([])
        // Plus icon
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(g.x * canvas.width - 6, g.y * canvas.height)
        ctx.lineTo(g.x * canvas.width + 6, g.y * canvas.height)
        ctx.moveTo(g.x * canvas.width, g.y * canvas.height - 6)
        ctx.lineTo(g.x * canvas.width, g.y * canvas.height + 6)
        ctx.stroke()
      }
    }
  }, [floorPlanImage, walls, surveyPoints, drawWallStart, tool, showDeadZones, ghostAPs])

  // ─── Auto-render heat map (debounced) ──────────────────────────────────────
  useEffect(() => {
    if (renderTimeout.current) clearTimeout(renderTimeout.current)
    renderTimeout.current = setTimeout(() => {
      renderFloorPlan()
      if (showHeatmap && heatmapCanvasRef.current && aps.length > 0) {
        setCalculating(true)
        requestAnimationFrame(() => {
          const result = renderHeatmap(
            heatmapCanvasRef.current!, aps, walls, surveyPoints,
            scalePxPerFt, coverageThreshold, heatmapOpacity
          )
          setCoveragePct(result.coveragePct)
          setCalculating(false)
        })
      } else if (heatmapCanvasRef.current) {
        const ctx = heatmapCanvasRef.current.getContext('2d')!
        ctx.clearRect(0, 0, heatmapCanvasRef.current.width, heatmapCanvasRef.current.height)
      }
      if (apCanvasRef.current) {
        renderAPs(apCanvasRef.current, aps, selectedAP, hoveredAP, scalePxPerFt)
      }
    }, 500)
    return () => { if (renderTimeout.current) clearTimeout(renderTimeout.current) }
  }, [aps, walls, surveyPoints, showHeatmap, heatmapOpacity, coverageThreshold, scalePxPerFt,
      canvasWidth, canvasHeight, selectedAP, hoveredAP, renderFloorPlan])

  // ─── Save to DB ────────────────────────────────────────────────────────────
  const saveHeatmap = useCallback(async (data?: Partial<HeatmapData>) => {
    setSaving(true)
    try {
      const payload = {
        name: mapName,
        project_id: projectId || null,
        ap_placements: aps,
        walls,
        survey_points: surveyPoints,
        coverage_percent: coveragePct,
        scale_px_per_ft: scalePxPerFt,
        ...data
      }
      if (heatmap?.id) {
        const res = await fetch(`/api/network/heatmaps/${heatmap.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        const json = await res.json()
        if (json.data) setHeatmap(json.data)
      } else {
        const res = await fetch('/api/network/heatmaps', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        const json = await res.json()
        if (json.data) setHeatmap(json.data)
      }
    } catch { /* toast */ }
    setSaving(false)
  }, [mapName, projectId, aps, walls, surveyPoints, coveragePct, scalePxPerFt, heatmap])

  // ─── Find nearest AP ──────────────────────────────────────────────────────
  function findNearestAP(xPct: number, yPct: number, maxDist = 0.03): APData | null {
    let nearest: APData | null = null, minDist = maxDist
    for (const ap of aps) {
      const d = Math.sqrt((xPct - ap.x_pct) ** 2 + (yPct - ap.y_pct) ** 2)
      if (d < minDist) { minDist = d; nearest = ap }
    }
    return nearest
  }

  // ─── Find nearest wall ────────────────────────────────────────────────────
  function findNearestWall(xPct: number, yPct: number): WallSegment | null {
    let nearest: WallSegment | null = null, minDist = 0.02
    for (const w of walls) {
      // Point to line segment distance
      const dx = w.x2_pct - w.x1_pct, dy = w.y2_pct - w.y1_pct
      const len2 = dx * dx + dy * dy
      let t = len2 === 0 ? 0 : Math.max(0, Math.min(1,
        ((xPct - w.x1_pct) * dx + (yPct - w.y1_pct) * dy) / len2))
      const px = w.x1_pct + t * dx, py = w.y1_pct + t * dy
      const d = Math.sqrt((xPct - px) ** 2 + (yPct - py) ** 2)
      if (d < minDist) { minDist = d; nearest = w }
    }
    return nearest
  }

  // ─── Pointer handlers ─────────────────────────────────────────────────────
  function handlePointerDown(e: React.MouseEvent | React.TouchEvent) {
    const canvas = apCanvasRef.current
    if (!canvas) return
    const pt = getCanvasPoint(e, canvas)

    if (tool === 'select') {
      const ap = findNearestAP(pt.xPct, pt.yPct)
      if (ap) {
        setSelectedAP(ap.id)
        setShowPanel(true)
        setPanelTab('details')
      } else {
        setSelectedAP(null)
        setShowPanel(false)
      }
    } else if (tool === 'addAP') {
      setNewAPData(createDefaultAP(pt.xPct, pt.yPct, aps.length + 1))
      setShowAddAPForm(true)
    } else if (tool === 'moveAP') {
      const ap = findNearestAP(pt.xPct, pt.yPct)
      if (ap) setMovingAP(ap.id)
    } else if (tool === 'drawWall') {
      if (!drawWallStart) {
        setDrawWallStart({ x: pt.xPct, y: pt.yPct })
      } else {
        setPendingWall({ x1: drawWallStart.x, y1: drawWallStart.y, x2: pt.xPct, y2: pt.yPct })
        setShowWallTypePopup(true)
        setDrawWallStart(null)
      }
    } else if (tool === 'eraseWall') {
      const w = findNearestWall(pt.xPct, pt.yPct)
      if (w) {
        setWalls(prev => prev.filter(wall => wall.id !== w.id))
      }
    } else if (tool === 'survey') {
      setSurveyInputPos({ xPct: pt.xPct, yPct: pt.yPct })
      setShowSurveyInput(true)
    } else if (tool === 'calibrate') {
      if (calibrationStep === 0) {
        setCalibrationPoints([{ x: pt.xPct, y: pt.yPct }])
        setCalibrationStep(1)
      } else if (calibrationStep === 1) {
        setCalibrationPoints(prev => [...prev, { x: pt.xPct, y: pt.yPct }])
        setCalibrationStep(2)
        setShowCalibrationInput(true)
      }
    }

    // Ghost AP click
    if (showDeadZones) {
      for (const g of ghostAPs) {
        const dx = pt.xPct - g.x, dy = pt.yPct - g.y
        if (Math.sqrt(dx * dx + dy * dy) < 0.03) {
          setNewAPData(createDefaultAP(g.x, g.y, aps.length + 1))
          setShowAddAPForm(true)
          return
        }
      }
    }
  }

  function handlePointerMove(e: React.MouseEvent | React.TouchEvent) {
    const canvas = apCanvasRef.current
    if (!canvas) return
    const pt = getCanvasPoint(e, canvas)

    if (tool === 'moveAP' && movingAP) {
      setAps(prev => prev.map(ap => ap.id === movingAP ? { ...ap, x_pct: pt.xPct, y_pct: pt.yPct } : ap))
    } else if (tool === 'select' || tool === 'addAP') {
      const ap = findNearestAP(pt.xPct, pt.yPct)
      setHoveredAP(ap ? ap.id : null)
    }
  }

  function handlePointerUp() {
    if (movingAP) {
      setMovingAP(null)
      saveHeatmap()
    }
  }

  // ─── Wall type confirm ─────────────────────────────────────────────────────
  function confirmWallType(material: string) {
    if (!pendingWall) return
    const newWall: WallSegment = {
      id: crypto.randomUUID(),
      x1_pct: pendingWall.x1, y1_pct: pendingWall.y1,
      x2_pct: pendingWall.x2, y2_pct: pendingWall.y2,
      material, attenuation_db: WALL_ATTENUATION[material] || 5
    }
    setWalls(prev => [...prev, newWall])
    setShowWallTypePopup(false)
    setPendingWall(null)
  }

  // ─── Survey point confirm ─────────────────────────────────────────────────
  function confirmSurveyPoint() {
    const sp: SurveyPoint = {
      id: crypto.randomUUID(),
      x_pct: surveyInputPos.xPct, y_pct: surveyInputPos.yPct,
      rssi_dbm: surveyRSSI
    }
    setSurveyPoints(prev => [...prev, sp])
    setShowSurveyInput(false)
  }

  // ─── Calibration confirm ──────────────────────────────────────────────────
  function confirmCalibration() {
    const feet = parseFloat(calibrationFeetInput)
    if (!feet || calibrationPoints.length < 2) return
    const p1 = calibrationPoints[0], p2 = calibrationPoints[1]
    const pixelDist = Math.sqrt(
      ((p2.x - p1.x) * canvasWidth) ** 2 + ((p2.y - p1.y) * canvasHeight) ** 2
    )
    const newScale = pixelDist / feet
    setScalePxPerFt(newScale)
    setCalibrationStep(0)
    setCalibrationPoints([])
    setShowCalibrationInput(false)
    setCalibrationFeetInput('')
    setTool('select')
  }

  // ─── Add AP confirm ───────────────────────────────────────────────────────
  function confirmAddAP() {
    setAps(prev => [...prev, newAPData])
    setShowAddAPForm(false)
    setTool('select')
  }

  // ─── Delete AP ─────────────────────────────────────────────────────────────
  function deleteAP(id: string) {
    if (!confirm('Delete this access point?')) return
    setAps(prev => prev.filter(a => a.id !== id))
    setSelectedAP(null)
    setShowPanel(false)
  }

  // ─── Dead zone detection ───────────────────────────────────────────────────
  function detectDeadZones() {
    if (!heatmapCanvasRef.current) return
    setCalculating(true)
    requestAnimationFrame(() => {
      const W = canvasWidth, H = canvasHeight
      const step = 6
      const deadPixels: { x: number; y: number }[] = []

      for (let px = 0; px < W; px += step) {
        for (let py = 0; py < H; py += step) {
          let bestRSSI = -120
          for (const ap of aps) {
            if (ap.ap_status === 'planned') continue
            const apX = ap.x_pct * W, apY = ap.y_pct * H
            const distPx = Math.sqrt((px - apX) ** 2 + (py - apY) ** 2)
            const distFt = distPx / scalePxPerFt
            const freqMHz = ap.frequency === '2.4GHz' ? 2437 : ap.frequency === '6GHz' ? 6000 : 5500
            const wallAtten = calculateWallAttenuation(px / W, py / H, ap.x_pct, ap.y_pct, walls)
            const rssi = calculateRSSI(ap.tx_power_dbm, ap.antenna_gain_dbi, freqMHz, Math.max(distFt, 0.1), wallAtten)
            if (rssi > bestRSSI) bestRSSI = rssi
          }
          if (bestRSSI < coverageThreshold) deadPixels.push({ x: px, y: py })
        }
      }

      // Cluster dead pixels
      const clusters: { x: number; y: number }[][] = []
      const visited = new Set<number>()
      for (let i = 0; i < deadPixels.length; i++) {
        if (visited.has(i)) continue
        const cluster: { x: number; y: number }[] = [deadPixels[i]]
        visited.add(i)
        const queue = [i]
        while (queue.length > 0) {
          const ci = queue.shift()!
          const cp = deadPixels[ci]
          for (let j = 0; j < deadPixels.length; j++) {
            if (visited.has(j)) continue
            const dp = deadPixels[j]
            if (Math.abs(cp.x - dp.x) <= 30 && Math.abs(cp.y - dp.y) <= 30) {
              visited.add(j)
              cluster.push(dp)
              queue.push(j)
            }
          }
        }
        if (cluster.length >= 3) clusters.push(cluster)
      }

      const labels = ['Northwest', 'Northeast', 'Center', 'Southwest', 'Southeast', 'North', 'South', 'East', 'West']
      const zones: DeadZone[] = clusters.slice(0, 10).map((c, i) => {
        const avgX = c.reduce((s, p) => s + p.x, 0) / c.length / W
        const avgY = c.reduce((s, p) => s + p.y, 0) / c.length / H
        const areaSqFt = c.length * (step / scalePxPerFt) ** 2
        return {
          id: crypto.randomUUID(), centroid: { x: avgX, y: avgY },
          pixels: c, area_sqft: areaSqFt,
          label: `Zone ${i + 1} \u2014 ${labels[i] || 'Area'}`
        }
      })

      setDeadZones(zones)
      setGhostAPs(zones.map(z => ({ x: z.centroid.x, y: z.centroid.y })))
      setShowDeadZones(true)
      setCalculating(false)
    })
  }

  // ─── Export PNG ────────────────────────────────────────────────────────────
  function exportPNG() {
    const W = canvasWidth * 2, H2 = canvasHeight * 2
    const off = document.createElement('canvas')
    off.width = W; off.height = H2
    const ctx = off.getContext('2d')!
    ctx.scale(2, 2)

    if (floorPlanImage) ctx.drawImage(floorPlanImage, 0, 0, canvasWidth, canvasHeight)
    else { ctx.fillStyle = '#1a1f2e'; ctx.fillRect(0, 0, canvasWidth, canvasHeight) }

    if (heatmapCanvasRef.current) {
      const savedOpacity = heatmapCanvasRef.current.style.opacity
      heatmapCanvasRef.current.style.opacity = '1'
      ctx.drawImage(heatmapCanvasRef.current, 0, 0, canvasWidth, canvasHeight)
      heatmapCanvasRef.current.style.opacity = savedOpacity
    }
    if (apCanvasRef.current) ctx.drawImage(apCanvasRef.current, 0, 0, canvasWidth, canvasHeight)

    // Dark header bar
    ctx.fillStyle = 'rgba(13,17,23,0.92)'
    ctx.fillRect(0, 0, canvasWidth, 44)
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = '#e6edf3'
    ctx.fillText(heatmap?.name || 'Network Heat Map', 12, 28)
    ctx.font = '11px -apple-system, sans-serif'
    ctx.fillStyle = '#8b949e'
    ctx.textAlign = 'right'
    ctx.fillText(
      `Coverage: ${coveragePct.toFixed(1)}% above ${coverageThreshold}dBm  \u2022  ${new Date().toLocaleDateString()}  \u2022  Saguaro CRM`,
      canvasWidth - 12, 28
    )
    ctx.textAlign = 'left'

    drawLegend(ctx, canvasWidth, canvasHeight)

    // AP count bottom-right
    ctx.fillStyle = 'rgba(13,17,23,0.85)'
    ctx.fillRect(canvasWidth - 130, canvasHeight - 32, 118, 22)
    ctx.font = '11px -apple-system, sans-serif'
    ctx.fillStyle = '#8b949e'
    ctx.textAlign = 'right'
    ctx.fillText(`${aps.length} APs  \u2022  ${aps.reduce((s, a) => s + (a.connected_clients || 0), 0)} clients`, canvasWidth - 12, canvasHeight - 16)

    off.toBlob(blob => {
      const url = URL.createObjectURL(blob!)
      const a = document.createElement('a')
      a.href = url
      a.download = `heatmap-${(heatmap?.name || 'map').replace(/\s+/g, '-')}-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png', 0.95)
  }

  // ─── Export CSV ────────────────────────────────────────────────────────────
  function exportCSV() {
    const headers = ['Label', 'Vendor', 'Model', 'Status', 'SSID', 'Frequency', 'Channel', 'TX Power', 'X%', 'Y%', 'IP', 'MAC']
    const rows = aps.map(a => [a.label, a.vendor, a.model, a.ap_status, a.ssid, a.frequency,
      a.frequency === '2.4GHz' ? a.channel_2g : a.channel_5g, a.tx_power_dbm,
      (a.x_pct * 100).toFixed(1), (a.y_pct * 100).toFixed(1), a.ip_address, a.mac_address].join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `aps-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Floor plan upload ─────────────────────────────────────────────────────
  function handleFloorPlanUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => setFloorPlanImage(img)
      img.src = ev.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  // ─── Fetch clients for selected AP ─────────────────────────────────────────
  useEffect(() => {
    if (!selectedAP || panelTab !== 'clients') return
    async function loadClients() {
      try {
        const res = await fetch(`/api/network/access-points/${selectedAP}/clients`)
        const json = await res.json()
        setClients(json.data?.clients || [])
      } catch { setClients([]) }
    }
    loadClients()
  }, [selectedAP, panelTab])

  const selectedAPData = useMemo(() => aps.find(a => a.id === selectedAP), [aps, selectedAP])

  // ─── Install step tracking ─────────────────────────────────────────────────
  function toggleInstallStep(apId: string, stepIdx: number) {
    setInstallChecks(prev => {
      const steps = selectedAPData ? getInstallSteps(selectedAPData) : []
      const checks = prev[apId] || new Array(steps.length).fill(false)
      const next = [...checks]
      next[stepIdx] = !next[stepIdx]
      return { ...prev, [apId]: next }
    })
  }

  // ─── Button style helper ──────────────────────────────────────────────────
  const toolBtn = (t: Tool, icon: string, label: string) => (
    <button key={t} onClick={() => { setTool(t); if (t !== 'drawWall') setDrawWallStart(null); if (t === 'calibrate') { setCalibrationStep(0); setCalibrationPoints([]) } }}
      style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        background: tool === t ? 'rgba(212,160,23,.15)' : 'transparent', border: `1px solid ${tool === t ? 'rgba(212,160,23,.4)' : 'transparent'}`, color: tool === t ? GOLD : DIM,
      }}>
      <span>{icon}</span>{label}
    </button>
  )

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: DARK, color: DIM }}>Loading heat map...</div>

  // Empty state — no saved heatmap and user hasn't chosen to create one
  if (!heatmap && !creatingNew) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f0f1a', color: TEXT, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 520, width: '100%', background: '#16213e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
            {/* WiFi-signal mark (no emoji — per brand mandate) */}
            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#D4A017"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
              <path d="M2 8.8a15 15 0 0 1 20 0" />
              <path d="M5 12.3a10 10 0 0 1 14 0" />
              <path d="M8.4 15.6a5.4 5.4 0 0 1 7.2 0" />
              <circle cx="12" cy="18.6" r="1.15" fill="#D4A017" stroke="none" />
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: '0 0 10px' }}>No Heatmap Surveys Yet</h1>
          <p style={{ fontSize: 14, color: DIM, lineHeight: 1.6, margin: '0 0 28px' }}>
            Upload a floor plan and place access points to generate a WiFi coverage heatmap for this project.
          </p>
          <button
            onClick={() => setCreatingNew(true)}
            style={{
              padding: '12px 28px',
              background: '#D4A017',
              color: '#0f0f1a',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'filter 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
          >
            Create New Survey →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: DARK, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ═══ TOOLBAR ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: CARD, borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
        {/* Left — map name */}
        <button onClick={() => window.history.back()} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 16 }}>&larr;</button>
        <div style={{ marginRight: 12 }}>
          {editingName ? (
            <input autoFocus value={mapName} onChange={e => setMapName(e.target.value)}
              onBlur={() => { setEditingName(false); saveHeatmap() }}
              onKeyDown={e => { if (e.key === 'Enter') { setEditingName(false); saveHeatmap() } }}
              style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 14, fontWeight: 700, padding: '2px 6px', width: 180 }} />
          ) : (
            <div onClick={() => setEditingName(true)} style={{ cursor: 'pointer' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{mapName}</div>
              <div style={{ fontSize: 10, color: DIM }}>WiFi Heat Map</div>
            </div>
          )}
        </div>

        {/* Center — tools */}
        <div style={{ display: 'flex', gap: 2, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
          {toolBtn('select', '\u25C7', 'Select')}
          {toolBtn('addAP', '+', 'Add AP')}
          {toolBtn('moveAP', '\u21C4', 'Move')}
          {toolBtn('drawWall', '\u2502', 'Wall')}
          {toolBtn('eraseWall', '\u2718', 'Erase Wall')}
          {toolBtn('survey', '\u25CE', 'Survey')}
          {toolBtn('calibrate', '\u25CB', 'Calibrate')}
        </div>

        {/* Right — controls */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFloorPlanUpload} style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()} style={{ padding: '5px 10px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: DIM, fontSize: 11, cursor: 'pointer' }}>
            Floor Plan
          </button>

          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: DIM, cursor: 'pointer' }}>
            <input type="checkbox" checked={showHeatmap} onChange={e => setShowHeatmap(e.target.checked)} />
            Heat Map
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: DIM }}>
            Opacity
            <input type="range" min="0" max="1" step="0.05" value={heatmapOpacity}
              onChange={e => setHeatmapOpacity(parseFloat(e.target.value))} style={{ width: 60 }} />
          </label>

          <select value={coverageThreshold} onChange={e => setCoverageThreshold(parseInt(e.target.value))}
            style={{ padding: '4px 6px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 11 }}>
            {[-65, -67, -70, -75, -80, -82].map(v => <option key={v} value={v}>{v} dBm</option>)}
          </select>

          <button onClick={() => { setCalculating(true); setTimeout(() => { if (heatmapCanvasRef.current) { const r = renderHeatmap(heatmapCanvasRef.current, aps, walls, surveyPoints, scalePxPerFt, coverageThreshold, heatmapOpacity); setCoveragePct(r.coveragePct) } setCalculating(false) }, 50) }}
            style={{ padding: '4px 10px', background: coveragePct >= 80 ? 'rgba(46,160,67,.12)' : 'rgba(248,81,73,.12)', border: `1px solid ${coveragePct >= 80 ? 'rgba(46,160,67,.3)' : 'rgba(248,81,73,.3)'}`, borderRadius: 6, color: coveragePct >= 80 ? '#2ea043' : '#f85149', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
            {calculating ? '\u27F3' : `${coveragePct.toFixed(1)}%`}
          </button>

          <button onClick={detectDeadZones} style={{ padding: '5px 10px', background: 'rgba(248,81,73,.08)', border: '1px solid rgba(248,81,73,.2)', borderRadius: 6, color: '#f85149', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            Dead Zones
          </button>

          <select onChange={e => { if (e.target.value === 'png') exportPNG(); else if (e.target.value === 'csv') exportCSV(); e.target.value = '' }}
            style={{ padding: '4px 6px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 11 }}
            defaultValue="">
            <option value="" disabled>Export</option>
            <option value="png">PNG</option>
            <option value="csv">CSV</option>
          </select>

          <button onClick={() => saveHeatmap()} disabled={saving}
            style={{ padding: '5px 12px', background: `linear-gradient(135deg,#B8860B,${GOLD})`, border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 800, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Calibration / tool instructions */}
      {tool === 'calibrate' && (
        <div style={{ padding: '6px 16px', background: 'rgba(56,139,253,.08)', borderBottom: `1px solid rgba(56,139,253,.2)`, fontSize: 12, color: '#388bfd' }}>
          {calibrationStep === 0 && 'Step 1: Click first reference point on the floor plan'}
          {calibrationStep === 1 && 'Step 2: Click second reference point'}
          {calibrationStep === 2 && 'Step 3: Enter the real-world distance between points'}
        </div>
      )}
      {tool === 'drawWall' && drawWallStart && (
        <div style={{ padding: '6px 16px', background: 'rgba(239,68,68,.08)', borderBottom: '1px solid rgba(239,68,68,.2)', fontSize: 12, color: '#fca5a5' }}>
          Click to set wall endpoint
        </div>
      )}

      {/* ═══ MAIN AREA ═══ */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Canvas area */}
        <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* Canvas 0 — floor plan + walls */}
          <canvas ref={floorCanvasRef} width={canvasWidth} height={canvasHeight}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />

          {/* Canvas 1 — heat map */}
          <canvas ref={heatmapCanvasRef} width={canvasWidth} height={canvasHeight}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: heatmapOpacity, pointerEvents: 'none' }} />

          {/* Canvas 2 — APs + interaction */}
          <canvas ref={apCanvasRef} width={canvasWidth} height={canvasHeight}
            onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={handlePointerUp}
            onTouchStart={(e) => { e.preventDefault(); handlePointerDown(e) }}
            onTouchMove={(e) => { e.preventDefault(); handlePointerMove(e) }}
            onTouchEnd={(e) => { e.preventDefault(); handlePointerUp() }}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: tool === 'select' ? 'default' : 'crosshair', touchAction: 'none' }} />

          {/* Stats overlay bottom-left */}
          <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', gap: 6 }}>
            {[
              { label: 'APs', value: aps.length, color: GOLD },
              { label: 'Walls', value: walls.length, color: '#94a3b8' },
              { label: 'Surveys', value: surveyPoints.length, color: '#06b6d4' },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(13,17,23,.85)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '4px 10px', fontSize: 10, color: DIM }}>
                <span style={{ color: s.color, fontWeight: 800, marginRight: 4 }}>{s.value}</span>{s.label}
              </div>
            ))}
          </div>

          {/* Legend overlay bottom-right */}
          <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(13,17,23,.88)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Signal Strength</div>
            {[
              { color: '#00c850', label: '\u2265 -50 Excellent' },
              { color: '#50c800', label: '\u2265 -60 Very Good' },
              { color: '#c8c800', label: '\u2265 -67 Good' },
              { color: '#ff8c00', label: '\u2265 -75 Fair' },
              { color: '#dc3c00', label: '\u2265 -82 Poor' },
              { color: '#780000', label: 'Dead Zone' },
            ].map(i => (
              <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: i.color }} />
                <span style={{ fontSize: 9, color: DIM }}>{i.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ SIDE PANEL ═══ */}
        {showPanel && selectedAPData && (
          <div style={{ width: 320, background: CARD, borderLeft: `1px solid ${BORDER}`, overflow: 'auto', flexShrink: 0 }}>
            {/* Panel tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}` }}>
              {(['details', 'install', 'clients'] as const).map(tab => (
                <button key={tab} onClick={() => setPanelTab(tab)}
                  style={{ flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: panelTab === tab ? DARK : 'transparent',
                    color: panelTab === tab ? GOLD : DIM, border: 'none', borderBottom: panelTab === tab ? `2px solid ${GOLD}` : '2px solid transparent',
                    textTransform: 'capitalize' }}>
                  {tab}
                </button>
              ))}
              <button onClick={() => { setShowPanel(false); setSelectedAP(null) }}
                style={{ padding: '10px', background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 14 }}>&times;</button>
            </div>

            <div style={{ padding: 16 }}>
              {/* ─── Details Tab ─── */}
              {panelTab === 'details' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Status badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                      background: `${STATUS_COLORS[selectedAPData.ap_status]}22`, color: STATUS_COLORS[selectedAPData.ap_status],
                      border: `1px solid ${STATUS_COLORS[selectedAPData.ap_status]}44` }}>
                      {selectedAPData.ap_status}
                    </span>
                    <select value={selectedAPData.ap_status} onChange={e => setAps(prev => prev.map(a => a.id === selectedAP ? { ...a, ap_status: e.target.value as APData['ap_status'] } : a))}
                      style={{ padding: '2px 4px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 10 }}>
                      {['planned', 'installed', 'active', 'offline'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>

                  {/* Vendor + Model */}
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>{selectedAPData.vendor} {selectedAPData.model}</div>
                    <div style={{ fontSize: 12, color: DIM }}>Label: {selectedAPData.label}</div>
                  </div>

                  {/* Radio section */}
                  <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 6, textTransform: 'uppercase' }}>Radio</div>
                    {[
                      ['SSID', selectedAPData.ssid || '\u2014'],
                      ['Frequency', selectedAPData.frequency],
                      ['Channel', selectedAPData.frequency === '2.4GHz' ? selectedAPData.channel_2g : selectedAPData.channel_5g],
                      ['TX Power', `${selectedAPData.tx_power_dbm} dBm`],
                      ['Antenna', `${selectedAPData.antenna_gain_dbi} dBi`],
                    ].map(([k, v]) => (
                      <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: DIM }}>{k}</span>
                        <span style={{ color: TEXT, fontWeight: 600 }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Live Stats */}
                  {selectedAPData.ap_status === 'active' && (
                    <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 6, textTransform: 'uppercase' }}>Live Stats</div>
                      {[
                        ['Connected', `${selectedAPData.connected_clients} clients`],
                        ['Throughput', `${selectedAPData.throughput_mbps} Mbps`],
                        ['CPU', `${selectedAPData.cpu_pct}%`],
                        ['Memory', `${selectedAPData.memory_pct}%`],
                        ['Last seen', selectedAPData.last_seen || '\u2014'],
                      ].map(([k, v]) => (
                        <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                          <span style={{ color: DIM }}>{k}</span>
                          <span style={{ color: TEXT, fontWeight: 600 }}>{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Network */}
                  <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 6, textTransform: 'uppercase' }}>Network</div>
                    {[
                      ['IP Address', selectedAPData.ip_address || '\u2014'],
                      ['MAC', selectedAPData.mac_address || '\u2014'],
                    ].map(([k, v]) => (
                      <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: DIM }}>{k}</span>
                        <span style={{ color: TEXT, fontWeight: 600, fontFamily: 'monospace', fontSize: 11 }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Coverage estimate */}
                  <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 6, textTransform: 'uppercase' }}>Coverage</div>
                    <div style={{ fontSize: 12, color: TEXT }}>
                      Est. radius: ~{(() => {
                        const freq = selectedAPData.frequency === '2.4GHz' ? 2437 : selectedAPData.frequency === '6GHz' ? 6000 : 5500
                        const maxPL = selectedAPData.tx_power_dbm + selectedAPData.antenna_gain_dbi + 75
                        const distM = Math.pow(10, (maxPL - 32.44 - 20 * Math.log10(freq)) / 20)
                        return Math.round(distM / 0.3048)
                      })()} ft at -75dBm
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => { /* inline edit could expand here */ }}
                      style={{ flex: 1, padding: '8px', background: 'rgba(56,139,253,.1)', border: '1px solid rgba(56,139,253,.3)', borderRadius: 6, color: '#388bfd', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Edit AP Settings
                    </button>
                    <button onClick={() => deleteAP(selectedAPData.id)}
                      style={{ padding: '8px 12px', background: 'rgba(248,81,73,.08)', border: '1px solid rgba(248,81,73,.2)', borderRadius: 6, color: '#f85149', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {/* ─── Install Tab ─── */}
              {panelTab === 'install' && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{selectedAPData.vendor} Installation</div>
                  <div style={{ fontSize: 11, color: DIM, marginBottom: 12 }}>{selectedAPData.label} \u2022 {selectedAPData.model}</div>

                  {/* Progress bar */}
                  {(() => {
                    const steps = getInstallSteps(selectedAPData)
                    const checks = installChecks[selectedAPData.id] || new Array(steps.length).fill(false)
                    const done = checks.filter(Boolean).length
                    return (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: DIM, marginBottom: 4 }}>
                          <span>Progress</span><span>{done}/{steps.length}</span>
                        </div>
                        <div style={{ height: 6, background: DARK, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${(done / steps.length) * 100}%`, height: '100%', background: `linear-gradient(90deg,#B8860B,${GOLD})`, borderRadius: 3, transition: 'width .3s' }} />
                        </div>
                      </div>
                    )
                  })()}

                  {/* Steps */}
                  {getInstallSteps(selectedAPData).map((step, i) => {
                    const checks = installChecks[selectedAPData.id] || []
                    const checked = checks[i] || false
                    return (
                      <div key={i} onClick={() => toggleInstallStep(selectedAPData.id, i)}
                        style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', alignItems: 'flex-start' }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? GOLD : BORDER}`, background: checked ? 'rgba(212,160,23,.15)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                          {checked && <span style={{ color: GOLD, fontSize: 12, fontWeight: 800 }}>\u2713</span>}
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: DIM, marginBottom: 2 }}>Step {i + 1}</div>
                          <div style={{ fontSize: 12, color: checked ? DIM : TEXT, textDecoration: checked ? 'line-through' : 'none' }}>{step}</div>
                        </div>
                      </div>
                    )
                  })}

                  {/* Notes */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 4, textTransform: 'uppercase' }}>Install Notes</div>
                    <textarea value={selectedAPData.installation_notes || ''}
                      onChange={e => setAps(prev => prev.map(a => a.id === selectedAP ? { ...a, installation_notes: e.target.value } : a))}
                      onBlur={() => saveHeatmap()}
                      placeholder="Add installation notes..."
                      style={{ width: '100%', minHeight: 80, padding: 8, background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12, resize: 'vertical' }} />
                  </div>
                </div>
              )}

              {/* ─── Clients Tab ─── */}
              {panelTab === 'clients' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Clients</div>
                    <button onClick={() => { setPanelTab('clients') /* triggers re-fetch */ }}
                      style={{ padding: '4px 8px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 4, color: DIM, fontSize: 10, cursor: 'pointer' }}>
                      Refresh
                    </button>
                  </div>

                  {/* Summary */}
                  <div style={{ background: DARK, borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
                    <div style={{ color: TEXT, fontWeight: 700 }}>Total: {selectedAPData.connected_clients} clients</div>
                    <div style={{ color: DIM, fontSize: 11 }}>5GHz: {clients.filter(c => c.frequency === '5GHz').length} | 2.4GHz: {clients.filter(c => c.frequency === '2.4GHz').length}</div>
                  </div>

                  {clients.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center', color: DIM, fontSize: 12 }}>
                      No client data available. Import from your AP controller or add manually.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {clients.map((c, i) => (
                        <div key={i} style={{ background: DARK, borderRadius: 8, padding: '8px 10px', fontSize: 11 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ color: TEXT, fontWeight: 700 }}>{c.hostname || c.mac.slice(-8)}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.rssi_dbm >= -65 ? '#2ea043' : c.rssi_dbm >= -72 ? '#d29922' : c.rssi_dbm >= -78 ? '#ff8c00' : '#f85149' }} />
                              <span style={{ color: DIM }}>{c.rssi_dbm} dBm</span>
                            </span>
                          </div>
                          <div style={{ color: DIM }}>
                            {c.ip} \u2022 TX:{c.tx_rate_mbps}M RX:{c.rx_rate_mbps}M \u2022 {c.frequency} ch{c.channel}
                          </div>
                          <div style={{ color: DIM }}>
                            {(c.data_usage_mb / 1024).toFixed(1)} GB \u2022 {Math.floor(c.connected_seconds / 3600)}h {Math.floor((c.connected_seconds % 3600) / 60)}m
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {clients.length > 0 && (
                    <button onClick={() => {
                      const h = ['Hostname', 'MAC', 'IP', 'RSSI', 'TX', 'RX', 'Freq', 'Channel', 'Usage MB', 'Connected s']
                      const r = clients.map(c => [c.hostname, c.mac, c.ip, c.rssi_dbm, c.tx_rate_mbps, c.rx_rate_mbps, c.frequency, c.channel, c.data_usage_mb, c.connected_seconds].join(','))
                      const blob = new Blob([[h.join(','), ...r].join('\n')], { type: 'text/csv' })
                      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `clients-${selectedAPData.label}.csv`; a.click()
                    }}
                      style={{ marginTop: 8, width: '100%', padding: '8px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: DIM, fontSize: 11, cursor: 'pointer' }}>
                      Export CSV
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ DEAD ZONES DRAWER ═══ */}
        {showDeadZones && deadZones.length > 0 && !showPanel && (
          <div style={{ width: 300, background: CARD, borderLeft: `1px solid ${BORDER}`, overflow: 'auto', flexShrink: 0, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Dead Zones Found: {deadZones.length}</div>
              <button onClick={() => { setShowDeadZones(false); setGhostAPs([]) }}
                style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer' }}>&times;</button>
            </div>

            {deadZones.map((z, i) => (
              <div key={z.id} style={{ background: DARK, borderRadius: 8, padding: '10px 12px', marginBottom: 8, borderLeft: '3px solid #f85149' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{z.label}</div>
                <div style={{ fontSize: 11, color: DIM }}>Area: {Math.round(z.area_sqft)} sq ft</div>
                <div style={{ fontSize: 11, color: DIM }}>Center: {Math.round(z.centroid.x * canvasWidth / scalePxPerFt)}ft, {Math.round(z.centroid.y * canvasHeight / scalePxPerFt)}ft</div>
                <div style={{ fontSize: 10, color: GOLD, marginTop: 4 }}>&rarr; Ghost AP placed (tap to confirm)</div>
              </div>
            ))}

            <div style={{ background: DARK, borderRadius: 8, padding: '10px 12px', marginTop: 8 }}>
              <div style={{ fontSize: 11, color: DIM }}>Total uncovered: {Math.round(deadZones.reduce((s, z) => s + z.area_sqft, 0))} sq ft</div>
              <div style={{ fontSize: 11, color: DIM }}>Current coverage: {coveragePct.toFixed(1)}%</div>
              <div style={{ fontSize: 11, color: '#2ea043' }}>With suggested APs: ~{Math.min(99.9, coveragePct + (100 - coveragePct) * 0.7).toFixed(1)}%</div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ MODALS / POPUPS ═══ */}

      {/* Wall type selector */}
      {showWallTypePopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, width: 280 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Wall Material</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(WALL_ATTENUATION).map(([mat, db]) => (
                <button key={mat} onClick={() => confirmWallType(mat)}
                  style={{ padding: '10px 14px', background: wallMaterial === mat ? 'rgba(212,160,23,.1)' : DARK,
                    border: `1px solid ${wallMaterial === mat ? GOLD : BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13,
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ textTransform: 'capitalize' }}>{mat}</span>
                  <span style={{ color: DIM }}>{db} dB</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setShowWallTypePopup(false); setPendingWall(null) }}
              style={{ marginTop: 10, width: '100%', padding: '8px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: DIM, fontSize: 12, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Survey point input */}
      {showSurveyInput && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, width: 260 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Signal Strength (dBm)</div>
            <input type="number" value={surveyRSSI} onChange={e => setSurveyRSSI(parseInt(e.target.value) || -60)}
              style={{ width: '100%', padding: '10px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 18, fontWeight: 800, textAlign: 'center', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
              {[-40, -50, -60, -65, -70, -75, -80, -85, -90].map(v => (
                <button key={v} onClick={() => setSurveyRSSI(v)}
                  style={{ padding: '4px 8px', background: surveyRSSI === v ? 'rgba(212,160,23,.15)' : DARK, border: `1px solid ${surveyRSSI === v ? GOLD : BORDER}`,
                    borderRadius: 4, color: surveyRSSI === v ? GOLD : DIM, fontSize: 11, cursor: 'pointer' }}>
                  {v}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowSurveyInput(false)}
                style={{ flex: 1, padding: '8px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: DIM, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmSurveyPoint}
                style={{ flex: 1, padding: '8px', background: `linear-gradient(135deg,#B8860B,${GOLD})`, border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Add Point</button>
            </div>
          </div>
        </div>
      )}

      {/* Calibration distance input */}
      {showCalibrationInput && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, width: 280 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Enter distance in feet</div>
            <input type="number" autoFocus value={calibrationFeetInput} onChange={e => setCalibrationFeetInput(e.target.value)}
              placeholder="e.g. 50"
              onKeyDown={e => { if (e.key === 'Enter') confirmCalibration() }}
              style={{ width: '100%', padding: '10px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 18, fontWeight: 800, textAlign: 'center', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowCalibrationInput(false); setCalibrationStep(0); setCalibrationPoints([]) }}
                style={{ flex: 1, padding: '8px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: DIM, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmCalibration}
                style={{ flex: 1, padding: '8px', background: `linear-gradient(135deg,#B8860B,${GOLD})`, border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Calibrate</button>
            </div>
          </div>
        </div>
      )}

      {/* Add AP form */}
      {showAddAPForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, width: 400, maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Add Access Point</div>

            {/* Form fields */}
            {/* Label */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>Label</label>
              <input value={newAPData.label} onChange={e => setNewAPData({ ...newAPData, label: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 13 }} />
            </div>

            {/* Vendor */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>Vendor</label>
              <select value={newAPData.vendor} onChange={e => setNewAPData({ ...newAPData, vendor: e.target.value })}
                style={{ width: '100%', padding: '8px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 13 }}>
                {Object.keys(VENDOR_COLORS).filter(v => v !== 'Default').map(v => <option key={v}>{v}</option>)}
              </select>
            </div>

            {/* Model */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>Model</label>
              <input value={newAPData.model} onChange={e => setNewAPData({ ...newAPData, model: e.target.value })} list="model-suggestions"
                style={{ width: '100%', padding: '8px 10px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 13 }} />
              <datalist id="model-suggestions">
                {(VENDOR_MODELS[newAPData.vendor] || []).map(m => <option key={m} value={m} />)}
              </datalist>
            </div>

            {/* Status */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>Status</label>
              <select value={newAPData.ap_status} onChange={e => setNewAPData({ ...newAPData, ap_status: e.target.value as APData['ap_status'] })}
                style={{ width: '100%', padding: '8px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 13 }}>
                {['planned', 'installed', 'active', 'offline'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            {/* SSID */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>SSID</label>
              <input value={newAPData.ssid} onChange={e => setNewAPData({ ...newAPData, ssid: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 13 }} />
            </div>

            {/* Frequency */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>Frequency</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['2.4GHz', '5GHz', '6GHz', 'Dual'] as const).map(f => (
                  <button key={f} onClick={() => setNewAPData({ ...newAPData, frequency: f })}
                    style={{ flex: 1, padding: '6px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: newAPData.frequency === f ? 'rgba(212,160,23,.12)' : DARK,
                      border: `1px solid ${newAPData.frequency === f ? GOLD : BORDER}`,
                      color: newAPData.frequency === f ? GOLD : DIM }}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Channels */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>Channel 5GHz</label>
                <select value={newAPData.channel_5g} onChange={e => setNewAPData({ ...newAPData, channel_5g: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '6px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12 }}>
                  {CHANNELS_5G.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>Channel 2.4GHz</label>
                <select value={newAPData.channel_2g} onChange={e => setNewAPData({ ...newAPData, channel_2g: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '6px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12 }}>
                  {CHANNELS_2G.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* TX Power + Antenna */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>TX Power (dBm)</label>
                <select value={newAPData.tx_power_dbm} onChange={e => setNewAPData({ ...newAPData, tx_power_dbm: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '6px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12 }}>
                  {TX_POWER_OPTIONS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>Antenna Gain (dBi)</label>
                <input type="number" step="0.1" value={newAPData.antenna_gain_dbi} onChange={e => setNewAPData({ ...newAPData, antenna_gain_dbi: parseFloat(e.target.value) || 3 })}
                  style={{ width: '100%', padding: '6px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12 }} />
              </div>
            </div>

            {/* Mounting + Height */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>Mounting</label>
                <select value={newAPData.mounting} onChange={e => setNewAPData({ ...newAPData, mounting: e.target.value })}
                  style={{ width: '100%', padding: '6px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12 }}>
                  {['ceiling', 'wall', 'pole', 'outdoor'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>Height (ft)</label>
                <input type="number" value={newAPData.height_ft} onChange={e => setNewAPData({ ...newAPData, height_ft: parseInt(e.target.value) || 10 })}
                  style={{ width: '100%', padding: '6px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12 }} />
              </div>
            </div>

            {/* Floor + PoE */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>Floor</label>
                <input type="number" value={newAPData.floor} onChange={e => setNewAPData({ ...newAPData, floor: parseInt(e.target.value) || 1 })}
                  style={{ width: '100%', padding: '6px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>PoE Switch Port</label>
                <input value={newAPData.poe_switch_port} onChange={e => setNewAPData({ ...newAPData, poe_switch_port: e.target.value })}
                  style={{ width: '100%', padding: '6px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12 }} />
              </div>
            </div>

            {/* Cable Run + IP */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>Cable Run (ft)</label>
                <input type="number" value={newAPData.cable_run_ft} onChange={e => setNewAPData({ ...newAPData, cable_run_ft: parseInt(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '6px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>IP Address</label>
                <input value={newAPData.ip_address} onChange={e => setNewAPData({ ...newAPData, ip_address: e.target.value })}
                  style={{ width: '100%', padding: '6px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12 }} />
              </div>
            </div>

            {/* MAC */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>MAC Address</label>
              <input value={newAPData.mac_address} onChange={e => setNewAPData({ ...newAPData, mac_address: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 13, fontFamily: 'monospace' }} />
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4 }}>Notes</label>
              <textarea value={newAPData.notes} onChange={e => setNewAPData({ ...newAPData, notes: e.target.value })}
                style={{ width: '100%', minHeight: 60, padding: 8, background: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12, resize: 'vertical' }} />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowAddAPForm(false)}
                style={{ flex: 1, padding: '10px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, color: DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={confirmAddAP}
                style={{ flex: 1, padding: '10px', background: `linear-gradient(135deg,#B8860B,${GOLD})`, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                Place AP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
