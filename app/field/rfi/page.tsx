'use client';
/**
 * Saguaro Field -- RFI Creation + List
 * Mobile-first field page for creating and viewing RFIs.
 */
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';
import { takePhoto, hapticSuccess, hapticLight, hapticError, isNative } from '@/lib/native';
import OfflineSyncStatus from '@/components/field/OfflineSyncStatus';
import VoiceToLog from '@/components/field/VoiceToLog';

const GOLD   = '#C8960F';
const DARK = '#0D1117';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const DIM = '#6B7280';
const TEXT = '#111827';
const GREEN  = '#22c55e';
const RED    = '#ef4444';
const AMBER  = '#C8960F';
const BLUE   = '#3b82f6';

/* ─── Interfaces ─── */
interface RFI {
  id: string;
  rfi_number?: number;
  subject: string;
  question: string;
  answer?: string;
  status: string;
  due_date?: string;
  ball_in_court?: string;
  spec_section?: string;
  created_at?: string;
  attachments?: Array<{ name: string; url: string }>;
}

type Tab = 'create' | 'list';

function statusColor(s: string): string {
  const st = s?.toLowerCase() || '';
  if (st === 'open' || st === 'pending') return AMBER;
  if (st === 'answered' || st === 'resolved') return GREEN;
  if (st === 'closed') return DIM;
  return DIM;
}

/* ─── Inner component ─── */
function RFIPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const projectId = params.get('projectId') || new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('projectId') || '';

  const [tab, setTab] = useState<Tab>('create');
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(false);

  /* Create form state */
  const [subject, setSubject] = useState('');
  const [question, setQuestion] = useState('');
  const [specSection, setSpecSection] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  /* List state */
  const [rfis, setRfis] = useState<RFI[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);

  /* ── Fetch project name ── */
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.name) setProjectName(d.name); })
      .catch(() => {});
  }, [projectId]);

  /* ── Toast auto-dismiss ── */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Fetch RFI list ── */
  const fetchRFIs = useCallback(async () => {
    if (!projectId) return;
    setListLoading(true);
    try {
      const res = await fetch(`/api/rfis/list?project_id=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setRfis(Array.isArray(data) ? data : data.rfis || data.items || []);
      }
    } catch { /* offline */ }
    setListLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (tab === 'list') fetchRFIs();
  }, [tab, fetchRFIs]);

  /* ── Photo capture ── */
  const handleCameraCapture = async () => {
    if (isNative()) {
      const result = await takePhoto({ source: 'camera', quality: 80 });
      if (result) {
        setPhotoFile(result.file);
        setPhotoPreview(result.dataUrl);
        hapticLight();
      }
    } else {
      fileRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  /* ── Submit RFI ── */
  const handleSubmit = async () => {
    if (!subject.trim() || !question.trim()) {
      setToast('Subject and question are required');
      hapticError();
      return;
    }
    setSubmitting(true);

    const body: Record<string, unknown> = {
      project_id: projectId,
      subject: subject.trim(),
      question: question.trim(),
      spec_section: specSection.trim() || undefined,
      due_date: dueDate || undefined,
      status: 'open',
    };

    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

    if (online) {
      try {
        let res: Response;
        if (photoFile) {
          const fd = new FormData();
          Object.entries(body).forEach(([k, v]) => { if (v !== undefined) fd.append(k, String(v)); });
          fd.append('photo', photoFile);
          res = await fetch('/api/rfis/create', { method: 'POST', body: fd });
        } else {
          res = await fetch('/api/rfis/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
        }
        if (res.ok) {
          setToast('RFI submitted successfully');
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
        url: '/api/rfis/create',
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
    setSubject('');
    setQuestion('');
    setSpecSection('');
    setDueDate('');
    setPhotoFile(null);
    setPhotoPreview('');
  };

  /* ── Voice input ── */
  const handleVoice = (text: string) => {
    if (tab === 'create') {
      setQuestion(prev => prev ? `${prev} ${text}` : text);
    }
  };

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
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT }}>RFIs</div>
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
            {t === 'create' ? 'Create' : 'Open RFIs'}
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
          {/* Subject */}
          <div>
            <label style={labelStyle}>Subject *</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Brief RFI title"
              style={inputStyle}
            />
          </div>

          {/* Question */}
          <div>
            <label style={labelStyle}>Question *</label>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Describe what needs clarification..."
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 90 }}
            />
          </div>

          {/* Voice input */}
          <VoiceToLog onTranscript={handleVoice} />

          {/* Spec Section */}
          <div>
            <label style={labelStyle}>Spec Section (optional)</label>
            <input
              type="text"
              value={specSection}
              onChange={e => setSpecSection(e.target.value)}
              placeholder="e.g. Division 03 - Concrete"
              style={inputStyle}
            />
          </div>

          {/* Due Date */}
          <div>
            <label style={labelStyle}>Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={{ ...inputStyle, colorScheme: 'dark' }}
            />
          </div>

          {/* Photo Attachment */}
          <div>
            <label style={labelStyle}>Photo Attachment</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button onClick={handleCameraCapture} style={{
              width: '100%', padding: '12px 0', borderRadius: 10, border: `1px dashed ${BORDER}`,
              background: RAISED, color: DIM, fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              {photoFile ? 'Change Photo' : 'Take / Attach Photo'}
            </button>
            {photoPreview && (
              <div style={{ marginTop: 8, position: 'relative', display: 'inline-block' }}>
                <img src={photoPreview} alt="Preview" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}` }} />
                <button onClick={() => { setPhotoFile(null); setPhotoPreview(''); }} style={{
                  position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%',
                  background: RED, color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>X</button>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !subject.trim() || !question.trim()}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
              background: submitting || !subject.trim() || !question.trim() ? BORDER : GOLD,
              color: submitting || !subject.trim() || !question.trim() ? DIM : DARK,
              fontSize: 16, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {submitting ? 'Submitting...' : 'Submit RFI'}
          </button>
        </div>
      )}

      {/* ═══ LIST TAB ═══ */}
      {tab === 'list' && (
        <div style={{ padding: 16 }}>
          {listLoading ? (
            <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>Loading RFIs...</div>
          ) : rfis.length === 0 ? (
            <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              No RFIs found for this project
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rfis.map(rfi => {
                const expanded = expandedId === rfi.id;
                return (
                  <div key={rfi.id} onClick={() => setExpandedId(expanded ? null : rfi.id)} style={{
                    background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12,
                    padding: 14, cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                    {/* Card header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          {rfi.rfi_number != null && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>#{rfi.rfi_number}</span>
                          )}
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                            background: `${statusColor(rfi.status)}22`, color: statusColor(rfi.status),
                            textTransform: 'uppercase',
                          }}>
                            {rfi.status}
                          </span>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>{rfi.subject}</div>
                      </div>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0, marginTop: 4 }}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>

                    {/* Meta row */}
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                      {rfi.due_date && (
                        <span style={{ fontSize: 12, color: DIM, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                          Due {new Date(rfi.due_date).toLocaleDateString()}
                        </span>
                      )}
                      {rfi.ball_in_court && (
                        <span style={{ fontSize: 12, color: DIM }}>Ball: {rfi.ball_in_court}</span>
                      )}
                    </div>

                    {/* Expanded detail */}
                    {expanded && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: DIM, marginBottom: 4 }}>Question</div>
                          <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{rfi.question}</div>
                        </div>
                        {rfi.answer && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: GREEN, marginBottom: 4 }}>Answer</div>
                            <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{rfi.answer}</div>
                          </div>
                        )}
                        {rfi.spec_section && (
                          <div style={{ marginTop: 8, fontSize: 12, color: DIM }}>Spec: {rfi.spec_section}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
export default function FieldRFIPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#F8F9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}>Loading...</div>}>
      <RFIPageInner />
    </Suspense>
  );
}
