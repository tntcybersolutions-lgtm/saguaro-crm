'use client';
/**
 * async-dialog — styled, promise-based replacements for window.prompt /
 * window.confirm, so business editing uses a real form instead of a native
 * browser dialog (CLAUDE_MASTER_INSTRUCTIONS §6).
 *
 *   const name = await textPrompt({ title: 'Rename file', defaultValue });
 *   if (name === null) return;            // cancelled
 *   if (await confirmDialog({ title: 'Delete task?', danger: true })) { ... }
 *
 * Self-contained: mounts its own portal root on demand (no global provider to
 * wire into the shell), matches the neon-on-black token theme, and handles
 * ESC / backdrop / Enter + focus. Client-only; safe no-op during SSR.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

export interface TextPromptOptions {
  title: string;
  label?: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  multiline?: boolean;
  type?: 'text' | 'email' | 'tel' | 'number';
  required?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
}
export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

function mount(render: (close: () => void) => React.ReactNode): void {
  if (typeof document === 'undefined') return;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const close = () => { try { root.unmount(); } catch { /* already gone */ } host.remove(); };
  root.render(<>{render(close)}</>);
}

/** Resolves to the entered string, or null if the user cancelled. */
export function textPrompt(opts: TextPromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(null); return; }
    mount((close) => <TextModal opts={opts} done={(v) => { close(); resolve(v); }} />);
  });
}

/** Resolves true on confirm, false on cancel/dismiss. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(false); return; }
    mount((close) => <ConfirmModal opts={opts} done={(v) => { close(); resolve(v); }} />);
  });
}

/* ── shared chrome ──────────────────────────────────────────────────── */
const overlayS: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(2,4,8,0.72)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const panelS: React.CSSProperties = {
  width: 'min(460px, 94vw)', background: 'var(--bg-surface, #0E0F12)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16,
  boxShadow: '0 24px 60px rgba(0,0,0,0.45)', padding: '20px 20px 16px',
  color: '#FFFFFF',
};
const titleS: React.CSSProperties = { margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em' };
const msgS: React.CSSProperties = { margin: '8px 0 0', fontSize: 13, lineHeight: 1.5, color: '#A9B4C4' };
const labelS: React.CSSProperties = { display: 'block', margin: '14px 0 6px', fontSize: 12, fontWeight: 700, color: '#D7DEE8' };
const inputS: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
  background: 'var(--bg-surface-2, #15171C)', border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 8, color: '#FFFFFF', fontSize: 16, fontFamily: 'inherit',
};
const rowS: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 };
const btnBase: React.CSSProperties = { minHeight: 40, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' };
const btnGhost: React.CSSProperties = { ...btnBase, background: 'transparent', border: '1px solid rgba(255,255,255,0.16)', color: '#D7DEE8' };
const btnPrimary: React.CSSProperties = { ...btnBase, background: 'var(--brand-primary, #FFE600)', border: 'none', color: 'var(--on-brand, #1C1C1E)' };
const btnDanger: React.CSSProperties = { ...btnBase, background: '#FF4D5E', border: 'none', color: '#1a0406' };

function useDismiss(onCancel: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
}

function TextModal({ opts, done }: { opts: TextPromptOptions; done: (v: string | null) => void }) {
  const [val, setVal] = useState(opts.defaultValue ?? '');
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useDismiss(() => done(null));
  useEffect(() => { ref.current?.focus(); ref.current?.select?.(); }, []);
  const submit = () => {
    if (opts.required && !val.trim()) { ref.current?.focus(); return; }
    done(val);
  };
  const common = {
    ref, value: val,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setVal(e.target.value),
    placeholder: opts.placeholder, style: inputS,
  };
  return (
    <div style={overlayS} onMouseDown={(e) => { if (e.target === e.currentTarget) done(null); }}>
      <div style={panelS} role="dialog" aria-modal="true" aria-label={opts.title}>
        <h2 style={titleS}>{opts.title}</h2>
        {opts.message && <p style={msgS}>{opts.message}</p>}
        {opts.label && <label style={labelS}>{opts.label}</label>}
        {opts.multiline ? (
          <textarea {...common} rows={4} style={{ ...inputS, minHeight: 96, resize: 'vertical' }} />
        ) : (
          <input
            {...common}
            type={opts.type ?? 'text'}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          />
        )}
        <div style={rowS}>
          <button type="button" style={btnGhost} onClick={() => done(null)}>{opts.cancelLabel ?? 'Cancel'}</button>
          <button type="button" style={btnPrimary} onClick={submit}>{opts.submitLabel ?? 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ opts, done }: { opts: ConfirmOptions; done: (v: boolean) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useDismiss(() => done(false));
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div style={overlayS} onMouseDown={(e) => { if (e.target === e.currentTarget) done(false); }}>
      <div style={panelS} role="alertdialog" aria-modal="true" aria-label={opts.title}>
        <h2 style={titleS}>{opts.title}</h2>
        {opts.message && <p style={msgS}>{opts.message}</p>}
        <div style={rowS}>
          <button type="button" style={btnGhost} onClick={() => done(false)}>{opts.cancelLabel ?? 'Cancel'}</button>
          <button
            ref={ref} type="button"
            style={opts.danger ? btnDanger : btnPrimary}
            onClick={() => done(true)}
            onKeyDown={(e) => { if (e.key === 'Enter') done(true); }}
          >{opts.confirmLabel ?? 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}
