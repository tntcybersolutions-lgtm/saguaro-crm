'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useDragReorder } from '../../../../../../components/DragHandle';
import BulkActionBar from '../../../../../../components/BulkActionBar';
import PresenceIndicator from '../../../../../../components/PresenceIndicator';

const GOLD = '#C8960F';
const DARK = '#F8F9FB';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const DIM = '#6B7280';
const TEXT = '#111827';

interface Project {
  id: string;
  name: string;
}

interface TakeoffProject {
  id: string;
  project_id: string;
  name: string;
  total_cost: number;
  material_cost: number;
  labor_cost: number;
  equipment_cost: number;
  overhead_pct: number;
  profit_pct: number;
  contingency_pct: number;
  created_at: string;
}

interface Sheet {
  id: string;
  takeoff_project_id: string;
  name: string;
  discipline: string;
  sheet_number: string;
  thumbnail_url: string | null;
}

interface LineItem {
  id: string;
  sheet_id: string;
  takeoff_project_id: string;
  csi_code: string;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  extended_cost: number;
  labor_hours: number;
  labor_cost: number;
  material_cost: number;
  crew_size: number;
  duration: number;
  division: string;
  notes: string;
  subcontractor: string;
}

interface Assembly {
  id: string;
  name: string;
  unit: string;
  total_cost: number;
  items: Array<{
    csi_code: string;
    description: string;
    unit: string;
    unit_cost: number;
    labor_hours: number;
  }>;
}

const disciplineColors: Record<string, string> = {
  Architectural: '#4a90d9',
  Structural: '#e06c75',
  Mechanical: '#61afef',
  Electrical: '#e5c07b',
  Plumbing: '#56b6c2',
  Civil: '#98c379',
  General: DIM,
};

function getDisciplineColor(d: string): string {
  return disciplineColors[d] || DIM;
}

function currency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function num(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

const emptyLineItem: Omit<LineItem, 'id' | 'takeoff_project_id'> = {
  sheet_id: '',
  csi_code: '',
  description: '',
  quantity: 0,
  unit: 'EA',
  unit_cost: 0,
  extended_cost: 0,
  labor_hours: 0,
  labor_cost: 0,
  material_cost: 0,
  crew_size: 1,
  duration: 0,
  division: '',
  notes: '',
  subcontractor: '',
};

function EstimatePage() {
  const { projectId } = useParams() as { projectId: string };

  const [project, setProject] = useState<Project | null>(null);
  const [takeoffProjects, setTakeoffProjects] = useState<TakeoffProject[]>([]);
  const [selectedTakeoff, setSelectedTakeoff] = useState<TakeoffProject | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<Sheet | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [assemblyOpen, setAssemblyOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [selectedItem, setSelectedItem] = useState<LineItem | null>(null);
  const [detailDraft, setDetailDraft] = useState<LineItem | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addingRow, setAddingRow] = useState(false);
  const [newRow, setNewRow] = useState({ ...emptyLineItem });
  const [addingSheet, setAddingSheet] = useState(false);
  const [newSheetName, setNewSheetName] = useState('');
  const [newSheetDiscipline, setNewSheetDiscipline] = useState('General');
  const [overhead, setOverhead] = useState(0);
  const [profit, setProfit] = useState(0);
  const [contingency, setContingency] = useState(0);
  const [saving, setSaving] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);

  // Fetch project info
  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then(r => r.json())
      .then(d => setProject(d.project || d))
      .catch(() => {});
  }, [projectId]);

  // Fetch takeoff projects list
  const loadTakeoffProjects = useCallback(() => {
    fetch(`/api/takeoff-projects/list?project_id=${projectId}`)
      .then(r => r.json())
      .then(d => {
        const list = d.takeoffProjects || d || [];
        setTakeoffProjects(list);
        if (list.length > 0 && !selectedTakeoff) {
          selectTakeoff(list[0]);
        }
      })
      .catch(() => {});
  }, [projectId]);

  useEffect(() => { loadTakeoffProjects(); }, [loadTakeoffProjects]);

  // Fetch assemblies
  useEffect(() => {
    fetch(`/api/takeoff-assemblies/list`)
      .then(r => r.json())
      .then(d => setAssemblies(d.assemblies || d || []))
      .catch(() => {});
  }, []);

  // Select a takeoff project and load its data
  const selectTakeoff = useCallback((tp: TakeoffProject) => {
    setSelectedTakeoff(tp);
    setOverhead(tp.overhead_pct || 0);
    setProfit(tp.profit_pct || 0);
    setContingency(tp.contingency_pct || 0);
    setSelectedSheet(null);
    setSelectedItem(null);
    setLineItems([]);
    fetch(`/api/takeoff-projects/${tp.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.sheets) setSheets(d.sheets);
        if (d.lineItems) setLineItems(d.lineItems);
        if (d.takeoffProject) {
          setOverhead(d.takeoffProject.overhead_pct || 0);
          setProfit(d.takeoffProject.profit_pct || 0);
          setContingency(d.takeoffProject.contingency_pct || 0);
        }
      })
      .catch(() => {});
  }, []);

  // Load line items for selected sheet
  const loadLineItems = useCallback((sheetId: string) => {
    if (!selectedTakeoff) return;
    fetch(`/api/takeoff-projects/${selectedTakeoff.id}/line-items?sheet_id=${sheetId}`)
      .then(r => r.json())
      .then(d => setLineItems(d.lineItems || d || []))
      .catch(() => {});
  }, [selectedTakeoff]);

  const selectSheet = (s: Sheet) => {
    setSelectedSheet(s);
    setSelectedItem(null);
    loadLineItems(s.id);
  };

  // Computed totals
  const totalMaterial = lineItems.reduce((s, i) => s + num(i.material_cost), 0);
  const totalLabor = lineItems.reduce((s, i) => s + num(i.labor_cost), 0);
  const totalExtended = lineItems.reduce((s, i) => s + num(i.extended_cost), 0);
  const totalLaborHrs = lineItems.reduce((s, i) => s + num(i.labor_hours), 0);
  const grandTotal = totalMaterial + totalLabor;
  const markupMultiplier = 1 + num(overhead) / 100 + num(profit) / 100 + num(contingency) / 100;
  const sellPrice = grandTotal * markupMultiplier;
  const grossMargin = sellPrice > 0 ? ((sellPrice - grandTotal) / sellPrice) * 100 : 0;

  // Create new takeoff project
  const createTakeoff = async () => {
    const res = await fetch('/api/takeoff-projects/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, name: 'New Estimate' }),
    });
    const d = await res.json();
    const created = d.takeoffProject || d;
    setTakeoffProjects(prev => [...prev, created]);
    selectTakeoff(created);
  };

  // Add sheet
  const addSheet = async () => {
    if (!selectedTakeoff || !newSheetName.trim()) return;
    const res = await fetch(`/api/takeoff-projects/${selectedTakeoff.id}/sheets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSheetName, discipline: newSheetDiscipline }),
    });
    const d = await res.json();
    const s = d.sheet || d;
    setSheets(prev => [...prev, s]);
    setAddingSheet(false);
    setNewSheetName('');
    setNewSheetDiscipline('General');
    selectSheet(s);
  };

  // Inline edit save
  const saveInlineEdit = async (item: LineItem, field: string, value: string) => {
    if (!selectedTakeoff) return;
    const numFields = ['quantity', 'unit_cost', 'labor_hours', 'labor_cost', 'material_cost', 'crew_size', 'duration'];
    const parsed: Record<string, unknown> = {};
    if (numFields.includes(field)) {
      parsed[field] = num(value);
      if (field === 'quantity' || field === 'unit_cost') {
        const q = field === 'quantity' ? num(value) : num(item.quantity);
        const u = field === 'unit_cost' ? num(value) : num(item.unit_cost);
        parsed.extended_cost = q * u;
        parsed.material_cost = q * u;
      }
    } else {
      parsed[field] = value;
    }
    const res = await fetch(`/api/takeoff-projects/${selectedTakeoff.id}/line-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    });
    const d = await res.json();
    const updated = d.lineItem || d;
    setLineItems(prev => prev.map(li => li.id === item.id ? { ...li, ...updated } : li));
    setEditingCell(null);
    recalcTotals();
  };

  // Add line item
  const addLineItem = async () => {
    if (!selectedTakeoff || !selectedSheet) return;
    const payload = {
      ...newRow,
      sheet_id: selectedSheet.id,
      extended_cost: num(newRow.quantity) * num(newRow.unit_cost),
      material_cost: num(newRow.quantity) * num(newRow.unit_cost),
    };
    const res = await fetch(`/api/takeoff-projects/${selectedTakeoff.id}/line-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    const created = d.lineItem || d;
    setLineItems(prev => [...prev, created]);
    setAddingRow(false);
    setNewRow({ ...emptyLineItem });
    recalcTotals();
  };

  // Delete line item
  const deleteLineItem = async (id: string) => {
    if (!selectedTakeoff) return;
    await fetch(`/api/takeoff-projects/${selectedTakeoff.id}/line-items/${id}`, { method: 'DELETE' });
    setLineItems(prev => prev.filter(li => li.id !== id));
    if (selectedItem?.id === id) { setSelectedItem(null); setDetailDraft(null); }
    recalcTotals();
  };

  // Recalculate and save totals
  const recalcTotals = useCallback(() => {
    if (!selectedTakeoff) return;
    setTimeout(() => {
      setLineItems(current => {
        const mat = current.reduce((s, i) => s + num(i.material_cost), 0);
        const lab = current.reduce((s, i) => s + num(i.labor_cost), 0);
        const ext = current.reduce((s, i) => s + num(i.extended_cost), 0);
        fetch(`/api/takeoff-projects/${selectedTakeoff.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ total_cost: ext, material_cost: mat, labor_cost: lab }),
        }).catch(() => {});
        return current;
      });
    }, 100);
  }, [selectedTakeoff]);

  // Save detail panel
  const saveDetail = async () => {
    if (!selectedTakeoff || !detailDraft) return;
    const res = await fetch(`/api/takeoff-projects/${selectedTakeoff.id}/line-items/${detailDraft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(detailDraft),
    });
    const d = await res.json();
    const updated = d.lineItem || d;
    setLineItems(prev => prev.map(li => li.id === detailDraft.id ? { ...li, ...updated } : li));
    setSelectedItem({ ...detailDraft, ...updated });
    recalcTotals();
  };

  // Save bottom bar totals
  const saveProjectTotals = async () => {
    if (!selectedTakeoff) return;
    setSaving(true);
    await fetch(`/api/takeoff-projects/${selectedTakeoff.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        total_cost: grandTotal,
        material_cost: totalMaterial,
        labor_cost: totalLabor,
        overhead_pct: overhead,
        profit_pct: profit,
        contingency_pct: contingency,
      }),
    });
    setSaving(false);
  };

  // Apply assembly to new row
  const applyAssembly = (a: Assembly) => {
    if (!a.items || a.items.length === 0) return;
    const first = a.items[0];
    setNewRow({
      ...emptyLineItem,
      csi_code: first.csi_code || '',
      description: first.description || a.name,
      unit: first.unit || a.unit || 'EA',
      unit_cost: first.unit_cost || a.total_cost || 0,
      labor_hours: first.labor_hours || 0,
    });
    setAddingRow(true);
  };

  // Focus edit input
  useEffect(() => {
    if (editRef.current) editRef.current.focus();
  }, [editingCell]);

  // KPI card
  const KPI = ({ label, value, color }: { label: string; value: string; color: string }) => (
    <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 20px', minWidth: 160, textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );

  return (
    <div style={{ background: DARK, color: TEXT, minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* HEADER */}
      <div style={{ padding: '16px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>{project?.name || 'Loading...'}</div>
          <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Takeoff Estimating</div>
        </div>
        <select
          value={selectedTakeoff?.id || ''}
          onChange={e => {
            const tp = takeoffProjects.find(t => t.id === e.target.value);
            if (tp) selectTakeoff(tp);
          }}
          style={{ background: RAISED, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', fontSize: 14, minWidth: 200 }}
        >
          <option value="" disabled>Select Takeoff</option>
          {takeoffProjects.map(tp => (
            <option key={tp.id} value={tp.id}>{tp.name}</option>
          ))}
        </select>
        <button onClick={createTakeoff} style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
          + New Takeoff
        </button>
        <div style={{ display: 'flex', gap: 12, marginLeft: 'auto' }}>
          <KPI label="Total Cost" value={currency(grandTotal)} color={GOLD} />
          <KPI label="Material" value={currency(totalMaterial)} color="#61afef" />
          <KPI label="Labor" value={currency(totalLabor)} color="#98c379" />
        </div>
      </div>

      {/* BODY */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* LEFT SIDEBAR */}
        <div style={{ width: 300, borderRight: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Sheets */}
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: DIM }}>Sheets</span>
            <button onClick={() => setAddingSheet(true)} style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              + Add Sheet
            </button>
          </div>
          {addingSheet && (
            <div style={{ padding: 12, borderBottom: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                placeholder="Sheet name"
                value={newSheetName}
                onChange={e => setNewSheetName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSheet()}
                style={{ background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '6px 8px', fontSize: 13 }}
              />
              <select
                value={newSheetDiscipline}
                onChange={e => setNewSheetDiscipline(e.target.value)}
                style={{ background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '6px 8px', fontSize: 13 }}
              >
                {Object.keys(disciplineColors).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={addSheet} style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flex: 1 }}>Save</button>
                <button onClick={() => { setAddingSheet(false); setNewSheetName(''); }} style={{ background: RAISED, color: DIM, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: 'pointer', flex: 1 }}>Cancel</button>
              </div>
            </div>
          )}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sheets.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: DIM, fontSize: 13 }}>No sheets yet. Add one to begin.</div>
            )}
            {sheets.map(s => (
              <div
                key={s.id}
                onClick={() => selectSheet(s)}
                style={{
                  padding: '10px 16px',
                  cursor: 'pointer',
                  borderBottom: `1px solid ${BORDER}`,
                  background: selectedSheet?.id === s.id ? 'rgba(212,160,23,0.12)' : 'transparent',
                  borderLeft: selectedSheet?.id === s.id ? `3px solid ${GOLD}` : '3px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  transition: 'background 0.15s',
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 4, background: DARK, border: `1px solid ${BORDER}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: DIM, flexShrink: 0,
                }}>
                  {s.thumbnail_url ? <img src={s.thumbnail_url} alt="" style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }} /> : 'PDF'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: selectedSheet?.id === s.id ? GOLD : TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: getDisciplineColor(s.discipline), color: '#fff', fontWeight: 600 }}>{s.discipline}</span>
                    {s.sheet_number && <span style={{ fontSize: 11, color: DIM }}>{s.sheet_number}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Assembly Library */}
          <div style={{ borderTop: `1px solid ${BORDER}` }}>
            <div
              onClick={() => setAssemblyOpen(!assemblyOpen)}
              style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <span style={{ fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: DIM }}>Assembly Library</span>
              <span style={{ color: DIM, fontSize: 16 }}>{assemblyOpen ? '\u25B2' : '\u25BC'}</span>
            </div>
            {assemblyOpen && (
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {assemblies.length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', color: DIM, fontSize: 12 }}>No assemblies found.</div>
                )}
                {assemblies.map(a => (
                  <div
                    key={a.id}
                    onClick={() => applyAssembly(a)}
                    style={{
                      padding: '8px 16px', cursor: 'pointer', borderBottom: `1px solid ${BORDER}`,
                      fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500, color: TEXT }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: DIM }}>{a.unit}</div>
                    </div>
                    <div style={{ color: GOLD, fontWeight: 600, fontSize: 13 }}>{currency(a.total_cost)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* MAIN AREA */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedSheet ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 48, opacity: 0.15 }}>&#128196;</div>
              <div style={{ color: DIM, fontSize: 16 }}>Select or add a sheet to begin</div>
            </div>
          ) : (
            <>
              {/* Sheet Viewer Placeholder */}
              <div style={{
                height: 260, background: RAISED, borderBottom: `1px solid ${BORDER}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ fontSize: 14, color: DIM }}>Sheet Viewer</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: TEXT }}>{selectedSheet.name}</div>
                <div style={{ fontSize: 12, color: DIM }}>PDF viewer will be rendered here</div>
              </div>

              {/* Line Items Table */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>Line Items</span>
                  <button
                    onClick={() => setAddingRow(true)}
                    style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    + Add Line Item
                  </button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['#', 'CSI Code', 'Description', 'Qty', 'Unit', 'Unit Cost', 'Extended', 'Labor Hrs', 'Actions'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: `2px solid ${BORDER}`, color: DIM, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item, idx) => {
                        const editable = (field: string, value: string | number, width?: number) => {
                          const isEditing = editingCell?.rowId === item.id && editingCell?.field === field;
                          if (isEditing) {
                            return (
                              <input
                                ref={editRef}
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => saveInlineEdit(item, field, editValue)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveInlineEdit(item, field, editValue);
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                                style={{ background: DARK, color: TEXT, border: `1px solid ${GOLD}`, borderRadius: 3, padding: '3px 6px', width: width || 80, fontSize: 13 }}
                              />
                            );
                          }
                          return (
                            <span
                              onClick={() => { setEditingCell({ rowId: item.id, field }); setEditValue(String(value)); }}
                              style={{ cursor: 'pointer', padding: '2px 4px', borderRadius: 3, display: 'inline-block', minWidth: 30 }}
                              onMouseEnter={e => (e.currentTarget.style.background = RAISED)}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              {typeof value === 'number' && (field === 'unit_cost' || field === 'extended_cost') ? currency(value) : value}
                            </span>
                          );
                        };
                        return (
                          <tr
                            key={item.id}
                            onClick={() => { setSelectedItem(item); setDetailDraft({ ...item }); setRightOpen(true); }}
                            style={{
                              borderBottom: `1px solid ${BORDER}`,
                              background: selectedItem?.id === item.id ? 'rgba(212,160,23,0.06)' : 'transparent',
                              cursor: 'pointer',
                            }}
                          >
                            <td style={{ padding: '8px 10px', color: DIM }}>{idx + 1}</td>
                            <td style={{ padding: '8px 10px' }}>{editable('csi_code', item.csi_code, 100)}</td>
                            <td style={{ padding: '8px 10px' }}>{editable('description', item.description, 200)}</td>
                            <td style={{ padding: '8px 10px' }}>{editable('quantity', item.quantity, 60)}</td>
                            <td style={{ padding: '8px 10px' }}>{editable('unit', item.unit, 50)}</td>
                            <td style={{ padding: '8px 10px' }}>{editable('unit_cost', item.unit_cost, 80)}</td>
                            <td style={{ padding: '8px 10px', color: GOLD, fontWeight: 600 }}>{currency(num(item.quantity) * num(item.unit_cost))}</td>
                            <td style={{ padding: '8px 10px' }}>{editable('labor_hours', item.labor_hours, 60)}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <button
                                onClick={e => { e.stopPropagation(); deleteLineItem(item.id); }}
                                style={{ background: 'transparent', color: '#e06c75', border: 'none', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}
                                title="Delete"
                              >
                                &#10005;
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {/* Add Row */}
                      {addingRow && (
                        <tr style={{ borderBottom: `1px solid ${BORDER}`, background: 'rgba(212,160,23,0.08)' }}>
                          <td style={{ padding: '8px 10px', color: DIM }}>+</td>
                          <td style={{ padding: '8px 10px' }}>
                            <input value={newRow.csi_code} onChange={e => setNewRow(r => ({ ...r, csi_code: e.target.value }))} placeholder="CSI Code" style={{ background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '3px 6px', width: 100, fontSize: 13 }} />
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <input value={newRow.description} onChange={e => setNewRow(r => ({ ...r, description: e.target.value }))} placeholder="Description" style={{ background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '3px 6px', width: 200, fontSize: 13 }} />
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <input type="number" value={newRow.quantity || ''} onChange={e => setNewRow(r => ({ ...r, quantity: num(e.target.value) }))} placeholder="0" style={{ background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '3px 6px', width: 60, fontSize: 13 }} />
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <input value={newRow.unit} onChange={e => setNewRow(r => ({ ...r, unit: e.target.value }))} style={{ background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '3px 6px', width: 50, fontSize: 13 }} />
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <input type="number" value={newRow.unit_cost || ''} onChange={e => setNewRow(r => ({ ...r, unit_cost: num(e.target.value) }))} placeholder="0.00" style={{ background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '3px 6px', width: 80, fontSize: 13 }} />
                          </td>
                          <td style={{ padding: '8px 10px', color: GOLD, fontWeight: 600 }}>{currency(num(newRow.quantity) * num(newRow.unit_cost))}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <input type="number" value={newRow.labor_hours || ''} onChange={e => setNewRow(r => ({ ...r, labor_hours: num(e.target.value) }))} placeholder="0" style={{ background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '3px 6px', width: 60, fontSize: 13 }} />
                          </td>
                          <td style={{ padding: '8px 10px', display: 'flex', gap: 4 }}>
                            <button onClick={addLineItem} style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 3, padding: '4px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                            <button onClick={() => { setAddingRow(false); setNewRow({ ...emptyLineItem }); }} style={{ background: RAISED, color: DIM, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${BORDER}` }}>
                        <td colSpan={3} style={{ padding: '10px', fontWeight: 700, color: DIM, textAlign: 'right' }}>Totals</td>
                        <td style={{ padding: '10px', fontWeight: 700, color: TEXT }}>{lineItems.reduce((s, i) => s + num(i.quantity), 0)}</td>
                        <td style={{ padding: '10px' }}></td>
                        <td style={{ padding: '10px' }}></td>
                        <td style={{ padding: '10px', fontWeight: 700, color: GOLD }}>{currency(totalExtended)}</td>
                        <td style={{ padding: '10px', fontWeight: 700, color: TEXT }}>{totalLaborHrs.toFixed(1)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* RIGHT PANEL */}
        {rightOpen && selectedItem && detailDraft && (
          <div style={{ width: 280, borderLeft: `1px solid ${BORDER}`, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: DIM }}>Item Details</span>
              <button onClick={() => setRightOpen(false)} style={{ background: 'transparent', color: DIM, border: 'none', cursor: 'pointer', fontSize: 18 }}>&#10005;</button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
              {[
                { label: 'Description', field: 'description', type: 'text' },
                { label: 'CSI Code', field: 'csi_code', type: 'text' },
                { label: 'Division', field: 'division', type: 'text' },
                { label: 'Quantity', field: 'quantity', type: 'number' },
                { label: 'Unit', field: 'unit', type: 'text' },
                { label: 'Material Cost', field: 'material_cost', type: 'number' },
                { label: 'Labor Cost', field: 'labor_cost', type: 'number' },
                { label: 'Labor Hours', field: 'labor_hours', type: 'number' },
                { label: 'Crew Size', field: 'crew_size', type: 'number' },
                { label: 'Duration (days)', field: 'duration', type: 'number' },
              ].map(({ label, field, type }) => (
                <div key={field}>
                  <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 3 }}>{label}</label>
                  <input
                    type={type}
                    value={(detailDraft as unknown as Record<string, unknown>)[field] as string | number || ''}
                    onChange={e => setDetailDraft(d => d ? { ...d, [field]: type === 'number' ? num(e.target.value) : e.target.value } : d)}
                    style={{ background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '6px 8px', fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 3 }}>Notes</label>
                <textarea
                  value={detailDraft.notes || ''}
                  onChange={e => setDetailDraft(d => d ? { ...d, notes: e.target.value } : d)}
                  rows={3}
                  style={{ background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '6px 8px', fontSize: 13, width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 3 }}>Subcontractor</label>
                <input
                  value={detailDraft.subcontractor || ''}
                  onChange={e => setDetailDraft(d => d ? { ...d, subcontractor: e.target.value } : d)}
                  placeholder="Assign subcontractor"
                  style={{ background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '6px 8px', fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ padding: 16, borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 8 }}>
              <button onClick={saveDetail} style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', flex: 1, fontSize: 13 }}>Save</button>
              <button onClick={() => { setDetailDraft(selectedItem ? { ...selectedItem } : null); }} style={{ background: RAISED, color: DIM, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '8px 16px', cursor: 'pointer', flex: 1, fontSize: 13 }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM BAR */}
      <div style={{ padding: '12px 24px', borderTop: `1px solid ${BORDER}`, background: RAISED, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: DIM }}>Grand Total:</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: GOLD }}>{currency(grandTotal)}</span>
        </div>
        <div style={{ height: 20, width: 1, background: BORDER }}></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {[
            { label: 'Overhead %', value: overhead, setter: setOverhead },
            { label: 'Profit %', value: profit, setter: setProfit },
            { label: 'Contingency %', value: contingency, setter: setContingency },
          ].map(({ label, value, setter }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: DIM }}>{label}</span>
              <input
                type="number"
                value={value || ''}
                onChange={e => setter(num(e.target.value))}
                style={{ background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '3px 6px', width: 50, fontSize: 12, textAlign: 'center' }}
              />
            </div>
          ))}
        </div>
        <div style={{ height: 20, width: 1, background: BORDER }}></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: DIM }}>Sell Price:</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#61afef' }}>{currency(sellPrice)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: DIM }}>Gross Margin:</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: grossMargin > 20 ? '#98c379' : grossMargin > 10 ? '#e5c07b' : '#e06c75' }}>{grossMargin.toFixed(1)}%</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {selectedTakeoff && (
            <>
              <a
                href={`/api/takeoff-projects/${selectedTakeoff.id}/export/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ background: RAISED, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '6px 14px', fontSize: 12, fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
              >
                Export PDF
              </a>
              <a
                href={`/api/takeoff-projects/${selectedTakeoff.id}/export/excel`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ background: RAISED, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '6px 14px', fontSize: 12, fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
              >
                Export Excel
              </a>
            </>
          )}
          <button
            onClick={saveProjectTotals}
            disabled={saving}
            style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 4, padding: '6px 18px', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EstimatePageWrapper() {
  return (
    <Suspense fallback={
      <div style={{ background: '#F8F9FB', color: '#6B7280', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
        Loading estimate workspace...
      </div>
    }>
      <EstimatePage />
    </Suspense>
  );
}
