'use client';
/**
 * Saguaro Field — Safety Incidents & Corrective Actions
 * Report incidents, track corrective actions, manage safety from the field. Offline queue.
 */
import React, { useState, useEffect, useRef, Suspense } from 'react';
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

const INCIDENT_TYPES = ['near_miss', 'first_aid', 'recordable', 'lost_time'];
const TYPE_LABELS: Record<string, string> = { near_miss: 'Near Miss', first_aid: 'First Aid', recordable: 'Recordable', lost_time: 'Lost Time' };
const TYPE_COLORS: Record<string, string> = { near_miss: BLUE, first_aid: AMBER, recordable: RED, lost_time: '#DC2626' };

const CA_STATUSES = ['open', 'in_progress', 'verified', 'closed'];
const CA_STATUS_LABELS: Record<string, string> = { open: 'Open', in_progress: 'In Progress', verified: 'Verified', closed: 'Closed' };
const CA_STATUS_COLORS: Record<string, string> = { open: RED, in_progress: AMBER, verified: BLUE, closed: GREEN };

const SEVERITY_COLORS = ['#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#DC2626'];

interface CorrectiveAction {
  id: string;
  description: string;
  assigned_to?: string;
  due_date?: string;
  status: string;
  created_at?: string;
}

interface Incident {
  id: string;
  date: string;
  type: string;
  description: string;
  location?: string;
  severity: number;
  status?: string;
  corrective_actions?: CorrectiveAction[];
  photo_urls?: string[];
  created_at?: string;
}

type View = 'list' | 'detail' | 'create' | 'add_ca';

function formatDate(d: string | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function SafetyPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<Incident | null>(null);
  const [online, setOnline] = useState(true);
  const [projectName, setProjectName] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  // Create incident form
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newType, setNewType] = useState<string>('near_miss');
  const [newDesc, setNewDesc] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newSeverity, setNewSeverity] = useState(1);
  const [newCA, setNewCA] = useState('');

  // Photo attachment
  const photoRef = useRef<HTMLInputElement>(null);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);

  // Add corrective action form
  const [caDesc, setCaDesc] = useState('');
  const [caAssigned, setCaAssigned] = useState('');
  const [caDueDate, setCaDueDate] = useState('');

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotoPreviews((prev) => [...prev, String(ev.target?.result || '')]);
        setPhotoFiles((prev) => [...prev, file]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removePhoto = (idx: number) => {
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
    setPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadPhotos = async (): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of photoFiles) {
      try {
        const fd = new FormData();
        fd.append('file', file, file.name);
        fd.append('category', 'Safety');
        fd.append('caption', newDesc.trim().slice(0, 80));
        if (projectId) fd.append('projectId', projectId);
        const res = await fetch('/api/photos/upload', { method: 'POST', body: fd });
        if (res.ok) {
          const data = await res.json();
          urls.push(String(data.photo?.url || ''));
        }
      } catch { /* skip failed uploads */ }
    }
    return urls;
  };

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    fetch('/api/projects/list')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { const p = d?.projects?.find((x: { id: string; name: string }) => x.id === projectId); if (p) setProjectName(p.name); })
      .catch(() => {});
    loadIncidents();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadIncidents = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/safety`);
      const d = await r.json();
      setIncidents(d.incidents || d.items || d.data || []);
    } catch { /* offline */ }
    setLoading(false);
  };

  const openDetail = (incident: Incident) => {
    setSelected(incident);
    setView('detail');
    setActionMsg('');
  };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDesc.trim()) return;
    setSaving(true);

    // Upload photos first if online
    let photoUrls: string[] = [];
    if (photoFiles.length > 0 && online) {
      photoUrls = await uploadPhotos();
    }

    const payload = {
      projectId,
      date: newDate,
      type: newType,
      description: newDesc.trim(),
      location: newLocation.trim(),
      severity: newSeverity,
      corrective_action: newCA.trim() || null,
      photo_urls: photoUrls,
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch(`/api/projects/${projectId}/safety`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      await loadIncidents();
    } catch {
      await enqueue({
        url: `/api/projects/${projectId}/safety`,
        method: 'POST',
        body: JSON.stringify(payload),
        contentType: 'application/json',
        isFormData: false,
      });
      const localIncident: Incident = {
        id: `local-${Date.now()}`,
        date: newDate,
        type: newType,
        description: newDesc.trim(),
        location: newLocation.trim(),
        severity: newSeverity,
        status: 'open',
        corrective_actions: newCA.trim() ? [{ id: `local-ca-${Date.now()}`, description: newCA.trim(), status: 'open' }] : [],
        photo_urls: photoPreviews,
        created_at: new Date().toISOString(),
      };
      setIncidents((prev) => [localIncident, ...prev]);
    }

    resetCreateForm();
    setView('list');
    setSaving(false);
  };

  const resetCreateForm = () => {
    setNewDate(new Date().toISOString().slice(0, 10));
    setNewType('near_miss');
    setNewDesc('');
    setNewLocation('');
    setNewSeverity(1);
    setNewCA('');
    setPhotoPreviews([]);
    setPhotoFiles([]);
  };

  const handleAddCA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !caDesc.trim()) return;
    setSaving(true);

    const payload = {
      incident_id: selected.id,
      description: caDesc.trim(),
      assigned_to: caAssigned.trim() || null,
      due_date: caDueDate || null,
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch(`/api/projects/${projectId}/safety/corrective-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json().catch(() => ({}));
      const newAction: CorrectiveAction = {
        id: data.id || `temp-${Date.now()}`,
        description: caDesc.trim(),
        assigned_to: caAssigned.trim() || undefined,
        due_date: caDueDate || undefined,
        status: 'open',
        created_at: new Date().toISOString(),
      };
      const updatedIncident = { ...selected, corrective_actions: [...(selected.corrective_actions || []), newAction] };
      setSelected(updatedIncident);
      setIncidents((prev) => prev.map((i) => i.id === selected.id ? updatedIncident : i));
      setActionMsg('Corrective action added');
    } catch {
      await enqueue({
        url: `/api/projects/${projectId}/safety/corrective-actions`,
        method: 'POST',
        body: JSON.stringify(payload),
        contentType: 'application/json',
        isFormData: false,
      });
      const newAction: CorrectiveAction = {
        id: `queued-${Date.now()}`,
        description: caDesc.trim(),
        assigned_to: caAssigned.trim() || undefined,
        due_date: caDueDate || undefined,
        status: 'open',
        created_at: new Date().toISOString(),
      };
      const updatedIncident = { ...selected, corrective_actions: [...(selected.corrective_actions || []), newAction] };
      setSelected(updatedIncident);
      setIncidents((prev) => prev.map((i) => i.id === selected.id ? updatedIncident : i));
      setActionMsg('Corrective action queued — will sync when online');
    }

    setCaDesc('');
    setCaAssigned('');
    setCaDueDate('');
    setSaving(false);
    setView('detail');
    setTimeout(() => setActionMsg(''), 3500);
  };

  const updateCAStatus = async (ca: CorrectiveAction, newStatus: string) => {
    if (!selected) return;

    // Optimistic update
    const updatedCAs = (selected.corrective_actions || []).map((c) => c.id === ca.id ? { ...c, status: newStatus } : c);
    const updatedIncident = { ...selected, corrective_actions: updatedCAs };
    setSelected(updatedIncident);
    setIncidents((prev) => prev.map((i) => i.id === selected.id ? updatedIncident : i));

    try {
      if (!online) throw new Error('offline');
      await fetch(`/api/projects/${projectId}/safety/corrective-actions/${ca.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      await enqueue({
        url: `/api/projects/${projectId}/safety/corrective-actions/${ca.id}`,
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
        contentType: 'application/json',
        isFormData: false,
      });
    }
  };

  // Stats
  const totalIncidents = incidents.length;
  const openIncidents = incidents.filter((i) => i.status !== 'closed').length;
  const allCAs = incidents.flatMap((i) => i.corrective_actions || []);
  const openCAs = allCAs.filter((ca) => ca.status !== 'closed' && ca.status !== 'verified').length;

  const daysSinceLast = (() => {
    if (incidents.length === 0) return '—';
    const sorted = [...incidents].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const lastDate = new Date(sorted[0].date);
    const today = new Date();
    const diff = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    return String(diff);
  })();

  // Severity stars
  const SeverityStars = ({ level, size = 14 }: { level: number; size?: number }) => (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} viewBox="0 0 24 24" fill={s <= level ? SEVERITY_COLORS[Math.min(level - 1, 4)] : 'none'} stroke={s <= level ? SEVERITY_COLORS[Math.min(level - 1, 4)] : BORDER} strokeWidth={2} width={size} height={size}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ))}
    </span>
  );

  // ─── LIST VIEW ────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div style={{ padding: '18px 16px' }}>
        <button onClick={() => router.back()} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
            <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>Safety</h1>
            <p style={{ margin: 0, fontSize: 13, color: DIM }}>{projectName}</p>
          </div>
          <button onClick={() => { setView('create'); resetCreateForm(); }} style={{
            background: RED, border: 'none', borderRadius: 10, padding: '10px 16px',
            color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
          }}>
            + Report
          </button>
        </div>

        {!online && <OfflineBanner />}

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <StatCard label="Total Incidents" value={String(totalIncidents)} color={TEXT} />
          <StatCard label="Open" value={String(openIncidents)} color={openIncidents > 0 ? RED : GREEN} />
          <StatCard label="Days Since Last" value={daysSinceLast} color={daysSinceLast === '—' ? DIM : parseInt(daysSinceLast) > 30 ? GREEN : AMBER} />
          <StatCard label="Open CAs" value={String(openCAs)} color={openCAs > 0 ? AMBER : GREEN} />
        </div>

        {/* List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading incidents...</div>
        ) : incidents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: DIM }}>
            <div style={{ marginBottom: 8, color: GREEN, display: 'flex', justifyContent: 'center', opacity: 0.6 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: 14 }}>No incidents reported. Tap "+ Report" to log one.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {incidents.map((incident) => {
              const tc = TYPE_COLORS[incident.type] || DIM;
              return (
                <button
                  key={incident.id}
                  onClick={() => openDetail(incident)}
                  style={{
                    background: RAISED, border: `1px solid ${incident.severity >= 4 ? 'rgba(239,68,68,.3)' : BORDER}`,
                    borderRadius: 14, padding: '14px', textAlign: 'left', width: '100%', cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: DIM }}>{formatDate(incident.date)}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                          background: `rgba(${hexRgb(tc)},.12)`,
                          color: tc,
                        }}>
                          {TYPE_LABELS[incident.type] || incident.type}
                        </span>
                        {incident.status && incident.status !== 'open' && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                            background: `rgba(${hexRgb(incident.status === 'closed' ? GREEN : AMBER)},.12)`,
                            color: incident.status === 'closed' ? GREEN : AMBER,
                          }}>
                            {incident.status}
                          </span>
                        )}
                      </div>
                      <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.3 }}>{incident.description}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <SeverityStars level={incident.severity} size={12} />
                        {incident.location && (
                          <span style={{ fontSize: 12, color: DIM, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx={12} cy={10} r={3}/></svg>
                            {incident.location}
                          </span>
                        )}
                        {incident.corrective_actions && incident.corrective_actions.length > 0 && (
                          <span style={{ fontSize: 11, color: DIM }}>{incident.corrective_actions.length} CA{incident.corrective_actions.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                    <span style={{ color: DIM, fontSize: 18, flexShrink: 0, marginTop: 4 }}>›</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─── DETAIL VIEW ──────────────────────────────────────────────
  if (view === 'detail' && selected) {
    const tc = TYPE_COLORS[selected.type] || DIM;
    return (
      <div style={{ padding: '18px 16px' }}>
        <button onClick={() => { setView('list'); setActionMsg(''); }} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
            <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: DIM }}>{formatDate(selected.date)}</span>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
            background: `rgba(${hexRgb(tc)},.12)`,
            color: tc,
          }}>
            {TYPE_LABELS[selected.type] || selected.type}
          </span>
          {selected.status && (
            <span style={{
              fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
              background: `rgba(${hexRgb(selected.status === 'closed' ? GREEN : AMBER)},.12)`,
              color: selected.status === 'closed' ? GREEN : AMBER,
            }}>
              {selected.status}
            </span>
          )}
        </div>

        <h1 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: TEXT, lineHeight: 1.3 }}>{selected.description}</h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <SeverityStars level={selected.severity} />
          <span style={{ fontSize: 13, color: DIM }}>Severity {selected.severity}/5</span>
        </div>

        {actionMsg && (
          <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: GREEN, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polyline points="20 6 9 17 4 12"/></svg>{actionMsg}
          </div>
        )}

        {!online && <OfflineBanner />}

        {/* Incident Details */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
          <p style={secLbl}>Incident Details</p>
          {selected.location && (
            <p style={{ margin: '0 0 8px', fontSize: 14, color: TEXT, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx={12} cy={10} r={3}/></svg>
              {selected.location}
            </p>
          )}
          <p style={{ margin: 0, fontSize: 14, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selected.description}</p>
        </div>

        {/* Attached photos */}
        {selected.photo_urls && selected.photo_urls.length > 0 && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
            <p style={secLbl}>Photos</p>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
              {selected.photo_urls.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={url} alt={`Photo ${i + 1}`} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 10, border: `1px solid ${BORDER}`, flexShrink: 0 }} />
              ))}
            </div>
          </div>
        )}

        {/* Corrective Actions */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ ...secLbl, margin: 0 }}>Corrective Actions ({(selected.corrective_actions || []).length})</p>
            <button
              onClick={() => { setView('add_ca'); setCaDesc(''); setCaAssigned(''); setCaDueDate(''); }}
              style={{ background: 'rgba(212,160,23,.12)', border: `1px solid rgba(212,160,23,.3)`, borderRadius: 8, padding: '5px 12px', color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              + Add CA
            </button>
          </div>
          {(!selected.corrective_actions || selected.corrective_actions.length === 0) ? (
            <p style={{ margin: 0, fontSize: 13, color: DIM, fontStyle: 'italic' }}>No corrective actions yet</p>
          ) : (
            selected.corrective_actions.map((ca, i) => {
              const caColor = CA_STATUS_COLORS[ca.status] || DIM;
              const currentIdx = CA_STATUSES.indexOf(ca.status);
              const nextStatus = currentIdx < CA_STATUSES.length - 1 ? CA_STATUSES[currentIdx + 1] : null;
              return (
                <div key={ca.id} style={{ padding: '12px 0', borderTop: i > 0 ? `1px solid ${BORDER}` : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                      background: `rgba(${hexRgb(caColor)},.12)`,
                      color: caColor,
                    }}>
                      {CA_STATUS_LABELS[ca.status] || ca.status}
                    </span>
                    {ca.due_date && <span style={{ fontSize: 11, color: new Date(ca.due_date) < new Date() && ca.status !== 'closed' && ca.status !== 'verified' ? RED : DIM }}>Due {formatDate(ca.due_date)}</span>}
                  </div>
                  <p style={{ margin: '4px 0', fontSize: 14, color: TEXT, lineHeight: 1.4 }}>{ca.description}</p>
                  {ca.assigned_to && <p style={{ margin: '2px 0 0', fontSize: 12, color: DIM }}>Assigned to: {ca.assigned_to}</p>}
                  {nextStatus && (
                    <button
                      onClick={() => updateCAStatus(ca, nextStatus)}
                      style={{
                        marginTop: 8, background: `rgba(${hexRgb(CA_STATUS_COLORS[nextStatus])},.12)`,
                        border: `1px solid rgba(${hexRgb(CA_STATUS_COLORS[nextStatus])},.3)`,
                        borderRadius: 8, padding: '6px 14px',
                        color: CA_STATUS_COLORS[nextStatus], fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      Move to {CA_STATUS_LABELS[nextStatus]}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // ─── ADD CORRECTIVE ACTION VIEW ───────────────────────────────
  if (view === 'add_ca' && selected) {
    return (
      <div style={{ padding: '18px 16px' }}>
        <button onClick={() => setView('detail')} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
            <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: GOLD }}>Add Corrective Action</h1>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: DIM }}>For: {selected.description.slice(0, 60)}{selected.description.length > 60 ? '...' : ''}</p>

        {!online && <OfflineBanner />}

        <form onSubmit={handleAddCA}>
          <div style={card}>
            <p style={secLbl}>Corrective Action Details</p>

            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Description *</label>
              <textarea value={caDesc} onChange={(e) => setCaDesc(e.target.value)} placeholder="Describe the corrective action to be taken..." rows={4} style={inp} required />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={lbl}>Assigned To</label>
                <input value={caAssigned} onChange={(e) => setCaAssigned(e.target.value)} placeholder="Person responsible" style={inp} />
              </div>
              <div>
                <label style={lbl}>Due Date</label>
                <input type="date" value={caDueDate} onChange={(e) => setCaDueDate(e.target.value)} style={inp} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => setView('detail')} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px', color: DIM, fontSize: 15, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{ flex: 2, background: saving ? '#1E3A5F' : GOLD, border: 'none', borderRadius: 12, padding: '16px', color: saving ? DIM : '#000', fontSize: 15, fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Saving...' : 'Add Corrective Action'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ─── CREATE INCIDENT VIEW ─────────────────────────────────────
  return (
    <div style={{ padding: '18px 16px' }}>
      <button onClick={() => setView('list')} style={backBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
          <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: RED }}>Report Incident</h1>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: DIM }}>Log a safety incident for this project</p>

      {!online && <OfflineBanner />}

      <form onSubmit={handleCreateIncident}>
        <div style={card}>
          <p style={secLbl}>Incident Information</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Date *</label>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={inp} required />
            </div>
            <div>
              <label style={lbl}>Type *</label>
              <select value={newType} onChange={(e) => setNewType(e.target.value)} style={inp}>
                {INCIDENT_TYPES.map((t) => <option key={t} value={t} style={{ background: '#0D1D2E' }}>{TYPE_LABELS[t]}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Description *</label>
            <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Describe what happened, who was involved, contributing factors..." rows={4} style={inp} required />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Location</label>
            <input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="e.g. Level 3, South stairwell" style={inp} />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Severity (1-5) *</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={newSeverity}
                onChange={(e) => setNewSeverity(parseInt(e.target.value))}
                style={{ flex: 1, accentColor: SEVERITY_COLORS[Math.min(newSeverity - 1, 4)] }}
              />
              <SeverityStars level={newSeverity} />
              <span style={{ fontSize: 14, fontWeight: 800, color: SEVERITY_COLORS[Math.min(newSeverity - 1, 4)], minWidth: 16, textAlign: 'center' }}>{newSeverity}</span>
            </div>
          </div>
        </div>

        <div style={card}>
          <p style={secLbl}>Corrective Action</p>
          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Initial Corrective Action</label>
            <textarea value={newCA} onChange={(e) => setNewCA(e.target.value)} placeholder="Describe immediate corrective measures taken or needed..." rows={3} style={inp} />
          </div>
        </div>

        {/* Photo attachment */}
        <div style={card}>
          <p style={secLbl}>Photos</p>
          <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoCapture} style={{ display: 'none' }} />
          <button type="button" onClick={() => photoRef.current?.click()} style={{ width: '100%', background: 'transparent', border: `2px dashed rgba(212,160,23,.4)`, borderRadius: 10, padding: '14px', color: GOLD, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: photoPreviews.length ? 10 : 0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx={12} cy={13} r={4}/></svg>
            Attach Photo
          </button>
          {photoPreviews.length > 0 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {photoPreviews.map((src, i) => (
                <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Photo ${i + 1}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}` }} />
                  <button type="button" onClick={() => removePhoto(i)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: RED, border: 'none', color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => { setView('list'); resetCreateForm(); }} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px', color: DIM, fontSize: 15, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving} style={{ flex: 2, background: saving ? '#1E3A5F' : RED, border: 'none', borderRadius: 12, padding: '16px', color: saving ? DIM : '#fff', fontSize: 15, fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Saving...' : online ? 'Report Incident' : 'Report (Offline — will sync)'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function FieldSafetyPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}>
      <SafetyPage />
    </Suspense>
  );
}

// Shared helpers
function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px' }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, color }}>{value}</p>
    </div>
  );
}

function OfflineBanner() {
  return <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: RED, fontWeight: 600 }}>Offline — will sync when reconnected</div>;
}

const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 14px 6px', marginBottom: 12 };
const secLbl: React.CSSProperties = { margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, color: DIM, marginBottom: 4, fontWeight: 600 };
const inp: React.CSSProperties = { width: '100%', background: '#07101C', border: '1px solid #1E3A5F', borderRadius: 10, padding: '11px 14px', color: '#F0F4FF', fontSize: 15, outline: 'none' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: '8px', marginLeft: -8, display: 'flex', alignItems: 'center', marginBottom: 4 };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
