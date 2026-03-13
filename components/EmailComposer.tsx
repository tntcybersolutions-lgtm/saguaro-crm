'use client';
/**
 * Saguaro — Reusable Email Composer
 * Modal overlay for composing and sending emails from any field module.
 * Dark-themed, offline-capable, touch-friendly.
 */
import React, { useState, useEffect } from 'react';
import { enqueue } from '@/lib/field-db';

const GOLD = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const GREEN = '#22C55E';
const RED = '#EF4444';
const BLUE = '#3B82F6';

interface EmailComposerProps {
  projectId: string;
  onClose: () => void;
  onSent: () => void;
  defaultTo?: string;
  defaultCc?: string;
  defaultSubject?: string;
  defaultBody?: string;
  module?: string;
  itemId?: string;
  itemTitle?: string;
}

type Status = 'composing' | 'sending' | 'sent' | 'error';

export default function EmailComposer({
  projectId,
  onClose,
  onSent,
  defaultTo = '',
  defaultCc = '',
  defaultSubject = '',
  defaultBody = '',
  module = '',
  itemId = '',
  itemTitle = '',
}: EmailComposerProps) {
  const [to, setTo] = useState(defaultTo);
  const [toInput, setToInput] = useState('');
  const [cc, setCc] = useState(defaultCc);
  const [showCc, setShowCc] = useState(!!defaultCc);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [status, setStatus] = useState<Status>('composing');
  const [errorMsg, setErrorMsg] = useState('');
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const addToRecipient = () => {
    const email = toInput.trim();
    if (!email) return;
    if (to) {
      setTo(to + ', ' + email);
    } else {
      setTo(email);
    }
    setToInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addToRecipient();
    }
  };

  const handleSend = async () => {
    if (!to.trim()) {
      setErrorMsg('At least one recipient is required.');
      return;
    }
    if (!subject.trim()) {
      setErrorMsg('Subject is required.');
      return;
    }

    setStatus('sending');
    setErrorMsg('');

    const payload = {
      to: to.split(',').map((e: string) => e.trim()).filter(Boolean),
      cc: cc ? cc.split(',').map((e: string) => e.trim()).filter(Boolean) : [],
      subject: subject.trim(),
      body: body.trim(),
      type: 'email_record',
      reference_links: module && itemId ? [{ module, item_id: itemId, title: itemTitle }] : [],
    };

    const url = `/api/projects/${projectId}/correspondence`;

    try {
      if (!online) throw new Error('offline');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('sent');
      setTimeout(() => onSent(), 1500);
    } catch {
      try {
        await enqueue({
          url,
          method: 'POST',
          body: JSON.stringify(payload),
          contentType: 'application/json',
          isFormData: false,
        });
        setStatus('sent');
        setTimeout(() => onSent(), 1500);
      } catch {
        setStatus('error');
        setErrorMsg('Failed to queue email. Please try again.');
      }
    }
  };

  // Sent state
  if (status === 'sent') {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={{ ...modalStyle, textAlign: 'center', padding: '40px 24px' }} onClick={(e) => e.stopPropagation()}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,.15)',
            border: `2px solid rgba(34,197,94,.3)`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={32} height={32}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: GREEN }}>Email Sent</h3>
          <p style={{ margin: 0, fontSize: 13, color: DIM }}>
            {online ? 'Email sent successfully.' : 'Email queued — will send when online.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: TEXT }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20} style={{ verticalAlign: 'middle', marginRight: 8 }}>
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Email from App
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 22, padding: '4px 8px', lineHeight: 1 }}>
            &times;
          </button>
        </div>

        {!online && (
          <div style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#F59E0B', fontWeight: 600, textAlign: 'center' }}>
            Offline — email will be queued and sent when connected
          </div>
        )}

        {/* To field */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>To</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="email@example.com"
              style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
            />
            <button onClick={addToRecipient} style={{
              background: 'rgba(59,130,246,.12)', border: `1px solid rgba(59,130,246,.3)`,
              borderRadius: 8, padding: '0 14px', color: BLUE, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', flexShrink: 0,
            }}>
              Add
            </button>
          </div>
          {to && (
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {to.split(',').map((email, i) => email.trim() && (
                <span key={i} style={{
                  background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.25)',
                  borderRadius: 6, padding: '3px 8px', fontSize: 12, color: GOLD, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  {email.trim()}
                  <button onClick={() => {
                    const emails = to.split(',').map(e => e.trim()).filter(Boolean);
                    emails.splice(i, 1);
                    setTo(emails.join(', '));
                  }} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* CC toggle */}
        {!showCc ? (
          <button onClick={() => setShowCc(true)} style={{
            background: 'none', border: 'none', color: BLUE, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', padding: 0, marginBottom: 10, display: 'block',
          }}>
            + Add CC
          </button>
        ) : (
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>CC</label>
            <input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="Comma-separated emails"
              style={inputStyle}
            />
          </div>
        )}

        {/* Subject */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            style={inputStyle}
          />
        </div>

        {/* Body */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Email body..."
            rows={8}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        {/* Attachment indicator */}
        {module && itemId && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
            background: 'rgba(59,130,246,.06)', border: `1px solid rgba(59,130,246,.2)`,
            borderRadius: 8, marginBottom: 14, fontSize: 12, color: BLUE,
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
            Linked: {module.toUpperCase()} — {itemTitle || itemId}
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div style={{
            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)',
            borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13,
            color: RED, fontWeight: 600,
          }}>
            {errorMsg}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, background: 'transparent', border: `1px solid ${BORDER}`,
            borderRadius: 12, padding: '14px', color: DIM, fontSize: 15,
            cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={status === 'sending'}
            style={{
              flex: 2, background: status === 'sending' ? '#1E3A5F' : GOLD,
              border: 'none', borderRadius: 12, padding: '14px',
              color: status === 'sending' ? DIM : '#000', fontSize: 15,
              fontWeight: 800, cursor: status === 'sending' ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {status === 'sending' ? (
              'Sending...'
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
                  <line x1={22} y1={2} x2={11} y2={13} />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                Send Email
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,.7)',
  backdropFilter: 'blur(4px)',
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const modalStyle: React.CSSProperties = {
  background: '#0A1929',
  border: `1px solid ${BORDER}`,
  borderRadius: 18,
  padding: '20px',
  width: '100%',
  maxWidth: 520,
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,.6)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: DIM,
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: '#07101C',
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  color: TEXT,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};
