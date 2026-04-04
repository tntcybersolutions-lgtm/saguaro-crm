'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';

const GOLD = '#C8960F';
const DARK = '#F8F9FB';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const DIM = '#6B7280';
const TEXT = '#e8edf8';
const GREEN = '#3dd68c';
const RED = '#EF4444';

interface Signer {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
}

interface SignatureRecord {
  id: string;
  signer_name: string;
  signer_email: string;
  signer_company: string;
  signer_role: string;
  status: 'pending' | 'viewed' | 'signed';
  sent_at: string;
  signed_at: string | null;
}

interface ESignatureFlowProps {
  projectId: string;
  docType: 'g702' | 'lien_waiver' | 'subcontract' | 'change_order' | 'ntp';
  docTitle: string;
  pdfUrl: string;
  onComplete?: () => void;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
      {children}
    </label>
  );
}

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: '100%', boxSizing: 'border-box' as const, padding: '8px 12px',
    background: DARK, border: `1px solid ${BORDER}`, borderRadius: 7,
    color: TEXT, fontSize: 13, outline: 'none', ...extra,
  };
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: 'rgba(212,160,23,.12)', color: GOLD, label: 'Pending' },
    viewed: { bg: 'rgba(59,130,246,.12)', color: '#3b82f6', label: 'Viewed' },
    signed: { bg: 'rgba(61,214,140,.12)', color: GREEN, label: 'Signed' },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

export default function ESignatureFlow({ projectId, docType, docTitle, pdfUrl, onComplete }: ESignatureFlowProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [signers, setSigners] = useState<Signer[]>([{ id: uid(), name: '', email: '', company: '', role: '' }]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [signatures, setSignatures] = useState<SignatureRecord[]>([]);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addSigner = () => {
    setSigners(prev => [...prev, { id: uid(), name: '', email: '', company: '', role: '' }]);
  };

  const removeSigner = (id: string) => {
    if (signers.length <= 1) return;
    setSigners(prev => prev.filter(s => s.id !== id));
  };

  const updateSigner = (id: string, field: keyof Signer, value: string) => {
    setSigners(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const canProceedStep1 = signers.every(s => s.name.trim() && s.email.trim());

  const handleSend = async () => {
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/documents/sign/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          doc_type: docType,
          doc_title: docTitle,
          pdf_url: pdfUrl,
          signers: signers.map(s => ({ name: s.name.trim(), email: s.email.trim(), company: s.company.trim(), role: s.role.trim() })),
          message: message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setSignatures(data.signatures || []);
      setSent(true);
      startPolling();
    } catch (e: any) {
      setError(e.message || 'Failed to send for signature');
    } finally {
      setSending(false);
    }
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/sign/status?project_id=${projectId}&doc_type=${docType}`);
      const data = await res.json();
      if (data.signatures) setSignatures(data.signatures);
      const allSigned = data.signatures?.length > 0 && data.signatures.every((s: SignatureRecord) => s.status === 'signed');
      if (allSigned && onComplete) onComplete();
    } catch { /* silent */ }
  }, [projectId, docType, onComplete]);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchStatus, 30000);
  }, [fetchStatus]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleResend = async (signatureId: string) => {
    try {
      await fetch('/api/documents/sign/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resend_signature_id: signatureId }),
      });
      fetchStatus();
    } catch { /* silent */ }
  };

  const signedCount = signatures.filter(s => s.status === 'signed').length;
  const totalCount = signatures.length;
  const progressPct = totalCount > 0 ? (signedCount / totalCount) * 100 : 0;

  // ─── Step 1: Add Signers ─────────────────────────────────────────────
  const renderStep1 = () => (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 14, color: TEXT, fontWeight: 600 }}>Add Signers</p>
      {signers.map((signer, idx) => (
        <div key={signer.id} style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 10, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>Signer {idx + 1}</span>
            {signers.length > 1 && (
              <button type="button" onClick={() => removeSigner(signer.id)} style={{ background: 'rgba(239,68,68,.1)', border: `1px solid rgba(239,68,68,.3)`, borderRadius: 6, padding: '4px 10px', color: RED, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                Remove
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>Name *</Label>
              <input value={signer.name} onChange={e => updateSigner(signer.id, 'name', e.target.value)} placeholder="John Smith" style={inputStyle()} />
            </div>
            <div>
              <Label>Email *</Label>
              <input type="email" value={signer.email} onChange={e => updateSigner(signer.id, 'email', e.target.value)} placeholder="john@example.com" style={inputStyle()} />
            </div>
            <div>
              <Label>Company</Label>
              <input value={signer.company} onChange={e => updateSigner(signer.id, 'company', e.target.value)} placeholder="ABC Construction" style={inputStyle()} />
            </div>
            <div>
              <Label>Role</Label>
              <input value={signer.role} onChange={e => updateSigner(signer.id, 'role', e.target.value)} placeholder="Project Manager" style={inputStyle()} />
            </div>
          </div>
        </div>
      ))}
      <button type="button" onClick={addSigner} style={{ width: '100%', background: 'transparent', border: `1px dashed ${BORDER}`, borderRadius: 8, padding: '10px', color: DIM, fontSize: 13, cursor: 'pointer', marginBottom: 16 }}>
        + Add Another Signer
      </button>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" disabled={!canProceedStep1} onClick={() => setStep(2)} style={{ background: canProceedStep1 ? GOLD : BORDER, border: 'none', borderRadius: 8, padding: '10px 28px', color: canProceedStep1 ? '#000' : DIM, fontSize: 13, fontWeight: 800, cursor: canProceedStep1 ? 'pointer' : 'not-allowed' }}>
          Next: Add Message
        </button>
      </div>
    </div>
  );

  // ─── Step 2: Add Message ─────────────────────────────────────────────
  const renderStep2 = () => (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 14, color: TEXT, fontWeight: 600 }}>Add Message (Optional)</p>
      <Label>Message to signers</Label>
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        rows={4}
        placeholder="Please review and sign this document at your earliest convenience."
        style={inputStyle({ resize: 'vertical' as any, minHeight: 80 })}
      />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" onClick={() => setStep(1)} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 20px', color: DIM, fontSize: 13, cursor: 'pointer' }}>
          Back
        </button>
        <button type="button" onClick={() => setStep(3)} style={{ background: GOLD, border: 'none', borderRadius: 8, padding: '10px 28px', color: '#000', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
          Next: Review & Send
        </button>
      </div>
    </div>
  );

  // ─── Step 3: Review & Send ───────────────────────────────────────────
  const renderStep3 = () => (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 14, color: TEXT, fontWeight: 600 }}>Review & Send</p>
      <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
        <p style={{ margin: '0 0 6px', fontSize: 12, color: DIM }}>Document</p>
        <p style={{ margin: 0, fontSize: 14, color: TEXT, fontWeight: 600 }}>{docTitle}</p>
      </div>
      <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: DIM }}>Sending to {signers.length} signer{signers.length > 1 ? 's' : ''}</p>
        {signers.map(s => (
          <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: TEXT }}>{s.name}</span>
            <span style={{ fontSize: 12, color: DIM }}>{s.email}</span>
          </div>
        ))}
      </div>
      {message.trim() && (
        <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <p style={{ margin: '0 0 6px', fontSize: 12, color: DIM }}>Message</p>
          <p style={{ margin: 0, fontSize: 13, color: TEXT, whiteSpace: 'pre-wrap' }}>{message}</p>
        </div>
      )}
      {error && <p style={{ margin: '0 0 10px', fontSize: 13, color: RED }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => setStep(2)} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 20px', color: DIM, fontSize: 13, cursor: 'pointer' }}>
          Back
        </button>
        <button type="button" disabled={sending} onClick={handleSend} style={{ background: GOLD, border: 'none', borderRadius: 8, padding: '10px 28px', color: '#000', fontSize: 13, fontWeight: 800, cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.6 : 1 }}>
          {sending ? 'Sending...' : 'Send for Signature'}
        </button>
      </div>
    </div>
  );

  // ─── Tracking Dashboard (after send) ─────────────────────────────────
  const renderDashboard = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 14, color: TEXT, fontWeight: 600 }}>
          Sent to {totalCount} signer{totalCount > 1 ? 's' : ''}
        </p>
        <button type="button" onClick={fetchStatus} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '5px 12px', color: DIM, fontSize: 11, cursor: 'pointer' }}>
          Refresh
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: DIM }}>{signedCount} of {totalCount} signed</span>
          <span style={{ fontSize: 12, color: GOLD, fontWeight: 700 }}>{Math.round(progressPct)}%</span>
        </div>
        <div style={{ height: 6, background: DARK, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progressPct}%`, background: GOLD, borderRadius: 3, transition: 'width .3s ease' }} />
        </div>
      </div>

      {/* Signer list */}
      {signatures.map(sig => (
        <div key={sig.id} style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <p style={{ margin: 0, fontSize: 13, color: TEXT, fontWeight: 600 }}>{sig.signer_name}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: DIM }}>{sig.signer_email}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusBadge status={sig.status} />
            <div style={{ fontSize: 11, color: DIM, textAlign: 'right' as const }}>
              <div>Sent {new Date(sig.sent_at).toLocaleDateString()}</div>
              {sig.signed_at && <div style={{ color: GREEN }}>Signed {new Date(sig.signed_at).toLocaleDateString()}</div>}
            </div>
            {sig.status !== 'signed' && (
              <button type="button" onClick={() => handleResend(sig.id)} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', color: DIM, fontSize: 11, cursor: 'pointer' }}>
                Resend
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  // ─── Stepper Header ──────────────────────────────────────────────────
  const steps = ['Add Signers', 'Add Message', 'Send'];
  const renderStepper = () => (
    <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
      {steps.map((label, idx) => {
        const stepNum = (idx + 1) as 1 | 2 | 3;
        const active = step === stepNum;
        const done = sent || step > stepNum;
        return (
          <div key={label} style={{ flex: 1, textAlign: 'center' as const }}>
            <div style={{ height: 4, borderRadius: 2, background: done ? GOLD : active ? GOLD : BORDER, marginBottom: 6, opacity: active ? 1 : done ? 0.5 : 0.2 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: active || done ? GOLD : DIM }}>{label}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>
          E-Signature — {docTitle}
        </h3>
        {sent && <span style={{ fontSize: 12, color: GREEN, fontWeight: 700 }}>Sent</span>}
      </div>
      {!sent && renderStepper()}
      {sent ? renderDashboard() : step === 1 ? renderStep1() : step === 2 ? renderStep2() : renderStep3()}
    </div>
  );
}
