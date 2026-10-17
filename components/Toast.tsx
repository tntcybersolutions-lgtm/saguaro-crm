'use client';
/**
 * Toasts. Inside the signed-in app every toast lands in the status box
 * (components/StatusCenter) so two notices never stack; public pages and
 * portals, which have no status box, get the slim notice drawn here.
 *
 *   showToast('RFI sent', 'success')
 *   showToast("Couldn't send the RFI", 'error', { actions: [{ label: 'Retry', run: send }] })
 *
 * A notice is one line on a solid surface with a status icon, read out to a
 * screen reader (polite; an error is assertive). With a button on it, it stays
 * long enough to reach it. It moves to the top of the screen while a dialog
 * is open so it never covers that dialog's buttons.
 */
import { useState, useCallback, useEffect, createContext, useContext } from 'react';
import { CheckCircle, WarningCircle, Info, X } from '@phosphor-icons/react';
import { hasStatusCenter, note, type StepAction } from '@/lib/ui/status';

type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  /** Buttons on the notice (Retry, Undo). Each runs once, then the notice closes. */
  actions?: StepAction[];
}

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  actions?: StepAction[];
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, opts?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const CSS = `
.sag-toasts { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(env(safe-area-inset-bottom, 0px) + 20px);
  z-index: 99999; display: flex; flex-direction: column; gap: 8px; align-items: stretch; width: min(420px, calc(100vw - 32px)); pointer-events: none; }
.sag-toasts[data-place="top"] { bottom: auto; top: calc(env(safe-area-inset-top, 0px) + 12px); }
.sag-toast { pointer-events: auto; display: flex; align-items: flex-start; gap: 10px; padding: 10px 6px 10px 14px; border-radius: 10px;
  background: var(--bg-solid-2, var(--bg-surface)); border: 1px solid var(--border-default); color: var(--text-primary);
  font-size: 14px; font-weight: 500; line-height: 1.4; box-shadow: 0 8px 22px -10px rgba(0,0,0,.7); }
.sag-toast-ic { flex: 0 0 auto; margin-top: 1px; }
.sag-toast[data-type="success"] .sag-toast-ic { color: var(--success); }
.sag-toast[data-type="error"] .sag-toast-ic { color: var(--danger); }
.sag-toast[data-type="warning"] .sag-toast-ic { color: var(--warning); }
.sag-toast[data-type="info"] .sag-toast-ic { color: var(--text-secondary); }
.sag-toast-body { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.sag-toast-acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.sag-toast-act { min-height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--border-default); background: transparent;
  color: var(--text-primary); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.sag-toast-x { flex: 0 0 auto; width: 36px; height: 36px; margin: -6px 0; display: grid; place-items: center; border: 0; border-radius: 8px;
  background: transparent; color: var(--text-tertiary); cursor: pointer; }
.sag-toast-x:hover, .sag-toast-act:hover { background: var(--bg-surface-2); color: var(--text-primary); }
@media (max-width: 767px) {
  .sag-toasts { left: 12px; right: 12px; width: auto; transform: none; bottom: calc(var(--sag-tabbar-h, 0px) + env(safe-area-inset-bottom, 0px) + 8px); }
  .sag-toast-x { width: 44px; height: 44px; margin: -10px -2px; }
  .sag-toast-act { min-height: 44px; }
}
@media (prefers-reduced-motion: no-preference) { .sag-toast { animation: sagToastIn .18s ease-out; } }
@keyframes sagToastIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
`;

const ICON = { success: CheckCircle, error: WarningCircle, warning: WarningCircle, info: Info } as const;

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  useEffect(() => {
    // An error waits to be read; a notice with a button waits to be reached.
    const ms = toast.type === 'error' ? 9000 : toast.actions?.length ? 10_000 : 5000;
    const t = setTimeout(() => onRemove(toast.id), ms);
    return () => clearTimeout(t);
  }, [toast.id, toast.type, toast.actions, onRemove]);

  const Icon = ICON[toast.type];
  return (
    <div className="sag-toast" data-type={toast.type} role={toast.type === 'error' ? 'alert' : 'status'}>
      <Icon className="sag-toast-ic" size={18} weight="fill" aria-hidden />
      <div className="sag-toast-body">
        {toast.message}
        {toast.actions?.length ? (
          <div className="sag-toast-acts">
            {toast.actions.map((a) => (
              <button key={a.label} type="button" className="sag-toast-act" onClick={() => { onRemove(toast.id); a.run(); }}>{a.label}</button>
            ))}
          </div>
        ) : null}
      </div>
      <button type="button" className="sag-toast-x" aria-label="Dismiss" onClick={() => onRemove(toast.id)}>
        <X size={16} weight="bold" aria-hidden />
      </button>
    </div>
  );
}

let seq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [place, setPlace] = useState<'bottom' | 'top'>('bottom');

  const showToast = useCallback((message: string, type: ToastType = 'info', opts?: ToastOptions) => {
    // Inside the app the status box is the one place results appear; a second
    // pop-up on top of it was the overlap people saw. Portals keep this toast.
    if (hasStatusCenter()) { note(message, type !== 'error', opts?.actions); return; }
    const id = `${Date.now()}-${++seq}`;
    setToasts(prev => [...prev.slice(-3), { id, message, type, actions: opts?.actions }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // A dialog keeps its buttons at the bottom — move up out of their way.
  useEffect(() => {
    if (!toasts.length) return;
    const check = () => setPlace(document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]') ? 'top' : 'bottom');
    check();
    const t = window.setInterval(check, 400);
    return () => window.clearInterval(t);
  }, [toasts.length]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sag-toasts" data-place={place} aria-live="polite" aria-relevant="additions">
        {toasts.map(t => <ToastItem key={t.id} toast={t} onRemove={removeToast} />)}
      </div>
    </ToastContext.Provider>
  );
}
