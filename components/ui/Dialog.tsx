'use client';
/**
 * Dialog — Saguaro modal/dialog component.
 * Accessible: focus trap, Escape to close, backdrop click, ARIA roles.
 */
import React, { useEffect, useRef } from 'react';
import { colors, font, radius, shadow, z } from '../../lib/design-tokens';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
}

export default function Dialog({ open, onClose, title, description, children, footer, maxWidth = 560 }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Focus trap — focus the dialog when opened
  useEffect(() => {
    if (open && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [open]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      aria-describedby={description ? 'dialog-desc' : undefined}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: z.modal,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,.72)',
          backdropFilter: 'blur(4px)',
        }}
        aria-hidden="true"
      />

      {/* Content */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth,
          maxHeight: '85vh',
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 14,
          boxShadow: shadow.xl,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          outline: 'none',
          animation: 'dialogIn .2s ease',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexShrink: 0,
        }}>
          <div>
            <h2 id="dialog-title" style={{
              margin: 0,
              fontSize: font.size.xl,
              fontWeight: font.weight.black,
              color: colors.text,
            }}>
              {title}
            </h2>
            {description && (
              <p id="dialog-desc" style={{
                margin: '4px 0 0',
                fontSize: font.size.sm,
                color: colors.textMuted,
              }}>
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: 'none',
              border: 'none',
              color: colors.textMuted,
              cursor: 'pointer',
              fontSize: 22,
              lineHeight: 1,
              padding: '2px 6px',
              borderRadius: radius.sm,
              transition: 'color .15s, background .15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = colors.text; e.currentTarget.style.background = 'rgba(255,255,255,.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = colors.textMuted; e.currentTarget.style.background = 'transparent'; }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding: '12px 20px',
            borderTop: `1px solid ${colors.border}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
            flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes dialogIn {
          from { opacity: 0; transform: scale(.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
