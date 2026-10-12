'use client';

import { Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import {
  PremiumSurface,
  ModuleHero,
  SectionCard,
  StatCard,
  PremiumEmpty,
  goldButtonStyle,
  ghostButtonStyle,
  goldOutlineButtonStyle, secondaryButtonStyle
} from '@/components/ui/premium';
import {
  Stack,
  Cube,
  Plus,
  X,
  Trash,
  CurrencyDollar,
  FunnelSimple,
  SquaresFour,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import { CSI_DIVISIONS as CANONICAL_CSI_DIVISIONS } from '@/lib/construction-intelligence';

const GOLD = 'var(--brand-primary)';
const DARK = 'var(--bg-base)';
const RAISED = 'var(--bg-surface)';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = 'var(--text-secondary)';
const TEXT = 'var(--text-primary)';
// Premium translucent surface gradient (matches the cinematic kit's SectionCard/StatCard).
const SURFACE = 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))';

// Division code -> display name, derived from THE canonical CSI taxonomy
// (plus Div 25, which the canonical map doesn't carry yet).
const CSI_DIVISIONS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(CANONICAL_CSI_DIVISIONS).map(([code, d]) => [code, d.name])),
  '25': 'Integrated Automation',
};

const UNITS = ['EA', 'LF', 'SF', 'SY', 'CY', 'TON', 'GAL', 'HR'] as const;
const CATEGORIES = ['labor', 'material', 'equipment', 'subcontract'] as const;

interface MaterialItem {
  description: string;
  qty: number;
  unit: string;
  unit_cost: number;
}

interface Assembly {
  id: string;
  name: string;
  description: string;
  csi_division: string;
  csi_code: string;
  category: string;
  unit: string;
  default_quantity: number;
  material_items: MaterialItem[];
  labor_hours: number;
  labor_rate: number;
  total_material_cost: number;
  total_labor_cost: number;
  total_cost: number;
  created_at: string;
  updated_at: string;
}

type FormData = Omit<Assembly, 'id' | 'total_material_cost' | 'total_labor_cost' | 'total_cost' | 'created_at' | 'updated_at'>;

function currency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function emptyForm(): FormData {
  return {
    name: '',
    description: '',
    csi_division: '03',
    csi_code: '',
    category: 'material',
    unit: 'EA',
    default_quantity: 1,
    material_items: [{ description: '', qty: 1, unit: 'EA', unit_cost: 0 }],
    labor_hours: 0,
    labor_rate: 75,
  };
}

function calcTotals(form: FormData) {
  const totalMaterial = form.material_items.reduce((sum, item) => sum + item.qty * item.unit_cost, 0);
  const totalLabor = form.labor_hours * form.labor_rate;
  return { totalMaterial, totalLabor, totalCost: totalMaterial + totalLabor };
}

function AssemblyLibraryContent() {
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDivision, setFilterDivision] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchAssemblies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/takeoff-assemblies/list');
      if (res.ok) {
        const data = await res.json();
        // Guard the shape — a non-array here would crash the next assemblies.filter().
        setAssemblies(Array.isArray(data.assemblies) ? data.assemblies : (Array.isArray(data) ? data : []));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssemblies();
  }, [fetchAssemblies]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setConfirmDelete(false);
    setPanelOpen(true);
  };

  const openEdit = (assembly: Assembly) => {
    setEditingId(assembly.id);
    setForm({
      name: assembly.name,
      description: assembly.description || '',
      csi_division: assembly.csi_division || '03',
      csi_code: assembly.csi_code || '',
      category: assembly.category || 'material',
      unit: assembly.unit || 'EA',
      default_quantity: assembly.default_quantity || 1,
      material_items: assembly.material_items?.length
        ? assembly.material_items
        : [{ description: '', qty: 1, unit: 'EA', unit_cost: 0 }],
      labor_hours: assembly.labor_hours || 0,
      labor_rate: assembly.labor_rate || 75,
    });
    setConfirmDelete(false);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingId(null);
    setConfirmDelete(false);
  };

  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const updateMaterialItem = (idx: number, key: keyof MaterialItem, value: string | number) => {
    setForm(prev => {
      const items = [...prev.material_items];
      items[idx] = { ...items[idx], [key]: value };
      return { ...prev, material_items: items };
    });
  };

  const addMaterialItem = () => {
    setForm(prev => ({
      ...prev,
      material_items: [...prev.material_items, { description: '', qty: 1, unit: 'EA', unit_cost: 0 }],
    }));
  };

  const removeMaterialItem = (idx: number) => {
    setForm(prev => ({
      ...prev,
      material_items: prev.material_items.filter((_, i) => i !== idx),
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const { totalMaterial, totalLabor, totalCost } = calcTotals(form);
      const body = {
        ...form,
        total_material_cost: totalMaterial,
        total_labor_cost: totalLabor,
        total_cost: totalCost,
      };
      const url = editingId
        ? `/api/takeoff-assemblies/${editingId}`
        : '/api/takeoff-assemblies/create';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await fetchAssemblies();
        closePanel();
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/takeoff-assemblies/${editingId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchAssemblies();
        closePanel();
      }
    } catch {
      // silent
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const { totalMaterial, totalLabor, totalCost } = useMemo(() => calcTotals(form), [form]);

  // Memoized so the full assembly grid isn't re-filtered + re-rendered on every
  // unrelated render (e.g. side-panel edits); only recomputes when inputs change.
  const filtered = useMemo(() => (Array.isArray(assemblies) ? assemblies : []).filter(a => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !a.name.toLowerCase().includes(q) &&
        !(a.description || '').toLowerCase().includes(q) &&
        !(a.csi_code || '').toLowerCase().includes(q)
      ) return false;
    }
    if (filterDivision && a.csi_division !== filterDivision) return false;
    if (filterCategory && a.category !== filterCategory) return false;
    return true;
  }), [assemblies, search, filterDivision, filterCategory]);

  // Library-level KPIs derived from the loaded assemblies (no extra fetching).
  const libStats = useMemo(() => {
    const list = Array.isArray(assemblies) ? assemblies : [];
    const totalValue = list.reduce((s, a) => s + (a.total_cost || 0), 0);
    const divisions = new Set(list.map(a => a.csi_division).filter(Boolean)).size;
    return { count: list.length, totalValue, divisions };
  }, [assemblies]);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    background: DARK,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    color: TEXT,
    fontSize: 13,
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    color: DIM,
    marginBottom: 4,
    fontWeight: 600,

  };

  return (
    <>
      {/* Content shifts left when the edit/create panel is open (behavior preserved). */}
      <div style={{ transition: 'margin-right 0.3s ease', marginRight: panelOpen ? 480 : 0 }}>
        <PremiumSurface maxWidth={2200}>
          {/* Header */}
          <ModuleHero
            eyebrow="Assembly Library"
            eyebrowIcon={<Cube size={13} weight="fill" color="var(--text-secondary)" />}
            title="Assembly"
            accent="Library"
            subtitle="Create reusable material + labor bundles for takeoff estimates."
            actions={
              <button onClick={openCreate} style={goldButtonStyle} className="pmBtn">
                <Plus size={15} weight="bold" /> New Assembly
              </button>
            }
          />

          {/* KPI Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            <StatCard
              icon={<Stack size={19} weight="duotone" color="var(--text-secondary)" />}
              label="Assemblies" value={String(libStats.count)} sub="In library" accent={GOLD} delay={0.02}
             href="/app/takeoff/assemblies"/>
            <StatCard
              icon={<CurrencyDollar size={19} weight="duotone" color="var(--text-secondary)" />}
              label="Library Value" value={currency(libStats.totalValue)} sub="Total assembly cost" delay={0.06}
             href="/app/takeoff/assemblies"/>
            <StatCard
              icon={<SquaresFour size={19} weight="duotone" color="var(--text-secondary)" />}
              label="CSI Divisions" value={String(libStats.divisions)} sub="Covered" delay={0.10}
             href="/app/takeoff/assemblies"/>
            <StatCard
              icon={<FunnelSimple size={19} weight="duotone" color="var(--text-secondary)" />}
              label="Showing" value={String(filtered.length)} sub={`Of ${libStats.count} assemblies`} delay={0.14}
             href="/app/takeoff/assemblies"/>
          </div>

          {/* Catalog */}
          <SectionCard
            title="Assembly Catalog"
            icon={<Stack size={17} weight="duotone" color="var(--text-secondary)" />}
            action={
              <span style={{ fontSize: 12, fontWeight: 700, color: DIM }}>
                {filtered.length} {filtered.length === 1 ? 'assembly' : 'assemblies'}
              </span>
            }
          >
            {/* Search & Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search assemblies…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 220,
                  padding: '10px 14px',
                  background: RAISED,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  color: TEXT,
                  fontSize: 14,
                  outline: 'none',
                }}
              />
              <select
                value={filterDivision}
                onChange={e => setFilterDivision(e.target.value)}
                style={{
                  padding: '10px 14px',
                  background: RAISED,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  color: TEXT,
                  fontSize: 13,
                  outline: 'none',
                  minWidth: 180,
                }}
              >
                <option value="">All Divisions</option>
                {Object.entries(CSI_DIVISIONS).map(([code, name]) => (
                  <option key={code} value={code}>Div {code} - {name}</option>
                ))}
              </select>
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                style={{
                  padding: '10px 14px',
                  background: RAISED,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  color: TEXT,
                  fontSize: 13,
                  outline: 'none',
                  minWidth: 140,
                }}
              >
                <option value="">All Categories</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>

            {/* Grid */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: DIM }}>Loading assemblies…</div>
            ) : filtered.length === 0 ? (
              assemblies.length === 0 ? (
                <PremiumEmpty
                  icon={<Stack size={30} weight="duotone" color="var(--text-secondary)" />}
                  title="No assemblies yet"
                  description="Create your first assembly to build reusable material + labor bundles for takeoff estimates."
                  action={
                    <button onClick={openCreate} style={secondaryButtonStyle} className="pmBtn">
                      <Plus size={15} weight="bold" /> New Assembly
                    </button>
                  }
                />
              ) : (
                <PremiumEmpty
                  icon={<MagnifyingGlass size={30} weight="duotone" color="var(--text-secondary)" />}
                  title="No assemblies match your filters"
                  description="Try adjusting your search terms, division, or category to see more results."
                  action={
                    <button
                      onClick={() => { setSearch(''); setFilterDivision(''); setFilterCategory(''); }}
                      style={goldOutlineButtonStyle}
                      className="pmBtn"
                    >
                      Clear filters
                    </button>
                  }
                />
              )
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {filtered.map(assembly => {
                  const divName = CSI_DIVISIONS[assembly.csi_division] || `Division ${assembly.csi_division}`;
                  const itemCount = assembly.material_items?.length || 0;
                  return (
                    <div
                      key={assembly.id}
                      onClick={() => openEdit(assembly)}
                      style={{
                        background: SURFACE,
                        border: `1px solid ${BORDER}`,
                        borderRadius: 16,
                        padding: 20,
                        cursor: 'pointer',
                        boxShadow: '0 10px 30px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLDivElement).style.borderColor = GOLD;
                        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 1px color-mix(in srgb, ${GOLD} 25%, transparent), 0 14px 34px -18px rgba(0,0,0,0.7)`;
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLDivElement).style.borderColor = BORDER;
                        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 10px 30px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: 0, lineHeight: '1.3' }}>
                          {assembly.name}
                        </h3>
                        <span style={{
                          fontSize: 12,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: `color-mix(in srgb, ${GOLD} 13%, transparent)`,
                          color: 'var(--text-primary)',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          marginLeft: 8,
                          textTransform: 'capitalize',
                        }}>
                          {assembly.category || 'material'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: DIM, marginBottom: 12 }}>
                        Div {assembly.csi_division} — {divName}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: 16 }}>
                          <div>
                            <div style={{ fontSize: 12, color: DIM}}>Unit</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{assembly.unit}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 12, color: DIM}}>Items</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{itemCount}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 12, color: DIM}}>Total Cost</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{currency(assembly.total_cost)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </PremiumSurface>
      </div>

      {/* Side Panel */}
      {panelOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 480,
          height: '100vh',
          background: DARK,
          borderLeft: `1px solid ${BORDER}`,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 50,
          boxShadow: '-4px 0 24px rgba(0,0,0,0.4)',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '20px 24px',
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
              {editingId ? 'Edit Assembly' : 'New Assembly'}
            </h2>
            <button
              onClick={closePanel}
              aria-label="Close"
              style={{
                background: 'none',
                border: 'none',
                color: DIM,
                cursor: 'pointer',
                padding: '4px 8px',
                lineHeight: 1,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          {/* Panel body */}
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
            {/* Name */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => updateField('name', e.target.value)}
                placeholder="e.g. CMU Block Wall 8-inch"
                style={inputStyle}
              />
            </div>

            {/* Description */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Description</label>
              <textarea
                value={form.description}
                onChange={e => updateField('description', e.target.value)}
                placeholder="Optional description…"
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' as const }}
              />
            </div>

            {/* CSI Division + Code */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>CSI Division</label>
                <select
                  value={form.csi_division}
                  onChange={e => updateField('csi_division', e.target.value)}
                  style={inputStyle}
                >
                  {Object.entries(CSI_DIVISIONS).map(([code, name]) => (
                    <option key={code} value={code}>Div {code} - {name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>CSI Code</label>
                <input
                  type="text"
                  value={form.csi_code}
                  onChange={e => updateField('csi_code', e.target.value)}
                  placeholder="03 30 00"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Category + Unit */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Category</label>
                <select
                  value={form.category}
                  onChange={e => updateField('category', e.target.value)}
                  style={inputStyle}
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Unit</label>
                <select
                  value={form.unit}
                  onChange={e => updateField('unit', e.target.value)}
                  style={inputStyle}
                >
                  {UNITS.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Default Quantity */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Default Quantity</label>
              <input
                type="number"
                value={form.default_quantity}
                onChange={e => updateField('default_quantity', parseFloat(e.target.value) || 0)}
                min={0}
                step={1}
                style={{ ...inputStyle, width: 120 }}
              />
            </div>

            {/* Material Items */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Material Items</label>
                <button
                  onClick={addMaterialItem}
                  style={{ ...goldOutlineButtonStyle, padding: '5px 12px', fontSize: 12, borderRadius: 8 }}
                >
                  <Plus size={13} weight="bold" /> Add Item
                </button>
              </div>

              {form.material_items.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: RAISED,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: DIM, fontWeight: 600 }}>Item {idx + 1}</span>
                    {form.material_items.length > 1 && (
                      <button
                        onClick={() => removeMaterialItem(idx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--danger)',
                          fontSize: 12,
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Description"
                    value={item.description}
                    onChange={e => updateMaterialItem(idx, 'description', e.target.value)}
                    style={{ ...inputStyle, marginBottom: 8 }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 12, color: DIM }}>Qty</label>
                      <input
                        type="number"
                        value={item.qty}
                        onChange={e => updateMaterialItem(idx, 'qty', parseFloat(e.target.value) || 0)}
                        min={0}
                        step={0.01}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: DIM }}>Unit</label>
                      <select
                        value={item.unit}
                        onChange={e => updateMaterialItem(idx, 'unit', e.target.value)}
                        style={inputStyle}
                      >
                        {UNITS.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: DIM }}>Unit Cost</label>
                      <input
                        type="number"
                        value={item.unit_cost}
                        onChange={e => updateMaterialItem(idx, 'unit_cost', parseFloat(e.target.value) || 0)}
                        min={0}
                        step={0.01}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', marginTop: 6, fontSize: 12, color: DIM }}>
                    Subtotal: <span style={{ color: TEXT, fontWeight: 600 }}>{currency(item.qty * item.unit_cost)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Labor */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>Labor Hours</label>
                <input
                  type="number"
                  value={form.labor_hours}
                  onChange={e => updateField('labor_hours', parseFloat(e.target.value) || 0)}
                  min={0}
                  step={0.25}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Labor Rate ($/hr)</label>
                <input
                  type="number"
                  value={form.labor_rate}
                  onChange={e => updateField('labor_rate', parseFloat(e.target.value) || 0)}
                  min={0}
                  step={1}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Cost Summary */}
            <div style={{
              background: SURFACE,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              padding: 16,
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 12, color: DIM, marginBottom: 10, fontWeight: 600 }}>
                Cost Summary
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: DIM }}>Material Cost</span>
                <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{currency(totalMaterial)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: DIM }}>Labor Cost</span>
                <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{currency(totalLabor)}</span>
              </div>
              <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, color: TEXT, fontWeight: 700 }}>Total Cost</span>
                <span style={{ fontSize: 16, color: 'var(--text-primary)', fontWeight: 700 }}>{currency(totalCost)}</span>
              </div>
            </div>
          </div>

          {/* Panel footer */}
          <div style={{
            padding: '16px 24px',
            borderTop: `1px solid ${BORDER}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}>
            {editingId ? (
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '10px 16px',
                  background: confirmDelete ? 'var(--danger)' : 'transparent',
                  color: confirmDelete ? 'var(--text-primary)' : 'var(--danger)',
                  border: `1px solid ${confirmDelete ? 'var(--danger)' : '#e06c7560'}`,
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                <Trash size={14} weight="bold" />
                {deleting ? 'Deleting…' : confirmDelete ? 'Confirm Delete' : 'Delete'}
              </button>
            ) : (
              <div />
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={closePanel} style={ghostButtonStyle} className="pmBtn">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                style={{
                  ...goldButtonStyle,
                  cursor: saving || !form.name.trim() ? 'not-allowed' : 'pointer',
                  opacity: saving || !form.name.trim() ? 0.5 : 1,
                }}
                className="pmBtn"
              >
                {saving ? 'Saving…' : editingId ? 'Update Assembly' : 'Create Assembly'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function AssemblyLibraryPage() {
  return (
    <Suspense fallback={<AssemblyLibraryLoading />}>
      <AssemblyLibraryContent />
    </Suspense>
  );
}

function AssemblyLibraryLoading() {
  return (
    <div style={{ minHeight: '100vh', color: TEXT }}>
      <div style={{
        position: 'fixed', top: 56, left: 0, right: 0, height: 3, zIndex: 100,
        background: `linear-gradient(90deg, transparent 0%, ${GOLD} 50%, transparent 100%)`,
        animation: 'shimmer 1.5s infinite',
      }} />
      <style>{`@keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }`}</style>
      <div style={{ padding: '40px 28px', maxWidth: 2200, margin: '0 auto' }}>
        <div style={{ height: 44, width: 280, background: SURFACE, borderRadius: 8, marginBottom: 10 }} />
        <div style={{ height: 16, width: 320, background: SURFACE, borderRadius: 4, marginBottom: 24 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: SURFACE, borderRadius: 16, height: 96, border: `1px solid rgba(255,255,255,0.08)` }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ background: SURFACE, borderRadius: 16, height: 140, border: `1px solid rgba(255,255,255,0.08)` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
