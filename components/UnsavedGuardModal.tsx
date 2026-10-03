'use client';
/**
 * UnsavedGuardModal — the house Save / Discard / Stay confirm rendered by any
 * page using useUnsavedGuard (lib/useUnsavedGuard.ts). Machined-kit styling:
 * design tokens + the premium gold/ghost button language, same overlay anatomy
 * as the app shell's modals. Sits above page-level modals (they use z 500).
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
        position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,.72)',
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
              You Have Unsaved Changes
            </div>
            <div style={{ fontSize: font.size.md, color: colors.textMuted, lineHeight: 1.6, marginTop: 6 }}>
              Leaving now will lose the work on this form.
              {hasDraft && ' A draft copy is kept on this device either way — but saving is the only thing that makes it real.'}
            </div>
          </div>
        </div>
        <div style={{ padding: '14px 22px 18px', display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={guard.discard}
            style={{
              ...ghostButtonStyle, padding: '10px 16px', fontSize: 13,
              background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: colors.red,
            }}
          >
            Discard &amp; Leave
          </button>
          <button type="button" onClick={guard.stay} style={{ ...ghostButtonStyle, padding: '10px 16px', fontSize: 13 }}>
            Stay
          </button>
          {guard.canSave ? (
            <button
              type="button"
              onClick={guard.saveAndLeave}
              disabled={guard.saving}
              style={{
                ...goldButtonStyle, padding: '10px 18px', fontSize: 13,
                opacity: guard.saving ? 0.6 : 1, cursor: guard.saving ? 'not-allowed' : 'pointer',
              }}
            >
              {guard.saving ? 'Saving…' : 'Save & Leave'}
            </button>
          ) : hasDraft ? (
            <button
              type="button"
              onClick={guard.keepDraftAndLeave}
              style={{ ...goldButtonStyle, padding: '10px 18px', fontSize: 13 }}
            >
              Keep Draft &amp; Leave
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
