'use client';
/**
 * Saguaro Field -- Punch List Creation + List
 * Mobile-first field page for creating and managing punch list items.
 */
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';
import { takePhoto, hapticSuccess, hapticLight, hapticError, isNative } from '@/lib/native';
import OfflineSyncStatus from '@/components/field/OfflineSyncStatus';
import VoiceToLog from '@/components/field/VoiceToLog';

const GOLD   = '#C8960F';
const DARK = '#F8F9FB';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const DIM = '#6B7280';
const TEXT = '#111827';
const GREEN  = '#22c55e';
const RED    = '#ef4444';
const AMBER  = '#f59e0b';
const BLUE   = '#3b82f6';

const TRADES = [
  'Concrete', 'Framing', 'Electrical', 'Plumbing', 'HVAC',
  'Roofing', 'Drywall', 'Paint', 'Flooring', 'General',
];

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const PRIORITY_COLORS: Record<string, string> = { Low: DIM, Medium: BLUE, High: AMBER, Critical: RED };
const STATUS_COLORS: Record<string, string> = { open: RED, complete: GREEN };
const FILTER_OPTIONS = ['All', 'Open', 'Complete'];

/* ─── Interfaces ─── */
interface PunchItem {
  id: string;
  title: string;
  description?: string;
  location?: string;
  trade?: string;
  assigned_to?: string;
  priority: string;
  due_date?: string;
  status: string;
  created_at?: string;
  photo_urls?: string[];
}

type Tab = 'create' | 'list';

/* ─── Inner component ─── */
function PunchListInner() {
  const params = useSearchParams();
  const router = useRouter();
  const projectId = params.get('projectId') || new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('projectId') || '';

  const [tab, setTab] = useState<Tab>('create');
  const [projectName, setProjectName] = useState('');
  const [toast, setToast] = useState('');

  /* Create form state */
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [trade, setTrade] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [dueDate, setDueDate] = useState('');
  const [photos, setPhotos] = useState<Array<{ file: File; preview: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* List state */
  const [items, setItems] = useState<PunchItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [filter, setFilter] = useState('All');

  /* ── Fetch project name ── */
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.name) setProjectName(d.name); })
      .catch(() => {});
  }, [projectId]);

  /* ── Toast ── */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Fetch items ── */
  const fetchItems = useCallback(async () => {
    if (!projectId) return;
    setListLoading(true);
    try {
      const res = await fetch(`/api/punch-list/list?project_id=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : data.items || data.punch_items || []);
      }
    } catch { /* offline */ }
    setListLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (tab === 'list') fetchItems();
  }, [tab, fetchItems]);

  /* ── Photo capture ── */
  const handleCameraCapture = async () => {
    if (isNative()) {
      const result = await takePhoto({ source: 'camera', quality: 80 });
      if (result) {
        setPhotos(prev => [...prev, { file: result.file, preview: result.dataUrl }]);
        hapticLight();
      }
    } else {
      fileRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        setPhotos(prev => [...prev, { file, preview: ev.target?.result as string }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  /* ── Submit ── */
  const handleSubmit = async () => {
    if (!title.trim()) {
      setToast('Title is required');
      hapticError();
      return;
    }
    setSubmitting(true);

    const body: Record<string, unknown> = {
      project_id: projectId,
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      trade: trade || undefined,
      assigned_to: assignedTo.trim() || undefined,
      priority,
      due_date: dueDate || undefined,
      status: 'open',
    };

    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

    if (online) {
      try {
        let res: Response;
        if (photos.length > 0) {
          const fd = new FormData();
          Object.entries(body).forEach(([k, v]) => { if (v !== undefined) fd.append(k, String(v)); });
          photos.forEach((p, i) => fd.append(`photo_${i}`, p.file));
          res = await fetch('/api/punch-list/create', { method: 'POST', body: fd });
        } else {
          res = await fetch('/api/punch-list/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
        }
        if (res.ok) {
          setToast('Punch item created');
          hapticSuccess();
          resetForm();
          setTab('list');
        } else {
          const err = await res.text();
          setToast(`Error: ${err}`);
          hapticError();
        }
      } catch {
        await queueOffline(body);
      }
    } else {
      await queueOffline(body);
    }
    setSubmitting(false);
  };

  const queueOffline = async (body: Record<string, unknown>) => {
    try {
      await enqueue({
        url: '/api/punch-list/create',
        method: 'POST',
        body: JSON.stringify(body),
        contentType: 'application/json',
        isFormData: false,
      });
      setToast('Saved offline -- will sync when connected');
      hapticLight();
      resetForm();
      setTab('list');
    } catch (err: unknown) {
      setToast(`Offline save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      hapticError();
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLocation('');
    setTrade('');
    setAssignedTo('');
    setPriority('Medium');
    setDueDate('');
    setPhotos([]);
  };

  /* ── Mark complete ── */
  const markComplete = async (item: PunchItem) => {
    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (online) {
      try {
        const res = await fetch(`/api/punch-list/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'complete' }),
        });
        if (res.ok) {
          setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'complete' } : i));
          setToast('Marked complete');
          hapticSuccess();
        }
      } catch {
        await enqueue({
          url: `/api/punch-list/${item.id}`,
          method: 'PATCH',
          body: JSON.stringify({ status: 'complete' }),
          contentType: 'application/json',
          isFormData: false,
        });
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'complete' } : i));
        setToast('Queued offline');
        hapticLight();
      }
    } else {
      await enqueue({
        url: `/api/punch-list/${item.id}`,
        method: 'PATCH',
        body: JSON.stringify({ status: 'complete' }),
        contentType: 'application/json',
        isFormData: false,
      });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'complete' } : i));
      setToast('Queued offline');
      hapticLight();
    }
  };

  /* ── Voice input ── */
  const handleVoice = (text: string) => {
    if (tab === 'create') {
      setDescription(prev => prev ? `${prev} ${text}` : text);
    }
  };

  /* ── Filtered items ── */
  const filteredItems = filter === 'All'
    ? items
    : items.filter(i => i.status.toLowerCase() === filter.toLowerCase());

  /* ─── Shared styles ─── */
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    background: DARK,
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    color: TEXT,
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: DIM,
    marginBottom: 4,
    display: 'block',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%238fa3c0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
    paddingRight: 36,
  };

  /* ─── Render ─── */
  return (
    <div style={{ minHeight: '100dvh', background: DARK, color: TEXT, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: RAISED, borderBottom: `1px solid ${BORDER}`,
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => router.push('/field')} style={{
          background: 'none', border: 'none', color: GOLD, fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1,
        }} aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT }}>Punch List</div>
          {projectName && <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{projectName}</div>}
        </div>
      </div>

      {/* Tab Switcher */}
      <div style={{ display: 'flex', padding: '12px 16px 0', gap: 8 }}>
        {(['create', 'list'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            background: tab === t ? GOLD : RAISED,
            color: tab === t ? DARK : DIM,
            transition: 'all 0.2s',
          }}>
            {t === 'create' ? 'Create' : 'Open Items'}
          </button>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          background: toast.startsWith('Error') ? RED : GREEN, color: '#fff',
          padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)', whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}

      {/* ═══ CREATE TAB ═══ */}
      {tab === 'create' && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Title */}
          <div>
            <label style={labelStyle}>Title *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Punch item title" style={inputStyle} />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Details about the issue..." rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }} />
          </div>

          {/* Voice input */}
          <VoiceToLog onTranscript={handleVoice} />

          {/* Location */}
          <div>
            <label style={labelStyle}>Location</label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Room 201, Exterior North" style={inputStyle} />
          </div>

          {/* Trade */}
          <div>
            <label style={labelStyle}>Trade</label>
            <select value={trade} onChange={e => setTrade(e.target.value)} style={selectStyle}>
              <option value="">Select trade...</option>
              {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Assigned To */}
          <div>
            <label style={labelStyle}>Assigned To</label>
            <input type="text" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} placeholder="Name or company" style={inputStyle} />
          </div>

          {/* Priority */}
          <div>
            <label style={labelStyle}>Priority</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {PRIORITIES.map(p => (
                <button key={p} onClick={() => setPriority(p)} style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid ${priority === p ? PRIORITY_COLORS[p] : BORDER}`,
                  background: priority === p ? `${PRIORITY_COLORS[p]}22` : RAISED,
                  color: priority === p ? PRIORITY_COLORS[p] : DIM,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                }}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label style={labelStyle}>Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
          </div>

          {/* Photo Capture */}
          <div>
            <label style={labelStyle}>Photos</label>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple onChange={handleFileChange} style={{ display: 'none' }} />
            <button onClick={handleCameraCapture} style={{
              width: '100%', padding: '12px 0', borderRadius: 10, border: `1px dashed ${BORDER}`,
              background: RAISED, color: DIM, fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Take / Attach Photo
            </button>
            {photos.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {photos.map((p, i) => (
                  <div key={i} style={{ position: 'relative', display: 'inline-block' }}>
                    <img src={p.preview} alt={`Photo ${i + 1}`} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}` }} />
                    <button onClick={() => removePhoto(i)} style={{
                      position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
                      background: RED, color: '#fff', border: 'none', fontSize: 11, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>X</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
              background: submitting || !title.trim() ? BORDER : GOLD,
              color: submitting || !title.trim() ? DIM : DARK,
              fontSize: 16, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {submitting ? 'Submitting...' : 'Create Punch Item'}
          </button>
        </div>
      )}

      {/* ═══ LIST TAB ═══ */}
      {tab === 'list' && (
        <div style={{ padding: 16 }}>
          {/* Filter pills */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {FILTER_OPTIONS.map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '7px 16px', borderRadius: 20, border: `1px solid ${filter === f ? GOLD : BORDER}`,
                background: filter === f ? `${GOLD}22` : RAISED,
                color: filter === f ? GOLD : DIM,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
              }}>
                {f}
              </button>
            ))}
          </div>

          {listLoading ? (
            <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>Loading items...</div>
          ) : filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>
              <div style={{ marginBottom: 8 }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              </div>
              No {filter.toLowerCase()} items found
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredItems.map(item => (
                <div key={item.id} style={{
                  background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12,
                  padding: 14, position: 'relative', overflow: 'hidden',
                }}>
                  {/* Priority left stripe */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
                    background: PRIORITY_COLORS[item.priority] || DIM, borderRadius: '12px 0 0 12px',
                  }} />

                  <div style={{ paddingLeft: 8 }}>
                    {/* Top row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>{item.title}</div>
                        {item.location && (
                          <div style={{ fontSize: 12, color: DIM, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            {item.location}
                          </div>
                        )}
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                        background: `${STATUS_COLORS[item.status] || DIM}22`,
                        color: STATUS_COLORS[item.status] || DIM,
                        textTransform: 'uppercase', flexShrink: 0,
                      }}>
                        {item.status}
                      </span>
                    </div>

                    {/* Meta row */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {item.trade && (
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                          background: `${BLUE}22`, color: BLUE,
                        }}>
                          {item.trade}
                        </span>
                      )}
                      {item.assigned_to && (
                        <span style={{ fontSize: 12, color: DIM }}>
                          {item.assigned_to}
                        </span>
                      )}
                      {item.due_date && (
                        <span style={{ fontSize: 12, color: DIM }}>
                          Due {new Date(item.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {/* Complete button */}
                    {item.status !== 'complete' && (
                      <button
                        onClick={() => markComplete(item)}
                        style={{
                          marginTop: 10, padding: '8px 16px', borderRadius: 8, border: `1px solid ${GREEN}`,
                          background: `${GREEN}15`, color: GREEN, fontSize: 13, fontWeight: 600,
                          cursor: 'pointer', transition: 'all 0.2s',
                        }}
                      >
                        Mark Complete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Offline sync */}
      <OfflineSyncStatus />
    </div>
  );
}

/* ─── Page wrapper with Suspense ─── */
export default function FieldPunchListPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#F8F9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}>Loading...</div>}>
      <PunchListInner />
    </Suspense>
  );
}
