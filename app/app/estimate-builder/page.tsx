'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';

/* ─── Colors ────────────────────────────────────────────────────────── */
const GOLD   = '#D4A017';
const BG     = '#07101C';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';
const PURPLE = '#8B5CF6';

/* ─── Types ─────────────────────────────────────────────────────────── */
type TabKey = 'estimate' | 'assemblies' | 'compare' | 'history' | 'bidday' | 'templates';
type UnitType = 'EA' | 'SF' | 'LF' | 'CY' | 'SY' | 'TON' | 'HR' | 'LS' | 'GAL' | 'LB' | 'MBF' | 'CF';
type CostCategory = 'labor' | 'material' | 'equipment' | 'subcontractor';
type ExportFormat = 'pdf' | 'excel';

interface CostBreakdown {
  labor: number;
  material: number;
  equipment: number;
  subcontractor: number;
}

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit: UnitType;
  unitCost: number;
  markupPct: number;
  costBreakdown: CostBreakdown;
}

interface Division {
  code: string;
  name: string;
  items: LineItem[];
  expanded: boolean;
}

interface MarkupConfig {
  overheadPct: number;
  profitPct: number;
  contingencyPct: number;
  bondPct: number;
  taxPct: number;
}

interface Alternate {
  id: string;
  name: string;
  description: string;
  amount: number;
  included: boolean;
}

interface Allowance {
  id: string;
  name: string;
  amount: number;
  division: string;
}

interface Assembly {
  id: string;
  name: string;
  description: string;
  division: string;
  items: Omit<LineItem, 'id'>[];
}

interface EstimateVersion {
  id: string;
  version: number;
  name: string;
  createdAt: string;
  grandTotal: number;
  divisions: Division[];
  markup: MarkupConfig;
}

interface EstimateTemplate {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  divisions: Division[];
  markup: MarkupConfig;
}

interface BidDayAdjustment {
  id: string;
  description: string;
  amount: number;
  type: 'add' | 'deduct';
  applied: boolean;
}

/* ─── Constants ─────────────────────────────────────────────────────── */
const UNITS: UnitType[] = ['EA','SF','LF','CY','SY','TON','HR','LS','GAL','LB','MBF','CF'];

const CSI_DIVISIONS: { code: string; name: string }[] = [
  { code: '01', name: 'General Requirements' },
  { code: '02', name: 'Existing Conditions' },
  { code: '03', name: 'Concrete' },
  { code: '04', name: 'Masonry' },
  { code: '05', name: 'Metals' },
  { code: '06', name: 'Wood, Plastics & Composites' },
  { code: '07', name: 'Thermal & Moisture Protection' },
  { code: '08', name: 'Openings' },
  { code: '09', name: 'Finishes' },
  { code: '10', name: 'Specialties' },
  { code: '11', name: 'Equipment' },
  { code: '12', name: 'Furnishings' },
  { code: '13', name: 'Special Construction' },
  { code: '14', name: 'Conveying Equipment' },
  { code: '21', name: 'Fire Suppression' },
  { code: '22', name: 'Plumbing' },
  { code: '23', name: 'HVAC' },
  { code: '25', name: 'Integrated Automation' },
  { code: '26', name: 'Electrical' },
  { code: '27', name: 'Communications' },
  { code: '28', name: 'Electronic Safety & Security' },
  { code: '31', name: 'Earthwork' },
  { code: '32', name: 'Exterior Improvements' },
  { code: '33', name: 'Utilities' },
  { code: '34', name: 'Transportation' },
  { code: '35', name: 'Waterway & Marine Construction' },
  { code: '40', name: 'Process Integration' },
  { code: '41', name: 'Material Processing & Handling' },
  { code: '42', name: 'Process Heating & Cooling' },
  { code: '43', name: 'Process Gas & Liquid Handling' },
  { code: '44', name: 'Pollution & Waste Control' },
  { code: '45', name: 'Industry-Specific Manufacturing' },
  { code: '46', name: 'Water & Wastewater Equipment' },
  { code: '48', name: 'Electrical Power Generation' },
];

const SEED_ASSEMBLIES: Assembly[] = [
  {
    id: 'asm-1', name: 'Interior Wall Type A', description: '2x4 metal stud wall, 5/8" GWB both sides, taped & finished',
    division: '09',
    items: [
      { description: 'Metal studs 2x4 25ga', quantity: 1, unit: 'LF', unitCost: 3.25, markupPct: 0, costBreakdown: { labor: 1.50, material: 1.50, equipment: 0.25, subcontractor: 0 } },
      { description: '5/8" GWB both sides', quantity: 2, unit: 'SF', unitCost: 1.85, markupPct: 0, costBreakdown: { labor: 0.90, material: 0.80, equipment: 0.15, subcontractor: 0 } },
      { description: 'Taping & finishing', quantity: 2, unit: 'SF', unitCost: 0.95, markupPct: 0, costBreakdown: { labor: 0.65, material: 0.25, equipment: 0.05, subcontractor: 0 } },
    ],
  },
  {
    id: 'asm-2', name: 'Concrete Slab 4"', description: '4" reinforced concrete slab on grade with vapor barrier',
    division: '03',
    items: [
      { description: '4" concrete slab 3000 PSI', quantity: 1, unit: 'SF', unitCost: 6.50, markupPct: 0, costBreakdown: { labor: 2.00, material: 3.50, equipment: 1.00, subcontractor: 0 } },
      { description: '6x6 W1.4/W1.4 WWF', quantity: 1, unit: 'SF', unitCost: 0.45, markupPct: 0, costBreakdown: { labor: 0.15, material: 0.25, equipment: 0.05, subcontractor: 0 } },
      { description: '10 mil vapor barrier', quantity: 1, unit: 'SF', unitCost: 0.18, markupPct: 0, costBreakdown: { labor: 0.06, material: 0.10, equipment: 0.02, subcontractor: 0 } },
    ],
  },
  {
    id: 'asm-3', name: 'Exterior Paint System', description: 'Prep, prime, 2 coat exterior latex',
    division: '09',
    items: [
      { description: 'Surface preparation', quantity: 1, unit: 'SF', unitCost: 0.65, markupPct: 0, costBreakdown: { labor: 0.50, material: 0.10, equipment: 0.05, subcontractor: 0 } },
      { description: 'Primer coat', quantity: 1, unit: 'SF', unitCost: 0.45, markupPct: 0, costBreakdown: { labor: 0.25, material: 0.18, equipment: 0.02, subcontractor: 0 } },
      { description: '2 coats exterior latex', quantity: 1, unit: 'SF', unitCost: 0.85, markupPct: 0, costBreakdown: { labor: 0.45, material: 0.35, equipment: 0.05, subcontractor: 0 } },
    ],
  },
  {
    id: 'asm-4', name: 'CMU Wall 8"', description: '8" CMU wall with rebar & grout',
    division: '04',
    items: [
      { description: '8" CMU block', quantity: 1, unit: 'SF', unitCost: 8.50, markupPct: 0, costBreakdown: { labor: 4.00, material: 3.50, equipment: 0.50, subcontractor: 0.50 } },
      { description: '#5 rebar vertical @ 32" OC', quantity: 1, unit: 'LF', unitCost: 1.20, markupPct: 0, costBreakdown: { labor: 0.50, material: 0.60, equipment: 0.10, subcontractor: 0 } },
      { description: 'Grout fill', quantity: 1, unit: 'CF', unitCost: 4.75, markupPct: 0, costBreakdown: { labor: 1.50, material: 2.75, equipment: 0.50, subcontractor: 0 } },
    ],
  },
  {
    id: 'asm-5', name: 'Standing Seam Metal Roof', description: '24ga standing seam metal roof system',
    division: '07',
    items: [
      { description: '24ga standing seam panels', quantity: 1, unit: 'SF', unitCost: 12.00, markupPct: 0, costBreakdown: { labor: 4.00, material: 7.00, equipment: 0.50, subcontractor: 0.50 } },
      { description: 'Underlayment', quantity: 1, unit: 'SF', unitCost: 0.55, markupPct: 0, costBreakdown: { labor: 0.20, material: 0.30, equipment: 0.05, subcontractor: 0 } },
      { description: 'Ridge cap & flashing', quantity: 1, unit: 'LF', unitCost: 8.00, markupPct: 0, costBreakdown: { labor: 3.00, material: 4.50, equipment: 0.50, subcontractor: 0 } },
    ],
  },
];

/* ─── Helpers ───────────────────────────────────────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const pct = (n: number) => `${n.toFixed(1)}%`;

function emptyLineItem(): LineItem {
  return { id: uid(), description: '', quantity: 0, unit: 'EA', unitCost: 0, markupPct: 0, costBreakdown: { labor: 0, material: 0, equipment: 0, subcontractor: 0 } };
}

function lineTotal(item: LineItem): number {
  return item.quantity * item.unitCost * (1 + item.markupPct / 100);
}

function divisionTotal(div: Division): number {
  return div.items.reduce((s, i) => s + lineTotal(i), 0);
}

function costCategoryTotal(items: LineItem[], cat: CostCategory): number {
  return items.reduce((s, i) => s + i.quantity * i.costBreakdown[cat], 0);
}

/* ─── Component ─────────────────────────────────────────────────────── */
export default function EstimateBuilderPage() {
  const [tab, setTab] = useState<TabKey>('estimate');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportingAs, setExportingAs] = useState<ExportFormat | null>(null);

  // Estimate state
  const [estimateName, setEstimateName] = useState('New Estimate');
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [markup, setMarkup] = useState<MarkupConfig>({ overheadPct: 10, profitPct: 8, contingencyPct: 5, bondPct: 1.5, taxPct: 8.25 });
  const [alternates, setAlternates] = useState<Alternate[]>([]);
  const [allowances, setAllowances] = useState<Allowance[]>([]);

  // Assembly library
  const [assemblies, setAssemblies] = useState<Assembly[]>(SEED_ASSEMBLIES);
  const [assemblySearch, setAssemblySearch] = useState('');

  // Versions
  const [versions, setVersions] = useState<EstimateVersion[]>([]);
  const [compareA, setCompareA] = useState<string>('');
  const [compareB, setCompareB] = useState<string>('');

  // Templates
  const [templates, setTemplates] = useState<EstimateTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');

  // Bid Day
  const [bidAdjustments, setBidAdjustments] = useState<BidDayAdjustment[]>([]);

  // Division filter / search
  const [divisionFilter, setDivisionFilter] = useState('');
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);

  // Add-item modal
  const [addingToDivision, setAddingToDivision] = useState<string | null>(null);

  /* ─── Initialize ────────────────────────────────────────────────── */
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const initial: Division[] = CSI_DIVISIONS.map(d => ({ code: d.code, name: d.name, items: [], expanded: false }));
        setDivisions(initial);
        setLoading(false);
      } catch {
        setError('Failed to initialize estimate data.');
        setLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  /* ─── Computed ──────────────────────────────────────────────────── */
  const subtotal = useMemo(() => divisions.reduce((s, d) => s + divisionTotal(d), 0), [divisions]);
  const overheadAmt = subtotal * markup.overheadPct / 100;
  const profitAmt = subtotal * markup.profitPct / 100;
  const contingencyAmt = subtotal * markup.contingencyPct / 100;
  const bondAmt = subtotal * markup.bondPct / 100;
  const preMarkupTotal = subtotal + overheadAmt + profitAmt + contingencyAmt + bondAmt;
  const includedAlternates = alternates.filter(a => a.included).reduce((s, a) => s + a.amount, 0);
  const allowanceTotal = allowances.reduce((s, a) => s + a.amount, 0);
  const bidDayNet = bidAdjustments.filter(a => a.applied).reduce((s, a) => s + (a.type === 'add' ? a.amount : -a.amount), 0);
  const preTaxTotal = preMarkupTotal + includedAlternates + allowanceTotal + bidDayNet;
  const taxAmt = preTaxTotal * markup.taxPct / 100;
  const grandTotal = preTaxTotal + taxAmt;

  const allItems = useMemo(() => divisions.flatMap(d => d.items), [divisions]);
  const filteredDivisions = useMemo(() => {
    if (!divisionFilter) return divisions;
    const q = divisionFilter.toLowerCase();
    return divisions.filter(d => d.code.includes(q) || d.name.toLowerCase().includes(q) || d.items.some(i => i.description.toLowerCase().includes(q)));
  }, [divisions, divisionFilter]);

  const filteredAssemblies = useMemo(() => {
    if (!assemblySearch) return assemblies;
    const q = assemblySearch.toLowerCase();
    return assemblies.filter(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
  }, [assemblies, assemblySearch]);

  /* ─── Mutation helpers ──────────────────────────────────────────── */
  const toggleDivision = useCallback((code: string) => {
    setDivisions(prev => prev.map(d => d.code === code ? { ...d, expanded: !d.expanded } : d));
  }, []);

  const addLineItem = useCallback((divCode: string) => {
    setDivisions(prev => prev.map(d => d.code === divCode ? { ...d, items: [...d.items, emptyLineItem()], expanded: true } : d));
  }, []);

  const updateLineItem = useCallback((divCode: string, itemId: string, field: keyof LineItem, value: string | number) => {
    setDivisions(prev => prev.map(d => {
      if (d.code !== divCode) return d;
      return { ...d, items: d.items.map(i => i.id === itemId ? { ...i, [field]: value } : i) };
    }));
  }, []);

  const updateCostBreakdown = useCallback((divCode: string, itemId: string, cat: CostCategory, value: number) => {
    setDivisions(prev => prev.map(d => {
      if (d.code !== divCode) return d;
      return { ...d, items: d.items.map(i => i.id === itemId ? { ...i, costBreakdown: { ...i.costBreakdown, [cat]: value } } : i) };
    }));
  }, []);

  const removeLineItem = useCallback((divCode: string, itemId: string) => {
    setDivisions(prev => prev.map(d => d.code === divCode ? { ...d, items: d.items.filter(i => i.id !== itemId) } : d));
  }, []);

  const applyAssembly = useCallback((asm: Assembly) => {
    const newItems: LineItem[] = asm.items.map(i => ({ ...i, id: uid() }));
    setDivisions(prev => prev.map(d => d.code === asm.division ? { ...d, items: [...d.items, ...newItems], expanded: true } : d));
  }, []);

  const importFromTakeoff = useCallback(() => {
    setSaving(true);
    setTimeout(() => {
      const simulated: { divCode: string; items: LineItem[] }[] = [
        { divCode: '03', items: [
          { id: uid(), description: 'Foundation concrete (from takeoff)', quantity: 245, unit: 'CY', unitCost: 185, markupPct: 5, costBreakdown: { labor: 45, material: 110, equipment: 20, subcontractor: 10 } },
          { id: uid(), description: 'Slab on grade 6" (from takeoff)', quantity: 8500, unit: 'SF', unitCost: 8.25, markupPct: 5, costBreakdown: { labor: 2.50, material: 4.25, equipment: 1.00, subcontractor: 0.50 } },
        ]},
        { divCode: '05', items: [
          { id: uid(), description: 'Structural steel W-shapes (from takeoff)', quantity: 85, unit: 'TON', unitCost: 4200, markupPct: 8, costBreakdown: { labor: 1200, material: 2400, equipment: 400, subcontractor: 200 } },
        ]},
        { divCode: '26', items: [
          { id: uid(), description: 'Electrical rough-in (from takeoff)', quantity: 1, unit: 'LS', unitCost: 125000, markupPct: 10, costBreakdown: { labor: 55000, material: 45000, equipment: 5000, subcontractor: 20000 } },
        ]},
      ];
      setDivisions(prev => prev.map(d => {
        const match = simulated.find(s => s.divCode === d.code);
        if (!match) return d;
        return { ...d, items: [...d.items, ...match.items], expanded: true };
      }));
      setSaving(false);
    }, 1200);
  }, []);

  const saveVersion = useCallback(() => {
    const v: EstimateVersion = {
      id: uid(),
      version: versions.length + 1,
      name: `v${versions.length + 1}`,
      createdAt: new Date().toISOString(),
      grandTotal,
      divisions: JSON.parse(JSON.stringify(divisions)),
      markup: { ...markup },
    };
    setVersions(prev => [...prev, v]);
  }, [versions, divisions, markup, grandTotal]);

  const saveTemplate = useCallback(() => {
    if (!templateName.trim()) return;
    const t: EstimateTemplate = {
      id: uid(),
      name: templateName.trim(),
      description: `Template with ${divisions.filter(d => d.items.length > 0).length} divisions`,
      createdAt: new Date().toISOString(),
      divisions: JSON.parse(JSON.stringify(divisions)),
      markup: { ...markup },
    };
    setTemplates(prev => [...prev, t]);
    setTemplateName('');
  }, [templateName, divisions, markup]);

  const loadTemplate = useCallback((t: EstimateTemplate) => {
    setDivisions(JSON.parse(JSON.stringify(t.divisions)));
    setMarkup({ ...t.markup });
  }, []);

  const simulateExport = useCallback((format: ExportFormat) => {
    setExportingAs(format);
    setTimeout(() => {
      setExportingAs(null);
      alert(`Estimate exported as ${format.toUpperCase()} successfully. (Simulation)`);
    }, 1500);
  }, []);

  /* ─── Styles ────────────────────────────────────────────────────── */
  const pageStyle: React.CSSProperties = { minHeight: '100vh', background: BG, color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '24px 32px' };
  const cardStyle: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 20, marginBottom: 16 };
  const btnStyle = (bg: string = GOLD, c: string = '#000'): React.CSSProperties => ({
    background: bg, color: c, border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6,
  });
  const btnSmStyle = (bg: string = BORDER): React.CSSProperties => ({
    background: bg, color: TEXT, border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12,
  });
  const inputStyle: React.CSSProperties = { background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, padding: '6px 10px', fontSize: 13, width: '100%' };
  const selectStyle: React.CSSProperties = { ...inputStyle, width: 'auto' };
  const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' };
  const tdStyle: React.CSSProperties = { padding: '6px 10px', borderBottom: `1px solid ${BORDER}`, fontSize: 13, verticalAlign: 'middle' };
  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? GOLD : 'transparent', color: active ? '#000' : DIM, border: `1px solid ${active ? GOLD : BORDER}`,
    borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all 0.15s',
  });
  const badgeStyle = (bg: string): React.CSSProperties => ({
    background: bg, color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 600,
  });

  /* ─── Loading / Error ───────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, border: `3px solid ${BORDER}`, borderTop: `3px solid ${GOLD}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <div style={{ color: DIM, fontSize: 14 }}>Loading Estimate Builder...</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, borderColor: RED, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>!</div>
          <div style={{ color: RED, fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Error</div>
          <div style={{ color: DIM, marginBottom: 16 }}>{error}</div>
          <button style={btnStyle(RED, '#fff')} onClick={() => window.location.reload()}>Reload Page</button>
        </div>
      </div>
    );
  }

  /* ─── Render: Summary Sidebar ───────────────────────────────────── */
  const renderSummary = () => (
    <div style={{ ...cardStyle, position: 'sticky', top: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: GOLD }}>Estimate Summary</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
        {divisions.filter(d => d.items.length > 0).map(d => (
          <div key={d.code} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: DIM }}>Div {d.code} - {d.name}</span>
            <span>{fmt(divisionTotal(d))}</span>
          </div>
        ))}
        {divisions.every(d => d.items.length === 0) && <div style={{ color: DIM, fontStyle: 'italic' }}>No line items yet</div>}
        <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 6, paddingTop: 8 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: DIM }}>Direct Cost Subtotal</span><span>{fmt(subtotal)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: DIM }}>Overhead ({pct(markup.overheadPct)})</span><span>{fmt(overheadAmt)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: DIM }}>Profit ({pct(markup.profitPct)})</span><span>{fmt(profitAmt)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: DIM }}>Contingency ({pct(markup.contingencyPct)})</span><span>{fmt(contingencyAmt)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: DIM }}>Bond ({pct(markup.bondPct)})</span><span>{fmt(bondAmt)}</span></div>
        {includedAlternates !== 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: AMBER }}>Alternates</span><span>{fmt(includedAlternates)}</span></div>}
        {allowanceTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: BLUE }}>Allowances</span><span>{fmt(allowanceTotal)}</span></div>}
        {bidDayNet !== 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: PURPLE }}>Bid Day Adj.</span><span style={{ color: bidDayNet >= 0 ? GREEN : RED }}>{fmt(bidDayNet)}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: DIM }}>Tax ({pct(markup.taxPct)})</span><span>{fmt(taxAmt)}</span></div>
        <div style={{ borderTop: `1px solid ${GOLD}`, marginTop: 6, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16 }}>
          <span style={{ color: GOLD }}>Grand Total</span><span style={{ color: GOLD }}>{fmt(grandTotal)}</span>
        </div>
      </div>
      {/* Cost category breakdown */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: DIM, marginBottom: 8 }}>COST CATEGORY BREAKDOWN</div>
        {(['labor', 'material', 'equipment', 'subcontractor'] as CostCategory[]).map(cat => {
          const total = costCategoryTotal(allItems, cat);
          const pctVal = subtotal > 0 ? (total / subtotal * 100) : 0;
          return (
            <div key={cat} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                <span style={{ color: DIM, textTransform: 'capitalize' }}>{cat}</span>
                <span>{fmt(total)} ({pct(pctVal)})</span>
              </div>
              <div style={{ height: 4, background: BORDER, borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${Math.min(pctVal, 100)}%`, background: cat === 'labor' ? BLUE : cat === 'material' ? GREEN : cat === 'equipment' ? AMBER : PURPLE, borderRadius: 2 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ─── Render: Estimate Tab ──────────────────────────────────────── */
  const renderEstimateTab = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
      <div>
        {/* Header bar */}
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <input style={{ ...inputStyle, width: 280, fontSize: 16, fontWeight: 700 }} value={estimateName} onChange={e => setEstimateName(e.target.value)} />
          <input style={{ ...inputStyle, width: 220 }} placeholder="Search divisions / items..." value={divisionFilter} onChange={e => setDivisionFilter(e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: DIM, cursor: 'pointer' }}>
            <input type="checkbox" checked={showCostBreakdown} onChange={e => setShowCostBreakdown(e.target.checked)} /> Show Cost Breakdown
          </label>
          <div style={{ flex: 1 }} />
          <button style={btnStyle(BLUE, '#fff')} onClick={importFromTakeoff} disabled={saving}>{saving ? 'Importing...' : 'Import from Takeoff'}</button>
          <button style={btnStyle(GREEN, '#fff')} onClick={saveVersion}>Save Version (v{versions.length + 1})</button>
          <button style={btnStyle()} onClick={() => simulateExport('pdf')} disabled={!!exportingAs}>{exportingAs === 'pdf' ? 'Exporting...' : 'Export PDF'}</button>
          <button style={btnStyle(BORDER, TEXT)} onClick={() => simulateExport('excel')} disabled={!!exportingAs}>{exportingAs === 'excel' ? 'Exporting...' : 'Export Excel'}</button>
        </div>

        {/* Markup Configuration */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: GOLD }}>Markup Configuration</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Overhead %', key: 'overheadPct' as const },
              { label: 'Profit %', key: 'profitPct' as const },
              { label: 'Contingency %', key: 'contingencyPct' as const },
              { label: 'Bond %', key: 'bondPct' as const },
              { label: 'Tax %', key: 'taxPct' as const },
            ].map(m => (
              <div key={m.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: DIM }}>{m.label}</label>
                <input style={{ ...inputStyle, width: 80 }} type="number" step="0.1" value={markup[m.key]} onChange={e => setMarkup(prev => ({ ...prev, [m.key]: parseFloat(e.target.value) || 0 }))} />
              </div>
            ))}
          </div>
        </div>

        {/* Divisions */}
        {filteredDivisions.map(div => (
          <div key={div.code} style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', background: div.expanded ? `${GOLD}10` : 'transparent', borderBottom: div.expanded ? `1px solid ${BORDER}` : 'none' }}
              onClick={() => toggleDivision(div.code)}
            >
              <span style={{ fontFamily: 'monospace', color: GOLD, fontWeight: 700, marginRight: 10, fontSize: 13 }}>{div.expanded ? '\u25BC' : '\u25B6'}</span>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Division {div.code} - {div.name}</span>
              <span style={{ marginLeft: 'auto', color: div.items.length > 0 ? TEXT : DIM, fontWeight: 600 }}>
                {div.items.length > 0 ? fmt(divisionTotal(div)) : 'No items'}
              </span>
              <span style={{ ...badgeStyle(div.items.length > 0 ? BLUE : BORDER), marginLeft: 10 }}>{div.items.length}</span>
            </div>
            {div.expanded && (
              <div style={{ padding: '12px 16px' }}>
                {div.items.length === 0 && (
                  <div style={{ color: DIM, fontStyle: 'italic', fontSize: 13, padding: '12px 0', textAlign: 'center' }}>
                    No line items in this division. Add items below or apply an assembly.
                  </div>
                )}
                {div.items.length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Description</th>
                          <th style={{ ...thStyle, width: 80 }}>Qty</th>
                          <th style={{ ...thStyle, width: 70 }}>Unit</th>
                          <th style={{ ...thStyle, width: 100 }}>Unit Cost</th>
                          <th style={{ ...thStyle, width: 80 }}>Markup %</th>
                          <th style={{ ...thStyle, width: 110 }}>Total</th>
                          {showCostBreakdown && <>
                            <th style={{ ...thStyle, width: 80, color: BLUE }}>Labor</th>
                            <th style={{ ...thStyle, width: 80, color: GREEN }}>Material</th>
                            <th style={{ ...thStyle, width: 80, color: AMBER }}>Equip.</th>
                            <th style={{ ...thStyle, width: 80, color: PURPLE }}>Sub</th>
                          </>}
                          <th style={{ ...thStyle, width: 40 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {div.items.map(item => (
                          <tr key={item.id}>
                            <td style={tdStyle}><input style={{ ...inputStyle }} value={item.description} onChange={e => updateLineItem(div.code, item.id, 'description', e.target.value)} /></td>
                            <td style={tdStyle}><input style={{ ...inputStyle, width: 70 }} type="number" value={item.quantity} onChange={e => updateLineItem(div.code, item.id, 'quantity', parseFloat(e.target.value) || 0)} /></td>
                            <td style={tdStyle}>
                              <select style={{ ...selectStyle, width: 65 }} value={item.unit} onChange={e => updateLineItem(div.code, item.id, 'unit', e.target.value)}>
                                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </td>
                            <td style={tdStyle}><input style={{ ...inputStyle, width: 90 }} type="number" step="0.01" value={item.unitCost} onChange={e => updateLineItem(div.code, item.id, 'unitCost', parseFloat(e.target.value) || 0)} /></td>
                            <td style={tdStyle}><input style={{ ...inputStyle, width: 65 }} type="number" step="0.1" value={item.markupPct} onChange={e => updateLineItem(div.code, item.id, 'markupPct', parseFloat(e.target.value) || 0)} /></td>
                            <td style={{ ...tdStyle, fontWeight: 600, color: GOLD }}>{fmt(lineTotal(item))}</td>
                            {showCostBreakdown && <>
                              <td style={tdStyle}><input style={{ ...inputStyle, width: 70 }} type="number" step="0.01" value={item.costBreakdown.labor} onChange={e => updateCostBreakdown(div.code, item.id, 'labor', parseFloat(e.target.value) || 0)} /></td>
                              <td style={tdStyle}><input style={{ ...inputStyle, width: 70 }} type="number" step="0.01" value={item.costBreakdown.material} onChange={e => updateCostBreakdown(div.code, item.id, 'material', parseFloat(e.target.value) || 0)} /></td>
                              <td style={tdStyle}><input style={{ ...inputStyle, width: 70 }} type="number" step="0.01" value={item.costBreakdown.equipment} onChange={e => updateCostBreakdown(div.code, item.id, 'equipment', parseFloat(e.target.value) || 0)} /></td>
                              <td style={tdStyle}><input style={{ ...inputStyle, width: 70 }} type="number" step="0.01" value={item.costBreakdown.subcontractor} onChange={e => updateCostBreakdown(div.code, item.id, 'subcontractor', parseFloat(e.target.value) || 0)} /></td>
                            </>}
                            <td style={tdStyle}><button style={{ ...btnSmStyle(RED), fontSize: 11 }} onClick={() => removeLineItem(div.code, item.id)}>X</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button style={btnSmStyle(GOLD)} onClick={() => addLineItem(div.code)}><span style={{ color: '#000', fontWeight: 700 }}>+ Add Line Item</span></button>
                  <button style={btnSmStyle(BLUE)} onClick={() => setAddingToDivision(div.code)}><span style={{ color: TEXT }}>Apply Assembly</span></button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Assembly Picker Modal (inline) */}
        {addingToDivision && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 }} onClick={() => setAddingToDivision(null)}>
            <div style={{ ...cardStyle, width: 560, maxHeight: '70vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, color: GOLD }}>Apply Assembly to Div {addingToDivision}</div>
              <input style={{ ...inputStyle, marginBottom: 12 }} placeholder="Search assemblies..." value={assemblySearch} onChange={e => setAssemblySearch(e.target.value)} />
              {filteredAssemblies.length === 0 && <div style={{ color: DIM, fontStyle: 'italic', padding: 16, textAlign: 'center' }}>No assemblies match your search.</div>}
              {filteredAssemblies.map(asm => (
                <div key={asm.id} style={{ padding: '10px 12px', border: `1px solid ${BORDER}`, borderRadius: 6, marginBottom: 8, cursor: 'pointer', background: BG }}
                  onClick={() => { applyAssembly({ ...asm, division: addingToDivision }); setAddingToDivision(null); setAssemblySearch(''); }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{asm.name}</div>
                  <div style={{ color: DIM, fontSize: 12, marginTop: 2 }}>{asm.description}</div>
                  <div style={{ color: DIM, fontSize: 11, marginTop: 4 }}>{asm.items.length} items | Div {asm.division}</div>
                </div>
              ))}
              <button style={{ ...btnSmStyle(BORDER), marginTop: 8 }} onClick={() => { setAddingToDivision(null); setAssemblySearch(''); }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Alternates Section */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: AMBER }}>Alternates</div>
            <button style={btnSmStyle(AMBER)} onClick={() => setAlternates(prev => [...prev, { id: uid(), name: '', description: '', amount: 0, included: false }])}>
              <span style={{ color: '#000', fontWeight: 700 }}>+ Add Alternate</span>
            </button>
          </div>
          {alternates.length === 0 && <div style={{ color: DIM, fontStyle: 'italic', fontSize: 13 }}>No alternates defined. Add alternates for optional scope items.</div>}
          {alternates.map(alt => (
            <div key={alt.id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <input type="checkbox" checked={alt.included} onChange={e => setAlternates(prev => prev.map(a => a.id === alt.id ? { ...a, included: e.target.checked } : a))} />
              <input style={{ ...inputStyle, width: 180 }} placeholder="Name" value={alt.name} onChange={e => setAlternates(prev => prev.map(a => a.id === alt.id ? { ...a, name: e.target.value } : a))} />
              <input style={{ ...inputStyle, flex: 1 }} placeholder="Description" value={alt.description} onChange={e => setAlternates(prev => prev.map(a => a.id === alt.id ? { ...a, description: e.target.value } : a))} />
              <input style={{ ...inputStyle, width: 120 }} type="number" placeholder="Amount" value={alt.amount} onChange={e => setAlternates(prev => prev.map(a => a.id === alt.id ? { ...a, amount: parseFloat(e.target.value) || 0 } : a))} />
              <button style={btnSmStyle(RED)} onClick={() => setAlternates(prev => prev.filter(a => a.id !== alt.id))}>X</button>
            </div>
          ))}
        </div>

        {/* Allowances Section */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: BLUE }}>Allowances</div>
            <button style={btnSmStyle(BLUE)} onClick={() => setAllowances(prev => [...prev, { id: uid(), name: '', amount: 0, division: '01' }])}>
              <span style={{ color: TEXT, fontWeight: 700 }}>+ Add Allowance</span>
            </button>
          </div>
          {allowances.length === 0 && <div style={{ color: DIM, fontStyle: 'italic', fontSize: 13 }}>No allowances defined. Add allowances for items not yet fully priced.</div>}
          {allowances.map(alw => (
            <div key={alw.id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <input style={{ ...inputStyle, width: 200 }} placeholder="Allowance name" value={alw.name} onChange={e => setAllowances(prev => prev.map(a => a.id === alw.id ? { ...a, name: e.target.value } : a))} />
              <select style={{ ...selectStyle, width: 160 }} value={alw.division} onChange={e => setAllowances(prev => prev.map(a => a.id === alw.id ? { ...a, division: e.target.value } : a))}>
                {CSI_DIVISIONS.map(d => <option key={d.code} value={d.code}>Div {d.code} - {d.name}</option>)}
              </select>
              <input style={{ ...inputStyle, width: 120 }} type="number" placeholder="Amount" value={alw.amount} onChange={e => setAllowances(prev => prev.map(a => a.id === alw.id ? { ...a, amount: parseFloat(e.target.value) || 0 } : a))} />
              <button style={btnSmStyle(RED)} onClick={() => setAllowances(prev => prev.filter(a => a.id !== alw.id))}>X</button>
            </div>
          ))}
        </div>

        {/* Unit Cost Analysis */}
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: GOLD }}>Unit Cost Analysis</div>
          {allItems.length === 0 && <div style={{ color: DIM, fontStyle: 'italic', fontSize: 13 }}>Add line items to see unit cost analysis.</div>}
          {allItems.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Description</th>
                  <th style={thStyle}>Unit</th>
                  <th style={thStyle}>Unit Cost</th>
                  <th style={thStyle}>Labor/Unit</th>
                  <th style={thStyle}>Material/Unit</th>
                  <th style={thStyle}>Equip/Unit</th>
                  <th style={thStyle}>Sub/Unit</th>
                  <th style={thStyle}>Breakdown Sum</th>
                  <th style={thStyle}>Variance</th>
                </tr>
              </thead>
              <tbody>
                {allItems.filter(i => i.description).map(item => {
                  const breakdownSum = item.costBreakdown.labor + item.costBreakdown.material + item.costBreakdown.equipment + item.costBreakdown.subcontractor;
                  const variance = item.unitCost - breakdownSum;
                  return (
                    <tr key={item.id}>
                      <td style={tdStyle}>{item.description}</td>
                      <td style={tdStyle}>{item.unit}</td>
                      <td style={tdStyle}>{fmt(item.unitCost)}</td>
                      <td style={{ ...tdStyle, color: BLUE }}>{fmt(item.costBreakdown.labor)}</td>
                      <td style={{ ...tdStyle, color: GREEN }}>{fmt(item.costBreakdown.material)}</td>
                      <td style={{ ...tdStyle, color: AMBER }}>{fmt(item.costBreakdown.equipment)}</td>
                      <td style={{ ...tdStyle, color: PURPLE }}>{fmt(item.costBreakdown.subcontractor)}</td>
                      <td style={tdStyle}>{fmt(breakdownSum)}</td>
                      <td style={{ ...tdStyle, color: Math.abs(variance) > 0.01 ? RED : GREEN, fontWeight: 600 }}>{fmt(variance)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {renderSummary()}
    </div>
  );

  /* ─── Render: Assemblies Tab ────────────────────────────────────── */
  const renderAssembliesTab = () => (
    <div>
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: GOLD }}>Assembly / Template Library</div>
        <div style={{ flex: 1 }} />
        <input style={{ ...inputStyle, width: 260 }} placeholder="Search assemblies..." value={assemblySearch} onChange={e => setAssemblySearch(e.target.value)} />
      </div>
      {filteredAssemblies.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
          <div style={{ color: DIM, fontSize: 14 }}>No assemblies found.</div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {filteredAssemblies.map(asm => (
          <div key={asm.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{asm.name}</div>
                <div style={{ color: DIM, fontSize: 12, marginTop: 2 }}>{asm.description}</div>
                <div style={{ color: DIM, fontSize: 11, marginTop: 4 }}>Division: {asm.division} | {asm.items.length} items</div>
              </div>
              <span style={badgeStyle(BLUE)}>Assembly</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, fontSize: 11 }}>Item</th>
                  <th style={{ ...thStyle, fontSize: 11 }}>Unit</th>
                  <th style={{ ...thStyle, fontSize: 11 }}>Cost/Unit</th>
                </tr>
              </thead>
              <tbody>
                {asm.items.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{item.description}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{item.unit}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{fmt(item.unitCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btnStyle(GOLD, '#000')} onClick={() => applyAssembly(asm)}>Apply to Div {asm.division}</button>
              <button style={btnSmStyle(RED)} onClick={() => setAssemblies(prev => prev.filter(a => a.id !== asm.id))}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  /* ─── Render: Compare Tab ───────────────────────────────────────── */
  const renderCompareTab = () => {
    const vA = versions.find(v => v.id === compareA);
    const vB = versions.find(v => v.id === compareB);
    return (
      <div>
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: GOLD }}>Compare Estimates</div>
          <select style={{ ...selectStyle, width: 180 }} value={compareA} onChange={e => setCompareA(e.target.value)}>
            <option value="">-- Select Version A --</option>
            {versions.map(v => <option key={v.id} value={v.id}>{v.name} ({fmt(v.grandTotal)})</option>)}
          </select>
          <span style={{ color: DIM }}>vs</span>
          <select style={{ ...selectStyle, width: 180 }} value={compareB} onChange={e => setCompareB(e.target.value)}>
            <option value="">-- Select Version B --</option>
            {versions.map(v => <option key={v.id} value={v.id}>{v.name} ({fmt(v.grandTotal)})</option>)}
          </select>
        </div>
        {versions.length < 2 && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
            <div style={{ color: DIM, fontSize: 14 }}>Save at least 2 versions to compare estimates side-by-side.</div>
            <div style={{ color: DIM, fontSize: 12, marginTop: 6 }}>Go to the Estimate tab and click "Save Version" to create snapshots.</div>
          </div>
        )}
        {vA && vB && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[vA, vB].map(ver => (
              <div key={ver.id} style={cardStyle}>
                <div style={{ fontWeight: 700, fontSize: 15, color: GOLD, marginBottom: 10 }}>{ver.name} - {new Date(ver.createdAt).toLocaleDateString()}</div>
                <div style={{ fontSize: 13, marginBottom: 8 }}>Grand Total: <span style={{ fontWeight: 700, color: GOLD }}>{fmt(ver.grandTotal)}</span></div>
                {ver.divisions.filter(d => d.items.length > 0).map(d => {
                  const otherVer = ver === vA ? vB : vA;
                  const otherDiv = otherVer.divisions.find(od => od.code === d.code);
                  const otherTotal = otherDiv ? divisionTotal(otherDiv) : 0;
                  const thisTotal = divisionTotal(d);
                  const diff = thisTotal - otherTotal;
                  return (
                    <div key={d.code} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, background: Math.abs(diff) > 0 ? `${diff > 0 ? RED : GREEN}15` : 'transparent', paddingLeft: 6, paddingRight: 6, borderRadius: 3, marginBottom: 2 }}>
                      <span style={{ color: DIM }}>Div {d.code} - {d.name}</span>
                      <span style={{ fontWeight: 600 }}>{fmt(thisTotal)}
                        {Math.abs(diff) > 0.01 && <span style={{ color: diff > 0 ? RED : GREEN, marginLeft: 6, fontSize: 11 }}>({diff > 0 ? '+' : ''}{fmt(diff)})</span>}
                      </span>
                    </div>
                  );
                })}
                <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 8, paddingTop: 8, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: DIM }}>Overhead</span><span>{pct(ver.markup.overheadPct)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: DIM }}>Profit</span><span>{pct(ver.markup.profitPct)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: DIM }}>Contingency</span><span>{pct(ver.markup.contingencyPct)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: DIM }}>Bond</span><span>{pct(ver.markup.bondPct)}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
        {vA && vB && (
          <div style={{ ...cardStyle, marginTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: GOLD }}>Variance Summary</div>
            <div style={{ display: 'flex', gap: 40, fontSize: 14 }}>
              <div><span style={{ color: DIM }}>Version A Total: </span><span style={{ fontWeight: 700 }}>{fmt(vA.grandTotal)}</span></div>
              <div><span style={{ color: DIM }}>Version B Total: </span><span style={{ fontWeight: 700 }}>{fmt(vB.grandTotal)}</span></div>
              <div><span style={{ color: DIM }}>Difference: </span><span style={{ fontWeight: 700, color: vA.grandTotal - vB.grandTotal > 0 ? RED : GREEN }}>{fmt(vA.grandTotal - vB.grandTotal)} ({pct(vB.grandTotal !== 0 ? ((vA.grandTotal - vB.grandTotal) / vB.grandTotal * 100) : 0)})</span></div>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ─── Render: History Tab ───────────────────────────────────────── */
  const renderHistoryTab = () => (
    <div>
      <div style={{ ...cardStyle }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: GOLD, marginBottom: 12 }}>Version History</div>
        {versions.length === 0 && (
          <div style={{ color: DIM, fontStyle: 'italic', fontSize: 13, textAlign: 'center', padding: 24 }}>
            No versions saved yet. Go to the Estimate tab and click "Save Version" to create a snapshot.
          </div>
        )}
        {versions.map((ver, idx) => {
          const prev = idx > 0 ? versions[idx - 1] : null;
          const diff = prev ? ver.grandTotal - prev.grandTotal : 0;
          return (
            <div key={ver.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 14px', border: `1px solid ${BORDER}`, borderRadius: 6, marginBottom: 8, background: BG }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${GOLD}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: GOLD, fontSize: 14 }}>{ver.name}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Version {ver.version}</div>
                <div style={{ color: DIM, fontSize: 12 }}>{new Date(ver.createdAt).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{fmt(ver.grandTotal)}</div>
                {prev && (
                  <div style={{ fontSize: 12, color: diff > 0 ? RED : diff < 0 ? GREEN : DIM, fontWeight: 600 }}>
                    {diff > 0 ? '+' : ''}{fmt(diff)} ({pct(prev.grandTotal !== 0 ? (diff / prev.grandTotal * 100) : 0)})
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={btnSmStyle(BLUE)} onClick={() => { setDivisions(JSON.parse(JSON.stringify(ver.divisions))); setMarkup({ ...ver.markup }); setTab('estimate'); }}>Restore</button>
              </div>
            </div>
          );
        })}
      </div>
      {versions.length >= 2 && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, fontSize: 14, color: GOLD, marginBottom: 12 }}>Version Trend</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
            {versions.map(ver => {
              const maxTotal = Math.max(...versions.map(v => v.grandTotal), 1);
              const barH = (ver.grandTotal / maxTotal) * 100;
              return (
                <div key={ver.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div style={{ fontSize: 10, color: DIM, marginBottom: 4 }}>{fmt(ver.grandTotal)}</div>
                  <div style={{ width: '100%', maxWidth: 60, height: barH, background: GOLD, borderRadius: '4px 4px 0 0', minHeight: 4 }} />
                  <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>{ver.name}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  /* ─── Render: Bid Day Tab ───────────────────────────────────────── */
  const renderBidDayTab = () => (
    <div>
      <div style={{ ...cardStyle }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: GOLD }}>Bid Day Adjustments</div>
          <button style={btnStyle(GOLD, '#000')} onClick={() => setBidAdjustments(prev => [...prev, { id: uid(), description: '', amount: 0, type: 'deduct', applied: false }])}>+ Add Adjustment</button>
        </div>
        <div style={{ color: DIM, fontSize: 12, marginBottom: 16 }}>
          Last-minute adjustments to apply on bid day. These are added to or deducted from the estimate total.
        </div>
        {bidAdjustments.length === 0 && (
          <div style={{ color: DIM, fontStyle: 'italic', fontSize: 13, textAlign: 'center', padding: 24 }}>
            No bid day adjustments. Add adjustments for last-minute scope changes, sub buyouts, or value engineering items.
          </div>
        )}
        {bidAdjustments.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 40 }}>Apply</th>
                <th style={thStyle}>Description</th>
                <th style={{ ...thStyle, width: 100 }}>Type</th>
                <th style={{ ...thStyle, width: 130 }}>Amount</th>
                <th style={{ ...thStyle, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {bidAdjustments.map(adj => (
                <tr key={adj.id}>
                  <td style={tdStyle}><input type="checkbox" checked={adj.applied} onChange={e => setBidAdjustments(prev => prev.map(a => a.id === adj.id ? { ...a, applied: e.target.checked } : a))} /></td>
                  <td style={tdStyle}><input style={inputStyle} value={adj.description} onChange={e => setBidAdjustments(prev => prev.map(a => a.id === adj.id ? { ...a, description: e.target.value } : a))} placeholder="Adjustment description" /></td>
                  <td style={tdStyle}>
                    <select style={{ ...selectStyle, width: 90 }} value={adj.type} onChange={e => setBidAdjustments(prev => prev.map(a => a.id === adj.id ? { ...a, type: e.target.value as 'add' | 'deduct' } : a))}>
                      <option value="add">Add</option>
                      <option value="deduct">Deduct</option>
                    </select>
                  </td>
                  <td style={tdStyle}><input style={{ ...inputStyle, width: 110 }} type="number" value={adj.amount} onChange={e => setBidAdjustments(prev => prev.map(a => a.id === adj.id ? { ...a, amount: parseFloat(e.target.value) || 0 } : a))} /></td>
                  <td style={tdStyle}><button style={btnSmStyle(RED)} onClick={() => setBidAdjustments(prev => prev.filter(a => a.id !== adj.id))}>X</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {bidAdjustments.filter(a => a.applied).length > 0 && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: DIM, fontWeight: 600 }}>Net Bid Day Adjustment</span>
            <span style={{ fontWeight: 700, fontSize: 16, color: bidDayNet >= 0 ? GREEN : RED }}>{fmt(bidDayNet)}</span>
          </div>
        )}
      </div>
      {/* Quick reference */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, fontSize: 14, color: GOLD, marginBottom: 10 }}>Current Estimate Summary for Bid Day</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Direct Cost', value: subtotal, color: TEXT },
            { label: 'Markups', value: overheadAmt + profitAmt + contingencyAmt + bondAmt, color: AMBER },
            { label: 'Bid Day Adj.', value: bidDayNet, color: PURPLE },
            { label: 'Grand Total', value: grandTotal, color: GOLD },
          ].map(item => (
            <div key={item.label} style={{ background: BG, padding: '14px 16px', borderRadius: 6, border: `1px solid ${BORDER}`, textAlign: 'center' }}>
              <div style={{ color: DIM, fontSize: 11, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: item.color }}>{fmt(item.value)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  /* ─── Render: Templates Tab ─────────────────────────────────────── */
  const renderTemplatesTab = () => (
    <div>
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: GOLD }}>Estimate Templates</div>
        <div style={{ flex: 1 }} />
        <input style={{ ...inputStyle, width: 220 }} placeholder="Template name" value={templateName} onChange={e => setTemplateName(e.target.value)} />
        <button style={btnStyle(GREEN, '#fff')} onClick={saveTemplate} disabled={!templateName.trim()}>Save Current as Template</button>
      </div>
      {templates.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
          <div style={{ color: DIM, fontSize: 14 }}>No templates saved yet.</div>
          <div style={{ color: DIM, fontSize: 12, marginTop: 6 }}>Enter a name above and click "Save Current as Template" to save the current estimate configuration as a reusable template.</div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {templates.map(t => {
          const divCount = t.divisions.filter(d => d.items.length > 0).length;
          const itemCount = t.divisions.reduce((s, d) => s + d.items.length, 0);
          return (
            <div key={t.id} style={cardStyle}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{t.name}</div>
              <div style={{ color: DIM, fontSize: 12, marginBottom: 8 }}>{t.description}</div>
              <div style={{ fontSize: 12, color: DIM, marginBottom: 4 }}>Created: {new Date(t.createdAt).toLocaleDateString()}</div>
              <div style={{ fontSize: 12, color: DIM, marginBottom: 12 }}>{divCount} divisions | {itemCount} items</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnStyle(GOLD, '#000')} onClick={() => { loadTemplate(t); setTab('estimate'); }}>Load Template</button>
                <button style={btnSmStyle(RED)} onClick={() => setTemplates(prev => prev.filter(x => x.id !== t.id))}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ─── Main Render ───────────────────────────────────────────────── */
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'estimate', label: 'Estimate' },
    { key: 'assemblies', label: 'Assembly Library' },
    { key: 'compare', label: 'Compare' },
    { key: 'history', label: 'Version History' },
    { key: 'bidday', label: 'Bid Day' },
    { key: 'templates', label: 'Templates' },
  ];

  return (
    <div style={pageStyle}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: GOLD }}>Estimate Builder</h1>
          <div style={{ color: DIM, fontSize: 13, marginTop: 4 }}>CSI MasterFormat Division Structure | Construction Cost Estimating</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 18px', textAlign: 'center' }}>
            <div style={{ color: DIM, fontSize: 11 }}>GRAND TOTAL</div>
            <div style={{ fontWeight: 800, fontSize: 22, color: GOLD }}>{fmt(grandTotal)}</div>
          </div>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 18px', textAlign: 'center' }}>
            <div style={{ color: DIM, fontSize: 11 }}>LINE ITEMS</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: TEXT }}>{allItems.length}</div>
          </div>
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 18px', textAlign: 'center' }}>
            <div style={{ color: DIM, fontSize: 11 }}>VERSIONS</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: TEXT }}>{versions.length}</div>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} style={tabBtnStyle(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'estimate' && renderEstimateTab()}
      {tab === 'assemblies' && renderAssembliesTab()}
      {tab === 'compare' && renderCompareTab()}
      {tab === 'history' && renderHistoryTab()}
      {tab === 'bidday' && renderBidDayTab()}
      {tab === 'templates' && renderTemplatesTab()}
    </div>
  );
}
