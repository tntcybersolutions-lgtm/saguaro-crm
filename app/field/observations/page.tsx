'use client';
/**
 * Saguaro Field — Proactive Safety Observations
 * Capture positive, negative, and condition-based safety observations.
 * Templates, checklists, corrective actions, photo capture, GPS, offline queue.
 */
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

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

const TRADES = [
  'General Contractor', 'Electrical', 'Plumbing', 'HVAC', 'Structural Steel',
  'Concrete', 'Masonry', 'Roofing', 'Drywall / Framing', 'Painting',
  'Fire Protection', 'Elevator', 'Landscaping', 'Earthwork / Grading',
  'Glazing', 'Flooring', 'Insulation', 'Demolition', 'Other',
];

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

  /* Filters */
  const [filterType, setFilterType] = useState<ObsType | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

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

  /* ─── Filtered List ─── */
  const filtered = React.useMemo(() => {
    return observations.filter(o => {
      if (filterType !== 'all' && o.type !== filterType) return false;
      if (filterPriority !== 'all' && o.priority !== filterPriority) return false;
      if (filterStatus === 'open' && o.status !== 'open') return false;
      if (filterStatus === 'closed' && o.status !== 'closed') return false;
      return true;
    });
  }, [observations, filterType, filterPriority, filterStatus]);

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
  const renderFilters = () => (
    <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
      {/* Type filter */}
      <select value={filterType} onChange={e => setFilterType(e.target.value as ObsType | 'all')} style={{
        ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: 12, borderRadius: 8,
      }}>
        <option value="all">All Types</option>
        {OBS_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
      </select>
      {/* Priority filter */}
      <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as Priority | 'all')} style={{
        ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: 12, borderRadius: 8,
      }}>
        <option value="all">All Priorities</option>
        {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      {/* Status filter */}
      <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{
        ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: 12, borderRadius: 8,
      }}>
        <option value="all">All Status</option>
        <option value="open">Open</option>
        <option value="closed">Closed</option>
      </select>
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
