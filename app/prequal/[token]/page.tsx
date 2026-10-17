'use client';
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Check, Lock, Warning } from '@phosphor-icons/react';

const GOLD = 'var(--brand-primary)', DARK = 'var(--bg-base)', RAISED = 'var(--bg-surface)', BORDER = 'rgba(255,255,255,0.12)', DIM = 'var(--text-secondary)', TEXT = '#FFFFFF', GREEN = '#4ADE80', RED = '#F87171', FIELD = '#1c1c1e';

type Question = {
  id: string;
  label: string;
  type: 'text' | 'number' | 'yes_no' | 'rating' | 'file_upload' | 'multi_choice' | string;
  required?: boolean;
  options?: string[];
  category?: string;
  points?: number;
};
type Template = { id: string; name: string; description: string; questions: Question[] };
type InviteInfo = { subName: string; subEmail: string; status: string; companyName: string };

export default function PrequalPortal() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [answers, setAnswers] = useState<Record<string, any>>({});

  useEffect(() => {
    fetch('/api/prequalification/portal/' + token)
      .then(async r => {
        if (!r.ok) { setNotFound(true); return; }
        const d = await r.json();
        setInfo(d.invite || null);
        setTemplate(d.template || null);
        if (d.submitted) setSubmitted(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  const setAnswer = (id: string, v: any) => setAnswers(a => ({ ...a, [id]: v }));

  function flash(msg: string) { setFeedback(msg); setTimeout(() => setFeedback(''), 4500); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!template) return;
    // Client-side required check (server re-validates).
    const missing = template.questions.filter(q => q.required).filter(q => {
      const a = answers[q.id];
      return a === undefined || a === null || String(a).trim() === '';
    });
    if (missing.length > 0) { flash(`Please answer: ${missing.map(m => m.label).slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`); return; }

    // Document entries from file_upload questions (link/reference the sub provides).
    const documents = template.questions
      .filter(q => q.type === 'file_upload')
      .map(q => ({ name: q.label, uploaded: !!(answers[q.id] && String(answers[q.id]).trim()), note: answers[q.id] || '' }));

    setSaving(true);
    try {
      const res = await fetch('/api/prequalification/portal/' + token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, documents }),
      });
      const d = await res.json();
      if (res.ok && d.success) setSubmitted(true);
      else flash(d.error || 'Failed to submit. Please try again.');
    } catch {
      flash('Network error. Please try again.');
    }
    setSaving(false);
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 6 };
  const inputStyle: React.CSSProperties = { width: '100%', background: FIELD, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '10px 14px', color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  function renderQuestion(q: Question) {
    const v = answers[q.id] ?? '';
    switch (q.type) {
      case 'yes_no':
        return (
          <div style={{ display: 'flex', gap: 20 }}>
            {['yes', 'no'].map(opt => (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: TEXT, textTransform: 'capitalize' }}>
                <input type="radio" name={q.id} checked={v === opt} onChange={() => setAnswer(q.id, opt)} />
                {opt}
              </label>
            ))}
          </div>
        );
      case 'rating':
        return (
          <select value={v} onChange={e => setAnswer(q.id, e.target.value)} style={inputStyle}>
            <option value="">Select a rating…</option>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} / 5</option>)}
          </select>
        );
      case 'multi_choice':
        return (
          <select value={v} onChange={e => setAnswer(q.id, e.target.value)} style={inputStyle}>
            <option value="">Select…</option>
            {(q.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      case 'number':
        return <input type="number" value={v} onChange={e => setAnswer(q.id, e.target.value)} style={inputStyle} placeholder="Enter a number" />;
      case 'file_upload':
        return (
          <div>
            <input value={v} onChange={e => setAnswer(q.id, e.target.value)} style={inputStyle} placeholder="Paste a link to the document (Google Drive, Dropbox, etc.) or note how you'll provide it" />
            <div style={{ fontSize: 12, color: DIM, marginTop: 4 }}>Provide a shareable link, or describe how you will submit this document.</div>
          </div>
        );
      default:
        return <input value={v} onChange={e => setAnswer(q.id, e.target.value)} style={inputStyle} placeholder="Your answer" />;
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM, fontFamily: 'system-ui,sans-serif' }}>
      Loading…
    </div>
  );

  if (notFound || !info) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ textAlign: 'center', color: RED, padding: 24 }}>
        <div style={{ marginBottom: 16 }}><Warning size={48} weight="fill" /></div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Invalid or Expired Link</div>
        <div style={{ fontSize: 14, color: DIM, marginTop: 8 }}>This prequalification link is no longer valid. Please contact the general contractor who invited you.</div>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ textAlign: 'center', color: GREEN, padding: 24 }}>
        <div style={{ marginBottom: 16 }}><Check size={64} weight="bold" /></div>
        <div style={{ fontSize: 24, fontWeight: 800, color: TEXT }}>Prequalification Submitted</div>
        <div style={{ fontSize: 14, color: DIM, marginTop: 12, maxWidth: 420 }}>
          Thank you{info.subName ? `, ${info.subName}` : ''}. Your prequalification has been securely submitted to <strong style={{ color: TEXT }}>{info.companyName}</strong> for review. You will be contacted regarding the outcome.
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: DARK, fontFamily: 'system-ui,sans-serif', color: TEXT }}>
      <div style={{ background: 'rgba(20,20,22,.96)', borderBottom: `1px solid ${BORDER}`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Saguaro</span>
        <span style={{ fontSize: 12, color: DIM, marginLeft: 8 }}>Subcontractor Prequalification Portal</span>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '16px 20px', marginBottom: 28 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text-primary)', marginBottom: 4 }}>{template?.name || 'Prequalification Questionnaire'}</div>
          <div style={{ fontSize: 13, color: DIM, lineHeight: 1.6 }}>
            <strong style={{ color: TEXT }}>{info.companyName}</strong> has invited{info.subName ? <> <strong style={{ color: TEXT }}>{info.subName}</strong></> : ' you'} to complete this prequalification. All information is transmitted securely.
            {template?.description ? <><br />{template.description}</> : null}
          </div>
        </div>

        {!template || template.questions.length === 0 ? (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 28, textAlign: 'center', color: DIM }}>
            This prequalification form has no questions configured yet. Please contact {info.companyName}.
          </div>
        ) : (
          <form method="post" onSubmit={submit}>
            <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, fontWeight: 700, fontSize: 14 }}>Questionnaire</div>
              <div style={{ padding: 20 }}>
                {template.questions.map((q, i) => (
                  <div key={q.id || i} style={{ marginBottom: 20 }}>
                    <label style={labelStyle}>
                      {q.label}
                      {q.required ? <span style={{ color: RED, marginLeft: 6 }}>*</span> : null}
                      {q.category ? <span style={{ marginLeft: 8, fontSize: 12, color: DIM, fontWeight: 500 }}>({q.category})</span> : null}
                    </label>
                    {renderQuestion(q)}
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              style={{ width: '100%', padding: '14px', background: saving ? '#6E6E73' : `linear-gradient(135deg,${GOLD},var(--brand-primary-strong))`, border: 'none', borderRadius: 9, color: '#101722', fontWeight: 800, fontSize: 16, cursor: saving ? 'not-allowed' : 'pointer', letterSpacing: .5 }}
            >
              {saving ? 'Submitting…' : 'Submit Prequalification →'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: DIM }}>
              <Lock size={12} weight="fill" style={{ verticalAlign: 'middle' }} /> Your information is transmitted securely · Powered by Saguaro Control Systems
            </div>
          </form>
        )}
      </div>

      {feedback && <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 99999, padding: '12px 20px', borderRadius: '8px', background: 'rgba(248,113,113,0.95)', color: '#fff', fontWeight: 600, fontSize: '14px', maxWidth: '90%', textAlign: 'center' }}>{feedback}</div>}
    </div>
  );
}
