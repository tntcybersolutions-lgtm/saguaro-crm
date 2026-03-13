'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardHeader, CardBody, Table, T } from '@/components/ui/shell';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';

interface RFI {
  id: string;
  rfi_number: number;
  subject: string;
  question: string;
  spec_section: string;
  status: string;
  submitted_by: string;
  due_date: string | null;
  answer: string | null;
  answered_by: string | null;
  is_overdue: boolean;
  created_at: string;
}

const STATUS_BADGE: Record<string, 'blue' | 'green' | 'muted' | 'red'> = {
  open: 'blue',
  answered: 'green',
  closed: 'muted',
  overdue: 'red',
};

export default function RFIsPage() {
  const { projectId } = useParams() as { projectId: string };
  const [rfis, setRfis] = useState<RFI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [answeredBy, setAnsweredBy] = useState('');
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Create form
  const [fSubject, setFSubject] = useState('');
  const [fQuestion, setFQuestion] = useState('');
  const [fSpecSection, setFSpecSection] = useState('');
  const [fDueDate, setFDueDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/rfis/list?projectId=${projectId}`);
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setRfis(d.rfis ?? []);
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to load RFIs');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const totalCount = rfis.length;
  const openCount = rfis.filter(r => r.status === 'open').length;
  const answeredCount = rfis.filter(r => r.status === 'answered').length;
  const overdueCount = rfis.filter(r => r.is_overdue).length;

  function daysOpen(rfi: RFI): number {
    const created = new Date(rfi.created_at || Date.now());
    return Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
  }

  async function submitRFI() {
    if (!fSubject.trim()) { setError('Subject is required'); return; }
    setSaving(true);
    setError('');
    try {
      const r = await fetch('/api/rfis/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, subject: fSubject, question: fQuestion, specSection: fSpecSection, dueDate: fDueDate || undefined }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setFSubject(''); setFQuestion(''); setFSpecSection(''); setFDueDate('');
      setShowForm(false);
      await load();
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to create RFI');
    } finally {
      setSaving(false);
    }
  }

  async function submitAnswer(rfiId: string) {
    if (!answerText.trim()) return;
    setSubmittingAnswer(true);
    try {
      const r = await fetch(`/api/rfis/${rfiId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: answerText, answeredBy, projectId }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setAnsweringId(null);
      setAnswerText('');
      setAnsweredBy('');
      setSuccessMsg('Answer submitted successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
      await load();
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to submit answer');
    } finally {
      setSubmittingAnswer(false);
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, outline: 'none',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };

  return (
    <PageWrap>
      <div style={{ padding: '24px 24px 0' }}>
        <SectionHeader
          title="RFIs"
          sub="Requests for Information"
          action={
            <Btn onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : '+ Create RFI'}
            </Btn>
          }
        />
      </div>

      {/* Stat Cards */}
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard icon="📋" label="Total RFIs" value={String(totalCount)} />
        <StatCard icon="📂" label="Open" value={String(openCount)} />
        <StatCard icon="✅" label="Answered" value={String(answeredCount)} />
        <StatCard icon="⏰" label="Overdue" value={String(overdueCount)} sub={overdueCount > 0 ? 'Needs attention' : undefined} />
      </div>

      {successMsg && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.4)`, borderRadius: 8, color: T.green, fontSize: 13 }}>{successMsg}</div>
      )}
      {error && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: T.redDim, border: `1px solid rgba(239,68,68,0.4)`, borderRadius: 8, color: T.red, fontSize: 13 }}>{error}</div>
      )}

      {/* Create Form */}
      {showForm && (
        <div style={{ padding: '0 24px 16px' }}>
          <Card>
            <CardHeader><span style={{ fontWeight: 700, color: T.white }}>New Request for Information</span></CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Subject *</label>
                  <input value={fSubject} onChange={e => setFSubject(e.target.value)} placeholder="e.g. Clarify footing depth at grid A-3" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Spec Section</label>
                  <input value={fSpecSection} onChange={e => setFSpecSection(e.target.value)} placeholder="e.g. 03 30 00" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Due Date</label>
                  <SaguaroDatePicker value={fDueDate} onChange={setFDueDate} style={inp} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Question / Description</label>
                  <textarea value={fQuestion} onChange={e => setFQuestion(e.target.value)} rows={4} placeholder="Describe the question in detail..." style={{ ...inp, resize: 'vertical' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Btn onClick={submitRFI} disabled={saving || !fSubject.trim()}>{saving ? 'Submitting...' : 'Submit RFI'}</Btn>
                <Btn variant="ghost" onClick={() => { setShowForm(false); setError(''); }}>Cancel</Btn>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Table */}
      <div style={{ padding: '0 24px 40px' }}>
        <Card>
          <CardBody style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>Loading RFIs...</div>
            ) : rfis.length === 0 ? (
              <div style={{ padding: 56, textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: T.white, marginBottom: 8 }}>No RFIs yet</div>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>Create your first Request for Information.</div>
                <Btn onClick={() => setShowForm(true)}>+ Create First RFI</Btn>
              </div>
            ) : (
              <>
                <Table
                  headers={['RFI #', 'Subject', 'Status', 'Submitted By', 'Due Date', 'Days Open', 'Actions']}
                  rows={rfis.map(rfi => {
                    const displayStatus = rfi.is_overdue ? 'overdue' : (rfi.status || 'open');
                    return [
                      <span key="n" style={{ color: T.gold, fontWeight: 700 }}>#{rfi.rfi_number}</span>,
                      <div key="sub">
                        <div style={{ fontWeight: 600 }}>{rfi.subject}</div>
                        {rfi.question && <div style={{ fontSize: 11, color: T.muted, marginTop: 2, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rfi.question}</div>}
                      </div>,
                      <Badge key="s" label={displayStatus} color={STATUS_BADGE[displayStatus] || 'muted'} />,
                      <span key="by" style={{ color: T.muted }}>{rfi.submitted_by || '—'}</span>,
                      <span key="dd" style={{ color: rfi.is_overdue ? T.red : T.muted }}>
                        {rfi.due_date ? new Date(rfi.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </span>,
                      <span key="do" style={{ color: T.muted }}>{daysOpen(rfi)}d</span>,
                      <div key="act">
                        {(rfi.status === 'open' || rfi.status === 'pending') && (
                          <Btn size="sm" onClick={() => { setAnsweringId(answeringId === rfi.id ? null : rfi.id); setAnswerText(''); setAnsweredBy(''); }}>
                            {answeringId === rfi.id ? 'Cancel' : 'Answer'}
                          </Btn>
                        )}
                        {rfi.status === 'answered' && <span style={{ fontSize: 11, color: T.green, fontWeight: 700 }}>Answered</span>}
                      </div>,
                    ];
                  })}
                />
                {/* Inline answer form */}
                {answeringId && (
                  <div style={{ padding: '16px 20px', background: T.surface2, borderTop: `1px solid ${T.border}` }}>
                    <div style={{ marginBottom: 10 }}>
                      <label style={lbl}>Answer / Response</label>
                      <textarea value={answerText} onChange={e => setAnswerText(e.target.value)} rows={3} placeholder="Type your answer..." style={{ ...inp, resize: 'vertical' }} />
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={lbl}>Answered By</label>
                      <input value={answeredBy} onChange={e => setAnsweredBy(e.target.value)} placeholder="Your name" style={inp} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn onClick={() => submitAnswer(answeringId)} disabled={submittingAnswer || !answerText.trim()}>
                        {submittingAnswer ? 'Saving...' : 'Submit Answer'}
                      </Btn>
                      <Btn variant="ghost" onClick={() => { setAnsweringId(null); setAnswerText(''); setAnsweredBy(''); }}>Cancel</Btn>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </PageWrap>
  );
}
