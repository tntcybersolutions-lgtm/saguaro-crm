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
  type?: 'text' | 'email' | 'tel' | 'number' | 'date';
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

export interface ChoiceOptions {
  title: string;
  message?: string;
  options: { value: string; label: string }[];
  /** Adds a first choice that clears the field (resolves to ''). */
  noneLabel?: string;
  cancelLabel?: string;
}

/** Pick one of a list. Resolves to the chosen value, '' for the none choice, or null if cancelled. */
export function choicePrompt(opts: ChoiceOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(null); return; }
    mount((close) => <ChoiceModal opts={opts} done={(v) => { close(); resolve(v); }} />);
  });
}

export interface AlertOptions { title?: string; message: string; okLabel?: string; danger?: boolean }

/** Styled replacement for window.alert — a single-button notice. Resolves when dismissed. */
export function alertDialog(opts: AlertOptions): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(); return; }
    mount((close) => <AlertModal opts={opts} done={() => { close(); resolve(); }} />);
  });
}

/* ── shared chrome ──────────────────────────────────────────────────── */
/* Semantic theme tokens (app/globals.css); the fallbacks are the approved values. */
const overlayS: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 10200, // above everything — incl. the full-screen photo viewer (10050)
  background: 'rgba(16,23,34,0.72)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const panelS: React.CSSProperties = {
  width: 'min(460px, 94vw)', background: 'var(--surface-modal, #1B2636)',
  border: '1px solid var(--border-default, #334155)', borderRadius: 12,
  boxShadow: '0 24px 60px rgba(0,0,0,0.45)', padding: '20px 20px 16px',
  color: 'var(--text-primary, #F8FAFC)',
};
const titleS: React.CSSProperties = { margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em' };
const msgS: React.CSSProperties = { margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary, #CBD5E1)' };
const labelS: React.CSSProperties = { display: 'block', margin: '14px 0 6px', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary, #CBD5E1)' };
const inputS: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
  background: 'var(--bg-base, #101722)', border: '1px solid var(--border-default, #334155)',
  borderRadius: 10, color: 'var(--text-primary, #F8FAFC)', fontSize: 16, fontFamily: 'inherit',
};
const rowS: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 18 };
const btnBase: React.CSSProperties = { minHeight: 44, padding: '8px 18px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const btnGhost: React.CSSProperties = { ...btnBase, background: 'var(--action-secondary-bg, #243247)', border: '1px solid var(--action-secondary-border, #334155)', color: 'var(--action-secondary-fg, #F8FAFC)' };
const btnPrimary: React.CSSProperties = { ...btnBase, background: 'var(--action-primary-bg, #E8FF2A)', border: 'none', color: 'var(--action-primary-fg, #101722)' };
const btnDanger: React.CSSProperties = { ...btnBase, background: 'var(--action-danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--action-danger-fg, #F87171)' };

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

const choiceBtn: React.CSSProperties = {
  ...btnBase, width: '100%', textAlign: 'left', fontWeight: 600,
  background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-primary)',
};

function ChoiceModal({ opts, done }: { opts: ChoiceOptions; done: (v: string | null) => void }) {
  const [q, setQ] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useDismiss(() => done(null));
  const many = opts.options.length > 12;
  useEffect(() => { if (many) ref.current?.focus(); }, [many]);
  const needle = q.trim().toLowerCase();
  const list = needle ? opts.options.filter((o) => o.label.toLowerCase().includes(needle)) : opts.options;
  return (
    <div style={overlayS} onMouseDown={(e) => { if (e.target === e.currentTarget) done(null); }}>
      <div style={panelS} role="dialog" aria-modal="true" aria-label={opts.title}>
        <h2 style={titleS} className="k-dialog-title">{opts.title}</h2>
        {opts.message && <p style={msgS}>{opts.message}</p>}
        {many && <input ref={ref} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search the choices" style={{ ...inputS, marginTop: 14 }} />}
        <div role="listbox" aria-label={opts.title} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14, maxHeight: '50vh', overflowY: 'auto' }}>
          {opts.noneLabel && <button type="button" role="option" aria-selected={false} style={{ ...choiceBtn, color: 'var(--text-secondary)' }} onClick={() => done('')}>{opts.noneLabel}</button>}
          {list.map((o) => (
            <button key={o.value} type="button" role="option" aria-selected={false} style={choiceBtn} onClick={() => done(o.value)}>{o.label}</button>
          ))}
          {list.length === 0 && <p style={msgS}>Nothing matches.</p>}
        </div>
        <div style={rowS}>
          <button type="button" style={btnGhost} onClick={() => done(null)}>{opts.cancelLabel ?? 'Cancel'}</button>
        </div>
      </div>
    </div>
  );
}

function AlertModal({ opts, done }: { opts: AlertOptions; done: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useDismiss(done);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div style={overlayS} onMouseDown={(e) => { if (e.target === e.currentTarget) done(); }}>
      <div style={panelS} role="alertdialog" aria-modal="true" aria-label={opts.title ?? 'Notice'}>
        <h2 style={titleS}>{opts.title ?? 'Notice'}</h2>
        <p style={msgS}>{opts.message}</p>
        <div style={rowS}>
          <button
            ref={ref} type="button"
            style={opts.danger ? btnDanger : btnPrimary}
            onClick={done}
            onKeyDown={(e) => { if (e.key === 'Enter') done(); }}
          >{opts.okLabel ?? 'OK'}</button>
        </div>
      </div>
    </div>
  );
}
