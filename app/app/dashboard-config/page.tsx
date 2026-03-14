'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';

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
type WidgetSize = 'small' | 'medium' | 'large' | 'full-width';

interface WidgetSettings {
  projectId?: string;
  dateRange?: 'week' | 'month' | 'quarter' | 'year';
  location?: string;
  limit?: number;
  showCompleted?: boolean;
}

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

interface CatalogWidget {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'project' | 'financial' | 'safety' | 'schedule' | 'general';
  defaultSettings: WidgetSettings;
}

/* ─── Widget Catalog ────────────────────────────────────────────────── */
const WIDGET_CATALOG: CatalogWidget[] = [
  { id: 'project-summary',      name: 'Project Summary',        description: 'Active, complete, and on-hold project counts with status breakdown',     icon: '📊', category: 'project',   defaultSettings: {} },
  { id: 'budget-overview',      name: 'Budget Overview',         description: 'Total budget, spent, committed, and remaining across all projects',      icon: '💰', category: 'financial', defaultSettings: { dateRange: 'quarter' } },
  { id: 'schedule-status',      name: 'Schedule Status',         description: 'Milestone progress, on-track vs delayed tasks, and critical path items', icon: '📅', category: 'schedule',  defaultSettings: { dateRange: 'week' } },
  { id: 'safety-metrics',       name: 'Safety Metrics',          description: 'Incident rates, near-misses, safety training compliance, and days safe', icon: '⛑️', category: 'safety',    defaultSettings: { dateRange: 'month' } },
  { id: 'rfi-tracker',          name: 'RFI Tracker',             description: 'Open, pending, and overdue RFIs with average response time',             icon: '📋', category: 'project',   defaultSettings: { projectId: 'all' } },
  { id: 'submittal-status',     name: 'Submittal Status',        description: 'Submittal review progress: pending, approved, rejected, and resubmit',   icon: '📑', category: 'project',   defaultSettings: { projectId: 'all' } },
  { id: 'weather',              name: 'Weather',                 description: 'Current weather conditions and forecast for project locations',           icon: '🌤️', category: 'general',   defaultSettings: { location: '' } },
  { id: 'team-activity',        name: 'Team Activity',           description: 'Recent activity feed showing team member actions and updates',            icon: '👥', category: 'general',   defaultSettings: { limit: 10 } },
  { id: 'upcoming-deadlines',   name: 'Upcoming Deadlines',      description: 'Approaching deadlines for submittals, RFIs, pay apps, and milestones',   icon: '⏰', category: 'schedule',  defaultSettings: { dateRange: 'week' } },
  { id: 'photo-feed',           name: 'Photo Feed',              description: 'Latest site photos uploaded by field teams across projects',              icon: '📷', category: 'general',   defaultSettings: { limit: 6, projectId: 'all' } },
  { id: 'change-order-summary', name: 'Change Order Summary',    description: 'Pending, approved, and rejected change orders with total value',         icon: '🔄', category: 'financial', defaultSettings: {} },
  { id: 'action-items',         name: 'Action Items',            description: 'Open action items assigned to you or your team with priority levels',     icon: '✅', category: 'project',   defaultSettings: { showCompleted: false, projectId: 'all' } },
];

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
  color: active ? BG : DIM,
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
  color: variant === 'primary' ? BG : variant === 'danger' ? '#fff' : DIM,
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
  fontSize: 11,
  padding: 0,
  lineHeight: 1,
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
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
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
};

/* ─── Setting Group Component ───────────────────────────────────────── */
function SettingGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
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

  /* ── Fetch current layout ── */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/dashboard-layout');
        if (res.ok) {
          const data = await res.json();
          if (data && data.widgets?.length) {
            setLayout(data);
            setSavedLayout(data);
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
      const updated = { ...layout, id: saved.id || layout.id, updatedAt: new Date().toISOString() };
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
      const updated = { ...newLayout, id: saved.id, updatedAt: new Date().toISOString() };
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

  /* ── Mock preview data ── */
  const previewData: Record<string, React.ReactNode> = useMemo(() => ({
    'project-summary': (
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: GREEN }}>12</div><div style={{ fontSize: 11, color: DIM }}>Active</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: BLUE }}>5</div><div style={{ fontSize: 11, color: DIM }}>Complete</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: AMBER }}>3</div><div style={{ fontSize: 11, color: DIM }}>On Hold</div></div>
      </div>
    ),
    'budget-overview': (
      <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: TEXT }}>$4.2M</div><div style={{ fontSize: 11, color: DIM }}>Budget</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: AMBER }}>$2.8M</div><div style={{ fontSize: 11, color: DIM }}>Spent</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: GREEN }}>$1.4M</div><div style={{ fontSize: 11, color: DIM }}>Remaining</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: PURPLE }}>$860K</div><div style={{ fontSize: 11, color: DIM }}>Committed</div></div>
      </div>
    ),
    'schedule-status': (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[{ label: 'On Track', pct: 72, color: GREEN }, { label: 'At Risk', pct: 18, color: AMBER }, { label: 'Delayed', pct: 10, color: RED }].map((row, i) => (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: DIM, marginBottom: 2 }}><span>{row.label}</span><span>{row.pct}%</span></div>
            <div style={{ position: 'relative', height: 8, background: BG, borderRadius: 4 }}>
              <div style={{ position: 'absolute', height: '100%', width: `${row.pct}%`, background: row.color, borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    ),
    'safety-metrics': (
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: GREEN }}>0</div><div style={{ fontSize: 11, color: DIM }}>Incidents</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: AMBER }}>2</div><div style={{ fontSize: 11, color: DIM }}>Near Misses</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: BLUE }}>142</div><div style={{ fontSize: 11, color: DIM }}>Days Safe</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: GREEN }}>96%</div><div style={{ fontSize: 11, color: DIM }}>Training</div></div>
      </div>
    ),
    'rfi-tracker': (
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: AMBER }}>8</div><div style={{ fontSize: 11, color: DIM }}>Open</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: RED }}>3</div><div style={{ fontSize: 11, color: DIM }}>Overdue</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: GREEN }}>47</div><div style={{ fontSize: 11, color: DIM }}>Closed</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 16, fontWeight: 600, color: DIM }}>4.2d avg</div><div style={{ fontSize: 11, color: DIM }}>Response</div></div>
      </div>
    ),
    'submittal-status': (
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: AMBER }}>12</div><div style={{ fontSize: 11, color: DIM }}>Pending</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: GREEN }}>34</div><div style={{ fontSize: 11, color: DIM }}>Approved</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: RED }}>2</div><div style={{ fontSize: 11, color: DIM }}>Rejected</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: BLUE }}>5</div><div style={{ fontSize: 11, color: DIM }}>Resubmit</div></div>
      </div>
    ),
    'weather': (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 36 }}>☀️</div>
        <div style={{ fontSize: 22, fontWeight: 600, color: TEXT, margin: '4px 0' }}>72°F</div>
        <div style={{ fontSize: 12, color: DIM }}>Clear skies — Phoenix, AZ</div>
        <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>Wind: 8 mph NW  |  Humidity: 22%</div>
      </div>
    ),
    'team-activity': (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { user: 'Mike R.', action: 'uploaded inspection report', time: '5m ago' },
          { user: 'Sarah K.', action: 'approved CO #12', time: '22m ago' },
          { user: 'Jose M.', action: 'completed punch item #47', time: '1h ago' },
          { user: 'Dana L.', action: 'submitted daily log', time: '2h ago' },
        ].map((a, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, borderLeft: `2px solid ${GOLD}`, paddingLeft: 8 }}>
            <span style={{ color: DIM }}><span style={{ color: TEXT, fontWeight: 600 }}>{a.user}</span> {a.action}</span>
            <span style={{ color: DIM, fontSize: 10, flexShrink: 0, marginLeft: 8 }}>{a.time}</span>
          </div>
        ))}
      </div>
    ),
    'upcoming-deadlines': (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { d: 'Mar 14', t: 'Submittal Review — Curtain Wall', c: RED },
          { d: 'Mar 16', t: 'Pay App #5 Due', c: AMBER },
          { d: 'Mar 18', t: 'RFI Response — Structural', c: BLUE },
          { d: 'Mar 20', t: 'Permit Inspection Window', c: GREEN },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: DIM }}>{item.t}</span>
            <span style={{ color: item.c, fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>{item.d}</span>
          </div>
        ))}
      </div>
    ),
    'photo-feed': (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {[GREEN, BLUE, AMBER, PURPLE, RED, GOLD].map((color, i) => (
          <div key={i} style={{ aspectRatio: '4/3', background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
            📷
          </div>
        ))}
      </div>
    ),
    'change-order-summary': (
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: AMBER }}>$340K</div><div style={{ fontSize: 11, color: DIM }}>Pending</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: GREEN }}>$1.2M</div><div style={{ fontSize: 11, color: DIM }}>Approved</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: RED }}>$85K</div><div style={{ fontSize: 11, color: DIM }}>Rejected</div></div>
      </div>
    ),
    'action-items': (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { text: 'Review updated shop drawings', priority: 'High', color: RED },
          { text: 'Schedule crane inspection', priority: 'Medium', color: AMBER },
          { text: 'Submit progress photos', priority: 'Low', color: BLUE },
          { text: 'Approve material substitution', priority: 'High', color: RED },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
            <span style={{ color: DIM, flex: 1 }}>{item.text}</span>
            <span style={{ color: item.color, fontSize: 10, fontWeight: 600, flexShrink: 0 }}>{item.priority}</span>
          </div>
        ))}
      </div>
    ),
  }), []);

  /* ─── Render ─────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <div style={{ color: DIM, fontSize: 15 }}>Loading dashboard configuration...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, background: RAISED, padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: GOLD }}>Dashboard Configuration</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: DIM }}>Build and manage your home dashboard layout</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {saveMsg && (
            <span style={{ fontSize: 13, color: GREEN, fontWeight: 600, padding: '4px 12px', background: `${GREEN}15`, borderRadius: 6 }}>{saveMsg}</span>
          )}
          {error && (
            <span style={{ fontSize: 13, color: RED, fontWeight: 600, padding: '4px 12px', background: `${RED}15`, borderRadius: 6 }}>{error}</span>
          )}
          {isDirty && (
            <span style={{ fontSize: 12, color: AMBER, fontWeight: 500 }}>Unsaved changes</span>
          )}
          <button onClick={() => setConfirmResetOpen(true)} style={btnStyle('secondary')}>Reset Default</button>
          <button onClick={() => { setLoadModalOpen(true); fetchSavedLayouts(); }} style={btnStyle('secondary')}>Load Layout</button>
          <button onClick={() => setSaveAsModalOpen(true)} style={btnStyle('secondary')}>Save As...</button>
          <button onClick={handleSave} disabled={saving || !isDirty} style={{ ...btnStyle('primary'), opacity: (!isDirty || saving) ? 0.5 : 1 }}>
            {saving ? 'Saving...' : 'Save Layout'}
          </button>
        </div>
      </div>

      {/* ── Layout Name & Preset Row ── */}
      <div style={{ padding: '14px 32px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, color: DIM, fontWeight: 600, whiteSpace: 'nowrap' }}>Layout Name:</label>
          <input
            value={layout.name}
            onChange={e => setLayout(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Enter layout name..."
            style={{ ...inputStyle, width: 260 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: DIM, fontWeight: 600 }}>Columns:</span>
          {([2, 3, 4] as const).map(c => (
            <button key={c} onClick={() => setLayout(p => ({ ...p, columns: c }))} style={pill(layout.columns === c)}>{c} Col</button>
          ))}
        </div>
        <button onClick={() => setPresetModalOpen(true)} style={{ ...btnStyle('secondary'), display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Presets</span>
          {layout.preset && <span style={{ fontSize: 10, background: GOLD, color: BG, padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>{layout.preset}</span>}
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: DIM }}>{layout.widgets.length} widget{layout.widgets.length !== 1 ? 's' : ''}</span>
          <button onClick={() => { setCatalogOpen(!catalogOpen); setSearchTerm(''); setCatalogFilter('all'); }} style={btnStyle('primary')}>
            {catalogOpen ? 'Close Gallery' : '+ Add Widget'}
          </button>
        </div>
      </div>

      {/* ── Widget Gallery (Catalog) ── */}
      {catalogOpen && (
        <div style={{ background: RAISED, borderBottom: `1px solid ${BORDER}`, padding: '16px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>Widget Gallery</div>
            <button onClick={() => setCatalogOpen(false)} style={{ ...miniBtn, fontSize: 14 }}>✕</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <input
              placeholder="Search widgets..."
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
                      <span style={{ fontSize: 18, marginRight: 6 }}>{cw.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{cw.name}</span>
                    </div>
                    {count > 0 && (
                      <span style={{ fontSize: 10, background: GOLD, color: BG, padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>{count}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: DIM, flex: 1 }}>{cw.description}</div>
                  <button onClick={() => addWidget(cw.id)} style={{ ...btnStyle('primary'), fontSize: 12, padding: '6px 12px', marginTop: 4, width: '100%' }}>
                    + Add to Dashboard
                  </button>
                </div>
              );
            })}
            {filteredCatalog.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 32, color: DIM }}>No widgets match your search.</div>
            )}
          </div>
        </div>
      )}

      {/* ── Main Content ── */}
      <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 240px)' }}>

        {/* ── Live Preview Grid ── */}
        <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: DIM, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Live Preview — {layout.columns}-Column Layout</span>
            {layout.preset && <span style={{ fontSize: 12, color: PURPLE, fontWeight: 500 }}>Preset: {layout.preset}</span>}
          </div>
          {layout.widgets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 64, color: DIM, border: `2px dashed ${BORDER}`, borderRadius: 12 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, color: TEXT }}>No Widgets Added</div>
              <div style={{ fontSize: 13, marginBottom: 20 }}>Open the Widget Gallery or apply a Preset to get started.</div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => setCatalogOpen(true)} style={btnStyle('primary')}>+ Add Widget</button>
                <button onClick={() => setPresetModalOpen(true)} style={btnStyle('secondary')}>Apply Preset</button>
              </div>
            </div>
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
                    style={{
                      ...cardStyle,
                      gridColumn: `span ${colSpan}`,
                      border: `1px solid ${isConfiguring ? GOLD : BORDER}`,
                      position: 'relative',
                      transition: 'border-color .15s, box-shadow .15s',
                      boxShadow: isConfiguring ? `0 0 0 2px ${GOLD}30` : 'none',
                    }}
                  >
                    {/* Widget Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <span style={{ fontSize: 16, marginRight: 6 }}>{cat.icon}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{cat.name}</span>
                        <span style={{ fontSize: 10, color: DIM, marginLeft: 8, background: BG, padding: '2px 8px', borderRadius: 4 }}>
                          {SIZE_LABELS[w.size]}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button onClick={() => moveWidget(w.id, 'up')} disabled={idx === 0}
                          style={{ ...miniBtn, opacity: idx === 0 ? 0.3 : 1 }} title="Move up">▲</button>
                        <button onClick={() => moveWidget(w.id, 'down')} disabled={idx === layout.widgets.length - 1}
                          style={{ ...miniBtn, opacity: idx === layout.widgets.length - 1 ? 0.3 : 1 }} title="Move down">▼</button>
                        <button onClick={() => setConfigWidgetId(isConfiguring ? null : w.id)} style={{ ...miniBtn, background: isConfiguring ? GOLD : BG, color: isConfiguring ? BG : DIM }} title="Configure">⚙</button>
                        <button onClick={() => removeWidget(w.id)} style={{ ...miniBtn, color: RED }} title="Remove">✕</button>
                      </div>
                    </div>

                    {/* Widget Preview Content */}
                    <div style={{ minHeight: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                      {previewData[w.catalogId] || <div style={{ color: DIM, fontSize: 13 }}>Preview not available</div>}
                    </div>

                    {/* Settings badges */}
                    {Object.keys(w.settings).length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {w.settings.dateRange && (
                          <span style={{ fontSize: 10, color: DIM, background: BG, padding: '2px 8px', borderRadius: 4 }}>
                            Range: {w.settings.dateRange}
                          </span>
                        )}
                        {w.settings.projectId && (
                          <span style={{ fontSize: 10, color: DIM, background: BG, padding: '2px 8px', borderRadius: 4 }}>
                            Project: {w.settings.projectId}
                          </span>
                        )}
                        {w.settings.limit !== undefined && (
                          <span style={{ fontSize: 10, color: DIM, background: BG, padding: '2px 8px', borderRadius: 4 }}>
                            Limit: {w.settings.limit}
                          </span>
                        )}
                        {w.settings.location && (
                          <span style={{ fontSize: 10, color: DIM, background: BG, padding: '2px 8px', borderRadius: 4 }}>
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
        </div>

        {/* ── Widget Config Side Panel ── */}
        {configWidget && configCatalog && (
          <div style={{ width: 340, borderLeft: `1px solid ${BORDER}`, background: RAISED, padding: 20, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: GOLD }}>Widget Settings</div>
              <button onClick={() => setConfigWidgetId(null)} style={{ ...miniBtn, fontSize: 16 }}>✕</button>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: 4 }}>
                {configCatalog.icon} {configCatalog.name}
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
                  <option value="proj-1">Downtown Office Tower</option>
                  <option value="proj-2">Riverside Apartments</option>
                  <option value="proj-3">Industrial Warehouse</option>
                  <option value="proj-4">School Renovation</option>
                </select>
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
              <button onClick={() => setConfigWidgetId(null)} style={btnStyle('secondary')}>Done</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer Summary ── */}
      <div style={{ borderTop: `1px solid ${BORDER}`, background: RAISED, padding: '12px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
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
              <span key={cat} style={{ fontSize: 11, color: DIM }}>
                {cat}: <span style={{ color: TEXT, fontWeight: 600 }}>{count}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* ═══════════════ MODALS ═══════════════ */}

      {/* ── Preset Selection Modal ── */}
      {presetModalOpen && (
        <div style={overlayStyle} onClick={() => setPresetModalOpen(false)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: GOLD }}>Layout Presets</h2>
              <button onClick={() => setPresetModalOpen(false)} style={{ ...miniBtn, fontSize: 16 }}>✕</button>
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
                    <div style={{ fontSize: 16, fontWeight: 700, color: GOLD }}>{preset.name}</div>
                    <span style={{ fontSize: 11, color: DIM, background: BG, padding: '2px 10px', borderRadius: 4 }}>
                      {preset.columns}-col · {preset.widgets.length} widgets
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: DIM }}>{preset.description}</div>
                  {preset.widgets.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {preset.widgets.map((w, i) => {
                        const cat = WIDGET_CATALOG.find(c => c.id === w.catalogId);
                        return cat ? (
                          <span key={i} style={{ fontSize: 10, color: DIM, background: BG, padding: '2px 8px', borderRadius: 4 }}>
                            {cat.icon} {cat.name}
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
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: GOLD }}>Load Saved Layout</h2>
              <button onClick={() => setLoadModalOpen(false)} style={{ ...miniBtn, fontSize: 16 }}>✕</button>
            </div>
            {loadingLayouts ? (
              <div style={{ textAlign: 'center', padding: 40, color: DIM }}>
                <div style={{ width: 32, height: 32, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                Loading saved layouts...
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : savedLayouts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: DIM }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: 6 }}>No Saved Layouts</div>
                <div style={{ fontSize: 13 }}>Save your current layout to see it here.</div>
              </div>
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
                      <button onClick={() => handleLoadLayout(sl.id)} style={btnStyle('primary')}>Load</button>
                      <button
                        onClick={() => handleDeleteLayout(sl.id)}
                        disabled={deletingId === sl.id}
                        style={{ ...btnStyle('danger'), opacity: deletingId === sl.id ? 0.5 : 1 }}
                      >
                        {deletingId === sl.id ? '...' : 'Delete'}
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
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: GOLD }}>Save Layout As</h2>
              <button onClick={() => setSaveAsModalOpen(false)} style={{ ...miniBtn, fontSize: 16 }}>✕</button>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: DIM, display: 'block', marginBottom: 6 }}>Layout Name</label>
              <input
                autoFocus
                value={saveAsName}
                onChange={e => setSaveAsName(e.target.value)}
                placeholder="Enter a name for this layout..."
                style={inputStyle}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveAs(); }}
              />
            </div>
            <div style={{ fontSize: 13, color: DIM, marginBottom: 20 }}>
              This will save a new copy of your current layout with {layout.widgets.length} widget{layout.widgets.length !== 1 ? 's' : ''} in a {layout.columns}-column layout.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setSaveAsModalOpen(false)} style={btnStyle('secondary')}>Cancel</button>
              <button onClick={handleSaveAs} disabled={!saveAsName.trim() || saving} style={{ ...btnStyle('primary'), opacity: (!saveAsName.trim() || saving) ? 0.5 : 1 }}>
                {saving ? 'Saving...' : 'Save'}
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
              <button onClick={() => setConfirmResetOpen(false)} style={{ ...miniBtn, fontSize: 16 }}>✕</button>
            </div>
            <p style={{ fontSize: 14, color: DIM, margin: '0 0 8px' }}>
              This will replace your current layout with the default configuration. Any unsaved changes will be lost.
            </p>
            <p style={{ fontSize: 13, color: AMBER, margin: '0 0 20px' }}>
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setConfirmResetOpen(false)} style={btnStyle('secondary')}>Cancel</button>
              <button onClick={handleReset} style={btnStyle('danger')}>Reset to Default</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
