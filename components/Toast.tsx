'use client';
import { useState, useCallback, useEffect, createContext, useContext } from 'react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface ToastContextValue {
  showToast: (message: string, type?: Toast['type']) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onRemove(toast.id), 5000);
    return () => clearTimeout(t);
  }, [toast.id, onRemove]);

  const colors = {
    success: { bg: 'rgba(34,197,94,0.15)', border: '#22c55e', icon: '✅' },
    error:   { bg: 'rgba(239,68,68,0.15)',  border: '#ef4444', icon: '❌' },
    info:    { bg: 'rgba(59,130,246,0.15)', border: '#3b82f6', icon: 'ℹ️' },
    warning: { bg: 'rgba(212,160,23,0.15)', border: '#D4A017', icon: '⚠️' },
  };
  const c = colors[toast.type];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: '8px', padding: '12px 16px',
      color: '#e8edf8', fontSize: '14px', fontWeight: 500,
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      animation: 'toastIn 0.3s ease',
      minWidth: '280px', maxWidth: '400px',
    }}>
      <span>{c.icon}</span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button onClick={() => onRemove(toast.id)}
        style={{ background: 'none', border: 'none', color: '#8fa3c0', cursor: 'pointer', fontSize: '18px', padding: '0 4px', lineHeight: 1 }}>×</button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev.slice(-4), { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{
        position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 99999,
        alignItems: 'center',
      }}>
        {toasts.map(t => <ToastItem key={t.id} toast={t} onRemove={removeToast} />)}
      </div>
      <style>{`
        @keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </ToastContext.Provider>
  );
}
