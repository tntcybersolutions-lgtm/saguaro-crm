'use client';
/**
 * ConfirmDialog — "Are you sure?" dialog before destructive actions.
 * Used for: delete, reject, cancel operations.
 */
import React from 'react';
import { Warning, Trash } from '@phosphor-icons/react';
import { colors, font, radius, shadow, z } from '../../lib/design-tokens';

interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  loading?: boolean;
}

export default function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  if (!open) return null;

  const isDanger = variant === 'danger';
  const accentColor = isDanger ? colors.red : '#D97706';
  const accentBg = isDanger ? '#FEF2F2' : '#FFFBEB';

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      style={{
        position: 'fixed', inset: 0, zIndex: z.modal,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      {/* Backdrop */}
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(2px)' }} />

      {/* Dialog */}
      <div style={{
        position: 'relative', width: '100%', maxWidth: 420,
        background: colors.white, border: `1px solid ${colors.border}`,
        borderRadius: 14, boxShadow: shadow.xl,
        animation: 'confirmIn .2s ease', overflow: 'hidden',
      }}>
        <div style={{ padding: 24, textAlign: 'center' }}>
          {/* Icon */}
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: accentBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            {isDanger ? <Trash size={28} weight="duotone" color={accentColor} /> : <Warning size={28} weight="duotone" color={accentColor} />}
          </div>

          <h3 id="confirm-title" style={{ margin: '0 0 8px', fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: colors.text }}>
            {title}
          </h3>
          <p id="confirm-message" style={{ margin: '0 0 24px', fontSize: font.size.md, color: colors.textMuted, lineHeight: 1.6 }}>
            {message}
          </p>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={onCancel}
              disabled={loading}
              style={{
                padding: '10px 24px', background: colors.white,
                border: `1px solid ${colors.border}`, borderRadius: radius.lg,
                color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold,
                cursor: 'pointer', minWidth: 100,
              }}
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              style={{
                padding: '10px 24px', background: accentColor,
                border: 'none', borderRadius: radius.lg,
                color: '#ffffff', fontSize: font.size.md, fontWeight: font.weight.bold,
                cursor: loading ? 'not-allowed' : 'pointer', minWidth: 100,
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Processing...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes confirmIn { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );
}
