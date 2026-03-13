'use client';
/**
 * Saguaro Field — OSHA Incident Tracking
 * Comprehensive incident reporting, investigation, OSHA 300 log tracking,
 * corrective actions, and safety analytics. Full offline support.
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

/* ─── Type Constants ─── */
const INCIDENT_TYPES = ['injury','illness','near_miss','property_damage','environmental','vehicle','fire','other'] as const;
const TYPE_LABELS: Record<string, string> = {
  injury: 'Injury', illness: 'Illness', near_miss: 'Near Miss', property_damage: 'Property Damage',
  environmental: 'Environmental', vehicle: 'Vehicle', fire: 'Fire', other: 'Other',
};
const TYPE_ICONS: Record<string, string> = {
  injury: '🩹', illness: '🤒', near_miss: '⚠️', property_damage: '🏗️',
  environmental: '🌿', vehicle: '🚗', fire: '🔥', other: '📋',
};
const TYPE_COLORS: Record<string, string> = {
  injury: RED, illness: AMBER, near_miss: BLUE, property_damage: '#A855F7',
  environmental: GREEN, vehicle: '#6366F1', fire: '#F97316', other: DIM,
};

const SEVERITIES = ['minor','moderate','serious','critical','fatal'] as const;
const SEVERITY_LABELS: Record<string, string> = {
  minor: 'Minor', moderate: 'Moderate', serious: 'Serious', critical: 'Critical', fatal: 'Fatal',
};
const SEVERITY_COLORS: Record<string, string> = {
  minor: GREEN, moderate: BLUE, serious: AMBER, critical: RED, fatal: '#DC2626',
};

const STATUSES = ['open','investigating','corrective_action','closed','reopened'] as const;
const STATUS_LABELS: Record<string, string> = {
  open: 'Open', investigating: 'Investigating', corrective_action: 'Corrective Action', closed: 'Closed', reopened: 'Reopened',
};
const STATUS_COLORS: Record<string, string> = {
  open: RED, investigating: AMBER, corrective_action: BLUE, closed: GREEN, reopened: '#A855F7',
};

const TREATMENTS = ['none','first_aid','medical','hospitalization','fatality'] as const;
const TREATMENT_LABELS: Record<string, string> = {
  none: 'None', first_aid: 'First Aid', medical: 'Medical Treatment', hospitalization: 'Hospitalization', fatality: 'Fatality',
};

const STATUS_FLOW: Record<string, string[]> = {
  open: ['investigating'], investigating: ['corrective_action','closed'], corrective_action: ['closed'],
  closed: ['reopened'], reopened: ['investigating'],
};

/* ─── Interfaces ─── */
interface CorrectiveAction { id: string; description: string; assigned_to: string; due_date: string; status: string; completed_date?: string; }
interface Incident {
  id: string; incident_number: string; title: string; incident_type: string; incident_date: string;
  incident_time: string; location: string; description: string; severity: string;
  injured_person: string; injured_company: string; injury_type: string; body_part: string;
  treatment: string; days_away: number; days_restricted: number; recordable: boolean;
  osha_reportable: boolean; witnesses: string[]; root_cause: string;
  corrective_actions: CorrectiveAction[]; preventive_measures: string;
  investigation_by: string; investigation_date: string; investigation_notes: string;
  photos: string[]; status: string; reported_by: string; reported_to: string;
  supervisor_name: string; gps_lat: number | null; gps_lng: number | null; created_at: string;
}

type View = 'dashboard' | 'list' | 'create' | 'detail' | 'osha300';

/* ─── Helpers ─── */
function fmtDate(d: string | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtTime(t: string | undefined): string {
  if (!t) return '—';
  const [h, m] = t.split(':');
  const hr = parseInt(h, 10);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}
function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

/* ─── Blank Form ─── */
function blankForm(): Omit<Incident, 'id' | 'incident_number' | 'created_at'> {
  return {
    title: '', incident_type: 'injury', incident_date: new Date().toISOString().slice(0, 10),
    incident_time: new Date().toTimeString().slice(0, 5), location: '', description: '',
    severity: 'minor', injured_person: '', injured_company: '', injury_type: '', body_part: '',
    treatment: 'none', days_away: 0, days_restricted: 0, recordable: false, osha_reportable: false,
    witnesses: [], root_cause: '', corrective_actions: [], preventive_measures: '',
    investigation_by: '', investigation_date: '', investigation_notes: '',
    photos: [], status: 'open', reported_by: '', reported_to: '', supervisor_name: '',
    gps_lat: null, gps_lng: null,
  };
}

/* ─── Print/Export ─── */
function exportIncidentPDF(inc: Incident) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>Incident ${inc.incident_number}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:40px;color:#1a1a1a;max-width:800px;margin:0 auto;}
h1{font-size:22px;border-bottom:2px solid #D4A017;padding-bottom:8px;}
h2{font-size:16px;color:#333;margin-top:20px;}
table{width:100%;border-collapse:collapse;margin:10px 0;}
th,td{border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:12px;}
th{background:#f5f5f5;font-weight:600;}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#fff;}
.section{margin:12px 0;padding:10px;border:1px solid #eee;border-radius:6px;}
.footer{margin-top:32px;padding-top:10px;border-top:1px solid #ddd;font-size:10px;color:#999;}
@media print{body{padding:20px;}}
</style></head><body>
<h1>Incident Report: ${inc.incident_number}</h1>
<p style="color:#666;font-size:13px;">Generated ${new Date().toLocaleString()}</p>
<div class="section">
<h2>Basic Information</h2>
<table><tr><th>Title</th><td>${inc.title}</td><th>Type</th><td>${TYPE_LABELS[inc.incident_type] || inc.incident_type}</td></tr>
<tr><th>Date</th><td>${inc.incident_date}</td><th>Time</th><td>${inc.incident_time}</td></tr>
<tr><th>Location</th><td>${inc.location}</td><th>Severity</th><td><span class="badge" style="background:${SEVERITY_COLORS[inc.severity] || DIM}">${SEVERITY_LABELS[inc.severity] || inc.severity}</span></td></tr>
<tr><th>Status</th><td>${STATUS_LABELS[inc.status] || inc.status}</td><th>Recordable</th><td>${inc.recordable ? 'Yes' : 'No'}</td></tr>
<tr><th>Reported By</th><td>${inc.reported_by}</td><th>Reported To</th><td>${inc.reported_to}</td></tr>
<tr><th>Supervisor</th><td colspan="3">${inc.supervisor_name}</td></tr></table>
<p><strong>Description:</strong> ${inc.description}</p></div>
${(inc.incident_type === 'injury' || inc.incident_type === 'illness') ? `<div class="section"><h2>Injury Details</h2>
<table><tr><th>Injured Person</th><td>${inc.injured_person}</td><th>Company</th><td>${inc.injured_company}</td></tr>
<tr><th>Injury Type</th><td>${inc.injury_type}</td><th>Body Part</th><td>${inc.body_part}</td></tr>
<tr><th>Treatment</th><td>${TREATMENT_LABELS[inc.treatment] || inc.treatment}</td><th>OSHA Reportable</th><td>${inc.osha_reportable ? 'Yes' : 'No'}</td></tr>
<tr><th>Days Away</th><td>${inc.days_away}</td><th>Days Restricted</th><td>${inc.days_restricted}</td></tr></table></div>` : ''}
<div class="section"><h2>Investigation</h2>
<table><tr><th>Investigated By</th><td>${inc.investigation_by}</td><th>Date</th><td>${inc.investigation_date}</td></tr></table>
<p><strong>Root Cause:</strong> ${inc.root_cause}</p>
<p><strong>Preventive Measures:</strong> ${inc.preventive_measures}</p>
${inc.investigation_notes ? `<p><strong>Notes:</strong> ${inc.investigation_notes}</p>` : ''}</div>
${inc.witnesses.length > 0 ? `<div class="section"><h2>Witnesses</h2><ul>${inc.witnesses.map(w2 => `<li>${w2}</li>`).join('')}</ul></div>` : ''}
${inc.corrective_actions.length > 0 ? `<div class="section"><h2>Corrective Actions</h2>
<table><tr><th>Description</th><th>Assigned To</th><th>Due Date</th><th>Status</th></tr>
${inc.corrective_actions.map(ca => `<tr><td>${ca.description}</td><td>${ca.assigned_to}</td><td>${ca.due_date}</td><td>${ca.status}</td></tr>`).join('')}</table></div>` : ''}
${inc.gps_lat && inc.gps_lng ? `<p style="font-size:12px;color:#666;">GPS: ${inc.gps_lat.toFixed(6)}, ${inc.gps_lng.toFixed(6)}</p>` : ''}
<div class="footer"><p>OSHA Incident Report — Saguaro Construction Management</p></div>
</body></html>`);
  w.document.close();
  w.print();
}

/* ─── OSHA 300 Log Export ─── */
function exportOsha300(incidents: Incident[]) {
  const recordable = incidents.filter(i => i.recordable);
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>OSHA 300 Log</title>
<style>
body{font-family:'Courier New',monospace;padding:20px;font-size:11px;}
h1{font-size:18px;text-align:center;}
table{width:100%;border-collapse:collapse;margin:10px 0;}
th,td{border:1px solid #000;padding:3px 5px;text-align:center;font-size:10px;}
th{background:#f0f0f0;}
@media print{body{padding:10px;}}
</style></head><body>
<h1>OSHA Form 300 — Log of Work-Related Injuries and Illnesses</h1>
<table>
<tr><th>Case No.</th><th>Employee Name</th><th>Job Title</th><th>Date of Injury</th><th>Where Event Occurred</th><th>Description</th><th>Death</th><th>Days Away</th><th>Restricted</th><th>Other Recordable</th><th>Injury Type</th></tr>
${recordable.map(i => `<tr><td>${i.incident_number}</td><td>${i.injured_person}</td><td>—</td><td>${i.incident_date}</td><td>${i.location}</td><td>${i.description.slice(0, 60)}</td><td>${i.severity === 'fatal' ? 'X' : ''}</td><td>${i.days_away || ''}</td><td>${i.days_restricted || ''}</td><td>${i.treatment === 'medical' ? 'X' : ''}</td><td>${i.injury_type}</td></tr>`).join('')}
</table>
<p style="margin-top:20px;">Total recordable cases: ${recordable.length} | Days away: ${recordable.reduce((s, i) => s + (i.days_away || 0), 0)} | Days restricted: ${recordable.reduce((s, i) => s + (i.days_restricted || 0), 0)}</p>
<div style="margin-top:30px;font-size:10px;color:#666;">Generated ${new Date().toLocaleString()} — Saguaro Construction Management</div>
</body></html>`);
  w.document.close();
  w.print();
}

/* ═══════════════════════════════════════════ MAIN COMPONENT ═══════════════════════════════════════════ */
function IncidentsPage() {
  const projectId = useSearchParams().get('projectId') || '';
  const [view, setView] = useState<View>('dashboard');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm());
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);

  /* Filters */
  const [filterType, setFilterType] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  /* Witness input */
  const [witnessName, setWitnessName] = useState('');

  /* Corrective action input */
  const [caDesc, setCaDesc] = useState('');
  const [caAssigned, setCaAssigned] = useState('');
  const [caDue, setCaDue] = useState('');

  /* ─── Fetch ─── */
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/projects/${projectId}/incidents`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setIncidents(Array.isArray(d) ? d : []))
      .catch(() => setIncidents([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  /* ─── Toast ─── */
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); } return undefined; }, [toast]);

  /* ─── GPS capture ─── */
  const captureGPS = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => setForm(f => ({ ...f, gps_lat: pos.coords.latitude, gps_lng: pos.coords.longitude })),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  /* ─── OSHA Recordability Helper ─── */
  const isLikelyRecordable = useMemo(() => {
    if (form.treatment === 'hospitalization' || form.treatment === 'fatality') return true;
    if (form.treatment === 'medical') return true;
    if (form.days_away > 0 || form.days_restricted > 0) return true;
    if (form.severity === 'critical' || form.severity === 'fatal') return true;
    return false;
  }, [form.treatment, form.days_away, form.days_restricted, form.severity]);

  /* ─── Save Incident ─── */
  const saveIncident = async () => {
    if (!form.title.trim() || !projectId) return;
    setSaving(true);
    const payload = { ...form, recordable: form.recordable || isLikelyRecordable };
    try {
      const res = await fetch(`/api/projects/${projectId}/incidents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        setIncidents(prev => [created, ...prev]);
        setToast('Incident reported successfully');
        setView('list');
        setForm(blankForm());
        setStep(1);
        setPhotoFiles([]);
      } else throw new Error('Server error');
    } catch {
      await enqueue({ url: `/api/projects/${projectId}/incidents`, method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
      setToast('Saved offline — will sync when connected');
      setView('list');
      setForm(blankForm());
      setStep(1);
      setPhotoFiles([]);
    }
    setSaving(false);
  };

  /* ─── Update Incident Status ─── */
  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/incidents/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setIncidents(prev => prev.map(i => i.id === id ? { ...i, ...updated } : i));
        setToast(`Status updated to ${STATUS_LABELS[newStatus]}`);
      } else throw new Error('Failed');
    } catch {
      await enqueue({ url: `/api/projects/${projectId}/incidents/${id}`, method: 'PATCH', body: JSON.stringify({ status: newStatus }), contentType: 'application/json', isFormData: false });
      setIncidents(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
      setToast('Status queued offline');
    }
  };

  /* ─── Update Corrective Action Status ─── */
  const updateCAStatus = async (incidentId: string, caId: string, newStatus: string) => {
    const inc = incidents.find(i => i.id === incidentId);
    if (!inc) return;
    const updatedCAs = inc.corrective_actions.map(ca => ca.id === caId ? { ...ca, status: newStatus, completed_date: newStatus === 'closed' ? new Date().toISOString().slice(0, 10) : ca.completed_date } : ca);
    try {
      const res = await fetch(`/api/projects/${projectId}/incidents/${incidentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ corrective_actions: updatedCAs }),
      });
      if (res.ok) {
        setIncidents(prev => prev.map(i => i.id === incidentId ? { ...i, corrective_actions: updatedCAs } : i));
        setToast('Corrective action updated');
      } else throw new Error('Failed');
    } catch {
      await enqueue({ url: `/api/projects/${projectId}/incidents/${incidentId}`, method: 'PATCH', body: JSON.stringify({ corrective_actions: updatedCAs }), contentType: 'application/json', isFormData: false });
      setIncidents(prev => prev.map(i => i.id === incidentId ? { ...i, corrective_actions: updatedCAs } : i));
      setToast('Update queued offline');
    }
  };

  /* ─── Filtered List ─── */
  const filtered = useMemo(() => {
    let list = [...incidents];
    if (filterType) list = list.filter(i => i.incident_type === filterType);
    if (filterSeverity) list = list.filter(i => i.severity === filterSeverity);
    if (filterStatus) list = list.filter(i => i.status === filterStatus);
    if (filterDateFrom) list = list.filter(i => i.incident_date >= filterDateFrom);
    if (filterDateTo) list = list.filter(i => i.incident_date <= filterDateTo);
    return list.sort((a, b) => b.incident_date.localeCompare(a.incident_date));
  }, [incidents, filterType, filterSeverity, filterStatus, filterDateFrom, filterDateTo]);

  /* ─── Dashboard Stats ─── */
  const stats = useMemo(() => {
    const total = incidents.length;
    const recordable = incidents.filter(i => i.recordable).length;
    const recordableRate = total > 0 ? ((recordable / total) * 100).toFixed(1) : '0';
    const openCount = incidents.filter(i => i.status !== 'closed').length;
    const sorted = [...incidents].sort((a, b) => b.incident_date.localeCompare(a.incident_date));
    const lastIncident = sorted[0]?.incident_date;
    const daysSince = lastIncident ? daysBetween(lastIncident, new Date().toISOString().slice(0, 10)) : null;
    const bySeverity: Record<string, number> = {};
    SEVERITIES.forEach(s => { bySeverity[s] = incidents.filter(i => i.severity === s).length; });
    const byType: Record<string, number> = {};
    INCIDENT_TYPES.forEach(t => { byType[t] = incidents.filter(i => i.incident_type === t).length; });
    const byStatus: Record<string, number> = {};
    STATUSES.forEach(s => { byStatus[s] = incidents.filter(i => i.status === s).length; });
    return { total, recordable, recordableRate, openCount, daysSince, bySeverity, byType, byStatus };
  }, [incidents]);

  const selected = incidents.find(i => i.id === selectedId) || null;

  /* ─── Photo Handler ─── */
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setPhotoFiles(prev => [...prev, ...files]);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setForm(f => ({ ...f, photos: [...f.photos, reader.result as string] }));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  /* ─── Shared Styles ─── */
  const btnStyle = (bg: string): React.CSSProperties => ({
    background: bg, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px',
    fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
  });
  const cardStyle: React.CSSProperties = {
    background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 12,
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', background: '#0A1628', border: `1px solid ${BORDER}`,
    borderRadius: 8, color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { display: 'block', color: DIM, fontSize: 12, fontWeight: 600, marginBottom: 4, marginTop: 12 };
  const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'auto' as const };
  const badgeStyle = (bg: string): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11,
    fontWeight: 700, color: '#fff', background: bg,
  });

  /* ═══════════════ RENDER ═══════════════ */
  return (
    <div style={{ minHeight: '100vh', background: '#080F1A', color: TEXT, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      {/* ─── Toast ─── */}
      {toast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: GREEN, color: '#fff',
          padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,.4)' }}>
          {toast}
        </div>
      )}

      {/* ─── Header ─── */}
      <div style={{ background: RAISED, borderBottom: `1px solid ${BORDER}`, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {view !== 'dashboard' && (
            <button onClick={() => { if (view === 'detail') setView('list'); else if (view === 'create') { setView('list'); setStep(1); setForm(blankForm()); } else if (view === 'osha300') setView('dashboard'); else setView('dashboard'); }}
              style={{ background: 'none', border: 'none', color: GOLD, fontSize: 20, cursor: 'pointer', padding: 4 }}>←</button>
          )}
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: GOLD }}>
              {view === 'dashboard' ? 'Incident Tracking' : view === 'list' ? 'All Incidents' : view === 'create' ? `Report Incident (${step}/3)` : view === 'osha300' ? 'OSHA 300 Log' : selected?.title || 'Incident Detail'}
            </div>
            <div style={{ fontSize: 12, color: DIM }}>OSHA Compliance & Safety</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {view === 'dashboard' && (
            <button onClick={() => setView('osha300')} style={btnStyle('#6366F1')}>
              300 Log
            </button>
          )}
          {(view === 'dashboard' || view === 'list') && (
            <button onClick={() => { setForm(blankForm()); setStep(1); captureGPS(); setView('create'); }} style={btnStyle(RED)}>
              + Report
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            Loading incidents...
          </div>
        ) : (
          <>
            {/* ═══════════════════ DASHBOARD ═══════════════════ */}
            {view === 'dashboard' && (
              <>
                {/* Top Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div style={{ ...cardStyle, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: GOLD }}>{stats.total}</div>
                    <div style={{ fontSize: 12, color: DIM }}>Total Incidents</div>
                  </div>
                  <div style={{ ...cardStyle, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: stats.daysSince !== null && stats.daysSince < 7 ? RED : GREEN }}>
                      {stats.daysSince !== null ? stats.daysSince : '—'}
                    </div>
                    <div style={{ fontSize: 12, color: DIM }}>Days Since Last</div>
                  </div>
                  <div style={{ ...cardStyle, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: parseFloat(stats.recordableRate) > 50 ? RED : GREEN }}>
                      {stats.recordableRate}%
                    </div>
                    <div style={{ fontSize: 12, color: DIM }}>Recordable Rate</div>
                  </div>
                  <div style={{ ...cardStyle, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: stats.openCount > 0 ? AMBER : GREEN }}>{stats.openCount}</div>
                    <div style={{ fontSize: 12, color: DIM }}>Open Incidents</div>
                  </div>
                </div>

                {/* Severity Breakdown */}
                <div style={cardStyle}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 12 }}>Severity Breakdown</div>
                  {SEVERITIES.map(s => {
                    const count = stats.bySeverity[s] || 0;
                    const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                    return (
                      <div key={s} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: DIM, marginBottom: 3 }}>
                          <span>{SEVERITY_LABELS[s]}</span><span>{count}</span>
                        </div>
                        <div style={{ height: 6, background: '#0A1628', borderRadius: 3 }}>
                          <div style={{ height: 6, borderRadius: 3, background: SEVERITY_COLORS[s], width: `${pct}%`, transition: 'width .3s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Type Breakdown */}
                <div style={cardStyle}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 12 }}>By Type</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {INCIDENT_TYPES.map(t => (
                      <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#0A1628', borderRadius: 8 }}>
                        <span style={{ fontSize: 18 }}>{TYPE_ICONS[t]}</span>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: TYPE_COLORS[t] }}>{stats.byType[t] || 0}</div>
                          <div style={{ fontSize: 10, color: DIM }}>{TYPE_LABELS[t]}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Status Breakdown */}
                <div style={cardStyle}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 12 }}>By Status</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {STATUSES.map(s => (
                      <div key={s} style={{ padding: '6px 12px', background: '#0A1628', borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: STATUS_COLORS[s] }}>{stats.byStatus[s] || 0}</div>
                        <div style={{ fontSize: 10, color: DIM }}>{STATUS_LABELS[s]}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* OSHA 300 Indicator */}
                <div style={{ ...cardStyle, borderColor: stats.recordable > 0 ? RED : GREEN }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: stats.recordable > 0 ? RED : GREEN }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>OSHA 300 Log</div>
                      <div style={{ fontSize: 12, color: DIM }}>
                        {stats.recordable} recordable case{stats.recordable !== 1 ? 's' : ''} this period
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setView('osha300')} style={{ ...btnStyle('#6366F1'), marginTop: 10, width: '100%', justifyContent: 'center' }}>
                    View OSHA 300 Log
                  </button>
                </div>

                {/* View All */}
                <button onClick={() => setView('list')} style={{ ...btnStyle(GOLD), width: '100%', justifyContent: 'center', marginTop: 8 }}>
                  View All Incidents ({incidents.length})
                </button>
              </>
            )}

            {/* ═══════════════════ OSHA 300 LOG VIEW ═══════════════════ */}
            {view === 'osha300' && (
              <>
                <div style={cardStyle}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 8 }}>OSHA Form 300 — Log of Work-Related Injuries and Illnesses</div>
                  <div style={{ fontSize: 12, color: DIM, marginBottom: 12 }}>Recordable incidents only. Print for official submission.</div>
                  {incidents.filter(i => i.recordable).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 30, color: DIM }}>No recordable incidents</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                          <tr>
                            {['Case #', 'Employee', 'Date', 'Location', 'Description', 'Death', 'Days Away', 'Restricted', 'Type'].map(h => (
                              <th key={h} style={{ padding: '6px 4px', borderBottom: `1px solid ${BORDER}`, color: DIM, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {incidents.filter(i => i.recordable).map(inc => (
                            <tr key={inc.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                              <td style={{ padding: '6px 4px', color: GOLD, fontWeight: 600 }}>{inc.incident_number}</td>
                              <td style={{ padding: '6px 4px' }}>{inc.injured_person || '—'}</td>
                              <td style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>{inc.incident_date}</td>
                              <td style={{ padding: '6px 4px' }}>{inc.location}</td>
                              <td style={{ padding: '6px 4px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.description}</td>
                              <td style={{ padding: '6px 4px', textAlign: 'center', color: RED, fontWeight: 700 }}>{inc.severity === 'fatal' ? 'X' : ''}</td>
                              <td style={{ padding: '6px 4px', textAlign: 'center' }}>{inc.days_away || ''}</td>
                              <td style={{ padding: '6px 4px', textAlign: 'center' }}>{inc.days_restricted || ''}</td>
                              <td style={{ padding: '6px 4px' }}>{inc.injury_type || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <button onClick={() => exportOsha300(incidents)} style={{ ...btnStyle('#6366F1'), width: '100%', justifyContent: 'center' }}>
                  Print OSHA 300 Log
                </button>
              </>
            )}

            {/* ═══════════════════ LIST VIEW ═══════════════════ */}
            {view === 'list' && (
              <>
                {/* Filters */}
                <div style={{ ...cardStyle, padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 8 }}>Filters</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...selectStyle, fontSize: 12, padding: '6px 8px' }}>
                      <option value="">All Types</option>
                      {INCIDENT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                    </select>
                    <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} style={{ ...selectStyle, fontSize: 12, padding: '6px 8px' }}>
                      <option value="">All Severities</option>
                      {SEVERITIES.map(s => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
                    </select>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...selectStyle, fontSize: 12, padding: '6px 8px' }}>
                      <option value="">All Statuses</option>
                      {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ ...inputStyle, fontSize: 11, padding: '6px 4px', flex: 1 }} placeholder="From" />
                      <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ ...inputStyle, fontSize: 11, padding: '6px 4px', flex: 1 }} placeholder="To" />
                    </div>
                  </div>
                  {(filterType || filterSeverity || filterStatus || filterDateFrom || filterDateTo) && (
                    <button onClick={() => { setFilterType(''); setFilterSeverity(''); setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo(''); }}
                      style={{ background: 'none', border: 'none', color: GOLD, fontSize: 12, cursor: 'pointer', marginTop: 6, padding: 0 }}>
                      Clear Filters
                    </button>
                  )}
                </div>

                {/* Results count */}
                <div style={{ fontSize: 12, color: DIM, marginBottom: 8 }}>
                  Showing {filtered.length} of {incidents.length} incident{incidents.length !== 1 ? 's' : ''}
                </div>

                {/* Incident Cards */}
                {filtered.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: DIM }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>🛡️</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>No incidents found</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Tap "+ Report" to log a new incident</div>
                  </div>
                ) : filtered.map(inc => (
                  <div key={inc.id} onClick={() => { setSelectedId(inc.id); setView('detail'); }}
                    style={{ ...cardStyle, cursor: 'pointer', transition: 'border-color .2s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 22 }}>{TYPE_ICONS[inc.incident_type] || '📋'}</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{inc.title}</div>
                          <div style={{ fontSize: 11, color: DIM }}>{inc.incident_number} · {fmtDate(inc.incident_date)}</div>
                        </div>
                      </div>
                      <span style={badgeStyle(SEVERITY_COLORS[inc.severity] || DIM)}>{SEVERITY_LABELS[inc.severity] || inc.severity}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={badgeStyle(TYPE_COLORS[inc.incident_type] || DIM)}>{TYPE_LABELS[inc.incident_type]}</span>
                      <span style={badgeStyle(STATUS_COLORS[inc.status] || DIM)}>{STATUS_LABELS[inc.status]}</span>
                      {inc.recordable && <span style={badgeStyle(RED)}>RECORDABLE</span>}
                      {inc.osha_reportable && <span style={badgeStyle('#DC2626')}>OSHA REPORTABLE</span>}
                    </div>
                    {inc.location && <div style={{ fontSize: 12, color: DIM, marginTop: 6 }}>📍 {inc.location}</div>}
                  </div>
                ))}
              </>
            )}

            {/* ═══════════════════ CREATE VIEW — MULTI-STEP ═══════════════════ */}
            {view === 'create' && (
              <>
                {/* Step Indicators */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
                  {[1, 2, 3].map(s => (
                    <div key={s} onClick={() => s < step && setStep(s)}
                      style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: s === step ? GOLD : s < step ? GREEN : '#0A1628',
                        color: s <= step ? '#fff' : DIM, fontWeight: 700, fontSize: 14,
                        border: `2px solid ${s === step ? GOLD : s < step ? GREEN : BORDER}`,
                        cursor: s < step ? 'pointer' : 'default',
                      }}>
                      {s < step ? '✓' : s}
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: 'center', fontSize: 12, color: DIM, marginBottom: 16 }}>
                  {step === 1 ? 'Basic Information' : step === 2 ? 'Injury Details' : 'Investigation & Actions'}
                </div>

                {/* ─── Step 1: Basic Info ─── */}
                {step === 1 && (
                  <div style={cardStyle}>
                    <label style={labelStyle}>Title *</label>
                    <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} placeholder="Brief incident title" />

                    <label style={labelStyle}>Incident Type *</label>
                    <select value={form.incident_type} onChange={e => setForm(f => ({ ...f, incident_type: e.target.value }))} style={selectStyle}>
                      {INCIDENT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                    </select>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={labelStyle}>Date *</label>
                        <input type="date" value={form.incident_date} onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Time</label>
                        <input type="time" value={form.incident_time} onChange={e => setForm(f => ({ ...f, incident_time: e.target.value }))} style={inputStyle} />
                      </div>
                    </div>

                    <label style={labelStyle}>Location</label>
                    <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} style={inputStyle} placeholder="Where did it happen?" />

                    <label style={labelStyle}>Description *</label>
                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder="Detailed description of what happened..." />

                    <label style={labelStyle}>Severity *</label>
                    <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))} style={selectStyle}>
                      {SEVERITIES.map(s => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
                    </select>

                    <label style={labelStyle}>Reported By</label>
                    <input value={form.reported_by} onChange={e => setForm(f => ({ ...f, reported_by: e.target.value }))} style={inputStyle} placeholder="Your name" />

                    <label style={labelStyle}>Reported To</label>
                    <input value={form.reported_to} onChange={e => setForm(f => ({ ...f, reported_to: e.target.value }))} style={inputStyle} placeholder="Supervisor / Safety Manager" />

                    <label style={labelStyle}>Supervisor Name</label>
                    <input value={form.supervisor_name} onChange={e => setForm(f => ({ ...f, supervisor_name: e.target.value }))} style={inputStyle} placeholder="Direct supervisor" />

                    {/* GPS */}
                    <div style={{ marginTop: 12, padding: 10, background: '#0A1628', borderRadius: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 12, color: DIM }}>
                          GPS: {form.gps_lat && form.gps_lng ? `${form.gps_lat.toFixed(6)}, ${form.gps_lng.toFixed(6)}` : 'Not captured'}
                        </div>
                        <button onClick={captureGPS} style={{ background: 'none', border: `1px solid ${BORDER}`, color: GOLD, borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                          📍 Capture GPS
                        </button>
                      </div>
                    </div>

                    {/* Photos */}
                    <label style={labelStyle}>Photos</label>
                    <input type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoCapture}
                      style={{ ...inputStyle, padding: 8 }} />
                    {form.photos.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {form.photos.map((p, i) => (
                          <div key={i} style={{ position: 'relative' }}>
                            <img src={p} alt={`Photo ${i + 1}`} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: `1px solid ${BORDER}` }} />
                            <button onClick={() => setForm(f => ({ ...f, photos: f.photos.filter((_, j) => j !== i) }))}
                              style={{ position: 'absolute', top: -4, right: -4, background: RED, color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <button onClick={() => setStep(2)} disabled={!form.title.trim() || !form.description.trim()}
                      style={{ ...btnStyle(GOLD), width: '100%', justifyContent: 'center', marginTop: 16, opacity: (!form.title.trim() || !form.description.trim()) ? 0.5 : 1 }}>
                      Next: Injury Details →
                    </button>
                  </div>
                )}

                {/* ─── Step 2: Injury Details ─── */}
                {step === 2 && (
                  <div style={cardStyle}>
                    {(form.incident_type === 'injury' || form.incident_type === 'illness') ? (
                      <>
                        <label style={labelStyle}>Injured Person</label>
                        <input value={form.injured_person} onChange={e => setForm(f => ({ ...f, injured_person: e.target.value }))} style={inputStyle} placeholder="Full name of injured person" />

                        <label style={labelStyle}>Company</label>
                        <input value={form.injured_company} onChange={e => setForm(f => ({ ...f, injured_company: e.target.value }))} style={inputStyle} placeholder="Employer / subcontractor" />

                        <label style={labelStyle}>Injury Type</label>
                        <input value={form.injury_type} onChange={e => setForm(f => ({ ...f, injury_type: e.target.value }))} style={inputStyle} placeholder="e.g. Laceration, Fracture, Sprain" />

                        <label style={labelStyle}>Body Part Affected</label>
                        <input value={form.body_part} onChange={e => setForm(f => ({ ...f, body_part: e.target.value }))} style={inputStyle} placeholder="e.g. Left hand, Lower back" />

                        <label style={labelStyle}>Treatment</label>
                        <select value={form.treatment} onChange={e => setForm(f => ({ ...f, treatment: e.target.value }))} style={selectStyle}>
                          {TREATMENTS.map(t => <option key={t} value={t}>{TREATMENT_LABELS[t]}</option>)}
                        </select>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <label style={labelStyle}>Days Away from Work</label>
                            <input type="number" min={0} value={form.days_away} onChange={e => setForm(f => ({ ...f, days_away: parseInt(e.target.value) || 0 }))} style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>Days on Restricted Duty</label>
                            <input type="number" min={0} value={form.days_restricted} onChange={e => setForm(f => ({ ...f, days_restricted: parseInt(e.target.value) || 0 }))} style={inputStyle} />
                          </div>
                        </div>

                        {/* OSHA Recordability Helper */}
                        <div style={{ marginTop: 16, padding: 12, background: isLikelyRecordable ? 'rgba(239,68,68,.12)' : 'rgba(34,197,94,.08)',
                          border: `1px solid ${isLikelyRecordable ? RED : GREEN}`, borderRadius: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: isLikelyRecordable ? RED : GREEN, marginBottom: 6 }}>
                            {isLikelyRecordable ? '⚠ Likely OSHA Recordable' : '✓ Likely NOT Recordable'}
                          </div>
                          <div style={{ fontSize: 11, color: DIM, lineHeight: 1.5 }}>
                            OSHA recordability criteria:
                            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                              <li style={{ color: form.treatment === 'medical' ? RED : DIM }}>Medical treatment beyond first aid</li>
                              <li style={{ color: form.days_away > 0 ? RED : DIM }}>Days away from work</li>
                              <li style={{ color: form.days_restricted > 0 ? RED : DIM }}>Restricted work or transfer</li>
                              <li style={{ color: form.treatment === 'hospitalization' ? RED : DIM }}>Hospitalization</li>
                              <li style={{ color: form.severity === 'fatal' ? RED : DIM }}>Fatality</li>
                              <li style={{ color: DIM }}>Loss of consciousness</li>
                              <li style={{ color: DIM }}>Significant injury/illness diagnosed by physician</li>
                            </ul>
                          </div>
                          <div style={{ marginTop: 8, display: 'flex', gap: 12 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: TEXT }}>
                              <input type="checkbox" checked={form.recordable} onChange={e => setForm(f => ({ ...f, recordable: e.target.checked }))} /> Recordable
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: TEXT }}>
                              <input type="checkbox" checked={form.osha_reportable} onChange={e => setForm(f => ({ ...f, osha_reportable: e.target.checked }))} /> OSHA Reportable (8-hr)
                            </label>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: 30, color: DIM }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>{TYPE_ICONS[form.incident_type]}</div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                          {TYPE_LABELS[form.incident_type]} incident — injury details not applicable
                        </div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          Proceed to investigation step or go back to change type
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                      <button onClick={() => setStep(1)} style={{ ...btnStyle(BORDER), flex: 1, justifyContent: 'center' }}>← Back</button>
                      <button onClick={() => setStep(3)} style={{ ...btnStyle(GOLD), flex: 1, justifyContent: 'center' }}>Next: Investigation →</button>
                    </div>
                  </div>
                )}

                {/* ─── Step 3: Investigation ─── */}
                {step === 3 && (
                  <div style={cardStyle}>
                    {/* Witnesses */}
                    <label style={labelStyle}>Witnesses</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={witnessName} onChange={e => setWitnessName(e.target.value)} style={{ ...inputStyle, flex: 1 }}
                        placeholder="Witness name" onKeyDown={e => { if (e.key === 'Enter' && witnessName.trim()) { setForm(f => ({ ...f, witnesses: [...f.witnesses, witnessName.trim()] })); setWitnessName(''); } }} />
                      <button onClick={() => { if (witnessName.trim()) { setForm(f => ({ ...f, witnesses: [...f.witnesses, witnessName.trim()] })); setWitnessName(''); } }}
                        style={btnStyle(BLUE)} disabled={!witnessName.trim()}>Add</button>
                    </div>
                    {form.witnesses.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {form.witnesses.map((w, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#0A1628', padding: '4px 10px', borderRadius: 16, fontSize: 12 }}>
                            <span>{w}</span>
                            <button onClick={() => setForm(f => ({ ...f, witnesses: f.witnesses.filter((_, j) => j !== i) }))}
                              style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 12, padding: 0 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}

                    <label style={labelStyle}>Root Cause</label>
                    <textarea value={form.root_cause} onChange={e => setForm(f => ({ ...f, root_cause: e.target.value }))}
                      style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="What was the root cause of this incident?" />

                    <label style={labelStyle}>Preventive Measures</label>
                    <textarea value={form.preventive_measures} onChange={e => setForm(f => ({ ...f, preventive_measures: e.target.value }))}
                      style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="What will be done to prevent recurrence?" />

                    {/* Corrective Actions */}
                    <label style={labelStyle}>Corrective Actions</label>
                    <div style={{ padding: 10, background: '#0A1628', borderRadius: 8, marginBottom: 8 }}>
                      <input value={caDesc} onChange={e => setCaDesc(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} placeholder="Action description" />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <input value={caAssigned} onChange={e => setCaAssigned(e.target.value)} style={{ ...inputStyle, fontSize: 12 }} placeholder="Assigned to" />
                        <input type="date" value={caDue} onChange={e => setCaDue(e.target.value)} style={{ ...inputStyle, fontSize: 12 }} />
                      </div>
                      <button onClick={() => {
                        if (!caDesc.trim()) return;
                        const newCA: CorrectiveAction = { id: `ca-${Date.now()}`, description: caDesc.trim(), assigned_to: caAssigned, due_date: caDue, status: 'open' };
                        setForm(f => ({ ...f, corrective_actions: [...f.corrective_actions, newCA] }));
                        setCaDesc(''); setCaAssigned(''); setCaDue('');
                      }} style={{ ...btnStyle(BLUE), width: '100%', justifyContent: 'center', marginTop: 6 }} disabled={!caDesc.trim()}>
                        + Add Corrective Action
                      </button>
                    </div>
                    {form.corrective_actions.length > 0 && form.corrective_actions.map((ca, i) => (
                      <div key={ca.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#0A1628', borderRadius: 6, marginBottom: 4 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{ca.description}</div>
                          <div style={{ fontSize: 11, color: DIM }}>{ca.assigned_to}{ca.due_date ? ` · Due ${ca.due_date}` : ''}</div>
                        </div>
                        <button onClick={() => setForm(f => ({ ...f, corrective_actions: f.corrective_actions.filter((_, j) => j !== i) }))}
                          style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 14 }}>✕</button>
                      </div>
                    ))}

                    <label style={labelStyle}>Investigation By</label>
                    <input value={form.investigation_by} onChange={e => setForm(f => ({ ...f, investigation_by: e.target.value }))} style={inputStyle} placeholder="Investigator name" />

                    <label style={labelStyle}>Investigation Date</label>
                    <input type="date" value={form.investigation_date} onChange={e => setForm(f => ({ ...f, investigation_date: e.target.value }))} style={inputStyle} />

                    <label style={labelStyle}>Investigation Notes</label>
                    <textarea value={form.investigation_notes} onChange={e => setForm(f => ({ ...f, investigation_notes: e.target.value }))}
                      style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="Additional investigation notes..." />

                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                      <button onClick={() => setStep(2)} style={{ ...btnStyle(BORDER), flex: 1, justifyContent: 'center' }}>← Back</button>
                      <button onClick={saveIncident} disabled={saving}
                        style={{ ...btnStyle(GREEN), flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
                        {saving ? 'Saving...' : '✓ Submit Report'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ═══════════════════ DETAIL VIEW ═══════════════════ */}
            {view === 'detail' && selected && (
              <>
                {/* Header Info */}
                <div style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: DIM }}>{selected.incident_number}</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{selected.title}</div>
                    </div>
                    <span style={badgeStyle(SEVERITY_COLORS[selected.severity])}>{SEVERITY_LABELS[selected.severity]}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    <span style={badgeStyle(TYPE_COLORS[selected.incident_type])}>{TYPE_ICONS[selected.incident_type]} {TYPE_LABELS[selected.incident_type]}</span>
                    <span style={badgeStyle(STATUS_COLORS[selected.status])}>{STATUS_LABELS[selected.status]}</span>
                    {selected.recordable && <span style={badgeStyle(RED)}>RECORDABLE</span>}
                    {selected.osha_reportable && <span style={badgeStyle('#DC2626')}>OSHA REPORTABLE</span>}
                  </div>
                  <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6 }}>{selected.description}</div>
                </div>

                {/* Details Grid */}
                <div style={cardStyle}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 10 }}>Details</div>
                  {[
                    ['Date', `${fmtDate(selected.incident_date)} at ${fmtTime(selected.incident_time)}`],
                    ['Location', selected.location],
                    ['Reported By', selected.reported_by],
                    ['Reported To', selected.reported_to],
                    ['Supervisor', selected.supervisor_name],
                    ...(selected.gps_lat && selected.gps_lng ? [['GPS', `${selected.gps_lat.toFixed(6)}, ${selected.gps_lng.toFixed(6)}`]] : []),
                  ].map(([label, val]) => val ? (
                    <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>
                      <span style={{ fontSize: 12, color: DIM }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{val}</span>
                    </div>
                  ) : null)}
                </div>

                {/* Injury Details */}
                {(selected.incident_type === 'injury' || selected.incident_type === 'illness') && (selected.injured_person || selected.injury_type) && (
                  <div style={cardStyle}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 10 }}>Injury Details</div>
                    {[
                      ['Injured Person', selected.injured_person],
                      ['Company', selected.injured_company],
                      ['Injury Type', selected.injury_type],
                      ['Body Part', selected.body_part],
                      ['Treatment', TREATMENT_LABELS[selected.treatment] || selected.treatment],
                      ['Days Away', selected.days_away > 0 ? String(selected.days_away) : ''],
                      ['Days Restricted', selected.days_restricted > 0 ? String(selected.days_restricted) : ''],
                    ].map(([label, val]) => val ? (
                      <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>
                        <span style={{ fontSize: 12, color: DIM }}>{label}</span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{val}</span>
                      </div>
                    ) : null)}
                  </div>
                )}

                {/* Investigation Timeline */}
                <div style={cardStyle}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 12 }}>Investigation Timeline</div>
                  <div style={{ position: 'relative', paddingLeft: 20 }}>
                    {/* Timeline line */}
                    <div style={{ position: 'absolute', left: 6, top: 0, bottom: 0, width: 2, background: BORDER }} />

                    {/* Reported */}
                    <div style={{ position: 'relative', marginBottom: 16 }}>
                      <div style={{ position: 'absolute', left: -20, top: 2, width: 14, height: 14, borderRadius: '50%', background: GOLD, border: `2px solid ${RAISED}` }} />
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Incident Reported</div>
                      <div style={{ fontSize: 11, color: DIM }}>{fmtDate(selected.incident_date)} — by {selected.reported_by || 'Unknown'}</div>
                    </div>

                    {/* Investigation started */}
                    {selected.investigation_by && (
                      <div style={{ position: 'relative', marginBottom: 16 }}>
                        <div style={{ position: 'absolute', left: -20, top: 2, width: 14, height: 14, borderRadius: '50%', background: BLUE, border: `2px solid ${RAISED}` }} />
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Investigation Started</div>
                        <div style={{ fontSize: 11, color: DIM }}>{fmtDate(selected.investigation_date)} — by {selected.investigation_by}</div>
                      </div>
                    )}

                    {/* Root cause identified */}
                    {selected.root_cause && (
                      <div style={{ position: 'relative', marginBottom: 16 }}>
                        <div style={{ position: 'absolute', left: -20, top: 2, width: 14, height: 14, borderRadius: '50%', background: AMBER, border: `2px solid ${RAISED}` }} />
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Root Cause Identified</div>
                        <div style={{ fontSize: 11, color: DIM }}>{selected.root_cause}</div>
                      </div>
                    )}

                    {/* Corrective actions assigned */}
                    {selected.corrective_actions.length > 0 && (
                      <div style={{ position: 'relative', marginBottom: 16 }}>
                        <div style={{ position: 'absolute', left: -20, top: 2, width: 14, height: 14, borderRadius: '50%', background: '#A855F7', border: `2px solid ${RAISED}` }} />
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{selected.corrective_actions.length} Corrective Action{selected.corrective_actions.length !== 1 ? 's' : ''} Assigned</div>
                        <div style={{ fontSize: 11, color: DIM }}>
                          {selected.corrective_actions.filter(ca => ca.status === 'closed').length} completed
                        </div>
                      </div>
                    )}

                    {/* Closed */}
                    {selected.status === 'closed' && (
                      <div style={{ position: 'relative', marginBottom: 16 }}>
                        <div style={{ position: 'absolute', left: -20, top: 2, width: 14, height: 14, borderRadius: '50%', background: GREEN, border: `2px solid ${RAISED}` }} />
                        <div style={{ fontSize: 13, fontWeight: 600, color: GREEN }}>Incident Closed</div>
                      </div>
                    )}
                  </div>

                  {/* Investigation Notes */}
                  {selected.investigation_notes && (
                    <div style={{ marginTop: 10, padding: 10, background: '#0A1628', borderRadius: 8 }}>
                      <div style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 4 }}>Investigation Notes</div>
                      <div style={{ fontSize: 12, lineHeight: 1.5 }}>{selected.investigation_notes}</div>
                    </div>
                  )}
                </div>

                {/* Witnesses */}
                {selected.witnesses && selected.witnesses.length > 0 && (
                  <div style={cardStyle}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 10 }}>Witnesses ({selected.witnesses.length})</div>
                    {selected.witnesses.map((w, i) => (
                      <div key={i} style={{ padding: '6px 10px', background: '#0A1628', borderRadius: 6, marginBottom: 4, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 22, height: 22, borderRadius: '50%', background: BORDER, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: DIM }}>
                          {i + 1}
                        </span>
                        {w}
                      </div>
                    ))}
                  </div>
                )}

                {/* Preventive Measures */}
                {selected.preventive_measures && (
                  <div style={cardStyle}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 8 }}>Preventive Measures</div>
                    <div style={{ fontSize: 13, lineHeight: 1.6 }}>{selected.preventive_measures}</div>
                  </div>
                )}

                {/* Corrective Actions */}
                {selected.corrective_actions.length > 0 && (
                  <div style={cardStyle}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 10 }}>
                      Corrective Actions ({selected.corrective_actions.filter(ca => ca.status === 'closed').length}/{selected.corrective_actions.length} complete)
                    </div>
                    {selected.corrective_actions.map(ca => (
                      <div key={ca.id} style={{ padding: 10, background: '#0A1628', borderRadius: 8, marginBottom: 8, borderLeft: `3px solid ${ca.status === 'closed' ? GREEN : ca.status === 'in_progress' ? AMBER : RED}` }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{ca.description}</div>
                        <div style={{ fontSize: 11, color: DIM }}>
                          {ca.assigned_to && `Assigned: ${ca.assigned_to}`}
                          {ca.due_date && ` · Due: ${fmtDate(ca.due_date)}`}
                          {ca.completed_date && ` · Completed: ${fmtDate(ca.completed_date)}`}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          {['open', 'in_progress', 'closed'].map(s => (
                            <button key={s} onClick={() => updateCAStatus(selected.id, ca.id, s)}
                              style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                background: ca.status === s ? (s === 'closed' ? GREEN : s === 'in_progress' ? AMBER : RED) : 'transparent',
                                color: ca.status === s ? '#fff' : DIM,
                                border: `1px solid ${ca.status === s ? 'transparent' : BORDER}`,
                              }}>
                              {s === 'open' ? 'Open' : s === 'in_progress' ? 'In Progress' : 'Closed'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Photos */}
                {selected.photos && selected.photos.length > 0 && (
                  <div style={cardStyle}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 10 }}>Photos ({selected.photos.length})</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {selected.photos.map((p, i) => (
                        <img key={i} src={p} alt={`Incident photo ${i + 1}`}
                          style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}` }} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Status Workflow */}
                <div style={cardStyle}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 10 }}>Update Status</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: DIM }}>Current:</span>
                    <span style={badgeStyle(STATUS_COLORS[selected.status])}>{STATUS_LABELS[selected.status]}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(STATUS_FLOW[selected.status] || []).map(nextStatus => (
                      <button key={nextStatus} onClick={() => updateStatus(selected.id, nextStatus)}
                        style={btnStyle(STATUS_COLORS[nextStatus])}>
                        → {STATUS_LABELS[nextStatus]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button onClick={() => exportIncidentPDF(selected)} style={{ ...btnStyle('#6366F1'), flex: 1, justifyContent: 'center' }}>
                    Export PDF
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════ EXPORTED DEFAULT WITH SUSPENSE ═══════════════ */
export default function IncidentsPageWrapper() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#080F1A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8BAAC8' }}>Loading...</div>}>
      <IncidentsPage />
    </Suspense>
  );
}
