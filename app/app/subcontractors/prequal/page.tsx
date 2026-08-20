'use client';

import { useState, useEffect, useCallback } from 'react';

/* ── Dark Theme ──────────────────────────────────────────────────── */
const C = {
  bg: '#0d1117',
  card: '#161b22',
  border: '#30363d',
  text: '#F0F4FF',
  dim: '#8B9DB8',
  gold: '#C8960F',
  green: '#22C55E',
  red: '#EF4444',
  amber: '#F59E0B',
  blue: '#3B82F6',
};

/* ── Types ────────────────────────────────────────────────────────── */
interface Submission {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  primary_trade: string | null;
  status: string;
  sage_score: number | null;
  sage_analysis: { strengths?: string[]; concerns?: string[]; recommendation?: string } | null;
  emr_current: number | null;
  gl_carrier: string | null;
  wc_carrier: string | null;
  references: Array<{ company?: string; contact_name?: string }> | null;
  bonding_limit: number | null;
  annual_revenue: number | null;
  submitted_at: string | null;
  created_at: string;
  reviewer_notes: string | null;
  portal_token: string;
}

/* ── Styles ───────────────────────────────────────────────────────── */
const cardStyle: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20,
};

const btnStyle = (bg: string, disabled = false): React.CSSProperties => ({
  padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6,
  color: '#000', background: bg, cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});

const modalOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24,
};

const modalBox: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
  padding: 28, maxWidth: 480, width: '100%',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: 14, background: C.bg,
  border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, outline: 'none',
  boxSizing: 'border-box',
};

/* ── Component ────────────────────────────────────────────────────── */
export default function PrequalDashboard() {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analyzeLog, setAnalyzeLog] = useState<string[]>([]);

  /* Modals */
  const [showInvite, setShowInvite] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invCompany, setInvCompany] = useState('');
  const [invMessage, setInvMessage] = useState('');
  const [invSending, setInvSending] = useState(false);

  const [reviewModal, setReviewModal] = useState<{ id: string; action: 'approved' | 'rejected' } | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);

  const fetchSubs = useCallback(async () => {
    try {
      const res = await fetch('/api/prequal/list');
      const json = await res.json();
      if (json.data) setSubs(json.data);
    } catch { /* handled */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  /* ── KPI Counts ─────────────────────────────────────────────────── */
  const counts = {
    approved: subs.filter(s => s.status === 'approved').length,
    under_review: subs.filter(s => s.status === 'under_review').length,
    pending: subs.filter(s => s.status === 'draft' || s.status === 'submitted').length,
    rejected: subs.filter(s => s.status === 'rejected').length,
  };

  /* ── Analyze SSE ────────────────────────────────────────────────── */
  async function runAnalysis(id: string) {
    setAnalyzingId(id);
    setAnalyzeLog([]);
    setExpandedId(id);

    try {
      const res = await fetch(`/api/prequal/${id}/analyze`);
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              setAnalyzeLog(prev => [...prev, `[${parsed.stage}] ${parsed.message}`]);
              if (parsed.stage === 'done') {
                await fetchSubs();
              }
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setAnalyzeLog(prev => [...prev, `[error] ${msg}`]);
    }
    setAnalyzingId(null);
  }

  /* ── Send Invitation ────────────────────────────────────────────── */
  async function sendInvitation() {
    if (!invEmail.trim() || !invCompany.trim()) return;
    setInvSending(true);
    try {
      const res = await fetch('/api/prequal/send-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invEmail, company_name: invCompany, message: invMessage }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      setShowInvite(false);
      setInvEmail(''); setInvCompany(''); setInvMessage('');
      await fetchSubs();
    } catch { /* handled */ }
    setInvSending(false);
  }

  /* ── Approve / Reject ───────────────────────────────────────────── */
  async function submitReview() {
    if (!reviewModal) return;
    setReviewSaving(true);
    try {
      const res = await fetch('/api/prequal/list', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reviewModal.id, status: reviewModal.action, notes: reviewNotes }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      setReviewModal(null); setReviewNotes('');
      await fetchSubs();
    } catch { /* handled */ }
    setReviewSaving(false);
  }

  /* ── Score Badge ────────────────────────────────────────────────── */
  function ScoreBadge({ score }: { score: number | null }) {
    if (score == null) return <span style={{ color: C.dim, fontSize: 12 }}>--</span>;
    const color = score > 80 ? C.green : score > 60 ? C.amber : C.red;
    return (
      <span style={{
        display: 'inline-block', padding: '2px 10px', borderRadius: 12,
        background: `${color}22`, color, fontSize: 13, fontWeight: 700,
      }}>
        {score}
      </span>
    );
  }

  /* ── Status Badge ───────────────────────────────────────────────── */
  function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      draft: { bg: `${C.dim}22`, color: C.dim, label: 'Draft' },
      submitted: { bg: `${C.blue}22`, color: C.blue, label: 'Submitted' },
      under_review: { bg: `${C.amber}22`, color: C.amber, label: 'Under Review' },
      approved: { bg: `${C.green}22`, color: C.green, label: 'Approved' },
      rejected: { bg: `${C.red}22`, color: C.red, label: 'Rejected' },
    };
    const s = map[status] || map.draft;
    return (
      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, background: s.bg, color: s.color, fontSize: 12, fontWeight: 600 }}>
        {s.label}
      </span>
    );
  }

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div style={{ padding: 28, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>Subcontractor Prequalification</h1>
          <p style={{ color: C.dim, fontSize: 13, margin: '4px 0 0' }}>Review and manage subcontractor prequalification submissions</p>
        </div>
        <button onClick={() => setShowInvite(true)} style={btnStyle(C.gold)}>
          + Send Prequal Invitation
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
        {([
          { label: 'Approved', count: counts.approved, color: C.green },
          { label: 'Under Review', count: counts.under_review, color: C.amber },
          { label: 'Pending', count: counts.pending, color: C.blue },
          { label: 'Rejected', count: counts.rejected, color: C.red },
        ] as const).map(k => (
          <div key={k.label} style={{ ...cardStyle, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: k.color }}>{k.count}</div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Submissions List */}
      {loading ? (
        <div style={{ textAlign: 'center', color: C.dim, padding: 40 }}>Loading submissions...</div>
      ) : subs.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 16, color: C.dim }}>No prequalification submissions yet</div>
          <div style={{ fontSize: 13, color: C.dim, marginTop: 8 }}>Send an invitation to get started</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {subs.map(sub => {
            const isExpanded = expandedId === sub.id;
            const refCount = Array.isArray(sub.references) ? sub.references.filter(r => r.company || r.contact_name).length : 0;
            const hasInsurance = !!(sub.gl_carrier || sub.wc_carrier);

            return (
              <div key={sub.id} style={cardStyle}>
                {/* Row Header */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', flexWrap: 'wrap' }}
                >
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{sub.company_name}</div>
                    <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
                      {sub.primary_trade || 'No trade specified'} &middot; {sub.contact_email}
                    </div>
                  </div>

                  <ScoreBadge score={sub.sage_score} />
                  <StatusBadge status={sub.status} />

                  <div style={{ fontSize: 12, color: C.dim, minWidth: 60, textAlign: 'center' }}>
                    EMR {sub.emr_current != null ? Number(sub.emr_current).toFixed(2) : '--'}
                  </div>
                  <div style={{ fontSize: 12, color: hasInsurance ? C.green : C.dim, minWidth: 60, textAlign: 'center' }}>
                    {hasInsurance ? 'Insured' : 'No Ins.'}
                  </div>
                  <div style={{ fontSize: 12, color: C.dim, minWidth: 50, textAlign: 'center' }}>
                    {refCount} ref{refCount !== 1 ? 's' : ''}
                  </div>

                  <svg width="16" height="16" viewBox="0 0 16 16" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <path d="M4 6l4 4 4-4" stroke={C.dim} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
                      <DetailItem label="Contact" value={`${sub.contact_name} (${sub.contact_email})`} />
                      <DetailItem label="Trade" value={sub.primary_trade} />
                      <DetailItem label="EMR (Current)" value={sub.emr_current != null ? Number(sub.emr_current).toFixed(2) : null} />
                      <DetailItem label="Annual Revenue" value={sub.annual_revenue ? `$${Number(sub.annual_revenue).toLocaleString()}` : null} />
                      <DetailItem label="Bonding Limit" value={sub.bonding_limit ? `$${Number(sub.bonding_limit).toLocaleString()}` : null} />
                      <DetailItem label="GL Carrier" value={sub.gl_carrier} />
                      <DetailItem label="WC Carrier" value={sub.wc_carrier} />
                      <DetailItem label="References" value={`${refCount} provided`} />
                      <DetailItem label="Submitted" value={sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : 'Not yet'} />
                      <DetailItem label="Portal Link" value={`/prequal/${sub.portal_token}`} />
                    </div>

                    {/* AI Analysis Results */}
                    {sub.sage_analysis && (
                      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.gold, marginBottom: 10 }}>AI Analysis</div>
                        {sub.sage_analysis.strengths && sub.sage_analysis.strengths.length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: C.green, marginBottom: 4 }}>Strengths</div>
                            {sub.sage_analysis.strengths.map((s, i) => (
                              <div key={i} style={{ fontSize: 13, color: C.text, paddingLeft: 12, marginBottom: 2 }}>- {s}</div>
                            ))}
                          </div>
                        )}
                        {sub.sage_analysis.concerns && sub.sage_analysis.concerns.length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: C.amber, marginBottom: 4 }}>Concerns</div>
                            {sub.sage_analysis.concerns.map((c, i) => (
                              <div key={i} style={{ fontSize: 13, color: C.text, paddingLeft: 12, marginBottom: 2 }}>- {c}</div>
                            ))}
                          </div>
                        )}
                        {sub.sage_analysis.recommendation && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: C.blue, marginBottom: 4 }}>Recommendation</div>
                            <div style={{ fontSize: 13, color: C.text, paddingLeft: 12 }}>{sub.sage_analysis.recommendation}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Analyze Log (SSE) */}
                    {analyzingId === sub.id && analyzeLog.length > 0 && (
                      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, marginBottom: 16, fontFamily: 'monospace', fontSize: 12 }}>
                        {analyzeLog.map((line, i) => (
                          <div key={i} style={{ color: line.includes('[error]') ? C.red : C.dim, marginBottom: 2 }}>{line}</div>
                        ))}
                      </div>
                    )}

                    {/* Reviewer Notes */}
                    {sub.reviewer_notes && (
                      <div style={{ fontSize: 13, color: C.dim, marginBottom: 12, fontStyle: 'italic' }}>
                        Reviewer notes: {sub.reviewer_notes}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {(sub.status === 'submitted' || sub.status === 'under_review') && (
                        <>
                          <button
                            onClick={() => runAnalysis(sub.id)}
                            disabled={analyzingId === sub.id}
                            style={btnStyle(C.blue, analyzingId === sub.id)}
                          >
                            {analyzingId === sub.id ? 'Analyzing...' : 'Analyze'}
                          </button>
                          <button onClick={() => setReviewModal({ id: sub.id, action: 'approved' })} style={btnStyle(C.green)}>
                            Approve
                          </button>
                          <button onClick={() => setReviewModal({ id: sub.id, action: 'rejected' })} style={btnStyle(C.red)}>
                            Reject
                          </button>
                        </>
                      )}
                      {sub.status === 'draft' && (
                        <div style={{ fontSize: 12, color: C.dim }}>Awaiting submission from subcontractor</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Invitation Modal ──────────────────────────────────────── */}
      {showInvite && (
        <div style={modalOverlay} onClick={() => setShowInvite(false)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: C.text, margin: '0 0 20px' }}>Send Prequal Invitation</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, color: C.dim, marginBottom: 6 }}>Company Name *</label>
              <input value={invCompany} onChange={e => setInvCompany(e.target.value)} style={inputStyle} placeholder="Company name" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, color: C.dim, marginBottom: 6 }}>Email Address *</label>
              <input type="email" value={invEmail} onChange={e => setInvEmail(e.target.value)} style={inputStyle} placeholder="email@company.com" />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: C.dim, marginBottom: 6 }}>Message (optional)</label>
              <textarea value={invMessage} onChange={e => setInvMessage(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Optional message to include..." />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowInvite(false)} style={{ ...btnStyle(C.border), color: C.text }}>Cancel</button>
              <button onClick={sendInvitation} disabled={invSending || !invEmail.trim() || !invCompany.trim()} style={btnStyle(C.gold, invSending || !invEmail.trim() || !invCompany.trim())}>
                {invSending ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Review Modal ──────────────────────────────────────────── */}
      {reviewModal && (
        <div style={modalOverlay} onClick={() => setReviewModal(null)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: reviewModal.action === 'approved' ? C.green : C.red, margin: '0 0 20px' }}>
              {reviewModal.action === 'approved' ? 'Approve' : 'Reject'} Submission
            </h3>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: C.dim, marginBottom: 6 }}>Notes</label>
              <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Add review notes..." />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setReviewModal(null)} style={{ ...btnStyle(C.border), color: C.text }}>Cancel</button>
              <button onClick={submitReview} disabled={reviewSaving} style={btnStyle(reviewModal.action === 'approved' ? C.green : C.red, reviewSaving)}>
                {reviewSaving ? 'Saving...' : reviewModal.action === 'approved' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Detail Item ──────────────────────────────────────────────────── */
function DetailItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#8B9DB8', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#F0F4FF' }}>{value || '--'}</div>
    </div>
  );
}
