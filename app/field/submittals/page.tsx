'use client';
/**
 * Saguaro Field — Submittals Mobile Review
 * Review submittals on the go: approve, reject, or request resubmit with notes.
 * Enhanced with Ball-in-Court, Distribution Matrix, Create Form, Revision History, Response Tracking.
 */
import React, { useState, useEffect, Suspense, useRef } from 'react';
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

const STATUS_COLORS: Record<string, string> = {
  pending: AMBER,
  approved: GREEN,
  rejected: RED,
  resubmit: BLUE,
  open: AMBER,
  closed: GREEN,
};

/* ── Ball-in-Court types ── */
type CourtParty = 'you' | 'architect' | 'sub' | 'owner';
const COURT_META: Record<CourtParty, { label: string; color: string }> = {
  you:       { label: 'Your Court', color: GOLD },
  architect: { label: 'Architect',  color: BLUE },
  sub:       { label: 'Sub',        color: AMBER },
  owner:     { label: 'Owner',      color: GREEN },
};

function deriveCourt(status: string): CourtParty {
  const s = status?.toLowerCase() || '';
  if (s === 'pending' || s === 'open') return 'you';
  if (s === 'resubmit') return 'sub';
  if (s === 'approved') return 'owner';
  if (s === 'rejected') return 'architect';
  return 'you';
}

/* ── Distribution status ── */
type DistStatus = 'reviewed' | 'pending' | 'not_sent';
const DIST_ROLES = ['Architect', 'Engineer', 'Owner', 'PM', 'Superintendent', 'Sub'] as const;

interface DistEntry {
  role: string;
  status: DistStatus;
}

/* ── Extended Submittal interface ── */
interface Submittal {
  id: string;
  submittal_number?: string;
  number?: string;
  title: string;
  spec_section?: string;
  status: string;
  due_date?: string;
  description?: string;
  submitted_by?: string;
  submitted_date?: string;
  documents?: Array<{ name: string; url: string }>;
  revisions?: Array<{ revision: number; date: string; reviewer?: string; action?: string; notes: string; status: string }>;
  created_at?: string;
  /* New fields for enhancements */
  ball_in_court?: CourtParty;
  distribution?: DistEntry[];
  submittal_type?: string;
  subcontractor?: string;
  priority?: 'Normal' | 'Urgent' | 'Critical';
  response_due_date?: string;
  days_in_review?: number;
}

/* ── Submittal types & priorities ── */
const SUBMITTAL_TYPES = ['Shop Drawing', 'Product Data', 'Sample', 'Mock-up', 'Test Report'] as const;
const PRIORITIES = ['Normal', 'Urgent', 'Critical'] as const;
const PRIORITY_COLORS: Record<string, string> = { Normal: DIM, Urgent: AMBER, Critical: RED };

function SubmittalsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [submittals, setSubmittals] = useState<Submittal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Submittal | null>(null);
  const [reviewAction, setReviewAction] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const [online, setOnline] = useState(true);

  /* ── New state ── */
  const [courtFilter, setCourtFilter] = useState<'all' | 'my_court'>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [distribution, setDistribution] = useState<Record<string, DistStatus>>({});

  /* ── Create form state ── */
  const [newSpecSection, setNewSpecSection] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState<string>(SUBMITTAL_TYPES[0]);
  const [newSubcontractor, setNewSubcontractor] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState<'Normal' | 'Urgent' | 'Critical'>('Normal');
  const [newAttachment, setNewAttachment] = useState<File | null>(null);
  const [newLinkedSpec, setNewLinkedSpec] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    fetch(`/api/projects/${projectId}/submittals`)
      .then((r) => r.ok ? r.json() : { submittals: [] })
      .then((d) => setSubmittals(d.submittals || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  /* Initialize distribution when a submittal is selected */
  useEffect(() => {
    if (selected) {
      const dist: Record<string, DistStatus> = {};
      DIST_ROLES.forEach((role) => {
        const existing = selected.distribution?.find((d) => d.role === role);
        dist[role] = existing?.status || 'not_sent';
      });
      setDistribution(dist);
    }
  }, [selected]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  function getStatusColor(status: string) {
    const s = status?.toLowerCase() || '';
    return STATUS_COLORS[s] || DIM;
  }

  function formatDate(d?: string) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getDaysInReview(s: Submittal): number {
    if (s.days_in_review != null) return s.days_in_review;
    const start = s.submitted_date || s.created_at;
    if (!start) return 0;
    const diff = Date.now() - new Date(start).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  function isOverdue(s: Submittal): boolean {
    const dueField = s.response_due_date || s.due_date;
    if (!dueField) return false;
    const status = s.status?.toLowerCase();
    return new Date(dueField) < new Date() && (status === 'pending' || status === 'open');
  }

  async function handleSubmitReview() {
    if (!selected || !reviewAction) return;
    setSubmitting(true);
    const payload = { action: reviewAction, notes: reviewNotes };
    const url = `/api/submittals/${selected.id}/review`;

    if (!online) {
      await enqueue({
        url,
        method: 'POST',
        body: JSON.stringify(payload),
        contentType: 'application/json',
        isFormData: false,
      });
      setSubmittals((prev) =>
        prev.map((s) =>
          s.id === selected.id
            ? { ...s, status: reviewAction === 'approve' ? 'approved' : reviewAction === 'reject' ? 'rejected' : 'resubmit' }
            : s
        )
      );
      setSelected(null);
      setReviewAction(null);
      setReviewNotes('');
      setSubmitting(false);
      showToast('Review queued offline. Will sync when online.');
      return;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = await res.json();
        setSubmittals((prev) =>
          prev.map((s) =>
            s.id === selected.id
              ? { ...s, status: json.status || (reviewAction === 'approve' ? 'approved' : reviewAction === 'reject' ? 'rejected' : 'resubmit') }
              : s
          )
        );
        showToast('Review submitted successfully.');
      } else {
        showToast('Failed to submit review. Try again.');
      }
    } catch {
      await enqueue({
        url,
        method: 'POST',
        body: JSON.stringify(payload),
        contentType: 'application/json',
        isFormData: false,
      });
      showToast('Network error. Review queued offline.');
    }
    setSelected(null);
    setReviewAction(null);
    setReviewNotes('');
    setSubmitting(false);
  }

  /* ── Create new submittal ── */
  async function handleCreateSubmittal() {
    if (!newTitle.trim()) { showToast('Title is required.'); return; }
    setCreateSubmitting(true);

    const formData = new FormData();
    formData.append('title', newTitle.trim());
    formData.append('description', newDescription.trim());
    formData.append('spec_section', newSpecSection.trim());
    formData.append('submittal_type', newType);
    formData.append('subcontractor', newSubcontractor.trim());
    formData.append('due_date', newDueDate);
    formData.append('priority', newPriority);
    formData.append('linked_spec', newLinkedSpec.trim());
    if (newAttachment) formData.append('attachment', newAttachment);

    const url = `/api/projects/${projectId}/submittals`;

    if (!online) {
      await enqueue({
        url,
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim(),
          spec_section: newSpecSection.trim(),
          submittal_type: newType,
          subcontractor: newSubcontractor.trim(),
          due_date: newDueDate,
          priority: newPriority,
          linked_spec: newLinkedSpec.trim(),
        }),
        contentType: 'application/json',
        isFormData: false,
      });
      const tempId = `temp-${Date.now()}`;
      setSubmittals((prev) => [{
        id: tempId,
        title: newTitle.trim(),
        description: newDescription.trim(),
        spec_section: newSpecSection.trim(),
        submittal_type: newType,
        submitted_by: newSubcontractor.trim(),
        due_date: newDueDate,
        priority: newPriority as 'Normal' | 'Urgent' | 'Critical',
        status: 'pending',
        created_at: new Date().toISOString(),
      }, ...prev]);
      resetCreateForm();
      setCreateSubmitting(false);
      showToast('Submittal queued offline. Will sync when connected.');
      return;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const json = await res.json();
        const created = json.submittal || json;
        setSubmittals((prev) => [{ ...created, status: created.status || 'pending' }, ...prev]);
        showToast('Submittal created successfully.');
      } else {
        showToast('Failed to create submittal.');
      }
    } catch {
      await enqueue({
        url,
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim(),
          spec_section: newSpecSection.trim(),
          submittal_type: newType,
          subcontractor: newSubcontractor.trim(),
          due_date: newDueDate,
          priority: newPriority,
          linked_spec: newLinkedSpec.trim(),
        }),
        contentType: 'application/json',
        isFormData: false,
      });
      showToast('Network error. Submittal queued offline.');
    }
    resetCreateForm();
    setCreateSubmitting(false);
  }

  function resetCreateForm() {
    setShowCreateForm(false);
    setNewSpecSection('');
    setNewTitle('');
    setNewDescription('');
    setNewType(SUBMITTAL_TYPES[0]);
    setNewSubcontractor('');
    setNewDueDate('');
    setNewPriority('Normal');
    setNewAttachment(null);
    setNewLinkedSpec('');
  }

  /* ── Distribution actions ── */
  function handleDistToggle(role: string) {
    setDistribution((prev) => {
      const cycle: DistStatus[] = ['not_sent', 'pending', 'reviewed'];
      const cur = prev[role] || 'not_sent';
      const idx = cycle.indexOf(cur);
      const next = cycle[(idx + 1) % cycle.length];
      return { ...prev, [role]: next };
    });
  }

  function handleSendToAll() {
    const updated: Record<string, DistStatus> = {};
    DIST_ROLES.forEach((r) => { updated[r] = distribution[r] === 'reviewed' ? 'reviewed' : 'pending'; });
    setDistribution(updated);
    showToast('Distribution sent to all parties.');
  }

  function handleSendReminders() {
    const pendingRoles = DIST_ROLES.filter((r) => distribution[r] === 'pending');
    if (pendingRoles.length === 0) { showToast('No pending reviewers to remind.'); return; }
    showToast(`Reminders sent to ${pendingRoles.length} reviewer(s).`);
  }

  /* ── Filtered submittals ── */
  const filteredSubmittals = courtFilter === 'my_court'
    ? submittals.filter((s) => (s.ball_in_court || deriveCourt(s.status)) === 'you')
    : submittals;

  /* ━━━━━━━━━━━━━━━━━━━━ CREATE FORM VIEW ━━━━━━━━━━━━━━━━━━━━ */
  if (showCreateForm) {
    return (
      <div style={{ padding: '18px 16px', minHeight: '100vh', background: '#060C15' }}>
        <button onClick={resetCreateForm} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
          <span style={{ marginLeft: 6, fontSize: 14 }}>Cancel</span>
        </button>

        <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: TEXT }}>New Submittal</h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: DIM }}>Create a submittal from the field</p>

        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16 }}>
          {/* Spec Section */}
          <label style={labelStyle}>Spec Section</label>
          <input
            value={newSpecSection}
            onChange={(e) => setNewSpecSection(e.target.value)}
            placeholder="e.g. 03 30 00"
            style={inputStyle}
          />

          {/* Title */}
          <label style={labelStyle}>Title *</label>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Submittal title"
            style={inputStyle}
          />

          {/* Description */}
          <label style={labelStyle}>Description</label>
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={3}
            placeholder="Description..."
            style={{ ...inputStyle, resize: 'vertical' }}
          />

          {/* Submittal Type */}
          <label style={labelStyle}>Submittal Type</label>
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            style={inputStyle}
          >
            {SUBMITTAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Subcontractor */}
          <label style={labelStyle}>Subcontractor</label>
          <input
            value={newSubcontractor}
            onChange={(e) => setNewSubcontractor(e.target.value)}
            placeholder="Subcontractor name"
            style={inputStyle}
          />

          {/* Due Date */}
          <label style={labelStyle}>Due Date</label>
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            style={inputStyle}
          />

          {/* Priority */}
          <label style={labelStyle}>Priority</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {PRIORITIES.map((p) => (
              <button
                key={p}
                onClick={() => setNewPriority(p)}
                style={{
                  flex: 1, padding: '8px 0', border: `1px solid ${newPriority === p ? PRIORITY_COLORS[p] : BORDER}`,
                  borderRadius: 8, background: newPriority === p ? `${PRIORITY_COLORS[p]}22` : 'transparent',
                  color: newPriority === p ? PRIORITY_COLORS[p] : DIM, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* File Attachment */}
          <label style={labelStyle}>Attachment</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.dwg"
            capture="environment"
            onChange={(e) => setNewAttachment(e.target.files?.[0] || null)}
            style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button
              onClick={() => { if (fileInputRef.current) { fileInputRef.current.setAttribute('capture', 'environment'); fileInputRef.current.click(); } }}
              style={{ ...actionBtn, flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, fontSize: 13, padding: '10px 12px' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx={12} cy={13} r={4}/></svg>
              Camera
            </button>
            <button
              onClick={() => { if (fileInputRef.current) { fileInputRef.current.removeAttribute('capture'); fileInputRef.current.click(); } }}
              style={{ ...actionBtn, flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, fontSize: 13, padding: '10px 12px' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              File
            </button>
          </div>
          {newAttachment && (
            <div style={{ marginBottom: 14, padding: '6px 10px', background: '#060C15', borderRadius: 8, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{newAttachment.name}</span>
              <button onClick={() => setNewAttachment(null)} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>x</button>
            </div>
          )}

          {/* Linked Spec Section Reference */}
          <label style={labelStyle}>Linked Spec Section Reference</label>
          <input
            value={newLinkedSpec}
            onChange={(e) => setNewLinkedSpec(e.target.value)}
            placeholder="e.g. 03 30 00.1.A"
            style={inputStyle}
          />

          {/* Submit Button */}
          <button
            onClick={handleCreateSubmittal}
            disabled={createSubmitting}
            style={{ ...actionBtn, background: GOLD, width: '100%', marginTop: 4, opacity: createSubmitting ? 0.6 : 1 }}
          >
            {createSubmitting ? 'Creating...' : 'Create Submittal'}
          </button>
        </div>

        {!online && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 10, color: AMBER, fontSize: 12, textAlign: 'center' }}>
            Offline mode -- submittal will be queued and synced when connected
          </div>
        )}
      </div>
    );
  }

  /* ━━━━━━━━━━━━━━━━━━━━ DETAIL VIEW ━━━━━━━━━━━━━━━━━━━━ */
  if (selected) {
    const num = selected.submittal_number || selected.number || '';
    const court = selected.ball_in_court || deriveCourt(selected.status);
    const courtMeta = COURT_META[court];
    const daysInReview = getDaysInReview(selected);
    const overdue = isOverdue(selected);
    const responseDue = selected.response_due_date || selected.due_date;

    return (
      <div style={{ padding: '18px 16px', minHeight: '100vh', background: '#060C15' }}>
        <button onClick={() => { setSelected(null); setReviewAction(null); setReviewNotes(''); }} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
          <span style={{ marginLeft: 6, fontSize: 14 }}>Back to List</span>
        </button>

        {/* Header card */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {num && <span style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>#{num}</span>}
            <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 700, color: '#fff', background: getStatusColor(selected.status) }}>{selected.status}</span>
            {/* Ball-in-Court badge */}
            <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 700, color: '#fff', background: courtMeta.color }}>{courtMeta.label}</span>
            {/* Priority badge */}
            {selected.priority && selected.priority !== 'Normal' && (
              <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 700, color: '#fff', background: PRIORITY_COLORS[selected.priority] }}>{selected.priority}</span>
            )}
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: TEXT }}>{selected.title}</h2>
          {selected.spec_section && <p style={{ margin: '0 0 4px', fontSize: 13, color: DIM }}>Spec Section: {selected.spec_section}</p>}
          {selected.submittal_type && <p style={{ margin: '0 0 4px', fontSize: 13, color: DIM }}>Type: {selected.submittal_type}</p>}
          {selected.submitted_by && <p style={{ margin: '0 0 4px', fontSize: 13, color: DIM }}>Submitted by: {selected.submitted_by}</p>}
          {selected.subcontractor && <p style={{ margin: '0 0 4px', fontSize: 13, color: DIM }}>Subcontractor: {selected.subcontractor}</p>}
          {selected.submitted_date && <p style={{ margin: '0 0 4px', fontSize: 13, color: DIM }}>Submitted: {formatDate(selected.submitted_date)}</p>}
          {selected.due_date && <p style={{ margin: '0 0 4px', fontSize: 13, color: DIM }}>Due: {formatDate(selected.due_date)}</p>}
          {selected.description && <p style={{ margin: '10px 0 0', fontSize: 14, color: TEXT, lineHeight: 1.5 }}>{selected.description}</p>}
        </div>

        {/* ── Response Tracking ── */}
        <div style={{ background: RAISED, border: `1px solid ${overdue ? 'rgba(239,68,68,.4)' : BORDER}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: TEXT }}>Response Tracking</h3>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, textAlign: 'center', padding: '10px 0', background: '#060C15', borderRadius: 10, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: daysInReview > 14 ? RED : daysInReview > 7 ? AMBER : TEXT }}>{daysInReview}</div>
              <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>Days in Review</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: '10px 0', background: '#060C15', borderRadius: 10, border: `1px solid ${overdue ? 'rgba(239,68,68,.35)' : BORDER}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: overdue ? RED : TEXT }}>{responseDue ? formatDate(responseDue) : 'N/A'}</div>
              <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>Response Due</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: '10px 0', background: '#060C15', borderRadius: 10, border: `1px solid ${overdue ? 'rgba(239,68,68,.35)' : BORDER}` }}>
              {overdue ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 800, color: RED }}>OVERDUE</div>
                  <div style={{ fontSize: 11, color: RED, marginTop: 2 }}>Action Needed</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: GREEN }}>On Track</div>
                  <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>Status</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Distribution Matrix ── */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: TEXT }}>Distribution Matrix</h3>
          {DIST_ROLES.map((role) => {
            const st = distribution[role] || 'not_sent';
            return (
              <div
                key={role}
                onClick={() => handleDistToggle(role)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Status icon */}
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: st === 'reviewed' ? `${GREEN}22` : st === 'pending' ? `${AMBER}22` : `${DIM}15`,
                    border: `1.5px solid ${st === 'reviewed' ? GREEN : st === 'pending' ? AMBER : DIM}`,
                  }}>
                    {st === 'reviewed' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={3} width={14} height={14}><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                    {st === 'pending' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth={2.5} width={14} height={14}><circle cx={12} cy={12} r={10}/><polyline points="12 6 12 12 16 14"/></svg>
                    )}
                  </div>
                  <span style={{ fontSize: 14, color: TEXT, fontWeight: 600 }}>{role}</span>
                </div>
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 600,
                  color: st === 'reviewed' ? GREEN : st === 'pending' ? AMBER : DIM,
                  background: st === 'reviewed' ? `${GREEN}15` : st === 'pending' ? `${AMBER}15` : `${DIM}10`,
                }}>
                  {st === 'reviewed' ? 'Reviewed' : st === 'pending' ? 'Pending' : 'Not Sent'}
                </span>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={handleSendToAll} style={{ ...actionBtn, flex: 1, background: BLUE, fontSize: 13, padding: '10px 12px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={15} height={15}><line x1={22} y1={2} x2={11} y2={13}/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Send to All
            </button>
            <button onClick={handleSendReminders} style={{ ...actionBtn, flex: 1, background: 'transparent', border: `1px solid ${AMBER}`, color: AMBER, fontSize: 13, padding: '10px 12px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={15} height={15}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
              Send Reminders
            </button>
          </div>
        </div>

        {/* Attached Documents (existing) */}
        {selected.documents && selected.documents.length > 0 && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: TEXT }}>Attached Documents</h3>
            {selected.documents.map((doc, i) => (
              <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: i < selected.documents!.length - 1 ? `1px solid ${BORDER}` : 'none', color: BLUE, textDecoration: 'none', fontSize: 13 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                {doc.name}
              </a>
            ))}
          </div>
        )}

        {/* ── Revision History (Enhanced timeline) ── */}
        {selected.revisions && selected.revisions.length > 0 && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: TEXT }}>Revision History</h3>
            <div style={{ position: 'relative', paddingLeft: 24 }}>
              {/* Timeline line */}
              <div style={{ position: 'absolute', left: 7, top: 6, bottom: 6, width: 2, background: BORDER }} />
              {selected.revisions.map((rev, i) => (
                <div key={i} style={{ position: 'relative', paddingBottom: i < selected.revisions!.length - 1 ? 18 : 0 }}>
                  {/* Timeline dot */}
                  <div style={{
                    position: 'absolute', left: -20, top: 4, width: 12, height: 12, borderRadius: '50%',
                    background: getStatusColor(rev.status), border: '2px solid #060C15',
                  }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, flexWrap: 'wrap', gap: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Rev {rev.revision}</span>
                    <span style={{
                      fontSize: 11, padding: '1px 8px', borderRadius: 20, fontWeight: 600, color: '#fff',
                      background: getStatusColor(rev.status),
                    }}>{rev.action || rev.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: DIM }}>{formatDate(rev.date)}</span>
                    {rev.reviewer && <span style={{ fontSize: 12, color: DIM }}>by {rev.reviewer}</span>}
                  </div>
                  {rev.notes && <p style={{ margin: 0, fontSize: 13, color: DIM, lineHeight: 1.4 }}>{rev.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Review Actions (existing) */}
        {!reviewAction ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setReviewAction('approve')} style={{ ...actionBtn, background: GREEN, flex: 1 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={18} height={18}><polyline points="20 6 9 17 4 12"/></svg>
              Approve
            </button>
            <button onClick={() => setReviewAction('reject')} style={{ ...actionBtn, background: RED, flex: 1 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={18} height={18}><line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/></svg>
              Reject
            </button>
            <button onClick={() => setReviewAction('resubmit')} style={{ ...actionBtn, background: BLUE, flex: 1 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              Resubmit
            </button>
          </div>
        ) : (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: TEXT }}>
              {reviewAction === 'approve' ? 'Approve Submittal' : reviewAction === 'reject' ? 'Reject Submittal' : 'Request Resubmit'}
            </h3>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 6 }}>Reviewer Notes</label>
            <textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={4}
              placeholder="Enter review notes..."
              style={{ width: '100%', padding: '10px 12px', background: '#060C15', border: `1px solid ${BORDER}`, borderRadius: 10, color: TEXT, fontSize: 14, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={handleSubmitReview}
                disabled={submitting}
                style={{ ...actionBtn, background: reviewAction === 'approve' ? GREEN : reviewAction === 'reject' ? RED : BLUE, flex: 1, opacity: submitting ? 0.6 : 1 }}
              >
                {submitting ? 'Submitting...' : `Submit ${reviewAction === 'approve' ? 'Approval' : reviewAction === 'reject' ? 'Rejection' : 'Resubmit Request'}`}
              </button>
              <button onClick={() => { setReviewAction(null); setReviewNotes(''); }} style={{ ...actionBtn, background: 'transparent', border: `1px solid ${BORDER}`, flex: 0.5 }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {!online && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 10, color: AMBER, fontSize: 12, textAlign: 'center' }}>
            Offline mode -- reviews will be queued and synced when connected
          </div>
        )}
      </div>
    );
  }

  /* ━━━━━━━━━━━━━━━━━━━━ LIST VIEW ━━━━━━━━━━━━━━━━━━━━ */
  return (
    <div style={{ padding: '18px 16px', minHeight: '100vh', background: '#060C15' }}>
      <button onClick={() => router.back()} style={backBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
      </button>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>Submittals</h1>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: DIM }}>Review and manage submittals</p>
        </div>
        {/* Create button */}
        <button
          onClick={() => setShowCreateForm(true)}
          style={{
            background: GOLD, border: 'none', borderRadius: 10, padding: '8px 14px',
            color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 2,
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={16} height={16}><line x1={12} y1={5} x2={12} y2={19}/><line x1={5} y1={12} x2={19} y2={12}/></svg>
          New
        </button>
      </div>

      {/* ── Ball-in-Court filter ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          onClick={() => setCourtFilter('all')}
          style={{
            flex: 1, padding: '8px 0', border: `1px solid ${courtFilter === 'all' ? GOLD : BORDER}`,
            borderRadius: 8, background: courtFilter === 'all' ? `${GOLD}22` : 'transparent',
            color: courtFilter === 'all' ? GOLD : DIM, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          All ({submittals.length})
        </button>
        <button
          onClick={() => setCourtFilter('my_court')}
          style={{
            flex: 1, padding: '8px 0', border: `1px solid ${courtFilter === 'my_court' ? GOLD : BORDER}`,
            borderRadius: 8, background: courtFilter === 'my_court' ? `${GOLD}22` : 'transparent',
            color: courtFilter === 'my_court' ? GOLD : DIM, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          My Court ({submittals.filter((s) => (s.ball_in_court || deriveCourt(s.status)) === 'you').length})
        </button>
      </div>

      {!online && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 10, color: AMBER, fontSize: 12, textAlign: 'center' }}>
          You are offline. Some actions will be queued.
        </div>
      )}

      {toast && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, color: GREEN, fontSize: 13, textAlign: 'center' }}>{toast}</div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading submittals...</div>
      ) : filteredSubmittals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 16px', color: DIM }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={40} height={40} style={{ marginBottom: 8 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <p style={{ margin: 0, fontSize: 14 }}>{courtFilter === 'my_court' ? 'No submittals in your court.' : 'No submittals found for this project.'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredSubmittals.map((s) => {
            const num = s.submittal_number || s.number || '';
            const statusColor = getStatusColor(s.status);
            const court = s.ball_in_court || deriveCourt(s.status);
            const courtMeta = COURT_META[court];
            const overdue = isOverdue(s);
            const daysInReview = getDaysInReview(s);
            return (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                style={{ background: RAISED, border: `1px solid ${overdue ? 'rgba(239,68,68,.35)' : BORDER}`, borderRadius: 14, padding: 14, textAlign: 'left', cursor: 'pointer', width: '100%', display: 'block' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      {num && <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>#{num}</span>}
                      <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 20, fontWeight: 700, color: '#fff', background: statusColor }}>{s.status}</span>
                      {/* Ball-in-Court badge */}
                      <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, fontWeight: 700, color: '#fff', background: courtMeta.color }}>{courtMeta.label}</span>
                      {/* Priority badge */}
                      {s.priority && s.priority !== 'Normal' && (
                        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, fontWeight: 700, color: '#fff', background: PRIORITY_COLORS[s.priority] }}>{s.priority}</span>
                      )}
                    </div>
                    <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: TEXT, lineHeight: 1.3 }}>{s.title}</p>
                    {s.spec_section && <p style={{ margin: 0, fontSize: 12, color: DIM }}>Spec: {s.spec_section}</p>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {s.due_date && (
                      <p style={{ margin: '0 0 4px', fontSize: 11, color: overdue ? RED : DIM, fontWeight: overdue ? 700 : 400 }}>
                        {overdue ? 'OVERDUE' : 'Due'}: {formatDate(s.due_date)}
                      </p>
                    )}
                    {/* Days in review indicator */}
                    <p style={{ margin: 0, fontSize: 10, color: daysInReview > 14 ? RED : daysInReview > 7 ? AMBER : DIM }}>
                      {daysInReview}d in review
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FieldSubmittalsPage() {
  return <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}><SubmittalsPage /></Suspense>;
}

const backBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#8BAAC8', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'flex', alignItems: 'center',
};

const actionBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '12px 16px', border: 'none', borderRadius: 10, color: '#fff',
  fontSize: 14, fontWeight: 700, cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 6, marginTop: 2,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: '#060C15', border: `1px solid ${BORDER}`,
  borderRadius: 10, color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 14,
};
