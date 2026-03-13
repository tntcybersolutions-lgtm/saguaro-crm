'use client';
/**
 * Saguaro Field — RFI View / Respond
 * List, view detail, respond to, and create RFIs from the field.
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
const PURPLE = '#8B5CF6';

const SPEC_SECTIONS = [
  'Division 01 – Gen. Requirements', 'Division 03 – Concrete', 'Division 04 – Masonry',
  'Division 05 – Metals', 'Division 06 – Wood & Plastics', 'Division 07 – Thermal',
  'Division 08 – Openings', 'Division 09 – Finishes', 'Division 22 – Plumbing',
  'Division 23 – HVAC', 'Division 26 – Electrical', 'Other',
];

interface RFI {
  id: string;
  rfi_number?: number;
  subject: string;
  question: string;
  status: string;
  due_date?: string;
  created_at?: string;
  spec_section?: string;
  attachments?: Array<{ name: string; url: string }>;
  responses?: Array<{ author: string; text: string; created_at: string; attachments?: Array<{ name: string; url: string }> }>;
}

type View = 'list' | 'detail' | 'create';

function statusColor(status: string): string {
  const s = status?.toLowerCase() || '';
  if (s === 'open' || s === 'pending') return BLUE;
  if (s === 'answered' || s === 'closed' || s === 'resolved') return GREEN;
  if (s === 'overdue') return RED;
  return DIM;
}

function formatDate(d: string | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function RFIsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [rfis, setRfis] = useState<RFI[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selectedRfi, setSelectedRfi] = useState<RFI | null>(null);
  const [online, setOnline] = useState(true);

  // Response form
  const [responseText, setResponseText] = useState('');
  const [responsePhoto, setResponsePhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Create form
  const [newSubject, setNewSubject] = useState('');
  const [newQuestion, setNewQuestion] = useState('');
  const [newSpec, setNewSpec] = useState('Other');
  const [newDueDate, setNewDueDate] = useState('');

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
    fetch(`/api/rfis/list?projectId=${projectId}`)
      .then((r) => r.ok ? r.json() : { rfis: [] })
      .then((d) => setRfis(d.rfis || d.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const openDetail = (rfi: RFI) => {
    setSelectedRfi(rfi);
    setView('detail');
    setResponseText('');
    setResponsePhoto(null);
    setSubmitMsg('');
  };

  const handleRespond = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRfi || !responseText.trim()) return;
    setSubmitting(true);

    const payload: Record<string, string> = {
      answer: responseText.trim(),
    };

    // If there is a photo, we handle it as FormData
    if (responsePhoto) {
      try {
        const fd = new FormData();
        fd.append('answer', responseText.trim());
        fd.append('photo', responsePhoto);

        if (!online) throw new Error('offline');
        const res = await fetch(`/api/rfis/${selectedRfi.id}/respond`, { method: 'POST', body: fd });
        if (!res.ok) throw new Error();
        setSubmitMsg('Response submitted');

        // Optimistically add the response
        setSelectedRfi((prev) => prev ? {
          ...prev,
          responses: [...(prev.responses || []), { author: 'You (field)', text: responseText.trim(), created_at: new Date().toISOString() }],
        } : prev);
        setRfis((prev) => prev.map((r) => r.id === selectedRfi.id ? { ...r, status: 'answered' } : r));
      } catch {
        // Queue with base64 photo
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1] || '';
          await enqueue({
            url: `/api/rfis/${selectedRfi.id}/respond`,
            method: 'POST',
            body: null,
            contentType: '',
            isFormData: true,
            formDataEntries: [
              { name: 'answer', value: responseText.trim() },
              { name: 'photo', value: base64, filename: responsePhoto.name, type: responsePhoto.type },
            ],
          });
          setSubmitMsg('Response queued — will sync when online');
        };
        reader.readAsDataURL(responsePhoto);
      }
    } else {
      try {
        if (!online) throw new Error('offline');
        const res = await fetch(`/api/rfis/${selectedRfi.id}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        setSubmitMsg('Response submitted');
        setSelectedRfi((prev) => prev ? {
          ...prev,
          responses: [...(prev.responses || []), { author: 'You (field)', text: responseText.trim(), created_at: new Date().toISOString() }],
        } : prev);
        setRfis((prev) => prev.map((r) => r.id === selectedRfi.id ? { ...r, status: 'answered' } : r));
      } catch {
        await enqueue({
          url: `/api/rfis/${selectedRfi.id}/respond`,
          method: 'POST',
          body: JSON.stringify(payload),
          contentType: 'application/json',
          isFormData: false,
        });
        setSubmitMsg('Response queued — will sync when online');
      }
    }

    setResponseText('');
    setResponsePhoto(null);
    setSubmitting(false);
    setTimeout(() => setSubmitMsg(''), 3500);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newQuestion.trim()) return;
    setSubmitting(true);

    const payload = {
      projectId,
      subject: newSubject.trim(),
      question: newQuestion.trim(),
      specSection: newSpec,
      dueDate: newDueDate || null,
    };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch('/api/rfis/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();

      const data = await res.json().catch(() => ({}));
      const newRfi: RFI = {
        id: data.id || `temp-${Date.now()}`,
        subject: newSubject.trim(),
        question: newQuestion.trim(),
        status: 'open',
        spec_section: newSpec,
        due_date: newDueDate || undefined,
        created_at: new Date().toISOString(),
        rfi_number: (rfis.length + 1),
        responses: [],
      };
      setRfis((prev) => [newRfi, ...prev]);
      setSubmitMsg('RFI created');
    } catch {
      await enqueue({
        url: '/api/rfis/create',
        method: 'POST',
        body: JSON.stringify(payload),
        contentType: 'application/json',
        isFormData: false,
      });
      const newRfi: RFI = {
        id: `queued-${Date.now()}`,
        subject: newSubject.trim(),
        question: newQuestion.trim(),
        status: 'open',
        spec_section: newSpec,
        due_date: newDueDate || undefined,
        created_at: new Date().toISOString(),
        rfi_number: (rfis.length + 1),
        responses: [],
      };
      setRfis((prev) => [newRfi, ...prev]);
      setSubmitMsg('RFI queued — will sync when online');
    }

    setNewSubject('');
    setNewQuestion('');
    setNewDueDate('');
    setSubmitting(false);
    setView('list');
    setTimeout(() => setSubmitMsg(''), 3500);
  };

  // ─── LIST VIEW ────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div style={{ padding: '18px 16px' }}>
        <button onClick={() => router.back()} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
            <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>RFIs</h1>
            <p style={{ margin: 0, fontSize: 13, color: DIM }}>Requests for Information</p>
          </div>
          <button onClick={() => { setView('create'); setSubmitMsg(''); }} style={{
            background: PURPLE, border: 'none', borderRadius: 10, padding: '10px 16px',
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            + New RFI
          </button>
        </div>

        {!online && <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: RED, fontWeight: 600 }}>Offline — showing cached data</div>}

        {submitMsg && (
          <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: GREEN, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polyline points="20 6 9 17 4 12"/></svg>{submitMsg}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading RFIs...</div>
        ) : rfis.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: DIM }}>
            <div style={{ marginBottom: 8, color: PURPLE, display: 'flex', justifyContent: 'center' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}>
                <circle cx={12} cy={12} r={10}/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1={12} y1={17} x2={12.01} y2={17}/>
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: 14 }}>No RFIs yet. Tap "+ New RFI" to create one.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rfis.map((rfi) => {
              const sc = statusColor(rfi.status);
              const isOverdue = rfi.due_date && new Date(rfi.due_date) < new Date() && rfi.status?.toLowerCase() !== 'answered' && rfi.status?.toLowerCase() !== 'closed' && rfi.status?.toLowerCase() !== 'resolved';
              return (
                <button
                  key={rfi.id}
                  onClick={() => openDetail(rfi)}
                  style={{
                    background: RAISED, border: `1px solid ${isOverdue ? 'rgba(239,68,68,.35)' : BORDER}`,
                    borderRadius: 14, padding: '14px', textAlign: 'left', width: '100%', cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        {rfi.rfi_number != null && (
                          <span style={{ fontSize: 11, fontWeight: 800, color: GOLD, background: 'rgba(212,160,23,.12)', padding: '2px 8px', borderRadius: 6 }}>
                            RFI-{rfi.rfi_number}
                          </span>
                        )}
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                          background: `rgba(${hexRgb(isOverdue ? RED : sc)},.12)`,
                          color: isOverdue ? RED : sc,
                        }}>
                          {isOverdue ? 'Overdue' : rfi.status}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.3 }}>{rfi.subject}</p>
                      <p style={{ margin: 0, fontSize: 12, color: DIM }}>
                        {rfi.due_date ? `Due ${formatDate(rfi.due_date)}` : 'No due date'}
                        {rfi.spec_section ? ` · ${rfi.spec_section}` : ''}
                      </p>
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
  if (view === 'detail' && selectedRfi) {
    const sc = statusColor(selectedRfi.status);
    const isOverdue = selectedRfi.due_date && new Date(selectedRfi.due_date) < new Date() && selectedRfi.status?.toLowerCase() !== 'answered' && selectedRfi.status?.toLowerCase() !== 'closed';
    return (
      <div style={{ padding: '18px 16px' }}>
        <button onClick={() => { setView('list'); setSubmitMsg(''); }} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
            <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          {selectedRfi.rfi_number != null && (
            <span style={{ fontSize: 12, fontWeight: 800, color: GOLD, background: 'rgba(212,160,23,.12)', padding: '3px 10px', borderRadius: 6 }}>
              RFI-{selectedRfi.rfi_number}
            </span>
          )}
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
            background: `rgba(${hexRgb(isOverdue ? RED : sc)},.12)`,
            color: isOverdue ? RED : sc,
          }}>
            {isOverdue ? 'Overdue' : selectedRfi.status}
          </span>
        </div>
        <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: TEXT }}>{selectedRfi.subject}</h1>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: DIM }}>
          {selectedRfi.due_date ? `Due ${formatDate(selectedRfi.due_date)}` : 'No due date'}
          {selectedRfi.spec_section ? ` · ${selectedRfi.spec_section}` : ''}
          {selectedRfi.created_at ? ` · Created ${formatDate(selectedRfi.created_at)}` : ''}
        </p>

        {submitMsg && (
          <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: GREEN, fontSize: 14, fontWeight: 600 }}>
            {submitMsg}
          </div>
        )}

        {/* Question */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Question</p>
          <p style={{ margin: 0, fontSize: 14, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selectedRfi.question}</p>
        </div>

        {/* Attachments */}
        {selectedRfi.attachments && selectedRfi.attachments.length > 0 && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
            <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Attachments</p>
            {selectedRfi.attachments.map((att, i) => (
              <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
                borderTop: i > 0 ? `1px solid ${BORDER}` : 'none', textDecoration: 'none',
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <span style={{ fontSize: 13, color: BLUE, fontWeight: 600 }}>{att.name}</span>
              </a>
            ))}
          </div>
        )}

        {/* Response History */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Responses ({selectedRfi.responses?.length || 0})
          </p>
          {(!selectedRfi.responses || selectedRfi.responses.length === 0) ? (
            <p style={{ margin: 0, fontSize: 13, color: DIM, fontStyle: 'italic' }}>No responses yet</p>
          ) : (
            selectedRfi.responses.map((resp, i) => (
              <div key={i} style={{ padding: '10px 0', borderTop: i > 0 ? `1px solid ${BORDER}` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>{resp.author}</span>
                  <span style={{ fontSize: 11, color: DIM }}>{formatDate(resp.created_at)}</span>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: TEXT, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{resp.text}</p>
                {resp.attachments && resp.attachments.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {resp.attachments.map((att, j) => (
                      <a key={j} href={att.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: BLUE, textDecoration: 'none', display: 'block', marginTop: 2 }}>
                        {att.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Response Form */}
        <form onSubmit={handleRespond} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Add Response</p>
          <textarea
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            placeholder="Type your response..."
            rows={4}
            style={inp}
            required
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <button type="button" onClick={() => photoInputRef.current?.click()} style={{
              background: 'rgba(59,130,246,.1)', border: `1px solid rgba(59,130,246,.3)`,
              borderRadius: 8, padding: '8px 14px', color: BLUE, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
                <rect x={3} y={3} width={18} height={18} rx={2}/><circle cx={8.5} cy={8.5} r={1.5}/><polyline points="21 15 16 10 5 21"/>
              </svg>
              {responsePhoto ? responsePhoto.name : 'Attach Photo'}
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => setResponsePhoto(e.target.files?.[0] || null)} />
          </div>
          <button type="submit" disabled={submitting} style={{
            width: '100%', background: submitting ? '#1E3A5F' : GREEN, border: 'none', borderRadius: 14,
            padding: '16px', color: submitting ? DIM : '#000', fontSize: 16, fontWeight: 800,
            cursor: submitting ? 'wait' : 'pointer', marginTop: 12,
          }}>
            {submitting ? 'Submitting...' : online ? 'Submit Response' : 'Submit (Offline — will sync)'}
          </button>
        </form>
      </div>
    );
  }

  // ─── CREATE VIEW ──────────────────────────────────────────────
  return (
    <div style={{ padding: '18px 16px' }}>
      <button onClick={() => { setView('list'); setSubmitMsg(''); }} style={backBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
          <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: PURPLE }}>New RFI</h1>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: DIM }}>Request for information — office responds in dashboard</p>

      {!online && <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: RED, fontWeight: 600 }}>Offline — will queue and sync automatically</div>}

      <form onSubmit={handleCreate}>
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 14px 6px', marginBottom: 12 }}>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>RFI Details</p>

          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Subject *</label>
            <input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Brief description" style={inp} required />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Question / Description *</label>
            <textarea value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} placeholder="Describe the issue and what clarification you need..." rows={4} style={inp} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Spec Section</label>
              <select value={newSpec} onChange={(e) => setNewSpec(e.target.value)} style={inp}>
                {SPEC_SECTIONS.map((s) => <option key={s} value={s} style={{ background: '#0D1D2E' }}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Need By</label>
              <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} style={inp} />
            </div>
          </div>
        </div>

        <button type="submit" disabled={submitting} style={{
          width: '100%', background: submitting ? '#1E3A5F' : PURPLE, border: 'none', borderRadius: 14,
          padding: '18px', color: submitting ? DIM : '#fff', fontSize: 17, fontWeight: 800,
          cursor: submitting ? 'wait' : 'pointer', marginTop: 4,
        }}>
          {submitting ? 'Saving...' : online ? 'File RFI' : 'File RFI (Offline — will sync)'}
        </button>
      </form>
    </div>
  );
}

export default function FieldRFIsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}>
      <RFIsPage />
    </Suspense>
  );
}

const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: '8px', marginLeft: -8, display: 'flex', alignItems: 'center', marginBottom: 4 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, color: DIM, marginBottom: 4, fontWeight: 600 };
const inp: React.CSSProperties = { width: '100%', background: '#07101C', border: '1px solid #1E3A5F', borderRadius: 10, padding: '11px 14px', color: '#F0F4FF', fontSize: 15, outline: 'none' };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
