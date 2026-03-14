'use client';
/**
 * Saguaro Field — Warranty Claims
 * Create, track, and resolve warranty claims with photo docs, status timeline,
 * assignee management, and warranty period lookup. Offline-capable via enqueue.
 */
import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

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

const CATEGORIES = ['HVAC', 'Plumbing', 'Electrical', 'Roofing', 'Windows & Doors', 'Flooring', 'Painting', 'Concrete', 'Framing', 'Drywall', 'Appliances', 'Landscaping', 'Other'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const STATUSES   = ['Open', 'Assigned', 'In Progress', 'Resolved', 'Closed'];

const PRIORITY_COLORS: Record<string, string> = { Critical: RED, High: AMBER, Medium: BLUE, Low: DIM };
const STATUS_COLORS: Record<string, string>   = { Open: RED, Assigned: AMBER, 'In Progress': BLUE, Resolved: GREEN, Closed: PURPLE };

interface WarrantyClaim {
  id: string;
  description: string;
  location: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
  due_date?: string;
  warranty_expiry?: string;
  assigned_to?: string;
  assigned_email?: string;
  assigned_phone?: string;
  resolution_notes?: string;
  photo_urls?: string[];
  resolution_photos?: string[];
  timeline?: TimelineEntry[];
}

interface TimelineEntry {
  timestamp: string;
  status: string;
  note?: string;
  user?: string;
}

interface ContactInfo {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
}

type View = 'list' | 'new' | 'detail' | 'edit';

/* ─── Helper: format date ─── */
function fmtDate(d?: string): string {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(d?: string): string {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function daysRemaining(expiry?: string): number | null {
  if (!expiry) return null;
  const now = new Date();
  const exp = new Date(expiry);
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/* ─── Confirm Dialog ─── */
function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.65)' }}>
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, maxWidth: 340, width: '90%' }}>
        <p style={{ margin: '0 0 20px', fontSize: 15, color: TEXT, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, color: DIM, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, background: RED, border: 'none', borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Status Badge ─── */
function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || DIM;
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: color + '22', color, border: `1px solid ${color}44`, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {status}
    </span>
  );
}

/* ─── Priority Badge ─── */
function PriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_COLORS[priority] || DIM;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 600, background: color + '22', color, border: `1px solid ${color}33` }}>
      {priority}
    </span>
  );
}

/* ─── Warranty Period Indicator ─── */
function WarrantyIndicator({ expiry }: { expiry?: string }) {
  const days = daysRemaining(expiry);
  if (days === null) return <span style={{ fontSize: 11, color: DIM }}>No warranty info</span>;
  if (days < 0) return <span style={{ fontSize: 11, color: RED, fontWeight: 600 }}>Warranty Expired ({Math.abs(days)}d ago)</span>;
  if (days <= 30) return <span style={{ fontSize: 11, color: AMBER, fontWeight: 600 }}>Expires in {days}d</span>;
  if (days <= 90) return <span style={{ fontSize: 11, color: BLUE, fontWeight: 600 }}>Covered ({days}d left)</span>;
  return <span style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>Covered ({days}d left)</span>;
}

/* ─── Timeline Component ─── */
function StatusTimeline({ timeline }: { timeline: TimelineEntry[] }) {
  if (!timeline || timeline.length === 0) return <p style={{ color: DIM, fontSize: 13 }}>No timeline events yet.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {timeline.map((entry, i) => {
        const color = STATUS_COLORS[entry.status] || DIM;
        const isLast = i === timeline.length - 1;
        return (
          <div key={i} style={{ display: 'flex', gap: 12, minHeight: 48 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, border: `2px solid ${color}66`, flexShrink: 0, marginTop: 4 }} />
              {!isLast && <div style={{ width: 2, flex: 1, background: BORDER, marginTop: 2 }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{entry.status}</span>
                <span style={{ fontSize: 11, color: DIM }}>{fmtDateTime(entry.timestamp)}</span>
              </div>
              {entry.note && <p style={{ margin: '4px 0 0', fontSize: 12, color: DIM, lineHeight: 1.4 }}>{entry.note}</p>}
              {entry.user && <p style={{ margin: '2px 0 0', fontSize: 11, color: DIM }}>by {entry.user}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Photo Gallery ─── */
function PhotoGallery({ photos, label }: { photos?: string[]; label: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!photos || photos.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {photos.map((url, i) => (
          <img
            key={i}
            src={url}
            alt={`${label} ${i + 1}`}
            onClick={() => setExpanded(url)}
            style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}`, cursor: 'pointer', flexShrink: 0 }}
          />
        ))}
      </div>
      {expanded && (
        <div onClick={() => setExpanded(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <img src={expanded} alt="Expanded" style={{ maxWidth: '95%', maxHeight: '90vh', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

/* ─── Photo Upload Button ─── */
function PhotoUploadButton({ photos, setPhotos, label }: { photos: File[]; setPhotos: (f: File[]) => void; label?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) setPhotos([...photos, ...Array.from(e.target.files)]);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        style={{ background: 'transparent', border: `1px dashed ${BORDER}`, borderRadius: 10, padding: '12px 16px', color: DIM, fontSize: 13, cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <span style={{ fontSize: 18 }}>+</span> {label || 'Add Photos'} {photos.length > 0 && `(${photos.length})`}
      </button>
      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, overflowX: 'auto' }}>
          {photos.map((f, i) => (
            <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
              <img src={URL.createObjectURL(f)} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}` }} />
              <button
                type="button"
                onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: RED, border: 'none', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 }}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Input Field ─── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', background: BG, border: `1px solid ${BORDER}`,
  borderRadius: 10, color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'none' as const };

/* ════════════════════════════════════════════════════════════════
   MAIN INNER COMPONENT
   ════════════════════════════════════════════════════════════════ */
function WarrantyClaimsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const projectId = params.get('projectId') || '';

  /* State */
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  /* Filters */
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');

  /* New / Edit form */
  const [formDesc, setFormDesc] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formCategory, setFormCategory] = useState(CATEGORIES[0]);
  const [formPriority, setFormPriority] = useState('Medium');
  const [formDueDate, setFormDueDate] = useState('');
  const [formWarrantyExpiry, setFormWarrantyExpiry] = useState('');
  const [formAssignee, setFormAssignee] = useState('');
  const [formAssigneeEmail, setFormAssigneeEmail] = useState('');
  const [formAssigneePhone, setFormAssigneePhone] = useState('');
  const [formPhotos, setFormPhotos] = useState<File[]>([]);

  /* Detail / resolution */
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolutionPhotos, setResolutionPhotos] = useState<File[]>([]);
  const [statusUpdateNote, setStatusUpdateNote] = useState('');
  const [detailTab, setDetailTab] = useState<'info' | 'timeline' | 'resolution'>('info');

  /* ─── Fetch claims ─── */
  const fetchClaims = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/warranty-claims?projectId=${projectId}`);
      if (!res.ok) throw new Error('Failed to load claims');
      const data = await res.json();
      setClaims(data.claims || data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load claims');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchContacts = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/contacts`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || data || []);
      }
    } catch { /* silent */ }
  }, [projectId]);

  useEffect(() => {
    fetchClaims();
    fetchContacts();
  }, [fetchClaims, fetchContacts]);

  /* ─── Selected claim ─── */
  const selectedClaim = claims.find((c) => c.id === selectedId) || null;

  /* ─── Filtered / searched claims ─── */
  const filteredClaims = claims.filter((c) => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (filterCategory !== 'all' && c.category !== filterCategory) return false;
    if (filterPriority !== 'all' && c.priority !== filterPriority) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        c.description.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.assigned_to || '').toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  /* ─── Stats ─── */
  const statCounts = STATUSES.reduce((acc, s) => {
    acc[s] = claims.filter((c) => c.status === s).length;
    return acc;
  }, {} as Record<string, number>);
  const overdueClaims = claims.filter((c) => c.due_date && new Date(c.due_date) < new Date() && c.status !== 'Closed' && c.status !== 'Resolved');

  /* ─── Reset form ─── */
  const resetForm = () => {
    setFormDesc(''); setFormLocation(''); setFormCategory(CATEGORIES[0]); setFormPriority('Medium');
    setFormDueDate(''); setFormWarrantyExpiry(''); setFormAssignee(''); setFormAssigneeEmail('');
    setFormAssigneePhone(''); setFormPhotos([]);
  };

  /* ─── Create claim ─── */
  const handleCreate = async () => {
    if (!formDesc.trim()) return;
    setSaving(true);
    try {
      const body = {
        projectId,
        description: formDesc.trim(),
        location: formLocation.trim(),
        category: formCategory,
        priority: formPriority,
        due_date: formDueDate || undefined,
        warranty_expiry: formWarrantyExpiry || undefined,
        assigned_to: formAssignee || undefined,
        assigned_email: formAssigneeEmail || undefined,
        assigned_phone: formAssigneePhone || undefined,
      };
      await enqueue({
        url: '/api/warranty-claims',
        method: 'POST',
        body: JSON.stringify(body),
        contentType: 'application/json',
        isFormData: false,
      });
      // Upload photos if any
      for (const photo of formPhotos) {
        const fd = new FormData();
        fd.append('file', photo);
        fd.append('projectId', projectId);
        fd.append('type', 'warranty-claim-photo');
        try { await fetch('/api/uploads', { method: 'POST', body: fd }); } catch { /* queued offline */ }
      }
      resetForm();
      setView('list');
      await fetchClaims();
    } catch (e: any) {
      setError(e.message || 'Failed to create claim');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Update status ─── */
  const handleStatusUpdate = async (claimId: string, newStatus: string) => {
    setSaving(true);
    try {
      const body = {
        status: newStatus,
        note: statusUpdateNote.trim() || undefined,
      };
      await enqueue({
        url: `/api/warranty-claims/${claimId}/status`,
        method: 'PATCH',
        body: JSON.stringify(body),
        contentType: 'application/json',
        isFormData: false,
      });
      setStatusUpdateNote('');
      // Optimistic update
      setClaims((prev) =>
        prev.map((c) =>
          c.id === claimId
            ? {
                ...c,
                status: newStatus,
                timeline: [...(c.timeline || []), { timestamp: new Date().toISOString(), status: newStatus, note: body.note }],
              }
            : c
        )
      );
    } catch (e: any) {
      setError(e.message || 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Submit resolution ─── */
  const handleResolution = async (claimId: string) => {
    if (!resolutionNotes.trim()) return;
    setSaving(true);
    try {
      const body = {
        resolution_notes: resolutionNotes.trim(),
      };
      await enqueue({
        url: `/api/warranty-claims/${claimId}/resolve`,
        method: 'PATCH',
        body: JSON.stringify(body),
        contentType: 'application/json',
        isFormData: false,
      });
      // Upload resolution photos
      for (const photo of resolutionPhotos) {
        const fd = new FormData();
        fd.append('file', photo);
        fd.append('claimId', claimId);
        fd.append('type', 'resolution-photo');
        try { await fetch('/api/uploads', { method: 'POST', body: fd }); } catch { /* queued offline */ }
      }
      setClaims((prev) =>
        prev.map((c) =>
          c.id === claimId ? { ...c, resolution_notes: resolutionNotes.trim(), status: 'Resolved' } : c
        )
      );
      setResolutionNotes('');
      setResolutionPhotos([]);
    } catch (e: any) {
      setError(e.message || 'Failed to submit resolution');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Assign ─── */
  const handleAssign = async (claimId: string, name: string, email?: string, phone?: string) => {
    setSaving(true);
    try {
      await enqueue({
        url: `/api/warranty-claims/${claimId}/assign`,
        method: 'PATCH',
        body: JSON.stringify({ assigned_to: name, assigned_email: email, assigned_phone: phone }),
        contentType: 'application/json',
        isFormData: false,
      });
      setClaims((prev) =>
        prev.map((c) =>
          c.id === claimId
            ? { ...c, assigned_to: name, assigned_email: email, assigned_phone: phone, status: c.status === 'Open' ? 'Assigned' : c.status }
            : c
        )
      );
    } catch (e: any) {
      setError(e.message || 'Failed to assign');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Delete ─── */
  const handleDelete = async (claimId: string) => {
    setSaving(true);
    try {
      await enqueue({
        url: `/api/warranty-claims/${claimId}`,
        method: 'DELETE',
        body: JSON.stringify({ projectId }),
        contentType: 'application/json',
        isFormData: false,
      });
      setClaims((prev) => prev.filter((c) => c.id !== claimId));
      setView('list');
      setSelectedId(null);
    } catch (e: any) {
      setError(e.message || 'Failed to delete');
    } finally {
      setSaving(false);
      setConfirmDelete(null);
    }
  };

  /* ─── Open detail ─── */
  const openDetail = (id: string) => {
    setSelectedId(id);
    setDetailTab('info');
    setResolutionNotes('');
    setResolutionPhotos([]);
    setStatusUpdateNote('');
    setView('detail');
  };

  /* ─── Get next valid statuses ─── */
  const getNextStatuses = (current: string): string[] => {
    const idx = STATUSES.indexOf(current);
    if (idx === -1) return STATUSES;
    const next: string[] = [];
    if (idx < STATUSES.length - 1) next.push(STATUSES[idx + 1]);
    if (idx > 0) next.push(STATUSES[idx - 1]);
    return next;
  };

  /* ─── Header bar ─── */
  const headerStyle: React.CSSProperties = {
    position: 'sticky', top: 0, zIndex: 100, background: BG,
    borderBottom: `1px solid ${BORDER}`, padding: '12px 16px',
    display: 'flex', alignItems: 'center', gap: 12,
  };

  /* ═══════════════════════════════════════
     RENDER: LIST VIEW
     ═══════════════════════════════════════ */
  if (view === 'list') {
    return (
      <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        {/* Header */}
        <div style={headerStyle}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>&#8592;</button>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT, flex: 1 }}>Warranty Claims</h1>
          <button
            onClick={() => { resetForm(); setView('new'); }}
            style={{ background: GOLD, border: 'none', borderRadius: 10, padding: '8px 16px', color: BG, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            + New
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: RED + '22', border: `1px solid ${RED}44`, borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: RED }}>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 16 }}>x</button>
          </div>
        )}

        {/* Stats bar */}
        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {STATUSES.map((s) => (
            <div
              key={s}
              onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
              style={{
                flexShrink: 0, padding: '8px 14px', borderRadius: 10,
                background: filterStatus === s ? STATUS_COLORS[s] + '33' : RAISED,
                border: `1px solid ${filterStatus === s ? STATUS_COLORS[s] : BORDER}`,
                cursor: 'pointer', textAlign: 'center', minWidth: 60,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color: STATUS_COLORS[s] }}>{statCounts[s]}</div>
              <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>{s}</div>
            </div>
          ))}
          {overdueClaims.length > 0 && (
            <div style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 10, background: RED + '22', border: `1px solid ${RED}44`, textAlign: 'center', minWidth: 60 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: RED }}>{overdueClaims.length}</div>
              <div style={{ fontSize: 10, color: RED, marginTop: 2 }}>Overdue</div>
            </div>
          )}
        </div>

        {/* Search */}
        <div style={{ padding: '0 16px 8px' }}>
          <input
            type="text"
            placeholder="Search claims..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ ...inputStyle, background: RAISED, fontSize: 13 }}
          />
        </div>

        {/* Filters */}
        <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8, overflowX: 'auto' }}>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ ...selectStyle, flex: 1, fontSize: 12, padding: '8px 10px', background: RAISED }}>
            <option value="all">All Categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={{ ...selectStyle, flex: 1, fontSize: 12, padding: '8px 10px', background: RAISED }}>
            <option value="all">All Priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Active filters */}
        {(filterStatus !== 'all' || filterCategory !== 'all' || filterPriority !== 'all' || searchQuery) && (
          <div style={{ padding: '0 16px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: DIM }}>Filters:</span>
            {filterStatus !== 'all' && (
              <span onClick={() => setFilterStatus('all')} style={{ fontSize: 11, color: GOLD, background: GOLD + '22', padding: '2px 8px', borderRadius: 10, cursor: 'pointer' }}>{filterStatus} x</span>
            )}
            {filterCategory !== 'all' && (
              <span onClick={() => setFilterCategory('all')} style={{ fontSize: 11, color: GOLD, background: GOLD + '22', padding: '2px 8px', borderRadius: 10, cursor: 'pointer' }}>{filterCategory} x</span>
            )}
            {filterPriority !== 'all' && (
              <span onClick={() => setFilterPriority('all')} style={{ fontSize: 11, color: GOLD, background: GOLD + '22', padding: '2px 8px', borderRadius: 10, cursor: 'pointer' }}>{filterPriority} x</span>
            )}
            {searchQuery && (
              <span onClick={() => setSearchQuery('')} style={{ fontSize: 11, color: GOLD, background: GOLD + '22', padding: '2px 8px', borderRadius: 10, cursor: 'pointer' }}>"{searchQuery}" x</span>
            )}
            <button
              onClick={() => { setFilterStatus('all'); setFilterCategory('all'); setFilterPriority('all'); setSearchQuery(''); }}
              style={{ background: 'none', border: 'none', color: DIM, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Clear all
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ padding: '60px 16px', textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
            <p style={{ color: DIM, fontSize: 14 }}>Loading warranty claims...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredClaims.length === 0 && (
          <div style={{ padding: '60px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>&#128736;</div>
            <p style={{ color: DIM, fontSize: 15, marginBottom: 8 }}>
              {claims.length === 0 ? 'No warranty claims yet' : 'No claims match your filters'}
            </p>
            <p style={{ color: DIM, fontSize: 13, marginBottom: 20 }}>
              {claims.length === 0
                ? 'Create your first warranty claim to start tracking.'
                : 'Try adjusting your search or filter criteria.'}
            </p>
            {claims.length === 0 && (
              <button
                onClick={() => { resetForm(); setView('new'); }}
                style={{ background: GOLD, border: 'none', borderRadius: 10, padding: '12px 24px', color: BG, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                + Create Claim
              </button>
            )}
          </div>
        )}

        {/* Claims list */}
        {!loading && filteredClaims.length > 0 && (
          <div style={{ padding: '0 16px 100px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 12, color: DIM, margin: '0 0 4px' }}>{filteredClaims.length} claim{filteredClaims.length !== 1 ? 's' : ''}</p>
            {filteredClaims.map((claim) => {
              const isOverdue = claim.due_date && new Date(claim.due_date) < new Date() && claim.status !== 'Closed' && claim.status !== 'Resolved';
              return (
                <div
                  key={claim.id}
                  onClick={() => openDetail(claim.id)}
                  style={{
                    background: RAISED, border: `1px solid ${isOverdue ? RED + '66' : BORDER}`, borderRadius: 14,
                    padding: '14px 16px', cursor: 'pointer', transition: 'border-color .15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT, flex: 1, lineHeight: 1.3 }}>{claim.description}</p>
                    <StatusBadge status={claim.status} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: DIM }}>{claim.category}</span>
                    <span style={{ fontSize: 12, color: BORDER }}>|</span>
                    <PriorityBadge priority={claim.priority} />
                    {claim.location && (
                      <>
                        <span style={{ fontSize: 12, color: BORDER }}>|</span>
                        <span style={{ fontSize: 12, color: DIM }}>{claim.location}</span>
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {claim.assigned_to && <span style={{ fontSize: 11, color: BLUE }}>{claim.assigned_to}</span>}
                      {claim.photo_urls && claim.photo_urls.length > 0 && <span style={{ fontSize: 11, color: DIM }}>{claim.photo_urls.length} photo{claim.photo_urls.length > 1 ? 's' : ''}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <WarrantyIndicator expiry={claim.warranty_expiry} />
                      {isOverdue && <span style={{ fontSize: 11, color: RED, fontWeight: 600 }}>OVERDUE</span>}
                      {claim.due_date && !isOverdue && <span style={{ fontSize: 11, color: DIM }}>Due {fmtDate(claim.due_date)}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Confirm dialog */}
        {confirmDelete && (
          <ConfirmDialog
            message="Delete this warranty claim? This action cannot be undone."
            onConfirm={() => handleDelete(confirmDelete)}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
      </div>
    );
  }

  /* ═══════════════════════════════════════
     RENDER: NEW CLAIM VIEW
     ═══════════════════════════════════════ */
  if (view === 'new') {
    return (
      <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={headerStyle}>
          <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>&#8592;</button>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT, flex: 1 }}>New Warranty Claim</h1>
        </div>

        {error && (
          <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: RED + '22', border: `1px solid ${RED}44`, borderRadius: 10 }}>
            <span style={{ fontSize: 13, color: RED }}>{error}</span>
          </div>
        )}

        <div style={{ padding: '16px' }}>
          <Field label="Description *">
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="Describe the warranty issue..."
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>

          <Field label="Location">
            <input type="text" value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="e.g., Building A, Unit 201, Kitchen" style={inputStyle} />
          </Field>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="Category">
                <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} style={selectStyle}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Priority">
                <select value={formPriority} onChange={(e) => setFormPriority(e.target.value)} style={selectStyle}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="Due Date">
                <input type="date" value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)} style={inputStyle} />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Warranty Expiry">
                <input type="date" value={formWarrantyExpiry} onChange={(e) => setFormWarrantyExpiry(e.target.value)} style={inputStyle} />
              </Field>
            </div>
          </div>

          {/* Assignee section */}
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: TEXT }}>Assign Responsible Party</p>

            {contacts.length > 0 && (
              <Field label="Select from contacts">
                <select
                  value=""
                  onChange={(e) => {
                    const contact = contacts.find((c) => c.name === e.target.value);
                    if (contact) {
                      setFormAssignee(contact.name);
                      setFormAssigneeEmail(contact.email || '');
                      setFormAssigneePhone(contact.phone || '');
                    }
                  }}
                  style={selectStyle}
                >
                  <option value="">Choose a contact...</option>
                  {contacts.map((c) => <option key={c.name} value={c.name}>{c.name}{c.company ? ` (${c.company})` : ''}</option>)}
                </select>
              </Field>
            )}

            <Field label="Name">
              <input type="text" value={formAssignee} onChange={(e) => setFormAssignee(e.target.value)} placeholder="Vendor / Subcontractor name" style={inputStyle} />
            </Field>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Field label="Email">
                  <input type="email" value={formAssigneeEmail} onChange={(e) => setFormAssigneeEmail(e.target.value)} placeholder="email@example.com" style={inputStyle} />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Phone">
                  <input type="tel" value={formAssigneePhone} onChange={(e) => setFormAssigneePhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
                </Field>
              </div>
            </div>
          </div>

          {/* Photos */}
          <Field label="Photos">
            <PhotoUploadButton photos={formPhotos} setPhotos={setFormPhotos} label="Add Claim Photos" />
          </Field>

          {/* Submit */}
          <button
            onClick={handleCreate}
            disabled={saving || !formDesc.trim()}
            style={{
              width: '100%', padding: '14px', background: !formDesc.trim() ? BORDER : GOLD,
              border: 'none', borderRadius: 12, color: !formDesc.trim() ? DIM : BG,
              fontSize: 15, fontWeight: 700, cursor: !formDesc.trim() ? 'not-allowed' : 'pointer',
              marginTop: 8, opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Creating...' : 'Create Warranty Claim'}
          </button>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════
     RENDER: DETAIL VIEW
     ═══════════════════════════════════════ */
  if (view === 'detail' && selectedClaim) {
    const claim = selectedClaim;
    const nextStatuses = getNextStatuses(claim.status);
    const isOverdue = claim.due_date && new Date(claim.due_date) < new Date() && claim.status !== 'Closed' && claim.status !== 'Resolved';
    const warrantyDays = daysRemaining(claim.warranty_expiry);

    return (
      <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        {/* Header */}
        <div style={headerStyle}>
          <button onClick={() => { setView('list'); setSelectedId(null); }} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>&#8592;</button>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT, flex: 1 }}>Claim Details</h1>
          <button
            onClick={() => setConfirmDelete(claim.id)}
            style={{ background: RED + '22', border: `1px solid ${RED}44`, borderRadius: 8, padding: '6px 12px', color: RED, fontSize: 12, cursor: 'pointer' }}
          >
            Delete
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: RED + '22', border: `1px solid ${RED}44`, borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: RED }}>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 16 }}>x</button>
          </div>
        )}

        {/* Status and priority header */}
        <div style={{ padding: '16px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: TEXT, lineHeight: 1.4 }}>{claim.description}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <StatusBadge status={claim.status} />
                <PriorityBadge priority={claim.priority} />
                <span style={{ fontSize: 12, color: DIM }}>{claim.category}</span>
              </div>
            </div>
          </div>

          {/* Location */}
          {claim.location && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 14 }}>&#128205;</span>
              <span style={{ fontSize: 13, color: DIM }}>{claim.location}</span>
            </div>
          )}

          {/* Dates */}
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: 11, color: DIM }}>Created: </span>
              <span style={{ fontSize: 12, color: TEXT }}>{fmtDate(claim.created_at)}</span>
            </div>
            {claim.due_date && (
              <div>
                <span style={{ fontSize: 11, color: DIM }}>Due: </span>
                <span style={{ fontSize: 12, color: isOverdue ? RED : TEXT, fontWeight: isOverdue ? 700 : 400 }}>{fmtDate(claim.due_date)}{isOverdue ? ' (OVERDUE)' : ''}</span>
              </div>
            )}
          </div>

          {/* Warranty */}
          <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: warrantyDays !== null && warrantyDays < 0 ? RED + '11' : warrantyDays !== null && warrantyDays <= 30 ? AMBER + '11' : RAISED, border: `1px solid ${warrantyDays !== null && warrantyDays < 0 ? RED + '33' : BORDER}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: DIM }}>Warranty Status</span>
              <WarrantyIndicator expiry={claim.warranty_expiry} />
            </div>
            {claim.warranty_expiry && (
              <div style={{ marginTop: 4 }}>
                <span style={{ fontSize: 11, color: DIM }}>Expires: {fmtDate(claim.warranty_expiry)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Assignee / Contact */}
        {claim.assigned_to && (
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>Assigned To</p>
            <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: TEXT }}>{claim.assigned_to}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              {claim.assigned_phone && (
                <a
                  href={`tel:${claim.assigned_phone}`}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '10px', background: GREEN + '22', border: `1px solid ${GREEN}44`,
                    borderRadius: 10, color: GREEN, fontSize: 13, fontWeight: 600, textDecoration: 'none',
                  }}
                >
                  &#128222; Call
                </a>
              )}
              {claim.assigned_email && (
                <a
                  href={`mailto:${claim.assigned_email}?subject=Warranty Claim: ${encodeURIComponent(claim.description)}`}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '10px', background: BLUE + '22', border: `1px solid ${BLUE}44`,
                    borderRadius: 10, color: BLUE, fontSize: 13, fontWeight: 600, textDecoration: 'none',
                  }}
                >
                  &#9993; Email
                </a>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}` }}>
          {(['info', 'timeline', 'resolution'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setDetailTab(tab)}
              style={{
                flex: 1, padding: '12px', background: 'none', border: 'none',
                borderBottom: detailTab === tab ? `2px solid ${GOLD}` : '2px solid transparent',
                color: detailTab === tab ? GOLD : DIM, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: '16px', paddingBottom: 100 }}>
          {/* INFO TAB */}
          {detailTab === 'info' && (
            <div>
              {/* Photos */}
              <PhotoGallery photos={claim.photo_urls} label="Claim Photos" />

              {/* Status update */}
              <div style={{ marginTop: 20 }}>
                <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: TEXT }}>Update Status</p>
                <textarea
                  value={statusUpdateNote}
                  onChange={(e) => setStatusUpdateNote(e.target.value)}
                  placeholder="Add a note (optional)..."
                  rows={2}
                  style={{ ...inputStyle, marginBottom: 10, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {nextStatuses.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStatusUpdate(claim.id, s)}
                      disabled={saving}
                      style={{
                        flex: 1, padding: '10px 14px', background: STATUS_COLORS[s] + '22',
                        border: `1px solid ${STATUS_COLORS[s]}44`, borderRadius: 10,
                        color: STATUS_COLORS[s], fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        opacity: saving ? 0.6 : 1, minWidth: 100,
                      }}
                    >
                      {s === STATUSES[STATUSES.indexOf(claim.status) + 1] ? '-> ' : '<- '}{s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reassign */}
              <div style={{ marginTop: 20, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16 }}>
                <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: TEXT }}>
                  {claim.assigned_to ? 'Reassign' : 'Assign Responsible Party'}
                </p>
                {contacts.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {contacts.map((c) => (
                      <button
                        key={c.name}
                        onClick={() => handleAssign(claim.id, c.name, c.email, c.phone)}
                        disabled={saving}
                        style={{
                          background: claim.assigned_to === c.name ? GOLD + '22' : 'transparent',
                          border: `1px solid ${claim.assigned_to === c.name ? GOLD : BORDER}`,
                          borderRadius: 10, padding: '10px 14px', textAlign: 'left',
                          cursor: 'pointer', color: TEXT, fontSize: 13,
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        {c.company && <div style={{ fontSize: 11, color: DIM }}>{c.company}</div>}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: DIM }}>No contacts available. Contacts can be managed in the project settings.</p>
                )}
              </div>
            </div>
          )}

          {/* TIMELINE TAB */}
          {detailTab === 'timeline' && (
            <div>
              <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: TEXT }}>Status Timeline</p>
              <StatusTimeline timeline={claim.timeline || [{ timestamp: claim.created_at, status: 'Open', note: 'Claim created' }]} />
            </div>
          )}

          {/* RESOLUTION TAB */}
          {detailTab === 'resolution' && (
            <div>
              {claim.resolution_notes ? (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>Resolution Notes</p>
                  <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
                    <p style={{ margin: 0, fontSize: 14, color: TEXT, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{claim.resolution_notes}</p>
                  </div>
                  <PhotoGallery photos={claim.resolution_photos} label="Resolution Photos" />
                </div>
              ) : (
                <div style={{ marginBottom: 20, padding: '20px', textAlign: 'center', background: RAISED, borderRadius: 14, border: `1px solid ${BORDER}` }}>
                  <p style={{ margin: '0 0 4px', fontSize: 14, color: DIM }}>No resolution yet</p>
                  <p style={{ margin: 0, fontSize: 12, color: DIM }}>Add resolution notes below to document the fix.</p>
                </div>
              )}

              <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: TEXT }}>
                {claim.resolution_notes ? 'Update Resolution' : 'Add Resolution'}
              </p>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Describe how the issue was resolved..."
                rows={4}
                style={{ ...inputStyle, marginBottom: 12, resize: 'vertical' }}
              />

              <PhotoUploadButton photos={resolutionPhotos} setPhotos={setResolutionPhotos} label="Add Resolution Photos" />

              <button
                onClick={() => handleResolution(claim.id)}
                disabled={saving || !resolutionNotes.trim()}
                style={{
                  width: '100%', marginTop: 14, padding: '14px',
                  background: !resolutionNotes.trim() ? BORDER : GREEN,
                  border: 'none', borderRadius: 12,
                  color: !resolutionNotes.trim() ? DIM : '#fff',
                  fontSize: 14, fontWeight: 700,
                  cursor: !resolutionNotes.trim() ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Submitting...' : 'Submit Resolution'}
              </button>
            </div>
          )}
        </div>

        {/* Confirm delete */}
        {confirmDelete && (
          <ConfirmDialog
            message="Delete this warranty claim? This action cannot be undone."
            onConfirm={() => handleDelete(confirmDelete)}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
      </div>
    );
  }

  /* ═══════════════════════════════════════
     RENDER: FALLBACK (no claim selected)
     ═══════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', padding: 32 }}>
        <p style={{ color: DIM, fontSize: 15, marginBottom: 16 }}>Claim not found</p>
        <button
          onClick={() => { setView('list'); setSelectedId(null); }}
          style={{ background: GOLD, border: 'none', borderRadius: 10, padding: '12px 24px', color: BG, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          Back to Claims
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   DEFAULT EXPORT WITH SUSPENSE WRAPPER
   ════════════════════════════════════════════════════════════════ */
export default function Page() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', background: '#07101C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 40, height: 40, border: '3px solid #1E3A5F', borderTopColor: '#D4A017',
                borderRadius: '50%', margin: '0 auto 16px',
                animation: 'spin 1s linear infinite',
              }}
            />
            <p style={{ color: '#8BAAC8', fontSize: 14 }}>Loading Warranty Claims...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        </div>
      }
    >
      <WarrantyClaimsInner />
    </Suspense>
  );
}
