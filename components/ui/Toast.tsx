'use client';
/**
 * Toast — App-wide notification system.
 * Success (green), Error (red), Warning (amber), Info (blue).
 * Auto-dismisses after 4 seconds. Stacks multiple toasts.
 */
import React, { useState, useCallback, useEffect, createContext, useContext } from 'react';
import { CheckCircle, Warning, Info, XCircle, X } from '@phosphor-icons/react';
import { colors, font, radius, shadow, z } from '../../lib/design-tokens';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toast: (type: ToastType, message: string, duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={20} weight="fill" />,
  error: <XCircle size={20} weight="fill" />,
  warning: <Warning size={20} weight="fill" />,
  info: <Info size={20} weight="fill" />,
};

const COLORS: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  success: { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534', icon: '#16A34A' },
  error: { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', icon: '#DC2626' },
  warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', icon: '#D97706' },
  info: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', icon: '#2563EB' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string, duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev, { id, type, message, duration }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const ctx: ToastContextType = {
    toast: addToast,
    success: (msg) => addToast('success', msg),
    error: (msg) => addToast('error', msg),
    warning: (msg) => addToast('warning', msg),
    info: (msg) => addToast('info', msg),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* Toast container */}
      <div style={{
        position: 'fixed', top: 16, right: 16, zIndex: z.toast,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none', maxWidth: 400,
      }}>
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const c = COLORS[toast.type];

  useEffect(() => {
    const timer = setTimeout(onRemove, toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [toast.duration, onRemove]);

  return (
    <div
      role="alert"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '12px 16px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: radius.xl,
        boxShadow: shadow.lg,
        color: c.text,
        fontSize: font.size.md,
        fontWeight: font.weight.medium,
        lineHeight: 1.4,
        pointerEvents: 'auto',
        animation: 'toastSlideIn .3s ease',
        maxWidth: 400,
      }}
    >
      <span style={{ color: c.icon, flexShrink: 0, marginTop: 1 }}>{ICONS[toast.type]}</span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={onRemove}
        style={{
          background: 'none', border: 'none', color: c.text, cursor: 'pointer',
          padding: 2, opacity: 0.6, flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
      <style>{`@keyframes toastSlideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }`}</style>
    </div>
  );
}
