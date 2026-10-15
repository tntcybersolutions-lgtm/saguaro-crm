'use client';
/**
 * Takeoff estimate — sheet-by-sheet quantities, edited in place, priced live,
 * with the markup stack and the PDF / Excel exports. On the kit.
 *
 *   takeoffs   GET  /api/takeoff-projects/list?project_id=   POST /api/takeoff-projects/create
 *   one        GET / PATCH /api/takeoff-projects/[id]          (totals + markups)
 *   sheets     POST /api/takeoff-projects/[id]/sheets
 *   lines      GET / POST /api/takeoff-projects/[id]/line-items, PATCH / DELETE …/line-items/[lineId]
 *   assemblies GET  /api/takeoff-assemblies/list
 */

import { Suspense, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  CaretUp, CaretDown, FileText, Trash, X, ArrowLeft, Tag, ChartLineUp,
  Calculator, Cube, Users, Plus, Stack, ListNumbers,
  SlidersHorizontal, FilePdf, MicrosoftExcelLogo,
} from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, EmptyState, Field, Input, Textarea, Select, FormGrid,
  type StatItem,
} from '@/components/ui/kit';
import { SHEET_DISCIPLINES } from '@/lib/construction-intelligence';

import { inAppFileClick } from '@/lib/media-save';
import { useToast } from '@/components/Toast';

const CSS = `
.teWs > .k-page { max-width: none; }
.teGrid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
@media (min-width: 1000px) {
  .teGrid { grid-template-columns: minmax(250px, 300px) minmax(0, 1fr); }
  .teGrid[data-detail="true"] { grid-template-columns: minmax(250px, 300px) minmax(0, 1fr) minmax(260px, 320px); }
}
.teSide { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.teScroll { overflow-y: auto; }
.tePanel { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface-2); }
.teBtns { display: flex; gap: 8px; flex-wrap: wrap; }
.teSheet { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; width: 100%; min-height: 56px; padding: 10px 16px; cursor: pointer; border-bottom: 1px solid var(--border-subtle); border-left: 3px solid transparent; }
.teSheet:hover { background: var(--bg-row-hover); }
.teSheet:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
.teSheet[aria-current="true"] { background: var(--brand-primary-08); border-left-color: var(--brand-primary); }
.teThumb { width: 40px; height: 40px; flex-shrink: 0; border-radius: var(--radius-sm); background: var(--bg-surface-2); border: 1px solid var(--border-default); display: inline-flex; align-items: center; justify-content: center; color: var(--text-tertiary); overflow: hidden; }
.teThumb img { width: 40px; height: 40px; object-fit: cover; }
.teSheetText { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.teSheetName { font-size: var(--fs-sm); font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.teSheetMeta { display: flex; align-items: center; gap: 6px; font-size: var(--fs-xs); color: var(--text-secondary); }
.teMoney { font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 700; color: var(--text-primary); }
.teMuted { color: var(--text-tertiary); }
.teTable tbody tr { cursor: pointer; }
.teTable tbody tr[data-selected="true"] td { background: var(--brand-primary-08); }
.teTable .teAddRow td { background: var(--bg-surface-2); cursor: default; }
.teTable .k-input { min-height: 34px; }
.teCell { all: unset; box-sizing: border-box; cursor: text; display: inline-block; min-width: 30px; padding: 3px 6px; border-radius: var(--radius-sm); color: var(--text-primary); }
.teCell:hover, .teCell:focus-visible { background: var(--bg-surface-2); outline: 1px solid var(--border-default); }
.teCellInput { min-height: 30px; padding: 3px 6px; }
.teFoot td { font-weight: 700; color: var(--text-primary); border-top: 1px solid var(--border-default); }
.tePricing { display: flex; align-items: flex-end; gap: 20px; flex-wrap: wrap; }
.tePricing .k-form-grid { flex: 1 1 320px; }
.teFigure { display: flex; flex-direction: column; gap: 4px; }
.teFigure span { font-size: var(--fs-xs); color: var(--text-secondary); font-weight: 700; }
.teFigure strong { font-size: 18px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; }
@media (max-width: 640px) {
  .teWs .k-btn, .teWs .k-input, .teWs select.k-select { min-height: 44px; }
  .teWs .k-input, .teWs select.k-select, .teWs .k-textarea { font-size: 16px; }
  .teSheet { min-height: 56px; }
}
`;

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
  const { showToast } = useToast();
  const { projectId } = useParams() as { projectId: string };
  const router = useRouter();

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

  const base = `/app/projects/${projectId}`;
  const disciplineOptions = SHEET_DISCIPLINES.includes(newSheetDiscipline) ? SHEET_DISCIPLINES : [newSheetDiscipline, ...SHEET_DISCIPLINES];
  const marginTone = grossMargin > 20 ? 'var(--success)' : grossMargin > 10 ? 'var(--warning)' : 'var(--danger)';

  const stats: StatItem[] = [
    { label: 'Total Cost', value: currency(grandTotal), sub: 'Material + labor', icon: <Calculator size={15} /> },
    { label: 'Material', value: currency(totalMaterial), sub: 'Rolled up', icon: <Cube size={15} /> },
    { label: 'Labor', value: currency(totalLabor), sub: `${totalLaborHrs.toFixed(1)} hrs rolled up`, icon: <Users size={15} /> },
    { label: 'Sell Price', value: currency(sellPrice), sub: `×${markupMultiplier.toFixed(2)} markup`, icon: <Tag size={15} /> },
    { label: 'Gross Margin', value: `${grossMargin.toFixed(1)}%`, tone: grossMargin > 20 ? 'good' : grossMargin > 10 ? 'warn' : 'bad', sub: 'Of the sell price', icon: <ChartLineUp size={15} /> },
  ];

  const editable = (item: LineItem, field: string, value: string | number, width?: number) => {
    const isEditing = editingCell?.rowId === item.id && editingCell?.field === field;
    if (isEditing) {
      return (
        <input
          ref={editRef}
          className="k-input teCellInput"
          value={editValue}
          onClick={e => e.stopPropagation()}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => { if (escapedRef.current) { escapedRef.current = false; return; } saveInlineEdit(item, field, editValue); }}
          onKeyDown={e => {
            // Enter → blur so onBlur is the SINGLE commit path (no double PATCH);
            // Escape → cancel without saving.
            if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
            if (e.key === 'Escape') { escapedRef.current = true; setEditingCell(null); }
          }}
          style={{ width: width || 80 }}
        />
      );
    }
    return (
      <button
        type="button"
        className="teCell"
        title="Click to edit"
        onClick={e => { e.stopPropagation(); setEditingCell({ rowId: item.id, field }); setEditValue(String(value)); }}
      >
        {typeof value === 'number' && (field === 'unit_cost' || field === 'extended_cost') ? currency(value) : (value === '' || value == null ? '—' : value)}
      </button>
    );
  };

  return (
    <div className="teWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: project?.name || 'Project', href: `${base}/overview` },
          /* No href: the Back button below navigates client-side so an
             in-flight cell save is never aborted by a full page unload. */
          { label: 'Takeoff' },
          { label: 'Estimate' },
        ]}
        title="Takeoff Estimate"
        subtitle={project?.name ? `${project.name} · sheet-by-sheet quantities and live cost.` : 'Sheet-by-sheet quantities and live cost.'}
        actions={
          <>
            {/* Client-side nav, deliberately: a full-page <a> unload ABORTED any
                in-flight cell-save PATCH and dropped the 400ms-debounced edit. */}
            <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={() => router.push(`${base}/takeoff`)}>Project Takeoff</Button>
            <Select
              aria-label="Takeoff"
              value={selectedTakeoff?.id || ''}
              onChange={e => {
                const tp = takeoffProjects.find(t => t.id === e.target.value);
                if (tp) selectTakeoff(tp);
              }}
              style={{ width: 'auto', minWidth: 200 }}
              options={[{ value: '', label: 'Select Takeoff' }, ...takeoffProjects.map(tp => ({ value: tp.id, label: tp.name }))]}
            />
            <Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={createTakeoff}>New Takeoff</Button>
          </>
        }
      >
        <StatRow items={stats} />

        <div className="teGrid" data-detail={rightOpen && selectedItem && detailDraft ? 'true' : 'false'}>
          {/* LEFT — Sheets + Assembly Library */}
          <div className="teSide">
            <Card
              title="Sheets"
              icon={<Stack size={17} />}
              flush
              actions={<Button size="sm" icon={<Plus size={13} weight="bold" />} onClick={() => setAddingSheet(true)}>Add Sheet</Button>}
            >
              {addingSheet && (
                <form className="tePanel" onSubmit={e => { e.preventDefault(); void addSheet(); }}>
                  <Field label="Sheet name">
                    <Input placeholder="e.g. A-101 Floor Plan" value={newSheetName} onChange={e => setNewSheetName(e.target.value)} autoFocus />
                  </Field>
                  <Field label="Discipline">
                    <Select value={newSheetDiscipline} onChange={e => setNewSheetDiscipline(e.target.value)} options={disciplineOptions} />
                  </Field>
                  {sheetError && <span className="k-error" role="alert">{sheetError}</span>}
                  <div className="teBtns">
                    <Button type="submit" variant="primary" size="sm">Save</Button>
                    <Button variant="ghost" size="sm" onClick={() => { setAddingSheet(false); setNewSheetName(''); setSheetError(null); }}>Cancel</Button>
                  </div>
                </form>
              )}
              <div className="teScroll" style={{ maxHeight: 360 }}>
                {sheets.length === 0 && <EmptyState title="No sheets yet" text="Add one to begin." />}
                {sheets.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className="teSheet"
                    aria-current={selectedSheet?.id === s.id ? 'true' : undefined}
                    onClick={() => selectSheet(s)}
                  >
                    <span className="teThumb" aria-hidden>
                      {s.thumbnail_url ? <img src={s.thumbnail_url} alt="" /> : <FileText size={18} />}
                    </span>
                    <span className="teSheetText">
                      <span className="teSheetName">{s.name}</span>
                      <span className="teSheetMeta">
                        <Badge tone="neutral">{s.discipline}</Badge>
                        {s.sheet_number && <span>{s.sheet_number}</span>}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </Card>

            <Card
              title="Assembly Library"
              icon={<Cube size={17} />}
              flush
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  icon={assemblyOpen ? <CaretUp size={15} weight="bold" /> : <CaretDown size={15} weight="bold" />}
                  onClick={() => setAssemblyOpen(!assemblyOpen)}
                  aria-label={assemblyOpen ? 'Collapse assembly library' : 'Expand assembly library'}
                />
              }
            >
              {assemblyOpen && (
                <div className="teScroll" style={{ maxHeight: 220 }}>
                  {assemblies.length === 0 && <EmptyState title="No assemblies found" />}
                  {assemblies.map(a => (
                    <button key={a.id} type="button" className="teSheet" onClick={() => applyAssembly(a)} title="Start a line item from this assembly">
                      <span className="teSheetText">
                        <span className="teSheetName">{a.name}</span>
                        <span className="teSheetMeta"><span>{a.unit}</span></span>
                      </span>
                      <span className="teMoney">{currency(a.total_cost)}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* MAIN — the sheet's line items, edited in place */}
          <div style={{ minWidth: 0 }}>
            {!selectedSheet ? (
              <Card flush>
                <EmptyState
                  icon={<FileText size={22} />}
                  title="Select or add a sheet to begin"
                  text="Pick a sheet on the left to capture quantities and line-item costs."
                  action={<Button icon={<Plus size={15} weight="bold" />} onClick={() => setAddingSheet(true)}>Add Sheet</Button>}
                />
              </Card>
            ) : (
              <Card
                title="Line Items"
                subtitle={`${selectedSheet.name} · ${selectedSheet.discipline}`}
                icon={<ListNumbers size={17} />}
                flush
                actions={<Button size="sm" icon={<Plus size={13} weight="bold" />} onClick={() => setAddingRow(true)}>Add Line Item</Button>}
              >
                <div style={{ overflowX: 'auto' }}>
                  <table className="k-table-skin teTable">
                    <thead>
                      <tr>
                        {['#', 'CSI Code', 'Description', 'Qty', 'Unit', 'Unit Cost', 'Extended', 'Labor Hrs', ''].map((h, i) => (
                          <th key={i} style={{ textAlign: ['Qty', 'Unit Cost', 'Extended', 'Labor Hrs'].includes(h) ? 'right' : 'left' }} aria-label={h || 'Actions'}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.length === 0 && !addingRow && (
                        <tr><td colSpan={9}><EmptyState title="No line items on this sheet" action={<Button size="sm" icon={<Plus size={13} weight="bold" />} onClick={() => setAddingRow(true)}>Add Line Item</Button>} /></td></tr>
                      )}
                      {lineItems.map((item, idx) => (
                        <tr
                          key={item.id}
                          data-selected={selectedItem?.id === item.id ? 'true' : undefined}
                          onClick={() => { setSelectedItem(item); setDetailDraft({ ...item }); setRightOpen(true); }}
                        >
                          <td className="teMuted">{idx + 1}</td>
                          <td>{editable(item, 'csi_code', item.csi_code, 100)}</td>
                          <td>{editable(item, 'description', item.description, 200)}</td>
                          <td style={{ textAlign: 'right' }}>{editable(item, 'quantity', item.quantity, 60)}</td>
                          <td>{editable(item, 'unit', item.unit, 50)}</td>
                          <td style={{ textAlign: 'right' }}>{editable(item, 'unit_cost', item.unit_cost, 80)}</td>
                          <td style={{ textAlign: 'right' }} className="teMoney">{currency(num(item.quantity) * num(item.unit_cost))}</td>
                          <td style={{ textAlign: 'right' }}>{editable(item, 'labor_hours', item.labor_hours, 60)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<Trash size={15} />}
                              aria-label="Delete line item"
                              title="Delete"
                              onClick={e => { e.stopPropagation(); deleteLineItem(item.id); }}
                            />
                          </td>
                        </tr>
                      ))}
                      {/* Add Row */}
                      {addingRow && (
                        <tr className="teAddRow">
                          <td className="teMuted">+</td>
                          <td><Input aria-label="CSI code" value={newRow.csi_code} onChange={e => setNewRow(r => ({ ...r, csi_code: e.target.value }))} placeholder="CSI Code" style={{ width: 100 }} /></td>
                          <td><Input aria-label="Description" value={newRow.description} onChange={e => setNewRow(r => ({ ...r, description: e.target.value }))} placeholder="Description" style={{ width: 200 }} /></td>
                          <td><Input aria-label="Quantity" type="number" value={newRow.quantity || ''} onChange={e => setNewRow(r => ({ ...r, quantity: num(e.target.value) }))} placeholder="0" style={{ width: 70 }} /></td>
                          <td><Input aria-label="Unit" value={newRow.unit} onChange={e => setNewRow(r => ({ ...r, unit: e.target.value }))} style={{ width: 60 }} /></td>
                          <td><Input aria-label="Unit cost" type="number" value={newRow.unit_cost || ''} onChange={e => setNewRow(r => ({ ...r, unit_cost: num(e.target.value) }))} placeholder="0.00" style={{ width: 90 }} /></td>
                          <td style={{ textAlign: 'right' }} className="teMoney">{currency(num(newRow.quantity) * num(newRow.unit_cost))}</td>
                          <td><Input aria-label="Labor hours" type="number" value={newRow.labor_hours || ''} onChange={e => setNewRow(r => ({ ...r, labor_hours: num(e.target.value) }))} placeholder="0" style={{ width: 70 }} /></td>
                          <td>
                            <div className="teBtns">
                              <Button variant="primary" size="sm" onClick={addLineItem}>Save</Button>
                              <Button variant="ghost" size="sm" onClick={() => { setAddingRow(false); setNewRow({ ...emptyLineItem }); }}>Cancel</Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="teFoot">
                        <td colSpan={3} style={{ textAlign: 'right' }}>Totals</td>
                        <td style={{ textAlign: 'right' }}>{lineItems.reduce((s, i) => s + num(i.quantity), 0)}</td>
                        <td />
                        <td />
                        <td style={{ textAlign: 'right' }}>{currency(totalExtended)}</td>
                        <td style={{ textAlign: 'right' }}>{totalLaborHrs.toFixed(1)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            )}
          </div>

          {/* RIGHT — the selected line's full record */}
          {rightOpen && selectedItem && detailDraft && (
            <div className="teSide">
              <Card
                title="Item Details"
                icon={<SlidersHorizontal size={17} />}
                actions={<Button variant="ghost" size="sm" icon={<X size={16} />} aria-label="Close item details" onClick={() => setRightOpen(false)} />}
              >
                <form className="teForm" onSubmit={e => { e.preventDefault(); void saveDetail(); }}>
                  <FormGrid cols={1}>
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
                      <Field key={field} label={label}>
                        <Input
                          type={type}
                          value={(detailDraft as unknown as Record<string, unknown>)[field] as string | number || ''}
                          onChange={e => setDetailDraft(d => d ? { ...d, [field]: type === 'number' ? num(e.target.value) : e.target.value } : d)}
                        />
                      </Field>
                    ))}
                    <Field label="Notes">
                      <Textarea value={detailDraft.notes || ''} onChange={e => setDetailDraft(d => d ? { ...d, notes: e.target.value } : d)} rows={3} />
                    </Field>
                    <Field label="Subcontractor">
                      <Input value={detailDraft.subcontractor || ''} onChange={e => setDetailDraft(d => d ? { ...d, subcontractor: e.target.value } : d)} placeholder="Assign subcontractor" />
                    </Field>
                  </FormGrid>
                  <div className="teBtns" style={{ marginTop: 14 }}>
                    <Button type="submit" variant="primary">Save</Button>
                    <Button variant="ghost" onClick={() => { setDetailDraft(selectedItem ? { ...selectedItem } : null); }}>Cancel</Button>
                  </div>
                </form>
              </Card>
            </div>
          )}
        </div>

        {/* PRICING & MARKUP */}
        <div style={{ marginTop: 16 }}>
          <Card
            title="Pricing & Markup"
            icon={<SlidersHorizontal size={17} />}
            actions={
              <>
                {selectedTakeoff && (
                  <>
                    <a
                      className="k-btn k-btn-secondary k-btn-sm"
                      href={`/api/takeoff-projects/${selectedTakeoff.id}/export/pdf`}
                      target="_blank"
                      onClick={inAppFileClick(`/api/takeoff-projects/${selectedTakeoff.id}/export/pdf`, 'Takeoff estimate', (m) => showToast(m, 'error'))}
                      rel="noopener noreferrer"
                    >
                      <FilePdf size={15} /> Export PDF
                    </a>
                    <a
                      className="k-btn k-btn-secondary k-btn-sm"
                      href={`/api/takeoff-projects/${selectedTakeoff.id}/export/excel`}
                      target="_blank"
                      onClick={inAppFileClick(`/api/takeoff-projects/${selectedTakeoff.id}/export/excel`, 'Takeoff estimate', (m) => showToast(m, 'error'))}
                      rel="noopener noreferrer"
                    >
                      <MicrosoftExcelLogo size={15} /> Export Excel
                    </a>
                  </>
                )}
              </>
            }
          >
            <div className="tePricing">
              <div className="teFigure"><span>Grand Total</span><strong>{currency(grandTotal)}</strong></div>
              <FormGrid cols={3}>
                {[
                  { label: 'Overhead %', value: overhead, setter: setOverhead },
                  { label: 'Profit %', value: profit, setter: setProfit },
                  { label: 'Contingency %', value: contingency, setter: setContingency },
                ].map(({ label, value, setter }) => (
                  <Field key={label} label={label}>
                    <Input type="number" inputMode="decimal" value={value || ''} onChange={e => setter(num(e.target.value))} />
                  </Field>
                ))}
              </FormGrid>
              <div className="teFigure"><span>Sell Price</span><strong>{currency(sellPrice)}</strong></div>
              <div className="teFigure"><span>Gross Margin</span><strong style={{ color: marginTone }}>{grossMargin.toFixed(1)}%</strong></div>
              <Button variant="primary" onClick={saveProjectTotals} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </Card>
        </div>
      </PageShell>
    </div>
  );
}

export default function EstimatePageWrapper() {
  return (
    <Suspense fallback={
      <div style={{ background: 'var(--bg-base)', color: 'var(--text-secondary)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
        Loading estimate workspace…
      </div>
    }>
      <EstimatePage />
    </Suspense>
  );
}
