'use client';

import { Suspense, useState, useEffect, useCallback, useRef, useMemo, type CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useDragReorder } from '../../../../../../components/DragHandle';
import BulkActionBar from '../../../../../../components/BulkActionBar';
import PresenceIndicator from '../../../../../../components/PresenceIndicator';
import {
  CaretUp, CaretDown, FileText, Trash, XCircle,
  Calculator, Cube, Users, Plus, Stack, ListNumbers,
  SlidersHorizontal, FilePdf, MicrosoftExcelLogo,
} from '@phosphor-icons/react';
import {
  PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty,
  goldButtonStyle, ghostButtonStyle,
} from '@/components/ui/premium';
import { SHEET_DISCIPLINES } from '@/lib/construction-intelligence';

const GOLD = 'var(--brand-primary)';
const DARK = 'var(--bg-base)';
const RAISED = 'var(--bg-surface-2)';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#D4D4D8';
const TEXT = '#FFFFFF';

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
  Mechanical: '#FF8A00',
  Electrical: '#e5c07b',
  Plumbing: '#56b6c2',
  Civil: '#2CFF7A',
  Sitework: '#8a9a5b',
  Demolition: '#b0743c',
  'Fire Protection': '#d1494e',
  'Low Voltage / Technology': '#9b7ede',
  Landscape: '#5faa72',
  Interiors: '#c678dd',
  Specialties: '#7f8ea3',
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
  // Mirror lineItems in a ref so the debounced totals-writer reads the freshest array
  // without doing I/O inside a state updater (which StrictMode double-invokes).
  const lineItemsRef = useRef<LineItem[]>([]);
  useEffect(() => { lineItemsRef.current = lineItems; }, [lineItems]);
  const recalcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const escapedRef = useRef(false); // set on Escape so the ensuing onBlur skips the save
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
  /* Why the last Add Sheet did nothing. Previously there was nowhere to put
     that sentence, so the answer was "nothing visible happened". */
  const [sheetError, setSheetError] = useState<string | null>(null);
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
        // Never store a non-array (an {error} envelope would crash the next .map()).
        const list = Array.isArray(d.takeoffProjects) ? d.takeoffProjects : (Array.isArray(d) ? d : []);
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
      .then(d => setAssemblies(Array.isArray(d.assemblies) ? d.assemblies : (Array.isArray(d) ? d : [])))
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
        if (Array.isArray(d.sheets)) setSheets(d.sheets);
        if (Array.isArray(d.lineItems)) setLineItems(d.lineItems);
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
      .then(d => setLineItems(Array.isArray(d.lineItems) ? d.lineItems : (Array.isArray(d) ? d : [])))
      .catch(() => {});
  }, [selectedTakeoff]);

  const selectSheet = (s: Sheet) => {
    setSelectedSheet(s);
    setSelectedItem(null);
    loadLineItems(s.id);
  };

  // Computed totals — memoized so they recompute only when the line items change,
  // not on every keystroke in an inline-edit cell (which sets unrelated editValue state).
  const { totalMaterial, totalLabor, totalExtended, totalLaborHrs } = useMemo(() => ({
    totalMaterial: lineItems.reduce((s, i) => s + num(i.material_cost), 0),
    totalLabor: lineItems.reduce((s, i) => s + num(i.labor_cost), 0),
    totalExtended: lineItems.reduce((s, i) => s + num(i.extended_cost), 0),
    totalLaborHrs: lineItems.reduce((s, i) => s + num(i.labor_hours), 0),
  }), [lineItems]);
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

  /**
   * Add a sheet — and, on an estimate that has no takeoff yet, create the
   * takeoff it has to hang off.
   *
   * This opened with `if (!selectedTakeoff || !newSheetName.trim()) return;`.
   * A sheet belongs to a takeoff_project, and on a brand-new estimate there
   * isn't one, so the guard was true and the function returned — silently. The
   * form was fully enabled the whole time: it took a sheet name, took a
   * discipline, and its Save button threw both away without a request, an
   * error or any change on screen. The only way to find out was the network
   * tab. Doing nothing is a defensible outcome; doing nothing quietly, behind
   * a control that looks like it works, is the thing that makes people say
   * the product is broken.
   *
   * The missing takeoff is not a reason to refuse — it is one POST, and the
   * page already knows the project. So it makes one, named for the project,
   * and carries on to the sheet. Failures now say so.
   */
  const addSheet = async () => {
    if (!newSheetName.trim()) {
      setSheetError('Give the sheet a name first.');
      return;
    }
    setSheetError(null);

    let takeoff = selectedTakeoff;

    if (!takeoff) {
      const created = await fetch('/api/takeoff-projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          name: `${project?.name || 'Estimate'} — takeoff`,
        }),
      }).catch(() => null);

      const payload = created && created.ok ? await created.json().catch(() => null) : null;
      takeoff = payload?.takeoffProject ?? null;

      if (!takeoff) {
        setSheetError('Could not start a takeoff for this estimate. Please try again.');
        return;
      }
      setTakeoffProjects(prev => [takeoff as TakeoffProject, ...prev]);
      setSelectedTakeoff(takeoff);
    }

    const res = await fetch(`/api/takeoff-projects/${takeoff.id}/sheets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSheetName, discipline: newSheetDiscipline }),
    }).catch(() => null);

    if (!res || !res.ok) {
      setSheetError('Could not add the sheet. Please try again.');
      return;
    }

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

  // Recalculate and persist totals. Debounced + reads the freshest lineItems from a
  // ref, so rapid edits coalesce into ONE PATCH and no I/O runs inside a state updater
  // (the old setLineItems-updater pattern double-fired the PATCH under StrictMode).
  const recalcTotals = useCallback(() => {
    if (!selectedTakeoff) return;
    if (recalcTimerRef.current) clearTimeout(recalcTimerRef.current);
    recalcTimerRef.current = setTimeout(() => {
      const current = lineItemsRef.current;
      const mat = current.reduce((s, i) => s + num(i.material_cost), 0);
      const lab = current.reduce((s, i) => s + num(i.labor_cost), 0);
      const ext = current.reduce((s, i) => s + num(i.extended_cost), 0);
      fetch(`/api/takeoff-projects/${selectedTakeoff.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_cost: ext, material_cost: mat, labor_cost: lab }),
      }).catch(() => {});
    }, 400);
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

  // Shared control-surface styles for inline inputs / selects sitting on cards.
  const fieldStyle: CSSProperties = {
    background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8,
    padding: '9px 11px', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none',
  };
  const smallGoldBtn: CSSProperties = { ...goldButtonStyle, padding: '7px 13px', fontSize: 12.5, borderRadius: 10 };

  return (
    <PremiumSurface maxWidth={2200}>

      {/* HEADER */}
      <div style={{ marginBottom: 10 }}>
        {/* Client-side nav, deliberately: a full-page <a> unload ABORTED any
            in-flight cell-save PATCH and dropped the 400ms-debounced edit the
            user just typed (review finding). And the label names where it
            actually goes — the project takeoff, not the global Studio. */}
        <Link href={`/app/projects/${projectId}/takeoff`} style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
          ← Back to Project Takeoff
        </Link>
      </div>
      <ModuleHero
        eyebrow="Takeoff Estimate"
        eyebrowIcon={<Calculator size={13} weight="fill" color={GOLD} />}
        title={project?.name || 'Loading…'}
        subtitle="Sheet-by-sheet quantity takeoff and live cost estimating."
        actions={<>
          <select
            value={selectedTakeoff?.id || ''}
            onChange={e => {
              const tp = takeoffProjects.find(t => t.id === e.target.value);
              if (tp) selectTakeoff(tp);
            }}
            style={{
              background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 12,
              padding: '10px 14px', fontSize: 13.5, fontWeight: 700, minWidth: 200, cursor: 'pointer',
            }}
          >
            <option value="" disabled>Select Takeoff</option>
            {takeoffProjects.map(tp => (
              <option key={tp.id} value={tp.id}>{tp.name}</option>
            ))}
          </select>
          <button onClick={createTakeoff} style={goldButtonStyle} className="pmBtn">
            <Plus size={15} weight="bold" /> New Takeoff
          </button>
        </>}
      />

      {/* KPI ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard icon={<Calculator size={19} weight="duotone" color={GOLD} />} label="Total Cost" value={currency(grandTotal)} accent={GOLD} sub="Material + labor" delay={0.02}  href={`/app/projects/${projectId}/takeoff/estimate`}/>
        <StatCard icon={<Cube size={19} weight="duotone" color="#FF8A00" />} label="Material" value={currency(totalMaterial)} accent="#FF8A00" sub="Rolled up" delay={0.06}  href={`/app/projects/${projectId}/takeoff/estimate`}/>
        <StatCard icon={<Users size={19} weight="duotone" color="#2CFF7A" />} label="Labor" value={currency(totalLabor)} accent="#2CFF7A" sub="Rolled up" delay={0.10}  href={`/app/projects/${projectId}/takeoff/estimate`}/>
      </div>

      {/* WORKSPACE */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>

        {/* LEFT COLUMN — Sheets + Assembly Library */}
        <div style={{ flex: '1 1 260px', minWidth: 250, maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Sheets */}
          <SectionCard
            title="Sheets"
            icon={<Stack size={17} weight="duotone" color={GOLD} />}
            flush
            action={
              <button onClick={() => setAddingSheet(true)} style={smallGoldBtn} className="pmBtn">
                <Plus size={13} weight="bold" /> Add Sheet
              </button>
            }
          >
            {addingSheet && (
              <div style={{ padding: 14, borderBottom: `1px solid rgba(255,255,255,0.06)`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  placeholder="Sheet name"
                  value={newSheetName}
                  onChange={e => setNewSheetName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSheet()}
                  style={fieldStyle}
                />
                <select
                  value={newSheetDiscipline}
                  onChange={e => setNewSheetDiscipline(e.target.value)}
                  style={fieldStyle}
                >
                  {(SHEET_DISCIPLINES.includes(newSheetDiscipline) ? SHEET_DISCIPLINES : [newSheetDiscipline, ...SHEET_DISCIPLINES]).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {sheetError && (
                  <div style={{ fontSize: 12, lineHeight: 1.45, color: '#FCA5A5', background: 'rgba(255,59,48,0.10)', border: '1px solid rgba(255,59,48,0.28)', borderRadius: 8, padding: '7px 10px' }}>
                    {sheetError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={addSheet} style={{ ...smallGoldBtn, flex: 1 }} className="pmBtn">Save</button>
                  <button onClick={() => { setAddingSheet(false); setNewSheetName(''); setSheetError(null); }} style={{ ...ghostButtonStyle, flex: 1, padding: '7px 13px', fontSize: 12.5, borderRadius: 10 }} className="pmBtn">Cancel</button>
                </div>
              </div>
            )}
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {sheets.length === 0 && (
                <div style={{ padding: 22, textAlign: 'center', color: DIM, fontSize: 13 }}>No sheets yet. Add one to begin.</div>
              )}
              {sheets.map(s => (
                <div
                  key={s.id}
                  onClick={() => selectSheet(s)}
                  style={{
                    padding: '10px 16px',
                    cursor: 'pointer',
                    borderBottom: `1px solid rgba(255,255,255,0.06)`,
                    background: selectedSheet?.id === s.id ? 'var(--brand-primary-12)' : 'transparent',
                    borderLeft: selectedSheet?.id === s.id ? `3px solid ${GOLD}` : '3px solid transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 6, background: DARK, border: `1px solid ${BORDER}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: DIM, flexShrink: 0,
                  }}>
                    {s.thumbnail_url ? <img src={s.thumbnail_url} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} /> : 'PDF'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: selectedSheet?.id === s.id ? GOLD : TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: getDisciplineColor(s.discipline), color: '#fff', fontWeight: 700 }}>{s.discipline}</span>
                      {s.sheet_number && <span style={{ fontSize: 11, color: DIM }}>{s.sheet_number}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Assembly Library */}
          <SectionCard
            title="Assembly Library"
            icon={<Cube size={17} weight="duotone" color={GOLD} />}
            flush
            action={
              <button
                onClick={() => setAssemblyOpen(!assemblyOpen)}
                style={{ ...ghostButtonStyle, padding: '6px 10px', borderRadius: 10 }}
                className="pmBtn"
                aria-label={assemblyOpen ? 'Collapse assembly library' : 'Expand assembly library'}
              >
                {assemblyOpen ? <CaretUp size={15} weight="bold" color={DIM} /> : <CaretDown size={15} weight="bold" color={DIM} />}
              </button>
            }
          >
            {assemblyOpen && (
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {assemblies.length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', color: DIM, fontSize: 12 }}>No assemblies found.</div>
                )}
                {assemblies.map(a => (
                  <div
                    key={a.id}
                    onClick={() => applyAssembly(a)}
                    style={{
                      padding: '10px 16px', cursor: 'pointer', borderBottom: `1px solid rgba(255,255,255,0.06)`,
                      fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: TEXT }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: DIM }}>{a.unit}</div>
                    </div>
                    <div style={{ color: GOLD, fontWeight: 700, fontSize: 13 }}>{currency(a.total_cost)}</div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* MAIN AREA */}
        <div style={{ flex: '2 1 440px', minWidth: 0 }}>
          {!selectedSheet ? (
            <SectionCard flat flush>
              <PremiumEmpty
                icon={<FileText size={30} weight="duotone" color={GOLD} />}
                title="Select or Add a Sheet to Begin"
                description="Choose a sheet from the left, or add a new one to start capturing quantities and line-item costs."
              />
            </SectionCard>
          ) : (
            <SectionCard
              title="Line Items"
              subtitle={`${selectedSheet.name} · ${selectedSheet.discipline}`}
              icon={<ListNumbers size={17} weight="duotone" color={GOLD} />}
              flush
              action={
                <button onClick={() => setAddingRow(true)} style={smallGoldBtn} className="pmBtn">
                  <Plus size={13} weight="bold" /> Add Line Item
                </button>
              }
            >
              {/* Sheet Viewer Placeholder */}
              <div style={{
                height: 240, background: RAISED, borderBottom: `1px solid rgba(255,255,255,0.06)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ fontSize: 14, color: DIM }}>Sheet Viewer</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: TEXT }}>{selectedSheet.name}</div>
                <div style={{ fontSize: 12, color: DIM }}>PDF viewer will be rendered here</div>
              </div>

              {/* Line Items Table */}
              <div style={{ padding: 16 }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['#', 'CSI Code', 'Description', 'Qty', 'Unit', 'Unit Cost', 'Extended', 'Labor Hrs', 'Actions'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: `2px solid ${BORDER}`, color: DIM, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
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
                                onBlur={() => { if (escapedRef.current) { escapedRef.current = false; return; } saveInlineEdit(item, field, editValue); }}
                                onKeyDown={e => {
                                  // Enter → blur so onBlur is the SINGLE commit path (no double PATCH);
                                  // Escape → cancel without saving.
                                  if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                                  if (e.key === 'Escape') { escapedRef.current = true; setEditingCell(null); }
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
                              borderBottom: `1px solid rgba(255,255,255,0.06)`,
                              background: selectedItem?.id === item.id ? 'var(--brand-primary-08)' : 'transparent',
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
                                <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}><Trash size={16} weight="regular" color="#e06c75" /></span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {/* Add Row */}
                      {addingRow && (
                        <tr style={{ borderBottom: `1px solid rgba(255,255,255,0.06)`, background: 'var(--brand-primary-08)' }}>
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
                            <button onClick={addLineItem} style={{ background: GOLD, color: '#0A0A00', border: 'none', borderRadius: 3, padding: '4px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Save</button>
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
            </SectionCard>
          )}
        </div>

        {/* RIGHT PANEL */}
        {rightOpen && selectedItem && detailDraft && (
          <div style={{ flex: '1 1 260px', minWidth: 250, maxWidth: 320 }}>
            <SectionCard
              title="Item Details"
              icon={<SlidersHorizontal size={17} weight="duotone" color={GOLD} />}
              flush
              action={
                <button onClick={() => setRightOpen(false)} style={{ ...ghostButtonStyle, padding: '6px 10px', borderRadius: 10 }} className="pmBtn" aria-label="Close item details">
                  <XCircle size={16} weight="regular" color={DIM} />
                </button>
              }
            >
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                  { label: 'Duration (Days)', field: 'duration', type: 'number' },
                ].map(({ label, field, type }) => (
                  <div key={field}>
                    <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4, fontWeight: 700 }}>{label}</label>
                    <input
                      type={type}
                      value={(detailDraft as unknown as Record<string, unknown>)[field] as string | number || ''}
                      onChange={e => setDetailDraft(d => d ? { ...d, [field]: type === 'number' ? num(e.target.value) : e.target.value } : d)}
                      style={fieldStyle}
                    />
                  </div>
                ))}
                <div>
                  <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4, fontWeight: 700 }}>Notes</label>
                  <textarea
                    value={detailDraft.notes || ''}
                    onChange={e => setDetailDraft(d => d ? { ...d, notes: e.target.value } : d)}
                    rows={3}
                    style={{ ...fieldStyle, resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: DIM, display: 'block', marginBottom: 4, fontWeight: 700 }}>Subcontractor</label>
                  <input
                    value={detailDraft.subcontractor || ''}
                    onChange={e => setDetailDraft(d => d ? { ...d, subcontractor: e.target.value } : d)}
                    placeholder="Assign subcontractor"
                    style={fieldStyle}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, paddingTop: 14, borderTop: `1px solid rgba(255,255,255,0.06)` }}>
                  <button onClick={saveDetail} style={{ ...smallGoldBtn, flex: 1, padding: '9px 16px', fontSize: 13 }} className="pmBtn">Save</button>
                  <button onClick={() => { setDetailDraft(selectedItem ? { ...selectedItem } : null); }} style={{ ...ghostButtonStyle, flex: 1, padding: '9px 16px', fontSize: 13, borderRadius: 10 }} className="pmBtn">Cancel</button>
                </div>
              </div>
            </SectionCard>
          </div>
        )}
      </div>

      {/* PRICING & MARKUP */}
      <div style={{ marginTop: 24 }}>
        <SectionCard title="Pricing & Markup" icon={<SlidersHorizontal size={17} weight="duotone" color={GOLD} />}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: DIM }}>Grand Total:</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{currency(grandTotal)}</span>
            </div>
            <div style={{ height: 22, width: 1, background: BORDER }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {[
                { label: 'Overhead %', value: overhead, setter: setOverhead },
                { label: 'Profit %', value: profit, setter: setProfit },
                { label: 'Contingency %', value: contingency, setter: setContingency },
              ].map(({ label, value, setter }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: DIM }}>{label}</span>
                  <input
                    type="number"
                    value={value || ''}
                    onChange={e => setter(num(e.target.value))}
                    style={{ background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 8px', width: 58, fontSize: 12, textAlign: 'center', outline: 'none' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ height: 22, width: 1, background: BORDER }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: DIM }}>Sell Price:</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#FF8A00', fontVariantNumeric: 'tabular-nums' }}>{currency(sellPrice)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: DIM }}>Gross Margin:</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: grossMargin > 20 ? '#2CFF7A' : grossMargin > 10 ? 'var(--warning)' : '#e06c75' }}>{grossMargin.toFixed(1)}%</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {selectedTakeoff && (
                <>
                  <a
                    href={`/api/takeoff-projects/${selectedTakeoff.id}/export/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...ghostButtonStyle, padding: '9px 15px', fontSize: 12.5, borderRadius: 10 }}
                    className="pmBtn"
                  >
                    <FilePdf size={15} weight="duotone" /> Export PDF
                  </a>
                  <a
                    href={`/api/takeoff-projects/${selectedTakeoff.id}/export/excel`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...ghostButtonStyle, padding: '9px 15px', fontSize: 12.5, borderRadius: 10 }}
                    className="pmBtn"
                  >
                    <MicrosoftExcelLogo size={15} weight="duotone" /> Export Excel
                  </a>
                </>
              )}
              <button
                onClick={saveProjectTotals}
                disabled={saving}
                style={{ ...goldButtonStyle, padding: '9px 20px', opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
                className="pmBtn"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </SectionCard>
      </div>
    </PremiumSurface>
  );
}

export default function EstimatePageWrapper() {
  return (
    <Suspense fallback={
      <div style={{ background: 'var(--bg-base)', color: '#D4D4D8', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
        Loading estimate workspace…
      </div>
    }>
      <EstimatePage />
    </Suspense>
  );
}
