'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'

const DARK = '#0d1117'
const CARD = '#161b22'
const BORDER = '#30363d'
const GOLD = '#d4a017'
const TEXT = '#e6edf3'
const DIM = '#8b949e'
const GREEN = '#2ea043'
const RED = '#f85149'
const AMBER = '#e3b341'

const EQUIP_ICONS: Record<string, string> = {
  crane: '\u{1F3D7}\uFE0F', excavator: '\u{1F69B}', loader: '\u{1F69C}', forklift: '\u{1F3CB}\uFE0F',
  scaffold: '\u{1FA9C}', pump: '\u26FD', compactor: '\u{1F527}', generator: '\u26A1',
  lift: '\u2B06\uFE0F', concrete_equipment: '\u{1F3D7}\uFE0F', other: '\u{1F527}',
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  planned:   { color: DIM,   label: 'Planned' },
  on_site:   { color: GREEN, label: 'On Site' },
  returned:  { color: '#8b949e', label: 'Returned' },
  cancelled: { color: DIM,   label: 'Cancelled' },
}

interface Equipment {
  id: string; equipment_name: string; equipment_type: string
  make: string | null; model: string | null; vendor_name: string | null
  vendor_phone: string | null; mobilization_date: string | null
  demobilization_date: string | null; actual_demob_date: string | null
  rate_type: string; rate_amount: number; estimated_duration_days: number | null
  actual_total_cost: number | null; csi_division: string | null
  status: string; po_number: string | null; notes: string | null
}

interface EquipSummary {
  total_items: number; on_site: number; planned: number; returned: number
  estimated_total: number; actual_total: number; on_site_daily_cost: number
}

function fmt(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${Math.round(n / 1000)}K`
  return `$${Math.round(n).toLocaleString()}`
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: 14,
  background: DARK, border: `1px solid ${BORDER}`,
  borderRadius: 8, color: TEXT, outline: 'none', boxSizing: 'border-box',
}

export default function EquipmentPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [items, setItems] = useState<Equipment[]>([])
  const [summary, setSummary] = useState<EquipSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [returning, setReturning] = useState<string | null>(null)
  const [returnCost, setReturnCost] = useState('')
  const [form, setForm] = useState({
    equipment_name: '', equipment_type: 'other', make: '', model: '',
    vendor_name: '', vendor_phone: '', mobilization_date: '', demobilization_date: '',
    rate_type: 'daily', rate_amount: 0, estimated_duration_days: 0,
    csi_division: '', po_number: '', notes: '', status: 'planned',
  })

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/equipment/${projectId}`)
      if (r.ok) {
        const d = await r.json()
        setItems(d.data || [])
        setSummary(d.summary || null)
      }
    } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    const r = await fetch(`/api/equipment/${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (r.ok) {
      setShowAdd(false)
      setForm({ equipment_name: '', equipment_type: 'other', make: '', model: '', vendor_name: '', vendor_phone: '', mobilization_date: '', demobilization_date: '', rate_type: 'daily', rate_amount: 0, estimated_duration_days: 0, csi_division: '', po_number: '', notes: '', status: 'planned' })
      load()
    }
  }

  const handleReturn = async (equipId: string) => {
    await fetch(`/api/equipment/${projectId}/${equipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'returned', actual_total_cost: Number(returnCost) || 0 }),
    })
    setReturning(null)
    setReturnCost('')
    load()
  }

  const sorted = [...items].sort((a, b) => {
    const statusOrder: Record<string, number> = { on_site: 0, planned: 1, returned: 2, cancelled: 3 }
    return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
  })

  const today = new Date().toISOString().split('T')[0]

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: DIM }}>Loading equipment...</div>
  )

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: 0 }}>Equipment / Rentals</h1>
          <p style={{ fontSize: 13, color: DIM, margin: '4px 0 0' }}>
            Track cranes, excavators, scaffolds, and all rented equipment
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{
          background: GOLD, color: DARK, borderRadius: 8, padding: '10px 20px',
          fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
        }}>
          + Add Equipment
        </button>
      </div>

      {/* KPI row */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'On Site', value: String(summary.on_site), color: GREEN },
            { label: 'Planned', value: String(summary.planned), color: AMBER },
            { label: 'Daily Burn Rate', value: summary.on_site_daily_cost > 0 ? fmt(summary.on_site_daily_cost) + '/day' : '$0', color: summary.on_site_daily_cost > 0 ? RED : DIM },
            { label: 'Total Estimated', value: fmt(summary.estimated_total), color: TEXT },
          ].map((kpi, i) => (
            <div key={i} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#6e7681', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 6 }}>{kpi.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Equipment list */}
      {sorted.length === 0 ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{'\u{1F527}'}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 8 }}>No equipment tracked</div>
          <div style={{ fontSize: 13, color: DIM, marginBottom: 20 }}>Add cranes, excavators, scaffolds, and other rented equipment</div>
          <button onClick={() => setShowAdd(true)} style={{ background: GOLD, color: DARK, borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            + Add Equipment
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map(eq => {
            const st = STATUS_CONFIG[eq.status] || STATUS_CONFIG.planned
            const isOverdue = eq.status === 'on_site' && eq.demobilization_date && eq.demobilization_date < today
            const estCost = eq.rate_type === 'daily' ? eq.rate_amount * (eq.estimated_duration_days || 0)
              : eq.rate_type === 'weekly' ? eq.rate_amount * Math.ceil((eq.estimated_duration_days || 0) / 7)
              : eq.rate_type === 'monthly' ? eq.rate_amount * Math.ceil((eq.estimated_duration_days || 0) / 30)
              : eq.rate_amount

            return (
              <div key={eq.id} style={{
                background: CARD, border: `1px solid ${isOverdue ? 'rgba(248,81,73,0.3)' : BORDER}`,
                borderLeft: `4px solid ${isOverdue ? RED : st.color}`,
                borderRadius: 10, padding: '14px 20px',
                display: 'grid', gridTemplateColumns: '40px 1fr 140px 120px 140px 120px',
                alignItems: 'center', gap: 14,
              }}>
                <span style={{ fontSize: 24 }}>{EQUIP_ICONS[eq.equipment_type] || '\u{1F527}'}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {eq.equipment_name}
                  </div>
                  <div style={{ fontSize: 11, color: DIM, display: 'flex', gap: 10, marginTop: 2 }}>
                    {eq.vendor_name && <span>{eq.vendor_name}</span>}
                    {eq.po_number && <span>PO: {eq.po_number}</span>}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{fmt(eq.rate_amount)}/{eq.rate_type === 'daily' ? 'day' : eq.rate_type === 'weekly' ? 'wk' : eq.rate_type === 'monthly' ? 'mo' : 'LS'}</div>
                  <div style={{ fontSize: 10, color: DIM }}>Est: {fmt(estCost)}</div>
                </div>
                <div>
                  {eq.mobilization_date && (
                    <div style={{ fontSize: 11, color: DIM }}>
                      {new Date(eq.mobilization_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {eq.demobilization_date && ` \u2014 ${new Date(eq.demobilization_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </div>
                  )}
                  {isOverdue && <div style={{ fontSize: 10, color: RED, fontWeight: 700, marginTop: 2 }}>OVERDUE</div>}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12,
                  background: `${st.color}22`, color: st.color, border: `1px solid ${st.color}44`,
                  textAlign: 'center',
                }}>
                  {st.label}
                </span>
                <div>
                  {eq.status === 'on_site' && (
                    returning === eq.id ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input style={{ ...inputStyle, width: 80, padding: '4px 8px', fontSize: 12 }} type="number" placeholder="Final $" value={returnCost} onChange={e => setReturnCost(e.target.value)} />
                        <button onClick={() => handleReturn(eq.id)} style={{ background: GREEN, color: DARK, border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>OK</button>
                      </div>
                    ) : (
                      <button onClick={() => setReturning(eq.id)} style={{ background: 'rgba(46,160,67,0.1)', border: `1px solid rgba(46,160,67,0.3)`, color: GREEN, borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
                        Return
                      </button>
                    )
                  )}
                  {eq.status === 'returned' && eq.actual_total_cost && (
                    <div style={{ fontSize: 12, color: DIM }}>Final: {fmt(eq.actual_total_cost)}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Cost summary footer */}
      {items.length > 0 && summary && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, color: DIM }}>
            Estimated total: <span style={{ color: TEXT, fontWeight: 700 }}>{fmt(summary.estimated_total)}</span>
          </div>
          {summary.actual_total > 0 && (
            <div style={{ fontSize: 11, color: DIM }}>
              Actual (returned): <span style={{ color: GREEN, fontWeight: 700 }}>{fmt(summary.actual_total)}</span>
            </div>
          )}
          {summary.on_site_daily_cost > 0 && (
            <div style={{ fontSize: 11, color: DIM }}>
              Daily burn: <span style={{ color: RED, fontWeight: 700 }}>{fmt(summary.on_site_daily_cost)}/day</span>
            </div>
          )}
        </div>
      )}

      {/* Add Equipment Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: TEXT, margin: '0 0 20px' }}>Add Equipment</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Equipment Name *</label>
                <input style={inputStyle} placeholder="Manitowoc 14000 Crawler Crane" value={form.equipment_name} onChange={e => setForm(f => ({ ...f, equipment_name: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Type</label>
                <select style={inputStyle} value={form.equipment_type} onChange={e => setForm(f => ({ ...f, equipment_type: e.target.value }))}>
                  {Object.keys(EQUIP_ICONS).map(t => (
                    <option key={t} value={t}>{EQUIP_ICONS[t]} {t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Status</label>
                <select style={inputStyle} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="planned">Planned</option>
                  <option value="on_site">On Site</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Vendor</label>
                <input style={inputStyle} placeholder="Maxim Crane Works" value={form.vendor_name} onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Vendor Phone</label>
                <input style={inputStyle} placeholder="(602) 555-0400" value={form.vendor_phone} onChange={e => setForm(f => ({ ...f, vendor_phone: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Mobilization Date</label>
                <input style={inputStyle} type="date" value={form.mobilization_date} onChange={e => setForm(f => ({ ...f, mobilization_date: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Demobilization Date</label>
                <input style={inputStyle} type="date" value={form.demobilization_date} onChange={e => setForm(f => ({ ...f, demobilization_date: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Rate Type</label>
                <select style={inputStyle} value={form.rate_type} onChange={e => setForm(f => ({ ...f, rate_type: e.target.value }))}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="lump_sum">Lump Sum</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Rate Amount</label>
                <input style={inputStyle} type="number" value={form.rate_amount} onChange={e => setForm(f => ({ ...f, rate_amount: Number(e.target.value) }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Est. Duration (days)</label>
                <input style={inputStyle} type="number" value={form.estimated_duration_days} onChange={e => setForm(f => ({ ...f, estimated_duration_days: Number(e.target.value) }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>CSI Division</label>
                <input style={inputStyle} placeholder="03" value={form.csi_division} onChange={e => setForm(f => ({ ...f, csi_division: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>PO Number</label>
                <input style={inputStyle} placeholder="PO-2025-0042" value={form.po_number} onChange={e => setForm(f => ({ ...f, po_number: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: DIM, display: 'block', marginBottom: 4 }}>Notes</label>
                <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' as const }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowAdd(false)} style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: DIM, borderRadius: 8, padding: '10px 20px', fontSize: 13, cursor: 'pointer', minHeight: 44 }}>Cancel</button>
              <button onClick={handleAdd} disabled={!form.equipment_name} style={{ background: GOLD, color: DARK, border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: form.equipment_name ? 1 : 0.5, minHeight: 44 }}>Add Equipment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
