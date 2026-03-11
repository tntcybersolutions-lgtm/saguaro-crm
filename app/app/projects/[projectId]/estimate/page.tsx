'use client';
import React, { useState } from 'react';
import { DEMO_PROJECT } from '../../../../../demo-data';

const GOLD = '#D4A017'; const DARK = '#0d1117'; const RAISED = '#1f2c3e';
const BORDER = '#263347'; const DIM = '#8fa3c0'; const TEXT = '#e8edf8';
const GREEN = '#1a8a4a'; const RED = '#c03030';

type CostType = 'Labor' | 'Material' | 'Equipment' | 'Subcontractor' | 'Fee' | 'Allowance';
type Status = 'Working' | 'Complete' | 'Pending';

interface EstimateLine {
  id: string;
  name: string;
  cost_type: CostType;
  status: Status;
  quantity: number;
  unit: string;
  unit_cost: number;
  markup_pct: number;
  builder_cost: number;
  amount: number;
  is_group?: boolean;
  group_id?: string;
  notes?: string;
}

const INITIAL_LINES: EstimateLine[] = [
  { id: 'g1', name: '00001 - REPLACE EXISTING HVAC SYSTEM', cost_type: 'Labor', status: 'Complete', quantity: 0, unit: '', unit_cost: 0, markup_pct: 20, builder_cost: 13852, amount: 16622.40, is_group: true },
  { id: 'l1', name: 'Indirect', cost_type: 'Labor', status: 'Complete', quantity: 0, unit: '', unit_cost: 0, markup_pct: 20, builder_cost: 2950, amount: 3540, is_group: true, group_id: 'g1' },
  { id: 'l2', name: 'Project Manager', cost_type: 'Labor', status: 'Complete', quantity: 1, unit: 'Week', unit_cost: 600, markup_pct: 20, builder_cost: 600, amount: 720, group_id: 'g1' },
  { id: 'l3', name: 'Superintendent', cost_type: 'Labor', status: 'Complete', quantity: 2, unit: 'Days', unit_cost: 800, markup_pct: 20, builder_cost: 1600, amount: 1920, group_id: 'g1' },
  { id: 'l4', name: 'Job Mileage', cost_type: 'Fee', status: 'Complete', quantity: 600, unit: 'Miles', unit_cost: 0, markup_pct: 20, builder_cost: 0, amount: 0, group_id: 'g1' },
  { id: 'l5', name: 'Cell Phone', cost_type: 'Equipment', status: 'Complete', quantity: 1, unit: 'Month', unit_cost: 100, markup_pct: 20, builder_cost: 100, amount: 120, group_id: 'g1' },
  { id: 'l6', name: 'Superintendent Truck', cost_type: 'Equipment', status: 'Complete', quantity: 1, unit: 'Month', unit_cost: 400, markup_pct: 20, builder_cost: 400, amount: 480, group_id: 'g1' },
  { id: 'l7', name: 'Final Cleaning', cost_type: 'Labor', status: 'Complete', quantity: 1, unit: 'Lump Sum', unit_cost: 250, markup_pct: 20, builder_cost: 250, amount: 300, group_id: 'g1' },
  { id: 'g2', name: 'Subcontract', cost_type: 'Subcontractor', status: 'Complete', quantity: 0, unit: '', unit_cost: 0, markup_pct: 20, builder_cost: 10902, amount: 13082.40, is_group: true, group_id: 'g1' },
  { id: 'l8', name: 'Replace existing HVAC bar…', cost_type: 'Subcontractor', status: 'Complete', quantity: 1, unit: 'Unit', unit_cost: 10902, markup_pct: 20, builder_cost: 10902, amount: 13082.40, group_id: 'g2' },

  // Additional realistic estimate lines
  { id: 'g3', name: '00002 - FRAMING & ROUGH CARPENTRY', cost_type: 'Labor', status: 'Working', quantity: 0, unit: '', unit_cost: 0, markup_pct: 18, builder_cost: 68000, amount: 80240, is_group: true },
  { id: 'l9',  name: 'Exterior Wall Framing 2×6 @16" OC', cost_type: 'Labor', status: 'Working', quantity: 1, unit: 'Lump Sum', unit_cost: 24000, markup_pct: 18, builder_cost: 24000, amount: 28320, group_id: 'g3' },
  { id: 'l10', name: 'Interior Partition Framing', cost_type: 'Labor', status: 'Working', quantity: 1, unit: 'Lump Sum', unit_cost: 14000, markup_pct: 18, builder_cost: 14000, amount: 16520, group_id: 'g3' },
  { id: 'l11', name: 'Roof Framing & Sheathing', cost_type: 'Subcontractor', status: 'Pending', quantity: 1, unit: 'Lump Sum', unit_cost: 30000, markup_pct: 18, builder_cost: 30000, amount: 35400, group_id: 'g3' },

  { id: 'g4', name: '00003 - CONCRETE FOUNDATIONS', cost_type: 'Subcontractor', status: 'Complete', quantity: 0, unit: '', unit_cost: 0, markup_pct: 15, builder_cost: 87000, amount: 100050, is_group: true },
  { id: 'l12', name: 'Slab-on-Grade 4" thick 3000 PSI', cost_type: 'Material', status: 'Complete', quantity: 46, unit: 'CY', unit_cost: 145, markup_pct: 15, builder_cost: 6670, amount: 7671, group_id: 'g4' },
  { id: 'l13', name: 'Perimeter Footings', cost_type: 'Subcontractor', status: 'Complete', quantity: 1, unit: 'Lump Sum', unit_cost: 48000, markup_pct: 15, builder_cost: 48000, amount: 55200, group_id: 'g4' },
  { id: 'l14', name: 'Rebar #4 Grade 60', cost_type: 'Material', status: 'Complete', quantity: 3080, unit: 'LF', unit_cost: 0.85, markup_pct: 15, builder_cost: 2618, amount: 3011, group_id: 'g4' },
];

const COST_TYPE_COLORS: Record<CostType, { bg: string; color: string }> = {
  Labor:       { bg: 'rgba(26,95,168,.15)',  color: '#4a9de8' },
  Material:    { bg: 'rgba(34,168,94,.12)',  color: '#3dd68c' },
  Equipment:   { bg: 'rgba(212,160,23,.15)', color: GOLD },
  Subcontractor: { bg: 'rgba(167,139,250,.15)', color: '#a78bfa' },
  Fee:         { bg: 'rgba(148,163,184,.12)', color: '#94a3b8' },
  Allowance:   { bg: 'rgba(244,114,182,.12)', color: '#f472b6' },
};

const STATUS_COLORS: Record<Status, { bg: string; color: string }> = {
  Complete: { bg: 'rgba(26,138,74,.15)',   color: '#3dd68c' },
  Working:  { bg: 'rgba(212,160,23,.15)',  color: GOLD },
  Pending:  { bg: 'rgba(148,163,184,.12)', color: '#94a3b8' },
};

export default function EstimatePage() {
  const [lines, setLines] = useState<EstimateLine[]>(INITIAL_LINES);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [showAddLine, setShowAddLine] = useState(false);
  const [groupBy, setGroupBy] = useState<'lines' | 'type' | 'status'>('lines');
  const [toast, setToast] = useState<{msg:string;type:'success'|'error'}|null>(null);

  React.useEffect(()=>{ const t=toast?setTimeout(()=>setToast(null),5000):null; return ()=>{ if(t) clearTimeout(t); }; },[toast]);

  // Summary totals
  const rootLines = lines.filter(l => l.is_group && !l.group_id);
  const totalBuilderCost = rootLines.reduce((s, l) => s + l.builder_cost, 0);
  const totalMarkup       = rootLines.reduce((s, l) => s + (l.amount - l.builder_cost), 0);
  const totalAmount        = rootLines.reduce((s, l) => s + l.amount, 0);

  const toggleCollapse = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  };

  const isVisible = (line: EstimateLine) => {
    if (!line.group_id) return true;
    if (collapsed.has(line.group_id)) return false;
    // Check parent groups recursively
    const parent = lines.find(l => l.id === line.group_id);
    if (parent?.group_id && collapsed.has(parent.group_id)) return false;
    return true;
  };

  const fmt = (n: number) => n === 0 ? '$ 0.00' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleAIFill = () => {
    setToast({msg:'AI Takeoff: Go to Project → Takeoff → Upload Blueprint to auto-populate line items.',type:'success'});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      {toast && (
        <div style={{position:'fixed',bottom:'24px',left:'50%',transform:'translateX(-50%)',zIndex:99999,padding:'12px 20px',borderRadius:'8px',background:toast.type==='success'?'rgba(34,197,94,0.9)':'rgba(239,68,68,0.9)',color:'#fff',fontWeight:600,fontSize:'14px',pointerEvents:'none'}}>
          {toast.msg}
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12, background: DARK, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: TEXT }}>Estimate</div>
          <div style={{ fontSize: 12, color: DIM }}>{DEMO_PROJECT.name} · Version 1 <span style={{ background: 'rgba(212,160,23,.15)', color: GOLD, padding: '1px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, marginLeft: 4 }}>WORKING</span></div>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setCollapsed(new Set(lines.filter(l=>l.is_group).map(l=>l.id)))} style={{ padding: '6px 12px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 6, color: DIM, fontSize: 12, cursor: 'pointer' }}>
            Collapse All
          </button>
          <button onClick={() => setCollapsed(new Set())} style={{ padding: '6px 12px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 6, color: DIM, fontSize: 12, cursor: 'pointer' }}>
            Expand All
          </button>

          {/* Filter */}
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="🔍 Search lines..." style={{ padding: '6px 10px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12, outline: 'none', width: 160 }} />

          {/* Group by */}
          <select value={groupBy} onChange={e => setGroupBy(e.target.value as typeof groupBy)} style={{ padding: '6px 10px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12, cursor: 'pointer' }}>
            <option value="lines">Group by Lines</option>
            <option value="type">Group by Type</option>
            <option value="status">Group by Status</option>
          </select>

          <button onClick={handleAIFill} style={{ padding: '6px 12px', background: 'rgba(212,160,23,.12)', border: `1px solid rgba(212,160,23,.3)`, borderRadius: 6, color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            🤖 AI Fill from Blueprint
          </button>
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.csv,.xlsx,.xls';
              input.onchange = () => {
                if (input.files && input.files[0]) {
                  setToast({ msg: `File "${input.files[0].name}" selected. Connect your data pipeline to parse and import estimate lines.`, type: 'success' });
                }
              };
              input.click();
            }}
            style={{ padding: '6px 12px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 6, color: DIM, fontSize: 12, cursor: 'pointer' }}
          >
            Import CSV
          </button>
          <button onClick={() => setShowAddLine(true)} style={{ padding: '7px 16px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 6, color: '#0d1117', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            + Add Item
          </button>
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <colgroup>
            <col style={{ width: 30 }} />
            <col style={{ minWidth: 280 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 32 }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#0a1117', position: 'sticky', top: 0, zIndex: 10 }}>
              <th style={{ padding: '10px 8px', textAlign: 'center', borderBottom: `1px solid ${BORDER}` }}>
                <input type="checkbox" />
              </th>
              {['Name','Cost Type','Status','Quantity','Unit','Unit Cost','Builder Cost','Markup','Amount',''].map(h => (
                <th key={h} style={{ padding: '10px 10px', textAlign: h === 'Amount' || h === 'Builder Cost' || h === 'Unit Cost' ? 'right' : 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: DIM, borderBottom: `1px solid ${BORDER}`, userSelect: 'none', cursor: 'pointer' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.filter(l => isVisible(l) && (filter === '' || l.name.toLowerCase().includes(filter.toLowerCase()))).map(line => {
              const depth = line.group_id ? (lines.find(l => l.id === line.group_id)?.group_id ? 2 : 1) : 0;
              const isCollapsed = collapsed.has(line.id);
              const ctColor = COST_TYPE_COLORS[line.cost_type];
              const stColor = STATUS_COLORS[line.status];
              const isEditing = editingId === line.id;

              return (
                <tr key={line.id} onDoubleClick={() => setEditingId(line.id)} style={{ borderBottom: `1px solid rgba(38,51,71,.4)`, background: line.is_group && !line.group_id ? 'rgba(255,255,255,.02)' : 'transparent', transition: 'background .1s', cursor: 'default' }}>

                  {/* Checkbox */}
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    <input type="checkbox" />
                  </td>

                  {/* Name */}
                  <td style={{ padding: '8px 10px', paddingLeft: 10 + depth * 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {line.is_group && (
                        <button onClick={() => toggleCollapse(line.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: DIM, fontSize: 12, padding: 0, width: 16, flexShrink: 0 }}>
                          {isCollapsed ? '▶' : '▼'}
                        </button>
                      )}
                      {!line.is_group && <span style={{ width: 16, flexShrink: 0 }} />}
                      {line.is_group ? (
                        <span style={{ fontWeight: 700, color: TEXT, fontSize: 12.5 }}>{line.name}</span>
                      ) : (
                        <span style={{ color: TEXT }}>{line.name}</span>
                      )}
                    </div>
                  </td>

                  {/* Cost Type */}
                  <td style={{ padding: '8px 10px' }}>
                    {!line.is_group && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: ctColor.bg, color: ctColor.color, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {line.cost_type === 'Labor' ? '👷' : line.cost_type === 'Material' ? '📦' : line.cost_type === 'Equipment' ? '🔧' : line.cost_type === 'Subcontractor' ? '🏢' : '💼'}
                        {line.cost_type}
                      </span>
                    )}
                  </td>

                  {/* Status */}
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: stColor.bg, color: stColor.color, fontWeight: 600 }}>
                      ● {line.status}
                    </span>
                  </td>

                  {/* Quantity */}
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: line.quantity ? TEXT : '#4a5f7a' }}>
                    {line.quantity > 0 ? line.quantity.toLocaleString() : ''}
                  </td>

                  {/* Unit */}
                  <td style={{ padding: '8px 10px', color: DIM }}>{line.unit}</td>

                  {/* Unit Cost */}
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: DIM }}>
                    {line.unit_cost > 0 ? '$' + line.unit_cost.toLocaleString() : ''}
                  </td>

                  {/* Builder Cost */}
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: TEXT, fontWeight: line.is_group ? 700 : 400 }}>
                    {line.builder_cost > 0 ? fmt(line.builder_cost) : ''}
                  </td>

                  {/* Markup */}
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: DIM }}>
                    {line.markup_pct > 0 ? `${line.markup_pct}%` : ''}
                  </td>

                  {/* Amount */}
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: line.is_group ? 800 : 600, color: line.is_group ? GOLD : TEXT }}>
                    {line.amount > 0 ? fmt(line.amount) : ''}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                    <button style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 16 }}>⋯</button>
                  </td>
                </tr>
              );
            })}

            {/* Add line row */}
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              <td colSpan={11} style={{ padding: '8px 16px' }}>
                <button onClick={() => setShowAddLine(true)} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16, color: GOLD }}>+</span> Add new line
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Summary Footer ────────────────────────────────────────────── */}
      <div style={{ background: '#0a1117', borderTop: `2px solid ${BORDER}`, padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 32, flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: DIM, marginBottom: 2 }}>Builder Fixed Cost</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>{fmt(totalBuilderCost)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: DIM, marginBottom: 2 }}>Allowances</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>$ 0.00</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: GOLD, marginBottom: 2 }}>Markup</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: GOLD }}>{fmt(totalMarkup)}</div>
        </div>
        <div style={{ textAlign: 'right', paddingLeft: 24, borderLeft: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: DIM, marginBottom: 2 }}>Total</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: TEXT }}>{fmt(totalAmount)}</div>
        </div>
      </div>
    </div>
  );
}
