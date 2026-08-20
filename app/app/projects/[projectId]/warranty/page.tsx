'use client'
import { useState, useEffect, useCallback } from 'react'
import { IntelligenceIndicator } from '@/app/app/components/IntelligenceIndicator'
import { statusBar } from '@/app/app/components/StatusBar'
import { useToast } from '@/app/app/components/Toast'

interface WarrantyItem {
  id: string
  equipment_name: string
  manufacturer: string | null
  model_number: string | null
  serial_number: string | null
  location: string | null
  warranty_type: string
  warranty_duration_months: number
  warranty_start_date: string
  warranty_end_date: string
  days_remaining: number
  status: string
  coverage_description: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  warranty_number: string | null
  csi_division: string | null
  claim_filed: boolean
  claim_date: string | null
  claim_description: string | null
  ai_extracted: boolean
}

const WARRANTY_TYPES = [
  { value: 'manufacturer', label: 'Manufacturer Warranty' },
  { value: 'labor',        label: 'Labor Warranty' },
  { value: 'extended',     label: 'Extended Warranty' },
  { value: 'bond',         label: 'Performance Bond' },
]

const CSI_DIVISIONS = [
  { value: '03', label: '03 — Concrete' },
  { value: '05', label: '05 — Metals' },
  { value: '07', label: '07 — Thermal & Moisture' },
  { value: '08', label: '08 — Openings' },
  { value: '09', label: '09 — Finishes' },
  { value: '21', label: '21 — Fire Suppression' },
  { value: '22', label: '22 — Plumbing' },
  { value: '23', label: '23 — HVAC' },
  { value: '26', label: '26 — Electrical' },
  { value: '27', label: '27 — Communications' },
  { value: '28', label: '28 — Electronic Safety' },
]

export default function WarrantyPage({
  params,
}: { params: Promise<{ projectId: string }> }) {
  const [projectId, setProjectId] = useState('')
  const [items, setItems] = useState<WarrantyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addForm, setAddForm] = useState({
    equipment_name: '',
    manufacturer: '',
    model_number: '',
    serial_number: '',
    location: '',
    warranty_type: 'manufacturer',
    warranty_duration_months: '12',
    warranty_start_date: new Date().toISOString().split('T')[0],
    coverage_description: '',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    warranty_number: '',
    csi_division: '',
  })
  const toast = useToast()

  useEffect(() => {
    params.then(p => {
      setProjectId(p.projectId)
      fetchItems(p.projectId)
    })
  }, [params])

  const fetchItems = useCallback(async (pid: string) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/warranty/${pid}`)
      if (r.ok) {
        const { items: data } = await r.json()
        setItems(data || [])
      }
    } catch (e) {
      console.error('[warranty] fetch failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleExtract = async () => {
    setExtracting(true)
    statusBar.show('warranty-extract', 'working',
      'Sage AI is reading project documents...',
      'Extracting equipment and warranty information')
    try {
      const r = await fetch(`/api/warranty/${projectId}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (r.ok) {
        const { warranties_created } = await r.json()
        statusBar.success('warranty-extract',
          `✓ ${warranties_created || 0} warranty records extracted`)
        toast.success(`Sage AI extracted ${warranties_created || 0} warranty items`)
        fetchItems(projectId)
      } else {
        const { error } = await r.json().catch(() => ({ error: 'Extract failed' }))
        statusBar.error('warranty-extract', error || 'Extract failed')
        toast.error(error || 'Failed to extract warranties')
      }
    } catch {
      statusBar.error('warranty-extract', 'Connection error')
      toast.error('Connection error — try again')
    } finally {
      setExtracting(false)
    }
  }

  const handleAddWarranty = async () => {
    if (!addForm.equipment_name || !addForm.warranty_start_date) {
      toast.error('Equipment name and start date are required')
      return
    }
    setSaving(true)
    statusBar.show('warranty-add', 'working', `Adding "${addForm.equipment_name}"...`)
    try {
      const r = await fetch(`/api/warranty/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...addForm,
          warranty_duration_months: parseInt(addForm.warranty_duration_months) || 12,
        }),
      })
      if (r.ok) {
        statusBar.success('warranty-add', `✓ "${addForm.equipment_name}" added`)
        toast.success('Warranty item added')
        setShowAddModal(false)
        setAddForm({
          equipment_name: '', manufacturer: '', model_number: '',
          serial_number: '', location: '', warranty_type: 'manufacturer',
          warranty_duration_months: '12',
          warranty_start_date: new Date().toISOString().split('T')[0],
          coverage_description: '', contact_name: '',
          contact_phone: '', contact_email: '', warranty_number: '', csi_division: '',
        })
        fetchItems(projectId)
      } else {
        const { error } = await r.json().catch(() => ({ error: 'Save failed' }))
        statusBar.error('warranty-add', error || 'Save failed')
        toast.error(error || 'Failed to add warranty')
      }
    } catch {
      statusBar.error('warranty-add', 'Connection error')
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })

  const getDaysLabel = (days: number, status: string): string => {
    if (status === 'expired') return `Expired ${Math.abs(days)}d ago`
    if (days === 0) return 'Expires today'
    if (days < 30) return `${days}d remaining`
    const months = Math.floor(days / 30)
    const remainDays = days % 30
    if (months >= 12) {
      const yrs = Math.floor(months / 12)
      const mos = months % 12
      return mos > 0 ? `${yrs}yr ${mos}mo remaining` : `${yrs}yr remaining`
    }
    return remainDays > 0 ? `${months}mo ${remainDays}d remaining` : `${months}mo remaining`
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'expired':       return { color: '#f85149', bg: 'rgba(248,81,73,0.1)',  badge: '✗ EXPIRED'  }
      case 'expiring_soon': return { color: '#e3b341', bg: 'rgba(227,179,65,0.1)', badge: '⚠ EXPIRING' }
      default:              return { color: '#2ea043', bg: 'rgba(46,160,67,0.1)',  badge: '✓ ACTIVE'   }
    }
  }

  if (loading) return (
    <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
      <IntelligenceIndicator variant="loading" size="lg"
        message="Loading warranty tracker..."
        subMessage="Calculating expiration dates" />
    </div>
  )

  const expired      = items.filter(i => i.status === 'expired')
  const expiringSoon = items.filter(i => i.status === 'expiring_soon')
  const active       = items.filter(i => i.status === 'active')

  const renderItem = (item: WarrantyItem) => {
    const cfg = getStatusConfig(item.status)
    const isExpanded = expandedId === item.id
    const daysLabel = getDaysLabel(item.days_remaining, item.status)

    return (
      <div key={item.id}>
        <div
          onClick={() => setExpandedId(isExpanded ? null : item.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '13px 20px',
            borderBottom: '1px solid rgba(48,54,61,0.5)',
            cursor: 'pointer',
            background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent',
            transition: 'background 0.15s ease',
          }}>

          {/* Equipment icon */}
          <span style={{ fontSize: 20, flexShrink: 0 }}>
            {item.csi_division === '23' ? '❄️'
              : item.csi_division === '26' ? '⚡'
              : item.csi_division === '22' ? '🚿'
              : item.csi_division === '07' ? '🏠'
              : '🔧'}
          </span>

          {/* Name + details */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14, fontWeight: 600, color: '#e6edf3',
              marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {item.equipment_name}
              {item.ai_extracted && (
                <span style={{
                  fontSize: 9, color: '#a371f7',
                  background: 'rgba(163,113,247,0.1)',
                  border: '1px solid rgba(163,113,247,0.2)',
                  borderRadius: 20, padding: '1px 6px', fontWeight: 700,
                }}>
                  ✨ AI
                </span>
              )}
            </div>
            <div style={{
              fontSize: 11, color: '#8b949e',
              display: 'flex', gap: 10, flexWrap: 'wrap',
            }}>
              {item.manufacturer && <span>{item.manufacturer}</span>}
              {item.location && <span>📍 {item.location}</span>}
              {item.warranty_duration_months && (
                <span>{item.warranty_duration_months}mo warranty</span>
              )}
            </div>
          </div>

          {/* Expiry date */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 13, color: '#e6edf3', fontWeight: 500 }}>
              {formatDate(item.warranty_end_date)}
            </div>
            <div style={{ fontSize: 11, color: cfg.color, fontWeight: 600 }}>
              {daysLabel}
            </div>
          </div>

          {/* Status badge */}
          <div style={{
            background: cfg.bg, border: `1px solid ${cfg.color}44`,
            borderRadius: 20, padding: '3px 10px',
            fontSize: 10, fontWeight: 700, color: cfg.color,
            textTransform: 'uppercase', flexShrink: 0,
          }}>
            {cfg.badge}
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div style={{
            background: '#0d1117', padding: '14px 20px 16px 54px',
            borderBottom: '1px solid rgba(48,54,61,0.5)',
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12, marginBottom: 12,
            }}>
              {[
                { label: 'Warranty Type',  value: WARRANTY_TYPES.find(t => t.value === item.warranty_type)?.label || item.warranty_type },
                { label: 'Start Date',     value: formatDate(item.warranty_start_date) },
                { label: 'Warranty #',     value: item.warranty_number || '—' },
                { label: 'Model Number',   value: item.model_number || '—' },
                { label: 'Serial Number',  value: item.serial_number || '—' },
                { label: 'CSI Division',   value: item.csi_division
                    ? CSI_DIVISIONS.find(d => d.value === item.csi_division)?.label || item.csi_division
                    : '—' },
              ].map((detail, i) => (
                <div key={i}>
                  <div style={{
                    fontSize: 10, color: '#6e7681', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3,
                  }}>
                    {detail.label}
                  </div>
                  <div style={{ fontSize: 12, color: '#e6edf3' }}>{detail.value}</div>
                </div>
              ))}
            </div>
            {item.coverage_description && (
              <div style={{
                fontSize: 12, color: '#8b949e', marginBottom: 10,
                lineHeight: 1.6,
              }}>
                <strong style={{ color: '#e6edf3' }}>Coverage: </strong>
                {item.coverage_description}
              </div>
            )}
            {(item.contact_name || item.contact_phone || item.contact_email) && (
              <div style={{
                background: '#161b22', border: '1px solid #30363d',
                borderRadius: 8, padding: '10px 14px',
                display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10,
              }}>
                <span style={{ fontSize: 10, color: '#8b949e', fontWeight: 700,
                  textTransform: 'uppercase', alignSelf: 'center' }}>
                  Contact:
                </span>
                {item.contact_name && (
                  <span style={{ fontSize: 12, color: '#e6edf3' }}>{item.contact_name}</span>
                )}
                {item.contact_phone && (
                  <a href={`tel:${item.contact_phone}`} style={{
                    fontSize: 12, color: '#388bfd', textDecoration: 'none',
                  }}>
                    {item.contact_phone}
                  </a>
                )}
                {item.contact_email && (
                  <a href={`mailto:${item.contact_email}`} style={{
                    fontSize: 12, color: '#388bfd', textDecoration: 'none',
                  }}>
                    {item.contact_email}
                  </a>
                )}
              </div>
            )}
            {item.claim_filed && (
              <div style={{
                background: 'rgba(248,81,73,0.08)',
                border: '1px solid rgba(248,81,73,0.25)',
                borderRadius: 8, padding: '10px 14px',
              }}>
                <div style={{ fontSize: 11, color: '#f85149', fontWeight: 700, marginBottom: 4 }}>
                  ⚠️ Claim Filed {item.claim_date ? `— ${formatDate(item.claim_date)}` : ''}
                </div>
                {item.claim_description && (
                  <div style={{ fontSize: 12, color: '#8b949e' }}>
                    {item.claim_description}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 24,
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e6edf3', margin: 0 }}>
            Warranty Tracker
          </h1>
          <p style={{ fontSize: 13, color: '#8b949e', marginTop: 4, marginBottom: 0 }}>
            Equipment warranties and service contacts
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleExtract}
            disabled={extracting}
            style={{
              background: extracting
                ? 'rgba(163,113,247,0.05)' : 'rgba(163,113,247,0.1)',
              border: '1px solid rgba(163,113,247,0.3)',
              color: '#a371f7', borderRadius: 8,
              padding: '10px 18px', fontSize: 13,
              fontWeight: 600, cursor: extracting ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <span style={{
              display: 'inline-block',
              animation: extracting ? 'rotateRing 1s linear infinite' : 'none',
            }}>
              {extracting ? '⟳' : '✨'}
            </span>
            {extracting ? 'Extracting...' : 'Extract from Docs'}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              background: '#d4a017', color: '#0d1117', border: 'none',
              borderRadius: 8, padding: '10px 20px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
            + Add Warranty
          </button>
        </div>
      </div>

      {/* KPI bar */}
      {items.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10, marginBottom: 24,
        }}>
          {[
            { label: 'EXPIRING ≤30 DAYS', value: expiringSoon.length, color: '#e3b341', bg: 'rgba(227,179,65,0.08)', border: 'rgba(227,179,65,0.25)' },
            { label: 'ACTIVE',            value: active.length,       color: '#2ea043', bg: 'rgba(46,160,67,0.06)',  border: 'rgba(46,160,67,0.2)' },
            { label: 'EXPIRED',           value: expired.length,      color: '#f85149', bg: 'rgba(248,81,73,0.06)',  border: 'rgba(248,81,73,0.2)' },
          ].map((kpi, i) => (
            <div key={i} style={{
              background: kpi.bg, border: `1px solid ${kpi.border}`,
              borderRadius: 10, padding: '14px 20px',
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: kpi.color,
                textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6,
              }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: kpi.color }}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div style={{
          background: '#161b22', border: '1px solid #30363d',
          borderRadius: 12, padding: '60px 40px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🛡️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e6edf3', marginBottom: 8 }}>
            No warranties tracked yet
          </div>
          <div style={{ fontSize: 13, color: '#8b949e', maxWidth: 400, margin: '0 auto 20px' }}>
            Extract warranties from closeout documents automatically,
            or add equipment warranties manually.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={handleExtract} disabled={extracting} style={{
              background: 'rgba(163,113,247,0.1)',
              border: '1px solid rgba(163,113,247,0.3)',
              color: '#a371f7', borderRadius: 8,
              padding: '10px 18px', fontSize: 13,
              fontWeight: 600, cursor: 'pointer',
            }}>
              ✨ Extract from Docs
            </button>
            <button onClick={() => setShowAddModal(true)} style={{
              background: 'rgba(212,160,23,0.1)',
              border: '1px solid rgba(212,160,23,0.3)',
              color: '#d4a017', borderRadius: 8,
              padding: '10px 18px', fontSize: 13,
              fontWeight: 600, cursor: 'pointer',
            }}>
              + Add Manually
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Expiring soon section */}
          {expiringSoon.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: '#e3b341',
                textTransform: 'uppercase', letterSpacing: '0.1em',
                padding: '8px 0', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>⚠️</span>
                <span>Expiring Within 30 Days ({expiringSoon.length})</span>
              </div>
              <div style={{
                background: '#161b22',
                border: '1px solid rgba(227,179,65,0.3)',
                borderRadius: 12, overflow: 'hidden',
              }}>
                {expiringSoon.map(renderItem)}
              </div>
            </div>
          )}

          {/* Active section */}
          {active.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: '#2ea043',
                textTransform: 'uppercase', letterSpacing: '0.1em',
                padding: '8px 0', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>✓</span>
                <span>Active ({active.length})</span>
              </div>
              <div style={{
                background: '#161b22', border: '1px solid #30363d',
                borderRadius: 12, overflow: 'hidden',
              }}>
                {active.map(renderItem)}
              </div>
            </div>
          )}

          {/* Expired section */}
          {expired.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: '#484f58',
                textTransform: 'uppercase', letterSpacing: '0.1em',
                padding: '8px 0', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>✗</span>
                <span>Expired ({expired.length})</span>
              </div>
              <div style={{
                background: '#161b22', border: '1px solid #30363d',
                borderRadius: 12, overflow: 'hidden', opacity: 0.7,
              }}>
                {expired.map(renderItem)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          zIndex: 1000, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            background: '#161b22', border: '1px solid #30363d',
            borderRadius: 14, padding: 28, width: '100%', maxWidth: 580,
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{
              fontSize: 17, fontWeight: 700, color: '#e6edf3', marginBottom: 20,
            }}>
              + Add Warranty Item
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="s-label">Equipment Name *</label>
                <input className="s-input"
                  placeholder="e.g. Carrier RTU-1, Elevator System, Roof Membrane"
                  value={addForm.equipment_name}
                  onChange={e => setAddForm(p => ({ ...p, equipment_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="s-label">Manufacturer</label>
                <input className="s-input" placeholder="Carrier, Otis, Firestone..."
                  value={addForm.manufacturer}
                  onChange={e => setAddForm(p => ({ ...p, manufacturer: e.target.value }))}
                />
              </div>
              <div>
                <label className="s-label">Model Number</label>
                <input className="s-input" placeholder="Model #"
                  value={addForm.model_number}
                  onChange={e => setAddForm(p => ({ ...p, model_number: e.target.value }))}
                />
              </div>
              <div>
                <label className="s-label">Serial Number</label>
                <input className="s-input" placeholder="Serial #"
                  value={addForm.serial_number}
                  onChange={e => setAddForm(p => ({ ...p, serial_number: e.target.value }))}
                />
              </div>
              <div>
                <label className="s-label">Location</label>
                <input className="s-input" placeholder="Rooftop, Level 2, Mechanical Room..."
                  value={addForm.location}
                  onChange={e => setAddForm(p => ({ ...p, location: e.target.value }))}
                />
              </div>
              <div>
                <label className="s-label">Warranty Type</label>
                <select className="s-input s-select"
                  value={addForm.warranty_type}
                  onChange={e => setAddForm(p => ({ ...p, warranty_type: e.target.value }))}>
                  {WARRANTY_TYPES.map(t => (
                    <option key={t.value} value={t.value}
                      style={{ background: '#1c2128' }}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="s-label">Duration (months) *</label>
                <input className="s-input" type="number" min="1" max="240"
                  value={addForm.warranty_duration_months}
                  onChange={e => setAddForm(p => ({
                    ...p, warranty_duration_months: e.target.value,
                  }))}
                />
              </div>
              <div>
                <label className="s-label">Start Date *</label>
                <input className="s-input" type="date"
                  value={addForm.warranty_start_date}
                  onChange={e => setAddForm(p => ({
                    ...p, warranty_start_date: e.target.value,
                  }))}
                />
              </div>
              <div>
                <label className="s-label">CSI Division</label>
                <select className="s-input s-select"
                  value={addForm.csi_division}
                  onChange={e => setAddForm(p => ({ ...p, csi_division: e.target.value }))}>
                  <option value="" style={{ background: '#1c2128' }}>Select division...</option>
                  {CSI_DIVISIONS.map(d => (
                    <option key={d.value} value={d.value}
                      style={{ background: '#1c2128' }}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="s-label">Warranty Number</label>
                <input className="s-input" placeholder="Registration / claim number"
                  value={addForm.warranty_number}
                  onChange={e => setAddForm(p => ({ ...p, warranty_number: e.target.value }))}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="s-label">Coverage Description</label>
                <textarea className="s-input s-textarea" rows={2}
                  placeholder="What is covered under this warranty..."
                  value={addForm.coverage_description}
                  onChange={e => setAddForm(p => ({
                    ...p, coverage_description: e.target.value,
                  }))}
                />
              </div>
              <div>
                <label className="s-label">Warranty Contact</label>
                <input className="s-input" placeholder="Contact name"
                  value={addForm.contact_name}
                  onChange={e => setAddForm(p => ({ ...p, contact_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="s-label">Contact Phone</label>
                <input className="s-input" type="tel" placeholder="(480) 555-0100"
                  value={addForm.contact_phone}
                  onChange={e => setAddForm(p => ({ ...p, contact_phone: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={handleAddWarranty}
                disabled={saving || !addForm.equipment_name}
                style={{
                  background: '#d4a017', color: '#0d1117', border: 'none',
                  borderRadius: 8, padding: '10px 24px',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  opacity: saving || !addForm.equipment_name ? 0.6 : 1,
                }}>
                {saving ? '⟳ Saving...' : 'Add Warranty'}
              </button>
              <button onClick={() => setShowAddModal(false)} style={{
                background: 'transparent', border: '1px solid #30363d',
                color: '#8b949e', borderRadius: 8,
                padding: '10px 16px', fontSize: 13, cursor: 'pointer',
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
