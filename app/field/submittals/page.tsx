'use client';
/**
 * Saguaro Field — Submittals Mobile Review
 * Review submittals on the go: approve, reject, or request resubmit with notes.
 */
import React, { useState, useEffect, Suspense } from 'react';
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
  revisions?: Array<{ revision: number; date: string; notes: string; status: string }>;
  created_at?: string;
}

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

  // Detail view
  if (selected) {
    const num = selected.submittal_number || selected.number || '';
    return (
      <div style={{ padding: '18px 16px', minHeight: '100vh', background: '#060C15' }}>
        <button onClick={() => { setSelected(null); setReviewAction(null); setReviewNotes(''); }} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
          <span style={{ marginLeft: 6, fontSize: 14 }}>Back to List</span>
        </button>

        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {num && <span style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>#{num}</span>}
            <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 700, color: '#fff', background: getStatusColor(selected.status) }}>{selected.status}</span>
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: TEXT }}>{selected.title}</h2>
          {selected.spec_section && <p style={{ margin: '0 0 4px', fontSize: 13, color: DIM }}>Spec Section: {selected.spec_section}</p>}
          {selected.submitted_by && <p style={{ margin: '0 0 4px', fontSize: 13, color: DIM }}>Submitted by: {selected.submitted_by}</p>}
          {selected.submitted_date && <p style={{ margin: '0 0 4px', fontSize: 13, color: DIM }}>Submitted: {formatDate(selected.submitted_date)}</p>}
          {selected.due_date && <p style={{ margin: '0 0 4px', fontSize: 13, color: DIM }}>Due: {formatDate(selected.due_date)}</p>}
          {selected.description && <p style={{ margin: '10px 0 0', fontSize: 14, color: TEXT, lineHeight: 1.5 }}>{selected.description}</p>}
        </div>

        {/* Attached Documents */}
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

        {/* Revision History */}
        {selected.revisions && selected.revisions.length > 0 && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: TEXT }}>Revision History</h3>
            {selected.revisions.map((rev, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: i < selected.revisions!.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Rev {rev.revision}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: DIM }}>{formatDate(rev.date)}</span>
                    <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 20, fontWeight: 600, color: '#fff', background: getStatusColor(rev.status) }}>{rev.status}</span>
                  </div>
                </div>
                {rev.notes && <p style={{ margin: 0, fontSize: 13, color: DIM }}>{rev.notes}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Review Actions */}
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

  // List view
  return (
    <div style={{ padding: '18px 16px', minHeight: '100vh', background: '#060C15' }}>
      <button onClick={() => router.back()} style={backBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
      </button>
      <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>Submittals</h1>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: DIM }}>Review and manage submittals</p>

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
      ) : submittals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 16px', color: DIM }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={40} height={40} style={{ marginBottom: 8 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <p style={{ margin: 0, fontSize: 14 }}>No submittals found for this project.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {submittals.map((s) => {
            const num = s.submittal_number || s.number || '';
            const statusColor = getStatusColor(s.status);
            const isDue = s.due_date && new Date(s.due_date) < new Date() && s.status?.toLowerCase() === 'pending';
            return (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                style={{ background: RAISED, border: `1px solid ${isDue ? 'rgba(239,68,68,.35)' : BORDER}`, borderRadius: 14, padding: 14, textAlign: 'left', cursor: 'pointer', width: '100%', display: 'block' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      {num && <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>#{num}</span>}
                      <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 20, fontWeight: 700, color: '#fff', background: statusColor }}>{s.status}</span>
                    </div>
                    <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: TEXT, lineHeight: 1.3 }}>{s.title}</p>
                    {s.spec_section && <p style={{ margin: 0, fontSize: 12, color: DIM }}>Spec: {s.spec_section}</p>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {s.due_date && (
                      <p style={{ margin: 0, fontSize: 11, color: isDue ? RED : DIM, fontWeight: isDue ? 700 : 400 }}>
                        {isDue ? 'OVERDUE' : 'Due'}: {formatDate(s.due_date)}
                      </p>
                    )}
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
