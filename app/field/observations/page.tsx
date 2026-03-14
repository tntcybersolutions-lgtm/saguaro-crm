'use client';
/**
 * Saguaro Field — Proactive Safety Observations
 * Capture positive, negative, and condition-based safety observations.
 * Templates, checklists, corrective actions, photo capture, GPS, offline queue.
 */
import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';
import EmailComposer from '@/components/EmailComposer';
import { CONTRACTOR_TRADES as TRADES } from '@/lib/contractor-trades';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';

/* ─── Types & Constants ─── */
type ObsType = 'positive' | 'negative' | 'condition';
type Priority = 'low' | 'medium' | 'high' | 'critical';
type CAStatus = 'assigned' | 'in_progress' | 'resolved' | 'verified';
type CheckResult = 'pass' | 'fail' | 'na';
type View = 'list' | 'create' | 'detail';

const OBS_TYPES: { key: ObsType; label: string; color: string; icon: string }[] = [
  { key: 'positive',  label: 'Positive',  color: GREEN, icon: '✓' },
  { key: 'negative',  label: 'Negative',  color: RED,   icon: '✗' },
  { key: 'condition', label: 'Condition', color: AMBER, icon: '⚠' },
];

const PRIORITIES: { key: Priority; label: string; color: string }[] = [
  { key: 'low',      label: 'Low',      color: BLUE },
  { key: 'medium',   label: 'Medium',   color: AMBER },
  { key: 'high',     label: 'High',     color: '#F97316' },
  { key: 'critical', label: 'Critical', color: RED },
];

const CA_STATUSES: { key: CAStatus; label: string; color: string }[] = [
  { key: 'assigned',    label: 'Assigned',    color: RED },
  { key: 'in_progress', label: 'In Progress', color: AMBER },
  { key: 'resolved',    label: 'Resolved',    color: BLUE },
  { key: 'verified',    label: 'Verified',    color: GREEN },
];

// TRADES imported from @/lib/contractor-trades

interface ChecklistItem {
  id: string;
  text: string;
  result: CheckResult;
  note?: string;
}

interface CorrectiveAction {
  assignee: string;
  due_date: string;
  description: string;
  status: CAStatus;
}

interface Observation {
  id: string;
  type: ObsType;
  template?: string;
  category?: string;
  location?: string;
  lat?: number;
  lng?: number;
  trade?: string;
  priority: Priority;
  description: string;
  checklist?: ChecklistItem[];
  photo_urls?: string[];
  corrective_required: boolean;
  corrective_action?: CorrectiveAction;
  status: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

interface Template {
  name: string;
  category: string;
  icon: string;
  items: string[];
}

const TEMPLATES: Template[] = [
  { name: 'Housekeeping', category: 'General Safety', icon: '🧹', items: [
    'Work area free of debris and tripping hazards',
    'Materials stored and stacked properly',
    'Waste disposed of in designated containers',
    'Access/egress paths clear and unobstructed',
    'Extension cords routed safely, not creating trip hazards',
    'Spills cleaned up immediately',
  ]},
  { name: 'PPE Compliance', category: 'Personal Protection', icon: '🦺', items: [
    'Hard hat worn and in good condition',
    'Safety glasses / goggles worn as required',
    'High-visibility vest worn in active work zones',
    'Steel-toed boots worn and in good condition',
    'Hearing protection worn in high-noise areas',
    'Gloves appropriate for task being performed',
    'Respiratory protection used when required',
    'Fall protection harness inspected and worn properly',
  ]},
  { name: 'Fall Protection', category: 'Fall Prevention', icon: '🪢', items: [
    'Guardrails installed at all open edges > 6 ft',
    'Floor / roof openings covered and secured',
    'Personal fall arrest system in use where required',
    'Harness inspected (webbing, D-rings, buckles)',
    'Lanyard and SRL in good condition',
    'Anchorage point rated for 5,000 lbs per worker',
    'Safety nets installed where applicable',
    'Ladder safety: 3-point contact, secured at top',
    'Warning line system maintained at 6 ft from edge',
  ]},
  { name: 'Scaffolding', category: 'Scaffolding Safety', icon: '🏗', items: [
    'Scaffold erected by competent person',
    'Base plates and mud sills properly set',
    'All cross-braces in place and pinned',
    'Guardrails (top rail, mid rail, toe board) installed',
    'Planking fully decked, cleated, and overlapping 6"',
    'Access ladder provided and secured',
    'Scaffold tagged green (safe to use)',
    'No overloading — rated load capacity posted',
    'Scaffold plumb, level, and square',
    'Tied to structure every 26 ft vertically / 30 ft horizontally',
  ]},
  { name: 'Electrical Safety', category: 'Electrical', icon: '⚡', items: [
    'GFCI protection on all temporary power',
    'Extension cords inspected — no damage or splices',
    'Lockout/tagout procedures followed',
    'Energized work permit obtained if applicable',
    'Proper clearance from overhead power lines (10 ft+)',
    'Panel boxes covered and labeled',
    'No daisy-chaining of extension cords',
    'Qualified electrician performing electrical work',
  ]},
  { name: 'Excavation / Trenching', category: 'Excavation', icon: '🕳', items: [
    'Excavation permit obtained',
    'Utilities located and marked (811 called)',
    'Competent person on site for inspection',
    'Soil classified (Type A, B, C)',
    'Protective system in place (sloping, shoring, shielding)',
    'Spoil pile set back 2 ft from edge minimum',
    'Safe means of egress within 25 ft of workers',
    'Atmosphere tested if > 4 ft deep',
    'Adjacent structures evaluated for stability',
    'Barricades / signage around excavation',
  ]},
  { name: 'Fire Prevention', category: 'Fire Safety', icon: '🔥', items: [
    'Hot work permit obtained and posted',
    'Fire watch designated (30 min after work)',
    'Fire extinguishers within 50 ft of hot work',
    'Combustibles removed or protected (35 ft radius)',
    'Sprinkler system operational or alternative in place',
    'Flammable / combustible liquids stored properly',
    'No smoking in prohibited areas',
    'Emergency exits marked and unobstructed',
  ]},
  { name: 'Tool Safety', category: 'Tools & Equipment', icon: '🔧', items: [
    'Power tools inspected before use',
    'Guards in place on all grinders and saws',
    'Powder-actuated tools — only trained operators',
    'Hand tools in good condition (no mushroomed heads)',
    'Pneumatic tools: whip checks and safety clips installed',
    'Tool tethering used when working at heights',
    'Right tool selected for the job',
    'Cords and hoses routed to prevent tripping',
  ]},
  { name: 'Confined Space', category: 'Confined Space', icon: '🚪', items: [
    'Confined space permit issued and posted',
    'Atmospheric testing completed (O2, LEL, H2S, CO)',
    'Continuous monitoring in effect',
    'Attendant stationed at entry point',
    'Rescue plan and equipment in place',
    'Ventilation provided as required',
    'Entrants trained and briefed on hazards',
    'Communication system established',
    'Entry log maintained',
  ]},
  { name: 'Crane / Rigging', category: 'Lifting Operations', icon: '🏗', items: [
    'Crane inspected — daily / annual certification current',
    'Operator certified and competent',
    'Lift plan prepared for critical lifts',
    'Outriggers fully extended on firm ground',
    'Load weight verified — within crane capacity',
    'Rigging inspected (slings, shackles, hooks)',
    'Tag lines in use',
    'Swing radius barricaded',
    'Signal person designated and visible',
    'No personnel under suspended loads',
  ]},
];

/* ─── Helpers ─── */
function uid(): string { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
function fmtDate(d?: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateTime(d?: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function priorityColor(p: Priority): string {
  return PRIORITIES.find(pr => pr.key === p)?.color || DIM;
}
function typeColor(t: ObsType): string {
  return OBS_TYPES.find(o => o.key === t)?.color || DIM;
}
function caStatusColor(s: CAStatus): string {
  return CA_STATUSES.find(c => c.key === s)?.color || DIM;
}

/* ─── Shared Styles ─── */
const cardStyle: React.CSSProperties = {
  background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14,
  padding: 16, marginBottom: 10,
};
const btnBase: React.CSSProperties = {
  border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700,
  fontSize: 14, cursor: 'pointer', transition: 'opacity 0.15s',
};
const inputStyle: React.CSSProperties = {
  background: '#0A1628', border: `1px solid ${BORDER}`, borderRadius: 10,
  color: TEXT, padding: '10px 14px', fontSize: 14, width: '100%',
  outline: 'none', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  color: DIM, fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const,
  letterSpacing: '0.05em', marginBottom: 6, display: 'block',
};

/* ─── Component ─── */
const exportPDF = (title: string, content: string) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #1a1a1a; max-width: 800px; margin: 0 auto; }
        h1 { font-size: 24px; border-bottom: 2px solid #D4A017; padding-bottom: 8px; }
        h2 { font-size: 18px; color: #333; margin-top: 24px; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: 13px; }
        th { background: #f5f5f5; font-weight: 600; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
        .meta { color: #666; font-size: 13px; }
        .section { margin: 16px 0; padding: 12px; border: 1px solid #eee; border-radius: 8px; }
        img { max-width: 300px; margin: 4px; border-radius: 4px; }
        .signature { max-width: 200px; border: 1px solid #ddd; border-radius: 4px; padding: 4px; }
        .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 11px; color: #999; }
        .pass { color: #16a34a; } .fail { color: #dc2626; } .na { color: #9ca3af; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      ${content}
      <div class="footer">
        <p>Generated by Saguaro Control &middot; ${new Date().toLocaleString()}</p>
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
};

const PdfIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1={12} y1={18} x2={12} y2={12}/><polyline points="9 15 12 12 15 15"/>
  </svg>
);

function ObservationsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<Observation | null>(null);
  const [online, setOnline] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [showEmail, setShowEmail] = useState(false);

  /* ─── Advanced Filters ─── */
  type SortField = 'date' | 'priority' | 'status' | 'type';
  type SortDir = 'asc' | 'desc';
  interface FilterState {
    statuses: string[];
    types: ObsType[];
    priorities: Priority[];
    observedBy: string;
    dateFrom: string;
    dateTo: string;
    sortBy: SortField;
    sortDir: SortDir;
  }
  interface SavedPreset {
    name: string;
    filters: FilterState;
  }

  const defaultFilters: FilterState = {
    statuses: [],
    types: [],
    priorities: [],
    observedBy: '',
    dateFrom: '',
    dateTo: '',
    sortBy: 'date',
    sortDir: 'desc',
  };

  const [filters, setFilters] = useState<FilterState>({ ...defaultFilters });
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [presetName, setPresetName] = useState('');

  /* Load saved presets from localStorage */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`saguaro_filters_obs_${projectId}`);
      if (stored) setSavedPresets(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const persistPresets = (presets: SavedPreset[]) => {
    setSavedPresets(presets);
    try { localStorage.setItem(`saguaro_filters_obs_${projectId}`, JSON.stringify(presets)); } catch { /* ignore */ }
  };

  const saveCurrentPreset = () => {
    if (!presetName.trim()) return;
    const newPresets = [...savedPresets.filter(p => p.name !== presetName.trim()), { name: presetName.trim(), filters: { ...filters } }];
    persistPresets(newPresets);
    setPresetName('');
    setActionMsg('Filter preset saved');
    setTimeout(() => setActionMsg(''), 2500);
  };

  const deletePreset = (name: string) => {
    persistPresets(savedPresets.filter(p => p.name !== name));
  };

  const applyPreset = (preset: SavedPreset) => {
    setFilters({ ...preset.filters });
  };

  const clearFilters = () => {
    setFilters({ ...defaultFilters });
  };

  const filtersActive = useMemo(() => {
    return filters.statuses.length > 0 || filters.types.length > 0 || filters.priorities.length > 0
      || filters.observedBy.trim() !== '' || filters.dateFrom !== '' || filters.dateTo !== '';
  }, [filters]);

  const toggleArrayFilter = <T extends string>(arr: T[], val: T): T[] => {
    return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
  };

  /* Quick presets */
  const quickPresets: { label: string; icon: string; apply: () => void }[] = [
    {
      label: 'Open Items', icon: '📂',
      apply: () => setFilters({ ...defaultFilters, statuses: ['open'] }),
    },
    {
      label: 'Safety Issues', icon: '🦺',
      apply: () => setFilters({ ...defaultFilters, types: ['negative'], priorities: ['high', 'critical'] }),
    },
    {
      label: 'This Week', icon: '📅',
      apply: () => {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
        monday.setHours(0, 0, 0, 0);
        setFilters({ ...defaultFilters, dateFrom: monday.toISOString().split('T')[0], dateTo: now.toISOString().split('T')[0] });
      },
    },
    {
      label: 'Needs Action', icon: '⚡',
      apply: () => setFilters({ ...defaultFilters, statuses: ['open'], priorities: ['high', 'critical'] }),
    },
  ];

  /* Create form state */
  const [newType, setNewType] = useState<ObsType>('positive');
  const [newTemplate, setNewTemplate] = useState<string>('');
  const [newLocation, setNewLocation] = useState('');
  const [newLat, setNewLat] = useState<number | null>(null);
  const [newLng, setNewLng] = useState<number | null>(null);
  const [newTrade, setNewTrade] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('low');
  const [newDescription, setNewDescription] = useState('');
  const [newChecklist, setNewChecklist] = useState<ChecklistItem[]>([]);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [newPhotosPreviews, setNewPhotosPreviews] = useState<string[]>([]);
  const [newCorrectiveReq, setNewCorrectiveReq] = useState(false);
  const [newCAAssignee, setNewCAAssignee] = useState('');
  const [newCADue, setNewCADue] = useState('');
  const [newCADesc, setNewCADesc] = useState('');
  const [customCheckItem, setCustomCheckItem] = useState('');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  /* ─── Data Fetch ─── */
  const fetchObservations = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/observations`);
      if (res.ok) {
        const data = await res.json();
        setObservations(Array.isArray(data) ? data : data.observations || []);
      }
    } catch { /* offline */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchObservations(); }, [fetchObservations]);

  useEffect(() => {
    const h1 = () => setOnline(true);
    const h0 = () => setOnline(false);
    window.addEventListener('online', h1);
    window.addEventListener('offline', h0);
    setOnline(navigator.onLine);
    return () => { window.removeEventListener('online', h1); window.removeEventListener('offline', h0); };
  }, []);

  /* Auto-capture GPS on create */
  useEffect(() => {
    if (view === 'create' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { setNewLat(pos.coords.latitude); setNewLng(pos.coords.longitude); },
        () => { /* permission denied or unavailable */ },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    }
  }, [view]);

  /* ─── Template Picker ─── */
  const applyTemplate = (t: Template) => {
    setNewTemplate(t.name);
    setNewChecklist(t.items.map(text => ({ id: uid(), text, result: 'pass' as CheckResult })));
    setShowTemplatePicker(false);
  };

  /* ─── Photo Handling ─── */
  const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setNewPhotos(prev => [...prev, ...files]);
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => setNewPhotosPreviews(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(f);
    });
  };
  const removePhoto = (idx: number) => {
    setNewPhotos(prev => prev.filter((_, i) => i !== idx));
    setNewPhotosPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  /* ─── Add Custom Check Item ─── */
  const addCustomCheck = () => {
    if (!customCheckItem.trim()) return;
    setNewChecklist(prev => [...prev, { id: uid(), text: customCheckItem.trim(), result: 'pass' }]);
    setCustomCheckItem('');
  };

  const removeCheckItem = (id: string) => {
    setNewChecklist(prev => prev.filter(c => c.id !== id));
  };

  const toggleCheckResult = (id: string) => {
    setNewChecklist(prev => prev.map(c => {
      if (c.id !== id) return c;
      const cycle: CheckResult[] = ['pass', 'fail', 'na'];
      const next = cycle[(cycle.indexOf(c.result) + 1) % cycle.length];
      return { ...c, result: next };
    }));
  };

  /* ─── Create Observation ─── */
  const resetForm = () => {
    setNewType('positive'); setNewTemplate(''); setNewLocation('');
    setNewLat(null); setNewLng(null); setNewTrade(''); setNewPriority('low');
    setNewDescription(''); setNewChecklist([]); setNewPhotos([]);
    setNewPhotosPreviews([]); setNewCorrectiveReq(false);
    setNewCAAssignee(''); setNewCADue(''); setNewCADesc('');
    setCustomCheckItem(''); setShowTemplatePicker(false);
  };

  const submitObservation = async () => {
    if (!newDescription.trim()) {
      setActionMsg('Description is required');
      setTimeout(() => setActionMsg(''), 3000);
      return;
    }
    setSaving(true);
    const obs: Partial<Observation> = {
      type: newType,
      template: newTemplate || undefined,
      category: newTemplate ? TEMPLATES.find(t => t.name === newTemplate)?.category : undefined,
      location: newLocation || undefined,
      lat: newLat ?? undefined,
      lng: newLng ?? undefined,
      trade: newTrade || undefined,
      priority: newPriority,
      description: newDescription,
      checklist: newChecklist.length > 0 ? newChecklist : undefined,
      corrective_required: newCorrectiveReq,
      corrective_action: newCorrectiveReq ? {
        assignee: newCAAssignee,
        due_date: newCADue,
        description: newCADesc,
        status: 'assigned' as CAStatus,
      } : undefined,
      status: newCorrectiveReq ? 'open' : 'closed',
    };

    const url = `/api/projects/${projectId}/observations`;
    try {
      if (!online) {
        await enqueue({ url, method: 'POST', body: JSON.stringify(obs), contentType: 'application/json', isFormData: false });
        const local: Observation = { ...obs, id: uid(), created_at: new Date().toISOString() } as Observation;
        setObservations(prev => [local, ...prev]);
        setActionMsg('Saved offline — will sync when connected');
      } else {
        const res = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(obs),
        });
        if (res.ok) {
          const created = await res.json();
          setObservations(prev => [created, ...prev]);
          setActionMsg('Observation recorded');
        } else {
          await enqueue({ url, method: 'POST', body: JSON.stringify(obs), contentType: 'application/json', isFormData: false });
          setActionMsg('Server error — queued offline');
        }
      }
    } catch {
      await enqueue({ url, method: 'POST', body: JSON.stringify(obs), contentType: 'application/json', isFormData: false });
      setActionMsg('Network error — queued offline');
    }

    // Upload photos separately if any
    if (newPhotos.length > 0 && online) {
      for (const photo of newPhotos) {
        const fd = new FormData();
        fd.append('file', photo);
        try {
          await fetch(`${url}/photos`, { method: 'POST', body: fd });
        } catch { /* queued separately if needed */ }
      }
    }

    setSaving(false);
    resetForm();
    setView('list');
    setTimeout(() => setActionMsg(''), 3000);
  };

  /* ─── Update Corrective Action Status ─── */
  const updateCAStatus = async (obs: Observation, newStatus: CAStatus) => {
    const url = `/api/projects/${projectId}/observations/${obs.id}`;
    const patch = {
      corrective_action: { ...obs.corrective_action, status: newStatus },
      status: newStatus === 'verified' ? 'closed' : 'open',
    };
    try {
      if (online) {
        const res = await fetch(url, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const updated = await res.json();
          setObservations(prev => prev.map(o => o.id === obs.id ? { ...o, ...updated } : o));
          setSelected(prev => prev?.id === obs.id ? { ...prev, ...updated } : prev);
          setActionMsg('Status updated');
        }
      } else {
        await enqueue({ url, method: 'PATCH', body: JSON.stringify(patch), contentType: 'application/json', isFormData: false });
        setObservations(prev => prev.map(o => o.id === obs.id ? { ...o, ...patch, corrective_action: { ...o.corrective_action!, status: newStatus } } : o));
        setSelected(prev => prev?.id === obs.id ? { ...prev, ...patch, corrective_action: { ...prev.corrective_action!, status: newStatus } } : prev);
        setActionMsg('Queued offline');
      }
    } catch {
      await enqueue({ url, method: 'PATCH', body: JSON.stringify(patch), contentType: 'application/json', isFormData: false });
      setActionMsg('Queued offline');
    }
    setTimeout(() => setActionMsg(''), 3000);
  };

  /* ─── Computed Stats ─── */
  const stats = React.useMemo(() => {
    const total = observations.length;
    const positive = observations.filter(o => o.type === 'positive').length;
    const negative = observations.filter(o => o.type === 'negative').length;
    const conditions = observations.filter(o => o.type === 'condition').length;
    const openCA = observations.filter(o => o.corrective_required && o.corrective_action?.status !== 'verified').length;
    const positiveRate = total > 0 ? Math.round((positive / total) * 100) : 0;
    return { total, positive, negative, conditions, openCA, positiveRate };
  }, [observations]);

  /* ─── Filtered & Sorted List ─── */
  const filtered = React.useMemo(() => {
    const priorityOrder: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
    const statusOrder: Record<string, number> = { open: 0, closed: 1 };
    const typeOrder: Record<string, number> = { positive: 0, negative: 1, condition: 2 };

    const result = observations.filter(o => {
      if (filters.statuses.length > 0 && !filters.statuses.includes(o.status || 'open')) return false;
      if (filters.types.length > 0 && !filters.types.includes(o.type)) return false;
      if (filters.priorities.length > 0 && !filters.priorities.includes(o.priority)) return false;
      if (filters.observedBy.trim()) {
        const search = filters.observedBy.toLowerCase();
        if (!(o.created_by || '').toLowerCase().includes(search)) return false;
      }
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom);
        const created = o.created_at ? new Date(o.created_at) : null;
        if (!created || created < from) return false;
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        const created = o.created_at ? new Date(o.created_at) : null;
        if (!created || created > to) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      let cmp = 0;
      switch (filters.sortBy) {
        case 'date': {
          const da = a.created_at ? new Date(a.created_at).getTime() : 0;
          const db = b.created_at ? new Date(b.created_at).getTime() : 0;
          cmp = da - db;
          break;
        }
        case 'priority':
          cmp = (priorityOrder[a.priority] ?? 0) - (priorityOrder[b.priority] ?? 0);
          break;
        case 'status':
          cmp = (statusOrder[a.status || 'open'] ?? 0) - (statusOrder[b.status || 'open'] ?? 0);
          break;
        case 'type':
          cmp = (typeOrder[a.type] ?? 0) - (typeOrder[b.type] ?? 0);
          break;
      }
      return filters.sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [observations, filters]);

  /* ─── Render Helpers ─── */
  const Pill = ({ label, color, small }: { label: string; color: string; small?: boolean }) => (
    <span style={{
      background: color + '22', color, borderRadius: 8, padding: small ? '2px 8px' : '4px 12px',
      fontSize: small ? 11 : 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
      whiteSpace: 'nowrap',
    }}>{label}</span>
  );

  const StatCard = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
    <div style={{
      flex: 1, minWidth: 70, background: RAISED, border: `1px solid ${BORDER}`,
      borderRadius: 12, padding: '12px 10px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: DIM, fontWeight: 600, textTransform: 'uppercase', marginTop: 2 }}>{label}</div>
    </div>
  );

  const CheckResultBtn = ({ result, onToggle }: { result: CheckResult; onToggle: () => void }) => {
    const cfg = { pass: { bg: GREEN, label: 'PASS' }, fail: { bg: RED, label: 'FAIL' }, na: { bg: DIM, label: 'N/A' } };
    const c = cfg[result];
    return (
      <button onClick={onToggle} style={{
        ...btnBase, background: c.bg + '33', color: c.bg, padding: '4px 14px',
        fontSize: 11, fontWeight: 800, minWidth: 54, borderRadius: 8,
      }}>{c.label}</button>
    );
  };

  /* ═══════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════ */

  /* ── HEADER ── */
  const renderHeader = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <button onClick={() => {
        if (view === 'list') router.push(`/field?projectId=${projectId}`);
        else { setView('list'); setSelected(null); }
      }} style={{
        background: 'none', border: 'none', color: GOLD, fontSize: 22, cursor: 'pointer',
        padding: '4px 8px', lineHeight: 1,
      }}>←</button>
      <div style={{ flex: 1 }}>
        <h1 style={{ color: GOLD, fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
          Safety Observations
        </h1>
        <div style={{ color: DIM, fontSize: 12, marginTop: 2 }}>
          {view === 'list' ? 'Proactive Safety Program' : view === 'create' ? 'New Observation' : 'Observation Details'}
        </div>
      </div>
      {!online && (
        <span style={{ background: AMBER + '22', color: AMBER, borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>
          OFFLINE
        </span>
      )}
      {view === 'list' && (
        <button onClick={() => { resetForm(); setView('create'); }} style={{
          ...btnBase, background: GOLD, color: '#000',
        }}>+ New</button>
      )}
    </div>
  );

  /* ── DASHBOARD STATS ── */
  const renderStats = () => (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
      <StatCard label="Total" value={stats.total} color={TEXT} />
      <StatCard label="Positive %" value={`${stats.positiveRate}%`} color={GREEN} />
      <StatCard label="Negative" value={stats.negative} color={RED} />
      <StatCard label="Open CAs" value={stats.openCA} color={AMBER} />
    </div>
  );

  /* ── FILTERS ── */
  const obsChipStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(212,160,23,.12)', border: `1px solid rgba(212,160,23,.3)`, borderRadius: 20, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: GOLD, cursor: 'pointer', whiteSpace: 'nowrap' };

  const renderFilters = () => (
    <div style={{ marginBottom: 14 }}>
      {/* Filter button row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <button onClick={() => setFilterDrawerOpen(!filterDrawerOpen)} style={{
          background: filterDrawerOpen || filtersActive ? 'rgba(212,160,23,.15)' : 'transparent',
          border: `1px solid ${filterDrawerOpen || filtersActive ? GOLD : BORDER}`,
          borderRadius: 10, padding: '8px 14px', color: filterDrawerOpen || filtersActive ? GOLD : DIM,
          fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          Filters {filtersActive ? `(active)` : ''}
        </button>
        {filtersActive && (
          <button onClick={clearFilters} style={{
            background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10,
            padding: '8px 12px', color: DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Clear All</button>
        )}
        <span style={{
          marginLeft: 'auto', fontSize: 12, fontWeight: 700,
          color: filtersActive ? GOLD : DIM,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          {filtersActive && <span style={{ background: GOLD + '22', borderRadius: 6, padding: '2px 7px', fontSize: 11 }}>{filtered.length}</span>}
          {filtersActive ? `of ${observations.length}` : `${observations.length} total`}
        </span>
      </div>

      {/* Advanced Filter Panel (sliding drawer) */}
      <div style={{
        maxHeight: filterDrawerOpen ? 1000 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.35s ease-in-out',
      }}>
        <div style={{ background: RAISED, border: `1px solid ${GOLD}44`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
          {/* Type chips */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Type</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {OBS_TYPES.map(t => {
                const active = filters.types.includes(t.key);
                return (
                  <button key={t.key} onClick={() => setFilters(prev => ({ ...prev, types: toggleArrayFilter(prev.types, t.key) }))} style={{
                    background: active ? t.color + '33' : 'transparent',
                    border: `1.5px solid ${active ? t.color : BORDER}`, borderRadius: 20,
                    padding: '5px 12px', color: active ? t.color : DIM, fontSize: 12,
                    fontWeight: active ? 700 : 400, cursor: 'pointer',
                  }}>{t.icon} {t.label}</button>
                );
              })}
            </div>
          </div>
          {/* Priority chips */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Priority</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PRIORITIES.map(p => {
                const active = filters.priorities.includes(p.key);
                return (
                  <button key={p.key} onClick={() => setFilters(prev => ({ ...prev, priorities: toggleArrayFilter(prev.priorities, p.key) }))} style={{
                    background: active ? p.color + '33' : 'transparent',
                    border: `1.5px solid ${active ? p.color : BORDER}`, borderRadius: 20,
                    padding: '5px 12px', color: active ? p.color : DIM, fontSize: 12,
                    fontWeight: active ? 700 : 400, cursor: 'pointer',
                  }}>{p.label}</button>
                );
              })}
            </div>
          </div>
          {/* Status chips */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Status</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { key: 'open', label: 'Open', color: AMBER },
                { key: 'in_progress', label: 'In Progress', color: BLUE },
                { key: 'resolved', label: 'Resolved', color: GREEN },
                { key: 'closed', label: 'Closed', color: DIM },
              ].map(s => (
                <button key={s.key} onClick={() => setFilters(prev => ({ ...prev, statuses: toggleArrayFilter(prev.statuses, s.key) }))} style={{
                  background: filters.statuses.includes(s.key) ? s.color + '33' : 'transparent',
                  border: `1px solid ${filters.statuses.includes(s.key) ? s.color : BORDER}`, borderRadius: 20,
                  padding: '5px 12px', color: filters.statuses.includes(s.key) ? s.color : DIM, fontSize: 12,
                  fontWeight: filters.statuses.includes(s.key) ? 700 : 400, cursor: 'pointer',
                }}>{s.label}</button>
              ))}
            </div>
          </div>
          {/* Trade filter */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Observed By</label>
            <input value={filters.observedBy} onChange={e => setFilters(prev => ({ ...prev, observedBy: e.target.value }))} placeholder="Filter by observer..." style={{ ...inputStyle, fontSize: 13, padding: '8px 12px' }} />
          </div>
          {/* Date range */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Date Range</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" value={filters.dateFrom} onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))} style={{ ...inputStyle, fontSize: 12, padding: '6px 8px', flex: 1, colorScheme: 'dark' }} />
              <span style={{ color: DIM, fontSize: 12 }}>to</span>
              <input type="date" value={filters.dateTo} onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value }))} style={{ ...inputStyle, fontSize: 12, padding: '6px 8px', flex: 1, colorScheme: 'dark' }} />
            </div>
          </div>
          {/* Sort */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Sort By</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={filters.sortBy} onChange={e => setFilters(prev => ({ ...prev, sortBy: e.target.value as SortField }))} style={{ ...inputStyle, fontSize: 13, padding: '8px 12px', flex: 1 }}>
                <option value="date">Date</option>
                <option value="priority">Priority</option>
                <option value="type">Type</option>
                <option value="status">Status</option>
              </select>
              <button onClick={() => setFilters(prev => ({ ...prev, sortDir: prev.sortDir === 'asc' ? 'desc' : 'asc' }))} style={{
                background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10,
                padding: '8px 12px', color: DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>{filters.sortDir === 'asc' ? 'Asc' : 'Desc'}</button>
            </div>
          </div>
          {/* Quick Presets */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Quick Presets</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {quickPresets.map(qp => (
                <button key={qp.label} onClick={qp.apply} style={obsChipStyle}>{qp.icon} {qp.label}</button>
              ))}
            </div>
          </div>
          {/* Save Preset */}
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10, marginTop: 6 }}>
            <label style={labelStyle}>Save Current as Preset</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="Preset name..." style={{ ...inputStyle, fontSize: 12, padding: '6px 10px', flex: 1 }} />
              <button onClick={saveCurrentPreset} disabled={!presetName.trim()} style={{
                background: presetName.trim() ? GOLD : '#1E3A5F', border: 'none', borderRadius: 8,
                padding: '6px 14px', color: presetName.trim() ? '#000' : DIM, fontSize: 12, fontWeight: 700, cursor: presetName.trim() ? 'pointer' : 'not-allowed',
              }}>Save</button>
            </div>
          </div>
          {savedPresets.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <label style={labelStyle}>Saved Presets</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {savedPresets.map((p) => (
                  <span key={p.name} style={{ ...obsChipStyle, gap: 6 }}>
                    <span onClick={() => applyPreset(p)} style={{ cursor: 'pointer' }}>{p.name}</span>
                    <span onClick={() => deletePreset(p.name)} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 13, lineHeight: 1 }}>&times;</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active filter chips */}
      {filtersActive && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {filters.types.map(t => (
            <span key={t} style={obsChipStyle}>
              {t} <span onClick={() => setFilters(prev => ({ ...prev, types: prev.types.filter(v => v !== t) }))} style={{ cursor: 'pointer', marginLeft: 2, fontSize: 13 }}>&times;</span>
            </span>
          ))}
          {filters.priorities.map(p => (
            <span key={p} style={obsChipStyle}>
              {p} <span onClick={() => setFilters(prev => ({ ...prev, priorities: prev.priorities.filter(v => v !== p) }))} style={{ cursor: 'pointer', marginLeft: 2, fontSize: 13 }}>&times;</span>
            </span>
          ))}
          {filters.statuses.map(s => (
            <span key={s} style={obsChipStyle}>
              {s} <span onClick={() => setFilters(prev => ({ ...prev, statuses: prev.statuses.filter(v => v !== s) }))} style={{ cursor: 'pointer', marginLeft: 2, fontSize: 13 }}>&times;</span>
            </span>
          ))}
          {filters.observedBy && (
            <span style={obsChipStyle}>
              Observer: {filters.observedBy} <span onClick={() => setFilters(prev => ({ ...prev, observedBy: '' }))} style={{ cursor: 'pointer', marginLeft: 2, fontSize: 13 }}>&times;</span>
            </span>
          )}
          {(filters.dateFrom || filters.dateTo) && (
            <span style={obsChipStyle}>
              Date: {filters.dateFrom || '...'} - {filters.dateTo || '...'} <span onClick={() => setFilters(prev => ({ ...prev, dateFrom: '', dateTo: '' }))} style={{ cursor: 'pointer', marginLeft: 2, fontSize: 13 }}>&times;</span>
            </span>
          )}
        </div>
      )}
    </div>
  );

  /* ── TYPE STATS BAR ── */
  const renderTypeBar = () => {
    if (stats.total === 0) return null;
    const pW = (stats.positive / stats.total) * 100;
    const nW = (stats.negative / stats.total) * 100;
    const cW = (stats.conditions / stats.total) * 100;
    return (
      <div style={{ ...cardStyle, padding: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 4, height: 8, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
          {pW > 0 && <div style={{ width: `${pW}%`, background: GREEN, borderRadius: 4 }} />}
          {nW > 0 && <div style={{ width: `${nW}%`, background: RED, borderRadius: 4 }} />}
          {cW > 0 && <div style={{ width: `${cW}%`, background: AMBER, borderRadius: 4 }} />}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: DIM }}>
          <span><span style={{ color: GREEN, fontWeight: 700 }}>{stats.positive}</span> Positive</span>
          <span><span style={{ color: RED, fontWeight: 700 }}>{stats.negative}</span> Negative</span>
          <span><span style={{ color: AMBER, fontWeight: 700 }}>{stats.conditions}</span> Condition</span>
        </div>
      </div>
    );
  };

  /* ── LIST VIEW ── */
  const renderList = () => (
    <>
      {renderStats()}
      {renderTypeBar()}
      {renderFilters()}
      {loading ? (
        <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>Loading observations...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No observations found</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Tap + New to record a safety observation</div>
        </div>
      ) : (
        filtered.map(obs => {
          const tc = typeColor(obs.type);
          return (
            <div key={obs.id} onClick={() => { setSelected(obs); setView('detail'); }}
              style={{
                ...cardStyle, borderLeft: `4px solid ${tc}`, cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Pill label={obs.type} color={tc} />
                <Pill label={obs.priority} color={priorityColor(obs.priority)} small />
                {obs.corrective_required && (
                  <Pill label={obs.corrective_action?.status || 'CA'} color={caStatusColor(obs.corrective_action?.status || 'assigned')} small />
                )}
                <span style={{ marginLeft: 'auto', color: DIM, fontSize: 11 }}>{fmtDate(obs.created_at)}</span>
              </div>
              <div style={{ color: TEXT, fontSize: 14, fontWeight: 600, marginBottom: 4, lineHeight: 1.4 }}>
                {obs.description.length > 120 ? obs.description.slice(0, 120) + '...' : obs.description}
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: DIM, flexWrap: 'wrap' }}>
                {obs.template && <span>📋 {obs.template}</span>}
                {obs.location && <span>📍 {obs.location}</span>}
                {obs.trade && <span>🔧 {obs.trade}</span>}
                {obs.checklist && obs.checklist.length > 0 && (
                  <span>✅ {obs.checklist.filter(c => c.result === 'pass').length}/{obs.checklist.length}</span>
                )}
              </div>
            </div>
          );
        })
      )}
    </>
  );

  /* ── CREATE FORM ── */
  const renderCreate = () => (
    <div>
      {/* Type Selector */}
      <label style={labelStyle}>Observation Type</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {OBS_TYPES.map(t => (
          <button key={t.key} onClick={() => setNewType(t.key)} style={{
            ...btnBase, flex: 1,
            background: newType === t.key ? t.color + '33' : RAISED,
            border: `2px solid ${newType === t.key ? t.color : BORDER}`,
            color: newType === t.key ? t.color : DIM,
            padding: '12px 8px', borderRadius: 12,
          }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{t.icon}</div>
            <div style={{ fontSize: 12 }}>{t.label}</div>
          </button>
        ))}
      </div>

      {/* Template Picker */}
      <label style={labelStyle}>Template (Optional)</label>
      <button onClick={() => setShowTemplatePicker(!showTemplatePicker)} style={{
        ...inputStyle, textAlign: 'left', cursor: 'pointer', marginBottom: showTemplatePicker ? 0 : 16,
        color: newTemplate ? TEXT : DIM,
      }}>
        {newTemplate || 'Select a template...'}
      </button>
      {showTemplatePicker && (
        <div style={{
          ...cardStyle, maxHeight: 280, overflowY: 'auto', marginTop: 4, marginBottom: 16, padding: 8,
        }}>
          {TEMPLATES.map(t => (
            <button key={t.name} onClick={() => applyTemplate(t)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              background: newTemplate === t.name ? GOLD + '22' : 'transparent',
              border: `1px solid ${newTemplate === t.name ? GOLD : 'transparent'}`,
              borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
              color: TEXT, textAlign: 'left', marginBottom: 4,
            }}>
              <span style={{ fontSize: 22 }}>{t.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</div>
                <div style={{ fontSize: 11, color: DIM }}>{t.category} — {t.items.length} items</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Location */}
      <label style={labelStyle}>Location</label>
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <input value={newLocation} onChange={e => setNewLocation(e.target.value)}
          placeholder="e.g., 3rd Floor, Zone B, Grid C-4"
          style={inputStyle}
        />
        {newLat && newLng && (
          <div style={{ fontSize: 10, color: DIM, marginTop: 4 }}>
            GPS: {newLat.toFixed(6)}, {newLng.toFixed(6)}
          </div>
        )}
      </div>

      {/* Trade */}
      <label style={labelStyle}>Trade / Subcontractor</label>
      <select value={newTrade} onChange={e => setNewTrade(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }}>
        <option value="">Select trade...</option>
        {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      {/* Priority */}
      <label style={labelStyle}>Priority</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {PRIORITIES.map(p => (
          <button key={p.key} onClick={() => setNewPriority(p.key)} style={{
            ...btnBase, flex: 1,
            background: newPriority === p.key ? p.color + '33' : RAISED,
            border: `2px solid ${newPriority === p.key ? p.color : BORDER}`,
            color: newPriority === p.key ? p.color : DIM,
            padding: '8px 6px', fontSize: 11, borderRadius: 10,
          }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Description */}
      <label style={labelStyle}>Description</label>
      <textarea value={newDescription} onChange={e => setNewDescription(e.target.value)}
        placeholder="Describe what you observed..."
        rows={4}
        style={{ ...inputStyle, resize: 'vertical', marginBottom: 16, fontFamily: 'inherit' }}
      />

      {/* Checklist */}
      <label style={labelStyle}>Checklist Items ({newChecklist.length})</label>
      <div style={{ marginBottom: 16 }}>
        {newChecklist.map(item => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
            background: '#0A1628', borderRadius: 10, padding: '8px 12px',
            border: `1px solid ${item.result === 'fail' ? RED + '44' : BORDER}`,
          }}>
            <CheckResultBtn result={item.result} onToggle={() => toggleCheckResult(item.id)} />
            <span style={{ flex: 1, color: TEXT, fontSize: 13 }}>{item.text}</span>
            <button onClick={() => removeCheckItem(item.id)} style={{
              background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 16,
              padding: '2px 6px',
            }}>×</button>
          </div>
        ))}
        {/* Add custom item */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input value={customCheckItem} onChange={e => setCustomCheckItem(e.target.value)}
            placeholder="Add custom checklist item..."
            onKeyDown={e => e.key === 'Enter' && addCustomCheck()}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={addCustomCheck} style={{
            ...btnBase, background: BORDER, color: TEXT, padding: '8px 14px',
          }}>+</button>
        </div>
      </div>

      {/* Photo Capture */}
      <label style={labelStyle}>Photos</label>
      <div style={{ marginBottom: 16 }}>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
          multiple onChange={handlePhotos}
          style={{ display: 'none' }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {newPhotosPreviews.map((src, i) => (
            <div key={i} style={{ position: 'relative', width: 72, height: 72 }}>
              <img src={src} alt="" style={{
                width: 72, height: 72, objectFit: 'cover', borderRadius: 10,
                border: `1px solid ${BORDER}`,
              }} />
              <button onClick={() => removePhoto(i)} style={{
                position: 'absolute', top: -6, right: -6,
                background: RED, color: '#fff', border: 'none', borderRadius: '50%',
                width: 20, height: 20, fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>×</button>
            </div>
          ))}
          <button onClick={() => fileInputRef.current?.click()} style={{
            width: 72, height: 72, background: '#0A1628', border: `2px dashed ${BORDER}`,
            borderRadius: 10, color: DIM, fontSize: 24, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>📷</button>
        </div>
      </div>

      {/* Corrective Action Toggle */}
      <div style={{
        ...cardStyle, padding: 14, marginBottom: newCorrectiveReq ? 0 : 16,
        border: `1px solid ${newCorrectiveReq ? AMBER : BORDER}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => setNewCorrectiveReq(!newCorrectiveReq)}>
          <div style={{
            width: 44, height: 24, borderRadius: 12, padding: 2,
            background: newCorrectiveReq ? AMBER : BORDER,
            transition: 'background 0.2s', display: 'flex', alignItems: 'center',
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%', background: '#fff',
              transition: 'transform 0.2s',
              transform: newCorrectiveReq ? 'translateX(20px)' : 'translateX(0)',
            }} />
          </div>
          <div>
            <div style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>Corrective Action Required</div>
            <div style={{ color: DIM, fontSize: 11 }}>Assign follow-up action to resolve this observation</div>
          </div>
        </div>
      </div>

      {/* Corrective Action Fields */}
      {newCorrectiveReq && (
        <div style={{
          ...cardStyle, marginTop: 4, marginBottom: 16, borderColor: AMBER + '44',
          background: '#0A1628',
        }}>
          <label style={labelStyle}>Assignee</label>
          <input value={newCAAssignee} onChange={e => setNewCAAssignee(e.target.value)}
            placeholder="Who is responsible?"
            style={{ ...inputStyle, marginBottom: 12 }}
          />
          <label style={labelStyle}>Due Date</label>
          <input type="date" value={newCADue} onChange={e => setNewCADue(e.target.value)}
            style={{ ...inputStyle, marginBottom: 12, colorScheme: 'dark' }}
          />
          <label style={labelStyle}>Action Description</label>
          <textarea value={newCADesc} onChange={e => setNewCADesc(e.target.value)}
            placeholder="Describe the corrective action needed..."
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>
      )}

      {/* Submit */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 30 }}>
        <button onClick={() => { resetForm(); setView('list'); }} style={{
          ...btnBase, flex: 1, background: BORDER, color: TEXT,
        }}>Cancel</button>
        <button onClick={submitObservation} disabled={saving} style={{
          ...btnBase, flex: 2, background: GOLD, color: '#000',
          opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Saving...' : 'Submit Observation'}
        </button>
      </div>
    </div>
  );

  /* ── DETAIL VIEW ── */
  const renderDetail = () => {
    if (!selected) return null;
    const tc = typeColor(selected.type);
    const failItems = selected.checklist?.filter(c => c.result === 'fail') || [];

    return (
      <div>
        {/* Export PDF */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button onClick={() => {
            const obs = selected;
            const checklistHtml = (obs.checklist || []).map(item => {
              const resultLabel = item.result === 'pass' ? 'PASS' : item.result === 'fail' ? 'FAIL' : 'N/A';
              const resultClass = item.result === 'pass' ? 'pass' : item.result === 'fail' ? 'fail' : 'na';
              return `<tr><td>${item.text}</td><td class="${resultClass}"><strong>${resultLabel}</strong></td><td>${item.note || '—'}</td></tr>`;
            }).join('');
            const photosHtml = (obs.photo_urls || []).map(url =>
              `<img src="${url}" alt="Observation photo" />`
            ).join('');
            const caHtml = obs.corrective_action
              ? `<h2>Corrective Action</h2><table>
                  <tr><th>Description</th><td>${obs.corrective_action.description || '—'}</td></tr>
                  <tr><th>Assignee</th><td>${obs.corrective_action.assignee || '—'}</td></tr>
                  <tr><th>Due Date</th><td>${obs.corrective_action.due_date || '—'}</td></tr>
                  <tr><th>Status</th><td>${obs.corrective_action.status || '—'}</td></tr>
                </table>` : '';
            exportPDF(`Observation - ${obs.type}`, `
              <h1>Safety Observation Report</h1>
              <table>
                <tr><th>Type</th><td>${obs.type}</td></tr>
                <tr><th>Priority</th><td>${obs.priority}</td></tr>
                <tr><th>Status</th><td>${obs.status || 'open'}</td></tr>
                ${obs.template ? `<tr><th>Template</th><td>${obs.template}</td></tr>` : ''}
                ${obs.category ? `<tr><th>Category</th><td>${obs.category}</td></tr>` : ''}
                ${obs.location ? `<tr><th>Location</th><td>${obs.location}</td></tr>` : ''}
                ${obs.trade ? `<tr><th>Trade</th><td>${obs.trade}</td></tr>` : ''}
                <tr><th>Date</th><td>${fmtDateTime(obs.created_at)}</td></tr>
              </table>
              <h2>Description</h2>
              <div class="section"><p>${(obs.description || '').replace(/\n/g, '<br/>')}</p></div>
              ${(obs.checklist || []).length > 0 ? `
                <h2>Checklist</h2>
                <table><tr><th>Item</th><th>Result</th><th>Notes</th></tr>${checklistHtml}</table>
              ` : ''}
              ${caHtml}
              ${photosHtml ? `<h2>Photos</h2>${photosHtml}` : ''}
            `);
          }} style={{
            background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10,
            padding: '8px 14px', color: DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <PdfIcon /> Export PDF
          </button>
          <button onClick={() => setShowEmail(true)} style={{
            background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.3)', borderRadius: 10,
            padding: '8px 14px', color: GOLD, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
            </svg>
            Email Report
          </button>
        </div>

        {showEmail && (
          <EmailComposer
            projectId={projectId}
            onClose={() => setShowEmail(false)}
            onSent={() => { setShowEmail(false); setActionMsg('Email sent successfully'); setTimeout(() => setActionMsg(''), 3500); }}
            defaultSubject={`Safety Observation - ${selected.type} - ${fmtDate(selected.created_at)}`}
            defaultBody={[
              `Safety Observation Report`,
              `Type: ${selected.type}`,
              `Priority: ${selected.priority}`,
              `Status: ${selected.status || 'open'}`,
              selected.created_at ? `Date: ${fmtDateTime(selected.created_at)}` : '',
              selected.location ? `Location: ${selected.location}` : '',
              selected.trade ? `Trade: ${selected.trade}` : '',
              selected.category ? `Category: ${selected.category}` : '',
              selected.template ? `Template: ${selected.template}` : '',
              '',
              'Description:',
              selected.description,
              '',
              ...(selected.corrective_required && selected.corrective_action ? [
                'Corrective Action:',
                `  Description: ${selected.corrective_action.description}`,
                selected.corrective_action.assignee ? `  Assignee: ${selected.corrective_action.assignee}` : '',
                selected.corrective_action.due_date ? `  Due: ${fmtDate(selected.corrective_action.due_date)}` : '',
                `  Status: ${selected.corrective_action.status}`,
              ] : []),
              '',
              ...(selected.checklist && selected.checklist.length > 0 ? [
                `Checklist: ${selected.checklist.filter(c => c.result === 'pass').length}/${selected.checklist.length} passed`,
              ] : []),
            ].filter(Boolean).join('\n')}
            module="observations"
            itemId={selected.id}
            itemTitle={selected.description.slice(0, 60)}
          />
        )}

        {/* Type & Status Header */}
        <div style={{ ...cardStyle, borderLeft: `4px solid ${tc}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <Pill label={selected.type} color={tc} />
            <Pill label={selected.priority} color={priorityColor(selected.priority)} />
            <Pill label={selected.status || 'open'} color={selected.status === 'closed' ? GREEN : AMBER} />
          </div>
          <div style={{ color: TEXT, fontSize: 15, fontWeight: 600, lineHeight: 1.5, marginBottom: 8 }}>
            {selected.description}
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: DIM, flexWrap: 'wrap' }}>
            <span>🕐 {fmtDateTime(selected.created_at)}</span>
            {selected.template && <span>📋 {selected.template}</span>}
          </div>
        </div>

        {/* Info Grid */}
        <div style={{ ...cardStyle }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {selected.location && (
              <div>
                <div style={{ ...labelStyle, marginBottom: 2 }}>Location</div>
                <div style={{ color: TEXT, fontSize: 13 }}>{selected.location}</div>
              </div>
            )}
            {selected.trade && (
              <div>
                <div style={{ ...labelStyle, marginBottom: 2 }}>Trade</div>
                <div style={{ color: TEXT, fontSize: 13 }}>{selected.trade}</div>
              </div>
            )}
            {selected.category && (
              <div>
                <div style={{ ...labelStyle, marginBottom: 2 }}>Category</div>
                <div style={{ color: TEXT, fontSize: 13 }}>{selected.category}</div>
              </div>
            )}
            {selected.lat && selected.lng && (
              <div>
                <div style={{ ...labelStyle, marginBottom: 2 }}>GPS</div>
                <div style={{ color: TEXT, fontSize: 12 }}>{selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}</div>
              </div>
            )}
          </div>
        </div>

        {/* Checklist */}
        {selected.checklist && selected.checklist.length > 0 && (
          <div style={cardStyle}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>
              Checklist ({selected.checklist.filter(c => c.result === 'pass').length}/{selected.checklist.length} passed)
            </div>
            {selected.checklist.map(item => {
              const cfg = { pass: { color: GREEN, icon: '✓' }, fail: { color: RED, icon: '✗' }, na: { color: DIM, icon: '—' } };
              const c = cfg[item.result];
              return (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                  borderBottom: `1px solid ${BORDER}22`,
                }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: 8, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: c.color + '22', color: c.color, fontWeight: 800, fontSize: 14,
                  }}>{c.icon}</span>
                  <span style={{
                    color: item.result === 'fail' ? RED : TEXT, fontSize: 13, flex: 1,
                    fontWeight: item.result === 'fail' ? 600 : 400,
                  }}>{item.text}</span>
                </div>
              );
            })}
            {failItems.length > 0 && (
              <div style={{
                marginTop: 10, padding: '8px 12px', background: RED + '11',
                borderRadius: 8, border: `1px solid ${RED}33`,
              }}>
                <span style={{ color: RED, fontSize: 12, fontWeight: 700 }}>
                  {failItems.length} item{failItems.length > 1 ? 's' : ''} failed
                </span>
              </div>
            )}
          </div>
        )}

        {/* Photo Gallery */}
        {selected.photo_urls && selected.photo_urls.length > 0 && (
          <div style={cardStyle}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>Photos ({selected.photo_urls.length})</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {selected.photo_urls.map((url, i) => (
                <img key={i} src={url} alt={`Photo ${i + 1}`} style={{
                  width: 100, height: 100, objectFit: 'cover', borderRadius: 10,
                  border: `1px solid ${BORDER}`,
                }} />
              ))}
            </div>
          </div>
        )}

        {/* Corrective Action */}
        {selected.corrective_required && selected.corrective_action && (
          <div style={{
            ...cardStyle, borderColor: caStatusColor(selected.corrective_action.status) + '66',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ color: AMBER, fontSize: 16 }}>⚡</span>
              <span style={{ color: TEXT, fontSize: 15, fontWeight: 700, flex: 1 }}>Corrective Action</span>
              <Pill label={selected.corrective_action.status} color={caStatusColor(selected.corrective_action.status)} />
            </div>
            {selected.corrective_action.description && (
              <div style={{ color: TEXT, fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                {selected.corrective_action.description}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {selected.corrective_action.assignee && (
                <div>
                  <div style={{ ...labelStyle, marginBottom: 2 }}>Assignee</div>
                  <div style={{ color: TEXT, fontSize: 13 }}>{selected.corrective_action.assignee}</div>
                </div>
              )}
              {selected.corrective_action.due_date && (
                <div>
                  <div style={{ ...labelStyle, marginBottom: 2 }}>Due Date</div>
                  <div style={{ color: TEXT, fontSize: 13 }}>{fmtDate(selected.corrective_action.due_date)}</div>
                </div>
              )}
            </div>

            {/* Status Progression Buttons */}
            <div style={{ ...labelStyle, marginBottom: 8 }}>Update Status</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CA_STATUSES.map(s => {
                const isCurrent = selected.corrective_action!.status === s.key;
                return (
                  <button key={s.key}
                    onClick={() => !isCurrent && updateCAStatus(selected, s.key)}
                    disabled={isCurrent}
                    style={{
                      ...btnBase, flex: 1, minWidth: 80,
                      background: isCurrent ? s.color + '33' : RAISED,
                      border: `2px solid ${isCurrent ? s.color : BORDER}`,
                      color: isCurrent ? s.color : DIM,
                      padding: '8px 6px', fontSize: 11, borderRadius: 10,
                      opacity: isCurrent ? 1 : 0.8,
                      cursor: isCurrent ? 'default' : 'pointer',
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Back */}
        <button onClick={() => { setView('list'); setSelected(null); }} style={{
          ...btnBase, width: '100%', background: BORDER, color: TEXT, marginTop: 6, marginBottom: 30,
        }}>Back to List</button>
      </div>
    );
  };

  /* ── MAIN RENDER ── */
  return (
    <div style={{
      minHeight: '100vh', background: '#070F1B', color: TEXT,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '16px 16px 40px',
      maxWidth: 600, margin: '0 auto',
    }}>
      {renderHeader()}

      {/* Action message toast */}
      {actionMsg && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: RAISED, border: `1px solid ${GOLD}`, borderRadius: 12,
          padding: '10px 20px', color: GOLD, fontSize: 13, fontWeight: 700,
          zIndex: 1000, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>{actionMsg}</div>
      )}

      {view === 'list' && renderList()}
      {view === 'create' && renderCreate()}
      {view === 'detail' && renderDetail()}
    </div>
  );
}

/* ─── Suspense Wrapper ─── */
export default function ObservationsPageWrapper() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh', background: '#070F1B', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <div style={{ color: '#D4A017', fontSize: 16, fontWeight: 700 }}>Loading Observations...</div>
      </div>
    }>
      <ObservationsPage />
    </Suspense>
  );
}
