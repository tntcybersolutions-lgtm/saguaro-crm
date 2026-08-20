'use client';
/**
 * DocumentPreviewModal
 * --------------------
 * Renders generated HTML (G702, WH-347, contracts, COs, milestone letters)
 * in a sandboxed iframe with a key-fields sidebar and Approve / Regenerate /
 * Print / Close actions.
 *
 * Approving saves the HTML as a new document_versions row via
 * POST /api/documents/version with { approved: true }.
 */
import React, { useEffect, useRef, useState } from 'react';
import SendDocumentButton from './SendDocumentButton';

const GOLD  = '#C8960F';
const TEXT  = '#F0F4FF';
const DIM   = '#8BAAC8';
const BORDER = '#1E3A5F';
const RAISED = '#0D1D2E';
const DARK   = '#0d1117';
const GREEN  = '#22C55E';
const RED    = '#EF4444';

export interface DocumentPreviewKeyField {
  label: string;
  value: string;
}

export interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApprove: (notes?: string) => Promise<void> | void;
  onRegenerate?: () => Promise<void> | void;
  htmlContent: string;
  title: string;
  keyFields?: DocumentPreviewKeyField[];
  docType: string;
  sourceId: string;
  sourceType?: string;
  projectId?: string;
  /** Optional email prefill for the Send action. */
  emailTo?: string;
  emailSubject?: string;
  emailLabel?: string;
}

export default function DocumentPreviewModal({
  isOpen,
  onClose,
  onApprove,
  onRegenerate,
  htmlContent,
  title,
  keyFields = [],
  docType,
  sourceId,
  sourceType,
  projectId,
  emailTo,
  emailSubject,
  emailLabel,
}: DocumentPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Esc to close (unless saving)
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, saving, onClose]);

  if (!isOpen) return null;

  const emptyFieldCount = keyFields.filter(f => !f.value || f.value.trim() === '').length;

  async function handleApprove() {
    if (saving) return;
    setErr(null);
    setSaving(true);
    try {
      // Persist version (best-effort) then call onApprove
      const inferredSourceType = sourceType || docType;
      const r = await fetch('/api/documents/version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: inferredSourceType,
          sourceId,
          projectId,
          docType,
          htmlContent,
          approved: true,
          notes: notes.trim() || null,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `Version save failed (${r.status})`);
      }
      await onApprove(notes.trim() || undefined);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    if (!onRegenerate || regenerating) return;
    setRegenerating(true);
    setErr(null);
    try { await onRegenerate(); } catch (e) {
      setErr(e instanceof Error ? e.message : 'Regenerate failed');
    } finally {
      setRegenerating(false);
    }
  }

  function handlePrint() {
    iframeRef.current?.contentWindow?.print();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onMouseDown={e => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 1200,
          height: 'calc(100vh - 40px)',
          background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 20px', borderBottom: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>{title}</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>
              Preview before saving · {docType}
              {emptyFieldCount > 0 && (
                <span style={{ color: RED, marginLeft: 8, fontWeight: 700 }}>
                  · {emptyFieldCount} empty field{emptyFieldCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handlePrint}
            style={{
              background: DARK, border: `1px solid ${BORDER}`, color: TEXT,
              fontSize: 12, fontWeight: 700, padding: '8px 14px',
              borderRadius: 8, cursor: 'pointer',
            }}
          >
            🖨️ Print
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            style={{
              background: 'transparent', border: 'none', color: DIM,
              fontSize: 24, lineHeight: 1, padding: '4px 8px', cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Key fields sidebar */}
          {keyFields.length > 0 && (
            <div
              style={{
                width: 260, flexShrink: 0, borderRight: `1px solid ${BORDER}`,
                background: DARK, padding: '16px 14px', overflowY: 'auto',
              }}
            >
              <div
                style={{
                  fontSize: 10, fontWeight: 800, color: GOLD,
                  textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10,
                }}
              >
                Key Fields
              </div>
              {keyFields.map((f, i) => {
                const empty = !f.value || f.value.trim() === '';
                return (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>
                      {f.label}
                    </div>
                    <div
                      style={{
                        fontSize: 13, fontWeight: 700,
                        color: empty ? RED : TEXT,
                        wordBreak: 'break-word',
                      }}
                    >
                      {empty ? '— missing —' : f.value}
                    </div>
                  </div>
                );
              })}
              <div style={{ height: 1, background: BORDER, margin: '14px 0' }} />
              <div style={{ fontSize: 10, fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }}>
                Approval Notes (optional)
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any reviewer notes…"
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 6,
                  color: TEXT, fontSize: 12, padding: '8px 10px', resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          )}

          {/* iframe preview */}
          <div style={{ flex: 1, background: '#ffffff', minWidth: 0, position: 'relative' }}>
            <iframe
              ref={iframeRef}
              title={`Preview: ${title}`}
              srcDoc={htmlContent}
              sandbox="allow-same-origin allow-scripts"
              style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
            />
          </div>
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: '12px 20px', borderTop: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            background: DARK,
          }}
        >
          {err && (
            <div style={{ color: RED, fontSize: 12, flex: 1, fontWeight: 600 }}>{err}</div>
          )}
          {!err && <div style={{ flex: 1 }} />}
          {onRegenerate && (
            <button
              onClick={handleRegenerate}
              disabled={regenerating || saving}
              style={{
                background: 'transparent', border: `1px solid ${BORDER}`, color: TEXT,
                fontSize: 12, fontWeight: 700, padding: '9px 14px', borderRadius: 8,
                cursor: regenerating || saving ? 'not-allowed' : 'pointer',
                opacity: regenerating || saving ? 0.55 : 1,
              }}
            >
              {regenerating ? 'Regenerating…' : '🔄 Regenerate'}
            </button>
          )}
          <SendDocumentButton
            docType={docType}
            sourceId={sourceId}
            sourceType={sourceType}
            projectId={projectId}
            defaultTo={emailTo}
            subject={emailSubject || title}
            htmlContent={htmlContent}
            label={emailLabel || 'Email'}
            style={{ padding: '9px 14px' }}
          />
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              background: 'transparent', border: `1px solid ${BORDER}`, color: DIM,
              fontSize: 12, fontWeight: 700, padding: '9px 14px', borderRadius: 8,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            Close
          </button>
          <button
            onClick={handleApprove}
            disabled={saving}
            style={{
              background: saving ? 'rgba(34,197,94,.4)' : GREEN, color: '#0d1117',
              fontSize: 13, fontWeight: 800, padding: '10px 18px', borderRadius: 8,
              border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : '✓ Approve & Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
