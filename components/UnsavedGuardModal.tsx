'use client';
/**
 * UnsavedGuardModal — the house "Unsaved changes" confirm: Discard · Keep
 * editing · Save and exit. Rendered by every page using useUnsavedGuard
 * (lib/useUnsavedGuard.ts) and by the app shell's automatic gate
 * (components/AutoUnsavedGuard.tsx), so the words are the same everywhere.
 * Sits above every page modal and sheet (.k-overlay is 10000, the phone
 * select sheet 10200). Buttons are 44px tall.
 */
import React from 'react';
import { Warning } from '@phosphor-icons/react';
import { colors, font } from '@/lib/design-tokens';
import { goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import type { UnsavedGuardApi } from '@/lib/useUnsavedGuard';

export default function UnsavedGuardModal({ guard }: { guard: UnsavedGuardApi }) {
  if (!guard.confirmOpen) return null;
  const hasDraft = guard.hasDraft;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10300, background: 'rgba(0,0,0,.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) guard.stay(); }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Unsaved changes"
        style={{
          background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14,
          width: '100%', maxWidth: 440, boxShadow: '0 30px 80px rgba(0,0,0,.6)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 22px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            width: 38, height: 38, borderRadius: 11,
            background: 'var(--brand-primary-12, var(--brand-primary-12))',
            border: '1px solid var(--brand-primary-25, var(--brand-primary-25))',
          }}>
            <Warning size={19} weight="duotone" color={colors.gold} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: font.size.xl, fontWeight: font.weight.black, color: colors.text }}>
              Unsaved changes
            </div>
            <div style={{ fontSize: font.size.md, color: colors.textMuted, lineHeight: 1.6, marginTop: 6 }}>
              You changed this and haven&apos;t saved it. Save before you leave, or discard the changes.
              {hasDraft && ' A draft copy is kept on this device either way.'}
            </div>
          </div>
        </div>
        <div style={{ padding: '14px 22px 18px', display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={guard.discard}
            style={{
              ...ghostButtonStyle, minHeight: 44, padding: '10px 16px', fontSize: 14,
              background: 'rgba(255,59,48,0.10)', border: '1px solid rgba(255,59,48,0.35)', color: colors.red,
            }}
          >
            Discard
          </button>
          <button type="button" onClick={guard.stay} style={{ ...ghostButtonStyle, minHeight: 44, padding: '10px 16px', fontSize: 14 }}>
            Keep editing
          </button>
          {guard.canSave ? (
            <button
              type="button"
              onClick={guard.saveAndLeave}
              disabled={guard.saving}
              style={{
                ...goldButtonStyle, minHeight: 44, padding: '10px 18px', fontSize: 14,
                opacity: guard.saving ? 0.6 : 1, cursor: guard.saving ? 'not-allowed' : 'pointer',
              }}
            >
              {guard.saving ? 'Saving…' : 'Save and exit'}
            </button>
          ) : hasDraft ? (
            <button
              type="button"
              onClick={guard.keepDraftAndLeave}
              style={{ ...goldButtonStyle, minHeight: 44, padding: '10px 18px', fontSize: 14 }}
            >
              Keep draft and exit
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
