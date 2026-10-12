'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useProjects } from '@/lib/hooks/useProjects';
import { Package, FolderOpen, X, CaretUp, CaretDown, Gear, SquaresFour, GridFour } from '@phosphor-icons/react';
import { WIDGET_CATALOG, WidgetBody, useWidgetMetrics, type WidgetSettings } from '@/components/dashboard-widgets';
import { PremiumSurface, ModuleHero, SectionCard, PremiumEmpty, StatStrip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';

/* ─── Colors ────────────────────────────────────────────────────────── */
const GOLD   = 'var(--brand-primary)';
const BG     = 'var(--bg-base)';
const RAISED = 'var(--bg-surface)';
const BORDER = 'rgba(255,255,255,0.12)';
const TEXT   = 'var(--text-primary)';
const DIM    = 'var(--text-secondary)';
const GREEN  = '#4ADE80';
const RED    = '#F87171';
const AMBER  = 'var(--warning)';
const BLUE   = 'var(--brand-primary)';
const PURPLE = 'var(--warning)';

/* ─── Types ─────────────────────────────────────────────────────────── */
/* WidgetSettings + the widget catalog are imported from components/dashboard-widgets. */
type WidgetSize = 'small' | 'medium' | 'large' | 'full-width';

interface WidgetInstance {
  id: string;
  catalogId: string;
  size: WidgetSize;
  settings: WidgetSettings;
}

interface DashboardLayout {
  id?: string;
  name: string;
  columns: 2 | 3 | 4;
  widgets: WidgetInstance[];
  preset?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface SavedLayoutSummary {
  id: string;
  name: string;
  preset?: string;
  widgetCount: number;
  updatedAt: string;
}

/* ─── Widget Catalog + WidgetSettings come from components/dashboard-widgets ── */

/* ─── Layout Presets ────────────────────────────────────────────────── */
interface LayoutPreset {
  key: string;
  name: string;
  description: string;
  columns: 2 | 3 | 4;
  widgets: Omit<WidgetInstance, 'id'>[];
}

const PRESETS: LayoutPreset[] = [
  {
    key: 'executive',
    name: 'Executive',
    description: 'High-level KPIs for leadership: financials, status, and safety overview',
    columns: 3,
    widgets: [
      { catalogId: 'project-summary',      size: 'medium',     settings: {} },
      { catalogId: 'budget-overview',       size: 'large',      settings: { dateRange: 'quarter' } },
      { catalogId: 'change-order-summary',  size: 'medium',     settings: {} },
      { catalogId: 'safety-metrics',        size: 'medium',     settings: { dateRange: 'month' } },
      { catalogId: 'schedule-status',       size: 'full-width', settings: { dateRange: 'month' } },
    ],
  },
  {
    key: 'project-manager',
    name: 'Project Manager',
    description: 'Day-to-day operations: RFIs, submittals, deadlines, and action items',
    columns: 3,
    widgets: [
      { catalogId: 'project-summary',    size: 'medium',     settings: {} },
      { catalogId: 'rfi-tracker',        size: 'medium',     settings: {} },
      { catalogId: 'submittal-status',   size: 'medium',     settings: {} },
      { catalogId: 'upcoming-deadlines', size: 'large',      settings: { dateRange: 'week' } },
      { catalogId: 'action-items',       size: 'medium',     settings: { showCompleted: false } },
      { catalogId: 'team-activity',      size: 'medium',     settings: { limit: 10 } },
      { catalogId: 'budget-overview',    size: 'full-width', settings: { dateRange: 'quarter' } },
    ],
  },
  {
    key: 'superintendent',
    name: 'Superintendent',
    description: 'Field-focused: weather, safety, photos, schedule, and punch lists',
    columns: 2,
    widgets: [
      { catalogId: 'weather',            size: 'large',      settings: { location: '' } },
      { catalogId: 'safety-metrics',     size: 'medium',     settings: { dateRange: 'month' } },
      { catalogId: 'schedule-status',    size: 'large',      settings: { dateRange: 'week' } },
      { catalogId: 'photo-feed',         size: 'full-width', settings: { limit: 6 } },
      { catalogId: 'action-items',       size: 'medium',     settings: { showCompleted: false } },
      { catalogId: 'upcoming-deadlines', size: 'medium',     settings: { dateRange: 'week' } },
    ],
  },
  {
    key: 'custom',
    name: 'Custom',
    description: 'Start with a blank canvas and add the widgets you need',
    columns: 3,
    widgets: [],
  },
];

/* ─── Default Layout ────────────────────────────────────────────────── */
const DEFAULT_LAYOUT: DashboardLayout = {
  name: 'My Dashboard',
  columns: 3,
  widgets: [
    { id: 'w-1', catalogId: 'project-summary',    size: 'medium',     settings: {} },
    { id: 'w-2', catalogId: 'budget-overview',     size: 'large',      settings: { dateRange: 'quarter' } },
    { id: 'w-3', catalogId: 'rfi-tracker',         size: 'small',      settings: {} },
    { id: 'w-4', catalogId: 'upcoming-deadlines',  size: 'medium',     settings: { dateRange: 'week' } },
    { id: 'w-5', catalogId: 'safety-metrics',      size: 'small',      settings: { dateRange: 'month' } },
  ],
};

let _nextId = 100;
function genId(): string {
  return `w-${++_nextId}-${Date.now().toString(36)}`;
}

/* ─── Size helpers ──────────────────────────────────────────────────── */
const SIZE_LABELS: Record<WidgetSize, string> = {
  small: '1 Col',
  medium: '2 Col',
  large: '3 Col',
  'full-width': 'Full Width',
};

function sizeToColSpan(size: WidgetSize, columns: number): number {
  switch (size) {
    case 'small':      return 1;
    case 'medium':     return Math.min(2, columns);
    case 'large':      return Math.min(3, columns);
    case 'full-width': return columns;
  }
}

const SIZES: WidgetSize[] = ['small', 'medium', 'large', 'full-width'];

/* ─── Shared Styles ─────────────────────────────────────────────────── */
const pill = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  borderRadius: 6,
  border: `1px solid ${active ? GOLD : BORDER}`,
  background: active ? GOLD : 'transparent',
  color: active ? 'var(--on-brand)' : DIM,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  transition: 'all .15s',
});

const btnStyle = (variant: 'primary' | 'secondary' | 'danger' | 'ghost' = 'primary'): React.CSSProperties => ({
  padding: '8px 18px',
  borderRadius: 6,
  border: variant === 'secondary' || variant === 'ghost' ? `1px solid ${BORDER}` : 'none',
  background: variant === 'primary' ? GOLD : variant === 'danger' ? RED : 'transparent',
  color: variant === 'primary' ? 'var(--on-brand)' : variant === 'danger' ? 'var(--text-primary)' : DIM,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  transition: 'all .15s',
});

const cardStyle: React.CSSProperties = {
  background: RAISED,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  padding: 16,
};

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  border: `1px solid ${BORDER}`,
  background: BG,
  color: TEXT,
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box' as const,
};

const miniBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 5,
  border: `1px solid ${BORDER}`,
  background: BG,
  color: DIM,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  padding: 0,
  lineHeight: 1,
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: RAISED,
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: 28,
  maxWidth: 540,
  width: '90vw',
  maxHeight: '85vh',
  overflowY: 'auto' as const,
  boxShadow: 'var(--shadow-lg)',
};

/* ─── Setting Group Component ───────────────────────────────────────── */
function SettingGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

/* ─── Component ─────────────────────────────────────────────────────── */
export default function DashboardConfigPage() {
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [savedLayout, setSavedLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');

  /* Modals */
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [configWidgetId, setConfigWidgetId] = useState<string | null>(null);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [saveAsModalOpen, setSaveAsModalOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');

  /* Saved layouts list */
  const [savedLayouts, setSavedLayouts] = useState<SavedLayoutSummary[]>([]);
  const [loadingLayouts, setLoadingLayouts] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /* Real tenant projects — populate the per-widget "Project Filter" dropdown
     with the user's actual projects (never fabricated placeholder names). */
  const { projects: liveProjects } = useProjects();
  const projectOptions = useMemo(
    () =>
      (liveProjects as any[])
        .map((p: any) => ({ id: String(p.id ?? ''), name: String(p.name ?? p.project_name ?? 'Untitled') }))
        .filter((p) => p.id),
    [liveProjects],
  );

  /* ── Live tenant metrics powering the widget previews ── */
  const { metrics, loading: metricsLoading } = useWidgetMetrics();

  /* ── Fetch current (active) layout — GET returns { layout } ── */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/dashboard-layout');
        if (res.ok) {
          const data = await res.json();
          const l = data?.layout;
          if (l && Array.isArray(l.widgets) && l.widgets.length) {
            setLayout(l);
            setSavedLayout(l);
          }
        }
      } catch {
        /* use default */
      }
      setLoading(false);
    })();
  }, []);

  /* ── Fetch saved layouts list ── */
  const fetchSavedLayouts = useCallback(async () => {
    setLoadingLayouts(true);
    try {
      const res = await fetch('/api/dashboard-layout/list');
      if (res.ok) {
        const data = await res.json();
        setSavedLayouts(Array.isArray(data) ? data : []);
      }
    } catch {
      setSavedLayouts([]);
    }
    setLoadingLayouts(false);
  }, []);

  /* ── Dirty check ── */
  const isDirty = useMemo(() => JSON.stringify(layout) !== JSON.stringify(savedLayout), [layout, savedLayout]);

  /* ── Save current layout ── */
  const handleSave = async () => {
    if (!layout.name.trim()) {
      setError('Please enter a layout name before saving.');
      return;
    }
    setSaving(true);
    setSaveMsg('');
    setError('');
    try {
      const res = await fetch('/api/dashboard-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(layout),
      });
      if (!res.ok) throw new Error('Save failed');
      const saved = await res.json();
      const savedId = saved?.layout?.id ?? layout.id;
      const updated = { ...layout, id: savedId, updatedAt: new Date().toISOString() };
      setLayout(updated);
      setSavedLayout(updated);
      setSaveMsg('Layout saved successfully');
    } catch {
      setError('Failed to save layout. Please try again.');
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 3000);
  };

  /* ── Save As new layout ── */
  const handleSaveAs = async () => {
    if (!saveAsName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const newLayout = { ...layout, id: undefined, name: saveAsName.trim() };
      const res = await fetch('/api/dashboard-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLayout),
      });
      if (!res.ok) throw new Error('Save failed');
      const saved = await res.json();
      const updated = { ...newLayout, id: saved?.layout?.id, updatedAt: new Date().toISOString() };
      setLayout(updated);
      setSavedLayout(updated);
      setSaveMsg(`Layout "${saveAsName.trim()}" saved`);
      setSaveAsModalOpen(false);
      setSaveAsName('');
    } catch {
      setError('Failed to save layout.');
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 3000);
  };

  /* ── Load a saved layout ── */
  const handleLoadLayout = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/dashboard-layout/${id}`);
      if (!res.ok) throw new Error('Load failed');
      const data = await res.json();
      setLayout(data);
      setSavedLayout(data);
      setLoadModalOpen(false);
      setSaveMsg(`Layout "${data.name}" loaded`);
    } catch {
      setError('Failed to load layout.');
    }
    setLoading(false);
    setTimeout(() => setSaveMsg(''), 3000);
  };

  /* ── Delete a saved layout ── */
  const handleDeleteLayout = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/dashboard-layout/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setSavedLayouts(prev => prev.filter(l => l.id !== id));
    } catch {
      setError('Failed to delete layout.');
    }
    setDeletingId(null);
  };

  /* ── Reset to default ── */
  const handleReset = () => {
    setLayout({
      ...DEFAULT_LAYOUT,
      name: 'My Dashboard',
      widgets: DEFAULT_LAYOUT.widgets.map(w => ({ ...w, id: genId() })),
    });
    setConfigWidgetId(null);
    setConfirmResetOpen(false);
  };

  /* ── Add widget ── */
  const addWidget = (catalogId: string) => {
    const cat = WIDGET_CATALOG.find(c => c.id === catalogId);
    if (!cat) return;
    const newW: WidgetInstance = {
      id: genId(),
      catalogId,
      size: 'small',
      settings: { ...cat.defaultSettings },
    };
    setLayout(prev => ({ ...prev, widgets: [...prev.widgets, newW] }));
  };

  /* ── Remove widget ── */
  const removeWidget = (id: string) => {
    setLayout(prev => ({ ...prev, widgets: prev.widgets.filter(w => w.id !== id) }));
    if (configWidgetId === id) setConfigWidgetId(null);
  };

  /* ── Reorder (move up / down) ── */
  const moveWidget = (id: string, direction: 'up' | 'down') => {
    setLayout(prev => {
      const idx = prev.widgets.findIndex(w => w.id === id);
      if (idx < 0) return prev;
      const arr = [...prev.widgets];
      const targetIdx = direction === 'up' ? Math.max(0, idx - 1) : Math.min(arr.length - 1, idx + 1);
      if (targetIdx === idx) return prev;
      const [item] = arr.splice(idx, 1);
      arr.splice(targetIdx, 0, item);
      return { ...prev, widgets: arr };
    });
  };

  /* ── Drag to reorder (grab the handle, drop on another card) ── */
  const [dragId, setDragId] = useState<string | null>(null);
  const reorderTo = (targetId: string) => {
    setLayout(prev => {
      if (!dragId || dragId === targetId) return prev;
      const arr = [...prev.widgets];
      const from = arr.findIndex(w => w.id === dragId);
      const to = arr.findIndex(w => w.id === targetId);
      if (from < 0 || to < 0) return prev;
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return { ...prev, widgets: arr };
    });
  };

  /* ── Change widget size ── */
  const setWidgetSize = (id: string, size: WidgetSize) => {
    setLayout(prev => ({
      ...prev,
      widgets: prev.widgets.map(w => w.id === id ? { ...w, size } : w),
    }));
  };

  /* ── Update widget settings ── */
  const updateWidgetSettings = (id: string, settings: Partial<WidgetSettings>) => {
    setLayout(prev => ({
      ...prev,
      widgets: prev.widgets.map(w => w.id === id ? { ...w, settings: { ...w.settings, ...settings } } : w),
    }));
  };

  /* ── Apply preset ── */
  const applyPreset = (preset: LayoutPreset) => {
    setLayout({
      name: layout.name || 'My Dashboard',
      columns: preset.columns,
      preset: preset.key,
      widgets: preset.widgets.map(w => ({ ...w, id: genId() })),
    });
    setPresetModalOpen(false);
    setConfigWidgetId(null);
  };

  /* ── Catalog categories ── */
  const categories = useMemo(() => {
    const cats = Array.from(new Set(WIDGET_CATALOG.map(w => w.category)));
    return ['all', ...cats];
  }, []);

  /* ── Filtered catalog ── */
  const filteredCatalog = useMemo(() => {
    return WIDGET_CATALOG.filter(w => {
      const matchCat = catalogFilter === 'all' || w.category === catalogFilter;
      const matchSearch = !searchTerm || w.name.toLowerCase().includes(searchTerm.toLowerCase()) || w.description.toLowerCase().includes(searchTerm.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [catalogFilter, searchTerm]);

  /* ── Active widget counts ── */
  const activeWidgetIds = useMemo(() => {
    const map: Record<string, number> = {};
    layout.widgets.forEach(w => { map[w.catalogId] = (map[w.catalogId] || 0) + 1; });
    return map;
  }, [layout.widgets]);

  /* ── Widget being configured ── */
  const configWidget = useMemo(() => {
    if (!configWidgetId) return null;
    return layout.widgets.find(w => w.id === configWidgetId) ?? null;
  }, [configWidgetId, layout.widgets]);

  const configCatalog = useMemo(() => {
    if (!configWidget) return null;
    return WIDGET_CATALOG.find(c => c.id === configWidget.catalogId) ?? null;
  }, [configWidget]);

  /* Widget previews render LIVE tenant metrics via <WidgetBody> (components/dashboard-widgets). */

  /* ─── Render ─────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <PremiumSurface maxWidth={2200}>
        <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <div style={{ color: DIM, fontSize: 15 }}>Loading dashboard configuration…</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </PremiumSurface>
    );
  }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <PremiumSurface maxWidth={2200}>

        {/* ── Header ── */}
        <ModuleHero
          eyebrow="Dashboard"
          eyebrowIcon={<Gear size={13} weight="fill" color="var(--text-secondary)" />}
          title="Dashboard"
          accent="Configuration"
          subtitle="Build and manage your home dashboard layout."
          actions={<>
            {saveMsg && (
              <span style={{ fontSize: 13, color: GREEN, fontWeight: 600, padding: '6px 12px', background: `color-mix(in srgb, ${GREEN} 8%, transparent)`, borderRadius: 8, alignSelf: 'center' }}>{saveMsg}</span>
            )}
            {error && (
              <span style={{ fontSize: 13, color: RED, fontWeight: 600, padding: '6px 12px', background: `color-mix(in srgb, ${RED} 8%, transparent)`, borderRadius: 8, alignSelf: 'center' }}>{error}</span>
            )}
            {isDirty && (
              <span style={{ fontSize: 12, color: AMBER, fontWeight: 600, alignSelf: 'center' }}>Unsaved changes</span>
            )}
            <button onClick={() => setConfirmResetOpen(true)} style={ghostButtonStyle} className="pmBtn">Reset Default</button>
            <button onClick={() => { setLoadModalOpen(true); fetchSavedLayouts(); }} style={ghostButtonStyle} className="pmBtn">Load Layout</button>
            <button onClick={() => setSaveAsModalOpen(true)} style={ghostButtonStyle} className="pmBtn">Save As…</button>
            <button onClick={handleSave} disabled={saving || !isDirty} style={{ ...goldButtonStyle, opacity: (!isDirty || saving) ? 0.5 : 1, cursor: (!isDirty || saving) ? 'not-allowed' : 'pointer' }} className="pmBtn">
              {saving ? 'Saving…' : 'Save Layout'}
            </button>
          </>}
        />

        {/* Layout intelligence strip — what this configuration holds right now */}
        <StatStrip items={[
          {href: '/app/dashboard-config',  label: 'Widgets Placed', value: String(layout.widgets.length), accent: layout.widgets.length > 0 ? GOLD : undefined, sub: `${WIDGET_CATALOG.length} widget types in the gallery` },
          {href: '/app/dashboard-config',  label: 'Grid', value: `${layout.columns} columns`, sub: `${layout.widgets.filter(w => w.size === 'full-width').length} full-width row${layout.widgets.filter(w => w.size === 'full-width').length === 1 ? '' : 's'}` },
          {href: '/app/dashboard-config',  label: 'Coverage', value: `${new Set(layout.widgets.map(w => WIDGET_CATALOG.find(c => c.id === w.catalogId)?.category).filter(Boolean)).size} of 5`, sub: 'widget categories in use' },
          {href: '/app/dashboard-config',  label: 'Preset', value: layout.preset ? layout.preset.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Custom', sub: layout.preset ? 'starting template' : 'built by hand' },
          {href: '/app/dashboard-config',  label: 'Status', value: isDirty ? 'Unsaved' : 'Saved', accent: isDirty ? AMBER : GREEN, sub: layout.updatedAt ? `last saved ${new Date(layout.updatedAt).toLocaleDateString()}` : 'save to keep this layout' },
          {href: '/app/dashboard-config',  label: 'Preview Data', value: metricsLoading ? 'Syncing' : 'Live', accent: metricsLoading ? undefined : GREEN, sub: 'previews pull your real project metrics' },
        ]} />

        {/* ── Layout Name & Preset Row ── */}
        <SectionCard style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 13, color: DIM, fontWeight: 600, whiteSpace: 'nowrap' }}>Layout Name:</label>
              <input
                value={layout.name}
                onChange={e => setLayout(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter layout name…"
                style={{ ...inputStyle, width: 260 }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: DIM, fontWeight: 600 }}>Columns:</span>
              {([2, 3, 4] as const).map(c => (
                <button key={c} onClick={() => setLayout(p => ({ ...p, columns: c }))} style={pill(layout.columns === c)}>{c} Col</button>
              ))}
            </div>
            <button onClick={() => setPresetModalOpen(true)} style={{ ...ghostButtonStyle, padding: '9px 16px' }} className="pmBtn">
              <span>Presets</span>
              {layout.preset && <span style={{ fontSize: 12, background: GOLD, color: 'var(--on-brand)', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>{layout.preset}</span>}
            </button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: DIM }}>{layout.widgets.length} widget{layout.widgets.length !== 1 ? 's' : ''}</span>
              <button onClick={() => { setCatalogOpen(!catalogOpen); setSearchTerm(''); setCatalogFilter('all'); }} style={{ ...goldButtonStyle, padding: '9px 18px' }} className="pmBtn">
                {catalogOpen ? 'Close Gallery' : '+ Add Widget'}
              </button>
            </div>
          </div>
        </SectionCard>

        {/* ── Widget Gallery (Catalog) ── */}
        {catalogOpen && (
          <SectionCard
            title="Widget Gallery"
            icon={<SquaresFour size={18} weight="duotone" color="var(--text-secondary)" />}
            action={<button onClick={() => setCatalogOpen(false)} style={{ ...miniBtn, fontSize: 14 }}><X size={14} color={DIM} weight="regular" /></button>}
            style={{ marginBottom: 20 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <input
                placeholder="Search widgets…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ ...inputStyle, width: 240 }}
              />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {categories.map(cat => (
                  <button key={cat} onClick={() => setCatalogFilter(cat)} style={pill(catalogFilter === cat)}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {filteredCatalog.map(cw => {
                const count = activeWidgetIds[cw.id] || 0;
                return (
                  <div key={cw.id} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 6, transition: 'border-color .15s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = GOLD)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{ marginRight: 6, display: 'inline-flex', verticalAlign: 'middle' }}><cw.icon size={18} color="var(--text-secondary)" weight="regular" /></span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{cw.name}</span>
                      </div>
                      {count > 0 && (
                        <span style={{ fontSize: 12, background: GOLD, color: 'var(--on-brand)', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>{count}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: DIM, flex: 1 }}>{cw.description}</div>
                    <button onClick={() => addWidget(cw.id)} style={{ ...goldButtonStyle, fontSize: 12, padding: '8px 12px', marginTop: 4, width: '100%' }} className="pmBtn">
                      + Add to Dashboard
                    </button>
                  </div>
                );
              })}
              {filteredCatalog.length === 0 && (
                <div style={{ gridColumn: '1/-1' }}>
                  <PremiumEmpty
                    icon={<Package size={30} weight="duotone" color="var(--text-secondary)" />}
                    title="No Widgets Match Your Search"
                    description="Try a different keyword or category filter."
                    compact
                  />
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* ── Main Content ── */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* ── Live Preview Grid ── */}
          <SectionCard
            title="Live Preview"
            subtitle={`${layout.columns}-Column Layout`}
            icon={<GridFour size={18} weight="duotone" color="var(--text-secondary)" />}
            action={layout.preset ? <span style={{ fontSize: 12, color: PURPLE, fontWeight: 600 }}>Preset: {layout.preset}</span> : undefined}
            style={{ flex: 1, minWidth: 280 }}
          >
          {layout.widgets.length === 0 ? (
            <PremiumEmpty
              icon={<Package size={34} weight="duotone" color="var(--text-secondary)" />}
              title="No Widgets Added"
              description="Open the Widget Gallery or apply a Preset to get started."
              action={<div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => setCatalogOpen(true)} style={goldButtonStyle} className="pmBtn">+ Add Widget</button>
                <button onClick={() => setPresetModalOpen(true)} style={ghostButtonStyle} className="pmBtn">Apply Preset</button>
              </div>}
            />
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
              gap: 14,
            }}>
              {layout.widgets.map((w, idx) => {
                const cat = WIDGET_CATALOG.find(c => c.id === w.catalogId);
                if (!cat) return null;
                const isConfiguring = configWidgetId === w.id;
                const colSpan = sizeToColSpan(w.size, layout.columns);
                return (
                  <div
                    key={w.id}
                    onDragOver={(e) => { if (dragId && dragId !== w.id) e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); reorderTo(w.id); setDragId(null); }}
                    style={{
                      ...cardStyle,
                      gridColumn: `span ${colSpan}`,
                      border: `1px solid ${dragId && dragId !== w.id ? GOLD : isConfiguring ? GOLD : BORDER}`,
                      borderStyle: dragId && dragId !== w.id ? 'dashed' : 'solid',
                      position: 'relative',
                      opacity: dragId === w.id ? 0.4 : 1,
                      transition: 'border-color .15s, box-shadow .15s, opacity .15s',
                      boxShadow: isConfiguring ? '0 0 0 2px color-mix(in srgb, var(--brand-primary) 19%, transparent)' : 'none',
                    }}
                  >
                    {/* Widget Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <span style={{ marginRight: 6, display: 'inline-flex', verticalAlign: 'middle' }}><cat.icon size={16} color="var(--text-secondary)" weight="regular" /></span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{cat.name}</span>
                        <span style={{ fontSize: 12, color: DIM, marginLeft: 8, background: BG, padding: '2px 8px', borderRadius: 4 }}>
                          {SIZE_LABELS[w.size]}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                        <span
                          draggable
                          onDragStart={() => setDragId(w.id)}
                          onDragEnd={() => setDragId(null)}
                          title="Drag to reorder"
                          aria-label="Drag to reorder"
                          style={{ cursor: 'grab', color: DIM, fontSize: 16, lineHeight: 1, padding: '0 5px', userSelect: 'none' }}
                        >⠿</span>
                        <button onClick={() => moveWidget(w.id, 'up')} disabled={idx === 0}
                          style={{ ...miniBtn, opacity: idx === 0 ? 0.3 : 1 }} title="Move up"><CaretUp size={14} color={DIM} weight="regular" /></button>
                        <button onClick={() => moveWidget(w.id, 'down')} disabled={idx === layout.widgets.length - 1}
                          style={{ ...miniBtn, opacity: idx === layout.widgets.length - 1 ? 0.3 : 1 }} title="Move down"><CaretDown size={14} color={DIM} weight="regular" /></button>
                        <button onClick={() => setConfigWidgetId(isConfiguring ? null : w.id)} style={{ ...miniBtn, background: isConfiguring ? GOLD : BG, color: isConfiguring ? 'var(--on-brand)' : DIM }} title="Configure"><Gear size={14} color={isConfiguring ? 'var(--on-brand)' : DIM} weight="regular" /></button>
                        <button onClick={() => removeWidget(w.id)} style={{ ...miniBtn, color: RED }} title="Remove"><X size={14} color={RED} weight="regular" /></button>
                      </div>
                    </div>

                    {/* Widget Preview Content — LIVE tenant metrics */}
                    <div style={{ minHeight: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                      <WidgetBody catalogId={w.catalogId} metrics={metrics} loading={metricsLoading} settings={w.settings} />
                    </div>

                    {/* Settings badges */}
                    {Object.keys(w.settings).length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {w.settings.dateRange && (
                          <span style={{ fontSize: 12, color: DIM, background: BG, padding: '2px 8px', borderRadius: 4 }}>
                            Range: {w.settings.dateRange}
                          </span>
                        )}
                        {w.settings.projectId && (
                          <span style={{ fontSize: 12, color: DIM, background: BG, padding: '2px 8px', borderRadius: 4 }}>
                            Project: {w.settings.projectId}
                          </span>
                        )}
                        {w.settings.limit !== undefined && (
                          <span style={{ fontSize: 12, color: DIM, background: BG, padding: '2px 8px', borderRadius: 4 }}>
                            Limit: {w.settings.limit}
                          </span>
                        )}
                        {w.settings.location && (
                          <span style={{ fontSize: 12, color: DIM, background: BG, padding: '2px 8px', borderRadius: 4 }}>
                            Loc: {w.settings.location}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </SectionCard>

          {/* ── Widget Config Side Panel ── */}
          {configWidget && configCatalog && (
            <SectionCard
              title="Widget Settings"
              icon={<Gear size={18} weight="duotone" color="var(--text-secondary)" />}
              action={<button onClick={() => setConfigWidgetId(null)} style={{ ...miniBtn, fontSize: 16 }}><X size={16} color={DIM} weight="regular" /></button>}
              style={{ width: 340, flexShrink: 0 }}
            >
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: 4 }}>
                <configCatalog.icon size={18} color="var(--text-secondary)" weight="regular" style={{ verticalAlign: 'middle', marginRight: 6 }} /> {configCatalog.name}
              </div>
              <div style={{ fontSize: 12, color: DIM }}>{configCatalog.description}</div>
            </div>

            {/* Size */}
            <SettingGroup label="Widget Size">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SIZES.map(s => (
                  <button key={s} onClick={() => setWidgetSize(configWidget.id, s)} style={pill(configWidget.size === s)}>
                    {SIZE_LABELS[s]}
                  </button>
                ))}
              </div>
            </SettingGroup>

            {/* Date Range */}
            {'dateRange' in configWidget.settings && (
              <SettingGroup label="Date Range">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['week', 'month', 'quarter', 'year'] as const).map(dr => (
                    <button key={dr} onClick={() => updateWidgetSettings(configWidget.id, { dateRange: dr })} style={pill(configWidget.settings.dateRange === dr)}>
                      {dr.charAt(0).toUpperCase() + dr.slice(1)}
                    </button>
                  ))}
                </div>
              </SettingGroup>
            )}

            {/* Project Filter */}
            {'projectId' in configWidget.settings && (
              <SettingGroup label="Project Filter">
                <select
                  value={configWidget.settings.projectId || 'all'}
                  onChange={e => updateWidgetSettings(configWidget.id, { projectId: e.target.value })}
                  style={{ ...inputStyle }}
                >
                  <option value="all">All Projects</option>
                  {projectOptions.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {projectOptions.length === 0 && (
                  <div style={{ fontSize: 12, color: DIM, marginTop: 6 }}>
                    No projects yet — widgets show data across all projects.
                  </div>
                )}
              </SettingGroup>
            )}

            {/* Location */}
            {'location' in configWidget.settings && (
              <SettingGroup label="Location">
                <input
                  value={configWidget.settings.location || ''}
                  onChange={e => updateWidgetSettings(configWidget.id, { location: e.target.value })}
                  placeholder="City, State (e.g. Phoenix, AZ)"
                  style={inputStyle}
                />
              </SettingGroup>
            )}

            {/* Feed Limit */}
            {'limit' in configWidget.settings && (
              <SettingGroup label="Items to Show">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={configWidget.settings.limit || 10}
                  onChange={e => updateWidgetSettings(configWidget.id, { limit: parseInt(e.target.value) || 10 })}
                  style={{ ...inputStyle, width: 90 }}
                />
              </SettingGroup>
            )}

            {/* Show Completed */}
            {'showCompleted' in configWidget.settings && (
              <SettingGroup label="Show Completed">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={configWidget.settings.showCompleted || false}
                    onChange={e => updateWidgetSettings(configWidget.id, { showCompleted: e.target.checked })}
                    style={{ accentColor: GOLD, width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 13, color: DIM }}>Include completed items</span>
                </label>
              </SettingGroup>
            )}

            {/* Actions */}
            <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
              <button onClick={() => removeWidget(configWidget.id)} style={btnStyle('danger')}>Remove Widget</button>
              <button onClick={() => setConfigWidgetId(null)} style={ghostButtonStyle} className="pmBtn">Done</button>
            </div>
            </SectionCard>
          )}
        </div>

        {/* ── Footer Summary ── */}
        <SectionCard flat style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ fontSize: 12, color: DIM }}>
              <span style={{ fontWeight: 600, color: TEXT }}>{layout.name || 'Untitled'}</span>
              {' · '}{layout.columns}-column · {layout.widgets.length} widget{layout.widgets.length !== 1 ? 's' : ''} ·{' '}
              {layout.widgets.filter(w => w.size === 'full-width').length} full-width ·{' '}
              {layout.widgets.filter(w => w.size === 'large').length} large ·{' '}
              {layout.widgets.filter(w => w.size === 'medium').length} medium ·{' '}
              {layout.widgets.filter(w => w.size === 'small').length} small
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              {(['project', 'financial', 'safety', 'schedule', 'general'] as const).map(cat => {
                const count = layout.widgets.filter(w => {
                  const c = WIDGET_CATALOG.find(cw => cw.id === w.catalogId);
                  return c?.category === cat;
                }).length;
                if (!count) return null;
                return (
                  <span key={cat} style={{ fontSize: 12, color: DIM }}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}: <span style={{ color: TEXT, fontWeight: 600 }}>{count}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </SectionCard>

      </PremiumSurface>

      {/* ═══════════════ MODALS ═══════════════ */}

      {/* ── Preset Selection Modal ── */}
      {presetModalOpen && (
        <div style={overlayStyle} onClick={() => setPresetModalOpen(false)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Layout Presets</h2>
              <button onClick={() => setPresetModalOpen(false)} style={{ ...miniBtn, fontSize: 16 }}><X size={16} color={DIM} weight="regular" /></button>
            </div>
            <p style={{ fontSize: 13, color: DIM, margin: '0 0 20px' }}>
              Choose a preset to quickly configure your dashboard. This will replace your current widgets.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {PRESETS.map(preset => (
                <div
                  key={preset.key}
                  style={{ ...cardStyle, cursor: 'pointer', transition: 'border-color .15s' }}
                  onClick={() => applyPreset(preset)}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = GOLD)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{preset.name}</div>
                    <span style={{ fontSize: 12, color: DIM, background: BG, padding: '2px 10px', borderRadius: 4 }}>
                      {preset.columns}-col · {preset.widgets.length} widgets
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: DIM }}>{preset.description}</div>
                  {preset.widgets.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {preset.widgets.map((w, i) => {
                        const cat = WIDGET_CATALOG.find(c => c.id === w.catalogId);
                        return cat ? (
                          <span key={i} style={{ fontSize: 12, color: DIM, background: BG, padding: '2px 8px', borderRadius: 4 }}>
                            <cat.icon size={12} color={DIM} weight="regular" style={{ verticalAlign: 'middle', marginRight: 4 }} /> {cat.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Load Layout Modal ── */}
      {loadModalOpen && (
        <div style={overlayStyle} onClick={() => setLoadModalOpen(false)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Load Saved Layout</h2>
              <button onClick={() => setLoadModalOpen(false)} style={{ ...miniBtn, fontSize: 16 }}><X size={16} color={DIM} weight="regular" /></button>
            </div>
            {loadingLayouts ? (
              <div style={{ textAlign: 'center', padding: 40, color: DIM }}>
                <div style={{ width: 32, height: 32, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                Loading saved layouts…
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : savedLayouts.length === 0 ? (
              <PremiumEmpty
                icon={<FolderOpen size={30} weight="duotone" color="var(--text-secondary)" />}
                title="No Saved Layouts"
                description="Save your current layout to see it here."
                compact
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {savedLayouts.map(sl => (
                  <div key={sl.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{sl.name}</div>
                      <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
                        {sl.widgetCount} widget{sl.widgetCount !== 1 ? 's' : ''}
                        {sl.preset && <span> · Preset: {sl.preset}</span>}
                        {sl.updatedAt && <span> · {new Date(sl.updatedAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleLoadLayout(sl.id)} style={goldButtonStyle} className="pmBtn">Load</button>
                      <button
                        onClick={() => handleDeleteLayout(sl.id)}
                        disabled={deletingId === sl.id}
                        style={{ ...btnStyle('danger'), opacity: deletingId === sl.id ? 0.5 : 1 }}
                      >
                        {deletingId === sl.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Save As Modal ── */}
      {saveAsModalOpen && (
        <div style={overlayStyle} onClick={() => setSaveAsModalOpen(false)}>
          <div style={{ ...modalStyle, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Save Layout As</h2>
              <button onClick={() => setSaveAsModalOpen(false)} style={{ ...miniBtn, fontSize: 16 }}><X size={16} color={DIM} weight="regular" /></button>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: DIM, display: 'block', marginBottom: 6 }}>Layout Name</label>
              <input
                autoFocus
                value={saveAsName}
                onChange={e => setSaveAsName(e.target.value)}
                placeholder="Enter a name for this layout…"
                style={inputStyle}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveAs(); }}
              />
            </div>
            <div style={{ fontSize: 13, color: DIM, marginBottom: 20 }}>
              This will save a new copy of your current layout with {layout.widgets.length} widget{layout.widgets.length !== 1 ? 's' : ''} in a {layout.columns}-column layout.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setSaveAsModalOpen(false)} style={ghostButtonStyle} className="pmBtn">Cancel</button>
              <button onClick={handleSaveAs} disabled={!saveAsName.trim() || saving} style={{ ...goldButtonStyle, opacity: (!saveAsName.trim() || saving) ? 0.5 : 1 }} className="pmBtn">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Reset Modal ── */}
      {confirmResetOpen && (
        <div style={overlayStyle} onClick={() => setConfirmResetOpen(false)}>
          <div style={{ ...modalStyle, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: RED }}>Reset to Default</h2>
              <button onClick={() => setConfirmResetOpen(false)} style={{ ...miniBtn, fontSize: 16 }}><X size={16} color={DIM} weight="regular" /></button>
            </div>
            <p style={{ fontSize: 14, color: DIM, margin: '0 0 8px' }}>
              This will replace your current layout with the default configuration. Any unsaved changes will be lost.
            </p>
            <p style={{ fontSize: 13, color: AMBER, margin: '0 0 20px' }}>
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setConfirmResetOpen(false)} style={ghostButtonStyle} className="pmBtn">Cancel</button>
              <button onClick={handleReset} style={btnStyle('danger')}>Reset to Default</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
