'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';

const GOLD = '#C8960F';
const DARK = '#F8F9FB';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const DIM = '#6B7280';
const TEXT = '#111827';

const CSI_DIVISIONS: Record<string, string> = {
  '01': 'General Requirements',
  '02': 'Existing Conditions',
  '03': 'Concrete',
  '04': 'Masonry',
  '05': 'Metals',
  '06': 'Wood, Plastics, Composites',
  '07': 'Thermal & Moisture Protection',
  '08': 'Openings',
  '09': 'Finishes',
  '10': 'Specialties',
  '11': 'Equipment',
  '12': 'Furnishings',
  '13': 'Special Construction',
  '14': 'Conveying Equipment',
  '21': 'Fire Suppression',
  '22': 'Plumbing',
  '23': 'HVAC',
  '25': 'Integrated Automation',
  '26': 'Electrical',
  '27': 'Communications',
  '28': 'Electronic Safety & Security',
  '31': 'Earthwork',
  '32': 'Exterior Improvements',
  '33': 'Utilities',
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
        setAssemblies(data.assemblies || data || []);
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

  const { totalMaterial, totalLabor, totalCost } = calcTotals(form);

  const filtered = assemblies.filter(a => {
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
  });

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
    fontSize: 11,
    color: DIM,
    marginBottom: 4,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  };

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: '100vh', background: DARK, color: TEXT }}>
      {/* Main content */}
      <div style={{ flex: 1, padding: '32px 40px', overflow: 'auto', transition: 'margin-right 0.3s ease', marginRight: panelOpen ? 480 : 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: TEXT, margin: 0 }}>Assembly Library</h1>
            <p style={{ fontSize: 13, color: DIM, margin: '4px 0 0' }}>
              Create reusable material + labor bundles for takeoff estimates
            </p>
          </div>
          <button
            onClick={openCreate}
            style={{
              padding: '10px 20px',
              background: GOLD,
              color: '#000',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            + New Assembly
          </button>
        </div>

        {/* Search & Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search assemblies..."
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
          <div style={{ textAlign: 'center', padding: 60, color: DIM }}>Loading assemblies...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
            {assemblies.length === 0 ? 'No assemblies yet. Create your first assembly to get started.' : 'No assemblies match your filters.'}
          </div>
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
                    background: RAISED,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 10,
                    padding: 20,
                    cursor: 'pointer',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = GOLD;
                    (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 1px ${GOLD}40`;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = BORDER;
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: 0, lineHeight: '1.3' }}>
                      {assembly.name}
                    </h3>
                    <span style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: `${GOLD}20`,
                      color: GOLD,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      marginLeft: 8,
                    }}>
                      {assembly.category || 'material'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: DIM, marginBottom: 12 }}>
                    Div {assembly.csi_division} - {divName}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Unit</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{assembly.unit}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Items</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{itemCount}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Cost</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: GOLD }}>{currency(assembly.total_cost)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
            <h2 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: 0 }}>
              {editingId ? 'Edit Assembly' : 'New Assembly'}
            </h2>
            <button
              onClick={closePanel}
              style={{
                background: 'none',
                border: 'none',
                color: DIM,
                fontSize: 22,
                cursor: 'pointer',
                padding: '4px 8px',
                lineHeight: 1,
              }}
            >
              x
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
                placeholder="Optional description..."
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
                  style={{
                    padding: '4px 12px',
                    background: `${GOLD}20`,
                    color: GOLD,
                    border: `1px solid ${GOLD}40`,
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  + Add Item
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
                    <span style={{ fontSize: 11, color: DIM, fontWeight: 600 }}>Item {idx + 1}</span>
                    {form.material_items.length > 1 && (
                      <button
                        onClick={() => removeMaterialItem(idx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#e06c75',
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
                      <label style={{ fontSize: 10, color: DIM }}>Qty</label>
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
                      <label style={{ fontSize: 10, color: DIM }}>Unit</label>
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
                      <label style={{ fontSize: 10, color: DIM }}>Unit Cost</label>
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
              background: RAISED,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              padding: 16,
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, fontWeight: 600 }}>
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
                <span style={{ fontSize: 16, color: GOLD, fontWeight: 700 }}>{currency(totalCost)}</span>
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
                  padding: '10px 16px',
                  background: confirmDelete ? '#e06c75' : 'transparent',
                  color: confirmDelete ? '#fff' : '#e06c75',
                  border: `1px solid ${confirmDelete ? '#e06c75' : '#e06c7560'}`,
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? 'Deleting...' : confirmDelete ? 'Confirm Delete' : 'Delete'}
              </button>
            ) : (
              <div />
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={closePanel}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  color: DIM,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                style={{
                  padding: '10px 24px',
                  background: GOLD,
                  color: '#000',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: saving || !form.name.trim() ? 'not-allowed' : 'pointer',
                  opacity: saving || !form.name.trim() ? 0.5 : 1,
                }}
              >
                {saving ? 'Saving...' : editingId ? 'Update Assembly' : 'Create Assembly'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
    <div style={{ background: DARK, minHeight: '100vh', color: TEXT }}>
      <div style={{
        position: 'fixed', top: 56, left: 0, right: 0, height: 3, zIndex: 100,
        background: `linear-gradient(90deg, transparent 0%, ${GOLD} 50%, transparent 100%)`,
        animation: 'shimmer 1.5s infinite',
      }} />
      <style>{`@keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }`}</style>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ height: 28, width: 200, background: RAISED, borderRadius: 6, marginBottom: 8 }} />
        <div style={{ height: 16, width: 320, background: RAISED, borderRadius: 4, marginBottom: 24 }} />
        <div style={{ height: 44, background: RAISED, borderRadius: 8, marginBottom: 24 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ background: RAISED, borderRadius: 10, height: 140, border: `1px solid ${BORDER}` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
