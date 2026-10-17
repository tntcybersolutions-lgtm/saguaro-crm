'use client';
/**
 * UnsavedGuardModal — the one leave prompt, everywhere:
 *
 *     Leave without saving?
 *     Your changes to this RFI haven't been saved. A draft is kept on this device.
 *                       [Keep editing]  [Discard changes]  [Save and leave]
 *
 * Rendered by every page using useUnsavedGuard (lib/useUnsavedGuard.ts) and by
 * the app shell's automatic gate (components/AutoUnsavedGuard.tsx), so the
 * words are the same everywhere. The draft sentence appears only when a draft
 * really is kept on this device. Keep editing has the focus, and Escape or a
 * tap outside means Keep editing. Sits above every page modal and sheet
 * (.k-overlay is 10000, the phone select sheet 10200). Buttons are 44px tall.
 */
import React, { useEffect, useRef } from 'react';
import { colors, font } from '@/lib/design-tokens';
import { goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import type { UnsavedGuardApi } from '@/lib/useUnsavedGuard';
import { leaveMessage } from '@/lib/autoGuard';

export default function UnsavedGuardModal({ guard }: { guard: UnsavedGuardApi }) {
  const open = guard.confirmOpen;
  const boxRef = useRef<HTMLDivElement | null>(null);
  const keepRef = useRef<HTMLButtonElement | null>(null);
  const stayRef = useRef(guard.stay);
  stayRef.current = guard.stay;

  // Focus Keep editing; Escape stays (and never reaches the form underneath);
  // Tab cycles inside; focus goes back where it was when the prompt closes.
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    keepRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        stayRef.current();
        return;
      }
      if (e.key !== 'Tab' || !boxRef.current) return;
      const btns = [...boxRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
      if (!btns.length) return;
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.shiftKey ? (i <= 0 ? btns.length - 1 : i - 1) : (i === btns.length - 1 ? 0 : i + 1);
      e.preventDefault();
      btns[next].focus();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (before && before.isConnected && typeof before.focus === 'function') before.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  const { hasDraft, canSave, saving } = guard;
  const keepDraft = !canSave && hasDraft;
  // The one yellow button: the way forward that keeps the work.
  const keepIsPrimary = !canSave && !keepDraft;
  const btn: React.CSSProperties = { minHeight: 44, padding: '10px 16px', fontSize: 14 };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10300, background: 'rgba(0,0,0,.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) guard.stay(); }}
      data-no-guard
    >
      <div
        ref={boxRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sag-leave-title"
        aria-describedby="sag-leave-body"
        style={{
          background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12,
          width: '100%', maxWidth: 440, boxShadow: '0 30px 80px rgba(0,0,0,.6)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 22px 6px' }}>
          <div className="k-dialog-title" id="sag-leave-title">Leave without saving?</div>
          <div id="sag-leave-body" style={{ fontSize: font.size.md, color: colors.textMuted, lineHeight: 1.55, marginTop: 6 }}>
            {leaveMessage(guard.formName, hasDraft)}
          </div>
        </div>
        <div style={{ padding: '16px 22px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            ref={keepRef}
            type="button"
            onClick={guard.stay}
            style={keepIsPrimary ? { ...goldButtonStyle, ...btn } : { ...ghostButtonStyle, ...btn }}
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={guard.discard}
            disabled={saving}
            style={{ ...ghostButtonStyle, ...btn, color: 'var(--danger)', borderColor: 'var(--border-default)', background: 'transparent' }}
          >
            Discard changes
          </button>
          {canSave ? (
            <button
              type="button"
              onClick={guard.saveAndLeave}
              disabled={saving}
              style={{ ...goldButtonStyle, ...btn, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Saving…' : 'Save and leave'}
            </button>
          ) : keepDraft ? (
            <button type="button" onClick={guard.keepDraftAndLeave} style={{ ...goldButtonStyle, ...btn }}>
              Leave and keep draft
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
