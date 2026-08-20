'use client';
/**
 * SendDocumentButton
 * ------------------
 * Reusable "Email this document" button + modal. Calls
 * POST /api/email/send-document with the provided HTML content.
 */
import React, { useState } from 'react';

const GOLD = '#C8960F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const BORDER = '#1E3A5F';
const RAISED = '#0D1D2E';
const DARK = '#0d1117';
const GREEN = '#22C55E';
const RED = '#EF4444';

export interface SendDocumentButtonProps {
  docType: string;
  sourceId: string;
  projectId?: string;
  sourceType?: string;
  defaultTo?: string;
  subject: string;
  htmlContent: string;
  label?: string;
  style?: React.CSSProperties;
  onSent?: (emailId: string | null) => void;
}

export default function SendDocumentButton(props: SendDocumentButtonProps) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(props.defaultTo || '');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!to.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await fetch('/api/email/send-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to.trim(),
          subject: props.subject,
          docType: props.docType,
          sourceType: props.sourceType,
          sourceId: props.sourceId,
          projectId: props.projectId,
          htmlContent: props.htmlContent,
          message: message.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok || j.success === false) {
        setError(j?.error || `Send failed (${r.status})`);
        return;
      }
      props.onSent?.(j.emailId ?? null);
      setOpen(false);
      setMessage('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!props.htmlContent) {
            setError('Nothing to send yet — generate the document first.');
            setOpen(true);
            return;
          }
          setError(null);
          setOpen(true);
        }}
        disabled={!props.sourceId}
        style={{
          padding: '8px 14px',
          background: 'rgba(200,150,15,0.12)',
          border: `1px solid rgba(200,150,15,0.35)`,
          borderRadius: 8,
          color: GOLD,
          fontSize: 12,
          fontWeight: 700,
          cursor: props.sourceId ? 'pointer' : 'not-allowed',
          opacity: props.sourceId ? 1 : 0.5,
          ...props.style,
        }}
      >
        ✉ {props.label || 'Email Document'}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 9500,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onMouseDown={e => { if (e.target === e.currentTarget && !sending) setOpen(false); }}
        >
          <div
            style={{
              width: '100%', maxWidth: 520,
              background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden',
            }}
          >
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, flex: 1 }}>Send {props.label || 'Document'}</div>
              <button
                onClick={() => !sending && setOpen(false)}
                aria-label="Close"
                style={{ background: 'transparent', border: 'none', color: DIM, fontSize: 22, lineHeight: 1, cursor: sending ? 'not-allowed' : 'pointer' }}
              >×</button>
            </div>

            <div style={{ padding: 18 }}>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
                  Recipient Email
                </div>
                <input
                  type="email"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  placeholder="name@company.com"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8,
                    padding: '10px 12px', fontSize: 14, outline: 'none',
                  }}
                />
              </label>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Subject</div>
                <div style={{
                  background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8,
                  padding: '10px 12px', fontSize: 13, color: TEXT,
                }}>
                  {props.subject}
                </div>
              </div>

              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: DIM, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Message (optional)</div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={3}
                  placeholder="Add a short note to the recipient…"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: DARK, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8,
                    padding: '10px 12px', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                  }}
                />
              </label>

              {error && (
                <div style={{ color: RED, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{error}</div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => !sending && setOpen(false)}
                  disabled={sending}
                  style={{
                    background: 'transparent', border: `1px solid ${BORDER}`, color: DIM,
                    fontSize: 12, fontWeight: 700, padding: '9px 14px', borderRadius: 8,
                    cursor: sending ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending || !to.trim() || !props.htmlContent}
                  style={{
                    background: sending || !to.trim() || !props.htmlContent ? 'rgba(34,197,94,.4)' : GREEN,
                    color: '#0d1117',
                    fontSize: 13, fontWeight: 800, padding: '10px 18px', borderRadius: 8,
                    border: 'none', cursor: sending || !to.trim() || !props.htmlContent ? 'not-allowed' : 'pointer',
                  }}
                >
                  {sending ? 'Sending…' : 'Send →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
