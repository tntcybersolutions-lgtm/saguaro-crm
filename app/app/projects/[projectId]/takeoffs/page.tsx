'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { downloadPDF } from '@/lib/download-pdf'
import { statusBar } from '@/app/app/components/StatusBar'
import { IntelligenceIndicator } from '@/app/app/components/IntelligenceIndicator'
import { toast } from '@/app/app/components/Toast'

// ── TOKENS ───────────────────────────────────────────────────────
const BG     = '#0d1117'
const CARD   = '#161b22'
const BORDER = '#30363d'
const GOLD   = '#d4a017'
const GREEN  = '#2ea043'
const RED    = '#f85149'
const WHITE  = '#e6edf3'
const DIM    = '#8b949e'
const BLUE   = '#388bfd'
const ORANGE = '#ff9500'
const PURPLE = '#8b5cf6'

// ── TYPES ────────────────────────────────────────────────────────
interface Takeoff {
  id: string
  name: string
  status: string
  file_name: string | null
  file_size_bytes: number | null
  page_count: number
  pages_processed: number
  progress_pct: number
  grand_total: number
  total_material: number
  total_labor: number
  total_equipment: number
  total_subcontractor: number
  subtotal: number
  total_overhead: number
  total_profit: number
  cost_per_sqft: number | null
  extraction_confidence: number | null
  markup_labor_pct: number
  markup_material_pct: number
  markup_equipment_pct: number
  overhead_pct: number
  profit_pct: number
  cost_summary: Record<string, unknown> | null
  csi_breakdown: Record<string, { division_name: string; subtotal: number; item_count: number }> | null
  bid_package_id: string | null
  processing_error: string | null
  created_at: string
}

interface LineItem {
  id: string
  csi_division: string | null
  csi_code: string | null
  csi_description: string | null
  description: string
  scope_notes: string | null
  sheet_number: string | null
  quantity: number
  unit: string
  waste_factor_pct: number
  unit_material_cost: number
  unit_labor_cost: number
  unit_equipment_cost: number
  unit_sub_cost: number
  total_material: number | null
  total_labor: number | null
  total_equipment: number | null
  total_sub: number | null
  ai_confidence: number | null
  manually_edited: boolean
  is_excluded: boolean
  notes: string | null
}

interface StreamEvent {
  type: 'progress' | 'items' | 'done' | 'error' | 'heartbeat'
  status?: string
  pct?: number
  pages?: string
  page?: number
  totalPages?: number
  total?: number
  new_items?: Partial<LineItem>[]
  grand_total?: number
  item_count?: number
  message?: string
}

type Tab = 'items' | 'by_division' | 'sov' | 'cost_summary' | 'markup'

// ── HELPERS ──────────────────────────────────────────────────────
const fmt$ = (n: number | null | undefined) =>
  n == null ? '—' : '$' + Math.round(n).toLocaleString()

const fmtPct = (n: number | null | undefined) =>
  n == null ? '—' : n.toFixed(1) + '%'

const lineTotal = (item: LineItem) => {
  const qty = (item.quantity || 0) * (1 + (item.waste_factor_pct || 0) / 100)
  return qty * ((item.unit_material_cost || 0) + (item.unit_labor_cost || 0) +
    (item.unit_equipment_cost || 0) + (item.unit_sub_cost || 0))
}

const CSI_DIVISION_NAMES: Record<string, string> = {
  '01': 'General Requirements', '02': 'Existing Conditions', '03': 'Concrete',
  '04': 'Masonry', '05': 'Metals / Structural', '06': 'Wood & Plastics',
  '07': 'Thermal & Moisture', '08': 'Openings', '09': 'Finishes',
  '10': 'Specialties', '21': 'Fire Suppression', '22': 'Plumbing',
  '23': 'HVAC', '26': 'Electrical', '27': 'Communications', '28': 'Security',
  '31': 'Earthwork', '32': 'Exterior Improvements', '33': 'Utilities',
}

const SMART_MESSAGES: Record<string, string[]> = {
  '0-15': ['Loading your plan set...', 'Sage AI is reading your drawings...', 'Analyzing the title block and sheet index...', 'Starting structural drawings...'],
  '15-30': ['Reading concrete quantities from structural plans...', 'Calculating rebar weights from schedules...', 'Checking foundation drawings...', 'Analyzing steel connections...'],
  '30-50': ['Switching to mechanical drawings...', 'Reading duct sizes from mechanical plans...', 'Counting HVAC equipment from schedules...', 'Checking plumbing fixture count...'],
  '50-70': ['Reading electrical one-line diagram...', 'Counting panel circuits and breakers...', 'Reading fixture schedule...', 'Checking electrical site plan...'],
  '70-85': ['Reviewing site work drawings...', 'Calculating earthwork quantities...', 'Checking landscaping plans...', 'Reading civil drawings...'],
  '85-95': ['Synthesizing quantities across all sheets...', 'Deduplicating items found on multiple sheets...', 'Calculating market costs for your region...', 'Applying waste factors...'],
  '95-100': ['Almost done — finalizing quantities...', 'Generating cost summary...', 'Building CSI breakdown...', 'Preparing your takeoff results...'],
}

function getSmartMessage(pct: number, index: number): string {
  const bucket = pct < 15 ? '0-15' : pct < 30 ? '15-30' : pct < 50 ? '30-50'
    : pct < 70 ? '50-70' : pct < 85 ? '70-85' : pct < 95 ? '85-95' : '95-100'
  const messages = SMART_MESSAGES[bucket]
  return messages[index % messages.length]
}

const CSI_COLORS: Record<string, string> = {
  '03': '#e67e22', '05': '#7f8c8d', '07': '#27ae60', '08': '#2980b9',
  '09': '#8e44ad', '22': '#16a085', '23': '#d35400', '26': '#f39c12',
  '31': '#795548', '32': '#607d8b', '33': '#455a64',
}

// ══════════════════════════════════════════════════════════════════
export default function TakeoffsPage() {
  const params    = useParams()
  const projectId = params.projectId as string

  const [takeoffs,     setTakeoffs]     = useState<Takeoff[]>([])
  const [activeTakeoff, setActiveTakeoff] = useState<Takeoff | null>(null)
  const [lineItems,    setLineItems]    = useState<LineItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [activeTab,    setActiveTab]    = useState<Tab>('items')

  // Upload state
  const [uploading,    setUploading]    = useState(false)
  const [uploadPct,    setUploadPct]    = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragRef      = useRef<HTMLDivElement>(null)
  const [dragging,     setDragging]     = useState(false)

  // Stream state
  const [streaming,    setStreaming]    = useState(false)
  const [streamMsg,    setStreamMsg]    = useState('')
  const [streamPct,    setStreamPct]    = useState(0)
  const [streamItems,  setStreamItems]  = useState<Partial<LineItem>[]>([])
  const eventSourceRef = useRef<EventSource | null>(null)

  // Page grid for visual extraction progress
  const [currentPage,  setCurrentPage]  = useState(0)
  const [totalPages,   setTotalPages]   = useState(0)

  // Extraction error state
  const [extractionError, setExtractionError] = useState<string | null>(null)

  // Division grouping for live radar
  const [divisionGroups, setDivisionGroups] = useState<Record<string, {
    divisionName: string
    items: Array<{ description: string; quantity: number; unit: string }>
    estimatedTotal: number
    itemCount: number
    isActive: boolean
  }>>({})
  const [runningTotal, setRunningTotal] = useState(0)
  const [runningItemCount, setRunningItemCount] = useState(0)
  const [smartMessageIndex, setSmartMessageIndex] = useState(0)
  const [creatingPackages, setCreatingPackages] = useState<Record<string, boolean>>({})
  const [createdPackages, setCreatedPackages] = useState<Record<string, boolean>>({})

  // Edit state — inline editing
  const [editingCell,  setEditingCell]  = useState<{ itemId: string; field: string } | null>(null)
  const [editValue,    setEditValue]    = useState('')
  const [savingItem,   setSavingItem]   = useState<string | null>(null)
  const [pendingEdits, setPendingEdits] = useState<Record<string, boolean>>({})

  // Markup state
  const [markupForm, setMarkupForm] = useState({
    markup_labor_pct: 15,
    markup_material_pct: 10,
    markup_equipment_pct: 10,
    overhead_pct: 12,
    profit_pct: 8,
  })
  const [recalculating, setRecalculating] = useState(false)

  // Filter + search
  const [searchQuery,    setSearchQuery]    = useState('')
  const [filterDivision, setFilterDivision] = useState('')
  const [sortField,      setSortField]      = useState<keyof LineItem>('csi_division')
  const [sortAsc,        setSortAsc]        = useState(true)

  // Export
  const [exporting, setExporting] = useState(false)

  // Create Bid Package per division
  const [creatingPkg, setCreatingPkg] = useState<string | null>(null)
  const [createdPkgs, setCreatedPkgs] = useState<Record<string, string>>({})

  const handleCreateBidPackage = async (division: string, divName: string) => {
    if (!activeTakeoff) return
    setCreatingPkg(division)
    try {
      const res = await fetch(`/api/takeoff/${activeTakeoff.id}/create-bid-packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          divisions: [division],
        }),
      })
      const json = await res.json()
      if (json.packages?.length > 0) {
        setCreatedPkgs(prev => ({ ...prev, [division]: json.packages[0].id }))
      }
    } catch (err) {
      console.error('[createBidPackage]', err)
    } finally {
      setCreatingPkg(null)
    }
  }

  // ── FETCH TAKEOFFS ─────────────────────────────────────────────
  const fetchTakeoffs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/takeoffs/list?projectId=${projectId}`)
      const json = await res.json()
      setTakeoffs(json.data || [])
      if (json.data?.length > 0 && !activeTakeoff) {
        const first = json.data[0] as Takeoff
        if (first.status === 'complete') {
          setActiveTakeoff(first)
          setMarkupForm({
            markup_labor_pct:     first.markup_labor_pct || 15,
            markup_material_pct:  first.markup_material_pct || 10,
            markup_equipment_pct: first.markup_equipment_pct || 10,
            overhead_pct:         first.overhead_pct || 12,
            profit_pct:           first.profit_pct || 8,
          })
        } else if (first.status === 'processing' || first.status === 'extracting') {
          setActiveTakeoff(first)
          connectStream(first.id)
        }
      }
    } catch (e) {
      console.error('fetchTakeoffs:', e)
    } finally {
      setLoading(false)
    }
  }, [projectId, activeTakeoff])

  // ── LOAD LINE ITEMS ────────────────────────────────────────────
  const fetchLineItems = useCallback(async (takeoffId: string) => {
    try {
      const res = await fetch(`/api/takeoffs/${takeoffId}/items?pageSize=500`)
      const json = await res.json()
      setLineItems(json.data || [])
    } catch (e) {
      console.error('fetchLineItems:', e)
    }
  }, [])

  useEffect(() => { fetchTakeoffs() }, [fetchTakeoffs])

  useEffect(() => {
    if (activeTakeoff?.status === 'complete') {
      fetchLineItems(activeTakeoff.id)
    }
  }, [activeTakeoff?.id, activeTakeoff?.status, fetchLineItems])

  // ── ORCHESTRATION (auto-triggers after extraction) ──────────────
  const startOrchestration = useCallback(async (takeoffId: string) => {
    statusBar.show(`orch-${takeoffId}`, 'working',
      'Sage AI is orchestrating your takeoff...',
      'Cross-referencing line items, validating costs, generating insights')

    try {
      const res = await fetch(`/api/takeoffs/${takeoffId}/orchestrate`, { method: 'POST' })
      if (!res.ok) {
        // 409 = already orchestrated or running — not an error
        if (res.status === 409) {
          statusBar.success(`orch-${takeoffId}`, '✓ Orchestration already complete')
          return
        }
        throw new Error(await res.text())
      }

      const reader = res.body?.getReader()
      if (!reader) return
      const decoder = new TextDecoder()

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.status === 'running') {
              statusBar.update(`orch-${takeoffId}`, {
                message: evt.message || 'Processing...',
                progress: evt.progress,
              })
            }
            if (evt.type === 'complete') {
              statusBar.success(`orch-${takeoffId}`,
                `✓ Orchestration complete — ${evt.stats?.tasksCompleted || 0} tasks finished`)
              fetchTakeoffs()
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e: unknown) {
      statusBar.error(`orch-${takeoffId}`, `Orchestration failed — ${(e as Error).message}`)
    }
  }, [fetchTakeoffs])

  // ── CONNECT SSE STREAM ─────────────────────────────────────────
  const connectStream = useCallback((takeoffId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    setStreaming(true)
    setStreamPct(0)
    setStreamItems([])
    setDivisionGroups({})
    setExtractionError(null)
    setRunningTotal(0)
    setRunningItemCount(0)
    setSmartMessageIndex(0)

    const es = new EventSource(`/api/takeoffs/${takeoffId}/stream`)
    eventSourceRef.current = es

    statusBar.show(`takeoff-${takeoffId}`, 'working',
      'Sage AI is extracting your plans...',
      'Reading every page, every dimension, every note')

    es.onmessage = (e: MessageEvent) => {
      try {
        const event: StreamEvent = JSON.parse(e.data)

        if (event.type === 'progress') {
          setStreamPct(event.pct || 0)
          if (event.page) setCurrentPage(event.page)
          if (event.totalPages) setTotalPages(event.totalPages)
          if (event.message) setStreamMsg(event.message)
          else if (event.status) setStreamMsg(`${event.status === 'extracting' ? '✨ Sage is reading page ' : ''}${event.pages || ''}`)
          statusBar.update(`takeoff-${takeoffId}`, {
            message: `Reading page ${event.page || '?'} of ${event.totalPages || '?'}...`,
            progress: event.pct || 0,
          })
        }

        if (event.type === 'items' && event.new_items?.length) {
          setStreamItems(prev => [...event.new_items!, ...prev].slice(0, 50))
          setStreamMsg(`Extracted ${event.total} items so far...`)

          // Update division radar
          setDivisionGroups(prev => {
            const updated = { ...prev }
            for (const item of event.new_items!) {
              const divKey = String(item.csi_division || 'unknown').substring(0, 2)
              const divName = CSI_DIVISION_NAMES[divKey] || `Division ${divKey}`
              if (!updated[divKey]) {
                updated[divKey] = { divisionName: divName, items: [], estimatedTotal: 0, itemCount: 0, isActive: false }
              }
              Object.keys(updated).forEach(k => { updated[k] = { ...updated[k], isActive: false } })
              updated[divKey] = { ...updated[divKey], isActive: true }
              updated[divKey].items = [...updated[divKey].items, {
                description: item.description || '', quantity: Number(item.quantity) || 0, unit: item.unit || 'LS',
              }]
              updated[divKey].itemCount += 1
              const cost = (Number(item.quantity) || 0) * ((Number(item.unit_material_cost) || 0) + (Number(item.unit_labor_cost) || 0))
              updated[divKey].estimatedTotal += cost
            }
            return updated
          })
          setRunningItemCount(prev => prev + event.new_items!.length)
          setRunningTotal(prev => {
            const addition = (event.new_items as Array<{ quantity?: number; unit_material_cost?: number; unit_labor_cost?: number }>).reduce((sum, item) => {
              return sum + (Number(item.quantity) || 0) * ((Number(item.unit_material_cost) || 0) + (Number(item.unit_labor_cost) || 0))
            }, 0)
            return prev + addition
          })
          setSmartMessageIndex(prev => prev + 1)
        }

        if (event.type === 'done') {
          setStreaming(false)
          setStreamPct(100)
          setStreamMsg(`✓ Complete — ${event.item_count} items, ${fmt$(event.grand_total)}`)
          statusBar.success(`takeoff-${takeoffId}`,
            `✓ Extraction complete — ${event.item_count} items · ${fmt$(event.grand_total)}`)
          es.close()
          fetchTakeoffs()
          // Auto-trigger orchestration after successful extraction
          startOrchestration(takeoffId)
        }

        if (event.type === 'error') {
          setStreaming(false)
          setExtractionError(event.message || 'Extraction failed')
          setStreamMsg(`Error: ${event.message}`)
          statusBar.error(`takeoff-${takeoffId}`, 'Extraction failed — please try again')
          es.close()
        }
      } catch { /* ignore parse errors */ }
    }

    es.onerror = () => {
      setStreaming(false)
      es.close()
    }
  }, [fetchTakeoffs, startOrchestration])

  useEffect(() => {
    return () => { eventSourceRef.current?.close() }
  }, [])

  // ── HANDLE FILE UPLOAD ─────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file.type.includes('pdf') && !file.type.includes('image')) {
      toast.error('Please upload a PDF file')
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error('File too large — maximum 100MB')
      return
    }

    setUploading(true)
    setUploadPct(0)
    setStreamItems([])

    try {
      // Step 1 — Create takeoff record + get signed upload URL
      const createRes = await fetch('/api/takeoffs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          name: `Takeoff — ${file.name}`,
          fileName: file.name,
          fileSizeBytes: file.size,
        }),
      })
      if (!createRes.ok) throw new Error(await createRes.text())
      const { data: { takeoffId, uploadUrl, storagePath } } = await createRes.json()

      setStreamMsg('Uploading plan set to secure storage...')
      setUploadPct(10)

      // Step 2 — Upload file directly to Supabase Storage
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/pdf' },
        body: file,
      })
      if (!uploadRes.ok) throw new Error('Upload to storage failed')

      setUploadPct(50)
      setStreamMsg('Upload complete. Starting Sage AI extraction...')

      // Step 3 — Notify backend to start extraction
      const completeRes = await fetch(`/api/takeoffs/${takeoffId}/upload-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath }),
      })
      if (!completeRes.ok) throw new Error(await completeRes.text())

      setUploadPct(100)
      setStreaming(true)
      setUploading(false)

      // Step 4 — Connect to SSE stream for live progress
      connectStream(takeoffId)
      fetchTakeoffs()

    } catch (e: unknown) {
      setUploading(false)
      setStreamMsg(`Upload failed: ${(e as Error).message}`)
    }
  }, [projectId, connectStream, fetchTakeoffs])

  // Drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  // ── INLINE CELL EDIT ───────────────────────────────────────────
  const startEdit = (itemId: string, field: string, currentValue: unknown) => {
    setEditingCell({ itemId, field })
    setEditValue(String(currentValue ?? ''))
  }

  const commitEdit = async (item: LineItem) => {
    if (!editingCell || editingCell.itemId !== item.id) return
    const { field } = editingCell

    const numericFields = ['quantity','unit_material_cost','unit_labor_cost','unit_equipment_cost','unit_sub_cost','waste_factor_pct']
    const value = numericFields.includes(field) ? Number(editValue) : editValue

    // Optimistic update
    setLineItems(prev => prev.map(i => i.id === item.id ? { ...i, [field]: value } : i))
    setPendingEdits(prev => ({ ...prev, [item.id]: true }))
    setEditingCell(null)
    setSavingItem(item.id)

    try {
      await fetch(`/api/takeoffs/${activeTakeoff!.id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, [field]: value }),
      })
      setPendingEdits(prev => { const n = { ...prev }; delete n[item.id]; return n })
    } catch {
      // Revert on error
      fetchLineItems(activeTakeoff!.id)
    } finally {
      setSavingItem(null)
    }
  }

  // ── DELETE ITEM ────────────────────────────────────────────────
  const deleteItem = async (itemId: string) => {
    setLineItems(prev => prev.filter(i => i.id !== itemId))
    await fetch(`/api/takeoffs/${activeTakeoff!.id}/items?itemId=${itemId}`, { method: 'DELETE' })
  }

  // ── ADD ITEM ───────────────────────────────────────────────────
  const addItem = async () => {
    const res = await fetch(`/api/takeoffs/${activeTakeoff!.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'New Item', quantity: 1, unit: 'LS' }),
    })
    const json = await res.json()
    if (json.data) setLineItems(prev => [...prev, json.data])
  }

  // ── RECALCULATE ────────────────────────────────────────────────
  const handleRecalculate = async () => {
    if (!activeTakeoff) return
    setRecalculating(true)
    try {
      const res = await fetch(`/api/takeoffs/${activeTakeoff.id}/recalculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(markupForm),
      })
      const json = await res.json()
      if (json.data) {
        setActiveTakeoff(prev => prev ? {
          ...prev,
          ...markupForm,
          grand_total:        json.data.grand_total,
          total_material:     json.data.total_material,
          total_labor:        json.data.total_labor,
          total_equipment:    json.data.total_equipment,
          total_subcontractor:json.data.total_subcontractor,
          subtotal:           json.data.subtotal,
          total_overhead:     json.data.total_overhead,
          total_profit:       json.data.total_profit,
          cost_per_sqft:      json.data.cost_per_sqft,
        } : null)
      }
    } finally {
      setRecalculating(false)
    }
  }

  // ── FILTERED + SORTED LINE ITEMS ────────────────────────────────
  const filteredItems = lineItems
    .filter(item => !item.is_excluded)
    .filter(item => !filterDivision || item.csi_division === filterDivision)
    .filter(item => !searchQuery ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.csi_code || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const av = a[sortField] ?? ''
      const bv = b[sortField] ?? ''
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })

  // ── UNIQUE DIVISIONS ───────────────────────────────────────────
  const divisions = [...new Set(lineItems.map(i => i.csi_division).filter(Boolean))] as string[]

  // ── INLINE CELL COMPONENT ──────────────────────────────────────
  const EditableCell = ({
    item, field, numeric = false, prefix = ''
  }: {
    item: LineItem
    field: keyof LineItem
    numeric?: boolean
    prefix?: string
  }) => {
    const isEditing = editingCell?.itemId === item.id && editingCell?.field === field
    const value = item[field] as string | number | null

    if (isEditing) {
      return (
        <input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => commitEdit(item)}
          onKeyDown={e => {
            if (e.key === 'Enter') commitEdit(item)
            if (e.key === 'Escape') setEditingCell(null)
          }}
          style={{
            background: '#0d1117', color: WHITE, border: `1px solid ${BLUE}`,
            borderRadius: 3, padding: '3px 6px', width: '100%',
            fontSize: 13, outline: 'none',
          }}
        />
      )
    }

    return (
      <span
        onClick={() => startEdit(item.id, String(field), value)}
        style={{
          cursor: 'text', display: 'block', padding: '4px 6px',
          borderRadius: 3, minWidth: 40,
          background: pendingEdits[item.id] ? '#1a2a1a' : 'transparent',
          color: pendingEdits[item.id] ? GREEN : WHITE,
          transition: 'background .2s',
        }}
        title="Click to edit"
      >
        {prefix}{value != null ? (numeric ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }) : value) : '—'}
      </span>
    )
  }

  // ── Create bid package from takeoff division ──
  const handleCreateBidPackageFromDivision = async (div: string, data: { description: string; line_total: number }) => {
    if (creatingPackages[div] || createdPackages[div]) return
    setCreatingPackages(prev => ({ ...prev, [div]: true }))
    try {
      const res = await fetch('/api/bid-packages/create-from-takeoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          takeoffId: activeTakeoff?.id,
          projectId,
          csiDivision: div,
          packageName: `${data.description} — Division ${div}`,
        }),
      })
      if (res.ok) {
        setCreatedPackages(prev => ({ ...prev, [div]: true }))
      } else {
        const err = await res.json()
        console.error('[takeoffs] create bid package failed:', err)
      }
    } catch (e) {
      console.error('[takeoffs] create bid package error:', e)
    } finally {
      setCreatingPackages(prev => ({ ...prev, [div]: false }))
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div style={{ background: BG, minHeight: '100vh', color: WHITE, fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes slideIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes flashIn { from{background:#1a2a1a} to{background:transparent} }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        input,select { background:#0d1117!important; color:#e6edf3!important; border:1px solid #30363d!important;
          border-radius:4px!important; padding:6px 10px!important; font-size:14px!important; outline:none!important; }
        input:focus,select:focus { border-color:#388bfd!important; }
        .btn { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:6px;
          border:none; cursor:pointer; font-size:13px; font-weight:600; min-height:36px;
          transition:opacity .15s; white-space:nowrap; }
        .btn:hover { opacity:.85; } .btn:disabled { opacity:.4; cursor:not-allowed; }
        .btn-gold  { background:#d4a017; color:#0d1117; }
        .btn-blue  { background:#388bfd; color:#fff; }
        .btn-ghost { background:transparent; color:#8b949e; border:1px solid #30363d!important; }
        .btn-dark  { background:#161b22; color:#e6edf3; border:1px solid #30363d!important; }
        .btn-red   { background:#f85149; color:#fff; }
        .tab { padding:10px 18px; cursor:pointer; font-size:13px; font-weight:600;
          border-bottom:2px solid transparent; color:#8b949e; transition:all .15s; background:none; border-left:none; border-right:none; border-top:none; }
        .tab.active { color:#e6edf3; border-bottom-color:#d4a017; }
        .tab:hover:not(.active) { color:#e6edf3; }
        .th { text-align:left; padding:8px 10px; font-size:11px; color:#8b949e;
          text-transform:uppercase; letter-spacing:.5px; font-weight:700;
          cursor:pointer; user-select:none; white-space:nowrap; }
        .th:hover { color:#e6edf3; }
        .tr { border-bottom:1px solid #21262d; }
        .tr:hover { background:#1c2128; }
        .td { padding:6px 10px; font-size:13px; vertical-align:middle; }
        input[type=range] { -webkit-appearance:none; width:100%; height:4px;
          background:#30363d; border-radius:2px; border:none!important; padding:0!important; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none;
          width:16px; height:16px; background:#d4a017; border-radius:50%; cursor:pointer; }
      `}</style>

      {/* ── STATE: LOADING SKELETON ──────────────────────────────── */}
      {loading && (
        <IntelligenceIndicator
          variant="loading"
          size="lg"
          message="Loading your takeoffs..."
          subMessage="Fetching takeoff records and cost summaries"
        />
      )}

      {/* ── STATE: EMPTY / UPLOAD ──────────────────────────────── */}
      {!loading && takeoffs.length === 0 && !uploading && !streaming && (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 40,
        }}>
          <div
            ref={dragRef}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%', maxWidth: 680,
              background: dragging ? '#1a2a1a' : CARD,
              border: `2px dashed ${dragging ? GREEN : BORDER}`,
              borderRadius: 16, padding: '64px 40px', textAlign: 'center',
              cursor: 'pointer', transition: 'all .2s',
            }}
          >
            <div style={{ fontSize: 56, marginBottom: 20 }}>📐</div>
            <h2 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 12px', color: WHITE }}>
              ✨ Sage AI Takeoff Extraction
            </h2>
            <p style={{ fontSize: 16, color: DIM, margin: '0 0 32px', lineHeight: 1.7 }}>
              Drop your construction plan set here or click to upload.<br />
              Sage reads every page, extracts every quantity, assigns CSI codes,<br />
              and delivers a complete priced takeoff in minutes — not days.
            </p>
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 32
            }}>
              {['Concrete & Structural', 'Mechanical / HVAC', 'Electrical', 'Plumbing', 'Sitework', 'Finishes'].map(t => (
                <span key={t} style={{
                  fontSize: 12, padding: '4px 12px', borderRadius: 12,
                  background: GOLD + '20', color: GOLD, fontWeight: 600,
                }}>✓ {t}</span>
              ))}
            </div>
            <button className="btn btn-gold" style={{ fontSize: 16, padding: '14px 40px', minHeight: 52 }}>
              Upload Plan Set PDF
            </button>
            <p style={{ fontSize: 12, color: DIM, marginTop: 16 }}>
              PDF format · Up to 100MB · All pages analyzed
            </p>
          </div>
          <input
            ref={fileInputRef} type="file" accept=".pdf,image/*"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
        </div>
      )}

      {/* ── STATE: UPLOADING / STREAMING — TWO-COLUMN LAYOUT ──── */}
      {(uploading || streaming) && (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
          <style>{`
            @keyframes slideInRight { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
          `}</style>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 24, minHeight: 500 }}>
            {/* LEFT COLUMN — Progress + Division Radar */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: WHITE, marginBottom: 4 }}>
                  Sage AI is reading your plans
                </div>
                <div style={{ fontSize: 13, color: DIM }}>Do not close this tab. Results are saving automatically.</div>
              </div>

              {/* Progress Bar */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ height: 8, background: BORDER, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${streamPct}%`, background: `linear-gradient(90deg, ${GREEN}, ${GOLD})`, borderRadius: 4, transition: 'width 0.5s ease' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 12, color: DIM }}>{getSmartMessage(streamPct, smartMessageIndex)}</span>
                  <span style={{ fontSize: 12, color: GOLD, fontWeight: 700 }}>{streamPct}%</span>
                </div>
              </div>

              {/* Page Grid */}
              {totalPages > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: DIM, textTransform: 'uppercase',
                    letterSpacing: '0.1em', marginBottom: 8 }}>
                    PAGES ANALYZED
                  </div>
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 4,
                  }}>
                    {Array.from({ length: totalPages }, (_, i) => {
                      const pageNum = i + 1
                      const status = pageNum < currentPage ? 'complete'
                        : pageNum === currentPage ? 'active'
                        : 'pending'
                      return (
                        <div key={pageNum} title={`Page ${pageNum}`} style={{
                          width: 14, height: 18, borderRadius: 2,
                          background:
                            status === 'complete' ? GREEN :
                            status === 'active'   ? GOLD :
                                                     BORDER,
                          transition: 'background 0.3s ease',
                          cursor: 'default',
                        }} />
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: DIM, marginTop: 6 }}>
                    {currentPage > 0 ? `${currentPage} of ${totalPages} pages read` : 'Starting...'}
                  </div>
                </div>
              )}

              {/* Running Totals */}
              <div style={{ background: BG, borderRadius: 8, padding: '12px 16px', marginBottom: 20, border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 12, color: DIM, marginBottom: 4 }}>RUNNING TOTAL</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: GOLD }}>
                  ${runningTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{runningItemCount} items extracted so far</div>
              </div>

              {/* Division Radar */}
              {Object.keys(divisionGroups).length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>DIVISIONS DETECTED</div>
                  {Object.entries(divisionGroups).sort(([, a], [, b]) => b.estimatedTotal - a.estimatedTotal).map(([div, group]) => (
                    <div key={div} style={{ marginBottom: 10, opacity: group.isActive ? 1 : 0.8, transition: 'opacity 0.3s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ background: group.isActive ? GOLD : BORDER, color: group.isActive ? BG : DIM, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, transition: 'all 0.3s' }}>{div}</span>
                          <span style={{ fontSize: 12, color: WHITE }}>{group.divisionName}</span>
                          {group.isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, animation: 'pulse 1s ease-in-out infinite', display: 'inline-block' }} />}
                        </div>
                        <span style={{ fontSize: 11, color: DIM }}>{group.itemCount} items</span>
                      </div>
                      <div style={{ height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, (group.itemCount / Math.max(runningItemCount, 1)) * 100 * 3)}%`, background: group.isActive ? GOLD : GREEN, borderRadius: 2, transition: 'width 0.5s ease' }} />
                      </div>
                      {group.estimatedTotal > 0 && (
                        <div style={{ fontSize: 11, color: DIM, marginTop: 2, textAlign: 'right' }}>${group.estimatedTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} est.</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN — Live Item Feed */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, overflow: 'hidden' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: DIM, marginBottom: 16 }}>LIVE EXTRACTION FEED</div>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px 60px 100px', gap: 8, marginBottom: 8, fontSize: 11, color: DIM, textTransform: 'uppercase', borderBottom: `1px solid ${BORDER}`, paddingBottom: 8 }}>
                <span>CSI</span><span>Description</span><span style={{ textAlign: 'right' }}>Qty</span><span>Unit</span><span style={{ textAlign: 'right' }}>Est. Cost</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 420, overflowY: 'auto', overflowX: 'hidden' }}>
                {[...streamItems].reverse().slice(0, 25).map((item, index) => (
                  <div key={`${item.description}-${index}`} style={{
                    display: 'grid', gridTemplateColumns: '80px 1fr 80px 60px 100px', gap: 8, padding: '6px 4px',
                    background: index === 0 ? '#0d2818' : 'transparent', borderRadius: 4,
                    animation: index === 0 ? 'slideInRight 0.3s ease' : undefined, transition: 'background 1s ease', fontSize: 12,
                  }}>
                    <span style={{ background: '#21262d', color: GOLD, borderRadius: 3, padding: '1px 6px', fontSize: 10, fontWeight: 700, alignSelf: 'center', textAlign: 'center' }}>
                      {String(item.csi_division || '').substring(0, 2) || '—'}
                    </span>
                    <span style={{ color: WHITE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', alignSelf: 'center' }}>
                      {item.description || '—'}
                    </span>
                    <span style={{ color: WHITE, textAlign: 'right', alignSelf: 'center' }}>{item.quantity?.toLocaleString() || '—'}</span>
                    <span style={{ color: DIM, alignSelf: 'center' }}>{item.unit || '—'}</span>
                    <span style={{ color: DIM, textAlign: 'right', alignSelf: 'center' }}>
                      {item.quantity && (item.unit_material_cost || item.unit_labor_cost)
                        ? `$${((item.quantity) * ((item.unit_material_cost || 0) + (item.unit_labor_cost || 0))).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : '—'}
                    </span>
                  </div>
                ))}
                {streamItems.length === 0 && (
                  <div style={{ color: DIM, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Waiting for first items...</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STATE: EXTRACTION ERROR ─────────────────────────────── */}
      {extractionError && !streaming && (
        <div style={{
          maxWidth: 600, margin: '80px auto', padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: WHITE, marginBottom: 8 }}>
            Extraction Failed
          </div>
          <div style={{
            background: '#1a0a0a', border: '1px solid #f85149',
            borderRadius: 8, padding: 16, marginBottom: 24,
            fontSize: 13, color: '#f85149', lineHeight: 1.6,
          }}>
            {extractionError}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              className="btn btn-gold"
              onClick={() => {
                setExtractionError(null)
                if (activeTakeoff) connectStream(activeTakeoff.id)
              }}
            >
              Try Again
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setExtractionError(null)}
            >
              Dismiss
            </button>
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: DIM }}>
            Persistent issue?{' '}
            <a href="mailto:chad@tntcybersolutions.com" style={{ color: '#388bfd' }}>Contact support</a>
          </div>
        </div>
      )}

      {/* ── STATE: COMPLETE — TAKEOFF EDITOR ──────────────────── */}
      {activeTakeoff?.status === 'complete' && !streaming && !uploading && (
        <div style={{ maxWidth: 1300, margin: '0 auto', padding: '24px 16px' }}>

          {/* Completion Summary */}
          <div style={{ background: 'linear-gradient(135deg, #0a1f0f, #0d1117)', border: `1px solid ${GREEN}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: GREEN, marginBottom: 4 }}>Extraction Complete</div>
                <div style={{ color: DIM, fontSize: 13 }}>
                  {activeTakeoff.page_count || 0} pages analyzed
                  {activeTakeoff.extraction_confidence ? ` · ${Math.round(activeTakeoff.extraction_confidence * 100)}% average confidence` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: GOLD }}>${Number(activeTakeoff.grand_total || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div style={{ fontSize: 12, color: DIM }}>Grand Total (with markup)</div>
              </div>
            </div>

            {(activeTakeoff.total_material || activeTakeoff.total_labor) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 20 }}>
                {[
                  { label: 'Material', value: activeTakeoff.total_material, color: BLUE },
                  { label: 'Labor', value: activeTakeoff.total_labor, color: GOLD },
                  { label: 'Equipment', value: activeTakeoff.total_equipment, color: DIM },
                  { label: 'Overhead + Profit', value: (activeTakeoff.total_overhead || 0) + (activeTakeoff.total_profit || 0), color: GREEN },
                ].map(item => {
                  const pct = activeTakeoff.grand_total > 0 ? Math.round((Number(item.value || 0) / Number(activeTakeoff.grand_total)) * 100) : 0
                  return (
                    <div key={item.label} style={{ background: CARD, borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 11, color: DIM, marginBottom: 6 }}>{item.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: WHITE }}>${Number(item.value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                      <div style={{ height: 4, background: BORDER, borderRadius: 2, marginTop: 6 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: item.color, borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>{pct}%</div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Create Bid Packages CTA */}
            {activeTakeoff.csi_breakdown && (
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${BORDER}` }}>
                <div style={{ fontWeight: 600, color: WHITE, marginBottom: 12 }}>Create bid packages from this takeoff — one per trade:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(activeTakeoff.csi_breakdown)
                    .sort(([, a], [, b]) => b.subtotal - a.subtotal)
                    .slice(0, 8)
                    .map(([div, data]) => (
                    <button key={div} onClick={() => handleCreateBidPackageFromDivision(div, { description: data.division_name, line_total: data.subtotal })} disabled={creatingPackages[div] || createdPackages[div]}
                      style={{
                        background: createdPackages[div] ? '#0d2818' : CARD, border: `1px solid ${createdPackages[div] ? GREEN : BORDER}`,
                        color: createdPackages[div] ? GREEN : WHITE, borderRadius: 6, padding: '8px 14px', fontSize: 12,
                        cursor: createdPackages[div] ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                      {createdPackages[div] ? '✓' : '+'} Div {div} — {data.division_name}
                      <span style={{ color: DIM, fontSize: 11 }}>${Math.round(data.subtotal).toLocaleString()}</span>
                      {creatingPackages[div] && <span style={{ color: DIM }}>...</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
                  {activeTakeoff.name}
                </h1>
                {activeTakeoff.extraction_confidence && (
                  <span style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 12,
                    background: GREEN + '20', color: GREEN, fontWeight: 700,
                  }}>
                    {Math.round(activeTakeoff.extraction_confidence * 100)}% confidence
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: DIM }}>
                  {activeTakeoff.page_count} pages · {lineItems.length} items
                </span>
                {activeTakeoff.cost_per_sqft && (
                  <span style={{ fontSize: 13, color: DIM }}>
                    {fmt$(activeTakeoff.cost_per_sqft)}/SF
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Grand total */}
              <div style={{
                background: GOLD + '15', border: `1px solid ${GOLD}44`,
                borderRadius: 8, padding: '8px 16px', textAlign: 'right',
              }}>
                <div style={{ fontSize: 10, color: GOLD, textTransform: 'uppercase', fontWeight: 700 }}>Grand Total</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: GOLD }}>{fmt$(activeTakeoff.grand_total)}</div>
              </div>

              {/* Upload new */}
              <button className="btn btn-ghost" style={{ minHeight: 44 }}
                onClick={() => fileInputRef.current?.click()}>
                + New Takeoff
              </button>

              {/* Export dropdown */}
              <div style={{ position: 'relative' }}>
                <button className="btn btn-blue" style={{ minHeight: 44 }}
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true)
                    try {
                      const res = await fetch(`/api/takeoffs/${activeTakeoff.id}/export`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ format: 'pdf' }),
                      })
                      if (res.ok) {
                        const blob = await res.blob()
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url; a.download = `takeoff-${activeTakeoff.name}.pdf`; a.click()
                      }
                    } finally { setExporting(false) }
                  }}>
                  {exporting ? '⏳' : '⬇'} Export PDF
                </button>
              </div>

              {/* Ask Sage */}
              <button className="btn btn-gold" style={{ minHeight: 44 }}
                onClick={() => {
                  const msg = `My takeoff for ${activeTakeoff.name} shows a grand total of ${fmt$(activeTakeoff.grand_total)}. Material: ${fmt$(activeTakeoff.total_material)}, Labor: ${fmt$(activeTakeoff.total_labor)}. Help me analyze this.`
                  window.dispatchEvent(new CustomEvent('open-sage', { detail: { message: msg } }))
                }}>
                ✨ Ask Sage
              </button>
            </div>
          </div>

          {/* Cost tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Material',     value: activeTakeoff.total_material,      color: ORANGE },
              { label: 'Labor',        value: activeTakeoff.total_labor,         color: BLUE   },
              { label: 'Equipment',    value: activeTakeoff.total_equipment,      color: PURPLE },
              { label: 'Subcontractor',value: activeTakeoff.total_subcontractor, color: GREEN  },
              { label: 'Overhead',     value: activeTakeoff.total_overhead,      color: DIM    },
              { label: 'Profit',       value: activeTakeoff.total_profit,        color: GOLD   },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: CARD, border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: '12px 14px',
                borderLeft: `3px solid ${color}`,
              }}>
                <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: WHITE, marginTop: 4 }}>{fmt$(value)}</div>
                {activeTakeoff.grand_total > 0 && (
                  <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>
                    {((value / activeTakeoff.grand_total) * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, marginBottom: 20, gap: 0, overflowX: 'auto' }}>
            {([
              { key: 'items',       label: `Line Items (${lineItems.length})` },
              { key: 'by_division', label: 'By CSI Division' },
              { key: 'sov',         label: 'Schedule of Values' },
              { key: 'cost_summary',label: 'Cost Summary' },
              { key: 'markup',      label: 'Markup Settings' },
            ] as { key: Tab; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                className={`tab ${activeTab === key ? 'active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── TAB: LINE ITEMS ──────────────────────────────── */}
          {activeTab === 'items' && (
            <div>
              {/* Search + filter bar */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <input
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ flex: '1 1 200px', minWidth: 200 }}
                />
                <select
                  value={filterDivision}
                  onChange={e => setFilterDivision(e.target.value)}
                  style={{ flex: '0 0 220px' }}
                >
                  <option value="">All CSI Divisions</option>
                  {divisions.sort().map(d => (
                    <option key={d} value={d}>Div {d} — {lineItems.find(i => i.csi_division === d)?.csi_description || d}</option>
                  ))}
                </select>
                <button className="btn btn-dark" onClick={addItem}>+ Add Item</button>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${BORDER}` }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr style={{ background: '#161b22', borderBottom: `2px solid ${BORDER}` }}>
                      {[
                        { field: 'csi_division', label: 'CSI' },
                        { field: 'description',  label: 'Description', wide: true },
                        { field: 'quantity',      label: 'Qty' },
                        { field: 'unit',          label: 'Unit' },
                        { field: 'unit_material_cost', label: 'Mat $/unit' },
                        { field: 'unit_labor_cost',    label: 'Labor $/unit' },
                        { field: null,                 label: 'Line Total' },
                        { field: null,                 label: '' },
                      ].map(({ field, label, wide }) => (
                        <th
                          key={label}
                          className="th"
                          style={{ width: wide ? undefined : label === '' ? 40 : undefined }}
                          onClick={() => {
                            if (!field) return
                            if (sortField === field) setSortAsc(a => !a)
                            else { setSortField(field as keyof LineItem); setSortAsc(true) }
                          }}
                        >
                          {label}
                          {field && sortField === field && (sortAsc ? ' ↑' : ' ↓')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(item => {
                      const total = lineTotal(item)
                      return (
                        <tr key={item.id} className="tr" style={{ opacity: item.is_excluded ? 0.4 : 1 }}>
                          <td className="td">
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                              background: (CSI_COLORS[item.csi_division || ''] || BLUE) + '22',
                              color: CSI_COLORS[item.csi_division || ''] || BLUE,
                            }}>
                              {item.csi_division || '—'}
                            </span>
                          </td>
                          <td className="td" style={{ maxWidth: 340 }}>
                            <EditableCell item={item} field="description" />
                            {item.sheet_number && (
                              <div style={{ fontSize: 10, color: DIM, paddingLeft: 6 }}>{item.sheet_number}</div>
                            )}
                            {item.ai_confidence && item.ai_confidence < 0.65 && (
                              <div style={{ fontSize: 10, color: ORANGE, paddingLeft: 6 }}>⚠ Low confidence</div>
                            )}
                          </td>
                          <td className="td" style={{ minWidth: 70 }}>
                            <EditableCell item={item} field="quantity" numeric />
                          </td>
                          <td className="td" style={{ minWidth: 60 }}>
                            <EditableCell item={item} field="unit" />
                          </td>
                          <td className="td" style={{ minWidth: 90 }}>
                            <EditableCell item={item} field="unit_material_cost" numeric prefix="$" />
                          </td>
                          <td className="td" style={{ minWidth: 90 }}>
                            <EditableCell item={item} field="unit_labor_cost" numeric prefix="$" />
                          </td>
                          <td className="td" style={{ minWidth: 100, fontWeight: 700, color: GOLD }}>
                            {fmt$(total)}
                          </td>
                          <td className="td" style={{ textAlign: 'right' }}>
                            {savingItem === item.id
                              ? <span style={{ color: BLUE, fontSize: 12 }}>↻</span>
                              : (
                                <button
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: RED, fontSize: 14, padding: '2px 6px' }}
                                  onClick={() => deleteItem(item.id)}
                                >🗑</button>
                              )
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${BORDER}`, background: CARD }}>
                      <td className="td" colSpan={6} style={{ fontWeight: 700, color: DIM }}>
                        {filteredItems.length} items
                      </td>
                      <td className="td" style={{ fontWeight: 800, color: GOLD, fontSize: 15 }}>
                        {fmt$(filteredItems.reduce((s, i) => s + lineTotal(i), 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ── TAB: BY CSI DIVISION ─────────────────────────── */}
          {activeTab === 'by_division' && (
            <div style={{ display: 'grid', gap: 10 }}>
              {divisions.sort().map(div => {
                const divItems = lineItems.filter(i => i.csi_division === div && !i.is_excluded)
                const divTotal = divItems.reduce((s, i) => s + lineTotal(i), 0)
                const divName  = divItems[0]?.csi_description || activeTakeoff.csi_breakdown?.[div]?.division_name || div
                const color    = CSI_COLORS[div] || BLUE

                return (
                  <details key={div} open={divItems.length < 10}>
                    <summary style={{
                      background: CARD, border: `1px solid ${BORDER}`,
                      borderLeft: `4px solid ${color}`,
                      borderRadius: 8, padding: '14px 18px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      cursor: 'pointer', listStyle: 'none', userSelect: 'none',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontWeight: 700, color: WHITE }}>Division {div} — {divName}</span>
                        <span style={{ fontSize: 12, color: DIM }}>{divItems.length} items</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontWeight: 800, color: GOLD, fontSize: 16 }}>{fmt$(divTotal)}</span>
                        {createdPkgs[div] ? (
                          <a
                            href={`/app/projects/${projectId}/bid-packages/${createdPkgs[div]}`}
                            style={{ fontSize: 12, color: GREEN, textDecoration: 'none', fontWeight: 600 }}
                            onClick={e => e.stopPropagation()}
                          >
                            ✓ View Package
                          </a>
                        ) : (
                          <button
                            onClick={e => { e.preventDefault(); e.stopPropagation(); handleCreateBidPackage(div, divName) }}
                            disabled={creatingPkg === div}
                            style={{
                              padding: '5px 14px', fontSize: 12, fontWeight: 600,
                              background: creatingPkg === div ? BORDER : GOLD + '20',
                              color: creatingPkg === div ? DIM : GOLD,
                              border: `1px solid ${GOLD}44`, borderRadius: 6,
                              cursor: creatingPkg === div ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {creatingPkg === div ? 'Creating…' : '📬 Create Bid Package'}
                          </button>
                        )}
                      </div>
                    </summary>
                    <div style={{ padding: '4px 0 0 0' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          {divItems.map(item => (
                            <tr key={item.id} style={{ borderBottom: `1px solid ${BORDER}22` }}>
                              <td style={{ padding: '8px 18px', fontSize: 13, color: DIM, width: 100 }}>
                                {item.sheet_number || '—'}
                              </td>
                              <td style={{ padding: '8px 10px', fontSize: 13, color: WHITE }}>
                                {item.description}
                              </td>
                              <td style={{ padding: '8px 10px', fontSize: 13, color: DIM, textAlign: 'right' }}>
                                {item.quantity} {item.unit}
                              </td>
                              <td style={{ padding: '8px 18px', fontSize: 13, color: GOLD, textAlign: 'right', fontWeight: 700 }}>
                                {fmt$(lineTotal(item))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )
              })}
            </div>
          )}

          {/* ── TAB: COST SUMMARY ────────────────────────────── */}
          {activeTab === 'cost_summary' && (
            <div style={{ maxWidth: 700 }}>
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
                {[
                  { label: 'Material (with markup)',     value: activeTakeoff.total_material,      color: ORANGE, pct: activeTakeoff.grand_total },
                  { label: 'Labor (with markup)',        value: activeTakeoff.total_labor,         color: BLUE,   pct: activeTakeoff.grand_total },
                  { label: 'Equipment (with markup)',    value: activeTakeoff.total_equipment,     color: PURPLE, pct: activeTakeoff.grand_total },
                  { label: 'Subcontractor',             value: activeTakeoff.total_subcontractor, color: GREEN,  pct: activeTakeoff.grand_total },
                ].map(({ label, value, color, pct }) => (
                  <div key={label} style={{ padding: '16px 24px', borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 14, color: WHITE }}>{label}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: WHITE }}>{fmt$(value)}</span>
                    </div>
                    <div style={{ height: 6, background: BORDER, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', background: color, borderRadius: 3,
                        width: pct > 0 ? `${Math.min((value / pct) * 100, 100)}%` : '0%',
                        transition: 'width .5s',
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>
                      {pct > 0 ? ((value / pct) * 100).toFixed(1) : 0}% of grand total
                    </div>
                  </div>
                ))}

                {/* Subtotal */}
                <div style={{ padding: '14px 24px', borderBottom: `1px solid ${BORDER}`, background: '#1c2128' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: WHITE }}>Subtotal</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: WHITE }}>{fmt$(activeTakeoff.subtotal)}</span>
                  </div>
                </div>

                {[
                  { label: `Overhead (${activeTakeoff.overhead_pct}%)`, value: activeTakeoff.total_overhead },
                  { label: `Profit (${activeTakeoff.profit_pct}%)`,     value: activeTakeoff.total_profit  },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: '14px 24px', borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 14, color: DIM }}>{label}</span>
                      <span style={{ fontSize: 14, color: DIM }}>{fmt$(value)}</span>
                    </div>
                  </div>
                ))}

                {/* Grand Total */}
                <div style={{ padding: '20px 24px', background: GOLD + '15' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>GRAND TOTAL</span>
                    <span style={{ fontSize: 26, fontWeight: 900, color: GOLD }}>{fmt$(activeTakeoff.grand_total)}</span>
                  </div>
                  {activeTakeoff.cost_per_sqft && (
                    <div style={{ fontSize: 13, color: DIM, marginTop: 6 }}>
                      {fmt$(activeTakeoff.cost_per_sqft)} per square foot
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: MARKUP SETTINGS ─────────────────────────── */}
          {activeTab === 'markup' && (
            <div style={{ maxWidth: 560 }}>
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 24 }}>
                <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Adjust Markup & Overhead</h3>

                {[
                  { key: 'markup_labor_pct',     label: 'Labor Markup',     min: 0, max: 50 },
                  { key: 'markup_material_pct',  label: 'Material Markup',  min: 0, max: 40 },
                  { key: 'markup_equipment_pct', label: 'Equipment Markup', min: 0, max: 40 },
                  { key: 'overhead_pct',         label: 'Overhead',         min: 0, max: 30 },
                  { key: 'profit_pct',           label: 'Profit',           min: 0, max: 30 },
                ].map(({ key, label, min, max }) => {
                  const val = markupForm[key as keyof typeof markupForm]
                  const k = key as keyof typeof markupForm
                  return (
                    <div key={key} style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 14, color: WHITE }}>{label}</span>
                        <span style={{ fontSize: 15, fontWeight: 700, color: GOLD }}>{val}%</span>
                      </div>
                      <input
                        type="range" min={min} max={max} step={0.5}
                        value={val}
                        onChange={e => setMarkupForm(f => ({ ...f, [k]: Number(e.target.value) }))}
                      />
                    </div>
                  )
                })}

                <div style={{
                  borderTop: `1px solid ${BORDER}`, paddingTop: 16, marginTop: 8,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 13, color: DIM }}>
                    New grand total: <strong style={{ color: GOLD }}>
                      {fmt$((() => {
                        const s = activeTakeoff.subtotal || 0
                        const oh = s * (markupForm.overhead_pct / 100)
                        return s + oh + (s + oh) * (markupForm.profit_pct / 100)
                      })())}
                    </strong>
                  </span>
                  <button
                    className="btn btn-gold"
                    disabled={recalculating}
                    onClick={handleRecalculate}
                    style={{ minHeight: 44 }}
                  >
                    {recalculating ? '⏳ Recalculating...' : '↻ Recalculate All'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: SCHEDULE OF VALUES ──────────────────────── */}
          {activeTab === 'sov' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button className="btn btn-blue"
                  onClick={async () => {
                    setExporting(true)
                    try {
                      const res = await fetch(`/api/takeoffs/${activeTakeoff.id}/export`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ format: 'sov' }),
                      })
                      if (res.ok) {
                        const blob = await res.blob()
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url; a.download = `SOV-${activeTakeoff.name}.pdf`; a.click()
                      }
                    } finally { setExporting(false) }
                  }}>
                  📑 Download AIA G703 SOV
                </button>
              </div>
              <div style={{ overflowX: 'auto', border: `1px solid ${BORDER}`, borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                  <thead>
                    <tr style={{ background: '#1c2128', borderBottom: `2px solid ${BORDER}` }}>
                      {['Item No.', 'Description of Work', 'Scheduled Value', '% Complete', 'Balance to Finish'].map(h => (
                        <th key={h} className="th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {divisions.sort().map((div, idx) => {
                      const divItems = lineItems.filter(i => i.csi_division === div && !i.is_excluded)
                      const divTotal = divItems.reduce((s, i) => s + lineTotal(i), 0)
                      const divName  = divItems[0]?.csi_description || div
                      return (
                        <tr key={div} className="tr">
                          <td className="td" style={{ color: DIM }}>{String(idx + 1).padStart(2, '0')}</td>
                          <td className="td" style={{ color: WHITE, fontWeight: 600 }}>
                            Division {div} — {divName}
                          </td>
                          <td className="td" style={{ color: GOLD, fontWeight: 700 }}>{fmt$(divTotal)}</td>
                          <td className="td" style={{ color: DIM }}>0%</td>
                          <td className="td" style={{ color: WHITE }}>{fmt$(divTotal)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${BORDER}`, background: CARD }}>
                      <td className="td" colSpan={2} style={{ fontWeight: 800, color: WHITE }}>TOTAL CONTRACT SUM</td>
                      <td className="td" style={{ fontWeight: 900, color: GOLD, fontSize: 16 }}>{fmt$(activeTakeoff.grand_total)}</td>
                      <td className="td" style={{ color: DIM }}>0%</td>
                      <td className="td" style={{ fontWeight: 800, color: GOLD }}>{fmt$(activeTakeoff.grand_total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Hidden file input for new takeoff */}
      <input
        ref={fileInputRef} type="file" accept=".pdf,image/*"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
    </div>
  )
}
