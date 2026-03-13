'use client';
/**
 * Saguaro Field — Commissioning / System Startup
 * Track system commissioning phases, checklists, test results, issues, and warranty.
 * Offline queue support via enqueue.
 */
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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

/* ─── Constants ─── */
const SYSTEM_TYPES = ['mechanical', 'electrical', 'plumbing', 'fire_protection', 'controls', 'elevator', 'specialty', 'other'] as const;
const TYPE_LABELS: Record<string, string> = {
  mechanical: 'Mechanical', electrical: 'Electrical', plumbing: 'Plumbing',
  fire_protection: 'Fire Protection', controls: 'Controls', elevator: 'Elevator',
  specialty: 'Specialty', other: 'Other',
};
const TAB_TYPES = ['all', 'mechanical', 'electrical', 'plumbing', 'fire_protection', 'controls', 'elevator'] as const;
const TAB_LABELS: Record<string, string> = {
  all: 'All', mechanical: 'Mechanical', electrical: 'Electrical', plumbing: 'Plumbing',
  fire_protection: 'Fire', controls: 'Controls', elevator: 'Elevator',
};

const PHASES = ['pre_functional', 'functional', 'seasonal', 'deferred'] as const;
const PHASE_LABELS: Record<string, string> = {
  pre_functional: 'Pre-Functional', functional: 'Functional', seasonal: 'Seasonal', deferred: 'Deferred',
};
const PHASE_COLORS: Record<string, string> = {
  pre_functional: BLUE, functional: AMBER, seasonal: GREEN, deferred: DIM,
};

const STATUSES = ['not_started', 'in_progress', 'issues_found', 'passed', 'failed', 'deferred'] as const;
const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started', in_progress: 'In Progress', issues_found: 'Issues Found',
  passed: 'Passed', failed: 'Failed', deferred: 'Deferred',
};
const STATUS_COLORS: Record<string, string> = {
  not_started: DIM, in_progress: BLUE, issues_found: AMBER, passed: GREEN, failed: RED, deferred: DIM,
};

/* ─── Interfaces ─── */
interface ChecklistItem { id: string; text: string; checked: boolean; failed: boolean; notes: string; }
interface TestResult { id: string; test_name: string; expected_value: string; actual_value: string; pass: boolean | null; }
interface Issue { id: string; title: string; description: string; severity: string; assigned_to: string; status: string; created_at: string; resolved_at: string | null; }
interface SystemPhoto { id: string; url: string; caption: string; taken_at: string; }

interface CommissioningSystem {
  id: string;
  system_name: string;
  system_type: string;
  location: string;
  phase: string;
  status: string;
  assigned_to: string;
  scheduled_date: string;
  completed_date: string;
  checklist: ChecklistItem[];
  test_results: TestResult[];
  issues: Issue[];
  equipment_tag: string;
  manufacturer: string;
  model_number: string;
  serial_number: string;
  warranty_start: string;
  warranty_end: string;
  notes: string;
  photos: SystemPhoto[];
}

type View = 'list' | 'new' | 'detail';

function uid(): string { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

/* ─── Small Components ─── */
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}44`, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <h3 style={{ margin: '20px 0 10px', fontSize: 14, fontWeight: 700, color: GOLD, letterSpacing: 0.5, textTransform: 'uppercase' }}>{title}</h3>;
}

function FieldLabel({ text }: { text: string }) {
  return <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4, fontWeight: 600 }}>{text}</label>;
}

function TextInput({ value, onChange, placeholder, type }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type || 'text'} value={value} placeholder={placeholder || ''} onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, background: '#0A1628', color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
    />
  );
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, background: '#0A1628', color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Btn({ label, color, onClick, disabled, full, small }: { label: string; color: string; onClick: () => void; disabled?: boolean; full?: boolean; small?: boolean }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        padding: small ? '6px 14px' : '12px 20px', borderRadius: 10, border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: disabled ? '#1a2a3a' : color, color: '#fff', fontWeight: 700, fontSize: small ? 12 : 14,
        opacity: disabled ? 0.5 : 1, width: full ? '100%' : undefined, whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

/* ─── Warranty Helper ─── */
function warrantyStatus(end: string): { label: string; color: string } {
  if (!end) return { label: 'N/A', color: DIM };
  const now = Date.now();
  const endMs = new Date(end).getTime();
  const daysLeft = Math.ceil((endMs - now) / 86400000);
  if (daysLeft < 0) return { label: 'Expired', color: RED };
  if (daysLeft <= 30) return { label: `${daysLeft}d left`, color: RED };
  if (daysLeft <= 90) return { label: `${daysLeft}d left`, color: AMBER };
  return { label: `${daysLeft}d left`, color: GREEN };
}

/* ─── API Helpers ─── */
async function apiGet(url: string) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch { return null; }
}

async function apiPost(url: string, body: Record<string, unknown>) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch {
    await enqueue({ url, method: 'POST', body: JSON.stringify(body), contentType: 'application/json', isFormData: false });
    return null;
  }
}

async function apiPatch(url: string, body: Record<string, unknown>) {
  try {
    const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch {
    await enqueue({ url, method: 'PATCH', body: JSON.stringify(body), contentType: 'application/json', isFormData: false });
    return null;
  }
}

/* ────────────────────────────────────────────────────────────────────── */
/*  MAIN INNER COMPONENT                                                */
/* ────────────────────────────────────────────────────────────────────── */
function CommissioningInner() {
  const projectId = useSearchParams().get('projectId') || '';
  const base = `/api/projects/${projectId}/commissioning`;

  const [systems, setSystems] = useState<CommissioningSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'checklist' | 'tests' | 'issues' | 'equipment' | 'photos'>('checklist');

  /* ── Filters ── */
  const [typeTab, setTypeTab] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPhase, setFilterPhase] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  /* ── Create Form ── */
  const emptyForm = (): Omit<CommissioningSystem, 'id'> => ({
    system_name: '', system_type: 'mechanical', location: '', phase: 'pre_functional', status: 'not_started',
    assigned_to: '', scheduled_date: '', completed_date: '', checklist: [], test_results: [], issues: [],
    equipment_tag: '', manufacturer: '', model_number: '', serial_number: '', warranty_start: '', warranty_end: '',
    notes: '', photos: [],
  });
  const [form, setForm] = useState(emptyForm());
  const setF = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  /* ── Load ── */
  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    (async () => {
      const data = await apiGet(base);
      if (Array.isArray(data)) setSystems(data);
      setLoading(false);
    })();
  }, [projectId, base]);

  /* ── Filtered list ── */
  const filtered = useMemo(() => {
    return systems.filter((s) => {
      if (typeTab !== 'all' && s.system_type !== typeTab) return false;
      if (filterStatus !== 'all' && s.status !== filterStatus) return false;
      if (filterPhase !== 'all' && s.phase !== filterPhase) return false;
      if (searchTerm && !s.system_name.toLowerCase().includes(searchTerm.toLowerCase()) && !s.equipment_tag.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [systems, typeTab, filterStatus, filterPhase, searchTerm]);

  /* ── Summary ── */
  const summary = useMemo(() => {
    const total = systems.length;
    const passed = systems.filter((s) => s.status === 'passed').length;
    const failed = systems.filter((s) => s.status === 'failed').length;
    const pending = systems.filter((s) => s.status === 'not_started' || s.status === 'in_progress').length;
    const issueCount = systems.reduce((n, s) => n + s.issues.filter((i) => i.status !== 'resolved').length, 0);
    const progress = total ? Math.round((passed / total) * 100) : 0;
    return { total, passed, failed, pending, issueCount, progress };
  }, [systems]);

  /* ── Helpers ── */
  const selected = systems.find((s) => s.id === selectedId) || null;

  const updateSystemLocal = (id: string, patch: Partial<CommissioningSystem>) => {
    setSystems((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
  };

  const patchSystem = async (id: string, patch: Partial<CommissioningSystem>) => {
    updateSystemLocal(id, patch);
    await apiPatch(`${base}/${id}`, patch as Record<string, unknown>);
  };

  /* ── Create ── */
  const handleCreate = async () => {
    if (!form.system_name.trim()) return;
    const newSys: CommissioningSystem = { id: uid(), ...form };
    setSystems((p) => [...p, newSys]);
    setView('list');
    setForm(emptyForm());
    await apiPost(base, newSys as unknown as Record<string, unknown>);
  };

  /* ── PDF Export ── */
  const handlePrint = () => window.print();

  /* ── Photo Capture ── */
  const handlePhotoCapture = (sysId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const photo: SystemPhoto = { id: uid(), url, caption: '', taken_at: new Date().toISOString() };
      const sys = systems.find((s) => s.id === sysId);
      if (!sys) return;
      const updated = [...sys.photos, photo];
      updateSystemLocal(sysId, { photos: updated });
      /* Upload via form data queued */
      const fd = new FormData();
      fd.append('file', file);
      fd.append('system_id', sysId);
      try {
        const r = await fetch(`${base}/${sysId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photos: updated }) });
        if (!r.ok) throw new Error('upload fail');
      } catch {
        await enqueue({ url: `${base}/${sysId}`, method: 'PATCH', body: JSON.stringify({ photos: updated }), contentType: 'application/json', isFormData: false });
      }
    };
    input.click();
  };

  /* ──────────── RENDER: LIST VIEW ──────────── */
  const renderList = () => (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Commissioning</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn label="Export" color={BORDER} onClick={handlePrint} small />
          <Btn label="+ System" color={GOLD} onClick={() => { setForm(emptyForm()); setView('new'); }} small />
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Total', value: summary.total, color: BLUE },
          { label: 'Passed', value: summary.passed, color: GREEN },
          { label: 'Failed', value: summary.failed, color: RED },
          { label: 'Pending', value: summary.pending, color: AMBER },
          { label: 'Issues', value: summary.issueCount, color: RED },
          { label: 'Progress', value: `${summary.progress}%`, color: GOLD },
        ].map((c) => (
          <div key={c.label} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div style={{ background: '#0A1628', borderRadius: 8, height: 8, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ width: `${summary.progress}%`, height: '100%', background: `linear-gradient(90deg, ${GOLD}, ${GREEN})`, borderRadius: 8, transition: 'width .3s' }} />
      </div>

      {/* Type Tabs */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 12, paddingBottom: 4 }}>
        {TAB_TYPES.map((t) => (
          <button
            key={t} onClick={() => setTypeTab(t)}
            style={{
              padding: '7px 14px', borderRadius: 20, border: `1px solid ${typeTab === t ? GOLD : BORDER}`,
              background: typeTab === t ? `${GOLD}22` : 'transparent', color: typeTab === t ? GOLD : DIM,
              fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Search + Filters */}
      <div style={{ marginBottom: 12 }}>
        <TextInput value={searchTerm} onChange={setSearchTerm} placeholder="Search systems or equipment tags..." />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <SelectInput value={filterStatus} onChange={setFilterStatus} options={[{ value: 'all', label: 'All Statuses' }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))]} />
        </div>
        <div style={{ flex: 1 }}>
          <SelectInput value={filterPhase} onChange={setFilterPhase} options={[{ value: 'all', label: 'All Phases' }, ...PHASES.map((p) => ({ value: p, label: PHASE_LABELS[p] }))]} />
        </div>
      </div>

      {/* System Cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading systems...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: DIM }}>No systems found. Tap + System to add one.</div>
      ) : (
        filtered.map((s) => {
          const wStatus = warrantyStatus(s.warranty_end);
          const openIssues = s.issues.filter((i) => i.status !== 'resolved').length;
          const checkDone = s.checklist.filter((c) => c.checked || c.failed).length;
          const checkTotal = s.checklist.length;
          return (
            <div
              key={s.id}
              onClick={() => { setSelectedId(s.id); setDetailTab('checklist'); setView('detail'); }}
              style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, marginBottom: 10, cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{s.system_name}</div>
                  <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{s.location}{s.equipment_tag ? ` | ${s.equipment_tag}` : ''}</div>
                </div>
                <Badge label={STATUS_LABELS[s.status] || s.status} color={STATUS_COLORS[s.status] || DIM} />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <Badge label={TYPE_LABELS[s.system_type] || s.system_type} color={BLUE} />
                <Badge label={PHASE_LABELS[s.phase] || s.phase} color={PHASE_COLORS[s.phase] || DIM} />
                {openIssues > 0 && <Badge label={`${openIssues} issue${openIssues > 1 ? 's' : ''}`} color={RED} />}
                {s.warranty_end && <Badge label={`Warranty: ${wStatus.label}`} color={wStatus.color} />}
                {checkTotal > 0 && (
                  <span style={{ fontSize: 11, color: DIM, marginLeft: 'auto' }}>Checklist {checkDone}/{checkTotal}</span>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  /* ──────────── RENDER: CREATE FORM ──────────── */
  const renderCreateForm = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 20, cursor: 'pointer', padding: 0 }}>&#8592;</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>New System</h2>
      </div>

      <SectionHeader title="System Information" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><FieldLabel text="System Name *" /><TextInput value={form.system_name} onChange={(v) => setF('system_name', v)} placeholder="e.g. AHU-01" /></div>
        <div><FieldLabel text="System Type" /><SelectInput value={form.system_type} onChange={(v) => setF('system_type', v)} options={SYSTEM_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))} /></div>
        <div><FieldLabel text="Location" /><TextInput value={form.location} onChange={(v) => setF('location', v)} placeholder="Building / Floor / Area" /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><FieldLabel text="Phase" /><SelectInput value={form.phase} onChange={(v) => setF('phase', v)} options={PHASES.map((p) => ({ value: p, label: PHASE_LABELS[p] }))} /></div>
          <div style={{ flex: 1 }}><FieldLabel text="Status" /><SelectInput value={form.status} onChange={(v) => setF('status', v)} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} /></div>
        </div>
        <div><FieldLabel text="Assigned To" /><TextInput value={form.assigned_to} onChange={(v) => setF('assigned_to', v)} placeholder="Person or company" /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><FieldLabel text="Scheduled Date" /><TextInput value={form.scheduled_date} onChange={(v) => setF('scheduled_date', v)} type="date" /></div>
          <div style={{ flex: 1 }}><FieldLabel text="Completed Date" /><TextInput value={form.completed_date} onChange={(v) => setF('completed_date', v)} type="date" /></div>
        </div>
      </div>

      <SectionHeader title="Equipment Details" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><FieldLabel text="Equipment Tag" /><TextInput value={form.equipment_tag} onChange={(v) => setF('equipment_tag', v)} placeholder="Tag number" /></div>
        <div><FieldLabel text="Manufacturer" /><TextInput value={form.manufacturer} onChange={(v) => setF('manufacturer', v)} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><FieldLabel text="Model Number" /><TextInput value={form.model_number} onChange={(v) => setF('model_number', v)} /></div>
          <div style={{ flex: 1 }}><FieldLabel text="Serial Number" /><TextInput value={form.serial_number} onChange={(v) => setF('serial_number', v)} /></div>
        </div>
      </div>

      <SectionHeader title="Warranty" />
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><FieldLabel text="Warranty Start" /><TextInput value={form.warranty_start} onChange={(v) => setF('warranty_start', v)} type="date" /></div>
        <div style={{ flex: 1 }}><FieldLabel text="Warranty End" /><TextInput value={form.warranty_end} onChange={(v) => setF('warranty_end', v)} type="date" /></div>
      </div>

      <SectionHeader title="Notes" />
      <textarea
        value={form.notes} onChange={(e) => setF('notes', e.target.value)} rows={4} placeholder="Additional notes..."
        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, background: '#0A1628', color: TEXT, fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
      />

      <div style={{ marginTop: 20 }}>
        <Btn label="Create System" color={GOLD} onClick={handleCreate} full disabled={!form.system_name.trim()} />
      </div>
    </div>
  );

  /* ──────────── RENDER: DETAIL VIEW ──────────── */
  const renderDetail = () => {
    if (!selected) return <div style={{ color: DIM, textAlign: 'center', padding: 40 }}>System not found.</div>;
    const s = selected;
    const wStatus = warrantyStatus(s.warranty_end);

    /* Checklist helpers */
    const addChecklistItem = (text: string) => {
      if (!text.trim()) return;
      const item: ChecklistItem = { id: uid(), text: text.trim(), checked: false, failed: false, notes: '' };
      patchSystem(s.id, { checklist: [...s.checklist, item] });
    };
    const toggleCheckItem = (itemId: string, field: 'checked' | 'failed') => {
      const updated = s.checklist.map((c) =>
        c.id === itemId ? { ...c, [field]: !c[field], ...(field === 'checked' && !c.checked ? { failed: false } : {}), ...(field === 'failed' && !c.failed ? { checked: false } : {}) } : c
      );
      patchSystem(s.id, { checklist: updated });
    };
    const updateCheckNote = (itemId: string, notes: string) => {
      const updated = s.checklist.map((c) => c.id === itemId ? { ...c, notes } : c);
      patchSystem(s.id, { checklist: updated });
    };
    const removeCheckItem = (itemId: string) => {
      patchSystem(s.id, { checklist: s.checklist.filter((c) => c.id !== itemId) });
    };

    /* Test result helpers */
    const addTestResult = (tr: Omit<TestResult, 'id'>) => {
      const item: TestResult = { id: uid(), ...tr };
      patchSystem(s.id, { test_results: [...s.test_results, item] });
    };
    const removeTestResult = (trId: string) => {
      patchSystem(s.id, { test_results: s.test_results.filter((t) => t.id !== trId) });
    };
    const updateTestResult = (trId: string, patch: Partial<TestResult>) => {
      const updated = s.test_results.map((t) => t.id === trId ? { ...t, ...patch } : t);
      patchSystem(s.id, { test_results: updated });
    };

    /* Issue helpers */
    const addIssue = (issue: Omit<Issue, 'id' | 'created_at' | 'resolved_at'>) => {
      const item: Issue = { id: uid(), ...issue, created_at: new Date().toISOString(), resolved_at: null };
      patchSystem(s.id, { issues: [...s.issues, item] });
    };
    const resolveIssue = (issueId: string) => {
      const updated = s.issues.map((i) => i.id === issueId ? { ...i, status: 'resolved', resolved_at: new Date().toISOString() } : i);
      patchSystem(s.id, { issues: updated });
    };

    /* Phase progression */
    const nextPhase = () => {
      const idx = PHASES.indexOf(s.phase as typeof PHASES[number]);
      if (idx < PHASES.length - 1) patchSystem(s.id, { phase: PHASES[idx + 1] });
    };
    const phaseIdx = PHASES.indexOf(s.phase as typeof PHASES[number]);

    const DETAIL_TABS: { key: typeof detailTab; label: string }[] = [
      { key: 'checklist', label: 'Checklist' },
      { key: 'tests', label: 'Tests' },
      { key: 'issues', label: 'Issues' },
      { key: 'equipment', label: 'Equipment' },
      { key: 'photos', label: 'Photos' },
    ];

    return (
      <div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 20, cursor: 'pointer', padding: 0 }}>&#8592;</button>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: TEXT }}>{s.system_name}</h2>
            <div style={{ fontSize: 12, color: DIM }}>{s.location}{s.equipment_tag ? ` | ${s.equipment_tag}` : ''}</div>
          </div>
          <Btn label="Print" color={BORDER} onClick={handlePrint} small />
        </div>

        {/* Status / Phase / Type row */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          <Badge label={STATUS_LABELS[s.status] || s.status} color={STATUS_COLORS[s.status] || DIM} />
          <Badge label={PHASE_LABELS[s.phase] || s.phase} color={PHASE_COLORS[s.phase] || DIM} />
          <Badge label={TYPE_LABELS[s.system_type] || s.system_type} color={BLUE} />
          {s.warranty_end && <Badge label={`Warranty: ${wStatus.label}`} color={wStatus.color} />}
        </div>

        {/* Status update */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel text="Status" />
            <SelectInput value={s.status} onChange={(v) => patchSystem(s.id, { status: v, ...(v === 'passed' ? { completed_date: new Date().toISOString().slice(0, 10) } : {}) })} options={STATUSES.map((st) => ({ value: st, label: STATUS_LABELS[st] }))} />
          </div>
          <div style={{ flex: 1 }}>
            <FieldLabel text="Phase" />
            <SelectInput value={s.phase} onChange={(v) => patchSystem(s.id, { phase: v })} options={PHASES.map((p) => ({ value: p, label: PHASE_LABELS[p] }))} />
          </div>
        </div>

        {/* Phase Progression Bar */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: DIM, marginBottom: 8, fontWeight: 600 }}>Phase Progression</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {PHASES.map((p, i) => (
              <React.Fragment key={p}>
                <div style={{
                  flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                  background: i <= phaseIdx ? `${PHASE_COLORS[p]}22` : '#0A1628',
                  color: i <= phaseIdx ? PHASE_COLORS[p] : DIM,
                  border: `1px solid ${i === phaseIdx ? PHASE_COLORS[p] : 'transparent'}`,
                }}>
                  {PHASE_LABELS[p]}
                </div>
                {i < PHASES.length - 1 && <span style={{ color: DIM, fontSize: 10 }}>&#9654;</span>}
              </React.Fragment>
            ))}
          </div>
          {phaseIdx < PHASES.length - 1 && (
            <div style={{ marginTop: 10, textAlign: 'right' }}>
              <Btn label={`Advance to ${PHASE_LABELS[PHASES[phaseIdx + 1]]}`} color={GOLD} onClick={nextPhase} small />
            </div>
          )}
        </div>

        {/* Detail Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, overflowX: 'auto' }}>
          {DETAIL_TABS.map((t) => (
            <button
              key={t.key} onClick={() => setDetailTab(t.key)}
              style={{
                padding: '8px 14px', borderRadius: 20, border: `1px solid ${detailTab === t.key ? GOLD : BORDER}`,
                background: detailTab === t.key ? `${GOLD}22` : 'transparent', color: detailTab === t.key ? GOLD : DIM,
                fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {t.label}
              {t.key === 'issues' && s.issues.filter((i) => i.status !== 'resolved').length > 0 && (
                <span style={{ marginLeft: 4, background: RED, color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10 }}>
                  {s.issues.filter((i) => i.status !== 'resolved').length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Checklist Tab */}
        {detailTab === 'checklist' && <ChecklistPanel items={s.checklist} onAdd={addChecklistItem} onToggle={toggleCheckItem} onNote={updateCheckNote} onRemove={removeCheckItem} />}

        {/* Tests Tab */}
        {detailTab === 'tests' && <TestsPanel results={s.test_results} onAdd={addTestResult} onRemove={removeTestResult} onUpdate={updateTestResult} />}

        {/* Issues Tab */}
        {detailTab === 'issues' && <IssuesPanel issues={s.issues} onAdd={addIssue} onResolve={resolveIssue} />}

        {/* Equipment Tab */}
        {detailTab === 'equipment' && <EquipmentPanel system={s} onPatch={(p) => patchSystem(s.id, p)} />}

        {/* Photos Tab */}
        {detailTab === 'photos' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <SectionHeader title="Test Evidence Photos" />
              <Btn label="+ Photo" color={GOLD} onClick={() => handlePhotoCapture(s.id)} small />
            </div>
            {s.photos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: DIM, fontSize: 13 }}>No photos captured yet.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {s.photos.map((p) => (
                  <div key={p.id} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
                    <img src={p.url} alt={p.caption || 'Photo'} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                    <div style={{ padding: 8 }}>
                      <div style={{ fontSize: 11, color: DIM }}>{new Date(p.taken_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        <SectionHeader title="Notes" />
        <textarea
          value={s.notes} rows={3}
          onChange={(e) => patchSystem(s.id, { notes: e.target.value })}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, background: '#0A1628', color: TEXT, fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
          placeholder="Notes..."
        />
      </div>
    );
  };

  /* ── Main render ── */
  return (
    <div style={{ minHeight: '100vh', background: '#0B1929', color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 16px 100px' }}>
        {view === 'list' && renderList()}
        {view === 'new' && renderCreateForm()}
        {view === 'detail' && renderDetail()}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────── */
/*  CHECKLIST PANEL                                     */
/* ──────────────────────────────────────────────────── */
function ChecklistPanel({ items, onAdd, onToggle, onNote, onRemove }: {
  items: ChecklistItem[];
  onAdd: (text: string) => void;
  onToggle: (id: string, field: 'checked' | 'failed') => void;
  onNote: (id: string, notes: string) => void;
  onRemove: (id: string) => void;
}) {
  const [newItem, setNewItem] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const done = items.filter((i) => i.checked).length;
  const failed = items.filter((i) => i.failed).length;
  const total = items.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <SectionHeader title="Checklist" />
        <span style={{ fontSize: 12, color: DIM }}>{done}/{total} complete ({pct}%){failed > 0 ? ` | ${failed} failed` : ''}</span>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div style={{ background: '#0A1628', borderRadius: 6, height: 6, marginBottom: 12, overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: GREEN, transition: 'width .3s' }} />
          {failed > 0 && <div style={{ width: `${Math.round((failed / total) * 100)}%`, height: '100%', background: RED, transition: 'width .3s' }} />}
        </div>
      )}

      {/* Add item */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <TextInput value={newItem} onChange={setNewItem} placeholder="Add checklist item..." />
        </div>
        <Btn label="Add" color={GOLD} onClick={() => { onAdd(newItem); setNewItem(''); }} small disabled={!newItem.trim()} />
      </div>

      {/* Items */}
      {items.map((item) => (
        <div key={item.id} style={{ background: RAISED, border: `1px solid ${item.failed ? RED : item.checked ? GREEN : BORDER}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Pass button */}
            <button
              onClick={() => onToggle(item.id, 'checked')}
              style={{
                width: 28, height: 28, borderRadius: 8, border: `2px solid ${item.checked ? GREEN : BORDER}`,
                background: item.checked ? GREEN : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0, padding: 0,
              }}
            >
              {item.checked ? '\u2713' : ''}
            </button>
            {/* Fail button */}
            <button
              onClick={() => onToggle(item.id, 'failed')}
              style={{
                width: 28, height: 28, borderRadius: 8, border: `2px solid ${item.failed ? RED : BORDER}`,
                background: item.failed ? RED : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0, padding: 0,
              }}
            >
              {item.failed ? '\u2717' : ''}
            </button>
            <span style={{
              flex: 1, fontSize: 14, color: item.checked ? GREEN : item.failed ? RED : TEXT,
              textDecoration: item.checked ? 'line-through' : 'none',
            }}>
              {item.text}
            </span>
            <button onClick={() => setExpandedId(expandedId === item.id ? null : item.id)} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 16, padding: 0 }}>
              {expandedId === item.id ? '\u25B2' : '\u25BC'}
            </button>
            <button onClick={() => onRemove(item.id)} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 14, padding: 0 }}>\u2716</button>
          </div>
          {expandedId === item.id && (
            <div style={{ marginTop: 8 }}>
              <textarea
                value={item.notes} onChange={(e) => onNote(item.id, e.target.value)}
                placeholder="Add notes for this item..." rows={2}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${BORDER}`, background: '#0A1628', color: TEXT, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>
          )}
        </div>
      ))}
      {items.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: DIM, fontSize: 13 }}>No checklist items. Add items above.</div>}
    </div>
  );
}

/* ──────────────────────────────────────────────────── */
/*  TESTS PANEL                                         */
/* ──────────────────────────────────────────────────── */
function TestsPanel({ results, onAdd, onRemove, onUpdate }: {
  results: TestResult[];
  onAdd: (tr: Omit<TestResult, 'id'>) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<TestResult>) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [testName, setTestName] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [pass, setPass] = useState<boolean | null>(null);

  const handleAdd = () => {
    if (!testName.trim()) return;
    onAdd({ test_name: testName.trim(), expected_value: expected, actual_value: actual, pass });
    setTestName(''); setExpected(''); setActual(''); setPass(null); setShowForm(false);
  };

  const passed = results.filter((r) => r.pass === true).length;
  const failed = results.filter((r) => r.pass === false).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <SectionHeader title="Test Results" />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {results.length > 0 && <span style={{ fontSize: 12, color: DIM }}>{passed}P / {failed}F / {results.length}T</span>}
          <Btn label="+ Test" color={GOLD} onClick={() => setShowForm(!showForm)} small />
        </div>
      </div>

      {showForm && (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div><FieldLabel text="Test Name *" /><TextInput value={testName} onChange={setTestName} placeholder="e.g. Supply Air Temperature" /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><FieldLabel text="Expected Value" /><TextInput value={expected} onChange={setExpected} placeholder="e.g. 55\u00B0F" /></div>
              <div style={{ flex: 1 }}><FieldLabel text="Actual Value" /><TextInput value={actual} onChange={setActual} placeholder="e.g. 56\u00B0F" /></div>
            </div>
            <div>
              <FieldLabel text="Result" />
              <div style={{ display: 'flex', gap: 8 }}>
                {([{ v: true, l: 'Pass', c: GREEN }, { v: false, l: 'Fail', c: RED }, { v: null, l: 'Pending', c: DIM }] as const).map((opt) => (
                  <button
                    key={opt.l} onClick={() => setPass(opt.v)}
                    style={{
                      flex: 1, padding: '8px', borderRadius: 8, border: `2px solid ${pass === opt.v ? opt.c : BORDER}`,
                      background: pass === opt.v ? `${opt.c}22` : 'transparent', color: pass === opt.v ? opt.c : DIM,
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn label="Cancel" color={BORDER} onClick={() => setShowForm(false)} small />
              <Btn label="Save Test" color={GOLD} onClick={handleAdd} small disabled={!testName.trim()} />
            </div>
          </div>
        </div>
      )}

      {results.map((tr) => (
        <div key={tr.id} style={{ background: RAISED, border: `1px solid ${tr.pass === true ? GREEN : tr.pass === false ? RED : BORDER}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{tr.test_name}</div>
              <div style={{ fontSize: 12, color: DIM }}>
                Expected: <span style={{ color: TEXT }}>{tr.expected_value || 'N/A'}</span>
                {' | '}Actual: <span style={{ color: TEXT }}>{tr.actual_value || 'N/A'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Badge label={tr.pass === true ? 'PASS' : tr.pass === false ? 'FAIL' : 'PENDING'} color={tr.pass === true ? GREEN : tr.pass === false ? RED : DIM} />
              <button onClick={() => onRemove(tr.id)} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 13, padding: 0 }}>\u2716</button>
            </div>
          </div>
          {/* Inline result toggle */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={() => onUpdate(tr.id, { pass: true })} style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${GREEN}`, background: tr.pass === true ? GREEN : 'transparent', color: tr.pass === true ? '#fff' : GREEN, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Pass</button>
            <button onClick={() => onUpdate(tr.id, { pass: false })} style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${RED}`, background: tr.pass === false ? RED : 'transparent', color: tr.pass === false ? '#fff' : RED, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Fail</button>
            <button onClick={() => onUpdate(tr.id, { pass: null })} style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${DIM}`, background: tr.pass === null ? DIM : 'transparent', color: tr.pass === null ? '#fff' : DIM, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Pending</button>
          </div>
        </div>
      ))}
      {results.length === 0 && !showForm && <div style={{ textAlign: 'center', padding: 20, color: DIM, fontSize: 13 }}>No test results recorded yet.</div>}
    </div>
  );
}

/* ──────────────────────────────────────────────────── */
/*  ISSUES PANEL                                        */
/* ──────────────────────────────────────────────────── */
function IssuesPanel({ issues, onAdd, onResolve }: {
  issues: Issue[];
  onAdd: (issue: Omit<Issue, 'id' | 'created_at' | 'resolved_at'>) => void;
  onResolve: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [assignedTo, setAssignedTo] = useState('');

  const handleAdd = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), description, severity, assigned_to: assignedTo, status: 'open' });
    setTitle(''); setDescription(''); setSeverity('medium'); setAssignedTo(''); setShowForm(false);
  };

  const SEVERITY_COLORS: Record<string, string> = { critical: RED, high: AMBER, medium: BLUE, low: DIM };
  const openIssues = issues.filter((i) => i.status !== 'resolved');
  const resolvedIssues = issues.filter((i) => i.status === 'resolved');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <SectionHeader title="Issues" />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {issues.length > 0 && <span style={{ fontSize: 12, color: DIM }}>{openIssues.length} open</span>}
          <Btn label="+ Issue" color={GOLD} onClick={() => setShowForm(!showForm)} small />
        </div>
      </div>

      {showForm && (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div><FieldLabel text="Issue Title *" /><TextInput value={title} onChange={setTitle} placeholder="Brief description of issue" /></div>
            <div>
              <FieldLabel text="Description" />
              <textarea
                value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Detailed description..."
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, background: '#0A1628', color: TEXT, fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <FieldLabel text="Severity" />
                <SelectInput value={severity} onChange={setSeverity} options={[{ value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]} />
              </div>
              <div style={{ flex: 1 }}><FieldLabel text="Assign To" /><TextInput value={assignedTo} onChange={setAssignedTo} placeholder="Person" /></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn label="Cancel" color={BORDER} onClick={() => setShowForm(false)} small />
              <Btn label="Add Issue" color={GOLD} onClick={handleAdd} small disabled={!title.trim()} />
            </div>
          </div>
        </div>
      )}

      {/* Open Issues */}
      {openIssues.map((issue) => (
        <div key={issue.id} style={{ background: RAISED, border: `1px solid ${SEVERITY_COLORS[issue.severity] || BORDER}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{issue.title}</div>
              {issue.description && <div style={{ fontSize: 12, color: DIM, marginTop: 4 }}>{issue.description}</div>}
            </div>
            <Badge label={issue.severity} color={SEVERITY_COLORS[issue.severity] || DIM} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: DIM }}>
              {issue.assigned_to && <span>Assigned: {issue.assigned_to} | </span>}
              {new Date(issue.created_at).toLocaleDateString()}
            </div>
            <Btn label="Resolve" color={GREEN} onClick={() => onResolve(issue.id)} small />
          </div>
        </div>
      ))}

      {/* Resolved Issues */}
      {resolvedIssues.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: DIM, margin: '14px 0 8px', fontWeight: 600 }}>Resolved ({resolvedIssues.length})</div>
          {resolvedIssues.map((issue) => (
            <div key={issue.id} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 8, opacity: 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: TEXT, textDecoration: 'line-through' }}>{issue.title}</div>
                  <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>Resolved {issue.resolved_at ? new Date(issue.resolved_at).toLocaleDateString() : ''}</div>
                </div>
                <Badge label="Resolved" color={GREEN} />
              </div>
            </div>
          ))}
        </>
      )}

      {issues.length === 0 && !showForm && <div style={{ textAlign: 'center', padding: 20, color: DIM, fontSize: 13 }}>No issues reported.</div>}
    </div>
  );
}

/* ──────────────────────────────────────────────────── */
/*  EQUIPMENT PANEL                                     */
/* ──────────────────────────────────────────────────── */
function EquipmentPanel({ system, onPatch }: { system: CommissioningSystem; onPatch: (patch: Partial<CommissioningSystem>) => void }) {
  const s = system;
  const wStatus = warrantyStatus(s.warranty_end);

  return (
    <div>
      <SectionHeader title="Equipment Information" />
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><FieldLabel text="Equipment Tag" /><TextInput value={s.equipment_tag} onChange={(v) => onPatch({ equipment_tag: v })} /></div>
          <div><FieldLabel text="Manufacturer" /><TextInput value={s.manufacturer} onChange={(v) => onPatch({ manufacturer: v })} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><FieldLabel text="Model Number" /><TextInput value={s.model_number} onChange={(v) => onPatch({ model_number: v })} /></div>
            <div style={{ flex: 1 }}><FieldLabel text="Serial Number" /><TextInput value={s.serial_number} onChange={(v) => onPatch({ serial_number: v })} /></div>
          </div>
          <div><FieldLabel text="Assigned To" /><TextInput value={s.assigned_to} onChange={(v) => onPatch({ assigned_to: v })} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><FieldLabel text="Scheduled Date" /><TextInput value={s.scheduled_date} onChange={(v) => onPatch({ scheduled_date: v })} type="date" /></div>
            <div style={{ flex: 1 }}><FieldLabel text="Completed Date" /><TextInput value={s.completed_date} onChange={(v) => onPatch({ completed_date: v })} type="date" /></div>
          </div>
        </div>
      </div>

      <SectionHeader title="Warranty Tracking" />
      <div style={{ background: RAISED, border: `1px solid ${wStatus.color}44`, borderRadius: 12, padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}><FieldLabel text="Warranty Start" /><TextInput value={s.warranty_start} onChange={(v) => onPatch({ warranty_start: v })} type="date" /></div>
          <div style={{ flex: 1 }}><FieldLabel text="Warranty End" /><TextInput value={s.warranty_end} onChange={(v) => onPatch({ warranty_end: v })} type="date" /></div>
        </div>
        {s.warranty_end && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: `${wStatus.color}11`, border: `1px solid ${wStatus.color}33` }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: wStatus.color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: wStatus.color }}>
              {wStatus.label === 'Expired' ? 'Warranty has expired' : `Warranty: ${wStatus.label} remaining`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────── */
/*  DEFAULT EXPORT WITH SUSPENSE                        */
/* ──────────────────────────────────────────────────── */
export default function CommissioningPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0B1929', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8BAAC8', fontFamily: 'sans-serif' }}>Loading Commissioning...</div>}>
      <CommissioningInner />
    </Suspense>
  );
}
